import type { ConverterDef, SettingValues } from './types';
import { EXT_CONVERTER } from './ext/ext';

/** 可用算法列表。新增算法只需在这里注册一项。 */
export const CONVERTERS: ConverterDef[] = [EXT_CONVERTER];

export const DEFAULT_CONVERTER_ID = EXT_CONVERTER.id;

export function getConverter(id: string): ConverterDef {
  return CONVERTERS.find((converter) => converter.id === id) ?? EXT_CONVERTER;
}

export function defaultValuesFor(converter: ConverterDef): SettingValues {
  return { ...converter.defaults };
}

export function targetKeysOf(converter: ConverterDef, values: SettingValues): number {
  const raw = values[converter.targetKeySetting];
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : 10;
}
