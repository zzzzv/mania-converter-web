import { useMemo, useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { ConverterDef, SettingDef, SettingValues } from '../lib/convert/types';
import { cn } from '../lib/cn';

interface SettingsPanelProps {
  converters: ConverterDef[];
  converter: ConverterDef;
  converterId: string;
  values: SettingValues;
  sourceKeys: number[];
  onConverterChange: (id: string) => void;
  onValueChange: (key: string, value: number | string) => void;
  onSourceKeysChange: (keys: number[]) => void;
  onReset: () => void;
}

const KEY_CHOICES = [4, 5, 6, 7, 8, 9, 10];

function NumberField({
  setting,
  value,
  onChange,
}: {
  setting: SettingDef;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-900">{setting.label}</span>
        <span className="flex items-center gap-1 text-[11px] text-ink-400">
          <input
            type="number"
            value={Number.isFinite(value) ? value : 0}
            min={setting.min}
            max={setting.max}
            step={setting.step ?? 1}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(next);
            }}
            className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-right text-[12px] tabular-nums text-ink-900 outline-none transition focus:border-accent-300 focus:ring-2 focus:ring-accent-50"
          />
          {setting.unit ?? ''}
        </span>
      </span>
      {setting.hint ? <span className="text-[11px] leading-relaxed text-ink-400">{setting.hint}</span> : null}
    </label>
  );
}

export function SettingsPanel({
  converters,
  converter,
  converterId,
  values,
  sourceKeys,
  onConverterChange,
  onValueChange,
  onSourceKeysChange,
  onReset,
}: SettingsPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const targetDef = converter.settings.find((setting) => setting.key === converter.targetKeySetting);
  const target = Math.round(Number(values[converter.targetKeySetting] ?? 10));

  const basicSettings = converter.settings.filter(
    (setting) => !setting.advanced && setting.key !== converter.targetKeySetting,
  );
  const advancedSettings = converter.settings.filter((setting) => setting.advanced);

  const preview = useMemo(() => {
    const base = sourceKeys.length > 0 ? sourceKeys : KEY_CHOICES;
    const eligible = base.filter((key) => key < target).sort((a, b) => a - b);
    return eligible.length > 0 ? `${eligible.join('/')}K → ${target}K` : '没有可加宽的源键数';
  }, [sourceKeys, target]);

  const toggleKey = (key: number) => {
    const next = sourceKeys.includes(key)
      ? sourceKeys.filter((item) => item !== key)
      : [...sourceKeys, key].sort((a, b) => a - b);
    onSourceKeysChange(next);
  };

  return (
    <section className="card flex flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
            <SlidersHorizontal size={15} strokeWidth={1.7} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold leading-tight">转谱设置</h2>
            <p className="text-[11px] text-ink-400">搜索下载与本地上传共用同一份设置</p>
          </div>
        </div>
        <button type="button" onClick={onReset} className="btn-quiet h-7 px-2 text-[11px]" title="恢复默认参数">
          <RotateCcw size={13} strokeWidth={1.7} />
          重置
        </button>
      </header>

      <div className="flex flex-col gap-1.5">
        <span className="label-group">算法</span>
        <select
          value={converterId}
          onChange={(event) => onConverterChange(event.target.value)}
          className="field cursor-pointer"
        >
          {converters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}（{item.acronym}）
            </option>
          ))}
        </select>
        <span className="text-[11px] leading-relaxed text-ink-400">{converter.description}</span>
      </div>

      {targetDef ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">{targetDef.label}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold tabular-nums text-accent-700 shadow-[0_0_0_1px_rgba(91,91,214,0.18)]">
              {target}K
            </span>
          </div>
          <input
            type="range"
            min={targetDef.min ?? 2}
            max={targetDef.max ?? 10}
            step={targetDef.step ?? 1}
            value={target}
            onChange={(event) => onValueChange(targetDef.key, Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-accent-500"
            style={{ accentColor: '#5B5BD6' }}
          />
          <div className="flex items-center justify-between text-[11px] text-ink-400">
            <span>{preview}</span>
            <span className="tabular-nums">{targetDef.min ?? 2}–{targetDef.max ?? 10}K</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="label-group">源键数过滤</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onSourceKeysChange([])} className={cn('chip', sourceKeys.length === 0 && 'chip-active')}>
            全部
          </button>
          {KEY_CHOICES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleKey(key)}
              className={cn('chip tabular-nums', sourceKeys.includes(key) && 'chip-active')}
            >
              {key}K
            </button>
          ))}
        </div>
        <span className="text-[11px] leading-relaxed text-ink-400">
          只转换勾选的源键数，可同时勾选多个；键数已达到目标的难度会自动跳过。
        </span>
      </div>

      {basicSettings.map((setting) => (
        <label key={setting.key} className="flex flex-col gap-1">
          <span className="text-[13px] font-medium">{setting.label}</span>
          {setting.kind === 'select' ? (
            <select
              value={String(values[setting.key] ?? '')}
              onChange={(event) => onValueChange(setting.key, event.target.value)}
              className="field cursor-pointer"
            >
              {setting.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              value={Number(values[setting.key] ?? 0)}
              min={setting.min}
              max={setting.max}
              step={setting.step ?? 1}
              onChange={(event) => onValueChange(setting.key, Number(event.target.value))}
              className="field tabular-nums"
            />
          )}
          {setting.hint ? <span className="text-[11px] text-ink-400">{setting.hint}</span> : null}
        </label>
      ))}

      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium text-ink-600 transition hover:text-ink-900"
          aria-expanded={advancedOpen}
        >
          高级参数
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            className={cn('transition-transform duration-200', advancedOpen && 'rotate-180')}
          />
        </button>
        {advancedOpen ? (
          <div className="animate-slide flex flex-col gap-4 border-t border-line px-3 py-3">
            {advancedSettings.map((setting) =>
              setting.kind === 'select' ? (
                <label key={setting.key} className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium">{setting.label}</span>
                  <select
                    value={String(values[setting.key] ?? '')}
                    onChange={(event) => onValueChange(setting.key, event.target.value)}
                    className="field cursor-pointer"
                  >
                    {setting.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {setting.hint ? (
                    <span className="text-[11px] leading-relaxed text-ink-400">{setting.hint}</span>
                  ) : null}
                </label>
              ) : (
                <NumberField
                  key={setting.key}
                  setting={setting}
                  value={Number(values[setting.key] ?? 0)}
                  onChange={(value) => onValueChange(setting.key, value)}
                />
              ),
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl bg-canvas px-3 py-2.5 text-[11px] leading-relaxed text-ink-400">
        <span className="font-medium text-ink-600">自动跳过：</span>
        已是转谱的难度、非 mania 难度、占位谱（note ≤ 20 且时长 ≥ 6 分钟）、源键数已达目标。
      </div>
    </section>
  );
}
