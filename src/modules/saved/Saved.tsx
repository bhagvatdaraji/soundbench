import { Icon } from '../../components/Icon';
import { ModuleScreen } from '../../components/ModuleScreen';
import { fileSafe, measurementCsv } from '../../export/csv';
import { shareOrDownload } from '../../export/share';
import { deleteMeasurement, renameMeasurement, useMeasurements, type Measurement } from '../../store/measurements';

const MODULE_LABEL: Record<string, string> = { rta: 'RTA', fft: 'FFT', spl: 'SPL Meter', logger: 'SPL Logger', soundscope: 'SoundScope' };

export function Saved() {
  const items = useMeasurements();

  const exportCsv = (m: Measurement) =>
    void shareOrDownload(new Blob([measurementCsv(m)], { type: 'text/csv' }), `${fileSafe(m.name)}.csv`);
  const rename = (m: Measurement) => {
    const name = window.prompt('Rename measurement', m.name);
    if (name && name.trim()) void renameMeasurement(m.id, name.trim());
  };
  const remove = (m: Measurement) => {
    if (window.confirm(`Delete “${m.name}”?`)) void deleteMeasurement(m.id);
  };

  return (
    <ModuleScreen title="Saved" showCalBadge={false}>
      <div className="saved">
        {items.length === 0 ? (
          <p className="saved-empty">
            Nothing saved yet.
            <br />
            Use the Save button in the RTA, FFT or SPL Meter toolbar.
          </p>
        ) : (
          items.map((m) => (
            <article key={m.id} className="saved-item">
              {m.thumbnail ? <img className="saved-thumb" src={m.thumbnail} alt="" /> : <div className="saved-thumb" />}
              <div>
                <div className="saved-name">{m.name}</div>
                <div className="saved-meta">
                  {MODULE_LABEL[m.module] ?? m.module} · {new Date(m.createdAt).toLocaleString()}
                </div>
                <div className="saved-actions">
                  <button className="icon-btn" onClick={() => exportCsv(m)} aria-label={`Export ${m.name} as CSV`} title="Export CSV">
                    <Icon name="share" size={20} />
                  </button>
                  <button className="icon-btn" onClick={() => rename(m)} aria-label={`Rename ${m.name}`} title="Rename">
                    <Icon name="edit" size={20} />
                  </button>
                  <button className="icon-btn" onClick={() => remove(m)} aria-label={`Delete ${m.name}`} title="Delete">
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </ModuleScreen>
  );
}
