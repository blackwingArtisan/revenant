import { readableClock } from '../../engine/time';
import type { DigestItem, PageStatus, PlannedPage } from '../../engine/types';
import type { PagerApi } from '../usePager';

const STATUS_LABEL: Record<PageStatus, string> = {
  scheduled: 'Armed',
  paging: 'Paging',
  acked: "ACK'd",
  missed: 'Missed',
};

const KIND_LABEL: Record<PlannedPage['kind'], string> = {
  'get-ready': 'Get ready',
  'leave-now': 'Leave now',
  'focus-start': 'Body double',
  'check-in': 'Check-in',
  'wrap-up': 'Wrap up',
  digest: 'Digest',
};

const REASON_LABEL: Record<DigestItem['reason'], string> = {
  'low-priority': 'Digest only',
  'over-budget': 'Over budget',
  'all-day': 'All day',
};

function BudgetMeter({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="budget" data-testid="budget">
      <span className="budget-label">Beeps today</span>
      <span className="budget-cells" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={`budget-cell ${i < used ? 'budget-cell--used' : ''}`} />
        ))}
      </span>
      <span className="budget-count">
        {used} of {limit}
      </span>
    </div>
  );
}

export function DaySheet({ pager }: { pager: PagerApi }) {
  const { today, tz, statusOf, commitments, places, plan } = pager;
  const placeName = (id: string | null) => (id ? (places.find((p) => p.id === id)?.name ?? 'Unknown place') : 'No travel');
  const onToday = commitments.filter((c) => c.start < pager.dayStart + 48 * 3_600_000 && c.end >= pager.dayStart);
  const tomorrow = plan.days[1];

  return (
    <section className="sheet" aria-labelledby="sheet-title" id="main" tabIndex={-1}>
      <div className="sheet-perf" aria-hidden="true" />
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id="sheet-title">Day sheet</h2>
          <BudgetMeter used={today.budget.used} limit={today.budget.limit} />
        </header>

        {today.pages.length === 0 ? (
          <div className="sheet-empty">
            <p>Nothing is armed for today. The pager will stay silent.</p>
            <button type="button" className="btn btn--primary" onClick={pager.loadSample}>
              Load a sample day
            </button>
          </div>
        ) : (
          <ol className="pages" aria-label="Pages planned for today">
            {today.pages.map((p) => {
              const status = statusOf(p);
              return (
                <li key={p.id} className={`page-row page-row--${status} ${p.silent ? 'page-row--silent' : ''}`} data-testid="page-row" data-page-id={p.id} data-status={status}>
                  <span className="page-when">
                    <time className="page-time">{readableClock(p.fireAt, tz)}</time>
                    <span className="page-code">{p.code}</span>
                  </span>
                  <span className="page-what">
                    <span className="page-kind">{KIND_LABEL[p.kind]}</span>
                    <span className="page-text">{p.text}</span>
                    {p.escalateAt.length > 0 && <span className="page-esc">repeats {p.escalateAt.length}x until ACK</span>}
                  </span>
                  <span className={`stamp stamp--${status}`}>{p.silent && status !== 'acked' ? (status === 'scheduled' ? 'Quiet' : 'Unread') : STATUS_LABEL[status]}</span>
                </li>
              );
            })}
          </ol>
        )}

        {today.digest.length > 0 && (
          <div className="digest" data-testid="digest">
            <h3>Quiet digest, no beep</h3>
            <ul>
              {today.digest.map((d) => (
                <li key={`${d.commitmentId}-${d.pageId ?? d.reason}`}>
                  <span className="digest-time">{d.kind === 'all-day' ? 'All day' : readableClock(d.at, tz)}</span>
                  <span className="digest-title">
                    {d.title}
                    {d.kind !== 'all-day' && d.kind !== 'leave-now' && d.reason === 'over-budget' ? ` (${KIND_LABEL[d.kind as PlannedPage['kind']].toLowerCase()})` : ''}
                  </span>
                  <span className="digest-reason">{REASON_LABEL[d.reason]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tomorrow && tomorrow.pages.length > 0 && (
          <p className="sheet-tomorrow">
            Tomorrow: {tomorrow.budget.used} beep{tomorrow.budget.used === 1 ? '' : 's'} armed, first at {readableClock(tomorrow.pages[0]!.fireAt, tz)}.
          </p>
        )}

        {onToday.length > 0 && (
          <details className="books">
            <summary>On the books ({onToday.length})</summary>
            <ul>
              {onToday.map((c) => (
                <li key={c.id}>
                  <span className="books-time">{c.allDay ? 'All day' : readableClock(c.start, tz)}</span>
                  <span className="books-title">
                    {c.title}
                    <span className="books-meta">
                      {c.kind === 'focus' ? `Focus block${c.checkInEveryMinutes ? `, check-in every ${c.checkInEveryMinutes} min` : ''}` : placeName(c.placeId)}
                      {' · '}
                      {c.priority === 'must' ? 'Must page' : c.priority === 'normal' ? 'Pages' : 'Digest only'}
                    </span>
                  </span>
                  <button type="button" className="btn btn--ghost" onClick={() => pager.removeCommitment(c.id)} aria-label={`Remove ${c.title}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
