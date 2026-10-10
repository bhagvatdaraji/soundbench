import { useEffect, useState, type MutableRefObject } from 'react';
import { fileSafe, measurementCsv } from '../export/csv';
import { canvasBlob, composeImage, shareOrDownload, thumbnail } from '../export/share';
import { defaultName, newId, saveMeasurement, useMeasurements, type Measurement, type MeasurementData } from '../store/measurements';
import { Field, Sheet } from './ui';

export interface Snapshot {
  data: MeasurementData;
  settings: Record<string, unknown>;
  /** Readout lines printed on exported images. */
  lines: string[];
}

/**
 * Save / export sheet shared by instruments: save a snapshot, export CSV or PNG,
 * and (for curves) pick a saved measurement to overlay as a reference.
 */
export function MeasurementSheet({
  open,
  onClose,
  module,
  title,
  snapshot,
  canvas,
  reference,
}: {
  open: boolean;
  onClose: () => void;
  module: string;
  title: string;
  snapshot: () => Snapshot | null;
  canvas?: MutableRefObject<HTMLCanvasElement | null>;
  reference?: { id: string | null; set: (id: string | null) => void };
}) {
  const saved = useMeasurements(module);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (open) {
      setName(defaultName(title));
      setStatus('');
    }
  }, [open, title]);

  const build = (): Measurement | null => {
    const snap = snapshot();
    if (!snap) {
      setStatus('Nothing measured yet. Start the microphone first.');
      return null;
    }
    return {
      id: newId(),
      module,
      name: name.trim() || defaultName(title),
      createdAt: new Date().toISOString(),
      settings: snap.settings,
      data: snap.data,
      thumbnail: canvas?.current ? thumbnail(canvas.current) : undefined,
    };
  };

  const save = async () => {
    const m = build();
    if (!m) return;
    await saveMeasurement(m);
    setStatus(`Saved “${m.name}”.`);
  };

  const exportCsv = async () => {
    const m = build();
    if (!m) return;
    await shareOrDownload(new Blob([measurementCsv(m)], { type: 'text/csv' }), `${fileSafe(m.name)}.csv`);
  };

  const exportPng = async () => {
    const snap = snapshot();
    if (!canvas?.current) return;
    const img = composeImage(canvas.current, name || title, snap?.lines ?? []);
    await shareOrDownload(await canvasBlob(img), `${fileSafe(name || title)}.png`);
  };

  return (
    <Sheet open={open} title="Save & export" onClose={onClose}>
      <Field label="Name">
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Measurement name" />
      </Field>
      <div className="sheet-actions">
        <button className="btn primary" onClick={() => void save()}>Save snapshot</button>
        <button className="btn" onClick={() => void exportCsv()}>Export CSV</button>
        {canvas && <button className="btn" onClick={() => void exportPng()}>Export image</button>}
      </div>
      {status && <p className="sheet-status" role="status">{status}</p>}

      {reference && (
        <Field label="Reference trace" hint="Shows a saved measurement behind the live one, in blue.">
          {saved.filter((m) => m.data.kind === 'curve').length === 0 ? (
            <p className="field-hint">No saved {title} measurements yet.</p>
          ) : (
            <div className="ref-list" role="radiogroup" aria-label="Reference trace">
              <button role="radio" aria-checked={!reference.id} className={!reference.id ? 'ref-item on' : 'ref-item'} onClick={() => reference.set(null)}>
                None
              </button>
              {saved
                .filter((m) => m.data.kind === 'curve')
                .map((m) => (
                  <button key={m.id} role="radio" aria-checked={reference.id === m.id} className={reference.id === m.id ? 'ref-item on' : 'ref-item'} onClick={() => reference.set(m.id)}>
                    {m.name}
                  </button>
                ))}
            </div>
          )}
        </Field>
      )}
    </Sheet>
  );
}

/** The saved curve for a reference id, if it still exists. */
export function useReferenceCurve(module: string, id: string | null) {
  const saved = useMeasurements(module);
  const m = id ? saved.find((x) => x.id === id) : undefined;
  return m && m.data.kind === 'curve' ? m.data : null;
}
