import { describe, expect, it } from 'vitest';
import {
  buildOsuEntryName,
  buildOszFileName,
  convertedCreator,
  convertedVersion,
  isConvertedChart,
  isPlaceholderChart,
  markerFor,
  mergedTags,
  sanitizeFileName,
} from '../src/lib/naming';

describe('命名规则', () => {
  it('标记使用小写 k', () => {
    expect(markerFor('EXT', 10)).toBe('[EXT 10k]');
  });

  it('难度名与 creator 都带转谱标记', () => {
    const marker = markerFor('EXT', 10);
    expect(convertedVersion('Insane', marker)).toBe('Insane [EXT 10k]');
    expect(convertedCreator('_Rokii', 'EXT', 10)).toBe('_Rokii (EXT 10k)');
  });

  it('osz 与包内 .osu 文件名都带标记', () => {
    const marker = markerFor('EXT', 10);
    expect(buildOszFileName('Artist', 'Title', 'Mapper', marker)).toBe('Artist - Title (Mapper) [EXT 10k].osz');
    expect(buildOsuEntryName('Artist', 'Title', 'Mapper', 'Insane', marker)).toBe(
      'Artist - Title (Mapper) [Insane] [EXT 10k].osu',
    );
  });

  it('过滤文件名非法字符', () => {
    expect(sanitizeFileName('a/b:c*?"<>|d')).toBe('abcd');
  });
});

describe('跳过规则', () => {
  it('识别已是转谱的难度', () => {
    expect(isConvertedChart('Insane [EXT 10k]', 'Mapper', '')).toBe(true);
    expect(isConvertedChart('Insane', 'Mapper (EXT 10k)', '')).toBe(true);
    expect(isConvertedChart('Insane', 'Mapper', 'runtime mania-ext-converter')).toBe(true);
    expect(isConvertedChart('Insane', 'Mapper', 'pop')).toBe(false);
  });

  it('识别超长且极少 note 的占位谱', () => {
    expect(isPlaceholderChart(20, 6 * 60 * 1000)).toBe(true);
    expect(isPlaceholderChart(4, 12 * 60 * 1000)).toBe(true);
    expect(isPlaceholderChart(21, 12 * 60 * 1000)).toBe(false);
    expect(isPlaceholderChart(3, 60 * 1000)).toBe(false);
  });

  it('tag 追加且幂等', () => {
    const once = mergedTags('vocal jpop');
    expect(once).toContain('mania-ext-converter');
    expect(mergedTags(once)).toBe(once);
  });
});
