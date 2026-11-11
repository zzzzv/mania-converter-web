/** 转谱标记与命名规则：所有对"这是不是转谱"的判断都收敛到这里。 */

export const TAG_MARKER = 'mania-ext-converter';

/** 占位谱判定：note 极少且时间跨度极长。 */
export const PLACEHOLDER_MAX_NOTES = 20;
export const PLACEHOLDER_MIN_SPAN_MS = 6 * 60 * 1000;

export function isPlaceholderChart(noteCount: number, spanMs: number): boolean {
  return noteCount <= PLACEHOLDER_MAX_NOTES && spanMs >= PLACEHOLDER_MIN_SPAN_MS;
}

/** 难度名/文件名里追加的标记，例如 `[EXT 10k]`。 */
export function markerFor(acronym: string, keyCount: number): string {
  return `[${acronym} ${keyCount}k]`;
}

/** creator 里的转谱署名，例如 `(EXT 10k)`。 */
export function creatorMarkFor(acronym: string, keyCount: number): string {
  return `(${acronym} ${keyCount}k)`;
}

export function convertedVersion(version: string, marker: string): string {
  const base = version.trim();
  return base ? `${base} ${marker}` : marker;
}

export function convertedCreator(creator: string, acronym: string, keyCount: number): string {
  const mark = creatorMarkFor(acronym, keyCount);
  const base = creator.trim();
  return base ? `${base} ${mark}` : mark;
}

export function mergedTags(tags: string): string {
  const parts = tags.split(/\s+/).filter(Boolean);
  if (!parts.some((part) => part.toLowerCase() === TAG_MARKER)) parts.push(TAG_MARKER);
  return parts.join(' ');
}

const CONVERTED_MARK_RE = /[\[(]\s*ext\b[^\])]*?\d+\s*k\s*[\])]/i;

/** 已转谱判定：难度名、creator、tag 任一命中即认为不能再转。 */
export function isConvertedChart(version: string, creator: string, tags: string): boolean {
  if (CONVERTED_MARK_RE.test(version)) return true;
  if (CONVERTED_MARK_RE.test(creator)) return true;
  return tags.toLowerCase().includes(TAG_MARKER);
}

const ILLEGAL_FILENAME_RE = /[\\/:*?"<>|\u0000-\u001f]/g;

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(ILLEGAL_FILENAME_RE, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'untitled';
}

export function keyLabel(keyCount: number): string {
  return `${keyCount}K`;
}

/** 转换后 osz 的下载文件名。 */
export function buildOszFileName(
  artist: string,
  title: string,
  creator: string,
  marker: string,
): string {
  const core = [artist, title].map((part) => part.trim()).filter(Boolean).join(' - ');
  const by = creator.trim();
  const base = by ? `${core} (${by})` : core;
  return sanitizeFileName(`${base} ${marker}.osz`);
}

/** 转换后 osz 内新增 .osu 的文件名。 */
export function buildOsuEntryName(
  artist: string,
  title: string,
  creator: string,
  originalVersion: string,
  marker: string,
): string {
  const core = [artist, title].map((part) => part.trim()).filter(Boolean).join(' - ');
  const by = creator.trim();
  const version = originalVersion.trim();
  const parts = [core];
  if (by) parts.push(`(${by})`);
  if (version) parts.push(`[${version}]`);
  parts.push(marker);
  return sanitizeFileName(`${parts.join(' ')}.osu`);
}
