import type { ManiaHitObject } from '../osu/hitobjects';

/** 转谱算法只需要"键数 + 打击物件"这两样信息。 */
export interface ManiaChart {
  keyCount: number;
  hitObjects: ManiaHitObject[];
}

export interface SettingOption {
  value: string;
  label: string;
}

/** 设置项声明，UI 按此渲染，新增算法无需改 UI 代码。 */
export interface SettingDef {
  key: string;
  label: string;
  hint?: string;
  kind: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: SettingOption[];
  /** 折叠在「高级参数」里 */
  advanced?: boolean;
}

export type SettingValues = Record<string, number | string>;

export interface ConverterDef {
  id: string;
  name: string;
  acronym: string;
  description: string;
  settings: SettingDef[];
  defaults: SettingValues;
  /** 目标键数对应的设置项 key */
  targetKeySetting: string;
  /** 键数能否继续加宽 */
  isApplicable: (chart: ManiaChart, values: SettingValues) => boolean;
  convert: (chart: ManiaChart, values: SettingValues) => ManiaChart;
}

export function numSetting(values: SettingValues, key: string, fallback: number): number {
  const value = values[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function strSetting(values: SettingValues, key: string, fallback: string): string {
  const value = values[key];
  return typeof value === 'string' ? value : fallback;
}
