import type { ManiaHitObject } from '../../osu/hitobjects';
import { roundHalfEven } from '../../round';

/** 空单元 */
export const EMPTY = -1;
/** 长条中段 */
export const HOLD_BODY = -7;

/** 行 × 列 的对象索引矩阵（移植自 C# NoteMatrix）。 */
export class NoteMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Int32Array;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.data = new Int32Array(rows * cols).fill(EMPTY);
  }

  get(row: number, col: number): number {
    return this.data[row * this.cols + col];
  }

  set(row: number, col: number, value: number): void {
    this.data[row * this.cols + col] = value;
  }
}

export interface MatrixBuild {
  matrix: NoteMatrix;
  /** 每一行对应的时间（毫秒，四舍五入后的 key） */
  timeAxis: number[];
}

function clampColumn(column: number, cols: number): number {
  return Math.min(Math.max(column, 0), cols - 1);
}

/**
 * 移植自 KrrN2NcConverter.buildMatrix：行 = 所有起始时间的去重升序；
 * expandHoldBody 时把长条尾时刻也并入时间轴，并把长条身位填成 HOLD_BODY。
 */
export function buildMatrix(
  objects: ManiaHitObject[],
  cols: number,
  expandHoldBody: boolean,
): MatrixBuild {
  if (cols <= 0) return { matrix: new NoteMatrix(0, 0), timeAxis: [] };

  const seen = new Set<number>();
  const timeAxis: number[] = [];

  for (const object of objects) {
    const key = roundHalfEven(object.startTime);
    if (seen.has(key)) continue;
    seen.add(key);
    timeAxis.push(key);
  }

  timeAxis.sort((a, b) => a - b);

  const matrix = new NoteMatrix(timeAxis.length, cols);
  const rowByTime = new Map<number, number>();
  timeAxis.forEach((time, index) => rowByTime.set(time, index));

  objects.forEach((object, index) => {
    const row = rowByTime.get(roundHalfEven(object.startTime));
    if (row === undefined) return;
    matrix.set(row, clampColumn(object.column, cols), index);
  });

  if (!expandHoldBody) return { matrix, timeAxis };

  const allTimes = new Set<number>(timeAxis);

  for (const object of objects) {
    const end = object.endTime ?? object.startTime;
    allTimes.add(roundHalfEven(end));
  }

  const newAxis = [...allTimes].sort((a, b) => a - b);
  const newMatrix = new NoteMatrix(newAxis.length, cols);
  const newRowByTime = new Map<number, number>();
  newAxis.forEach((time, index) => newRowByTime.set(time, index));

  for (const time of timeAxis) {
    const source = rowByTime.get(time) as number;
    const target = newRowByTime.get(time) as number;

    for (let col = 0; col < cols; col += 1) newMatrix.set(target, col, matrix.get(source, col));
  }

  for (const object of objects) {
    if (object.endTime === null || object.endTime <= object.startTime) continue;

    const startRow = newRowByTime.get(roundHalfEven(object.startTime));
    const endRow = newRowByTime.get(roundHalfEven(object.endTime));
    if (startRow === undefined || endRow === undefined) continue;

    const col = clampColumn(object.column, cols);

    for (let row = startRow + 1; row <= endRow; row += 1) {
      if (newMatrix.get(row, col) === EMPTY) newMatrix.set(row, col, HOLD_BODY);
    }
  }

  return { matrix: newMatrix, timeAxis: newAxis };
}
