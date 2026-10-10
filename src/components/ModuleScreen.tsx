import { useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { faqFor } from '../help/faq';
import { STEPS } from '../help/steps';
import { navigate, useRoute } from '../router';
import { useCalibration } from '../store/calibration';
import { FaqList } from './FaqList';
import { Icon } from './Icon';
import { Sheet } from './ui';

/**
 * Standard instrument layout: top bar, main content, and a toolbar that sits at the
 * bottom in portrait and on the right in landscape.
 */
export function ModuleScreen({
  title,
  chips,
  tools,
  children,
  showCalBadge = true,
}: {
  title: string;
  chips?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  showCalBadge?: boolean;
}) {
  const cal = useCalibration();
  const route = useRoute();
  const [help, setHelp] = useState(false);
  const steps = STEPS[route];
  const faq = faqFor(route);
  const hasHelp = !!steps || faq.length > 0;
  return (
    <div className="module">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('')} aria-label="Back to instruments">
          <Icon name="back" />
        </button>
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-chips">{chips}</div>
        {engine.loopback && <span className="loop-badge" title="Simulated microphone (test mode)">LOOPBACK · {engine.loopback}</span>}
        {showCalBadge && !cal.calibratedAt && !engine.loopback && (
          <button className="cal-badge" onClick={() => navigate('calibration')}>
            Uncalibrated
          </button>
        )}
        {hasHelp && (
          <button className="icon-btn help-btn" onClick={() => setHelp(true)} aria-label={`How to use ${title}`}>
            <Icon name="info" size={20} />
          </button>
        )}
      </header>
      <main className="module-main">{children}</main>
      {tools && <nav className="toolbar">{tools}</nav>}
      <Sheet open={help} title={title} onClose={() => setHelp(false)}>
        {steps && (
          <ol className="help-steps">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {faq.length > 0 && <FaqList items={faq} />}
        <button
          className="help-more"
          onClick={() => {
            setHelp(false);
            navigate('about');
          }}
        >
          All questions & help
        </button>
      </Sheet>
    </div>
  );
}
