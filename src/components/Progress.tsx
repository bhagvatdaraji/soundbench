/** Thin progress bar with a label, shown while a measurement runs. */
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="progress-bar" style={{ width: `${Math.round(value * 100)}%` }} />
      <span className="progress-label">{label}</span>
    </div>
  );
}
