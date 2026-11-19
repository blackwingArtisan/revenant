import { HOUR, localParts, MINUTE, pad } from '../../engine/time';
import type { PagerApi } from '../usePager';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SPEEDS = [
  { value: 0, label: 'Pause' },
  { value: 1, label: '1x' },
  { value: 60, label: '60x' },
  { value: 900, label: '900x' },
];

export function TimeMachine({ pager }: { pager: PagerApi }) {
  const { controls, now, tz } = pager;
  const p = localParts(now, tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return (
    <section className="vcr" aria-labelledby="vcr-title">
      <div className="vcr-head">
        <h2 id="vcr-title" className="vcr-title">
          Time machine
        </h2>
        <span className="vcr-sub">Demo a whole day in about a minute.</span>
      </div>
      <div className="vcr-display" aria-live="off">
        <span className="vcr-date" data-testid="vcr-date">
          {DAYS[p.weekday]} {MONTHS[p.month - 1]} {p.day}
        </span>
        <time className="vcr-clock" dateTime={new Date(now).toISOString()} data-testid="vcr-clock">
          {h12}:{pad(p.minute)}
          <span className="vcr-sec">:{pad(p.second)}</span>
          <span className="vcr-ampm">{p.hour < 12 ? 'AM' : 'PM'}</span>
        </time>
        <span className={`vcr-play ${controls.speed > 0 ? 'vcr-play--on' : ''}`}>{controls.speed === 0 ? 'PAUSED' : `PLAY ${controls.speed}x`}</span>
      </div>
      <div className="vcr-row" role="group" aria-label="Jump ahead">
        <button type="button" className="vbtn" onClick={() => controls.advance(5 * MINUTE)}>
          +5 min
        </button>
        <button type="button" className="vbtn" onClick={() => controls.advance(15 * MINUTE)}>
          +15 min
        </button>
        <button type="button" className="vbtn" onClick={() => controls.advance(HOUR)}>
          +1 hr
        </button>
        <button type="button" className="vbtn vbtn--hot" onClick={controls.nextPage} aria-keyshortcuts="n" title="Jump to the next beep (N)">
          Next page
        </button>
      </div>
      <div className="vcr-row" role="radiogroup" aria-label="Clock speed">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={controls.speed === s.value}
            className={`vbtn vbtn--seg ${controls.speed === s.value ? 'vbtn--active' : ''}`}
            onClick={() => controls.setSpeed(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="vcr-row vcr-row--split">
        <button type="button" className="vbtn" onClick={controls.runDay}>
          Run the day from 6 AM
        </button>
        <button type="button" className="vbtn" onClick={controls.backToNow}>
          Back to now
        </button>
      </div>
      {controls.dayRun && controls.speed === 0 && (
        <p className="vcr-hint" data-testid="vcr-hint">
          Stopped on a page. Press ACK to keep the day running.
        </p>
      )}
      <label className="vcr-check">
        <input type="checkbox" checked={controls.stopOnBeep} onChange={(e) => controls.setStopOnBeep(e.target.checked)} />
        Pause when the pager goes off
      </label>
    </section>
  );
}
