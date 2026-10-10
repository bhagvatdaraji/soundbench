import { engine, useEngineStatus, type InputChannel } from '../audio/engine';
import { Segmented } from './ui';

/**
 * Choose which microphone / interface input to measure with. Compact form for the
 * start card; full form (with channel choice) for Mic & Calibration.
 */
export function InputPicker({ compact = false }: { compact?: boolean }) {
  const st = useEngineStatus();
  if (engine.loopback) return null;
  const known = st.inputs.some((i) => i.id === st.inputId);
  if (compact && (st.inputs.length < 2 || !st.inputsNamed)) return null;
  return (
    <div className={compact ? 'input-picker compact' : 'input-picker'}>
      <select
        className="input-select"
        aria-label="Microphone input"
        value={known ? st.inputId! : ''}
        onChange={(e) => void engine.setInput(e.target.value || null)}
        disabled={st.mic === 'starting'}
      >
        <option value="">System default{st.inputId === null && st.inputLabel ? ` (${st.inputLabel})` : ''}</option>
        {st.inputs.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      {!compact && st.mic === 'on' && (st.inputChannels > 1 || st.inputChannel !== 'mix') && (
        <Segmented<string>
          label="Input channel"
          options={[
            { value: 'mix', label: 'All (mix)' },
            { value: '0', label: 'Input 1' },
            { value: '1', label: 'Input 2' },
          ]}
          value={String(st.inputChannel)}
          onChange={(v) => void engine.setInputChannel((v === 'mix' ? 'mix' : Number(v)) as InputChannel)}
        />
      )}
    </div>
  );
}
