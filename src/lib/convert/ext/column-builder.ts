import type { ManiaHitObject } from '../../osu/hitobjects';
import type { NoteMatrix } from './matrix';
import { roundHalfEven } from '../../round';

export interface SideRange {
  start: number;
  length: number;
}

export interface RowDensity {
  note: Int32Array;
  head: Int32Array;
  probability: Float64Array;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * 复用源对象的音效。单点的 tail 以 `,` 开头、长条的以 `:` 开头（后接采样参数），
 * 因此这里统一取出"参数部分"再按目标类型重新加前缀。
 */
function copySamples(
  origin: ManiaHitObject | null,
  isHold: boolean,
): { hitSound: string; tail: string } {
  if (!origin) return { hitSound: '0', tail: '' };

  const params = origin.tail.slice(1);
  return { hitSound: origin.hitSound, tail: params ? (isHold ? `:${params}` : `,${params}`) : '' };
}

/**
 * 源谱的缝分布：每条 LN 的尾到同列下一个按键的间距。
 * 20% 分位当作最小缝；80% 分位离它足够近则认为整张谱的缝很匀（反键图）。
 */
export class LnGaps {
  readonly min: number;
  readonly median: number;
  readonly uniform: boolean;

  private constructor(min: number, median: number, uniform: boolean) {
    this.min = min;
    this.median = median;
    this.uniform = uniform;
  }

  static readonly EMPTY = new LnGaps(0, 0, false);

  static resolve(objects: ManiaHitObject[]): LnGaps {
    if (objects.length === 0) return LnGaps.EMPTY;

    let columns = 0;
    for (const object of objects) columns = Math.max(columns, object.column + 1);

    const startTimes: number[][] = Array.from({ length: columns }, () => []);
    const tailTimes: number[][] = Array.from({ length: columns }, () => []);

    for (const object of objects) {
      startTimes[object.column].push(object.startTime);
      if (object.endTime !== null && object.endTime > object.startTime) {
        tailTimes[object.column].push(object.endTime);
      }
    }

    const gaps: number[] = [];

    for (let column = 0; column < columns; column += 1) {
      const starts = startTimes[column].sort((a, b) => a - b);
      const tails = tailTimes[column].sort((a, b) => a - b);

      if (tails.length === 0) continue;

      let index = 0;

      for (const tail of tails) {
        while (index < starts.length && starts[index] < tail) index += 1;
        if (index === starts.length) break;
        gaps.push(starts[index] - tail);
      }
    }

    if (gaps.length === 0) return LnGaps.EMPTY;

    gaps.sort((a, b) => a - b);

    const min = percentile(gaps, 0.2);
    const max = percentile(gaps, 0.8);

    return new LnGaps(min, percentile(gaps, 0.5), max - min <= Math.max(16, min * 0.25));
  }
}

function percentile(sorted: number[], quantile: number): number {
  return sorted[roundHalfEven((sorted.length - 1) * quantile)];
}

function firstAtLeast(values: number[], threshold: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < threshold) low = mid + 1;
    else high = mid;
  }

  return low;
}

/**
 * 单条外列的生成器：逐行判定 → 同侧叠规则筛选 → 类型与长条状态机。
 * 移植自 ManiaModExtendKeys.ColumnBuilder。
 */
export class ColumnBuilder {
  private readonly matrix: NoteMatrix;
  private readonly objects: ManiaHitObject[];
  private readonly rowTimes: number[];
  private readonly extension: ManiaHitObject[];
  private readonly lnGaps: LnGaps;
  private readonly maxJackInterval: number;
  private readonly minGap: number;
  private readonly tailTimes: number[][];

  private candidates: number[] = [];
  private tailCandidates: number[] = [];

  constructor(
    matrix: NoteMatrix,
    objects: ManiaHitObject[],
    rowTimes: number[],
    extension: ManiaHitObject[],
    lnGaps: LnGaps,
    maxJackInterval: number,
    minGap: number,
  ) {
    this.matrix = matrix;
    this.objects = objects;
    this.rowTimes = rowTimes;
    this.extension = extension;
    this.lnGaps = lnGaps;
    this.maxJackInterval = maxJackInterval;
    this.minGap = minGap;

    this.tailTimes = Array.from({ length: matrix.cols }, () => []);

    for (const object of objects) {
      if (object.endTime !== null && object.endTime > object.startTime && object.column < this.tailTimes.length) {
        this.tailTimes[object.column].push(object.endTime);
      }
    }

    for (const times of this.tailTimes) times.sort((a, b) => a - b);
  }

  appendColumn(targetColumn: number, side: SideRange, density: RowDensity, jackMap: number[]): void {
    const selected = this.selectRows(density, jackMap);
    const nextSelected = this.buildNextSelected(selected);

    // 上一条扩展长条的收尾时刻：这之前的行都被它盖住，不再落键。
    let openEnd = Number.NEGATIVE_INFINITY;

    for (let row = 0; row < this.matrix.rows; row += 1) {
      const rowTime = this.rowTimes[row];

      if (rowTime < openEnd) continue;
      if (!selected[row]) continue;

      const noteCount = density.note[row];
      const headCount = density.head[row];

      if (headCount > 0 && this.shouldStartHold(noteCount, headCount)) {
        const hold = this.tryCreateHold(targetColumn, side, row, rowTime, nextSelected[row]);

        if (hold) {
          this.extension.push(hold.object);
          openEnd = hold.closeTime;
          continue;
        }
      }

      this.extension.push(this.createNote(targetColumn, side, row, rowTime));
    }
  }

  /** 记录每行之后的第一个被选中行，长条收尾要以它为界。 */
  private buildNextSelected(selected: boolean[]): number[] {
    const next = new Array<number>(this.matrix.rows).fill(-1);
    let upcoming = -1;

    for (let row = this.matrix.rows - 1; row >= 0; row -= 1) {
      next[row] = upcoming;
      if (selected[row]) upcoming = row;
    }

    return next;
  }

  private selectRows(density: RowDensity, jackMap: number[]): boolean[] {
    const selected = new Array<boolean>(this.matrix.rows).fill(false);
    let lastPress = Number.NEGATIVE_INFINITY;
    let suppressed = 0;

    for (let row = 0; row < this.matrix.rows; row += 1) {
      if (density.probability[row] <= 0) continue;

      // 扩展列两次按下的间隔不能比源谱同轨在这一行的间隔更小，最多放宽到上限。
      const limit = Math.min(jackMap[row], this.maxJackInterval);

      if (this.rowTimes[row] - lastPress < limit) {
        suppressed += 1;
        continue;
      }

      const probability = Math.min(1, density.probability[row] * (1 + suppressed * 0.5));

      if (Math.random() >= probability) continue;

      selected[row] = true;
      lastPress = this.rowTimes[row];
      suppressed = 0;
    }

    return selected;
  }

  private shouldStartHold(noteCount: number, headCount: number): boolean {
    return noteCount === 0 || Math.random() * (noteCount + headCount) >= noteCount;
  }

  private tryCreateHold(
    targetColumn: number,
    side: SideRange,
    row: number,
    rowTime: number,
    nextRow: number,
  ): { object: ManiaHitObject; closeTime: number } | null {
    this.candidates.length = 0;

    for (let column = side.start; column < side.start + side.length; column += 1) {
      const cell = this.matrix.get(row, column);
      if (cell < 0) continue;

      const source = this.objects[cell];
      if (source.endTime !== null && source.endTime > source.startTime) this.candidates.push(cell);
    }

    if (this.candidates.length === 0) return null;

    const origin = this.objects[this.candidates[randomInt(this.candidates.length)]];

    // 镜像源的尾是默认收尾时刻，实际用哪个由源谱的缝分布决定。
    const close = this.resolveClose(side, origin.column, rowTime, rowTime + (origin.endTime as number) - origin.startTime, nextRow);

    if (!Number.isFinite(close) || close - rowTime <= 0) return null;

    return {
      closeTime: close,
      object: {
        column: targetColumn,
        startTime: rowTime,
        endTime: close,
        ...copySamples(origin, true),
      },
    };
  }

  /**
   * 决定这条扩展长条在哪收尾。缝要跟源谱一致：收尾不早于「头 + 最小缝」，
   * 也不晚于「外列下一个按键 - 最小缝」。
   */
  private resolveClose(
    side: SideRange,
    originColumn: number,
    headTime: number,
    sourceTail: number,
    nextRow: number,
  ): number {
    if (nextRow < 0) return sourceTail;

    const gap = Math.max(this.lnGaps.min, this.minGap);
    const nextTime = this.rowTimes[nextRow];

    const earliest = headTime + gap;
    const latest = nextTime - gap;

    // 这一段放不下两侧都留缝的长条，退化成单点。
    if (latest <= earliest) return Number.NaN;

    // 源谱的缝很匀（反键图）：固定用中位数，让扩展列也长成一串等距的缝。
    if (this.lnGaps.uniform) {
      return Math.min(latest, Math.max(earliest, nextTime - this.lnGaps.median));
    }

    // 一半沿用镜像源的尾，另一半与「同侧其他列在窗口内的 LN 尾」「下一个按键 - 最小缝」均分。
    if (Math.random() < 0.5) return Math.min(latest, Math.max(earliest, sourceTail));

    this.tailCandidates.length = 0;

    for (let column = side.start; column < side.start + side.length; column += 1) {
      if (column === originColumn) continue;

      const times = this.tailTimes[column];

      for (let i = firstAtLeast(times, earliest); i < times.length && times[i] <= latest; i += 1) {
        this.tailCandidates.push(times[i]);
      }
    }

    this.tailCandidates.push(latest);

    return this.tailCandidates[randomInt(this.tailCandidates.length)];
  }

  private createNote(targetColumn: number, side: SideRange, row: number, rowTime: number): ManiaHitObject {
    const origin = this.pickOrigin(side, row);

    return {
      column: targetColumn,
      startTime: rowTime,
      endTime: null,
      ...copySamples(origin, false),
    };
  }

  private pickOrigin(side: SideRange, row: number): ManiaHitObject | null {
    this.candidates.length = 0;

    for (let column = side.start; column < side.start + side.length; column += 1) {
      const cell = this.matrix.get(row, column);
      if (cell >= 0) this.candidates.push(cell);
    }

    if (this.candidates.length === 0) return null;

    return this.objects[this.candidates[randomInt(this.candidates.length)]];
  }
}
