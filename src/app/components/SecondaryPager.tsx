import { CODE_FOR, SECONDARY_LABEL } from '../../engine/codes';
import { lcdClock } from '../../engine/time';
import type { PagerApi } from '../usePager';

/**
 * The second line of defence: a small pager for the person on call. Hidden while escalation is
 * off and nothing is showing (Req 4.7). It pages once, on its own ACK, and never leaves the device.
 */
export function SecondaryPager({ pager }: { pager: PagerApi }) {
  const { onCall, active, page } = pager.secondary;
  if (!onCall && !active) return null;

  const name = (active?.secondaryName ?? onCall ?? '').toUpperCase();
  const status = page ? pager.statusOf(page) : null;
  const paging = active !== null;
  const missed = !paging && status === 'missed';
  const answered = !paging && status === 'acked';
  const state = paging ? 'paging' : missed ? 'missed' : 'idle';

  const code = paging ? active.code : CODE_FOR.escalation;
  const text = paging
    ? active.text
    : missed
      ? `MISSED: ${name} DID NOT ACK. ${page?.text ?? ''}`.trim()
      : answered
        ? `${name} ACK'D AT ${lcdClock(pager.runtime.acks[page!.id] ?? pager.now, pager.tz)}.`
        : `ON CALL: ${name}`;

  const label = paging
    ? `${SECONDARY_LABEL}. Paging: ${code}. ${text}`
    : missed
      ? `${SECONDARY_LABEL}. Missed. ${text}`
      : `${SECONDARY_LABEL}. ${text}`;

  return (
    <section className="secondary-wrap" aria-label={SECONDARY_LABEL} data-testid="secondary-pager" data-state={state}>
      <div className={`secondary secondary--${state}`}>
        <p className="secondary-label" data-testid="secondary-label">
          {SECONDARY_LABEL}
        </p>
        <div className="lcd" role="img" aria-label={label}>
          <div className="lcd-glass">
            <div className="lcd-main secondary-main">
              <span className="lcd-code secondary-code" data-testid="secondary-code">
                {paging ? code : missed ? code : '---'}
              </span>
              <span className="lcd-corner" data-testid="secondary-corner">
                {paging ? 'NEW' : missed ? 'MISSED' : ''}
              </span>
            </div>
            <p className="secondary-text" data-testid="secondary-text">
              {text}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="pbtn pbtn--ack secondary-ack"
          onClick={pager.ackSecondary}
          aria-keyshortcuts="s"
          aria-label={paging ? `Acknowledge secondary page ${code}` : 'Acknowledge secondary pager'}
          title="Acknowledge the secondary pager (S)"
          data-testid="secondary-ack"
        >
          ACK
        </button>
      </div>
    </section>
  );
}
