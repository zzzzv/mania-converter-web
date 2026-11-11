import type { ManiaHitObject } from '../../osu/hitobjects';
import type { ConverterDef, ManiaChart, SettingValues } from '../types';
import { numSetting, strSetting } from '../types';
import type { NoteMatrix } from './matrix';
import { buildMatrix } from './matrix';
import type { RowDensity, SideRange } from './column-builder';
import { ColumnBuilder, LnGaps } from './column-builder';
import { roundHalfEven } from '../../round';

export const MAX_TARGET_KEYS = 10;
export const DEFAULT_TARGET_KEYS = 10;
const DEFAULT_MAX_JACK = 200;
const DEFAULT_MIN_GAP = 200 / 3;

type MiddleSide = 'both' | 'left' | 'right';

function resolveSide(columns: number, left: boolean, middleSide: MiddleSide): SideRange {
  const middle = Math.floor(columns / 2);

  if (columns % 2 === 0) {
    return left ? { start: 0, length: middle } : { start: middle, length: columns - middle };
  }

  if (left && middleSide === 'right') return { start: 0, length: middle };
  if (!left && middleSide === 'left') return { start: middle + 1, length: columns - middle - 1 };

  return left ? { start: 0, length: middle + 1 } : { start: middle, length: columns - middle };
}

/**
 * 把行的毫秒 key 还原成精确时间。直接使用取整后的时间会让和弦整体漂 &lt; 1ms，
 * 长条也会跟着差 1ms。
 */
function resolveRowTimes(
  objects: ManiaHitObject[],
  rowByTime: Map<number, number>,
  rows: number,
): number[] {
  const times = new Array<number>(rows).fill(0);
  const assigned = new Array<boolean>(rows).fill(false);

  for (const object of objects) {
    const row = rowByTime.get(roundHalfEven(object.startTime));
    if (row === undefined || assigned[row]) continue;
    times[row] = object.startTime;
    assigned[row] = true;
  }

  for (const object of objects) {
    if (object.endTime === null || object.endTime <= object.startTime) continue;
    const row = rowByTime.get(roundHalfEven(object.endTime));
    if (row === undefined || assigned[row]) continue;
    times[row] = object.endTime;
    assigned[row] = true;
  }

  return times;
}

function buildDensity(matrix: NoteMatrix, objects: ManiaHitObject[], side: SideRange): RowDensity {
  const note = new Int32Array(matrix.rows);
  const head = new Int32Array(matrix.rows);
  const probability = new Float64Array(matrix.rows);

  for (let row = 0; row < matrix.rows; row += 1) {
    for (let column = side.start; column < side.start + side.length; column += 1) {
      const cell = matrix.get(row, column);
      if (cell < 0) continue;

      if (objects[cell].endTime !== null) head[row] += 1;
      else note[row] += 1;
    }
  }

  for (let row = 0; row < matrix.rows; row += 1) {
    probability[row] = Math.min(1, (note[row] + head[row]) / side.length);
  }

  return { note, head, probability };
}

/**
 * 每个按下时间点到「同一轨道上一次按下」的最小间隔。
 * 该侧这一行没有按键时是正无穷（不受限制）。
 */
function buildJackMap(matrix: NoteMatrix, rowTimes: number[], side: SideRange): number[] {
  const jackMap = new Array<number>(matrix.rows).fill(Number.POSITIVE_INFINITY);
  const lastPress = new Array<number>(side.length).fill(Number.NEGATIVE_INFINITY);

  for (let row = 0; row < matrix.rows; row += 1) {
    for (let i = 0; i < side.length; i += 1) {
      if (matrix.get(row, side.start + i) < 0) continue;

      const gap = rowTimes[row] - lastPress[i];
      if (gap < jackMap[row]) jackMap[row] = gap;

      lastPress[i] = rowTimes[row];
    }
  }

  return jackMap;
}

function buildExtension(
  objects: ManiaHitObject[],
  currentColumns: number,
  leftColumns: number,
  rightColumns: number,
  extension: ManiaHitObject[],
  values: SettingValues,
): void {
  const { matrix, timeAxis } = buildMatrix(objects, currentColumns, true);
  if (matrix.rows === 0) return;

  const rowByTime = new Map<number, number>();
  timeAxis.forEach((time, index) => rowByTime.set(time, index));

  const rowTimes = resolveRowTimes(objects, rowByTime, matrix.rows);

  const middleSide = strSetting(values, 'middleSide', 'both') as MiddleSide;
  const left = resolveSide(currentColumns, true, middleSide);
  const right = resolveSide(currentColumns, false, middleSide);

  const lnGaps = LnGaps.resolve(objects);
  const builder = new ColumnBuilder(
    matrix,
    objects,
    rowTimes,
    extension,
    lnGaps,
    numSetting(values, 'maxJack', DEFAULT_MAX_JACK),
    numSetting(values, 'minGap', DEFAULT_MIN_GAP),
  );

  // 同一侧的多条外列共享同一份密度与 jack 间隔，但各自独立掷骰。
  const leftDensity = left.length > 0 ? buildDensity(matrix, objects, left) : null;
  const rightDensity = right.length > 0 ? buildDensity(matrix, objects, right) : null;

  const leftJack = left.length > 0 ? buildJackMap(matrix, rowTimes, left) : null;
  const rightJack = right.length > 0 ? buildJackMap(matrix, rowTimes, right) : null;

  if (leftDensity && leftJack) {
    for (let i = 0; i < leftColumns; i += 1) builder.appendColumn(i, left, leftDensity, leftJack);
  }

  if (rightDensity && rightJack) {
    for (let i = 0; i < rightColumns; i += 1) {
      builder.appendColumn(currentColumns + leftColumns + i, right, rightDensity, rightJack);
    }
  }
}

/** ManiaModExtendKeys 的移植：只加宽不缩窄，外列加在整体最外侧，原列整体右移。 */
export function extendKeys(chart: ManiaChart, values: SettingValues): ManiaChart {
  const targetColumns = Math.round(numSetting(values, 'targetKeys', DEFAULT_TARGET_KEYS));
  const currentColumns = chart.keyCount;
  const addedColumns = targetColumns - currentColumns;

  if (currentColumns <= 0 || addedColumns <= 0) return chart;

  // 增量是奇数时先给左侧，保证两侧只差一列。
  const leftColumns = Math.ceil(addedColumns / 2);
  const rightColumns = Math.floor(addedColumns / 2);

  const extension: ManiaHitObject[] = [];

  if (chart.hitObjects.length > 0) {
    buildExtension(chart.hitObjects, currentColumns, leftColumns, rightColumns, extension, values);
  }

  const shifted = chart.hitObjects.map((object) => ({
    ...object,
    column: object.column + leftColumns,
  }));

  const merged = [...shifted, ...extension];
  merged.sort((a, b) => a.startTime - b.startTime || a.column - b.column);

  return { keyCount: targetColumns, hitObjects: merged };
}

export const EXT_CONVERTER: ConverterDef = {
  id: 'ext',
  name: 'Extend Keys',
  acronym: 'EXT',
  description: '在谱面左右两侧各加入若干列，按原谱同侧的按键密度镜像音符，把谱面加宽。',
  targetKeySetting: 'targetKeys',
  defaults: {
    targetKeys: DEFAULT_TARGET_KEYS,
    middleSide: 'both',
    maxJack: DEFAULT_MAX_JACK,
    minGap: Number(DEFAULT_MIN_GAP.toFixed(2)),
  },
  settings: [
    {
      key: 'targetKeys',
      label: '目标键数',
      kind: 'number',
      min: 2,
      max: MAX_TARGET_KEYS,
      step: 1,
      hint: '原谱键数小于目标键数时才会加宽',
    },
    {
      key: 'middleSide',
      label: '中间列归属',
      kind: 'select',
      advanced: true,
      options: [
        { value: 'both', label: '两侧都算' },
        { value: 'left', label: '算左侧' },
        { value: 'right', label: '算右侧' },
      ],
      hint: '奇数键谱面统计半区密度时，中间列算到哪一侧',
    },
    {
      key: 'maxJack',
      label: '叠间隔上限',
      kind: 'number',
      min: 0,
      max: 500,
      step: 1,
      unit: 'ms',
      advanced: true,
      hint: '扩展列两次按下的最小间隔最多放宽到这个毫秒数',
    },
    {
      key: 'minGap',
      label: '缝下限',
      kind: 'number',
      min: 1,
      max: 500,
      step: 1,
      unit: 'ms',
      advanced: true,
      hint: 'LN 尾到下个按键的间距小于它时按它算，避免碎条',
    },
  ],
  isApplicable: (chart, values) =>
    Math.round(numSetting(values, 'targetKeys', DEFAULT_TARGET_KEYS)) > chart.keyCount,
  convert: extendKeys,
};
