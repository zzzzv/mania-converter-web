import { useRef, useState } from 'react';
import { FileArchive, Plus, Upload, X } from 'lucide-react';
import { formatBytes } from '../lib/osz';
import { cn } from '../lib/cn';

interface UploadPanelProps {
  onConvertFiles: (files: File[]) => void;
}

function isOsz(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.osz') || name.endsWith('.zip');
}

export function UploadPanel({ onConvertFiles }: UploadPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter(isOsz);
    if (next.length === 0) return;

    setQueue((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}-${file.size}`));
      return [...prev, ...next.filter((file) => !existing.has(`${file.name}-${file.size}`))];
    });
  };

  const removeAt = (index: number) => {
    setQueue((prev) => prev.filter((_, item) => item !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      {/*
        文件框直接铺满整个虚线区域（透明覆盖），而不是用 JS 调 input.click()：
        iOS Safari 对 display:none 的 input 常拒绝唤起选择器，原生点按则稳定。
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-9 text-center transition duration-150',
          dragging
            ? 'border-accent-300 bg-accent-50'
            : 'border-line bg-canvas/50 hover:border-accent-300 hover:bg-accent-50/40',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".osz,.zip,application/zip,application/octet-stream"
          multiple
          aria-label="选择 .osz 文件"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span
          className={cn(
            'pointer-events-none flex h-10 w-10 items-center justify-center rounded-xl transition',
            dragging ? 'bg-white text-accent-600' : 'bg-white text-ink-400',
          )}
        >
          <Upload size={18} strokeWidth={1.7} />
        </span>
        <p className="pointer-events-none text-[13px] font-medium text-ink-900">
          把 .osz 拖到这里，或点击选择文件
        </p>
        <p className="pointer-events-none text-[11px] leading-relaxed text-ink-400">
          支持一次多个，文件只在浏览器内存里处理，不会上传到任何服务器
        </p>
      </div>

      {queue.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {queue.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2"
            >
              <FileArchive size={15} strokeWidth={1.7} className="shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-900">{file.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="btn-quiet h-6 w-6 shrink-0 rounded-lg p-0"
                aria-label={`移除 ${file.name}`}
              >
                <X size={13} strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-ghost h-9 flex-1">
          <Plus size={14} strokeWidth={1.8} />
          添加文件
        </button>
        <button
          type="button"
          disabled={queue.length === 0}
          onClick={() => {
            onConvertFiles(queue);
            setQueue([]);
          }}
          className="btn-primary h-9 flex-1"
        >
          开始转换{queue.length > 0 ? `（${queue.length}）` : ''}
        </button>
      </div>
    </div>
  );
}
