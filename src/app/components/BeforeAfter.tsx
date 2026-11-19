import { MAYA, mayaMorning } from '../../engine/compare';
import { readableClock } from '../../engine/time';
import type { PagerApi } from '../usePager';

/**
 * One illustrative morning, worked out by the engine: the same dentist
 * appointment with an ordinary 15-minute reminder, with a time-to-leave alert
 * and with Revenant.
 */
export function BeforeAfter({ pager }: { pager: PagerApi }) {
  const { settings, dayKey, tz } = pager;
  const m = mayaMorning(dayKey, settings);
  const t = (ms: number) => readableClock(ms, tz);
  const start = readableClock(m.arriveAt + settings.bufferMinutes * 60_000, tz);
  return (
    <section className="ba" aria-labelledby="ba-title" data-testid="before-after">
      <h2 id="ba-title" className="ba-title">
        Maya, {MAYA.age} <span className="ba-tag">illustrative</span>
      </h2>
      <p className="ba-setup">
        {MAYA.title} at {start}, {MAYA.travelMinutes} min away. She says getting ready takes {MAYA.prepMinutes} min.
      </p>
      <div className="ba-cols">
        <div className="ba-col ba-col--phone">
          <p className="ba-col-head">Her phone</p>
          <p>
            <span className="ba-time">{t(m.phoneAlertAt)}</span> "{MAYA.title} in {MAYA.phoneLeadMinutes} min"
          </p>
          <p>
            Out the door {t(m.phoneLeaveAt)}. <strong>{m.phoneLateMinutes} min late.</strong>
          </p>
        </div>
        <div className="ba-col ba-col--phone" data-testid="ba-leave-alert">
          <p className="ba-col-head">Apple time-to-leave</p>
          <p>
            <span className="ba-time">{t(m.leaveAlertAt)}</span> "Time to leave"
          </p>
          <p>
            Prep starts then: out {t(m.leaveAlertLeaveAt)}. <strong>{m.leaveAlertLateMinutes} min late.</strong>
          </p>
        </div>
        <div className="ba-col ba-col--pager">
          <p className="ba-col-head">Revenant</p>
          <p>
            <span className="ba-time">{t(m.readyAt)}</span> <code>411</code> get ready
          </p>
          <p>
            <span className="ba-time">{t(m.leaveAt)}</span> <code>911</code> leave now. <strong>{m.earlyMinutes} min early.</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
