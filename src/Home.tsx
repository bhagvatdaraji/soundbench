import { useEngineStatus } from './audio/engine';
import { Icon } from './components/Icon';
import { APP_NAME } from './config';
import { MODULES, SETTINGS_MODULES, type InstrumentModule } from './modules';
import { navigate } from './router';
import { useCalibration } from './store/calibration';

function Tile({ m, badge }: { m: InstrumentModule; badge?: string }) {
  const soon = !m.Screen;
  return (
    <button className={soon ? 'tile soon' : 'tile'} onClick={() => !soon && navigate(m.id)} disabled={soon}>
      <span className="tile-icon">
        <Icon name={m.icon} size={28} />
      </span>
      <span className="tile-title">{m.title}</span>
      <span className="tile-blurb">{soon ? 'Coming soon' : m.blurb}</span>
      {badge && <span className="tile-badge">{badge}</span>}
    </button>
  );
}

export function Home() {
  const cal = useCalibration();
  const { generatorRunning } = useEngineStatus();
  return (
    <div className="home">
      <header className="home-head">
        <h1>{APP_NAME}</h1>
        <p>Audio test &amp; measurement</p>
      </header>
      <div className="tiles">
        {MODULES.map((m) => (
          <Tile key={m.id} m={m} badge={m.id === 'generator' && generatorRunning ? 'ON' : undefined} />
        ))}
      </div>
      <h2 className="home-section">Setup</h2>
      <div className="tiles">
        {SETTINGS_MODULES.map((m) => (
          <Tile key={m.id} m={m} badge={m.id === 'calibration' && !cal.calibratedAt ? 'Not set' : undefined} />
        ))}
      </div>
    </div>
  );
}
