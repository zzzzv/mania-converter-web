/**
 * Sayobot 公共 API 客户端。
 * 谱面元数据与 osz 均由 Sayobot 提供（https://osu.sayobot.cn/），本项目与 Sayobot 无隶属关系。
 */

export const SAYOBOT_HOME = 'https://osu.sayobot.cn/';
export const SAYOBOT_API = 'https://api.sayobot.cn';
export const SAYOBOT_DL = 'https://dl.sayobot.cn';

const API_TIMEOUT = 15000;

export const MANIA_MODE = 8;

export type VideoVariant = 'novideo' | 'full';

export interface SayobotSearchItem {
  sid: number;
  title: string;
  artist: string;
  creator: string;
  approved: number;
  modes: number;
  playCount: number;
  favouriteCount: number;
  lastUpdate: number;
}

export interface SayobotDifficulty {
  bid: number;
  version: string;
  keys: number;
  length: number;
  bpm: number;
}

export interface SayobotBeatmapDetail {
  sid: number;
  title: string;
  artist: string;
  creator: string;
  hasVideo: boolean;
  difficulties: SayobotDifficulty[];
}

/** 昵称搜索字段位掩码：1=标题 2=艺术家 4=谱师 8=难度名 16=标签 32=来源 */
export const SEARCH_SCOPES = {
  all: 0,
  title: 1,
  artist: 2,
  creator: 4,
  version: 8,
} as const;

export type SearchScope = (typeof SEARCH_SCOPES)[keyof typeof SEARCH_SCOPES];

export interface SearchOptions {
  limit?: number;
  offset?: number;
  /** 谱面状态位掩码：1=Ranked/Approved 2=Qualified 4=Loved 8=Pending/WIP 16=Graveyard */
  approvedMask?: number;
  /** 限定搜索字段（0 = 全部字段） */
  scope?: SearchScope;
}

interface RawSearchItem {
  sid: number;
  title: string;
  artist: string;
  creator: string;
  approved?: number;
  modes?: number;
  play_count?: number;
  favourite_count?: number;
  lastupdate?: number;
}

interface RawBidData {
  bid: number;
  mode: number;
  version: string;
  CS?: number;
  length?: number;
  bpm?: number;
}

function withTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** 页面是不是直接从本地文件打开的（file://） */
export function isLocalFilePage(): boolean {
  return typeof window !== 'undefined' && window.location?.protocol === 'file:';
}

/**
 * Sayobot 的后端挂掉时，nginx 会直接返回 502/504 错误页，而这个错误页**没有 CORS 头**，
 * 浏览器只能把它报成「blocked by CORS policy」。所以这里统一做退避重试，
 * 并把最终的失败信息写成人类可读的原因，而不是把 Failed to fetch 抛给用户。
 */
export const SAYOBOT_UNREACHABLE =
  '连接不上 Sayobot 接口（浏览器里会显示为 CORS 错误）。通常是它的后端返回 502/504 或触发了限流，请稍后重试，或改用「上传 osz」入口。';

/** file:// 下 Safari / iOS 会直接拦掉跨域请求，这时要给的是完全不同的建议 */
const SAYOBOT_FILE_PROTOCOL =
  '当前页面是从本地文件打开的（file://），iOS / Safari 会直接拦截跨域请求，搜索必然失败。把 mania-converter.html 放到任意 http(s) 地址下打开即可搜索；本地转谱和「上传 osz」不受影响。';

function unreachableMessage(reason: unknown): string {
  if (isLocalFilePage()) return SAYOBOT_FILE_PROTOCOL;

  // Safari 失败时给的是 "Load failed"，Chrome 是 "Failed to fetch"，带出来方便判断
  const detail = reason instanceof Error && reason.message ? `（${reason.message}）` : '';

  return `${SAYOBOT_UNREACHABLE}${detail}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 全局请求节流：所有发往 Sayobot 的请求共用一条时间轴，
 * 保证每秒最多约 3 个请求，避免翻页 + 详情把 IP 打到限流甚至被封。
 */
const MIN_REQUEST_INTERVAL = 320;
let nextSlotAt = 0;

async function acquireSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + MIN_REQUEST_INTERVAL;

  if (slot > now) await sleep(slot - now);
}

async function requestJson<T>(url: string, retries: number, init?: RequestInit): Promise<T> {
  let lastStatus: number | null = null;
  let lastReason: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(800 * attempt * attempt);
    await acquireSlot();

    const outcome = await withTimeout(url, API_TIMEOUT, init).then(
      (response) => ({ kind: 'response' as const, response }),
      (reason: unknown) => ({ kind: 'network' as const, reason }),
    );

    if (outcome.kind === 'network') {
      // 跨域失败（含 502 错误页缺 CORS 头）在这里，只能重试
      lastReason = outcome.reason;
      continue;
    }

    lastStatus = outcome.response.status;

    if (outcome.response.ok) {
      const parsed = await outcome.response.json().then(
        (value) => ({ ok: true as const, value: value as T }),
        (reason: unknown) => ({ ok: false as const, reason }),
      );

      if (parsed.ok) return parsed.value;
    }
  }

  if (lastStatus !== null && lastStatus !== 200) {
    throw new Error(`Sayobot 接口返回 HTTP ${lastStatus}，服务暂时不可用，请稍后重试。`);
  }

  throw new Error(unreachableMessage(lastReason));
}

/**
 * 关键字搜索。走 **POST `/?post`**，而不是 GET `beatmaplist`。
 *
 * 两者的差别是实测出来的关键点：
 * - GET 会忽略 `mode` / `subType`，返回所有模式混在一起的结果，而且关键词匹配不到时
 *   会把全站热图当结果返回（搜 `zzzqqq123` 也能出来一堆图），没法用来按谱师精确找图；
 * - POST 遵守 `mode`（只要 mania）、`subType`（限定标题/艺术家/谱师/难度名）与 `class`，
 *   没有匹配时返回 `{"status":-1}`（视为空列表）。
 *
 * POST 不接受排序参数，顺序固定为服务端相关度（近似 sid 新→旧）。
 */
export async function searchBeatmaps(
  keyword: string,
  options: SearchOptions = {},
): Promise<SayobotSearchItem[]> {
  const body = {
    cmd: 'beatmaplist',
    type: 'search',
    keyword: keyword.trim(),
    mode: MANIA_MODE,
    limit: options.limit ?? 25,
    offset: options.offset ?? 0,
    class: options.approvedMask ?? 31,
    ...(options.scope ? { subType: options.scope } : {}),
  };

  const payload = await requestJson<{ data?: RawSearchItem[]; status?: number }>(
    `${SAYOBOT_API}/?post`,
    2,
    {
      method: 'POST',
      // 必须用 text/plain：服务端照样按 JSON 解析，但它是 CORS 安全列表内的类型，不会触发预检；
      // 换成 application/json 会发预检，而它的响应没有 Access-Control-Allow-Headers，浏览器直接拒绝。
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    },
  );

  // status:-1 表示「没有匹配结果」，不是错误
  const items = payload.data ?? [];

  return items.map((item) => ({
    sid: item.sid,
    title: item.title ?? '',
    artist: item.artist ?? '',
    creator: item.creator ?? '',
    approved: item.approved ?? 0,
    modes: item.modes ?? 0,
    playCount: item.play_count ?? 0,
    favouriteCount: item.favourite_count ?? 0,
    lastUpdate: item.lastupdate ?? 0,
  }));
}

const detailCache = new Map<number, Promise<SayobotBeatmapDetail>>();

/** 谱面详情（含每个难度的键数与是否含视频）。一次只能查一个 sid。 */
export function fetchBeatmapDetail(sid: number): Promise<SayobotBeatmapDetail> {
  const cached = detailCache.get(sid);
  if (cached) return cached;

  const task = (async () => {
    const payload = await requestJson<{
      status?: number;
      data?: {
        sid: number;
        title: string;
        artist: string;
        creator: string;
        video?: number;
        bid_data?: RawBidData[];
      };
    }>(`${SAYOBOT_API}/v2/beatmapinfo?0=${sid}`, 1);

    if (!payload.data) throw new Error('Sayobot 未返回该谱面信息');

    const bids = payload.data.bid_data ?? [];

    return {
      sid: payload.data.sid ?? sid,
      title: payload.data.title ?? '',
      artist: payload.data.artist ?? '',
      creator: payload.data.creator ?? '',
      hasVideo: (payload.data.video ?? 0) > 0,
      difficulties: bids
        .filter((bid) => bid.mode === 3)
        .map((bid) => ({
          bid: bid.bid,
          version: bid.version ?? '',
          keys: Math.round(bid.CS ?? 4),
          length: bid.length ?? 0,
          bpm: bid.bpm ?? 0,
        })),
    } satisfies SayobotBeatmapDetail;
  })();

  detailCache.set(sid, task);
  task.catch(() => detailCache.delete(sid));

  return task;
}

/** 批量取详情，限制并发，失败项返回 null。 */
export async function fetchDetails(
  sids: number[],
  concurrency = 6,
): Promise<(SayobotBeatmapDetail | null)[]> {
  const results = new Array<SayobotBeatmapDetail | null>(sids.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, sids.length) }, async () => {
    while (cursor < sids.length) {
      const index = cursor;
      cursor += 1;

      const detail = await fetchBeatmapDetail(sids[index]).catch((error: unknown) => {
        console.warn('[sayobot] 详情获取失败', sids[index], error);
        return null;
      });

      results[index] = detail;
    }
  });

  await Promise.all(workers);
  return results;
}

export function downloadUrl(sid: number, variant: VideoVariant): string {
  return `${SAYOBOT_DL}/beatmaps/download/${variant}/${sid}`;
}

export interface DownloadResult {
  data: Uint8Array;
  fileNameHint: string;
}

/**
 * Sayobot 的 CDN 对客户端做了整体限速：单连接约 200 KB/s，实测开 6 路 Range 并发，
 * 聚合吞吐仍是 ~190 KB/s（换了多张图、多个节点都一样），说明瓶颈是服务端按来源限流，
 * 客户端无论怎么并发都提不上去。所以这里就保持单连接 + 失败重试。
 */
async function downloadSingle(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Sayobot 下载失败（HTTP ${response.status}），该谱面可能已被删除`);

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, buffer.byteLength);
    return new Uint8Array(buffer);
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }

  const data = new Uint8Array(loaded);
  let offset = 0;

  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return data;
}

/** 下载 osz，带进度回调；失败重试一次。 */
export async function downloadOsz(
  sid: number,
  variant: VideoVariant,
  onProgress?: (loaded: number, total: number) => void,
): Promise<DownloadResult> {
  const url = downloadUrl(sid, variant);

  const data = await downloadSingle(url, onProgress).catch(async (error: unknown) => {
    console.warn('[sayobot] 下载失败，重试一次', error);
    await sleep(800);
    return downloadSingle(url, onProgress);
  });

  return { data, fileNameHint: '' };
}

const APPROVED_LABELS: Record<number, string> = {
  [-2]: 'Graveyard',
  [-1]: 'WIP',
  0: 'Pending',
  1: 'Ranked',
  2: 'Approved',
  3: 'Qualified',
  4: 'Loved',
};

export function approvedLabel(approved: number): string {
  return APPROVED_LABELS[approved] ?? 'Unknown';
}
