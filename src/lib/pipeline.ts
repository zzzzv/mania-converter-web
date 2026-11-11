import { strToU8 } from 'fflate';
import type { OszEntry } from './osz';
import { decodeText, unzipOsz, zipOsz } from './osz';
import { parseOsu, rewriteOsu } from './osu/text';
import { countNotes } from './osu/hitobjects';
import type { SettingValues } from './convert/types';
import { getConverter } from './convert/registry';
import {
  buildOsuEntryName,
  buildOszFileName,
  convertedCreator,
  convertedVersion,
  isConvertedChart,
  isPlaceholderChart,
  markerFor,
  mergedTags,
} from './naming';

export interface ChartOutcome {
  entry: string;
  version: string;
  keyCount: number;
  status: 'converted' | 'skipped';
  reason?: string;
  newVersion?: string;
  newKeyCount?: number;
  newEntry?: string;
}

export interface ConvertResult {
  data: Uint8Array;
  fileName: string;
  charts: ChartOutcome[];
  convertedCount: number;
}

export interface ConvertRequest {
  bytes: Uint8Array;
  fileName: string;
  converterId: string;
  values: SettingValues;
  /** 允许转换的源键数；空数组表示全部 */
  sourceKeys: number[];
  onStage?: (stage: string, ratio: number) => void;
}

export class NoConvertibleChartError extends Error {
  readonly charts: ChartOutcome[];

  constructor(message: string, charts: ChartOutcome[]) {
    super(message);
    this.name = 'NoConvertibleChartError';
    this.charts = charts;
  }
}

function uniqueEntryName(used: Set<string>, name: string): string {
  if (!used.has(name)) return name;

  const dot = name.lastIndexOf('.');
  const base = dot < 0 ? name : name.slice(0, dot);
  const ext = dot < 0 ? '' : name.slice(dot);

  let index = 2;
  for (;;) {
    const candidate = `${base} (${index})${ext}`;
    if (!used.has(candidate)) return candidate;
    index += 1;
  }
}

/**
 * 完整流水线：osz 字节 → 报告 + 新 osz 字节。
 * 原包内所有条目原样保留，只追加转谱后的 .osu。
 */
export async function convertOsz(request: ConvertRequest): Promise<ConvertResult> {
  const converter = getConverter(request.converterId);
  const targetKeys = Math.round(Number(request.values[converter.targetKeySetting] ?? 10));
  const marker = markerFor(converter.acronym, targetKeys);
  const sourceKeyFilter = new Set(request.sourceKeys);

  request.onStage?.('解压谱包', 0.08);
  const entries = await unzipOsz(request.bytes);

  const usedNames = new Set(entries.map((entry) => entry.name));
  const osuEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.osu'));

  if (osuEntries.length === 0) throw new Error('谱包里没有找到 .osu 文件');

  const charts: ChartOutcome[] = [];
  const added: OszEntry[] = [];
  let packageMeta: { artist: string; title: string; creator: string } | null = null;

  for (let index = 0; index < osuEntries.length; index += 1) {
    const entry = osuEntries[index];
    request.onStage?.(
      `转换难度 ${index + 1}/${osuEntries.length}`,
      0.15 + (0.65 * index) / osuEntries.length,
    );

    const parsed = parseOsu(decodeText(entry.data));
    const base: ChartOutcome = {
      entry: entry.name,
      version: parsed.version || entry.name,
      keyCount: parsed.keyCount,
      status: 'skipped',
    };

    if (parsed.mode !== 3) {
      charts.push({ ...base, reason: '非 mania 难度' });
      continue;
    }

    if (isConvertedChart(parsed.version, parsed.creator, parsed.tags)) {
      charts.push({ ...base, reason: '已是转谱难度' });
      continue;
    }

    if (sourceKeyFilter.size > 0 && !sourceKeyFilter.has(parsed.keyCount)) {
      charts.push({ ...base, reason: `未勾选 ${parsed.keyCount}K` });
      continue;
    }

    if (!converter.isApplicable({ keyCount: parsed.keyCount, hitObjects: parsed.hitObjects }, request.values)) {
      charts.push({ ...base, reason: `${parsed.keyCount}K 已达目标键数` });
      continue;
    }

    if (isPlaceholderChart(countNotes(parsed.hitObjects), parsed.spanMs)) {
      charts.push({ ...base, reason: '占位谱（note ≤ 20 且 ≥ 6 分钟）' });
      continue;
    }

    const converted = converter.convert(
      { keyCount: parsed.keyCount, hitObjects: parsed.hitObjects },
      request.values,
    );

    if (converted.hitObjects.length === 0) {
      charts.push({ ...base, reason: '转换后没有音符' });
      continue;
    }

    const newVersion = convertedVersion(parsed.version, marker);
    const newCreator = convertedCreator(parsed.creator, converter.acronym, targetKeys);
    const text = rewriteOsu(parsed, {
      circleSize: converted.keyCount,
      version: newVersion,
      creator: newCreator,
      tags: mergedTags(parsed.tags),
      hitObjects: converted.hitObjects,
    });

    const entryName = uniqueEntryName(
      usedNames,
      buildOsuEntryName(parsed.artist, parsed.title, parsed.creator, parsed.version, marker),
    );
    usedNames.add(entryName);

    added.push({ name: entryName, data: strToU8(text) });

    packageMeta = packageMeta ?? {
      artist: parsed.artist,
      title: parsed.title,
      creator: parsed.creator,
    };

    charts.push({
      ...base,
      status: 'converted',
      newVersion,
      newKeyCount: converted.keyCount,
      newEntry: entryName,
    });
  }

  const convertedCount = added.length;

  if (convertedCount === 0) {
    const detail = charts
      .filter((chart) => chart.status === 'skipped')
      .slice(0, 4)
      .map((chart) => `${chart.version || chart.entry}：${chart.reason}`)
      .join('；');

    throw new NoConvertibleChartError(
      detail ? `没有可转换的难度（${detail}）` : '没有可转换的难度',
      charts,
    );
  }

  request.onStage?.('打包 osz', 0.85);
  const meta = packageMeta as { artist: string; title: string; creator: string };
  const fileName = buildOszFileName(meta.artist, meta.title, meta.creator, marker);

  const packed = await zipOsz([...entries, ...added], new Set(added.map((entry) => entry.name)));
  request.onStage?.('完成', 1);

  return { data: packed, fileName, charts, convertedCount };
}

export type { OszEntry };
