import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import type { SayobotSearchItem, SearchScope, VideoVariant } from '../lib/sayobot';
import { SEARCH_SCOPES, isLocalFilePage } from '../lib/sayobot';
import { PAGE_SIZE, useSayobotSearch } from '../hooks/useSayobotSearch';
import { Segmented } from './Segmented';
import { SourceNote } from './SourceNote';
import { SearchResultCard } from './SearchResultCard';

const STATUS_OPTIONS = [
  { value: '31', label: '全部状态' },
  { value: '1', label: 'Ranked' },
  { value: '5', label: 'Ranked + Loved' },
  { value: '8', label: 'Pending / WIP' },
];

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: SEARCH_SCOPES.all, label: '全部字段' },
  { value: SEARCH_SCOPES.title, label: '曲名' },
  { value: SEARCH_SCOPES.artist, label: '艺术家' },
  { value: SEARCH_SCOPES.creator, label: '谱师' },
  { value: SEARCH_SCOPES.version, label: '难度名' },
];

interface SearchPanelProps {
  variant: VideoVariant;
  onVariantChange: (variant: VideoVariant) => void;
  sourceKeys: number[];
  onClearKeyFilter: () => void;
  /** 已在队列中的谱面键（`sid:123`），这些卡片不能再点 */
  busyKeys: string[];
  onConvert: (item: SayobotSearchItem) => void;
  onDownload: (item: SayobotSearchItem) => void;
}

export function SearchPanel({
  variant,
  onVariantChange,
  sourceKeys,
  onClearKeyFilter,
  busyKeys,
  onConvert,
  onDownload,
}: SearchPanelProps) {
  const {
    keyword,
    setKeyword,
    statusMask,
    setStatusMask,
    scope,
    setScope,
    items,
    details,
    loading,
    progress,
    error,
    scanned,
    exhausted,
    searched,
    search,
    cancel,
  } = useSayobotSearch(sourceKeys);

  // 详情里没有 mania 难度的谱包直接不展示；勾了源键数时只留命中的
  const visible = items.filter((item) => {
    const detail = details[item.sid];
    if (!detail) return true;
    if (detail.difficulties.length === 0) return false;
    if (sourceKeys.length === 0) return true;
    return detail.difficulties.some((diff) => sourceKeys.includes(diff.keys));
  });

  const matchedCount = visible.filter((item) => {
    const detail = details[item.sid];
    return detail ? detail.difficulties.some((diff) => sourceKeys.includes(diff.keys)) : false;
  }).length;

  const keyLabel = sourceKeys.map((key) => `${key}K`).join(' / ');

  const [shown, setShown] = useState(PAGE_SIZE);
  const shownItems = visible.slice(0, shown);

  return (
    <div className="flex flex-col gap-3.5">
      {isLocalFilePage() ? (
        <div className="rounded-xl border border-[#F1E2C0] bg-[#FFFCF3] px-3 py-2.5 text-[11px] leading-relaxed text-[#8A5A00]">
          当前页面是从本地文件打开的（file://）。<span className="font-medium">iOS / Safari 会直接拦截跨域请求</span>
          ，搜索必然失败——把 mania-converter.html 放到任意 http(s) 地址下打开即可；本地转谱与「上传
          osz」不受影响。
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setShown(PAGE_SIZE);
          search(true);
        }}
        className="flex flex-col gap-2.5 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search
            size={15}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索曲名、艺术家、谱师或难度名"
            className="field h-10 pl-9"
            aria-label="搜索 Sayobot 谱面"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusMask}
            onChange={(event) => setStatusMask(event.target.value)}
            className="field h-10 min-w-0 flex-1 cursor-pointer pr-6 text-[12px] sm:w-auto sm:flex-none"
            aria-label="谱面状态"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={String(scope)}
            onChange={(event) => setScope(Number(event.target.value) as SearchScope)}
            className="field h-10 min-w-0 flex-1 cursor-pointer pr-6 text-[12px] sm:w-auto sm:flex-none"
            aria-label="搜索范围"
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !keyword.trim()}
            className="btn-primary h-10 shrink-0 whitespace-nowrap px-4"
          >
            {loading ? <Loader2 size={14} className="animate-spin" strokeWidth={1.8} /> : null}
            搜索
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="label-group">下载</span>
          <Segmented
            value={variant}
            ariaLabel="下载是否包含视频"
            onChange={onVariantChange}
            options={[
              { value: 'novideo', label: '不含视频' },
              { value: 'full', label: '含视频' },
            ]}
          />
        </div>
        <SourceNote compact className="sm:text-right" />
      </div>

      {error ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[#F6DADA] bg-[#FDF4F4] px-3 py-2.5 text-[12px] text-[#B42318]">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => search(true)}
            disabled={loading}
            className="btn-ghost h-7 w-fit px-2.5 text-[11px]"
          >
            重试
          </button>
        </div>
      ) : null}

      {searched && sourceKeys.length > 0 && !loading ? (
        <div className="flex items-center justify-between rounded-lg bg-accent-50 px-3 py-1.5 text-[11px] text-accent-700">
          <span>
            已按源键数筛选：{keyLabel}，命中 {matchedCount} 个谱包
          </span>
          <button type="button" onClick={onClearKeyFilter} className="font-medium underline underline-offset-2">
            清除
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-400">
            <Loader2 size={11} className="shrink-0 animate-spin" strokeWidth={2} />
            <span className="truncate">
              {progress ?? `已扫描 ${scanned.results} 个谱包，命中 ${matchedCount} 个…`}
            </span>
          </p>
          <button type="button" onClick={cancel} className="btn-quiet h-6 shrink-0 px-2 text-[11px]">
            停止
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="animate-pulse rounded-xl border border-line bg-white p-3.5">
              <div className="h-3.5 w-2/5 rounded bg-canvas" />
              <div className="mt-2 h-3 w-3/5 rounded bg-canvas" />
              <div className="mt-3 h-4 w-24 rounded-full bg-canvas" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && searched && visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-4 py-7 text-center">
          <p className="text-[13px] font-medium text-ink-700">
            {exhausted ? '已检索完全部结果，没有符合筛选的 mania 谱面' : '暂时还没翻到符合筛选的 mania 谱面'}
          </p>
          <p className="mx-auto mt-1 max-w-[38rem] text-[12px] leading-relaxed text-ink-400">
            已扫描 {scanned.results} 个谱包
            {sourceKeys.length > 0 ? `，其中含 mania 的谱包里没有 ${keyLabel} 难度` : ''}
            {exhausted ? '。换个关键词，或放宽源键数筛选后重试。' : '，可以继续往下翻。'}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {sourceKeys.length > 0 ? (
              <button type="button" onClick={onClearKeyFilter} className="btn-ghost h-8 px-3 text-[12px]">
                放宽键数筛选
              </button>
            ) : null}
            {!exhausted ? (
              <button type="button" onClick={() => search(false)} className="btn-primary h-8 px-3 text-[12px]">
                继续搜索
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!searched ? (
        <div className="rounded-xl border border-dashed border-line bg-white/70 px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-ink-700">输入关键词开始搜索</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            多个词用空格分隔表示「且」——全部都要命中，例如 <span className="text-ink-600">renatus soleily</span>
            。右侧可切换搜索字段：只想找某个谱师的图就选「谱师」，填他的用户名（如 _IceRain）。结果只保留含 mania
            难度的谱包，键数在卡片上标注。
          </p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="flex flex-col gap-2">
          {shownItems.map((item) => {
            const detail = details[item.sid];
            const matched =
              sourceKeys.length > 0 &&
              !!detail &&
              detail.difficulties.some((diff) => sourceKeys.includes(diff.keys));

            return (
              <SearchResultCard
                key={item.sid}
                item={item}
                detail={detail}
                matched={matched}
                queued={busyKeys.includes(`sid:${item.sid}`)}
                onConvert={() => onConvert(item)}
                onDownload={() => onDownload(item)}
              />
            );
          })}
        </div>
      ) : null}

      {visible.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((count) => count + PAGE_SIZE)}
          className="btn-ghost mx-auto h-9 px-5"
        >
          显示更多（还有 {visible.length - shown} 个）
        </button>
      ) : visible.length > 0 && !exhausted ? (
        <button type="button" onClick={() => search(false)} disabled={loading} className="btn-ghost mx-auto h-9 px-5">
          {loading ? <Loader2 size={14} className="animate-spin" strokeWidth={1.8} /> : null}
          继续搜索
        </button>
      ) : null}

      {visible.length > 0 && exhausted ? (
        <p className="text-center text-[11px] text-ink-400">已到结果末尾（共扫描 {scanned.results} 个谱包）</p>
      ) : null}
    </div>
  );
}
