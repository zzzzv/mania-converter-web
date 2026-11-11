import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Download, Loader2, Trash2, X } from 'lucide-react';
import type { TaskItem } from '../hooks/useTasks';
import type { ChartOutcome } from '../lib/pipeline';
import { cn } from '../lib/cn';

interface TaskListProps {
  tasks: TaskItem[];
  onSave: (task: TaskItem) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}

function stageLabel(task: TaskItem): string {
  if (task.stage === 'done') return task.kind === 'download' ? '已下载' : '已完成';
  if (task.stage === 'error') return '失败';
  if (task.stage === 'queued') return '排队中';
  if (task.stage === 'converting') return '转换中';
  return '下载中';
}

function ChartRow({ chart }: { chart: ChartOutcome }) {
  const converted = chart.status === 'converted';

  return (
    <li className="flex items-start gap-2 py-1.5">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          converted ? 'bg-[#E7F7F1] text-[#0E9F6E]' : 'bg-canvas text-ink-400',
        )}
      >
        {converted ? <Check size={10} strokeWidth={2.4} /> : <X size={10} strokeWidth={2.4} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-ink-900">
          <span className="tabular-nums text-ink-600">{chart.keyCount}K</span>
          <span className="mx-1 text-ink-300">·</span>
          {chart.version || chart.entry}
        </p>
        <p className="truncate text-[11px] text-ink-400">
          {converted ? (
            <>
              已生成 <span className="tabular-nums text-accent-600">{chart.newKeyCount}K</span>
              {chart.newVersion ? ` · ${chart.newVersion}` : ''}
            </>
          ) : (
            `跳过：${chart.reason}`
          )}
        </p>
      </div>
    </li>
  );
}

export function TaskList({ tasks, onSave, onRemove, onClearFinished }: TaskListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const finished = tasks.filter((task) => task.stage === 'done' || task.stage === 'error').length;

  if (tasks.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold">任务</h2>
        {finished > 0 ? (
          <button type="button" onClick={onClearFinished} className="btn-quiet h-7 px-2 text-[11px]">
            清空已完成
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-2.5">
        {tasks.map((task) => {
          const open = expanded[task.id] ?? task.stage === 'error';
          const convertedCharts = task.charts.filter((chart) => chart.status === 'converted');
          const percent = Math.round(Math.min(1, Math.max(0, task.ratio)) * 100);

          return (
            <article
              key={task.id}
              className={cn(
                'animate-rise rounded-2xl border bg-white p-3.5 shadow-card',
                task.stage === 'error' ? 'border-[#F6DADA]' : 'border-line',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[13px] font-semibold text-ink-900">{task.title}</h3>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        task.stage === 'done' && 'bg-[#E7F7F1] text-[#0E9F6E]',
                        task.stage === 'error' && 'bg-[#FDF4F4] text-[#B42318]',
                        task.stage === 'queued' && 'bg-canvas text-ink-500',
                        (task.stage === 'downloading' || task.stage === 'converting') &&
                          'bg-accent-50 text-accent-700',
                      )}
                    >
                      {task.stage === 'downloading' || task.stage === 'converting' ? (
                        <Loader2 size={9} className="animate-spin" strokeWidth={2.4} />
                      ) : null}
                      {stageLabel(task)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-400">{task.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(task.id)}
                  className="btn-quiet h-6 w-6 shrink-0 rounded-lg p-0"
                  aria-label="移除任务"
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </button>
              </div>

              <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300 ease-out',
                    task.stage === 'error' ? 'bg-[#DC2626]' : 'bg-accent-500',
                  )}
                  style={{ width: `${task.stage === 'error' ? 100 : percent}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-ink-400">
                  {task.message}
                  {task.stage === 'done' ? ` · ${task.fileName}` : ''}
                </p>
                {task.stage !== 'error' && task.stage !== 'done' ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{percent}%</span>
                ) : null}
              </div>

              {task.error ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#FDF4F4] px-2.5 py-2 text-[11px] leading-relaxed text-[#B42318]">
                  <AlertTriangle size={12} strokeWidth={1.8} className="mt-0.5 shrink-0" />
                  {task.error}
                </p>
              ) : null}

              {task.charts.length > 0 ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [task.id]: !open }))}
                    className="flex items-center gap-1 text-[11px] font-medium text-ink-600 transition hover:text-ink-900"
                  >
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      className={cn('transition-transform duration-200', open && 'rotate-180')}
                    />
                    {convertedCharts.length} / {task.charts.length} 个难度已转换
                  </button>
                  {open ? (
                    <ul className="mt-1 divide-y divide-line/70 border-t border-line/70">
                      {task.charts.map((chart) => (
                        <ChartRow key={`${chart.entry}-${chart.status}`} chart={chart} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {task.stage === 'done' && task.bytes ? (
                <button type="button" onClick={() => onSave(task)} className="btn-ghost mt-2.5 h-8 w-full text-[12px]">
                  <Download size={13} strokeWidth={1.8} />
                  再次保存 osz
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
