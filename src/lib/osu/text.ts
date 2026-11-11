import {
  ManiaHitObject,
  parseHitObjectLine,
  serializeHitObject,
  sortHitObjects,
  timeSpan,
} from './hitobjects';

export const MANIA_MODE = 3;

export interface OsuSection {
  name: string;
  /** section 标题所在行 */
  headerIndex: number;
  /** body 起始行（headerIndex + 1） */
  bodyStart: number;
  /** body 结束行（不含），即下一个 section 标题行 */
  bodyEnd: number;
}

export interface ParsedOsu {
  formatVersion: number;
  eol: string;
  lines: string[];
  sections: OsuSection[];
  general: Map<string, string>;
  metadata: Map<string, string>;
  difficulty: Map<string, string>;
  mode: number;
  keyCount: number;
  title: string;
  artist: string;
  creator: string;
  version: string;
  tags: string;
  audioFile: string;
  hitObjects: ManiaHitObject[];
  spanMs: number;
}

const HEADER_RE = /^\s*\[([^\]]+)\]\s*$/;

function readKeyValues(lines: string[], section: OsuSection | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!section) return map;

  for (let i = section.bodyStart; i < section.bodyEnd; i += 1) {
    const line = lines[i];
    const colon = line.indexOf(':');
    if (colon < 0) continue;

    const key = line.slice(0, colon).trim();
    if (!key) continue;

    if (!map.has(key)) map.set(key, line.slice(colon + 1).trim());
  }

  return map;
}

export function parseOsu(text: string): ParsedOsu {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  const sections: OsuSection[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = HEADER_RE.exec(lines[i]);
    if (!match) continue;

    if (sections.length > 0) sections[sections.length - 1].bodyEnd = i;
    sections.push({ name: match[1].trim(), headerIndex: i, bodyStart: i + 1, bodyEnd: lines.length });
  }

  const find = (name: string) => sections.find((section) => section.name.toLowerCase() === name.toLowerCase());

  const header = lines[0] ?? '';
  const versionMatch = /osu file format v(\d+)/i.exec(header);
  const formatVersion = versionMatch ? Number(versionMatch[1]) : 14;

  const general = readKeyValues(lines, find('General'));
  const metadata = readKeyValues(lines, find('Metadata'));
  const difficulty = readKeyValues(lines, find('Difficulty'));

  const mode = Number(general.get('Mode') ?? 0) || 0;
  const circleSize = Number(difficulty.get('CircleSize') ?? 4);
  const keyCount = Math.max(1, Math.round(Number.isFinite(circleSize) ? circleSize : 4));

  const objectsSection = find('HitObjects');
  const hitObjects: ManiaHitObject[] = [];

  if (mode === MANIA_MODE && objectsSection) {
    for (let i = objectsSection.bodyStart; i < objectsSection.bodyEnd; i += 1) {
      const object = parseHitObjectLine(lines[i], keyCount);
      if (object) hitObjects.push(object);
    }
  }

  return {
    formatVersion,
    eol,
    lines,
    sections,
    general,
    metadata,
    difficulty,
    mode,
    keyCount,
    title: metadata.get('Title') ?? '',
    artist: metadata.get('Artist') ?? '',
    creator: metadata.get('Creator') ?? '',
    version: metadata.get('Version') ?? '',
    tags: metadata.get('Tags') ?? '',
    audioFile: general.get('AudioFilename') ?? '',
    hitObjects,
    spanMs: timeSpan(hitObjects),
  };
}

export interface RewriteOptions {
  circleSize: number;
  version: string;
  creator: string;
  tags: string;
  hitObjects: ManiaHitObject[];
}

function formatKeyValue(key: string, value: string): string {
  return `${key}: ${value}`;
}

/**
 * 保留式改写：只替换 [Metadata] 的 Version/Creator/Tags/BeatmapID/BeatmapSetID、
 * [Difficulty] 的 CircleSize 和整个 [HitObjects] 区块，其余行（Events/TimingPoints/
 * Colours/Editor 等）逐字节保留。
 */
export function rewriteOsu(parsed: ParsedOsu, options: RewriteOptions): string {
  const replacements: Record<string, Map<string, string>> = {
    Metadata: new Map([
      ['Version', options.version],
      ['Creator', options.creator],
      ['Tags', options.tags],
      ['BeatmapID', '-1'],
      ['BeatmapSetID', '-1'],
    ]),
    Difficulty: new Map([['CircleSize', String(options.circleSize)]]),
  };

  const objects = sortHitObjects(options.hitObjects).map((object) =>
    serializeHitObject(object, options.circleSize),
  );

  const out: string[] = [];
  let current: string | null = null;
  let pending = new Map<string, string>();
  let sawObjectsSection = false;

  const flushPending = () => {
    for (const [key, value] of pending) out.push(formatKeyValue(key, value));
    pending = new Map<string, string>();
  };

  for (const line of parsed.lines) {
    const header = HEADER_RE.exec(line);

    if (header) {
      flushPending();
      current = header[1].trim();
      out.push(line);

      const sectionMap = current ? replacements[current] : undefined;
      if (sectionMap) pending = new Map(sectionMap);

      if (current.toLowerCase() === 'hitobjects') {
        sawObjectsSection = true;
        out.push(...objects);
      }

      continue;
    }

    if (current && current.toLowerCase() === 'hitobjects') continue;

    const colon = line.indexOf(':');
    if (current && colon > 0) {
      const key = line.slice(0, colon).trim();
      if (pending.has(key)) {
        // 保留原有的 `Key:value` / `Key: value` 写法，只换值
        out.push(`${line.slice(0, colon + 1)}${pending.get(key) as string}`);
        pending.delete(key);
        continue;
      }
    }

    out.push(line);
  }

  flushPending();

  if (!sawObjectsSection) {
    if (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push('[HitObjects]', ...objects);
  }

  // 去掉尾部多余空行，保留一个换行结尾
  while (out.length > 0 && out[out.length - 1] === '') out.pop();

  return `${out.join(parsed.eol)}${parsed.eol}`;
}
