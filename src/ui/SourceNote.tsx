import { ExternalLink } from 'lucide-react';
import { SAYOBOT_HOME } from '../lib/sayobot';
import { cn } from '../lib/cn';

interface SourceNoteProps {
  className?: string;
  compact?: boolean;
}

/** 下载来源声明：谱面数据与 osz 都来自 Sayobot。 */
export function SourceNote({ className, compact }: SourceNoteProps) {
  return (
    <p className={cn('text-[11px] leading-relaxed text-ink-400', className)}>
      谱面数据与下载均来自{' '}
      <a
        href={SAYOBOT_HOME}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-0.5 font-medium text-ink-600 underline decoration-line underline-offset-2 transition hover:text-accent-600"
      >
        Sayobot
        <ExternalLink size={11} strokeWidth={1.6} />
      </a>
      {compact ? '' : '，与 Sayobot 无隶属关系；下载源不可用时请改用本地 osz 上传。'}
    </p>
  );
}
