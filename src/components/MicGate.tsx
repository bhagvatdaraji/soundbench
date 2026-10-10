import type { ReactNode } from 'react';
import { engine, useEngineStatus } from '../audio/engine';
import { Icon } from './Icon';
import { InputPicker } from './InputPicker';

/** Shows a "Start microphone" card until the mic is running, then renders children. */
export function MicGate({ children }: { children: ReactNode }) {
  const status = useEngineStatus();
  if (status.mic === 'on') return <>{children}</>;
  return (
    <div className="mic-gate">
      <button
        className="mic-start"
        onClick={() => void engine.startMic()}
        disabled={status.mic === 'starting'}
      >
        <Icon name="mic" size={40} />
        <span>{status.mic === 'starting' ? 'Starting…' : 'Start microphone'}</span>
      </button>
      <InputPicker compact />
      {status.notice && <p className="mic-notice">{status.notice}</p>}
      {status.error && <p className="mic-error">{status.error}</p>}
      <p className="mic-note">Audio is processed on this device only. Nothing is recorded or uploaded.</p>
    </div>
  );
}
