import { FaqList } from '../../components/FaqList';
import { ModuleScreen } from '../../components/ModuleScreen';
import { FAQ, FAQ_GROUPS } from '../../help/faq';
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

        <section aria-labelledby="faq-title">
          <h3 id="faq-title" className="faq-title">Questions</h3>
          {FAQ_GROUPS.map((g) => (
            <div key={g.id} className="faq-group">
              <h4>{g.title}</h4>
              <FaqList items={FAQ.filter((f) => f.group === g.id)} />
            </div>
          ))}
        </section>

        <h3 className="faq-title">Instruments</h3>
        {GROUPS.map((g) => (
          <section key={g.id}>
            <h4>{g.title}</h4>
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
