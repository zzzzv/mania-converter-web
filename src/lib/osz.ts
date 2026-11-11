import { unzip, zip } from 'fflate';

export interface OszEntry {
  name: string;
  data: Uint8Array;
}

/** .osu 文本可能是 UTF-8，也可能是国内分享谱常见的 GBK/GB18030。 */
export function decodeText(bytes: Uint8Array): string {
  const stripBom = (value: string) => (value.charCodeAt(0) === 0xfeff ? value.slice(1) : value);

  const strict = new TextDecoder('utf-8', { fatal: true });

  const utf8 = attempt(() => strict.decode(bytes));
  if (utf8 !== null) return stripBom(utf8);

  const gb = attempt(() => new TextDecoder('gb18030').decode(bytes));
  if (gb !== null) return stripBom(gb);

  return stripBom(new TextDecoder('utf-8').decode(bytes));
}

function attempt<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

/**
 * 部分 osz 的条目名没有 UTF-8 标志位，会被按 latin1 逐字节解出乱码。
 * 这里把字符串还原成字节再按 UTF-8/GB18030 重新解码。
 */
export function fixZipEntryName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;

  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i += 1) bytes[i] = name.charCodeAt(i) & 0xff;

  const strict = new TextDecoder('utf-8', { fatal: true });

  const candidates = [
    attempt(() => strict.decode(bytes)),
    attempt(() => new TextDecoder('gb18030').decode(bytes)),
  ];

  for (const candidate of candidates) {
    if (candidate && !candidate.includes('\ufffd') && !candidate.includes('\u0000')) return candidate;
  }

  return name;
}

export function unzipOsz(data: Uint8Array): Promise<OszEntry[]> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error) {
        console.error('[osz] 解压失败', error);
        reject(new Error('解压 osz 失败，文件可能已损坏或不是 zip 格式'));
        return;
      }

      const entries: OszEntry[] = Object.keys(result).map((key) => ({
        name: fixZipEntryName(key),
        data: result[key],
      }));

      resolve(entries);
    });
  });
}

/**
 * 打包 osz。媒体文件本身已压缩，原样 store 复制即可；
 * 新写入的 .osu 文本用中等压缩率。
 */
export function zipOsz(entries: OszEntry[], compressedNames: Set<string>): Promise<Uint8Array> {
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};

  for (const entry of entries) {
    const level = compressedNames.has(entry.name) ? 6 : 0;
    files[entry.name] = [entry.data, { level }];
  }

  return new Promise((resolve, reject) => {
    zip(files, (error, data) => {
      if (error) {
        console.error('[osz] 打包失败', error);
        reject(new Error('打包 osz 失败'));
        return;
      }

      resolve(data);
    });
  });
}

export function downloadBytes(data: Uint8Array, fileName: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
