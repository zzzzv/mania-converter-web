/**
 * osu!mania 打击物件的原始文本表示。
 *
 * 设计目标：编辑 .osu 时不丢任何字段。每行形如
 *   `x,y,time,type,hitSound[,endTime:sets]`
 * 这里把 `hitSound` 之后的原始文本整段保存成 `tail`，
 * 于是自定义音效/音量/文件名这些细节都会被原样写回。
 */
export interface ManiaHitObject {
  /** 0 起的列号 */
  column: number;
  /** 起始时间，毫秒 */
  startTime: number;
  /** 长条结束时间；普通单点为 null */
  endTime: number | null;
  /** 原始 hitSound 字段（通常是 0/2/4/8 的位组合） */
  hitSound: string;
  /**
   * hitSound 字段之后、原样保留的文本。
   * - 单点：`,0:0:0:0:40:ball.wav`（可能为空串）
   * - 长条：`:0:0:0:0:`（endTime 之后的采样参数，可能为空串）
   */
  tail: string;
}

const HOLD_TYPE_BIT = 128;

/** 列号 → x 坐标。反解 `floor(x * keys / 512)`，取列中心保证取整稳定。 */
export function columnToX(column: number, keyCount: number): number {
  if (keyCount <= 0) return 0;
  const x = Math.floor(((column + 0.5) * 512) / keyCount);
  return Math.min(511, Math.max(0, x));
}

/** x 坐标 → 列号（与 osu! 的 legacy 解码一致）。 */
export function xToColumn(x: number, keyCount: number): number {
  if (keyCount <= 0) return 0;
  const column = Math.floor((x * keyCount) / 512);
  return Math.min(keyCount - 1, Math.max(0, column));
}

/** 解析一行 `[HitObjects]`；无法识别时返回 null。 */
export function parseHitObjectLine(line: string, keyCount: number): ManiaHitObject | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(',');
  if (parts.length < 5) return null;

  const x = Number(parts[0]);
  const startTime = Number(parts[2]);
  const type = Number(parts[3]);

  if (!Number.isFinite(x) || !Number.isFinite(startTime) || !Number.isFinite(type)) return null;

  const hitSound = parts[4];
  const rest = parts.slice(5).join(',');

  if ((type & HOLD_TYPE_BIT) !== 0) {
    const colon = rest.indexOf(':');
    const endRaw = colon < 0 ? rest : rest.slice(0, colon);
    const endTime = Number(endRaw);

    if (!Number.isFinite(endTime)) return null;

    return {
      column: xToColumn(x, keyCount),
      startTime,
      endTime,
      hitSound,
      tail: colon < 0 ? '' : rest.slice(colon),
    };
  }

  return {
    column: xToColumn(x, keyCount),
    startTime,
    endTime: null,
    hitSound,
    tail: rest ? `,${rest}` : '',
  };
}

/** 序列化一行 `[HitObjects]`。y 固定 192（mania 忽略 y）。 */
export function serializeHitObject(object: ManiaHitObject, keyCount: number): string {
  const x = columnToX(object.column, keyCount);
  const time = Math.round(object.startTime);

  if (object.endTime !== null) {
    const end = Math.max(time, Math.round(object.endTime));
    return `${x},192,${time},${HOLD_TYPE_BIT},${object.hitSound},${end}${object.tail}`;
  }

  return `${x},192,${time},1,${object.hitSound}${object.tail}`;
}

/** 按起始时间、列号排序（与游戏内 Beatmap 的排序一致）。 */
export function sortHitObjects(objects: ManiaHitObject[]): ManiaHitObject[] {
  return [...objects].sort((a, b) => a.startTime - b.startTime || a.column - b.column);
}

/** 统计 note 头数量（长条算 1 个）。 */
export function countNotes(objects: ManiaHitObject[]): number {
  return objects.length;
}

/** 谱面时间跨度（毫秒）：首个起始时间到最后一个物件结束时间。 */
export function timeSpan(objects: ManiaHitObject[]): number {
  if (objects.length === 0) return 0;

  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;

  for (const object of objects) {
    first = Math.min(first, object.startTime);
    last = Math.max(last, object.endTime ?? object.startTime);
  }

  return Math.max(0, last - first);
}
