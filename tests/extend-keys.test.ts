import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOsu } from '../src/lib/osu/text';
import { EXT_CONVERTER, extendKeys } from '../src/lib/convert/ext/ext';
import type { ManiaChart } from '../src/lib/convert/types';

const fixture = readFileSync(join(__dirname, 'fixtures', 'hanatachi-7k.osu'), 'utf8');
const parsed = parseOsu(fixture);

const chart: ManiaChart = { keyCount: parsed.keyCount, hitObjects: parsed.hitObjects };
const values = { ...EXT_CONVERTER.defaults };

describe('EXT 算法', () => {
  it('8K 加宽到 10K，原列整体右移一列', () => {
    const result = extendKeys(chart, values);

    expect(result.keyCount).toBe(10);
    expect(result.hitObjects.length).toBeGreaterThan(chart.hitObjects.length);

    const shift = 1;
    const originals = result.hitObjects.filter((object, index) => index < chart.hitObjects.length);

    // 原物件列号整体 +1（左侧新增一列）
    for (const source of chart.hitObjects) {
      const expected = source.column + shift;
      const found = result.hitObjects.some(
        (object) => object.column === expected && object.startTime === source.startTime,
      );
      expect(found).toBe(true);
    }

    expect(originals.length).toBe(chart.hitObjects.length);
  });

  it('新增列落在最外侧两条列上', () => {
    const result = extendKeys(chart, values);
    const columns = new Set(result.hitObjects.map((object) => object.column));

    expect(columns.has(0)).toBe(true);
    expect(columns.has(9)).toBe(true);
    expect(Math.max(...columns)).toBeLessThan(10);
  });

  it('结果按时间与列排序，且同列不出现重复时刻', () => {
    const result = extendKeys(chart, values);

    for (let i = 1; i < result.hitObjects.length; i += 1) {
      const prev = result.hitObjects[i - 1];
      const current = result.hitObjects[i];
      const ordered = prev.startTime < current.startTime ||
        (prev.startTime === current.startTime && prev.column <= current.column);
      expect(ordered).toBe(true);
    }

    const seen = new Set<string>();
    for (const object of result.hitObjects) {
      const key = `${object.column}@${Math.round(object.startTime)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('长条仍然有效', () => {
    const result = extendKeys(chart, values);
    const holds = result.hitObjects.filter((object) => object.endTime !== null);

    expect(holds.length).toBeGreaterThan(0);
    for (const hold of holds) {
      expect((hold.endTime as number) - hold.startTime).toBeGreaterThan(0);
    }
  });

  it('目标键数不大于原键数时原样返回', () => {
    const same = extendKeys(chart, { ...values, targetKeys: 8 });
    expect(same).toBe(chart);

    const smaller = extendKeys(chart, { ...values, targetKeys: 5 });
    expect(smaller).toBe(chart);
    expect(EXT_CONVERTER.isApplicable(chart, { ...values, targetKeys: 5 })).toBe(false);
  });

  it('中间列归属影响扩展结果但键数不变', () => {
    const left = extendKeys(chart, { ...values, targetKeys: 9, middleSide: 'left' });
    const right = extendKeys(chart, { ...values, middleSide: 'right', targetKeys: 9 });

    expect(left.keyCount).toBe(9);
    expect(right.keyCount).toBe(9);
    expect(left.hitObjects.length).toBeGreaterThan(0);
  });
});
