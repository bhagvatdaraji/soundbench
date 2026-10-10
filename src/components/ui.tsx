import { useEffect, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Segmented control / chip row. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[] | readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const opts = (options as readonly (T | { value: T; label: string })[]).map((o) =>
    typeof o === 'object' ? o : { value: o, label: String(o) },
  );
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'seg-btn on' : 'seg-btn'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={active ? 'tool-btn on' : 'tool-btn'}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  );
}

/** Labelled numeric readout. */
export function Readout({
  label,
  value,
  unit,
  tone,
  size = 'md',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'live' | 'max' | 'warn' | 'dim';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className={`readout readout-${size}`}>
      <div className="readout-label">{label}</div>
      <div className={`readout-value num ${tone ? `tone-${tone}` : ''}`}>
        {value}
        {unit && <span className="readout-unit">{unit}</span>}
      </div>
    </div>
  );
}

/** Bottom sheet for settings. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** A labelled row inside a settings sheet. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** Format a dB value or a dash when there's no signal yet. */
export function fmtDb(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '––.–';
  return v.toFixed(digits);
}
