import { Download, Wand2 } from 'lucide-react';
import type { SayobotBeatmapDetail, SayobotSearchItem } from '../lib/sayobot';
import { approvedLabel } from '../lib/sayobot';
import { cn } from '../lib/cn';

interface SearchResultCardProps {
  item: SayobotSearchItem;
  detail: SayobotBeatmapDetail | null | undefined;
  matched: boolean;
  /** 这个谱面已经在队列里（排队 / 下载 / 转换中），不能再点 */
  queued?: boolean;
  onConvert: () => void;
  onDownload: () => void;
}

export function SearchResultCard({
  item,
  detail,
  matched,
  queued,
  onConvert,
  onDownload,
}: SearchResultCardProps) {
  const keys = detail ? [...new Set(detail.difficulties.map((diff) => diff.keys))].sort((a, b) => a - b) : [];
  const approved = approvedLabel(item.approved);

  return (
    <article
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-line bg-white p-3.5 transition duration-150',
        'hover:-translate-y-px hover:shadow-lift sm:flex-row sm:items-center',
        matched ? 'border-accent-100' : 'border-line',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-semibold leading-tight text-ink-900">{item.title}</h3>
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              item.approved === 1 || item.approved === 2
                ? 'bg-[#E7F7F1] text-[#0E9F6E]'
                : 'bg-canvas text-ink-400',
            )}
          >
            {approved}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-ink-600">
          {item.artist} <span className="text-ink-300">·</span> mapped by {item.creator}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {keys.length > 0 ? (
            keys.map((key) => (
              <span key={key} className={cn('chip tabular-nums', matched && 'chip-active')}>
                {key}K
              </span>
            ))
          ) : (
            <span className="chip text-ink-400">{detail === undefined ? '键数加载中' : '键数未知'}</span>
          )}
          {detail?.hasVideo ? <span className="chip">含视频</span> : null}
          {detail ? <span className="chip">{detail.difficulties.length} 难度</span> : null}
          {detail === null ? <span className="chip text-[#B42318]">详情不可用</span> : null}
          {queued ? <span className="chip chip-active">已在队列中</span> : null}
          {item.favouriteCount > 0 ? (
            <span className="text-[11px] tabular-nums text-ink-400">{item.favouriteCount} 收藏</span>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 sm:flex-col sm:gap-1.5 lg:flex-row">
        <button
          type="button"
          onClick={onConvert}
          disabled={queued}
          className="btn-primary flex-1 whitespace-nowrap px-3.5 sm:flex-none"
          title={queued ? '这个谱面已经在队列里了' : '下载后转谱'}
        >
          <Wand2 size={14} strokeWidth={1.8} />
          下载并转换
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={queued}
          className="btn-ghost flex-1 whitespace-nowrap px-3 sm:flex-none"
          title={queued ? '这个谱面已经在队列里了' : '只下载原始 osz，不做转换'}
        >
          <Download size={14} strokeWidth={1.8} />
          仅下载
        </button>
      </div>
    </article>
  );
}
