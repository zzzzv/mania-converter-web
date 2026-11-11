import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { convertOsz, NoConvertibleChartError } from '../src/lib/pipeline';
import { decodeText } from '../src/lib/osz';
import { parseOsu } from '../src/lib/osu/text';
import { EXT_CONVERTER } from '../src/lib/convert/ext/ext';

const fixture = readFileSync(join(__dirname, 'fixtures', 'hanatachi-7k.osu'));

function buildOsz(extraFiles: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    'Hanatachi ni Kibou o.osu': new Uint8Array(fixture),
    'audio.mp3': new Uint8Array([1, 2, 3, 4]),
    'Background.jpg': new Uint8Array([5, 6, 7]),
    ...extraFiles,
  });
}

function request(bytes: Uint8Array) {
  return {
    bytes,
    fileName: 'test.osz',
    converterId: 'ext',
    values: { ...EXT_CONVERTER.defaults },
    sourceKeys: [] as number[],
  };
}

describe('转换流水线', () => {
  it('保留原包全部条目并追加转谱难度', async () => {
    const result = await convertOsz(request(buildOsz()));

    expect(result.convertedCount).toBe(1);
    expect(result.fileName).toBe(
      'Sound piercer feat. DAZBEE - Hanatachi ni Kibou o (_Rokii) [EXT 10k].osz',
    );

    const entries = unzipSync(result.data);
    const names = Object.keys(entries);

    expect(names).toContain('Hanatachi ni Kibou o.osu');
    expect(names).toContain('audio.mp3');
    expect(names).toContain('Background.jpg');

    const newName = names.find((name) => name.includes('[EXT 10k]'));
    expect(newName).toBe('Sound piercer feat. DAZBEE - Hanatachi ni Kibou o (_Rokii) [Here I wish, let there be light] [EXT 10k].osu');

    const text = decodeText(entries[newName as string]);
    const converted = parseOsu(text);

    expect(converted.mode).toBe(3);
    expect(converted.keyCount).toBe(10);
    expect(converted.version.endsWith('[EXT 10k]')).toBe(true);
    expect(converted.creator).toBe('_Rokii (EXT 10k)');
    expect(converted.tags).toContain('mania-ext-converter');
    expect(text).toContain('BeatmapID:-1');
    expect(converted.hitObjects.length).toBeGreaterThan(0);

    // 原难度必须逐字节保留
    expect(decodeText(entries['Hanatachi ni Kibou o.osu'])).toContain('[HitObjects]');
    expect(result.charts[0].status).toBe('converted');
  });

  it('已是转谱的难度会被跳过并给出原因', async () => {
    const first = await convertOsz(request(buildOsz()));
    const entries = unzipSync(first.data);
    const convertedName = Object.keys(entries).find((name) => name.includes('[EXT 10k]')) as string;

    const secondOsz = zipSync({ [convertedName]: entries[convertedName] });

    await expect(convertOsz(request(secondOsz))).rejects.toBeInstanceOf(NoConvertibleChartError);

    const error = await convertOsz(request(secondOsz)).catch((reason: unknown) => reason);
    expect((error as NoConvertibleChartError).charts[0].reason).toBe('已是转谱难度');
  });

  it('占位谱不会被转换', async () => {
    const placeholder = [
      'osu file format v14',
      '',
      '[General]',
      'AudioFilename: audio.mp3',
      'Mode: 3',
      '',
      '[Metadata]',
      'Title:Placeholder',
      'Artist:Test',
      'Creator:Tester',
      'Version:Empty',
      'Tags:',
      '',
      '[Difficulty]',
      'CircleSize:4',
      '',
      '[HitObjects]',
      '64,192,0,1,0,0:0:0:0:',
      '192,192,420000,1,0,0:0:0:0:',
      '',
    ].join('\r\n');

    const bytes = zipSync({ 'placeholder.osu': new TextEncoder().encode(placeholder) });
    const error = await convertOsz(request(bytes)).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(NoConvertibleChartError);
    expect((error as NoConvertibleChartError).charts[0].reason).toContain('占位谱');
  });

  it('源键数过滤生效', async () => {
    const error = await convertOsz({ ...request(buildOsz()), sourceKeys: [4, 5] }).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(NoConvertibleChartError);
    expect((error as NoConvertibleChartError).charts[0].reason).toBe('未勾选 8K');
  });
});
