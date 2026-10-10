import { engine, useEngineStatus } from '../../audio/engine';
import { Icon } from '../../components/Icon';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, Segmented } from '../../components/ui';
import type { Waveform } from '../../dsp/generators';

const WAVES: { value: Waveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'pink', label: 'Pink' },
  { value: 'white', label: 'White' },
  { value: 'sweep', label: 'Sweep' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'polarity', label: 'Polarity' },
];
const PRESETS = [50, 100, 250, 440, 1000, 2000, 4000, 10000];
const LOUD_DBFS = -6;
/** Asked once per app session. */
let loudConfirmed = false;
const F_MIN = 10;
const F_MAX = 22000;

// Log slider mapping 0..1000 ↔ 10 Hz..22 kHz
const toSlider = (f: number) => Math.round((Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * 1000);
const fromSlider = (v: number) => {
  const f = F_MIN * (F_MAX / F_MIN) ** (v / 1000);
  return f < 100 ? Math.round(f * 10) / 10 : Math.round(f);
};

export function Generator() {
  const { generator: g, generatorRunning } = useEngineStatus();
  const set = engine.setGenerator.bind(engine);
  const setLevel = (level: number) => {
    if (level > LOUD_DBFS && g.level <= LOUD_DBFS && !loudConfirmed) {
      if (!window.confirm(`Go above ${LOUD_DBFS} dBFS? Loud test tones can damage hearing and speakers.`)) return;
      loudConfirmed = true;
    }
    set({ level });
  };
  const tonal = g.waveform === 'sine' || g.waveform === 'square' || g.waveform === 'triangle';

  return (
    <ModuleScreen title="Signal Generator" showCalBadge={false}>
      <div className="gen">
        <button
          className={generatorRunning ? 'gen-play on' : 'gen-play'}
          onClick={() => void engine.setGeneratorRunning(!generatorRunning)}
          aria-pressed={generatorRunning}
        >
          <Icon name={generatorRunning ? 'stop' : 'play'} size={36} />
          <span>{generatorRunning ? 'Stop' : 'Play'}</span>
        </button>

        <Field label="Waveform">
          <Segmented options={WAVES} value={g.waveform} onChange={(waveform) => set({ waveform })} />
        </Field>

        {tonal && (
          <Field label="Frequency">
            <div className="gen-freq">
              <input
                className="num gen-freq-input"
                type="number"
                inputMode="decimal"
                min={F_MIN}
                max={F_MAX}
                value={g.frequency}
                onChange={(e) => {
                  const f = Number(e.target.value);
                  if (f >= F_MIN && f <= F_MAX) set({ frequency: f });
                }}
              />
              <span className="gen-unit">Hz</span>
            </div>
            <input
              className="slider"
              type="range"
              min={0}
              max={1000}
              value={toSlider(g.frequency)}
              onChange={(e) => set({ frequency: fromSlider(Number(e.target.value)) })}
              aria-label="Frequency"
            />
            <div className="gen-presets">
              {PRESETS.map((f) => (
                <button key={f} className={g.frequency === f ? 'chip on' : 'chip'} onClick={() => set({ frequency: f })}>
                  {f >= 1000 ? `${f / 1000}k` : f}
                </button>
              ))}
            </div>
          </Field>
        )}

        {g.waveform === 'polarity' && (
          <p className="field-hint">Positive-going clicks, 4 per second. Run the Polarity instrument in Listen mode on another phone to check each speaker.</p>
        )}

        {g.waveform === 'sweep' && (
          <Field label="Sweep" hint="Logarithmic sine sweep, repeats.">
            <div className="gen-sweep">
              <label>
                From <input className="num" type="number" value={g.sweepStart} min={F_MIN} max={F_MAX} onChange={(e) => set({ sweepStart: Math.max(F_MIN, Number(e.target.value) || F_MIN) })} /> Hz
              </label>
              <label>
                To <input className="num" type="number" value={g.sweepEnd} min={F_MIN} max={F_MAX} onChange={(e) => set({ sweepEnd: Math.min(F_MAX, Number(e.target.value) || F_MAX) })} /> Hz
              </label>
              <label>
                Over <input className="num" type="number" value={g.sweepSeconds} min={0.5} max={60} step={0.5} onChange={(e) => set({ sweepSeconds: Math.max(0.5, Number(e.target.value) || 5) })} /> s
              </label>
            </div>
          </Field>
        )}

        <Field label={`Level  ${g.level.toFixed(0)} dBFS`} hint="RMS, relative to a full-scale sine. Start low, as test tones can damage hearing and speakers.">
          <input className="slider" type="range" min={-60} max={0} step={1} value={g.level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Level" />
        </Field>

        <Field label="Output">
          <Segmented options={[{ value: 'both', label: 'L + R' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] as const} value={g.channels} onChange={(channels) => set({ channels })} />
        </Field>
      </div>
    </ModuleScreen>
  );
}
