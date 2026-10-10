/** Frequency readout: "999.5 Hz", "1.000 kHz", "12.34 kHz". Rounds before picking the unit. */
export function formatFreq(f: number): string {
  if (!Number.isFinite(f)) return '–';
  if (+f.toFixed(1) < 1000) return `${f.toFixed(1)} Hz`;
  const k = f / 1000;
  return +k.toFixed(3) < 10 ? `${k.toFixed(3)} kHz` : `${k.toFixed(2)} kHz`;
}
