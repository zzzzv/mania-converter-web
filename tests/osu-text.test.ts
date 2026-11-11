import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOsu, rewriteOsu } from '../src/lib/osu/text';
import { serializeHitObject } from '../src/lib/osu/hitobjects';

const fixture = readFileSync(join(__dirname, 'fixtures', 'hanatachi-7k.osu'), 'utf8');

function sectionLines(text: string, name: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  if (start < 0) return [];

  const out: string[] = [];

  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[i])) break;
    out.push(lines[i]);
  }

  return out;
}

describe('osu 文本解析', () => {
  it('读出模式、键数与物件', () => {
    const parsed = parseOsu(fixture);

    expect(parsed.mode).toBe(3);
    expect(parsed.keyCount).toBe(8);
    expect(parsed.hitObjects.length).toBeGreaterThan(100);
    expect(parsed.creator).toBe('_Rokii');
    expect(parsed.spanMs).toBeGreaterThan(60000);
  });

  it('保留式改写不动 Events / TimingPoints / Colours', () => {
    const parsed = parseOsu(fixture);
    const output = rewriteOsu(parsed, {
      circleSize: parsed.keyCount,
      version: parsed.version,
      creator: parsed.creator,
      tags: parsed.tags,
      hitObjects: parsed.hitObjects,
    });

    for (const name of ['Events', 'TimingPoints', 'Colours']) {
      expect(sectionLines(output, name)).toEqual(sectionLines(fixture, name));
    }

    const reparsed = parseOsu(output);
    expect(reparsed.keyCount).toBe(parsed.keyCount);
    expect(reparsed.hitObjects.length).toBe(parsed.hitObjects.length);

    const byTimeThenColumn = (objects: typeof parsed.hitObjects) =>
      [...objects]
        .sort((a, b) => a.startTime - b.startTime || a.column - b.column)
        .map((object) => `${object.column}@${object.startTime}-${object.endTime ?? ''}`);

    expect(byTimeThenColumn(reparsed.hitObjects)).toEqual(byTimeThenColumn(parsed.hitObjects));
  });

  it('改写后清空 BeatmapID 并写入新元数据', () => {
    const parsed = parseOsu(fixture);
    const output = rewriteOsu(parsed, {
      circleSize: 10,
      version: 'Here I wish, let there be light [EXT 10k]',
      creator: '_Rokii (EXT 10k)',
      tags: 'converted',
      hitObjects: parsed.hitObjects,
    });

    expect(output).toContain('BeatmapID:-1');
    expect(output).toContain('BeatmapSetID:-1');
    expect(output).toContain('CircleSize:10');
    expect(output).toContain('Version:Here I wish, let there be light [EXT 10k]');
    expect(output).toContain('Creator:_Rokii (EXT 10k)');
    expect(output).toContain('Tags:converted');
  });

  it('自定义音效后缀在往返后保持不变', () => {
    const parsed = parseOsu(fixture);
    const withSample = parsed.hitObjects.find((object) => object.tail.includes(':'));

    expect(withSample).toBeDefined();
    const line = serializeHitObject(withSample!, parsed.keyCount);
    const reparsed = parseOsu(
      `${fixture.split('[HitObjects]')[0]}[HitObjects]\n${line}\n`,
    );

    expect(reparsed.hitObjects).toHaveLength(1);
    expect(reparsed.hitObjects[0].tail).toBe(withSample!.tail);
    expect(reparsed.hitObjects[0].hitSound).toBe(withSample!.hitSound);
  });
});
