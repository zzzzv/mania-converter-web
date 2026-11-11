import { useRef, useState } from 'react';
import type { SayobotBeatmapDetail, SayobotSearchItem, SearchScope } from '../lib/sayobot';
import { MANIA_MODE, SEARCH_SCOPES, fetchDetails, searchBeatmaps } from '../lib/sayobot';

/** 搜索接口每次取多少条（POST 已经只返回 mania，20 条足够凑一页）。 */
const SCAN_CHUNK = 20;

/** 一页展示多少条；攒够这么多符合筛选的结果就停下。 */
export const PAGE_SIZE = 10;

/** 单次搜索最多请求多少次；翻不完可以再点「继续搜索」。 */
const MAX_CHUNKS_PER_RUN = 15;

/** 翻页之间的额外间隔（真正的限速在 sayobot.ts 的全局节流里，这里只是留点余量）。 */
const CHUNK_INTERVAL_MS = 120;

/** 详情请求并发数，压低一点更稳。 */
const DETAIL_CONCURRENCY = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export interface SearchScanned {
  chunks: number;
  results: number;
}

/**
 * 关键词搜索。走 POST，服务端已经按 mania 过滤，但：
 * - 关键词里多个词必须落在**同一个字段**才算命中，跨字段（标题 + 谱师）会直接 0 结果；
 * - 只按标签命中的结果也会混进来。
 * 所以这里先在本地按「每个词都要出现」做 AND 过滤，整串搜不到时退回单词查询再筛。
 * 凑够一页可见结果 / 翻到末尾 / 达到次数上限才停。
 */
export function useSayobotSearch(sourceKeys: number[]) {
  const [keyword, setKeyword] = useState('');
  const [statusMask, setStatusMask] = useState('31');
  const [scope, setScope] = useState<SearchScope>(SEARCH_SCOPES.all);
  const [items, setItems] = useState<SayobotSearchItem[]>([]);
  const [details, setDetails] = useState<Record<number, SayobotBeatmapDetail | null>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<SearchScanned>({ chunks: 0, results: 0 });
  const [exhausted, setExhausted] = useState(false);
  const [searched, setSearched] = useState(false);

  const cursorRef = useRef(0);
  const seenRef = useRef<Set<number>>(new Set());
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  /** 服务端要求所有词落在**同一个字段**里，跨字段（标题 + 谱师）会直接 0 结果，所以要能退回单词查询 */
  const phraseModeRef = useRef<'phrase' | 'term'>('phrase');
  const singleTermRef = useRef('');

  const search = (reset: boolean) => {
    const query = keyword.trim();
    if (!query || runningRef.current) return;

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (reset) {
      cursorRef.current = 0;
      seenRef.current = new Set();
      phraseModeRef.current = 'phrase';
      singleTermRef.current = [...terms].sort((a, b) => b.length - a.length)[0] ?? query;
      setItems([]);
      setDetails({});
      setScanned({ chunks: 0, results: 0 });
      setExhausted(false);
    }

    runningRef.current = true;
    cancelledRef.current = false;
    setSearched(true);
    setLoading(true);
    setError(null);
    setProgress(null);

    const wanted = new Set(sourceKeys);
    const approvedMask = Number(statusMask);

    let cursor = cursorRef.current;
    let chunks = 0;
    let results = 0;
    let matched = 0;
    let reachedEnd = false;

    /** 空格分词后要求**每个词都出现**（且），匹配范围跟着「搜索范围」走 */
    const matchesTerms = (item: SayobotSearchItem, detail: SayobotBeatmapDetail | null): boolean => {
      if (terms.length <= 1) return true;

      const versions = detail ? detail.difficulties.map((diff) => diff.version) : [];
      const fields =
        scope === SEARCH_SCOPES.title
          ? [item.title]
          : scope === SEARCH_SCOPES.artist
            ? [item.artist]
            : scope === SEARCH_SCOPES.creator
              ? [item.creator]
              : scope === SEARCH_SCOPES.version
                ? versions
                : [item.title, item.artist, item.creator, ...versions];

      const haystack = fields.join(' ').toLowerCase();

      return terms.every((term) => haystack.includes(term));
    };

    const step = async () => {
      for (let index = 0; index < MAX_CHUNKS_PER_RUN; index += 1) {
        if (cancelledRef.current) return;

        if (index > 0) {
          setProgress(`已扫描 ${results} 个谱包，命中 ${matched} 个，继续往下翻…`);
        }

        const requestQuery = phraseModeRef.current === 'phrase' ? query : singleTermRef.current;

        const outcome = await searchBeatmaps(requestQuery, {
          limit: SCAN_CHUNK,
          offset: cursor,
          approvedMask,
          scope,
        }).then(
          (data) => ({ ok: true as const, data }),
          (reason: unknown) => ({ ok: false as const, reason }),
        );

        if (!outcome.ok) {
          console.error('[search] 搜索失败', outcome.reason);
          const message = outcome.reason instanceof Error ? outcome.reason.message : '搜索失败，请稍后再试';
          setError(index === 0 ? message : `扫到第 ${results} 个谱包时中断：${message}`);
          return;
        }

        const found = outcome.data;

        // 服务端要求所有词落在同一个字段，跨字段（标题 + 谱师）会直接 0 结果：
        // 这种情况退回单词查询，再在本地按「全部词都要出现」筛。
        if (found.length === 0 && cursor === 0 && phraseModeRef.current === 'phrase' && terms.length > 1) {
          phraseModeRef.current = 'term';
          setProgress(`整串没搜到，改用「${singleTermRef.current}」检索并本地筛选…`);
          continue;
        }

        chunks += 1;
        results += found.length;
        cursor += found.length;
        if (found.length < SCAN_CHUNK) reachedEnd = true;

        // modes 位掩码里 8 = mania，先过滤掉再请求详情，省掉大量无用请求
        const mania = found.filter((item) => (item.modes & MANIA_MODE) !== 0 && !seenRef.current.has(item.sid));

        if (mania.length > 0) {
          const loaded = await fetchDetails(
            mania.map((item) => item.sid),
            DETAIL_CONCURRENCY,
          );

          const fresh: SayobotSearchItem[] = [];
          const freshDetails: Record<number, SayobotBeatmapDetail | null> = {};

          mania.forEach((item, position) => {
            const detail = loaded[position];
            freshDetails[item.sid] = detail;
            seenRef.current.add(item.sid);

            if (!detail || detail.difficulties.length === 0) return;
            if (!matchesTerms(item, detail)) return;

            fresh.push(item);
            if (wanted.size === 0 || detail.difficulties.some((diff) => wanted.has(diff.keys))) matched += 1;
          });

          setDetails((prev) => ({ ...prev, ...freshDetails }));
          if (fresh.length > 0) setItems((prev) => [...prev, ...fresh]);
        }

        cursorRef.current = cursor;
        setScanned({ chunks, results });

        if (reachedEnd || matched >= PAGE_SIZE) break;
        if (cancelledRef.current) return;
        await sleep(CHUNK_INTERVAL_MS);
      }

      if (reachedEnd) setExhausted(true);
    };

    step()
      .catch((reason: unknown) => {
        console.error('[search] 搜索异常', reason);
        setError('搜索中断，请稍后重试');
      })
      .finally(() => {
        cursorRef.current = cursor;
        runningRef.current = false;
        setLoading(false);
        setProgress(null);
      });
  };

  const cancel = () => {
    cancelledRef.current = true;
  };

  return {
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
  };
}
