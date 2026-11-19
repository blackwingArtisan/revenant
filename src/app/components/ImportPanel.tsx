import { useState, type DragEvent } from 'react';
import { sampleIcs } from '../../engine/sample-ics';
import type { PagerApi } from '../usePager';

const MAX_BYTES = 2_000_000;

export function ImportPanel({ pager }: { pager: PagerApi }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const report = pager.importReport;

  async function readFile(file: File) {
    setError('');
    if (file.size > MAX_BYTES) return setError('That file is over 2 MB. Export a shorter date range.');
    pager.importIcs(await file.text(), file.name);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void readFile(file);
  }

  return (
    <div className="import">
      <p className="form-hint">
        Export your calendar as an .ics file (Google, Apple and Outlook all can). It is read here in the browser and never uploaded.
      </p>
      <label
        className={`drop ${dragging ? 'drop--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          data-testid="ics-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = '';
          }}
        />
        <span className="drop-title">Drop an .ics file here</span>
        <span className="drop-sub">or press to choose one</span>
      </label>
      <button type="button" className="btn" onClick={() => pager.importIcs(sampleIcs(pager.dayKey, pager.tz), 'sample-calendar.ics')}>
        Try a sample calendar
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div role="status" className="form-result" data-testid="import-result">
        {report && (
          <>
            Imported {report.imported} event{report.imported === 1 ? '' : 's'} from {report.fileName}
            {report.newPlaces > 0 ? `, ${report.newPlaces} new place${report.newPlaces === 1 ? '' : 's'}` : ''}. Re-importing updates them in place.
            {report.warnings.length > 0 && (
              <ul className="warnings">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
