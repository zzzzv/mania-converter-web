import { useCallback, useEffect, useRef, useState } from 'react';
import { FileArchive, Search, Github, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CONVERTERS, DEFAULT_CONVERTER_ID, defaultValuesFor, getConverter } from './lib/convert/registry';
import type { SettingValues } from './lib/convert/types';
import type { SayobotSearchItem, VideoVariant } from './lib/sayobot';
import { downloadOsz } from './lib/sayobot';
import { formatBytes } from './lib/osz';
import { useTasks } from './hooks/useTasks';
import { Segmented } from './ui/Segmented';
import { SearchPanel } from './ui/SearchPanel';
import { UploadPanel } from './ui/UploadPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { TaskList } from './ui/TaskList';
import { SourceNote } from './ui/SourceNote';
import { sanitizeFileName } from './lib/naming';

type InputMode = 'search' | 'upload';

interface ToastState {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export default function App() {
  const [mode, setMode] = useState<InputMode>('search');
  const [variant, setVariant] = useState<VideoVariant>('novideo');
  const [converterId, setConverterId] = useState(DEFAULT_CONVERTER_ID);
  const [values, setValues] = useState<SettingValues>(() => defaultValuesFor(getConverter(DEFAULT_CONVERTER_ID)));
  const [sourceKeys, setSourceKeys] = useState<number[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);

  const { tasks, start, save, remove, clearFinished, busyCount, activeCount, queuedCount, busyKeys } = useTasks();
  const converter = getConverter(converterId);
  const busy = busyCount > 0;

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ id: Date.now(), text, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleValueChange = (key: string, value: number | string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleConverterChange = (id: string) => {
    setConverterId(id);
    setValues(defaultValuesFor(getConverter(id)));
  };

  const handleReset = () => {
    setValues(defaultValuesFor(converter));
    setSourceKeys([]);
  };

  const request = { converterId, values, sourceKeys };

  /** 从 Sayobot 拉 osz，带实时速率 */
  const makeLoader = (item: SayobotSearchItem) => async (
    onProgress: (ratio: number, message: string) => void,
  ) => {
    let lastAt = Date.now();
    let lastLoaded = 0;
    let speed = 0;

    const result = await downloadOsz(item.sid, variant, (loaded, total) => {
      const now = Date.now();
      const elapsed = (now - lastAt) / 1000;

      if (elapsed >= 0.4) {
        speed = (loaded - lastLoaded) / elapsed;
        lastAt = now;
        lastLoaded = loaded;
      }

      const progressText = total > 0 ? `${formatBytes(loaded)} / ${formatBytes(total)}` : formatBytes(loaded);
      onProgress(
        total > 0 ? loaded / total : 0.5,
        `下载中 ${progressText}${speed > 0 ? ` · ${formatBytes(speed)}/s` : ''}`,
      );
    });

    return result.data;
  };

  const handleConvertItem = (item: SayobotSearchItem) => {
    const accepted = start({
      kind: 'convert',
      key: `sid:${item.sid}`,
      title: `${item.artist} - ${item.title}`,
      subtitle: `Sayobot #${item.sid} · ${variant === 'full' ? '含视频' : '不含视频'}`,
      load: makeLoader(item),
      request,
    });

    notify(accepted ? '已加入转谱队列' : '该谱面已在队列中', accepted ? 'info' : 'error');
  };

  const handleDownloadItem = (item: SayobotSearchItem) => {
    const accepted = start({
      kind: 'download',
      key: `sid:${item.sid}`,
      title: `${item.artist} - ${item.title}`,
      subtitle: `Sayobot #${item.sid} · 仅下载原始 osz`,
      downloadName: sanitizeFileName(`${item.artist} - ${item.title} (${item.creator}).osz`),
      load: makeLoader(item),
    });

    notify(accepted ? '已加入下载队列' : '该谱面已在队列中', accepted ? 'info' : 'error');
  };

  const handleFiles = (files: File[]) => {
    for (const file of files) {
      start({
        title: file.name,
        subtitle: `${formatBytes(file.size)} · 本地上传`,
        local: true,
        load: async (onProgress) => {
          onProgress(0.6, '读取文件');
          const buffer = await file.arrayBuffer();
          return new Uint8Array(buffer);
        },
        request,
      });
    }
    notify(`已加入 ${files.length} 个文件`);
  };

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-line/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-white shadow-[0_4px_12px_-4px_rgba(91,91,214,0.7)]">
              <FileArchive size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold leading-tight">Mania EXT 转谱器</h1>
              <p className="hidden truncate text-[11px] text-ink-400 sm:block">
                本地转换，文件不会上传
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-600">
            <span className="relative flex h-1.5 w-1.5">
              {busy ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-70" />
              ) : null}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${busy ? 'bg-accent-500' : 'bg-[#0E9F6E]'}`}
              />
            </span>
            <span className="tabular-nums">
              {busy
                ? `${activeCount} 个进行中${queuedCount > 0 ? ` · ${queuedCount} 个排队` : ''}`
                : '空闲'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-[4.5rem]">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <section className="card p-4 sm:p-5">
              <div className="mb-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Segmented
                  value={mode}
                  ariaLabel="输入方式"
                  onChange={setMode}
                  options={[
                    { value: 'search', label: '搜索下载' },
                    { value: 'upload', label: '上传 osz' },
                  ]}
                  className="w-full sm:w-56"
                />
                <p className="text-[11px] leading-relaxed text-ink-400 sm:text-right">
                  {mode === 'search' ? '从 Sayobot 检索 mania 谱面并直接转谱' : '把本地的 .osz 拖进来批量转谱'}
                </p>
              </div>

              {mode === 'search' ? (
                <SearchPanel
                  variant={variant}
                  onVariantChange={setVariant}
                  sourceKeys={sourceKeys}
                  onClearKeyFilter={() => setSourceKeys([])}
                  busyKeys={busyKeys}
                  onConvert={handleConvertItem}
                  onDownload={handleDownloadItem}
                />
              ) : (
                <UploadPanel onConvertFiles={handleFiles} />
              )}
            </section>

            <TaskList tasks={tasks} onSave={save} onRemove={remove} onClearFinished={clearFinished} />

            {tasks.length === 0 ? (
              <section className="card flex flex-col gap-3 p-5">
                <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Search size={14} strokeWidth={1.8} className="text-accent-600" />
                  转谱后会发生什么
                </h2>
                <ul className="grid gap-2 text-[12px] leading-relaxed text-ink-600 sm:grid-cols-2">
                  <li className="rounded-xl bg-canvas/70 px-3 py-2">
                    原 osz 里的音频、背景、视频、原难度全部保留，只追加新的 .osu
                  </li>
                  <li className="rounded-xl bg-canvas/70 px-3 py-2">
                    难度名与文件名追加 <span className="font-medium text-ink-900">[EXT 10k]</span>，creator 同时标注原作者与转谱
                  </li>
                  <li className="rounded-xl bg-canvas/70 px-3 py-2">
                    已是转谱的难度、非 mania 难度、占位谱都会自动跳过并在任务里说明
                  </li>
                  <li className="rounded-xl bg-canvas/70 px-3 py-2">
                    转换完成后自动下载，转换结果保留在任务卡片里可重复保存
                  </li>
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="lg:col-span-1 lg:sticky lg:top-[4.5rem]">
            <SettingsPanel
              converters={CONVERTERS}
              converter={converter}
              converterId={converterId}
              values={values}
              sourceKeys={sourceKeys}
              onConverterChange={handleConverterChange}
              onValueChange={handleValueChange}
              onSourceKeysChange={setSourceKeys}
              onReset={handleReset}
            />
          </aside>
        </div>

        <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-400">
          <SourceNote />
          <p>
            转换在浏览器内完成，不依赖服务器；算法移植自 Ez2Lazer 的 Extend Keys 社区 mod，结果带随机性。
          </p>
          <p className="flex items-center gap-1">
            <Github size={12} strokeWidth={1.8} />
            单文件发布版本，可直接离线打开使用
          </p>
        </footer>
      </main>

      {toast ? (
        <div
          key={toast.id}
          className={`fixed inset-x-4 bottom-5 z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] shadow-lift animate-rise ${
            toast.tone === 'error' ? 'bg-[#B42318] text-white' : 'bg-ink-900 text-white'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle size={13} strokeWidth={2} />
          ) : (
            <CheckCircle2 size={13} strokeWidth={2} />
          )}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
