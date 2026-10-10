import { useId } from 'react';

const CX = 150;
const CY = 232; // needle pivot (hidden below the face)
const R = 178; // scale radius
const SWEEP = 46; // degrees either side of vertical

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number, r: number) => [CX + r * Math.sin(rad(deg)), CY - r * Math.cos(rad(deg))] as const;

/**
 * Skeuomorphic analog SPL meter: cream face, printed scale, black needle.
 * `value` in dB; scale spans [min, max] with major ticks every 10 dB.
 */
export function AnalogDial({
  value,
  min,
  max,
  caption,
  subcaption,
}: {
  value: number | null;
  min: number;
  max: number;
  caption: string;
  subcaption?: string;
}) {
  const clipId = useId();
  const angleOf = (v: number) => -SWEEP + ((v - min) / (max - min)) * 2 * SWEEP;
  const clamped = value == null || !Number.isFinite(value) ? min - 3 : Math.min(max + 2, Math.max(min - 3, value));
  const needleAngle = angleOf(clamped);
  const redFrom = max - 10;

  const ticks: JSX.Element[] = [];
  for (let v = min; v <= max + 1e-6; v += 2) {
    const major = Math.round(v - min) % 10 === 0;
    const a = angleOf(v);
    const [x1, y1] = pt(a, R);
    const [x2, y2] = pt(a, R - (major ? 16 : 9));
    ticks.push(
      <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className={v >= redFrom ? 'dial-tick red' : 'dial-tick'} strokeWidth={major ? 2 : 1.1} />,
    );
    if (major) {
      const [lx, ly] = pt(a, R - 30);
      ticks.push(
        <text key={`l${v}`} x={lx} y={ly} className={v >= redFrom ? 'dial-num red' : 'dial-num'} textAnchor="middle" dominantBaseline="middle">
          {v}
        </text>,
      );
    }
  }
  const [ra1x, ra1y] = pt(angleOf(redFrom), R + 6);
  const [ra2x, ra2y] = pt(SWEEP, R + 6);
  const [na1x, na1y] = pt(-SWEEP, R + 6);
  const [na2x, na2y] = pt(angleOf(redFrom), R + 6);

  return (
    <svg className="dial" viewBox="0 0 300 196" role="img" aria-label={`Meter ${value?.toFixed(1) ?? 'no signal'} ${caption}`}>
      <defs>
        <clipPath id={clipId}>
          <rect x="12" y="12" width="276" height="172" rx="8" />
        </clipPath>
        <radialGradient id={`${clipId}g`} cx="50%" cy="20%" r="90%">
          <stop offset="0%" stopColor="var(--meter-face)" />
          <stop offset="100%" stopColor="var(--meter-face-edge)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="300" height="196" rx="14" className="dial-housing" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="12" y="12" width="276" height="172" fill={`url(#${clipId}g)`} />
        <path d={`M${na1x} ${na1y} A${R + 6} ${R + 6} 0 0 1 ${na2x} ${na2y}`} className="dial-arc" />
        <path d={`M${ra1x} ${ra1y} A${R + 6} ${R + 6} 0 0 1 ${ra2x} ${ra2y}`} className="dial-arc red" />
        {ticks}
        <text x={CX} y={112} className="dial-caption" textAnchor="middle">{caption}</text>
        {subcaption && <text x={CX} y={128} className="dial-sub" textAnchor="middle">{subcaption}</text>}
        <g className="dial-needle" style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R - 4} />
        </g>
        <rect x="12" y="162" width="276" height="28" className="dial-cover" />
      </g>
      <rect x="12" y="12" width="276" height="172" rx="8" className="dial-bezel" />
    </svg>
  );
}
