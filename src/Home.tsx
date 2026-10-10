import { Fragment } from 'react';
import { useEngineStatus } from './audio/engine';
import { useLogger } from './audio/splLogger';
import { Icon } from './components/Icon';
import { APP_NAME } from './config';
import { GROUPS, MODULES, type InstrumentModule } from './modules';
import { navigate } from './router';
import { useCalibration } from './store/calibration';

function Tile({ m, badge }: { m: InstrumentModule; badge?: string }) {
  return (
    <button className="tile" onClick={() => navigate(m.id)}>
      <span className="tile-icon">
        <Icon name={m.icon} size={28} />
      </span>
      <span className="tile-title">{m.title}</span>
      <span className="tile-blurb">{m.blurb}</span>
      {badge && <span className="tile-badge">{badge}</span>}
    </button>
  );
}

export function Home() {
  const cal = useCalibration();
  const { generatorRunning } = useEngineStatus();
  const log = useLogger();
  const badge = (id: string) =>
    id === 'generator' && generatorRunning
      ? 'ON'
      : id === 'logger' && log.running
        ? 'REC'
        : id === 'calibration' && !cal.calibratedAt
          ? 'Not set'
          : undefined;
  return (
    <div className="home">
      <header className="home-head">
        <h1>{APP_NAME}</h1>
        <p>Audio test &amp; measurement</p>
      </header>
      {GROUPS.map((g) => (
        <Fragment key={g.id}>
          <h2 className="home-section">{g.title}</h2>
          <div className="tiles">
            {MODULES.filter((m) => m.group === g.id).map((m) => (
              <Tile key={m.id} m={m} badge={badge(m.id)} />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
