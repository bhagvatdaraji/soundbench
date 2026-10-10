import { ModuleScreen } from '../../components/ModuleScreen';
import { Icon } from '../../components/Icon';
import { APP_NAME } from '../../config';
import { GROUPS, MODULES } from '..';
import { navigate } from '../../router';

export function About() {
  return (
    <ModuleScreen title="About & help" showCalBadge={false}>
      <div className="about">
        <section className="about-head">
          <h2>{APP_NAME}</h2>
          <p className="num">
            Version {__APP_VERSION__} · built {__BUILD_DATE__}
          </p>
          <p>
            Audio test and measurement in your browser. Install it from Safari with Share › Add to Home Screen. Everything runs on this device: no audio is recorded to a
            server or uploaded.
          </p>
        </section>

        <section>
          <h3>Getting good results</h3>
          <ul>
            <li>Calibrate once (Setup › Calibration) so levels read in true dB SPL, and measure the latency if you use delay or distance readings.</li>
            <li>Phone mics roll off at the frequency extremes and are not certified instruments. Use an external measurement mic for serious work.</li>
            <li>Measurements stop when the screen locks or the app is in the background. The app asks the phone to keep the screen on while the mic runs.</li>
            <li>Safari gives one input channel, so two-channel tools use this phone's own output as the reference.</li>
          </ul>
        </section>

        {GROUPS.map((g) => (
          <section key={g.id}>
            <h3>{g.title}</h3>
            {MODULES.filter((m) => m.group === g.id && m.id !== 'about').map((m) => (
              <button key={m.id} className="about-item" onClick={() => navigate(m.id)}>
                <span className="tile-icon small">
                  <Icon name={m.icon} size={20} />
                </span>
                <span>
                  <strong>{m.title}</strong>
                  <span className="about-help">{m.help}</span>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </ModuleScreen>
  );
}
