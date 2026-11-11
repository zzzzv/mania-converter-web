import { useCallback, useRef, useState } from 'react';
import type { ChartOutcome, ConvertRequest } from '../lib/pipeline';
import { convertOsz, NoConvertibleChartError } from '../lib/pipeline';
import { downloadBytes, formatBytes } from '../lib/osz';

/** queued = 已入队等待前一个任务结束 */
export type TaskStage = 'queued' | 'downloading' | 'converting' | 'done' | 'error';

/** convert = 下载后转谱；download = 只把原始 osz 存下来 */
export type TaskKind = 'convert' | 'download';

export interface TaskItem {
  id: string;
  /** 去重键（比如 `sid:123`）；同一个键在未完成前不会重复入队 */
  key: string | null;
  kind: TaskKind;
  title: string;
  subtitle: string;
  stage: TaskStage;
  ratio: number;
  message: string;
  charts: ChartOutcome[];
  fileName: string | null;
  bytes: Uint8Array | null;
  error: string | null;
  saved: boolean;
}

export interface StartOptions {
  title: string;
  subtitle: string;
  key?: string;
  kind?: TaskKind;
  /** 仅下载时保存的文件名 */
  downloadName?: string;
  /** 把谱包字节取回来（上传路径直接读文件，下载路径走 Sayobot） */
  load: (onProgress: (ratio: number, message: string) => void) => Promise<Uint8Array>;
  /** kind === 'convert' 时必填 */
  request?: Omit<ConvertRequest, 'bytes' | 'fileName' | 'onStage'>;
  /**
   * 本地文件不占 Sayobot 带宽，走独立通道立刻执行，不用排在下载任务后面。
   * 本地任务之间仍然串行，避免同时跑多份转换把主线程卡死。
   */
  local?: boolean;
}

let sequence = 0;

/** 任务之间留一点间隔，避免前一个刚下完就立刻打下一个请求 */
const GAP_BETWEEN_TASKS = 320;

export function useTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const tasksRef = useRef<TaskItem[]>([]);

  // 两条独立通道：下载任务受 Sayobot 带宽限制要串行；本地文件任务不受影响，立刻开跑
  const remoteQueueRef = useRef<Array<() => Promise<void>>>([]);
  const remoteRunningRef = useRef(false);
  const localQueueRef = useRef<Array<() => Promise<void>>>([]);
  const localRunningRef = useRef(false);

  const commit = useCallback((updater: (prev: TaskItem[]) => TaskItem[]) => {
    setTasks((prev) => {
      const next = updater(prev);
      tasksRef.current = next;
      return next;
    });
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<TaskItem>) => {
      commit((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
    },
    [commit],
  );

  /** 各自串行：下载通道受带宽限制，本地通道只受 CPU 限制 */
  const pump = useCallback((local: boolean) => {
    const queue = local ? localQueueRef.current : remoteQueueRef.current;
    const running = local ? localRunningRef : remoteRunningRef;

    if (running.current) return;
    running.current = true;

    void (async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) break;

        await job().catch((error: unknown) => console.error('[task] 未捕获错误', error));

        // 只有下载任务之间需要留间隔，本地任务没必要等
        if (!local) await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_TASKS));
      }

      running.current = false;
    })();
  }, []);

  const start = useCallback(
    (options: StartOptions) => {
      const key = options.key ?? null;
      const duplicated =
        key !== null &&
        tasksRef.current.some(
          (task) => task.key === key && task.stage !== 'done' && task.stage !== 'error',
        );

      if (duplicated) return false;

      sequence += 1;
      const id = `task-${Date.now()}-${sequence}`;
      const kind: TaskKind = options.kind ?? 'convert';

      commit((prev) => [
        ...prev,
        {
          id,
          key,
          kind,
          title: options.title,
          subtitle: options.subtitle,
          stage: 'queued',
          ratio: 0,
          message: '排队中',
          charts: [],
          fileName: null,
          bytes: null,
          error: null,
          saved: false,
        },
      ]);

      const job = async () => {
        const fail = (error: unknown) => {
          const charts = error instanceof NoConvertibleChartError ? error.charts : [];
          update(id, {
            stage: 'error',
            ratio: 0,
            message: kind === 'download' ? '下载失败' : '转换失败',
            charts,
            error: error instanceof Error ? error.message : '未知错误',
          });
          if (!(error instanceof NoConvertibleChartError)) console.error('[task] 任务失败', error);
        };

        update(id, {
          stage: 'downloading',
          ratio: 0.05,
          message: options.local ? '读取文件' : kind === 'download' ? '下载 osz' : '下载谱包',
        });

        const bytes = await options.load((ratio, message) => {
          update(id, { ratio: 0.05 + Math.min(1, ratio) * 0.35, message });
        });

        if (kind === 'download') {
          const fileName = options.downloadName ?? options.title;
          downloadBytes(bytes, fileName);
          update(id, {
            stage: 'done',
            ratio: 1,
            message: `已下载 ${formatBytes(bytes.byteLength)}`,
            fileName,
            bytes,
            saved: true,
          });
          return;
        }

        if (!options.request) throw new Error('缺少转换参数');

        update(id, { stage: 'converting', ratio: 0.4, message: '解压谱包' });

        const result = await convertOsz({
          ...options.request,
          bytes,
          fileName: options.title,
          onStage: (stage, ratio) => update(id, { ratio: 0.4 + ratio * 0.6, message: stage }),
        });

        update(id, {
          stage: 'done',
          ratio: 1,
          message: `已生成 ${result.convertedCount} 张转谱难度`,
          charts: result.charts,
          fileName: result.fileName,
          bytes: result.data,
        });

        downloadBytes(result.data, result.fileName);
        update(id, { saved: true });
      };

      const local = Boolean(options.local);
      (local ? localQueueRef.current : remoteQueueRef.current).push(job);
      pump(local);

      return true;
    },
    [commit, pump, update],
  );

  const save = useCallback((task: TaskItem) => {
    if (!task.bytes || !task.fileName) return;
    downloadBytes(task.bytes, task.fileName);
  }, []);

  const remove = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((task) => task.id !== id));
    },
    [commit],
  );

  const clearFinished = useCallback(() => {
    commit((prev) => prev.filter((task) => task.stage !== 'done' && task.stage !== 'error'));
  }, [commit]);

  const activeCount = tasks.filter(
    (task) => task.stage === 'downloading' || task.stage === 'converting',
  ).length;
  const queuedCount = tasks.filter((task) => task.stage === 'queued').length;
  const busyCount = activeCount + queuedCount;

  /** 尚未完成的任务键，用来禁用同一谱面的重复点击 */
  const busyKeys = tasks
    .filter((task) => task.key && task.stage !== 'done' && task.stage !== 'error')
    .map((task) => task.key as string);

  return { tasks, start, save, remove, clearFinished, busyCount, activeCount, queuedCount, busyKeys };
}
