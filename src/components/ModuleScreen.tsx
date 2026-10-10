import type { ReactNode } from 'react';
import { useCalibration } from '../store/calibration';
import { Icon } from './Icon';
import { navigate } from '../router';

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
  return (
    <div className="module">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('')} aria-label="Back to instruments">
          <Icon name="back" />
        </button>
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-chips">{chips}</div>
        {showCalBadge && !cal.calibratedAt && (
          <button className="cal-badge" onClick={() => navigate('calibration')}>
            Uncalibrated
          </button>
        )}
      </header>
      <main className="module-main">{children}</main>
      {tools && <nav className="toolbar">{tools}</nav>}
    </div>
  );
}
