import { cn } from '../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative flex rounded-full border border-line bg-canvas p-1', className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_1px_2px_rgba(17,24,39,0.08)] transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            option.value === value ? 'text-accent-700' : 'text-ink-600 hover:text-ink-900',
            option.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
