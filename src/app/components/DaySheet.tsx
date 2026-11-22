import { dayReportLine, silenceLine, type DayReport } from '../../engine/report';
import { localDayKey, parseDayKey, readableClock } from '../../engine/time';
import type { DigestItem, PageStatus, PlannedPage } from '../../engine/types';
import type { PagerApi } from '../usePager';
import { Fragment } from 'react';
import { PrepAdvice } from './PrepAdvice';

function NowLine({ label }: { label: string }) {
  return (
    <li className="now-line" data-testid="now-line" aria-hidden="true">
      <span>NOW {label}</span>
    </li>
  );
}

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
  escalation: 'Secondary on call',
};

const REASON_LABEL: Record<DigestItem['reason'], string> = {
  'low-priority': 'Digest only',
  'over-budget': 'Over budget',
  'all-day': 'All day',
};

/** "THU NOV 19", printed at the top of the receipt. */
function receiptDate(r: DayReport): string {
  const { year, month, day } = parseDayKey(r.dayKey);
  return new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .replace(',', '')
    .toUpperCase();
}

function EndCard({ pager }: { pager: PagerApi }) {
  const r = pager.endCard;
  if (!r) return null;
  return (
    <section className="receipt" aria-labelledby="receipt-title" data-testid="day-report">
      <div className="receipt-paper">
        <h3 id="receipt-title">End of day</h3>
        <p className="receipt-meta">REVENANT RV-911 · {receiptDate(r)}</p>
        <dl className="receipt-items">
          <div>
            <dt>Beeps</dt>
            <dd>
              {r.beeps} of {r.budget}
            </dd>
          </div>
          <div>
            <dt>First-beep ACKs</dt>
            <dd>{r.firstBeep}</dd>
          </div>
          <div>
            <dt>Kept quiet</dt>
            <dd>{r.keptQuiet}</dd>
          </div>
          <div>
            <dt>Missed</dt>
            <dd>{r.missed}</dd>
          </div>
        </dl>
        <p className="receipt-line" data-testid="day-report-line">
          {dayReportLine(r)}
        </p>
        <p className="receipt-silence" data-testid="silence-line">
          {silenceLine(r)}
        </p>
        <p className="receipt-sub">
          {r.firstBeep} of {r.beeps} answered on the first beep.
        </p>
        <span className={`receipt-stamp ${r.missed === 0 ? 'receipt-stamp--clean' : 'receipt-stamp--rip'}`}>
          {r.missed === 0 ? '0 missed' : `${r.missed} RIP`}
        </span>
      </div>
      <span className="advice-actions">
        <button type="button" className="btn btn--primary" onClick={pager.controls.runDay}>
          Run the day again
        </button>
        {r.missed === 0 && (
          <button type="button" className="btn btn--ghost" onClick={pager.ignoreIt} data-testid="ignore-it">
            See what happens if you ignore it
          </button>
        )}
        <button type="button" className="btn" onClick={pager.closeEndCard}>
          Close
        </button>
      </span>
    </section>
  );
}

/** The night of a day with missed pages: the haunting, and the way to the next morning. */
function HauntCard({ pager }: { pager: PagerApi }) {
  const h = pager.todayHaunt;
  if (!h || pager.controls.dayRun) return null;
  return (
    <section className="advice advice--haunt" aria-labelledby="haunt-title" data-testid="haunt-card">
      <h3 id="haunt-title">It comes back</h3>
      <p>
        {h.pageIds.length === 1 ? 'One page' : `${h.pageIds.length} pages`} slipped today. Pages you ignore do not just disappear: they come back
        tomorrow morning as a <code>666</code> asking you to rebook.
      </p>
      <span className="advice-actions">
        <button type="button" className="btn btn--primary" onClick={pager.nextMorning} data-testid="next-morning">
          See the next morning
        </button>
      </span>
    </section>
  );
}

/** The morning after: the 666 rebook page waits for an answer. */
function RebookCard({ pager }: { pager: PagerApi }) {
  const r = pager.rebookAsk;
  if (!r) return null;
  const titles = r.commitmentIds.map((id) => pager.commitments.find((c) => c.id === id)?.title ?? 'A page');
  return (
    <section className="advice advice--haunt" aria-labelledby="rebook-title" data-testid="rebook-card">
      <h3 id="rebook-title">666: yesterday slipped</h3>
      <p>
        <strong>{titles.join(', ')}</strong> {titles.length === 1 ? 'was' : 'were'} missed yesterday. Rebook books a 15-minute call to fix{' '}
        {titles.length === 1 ? 'it' : 'each one'}, paged as <code>121</code>.
      </p>
      <span className="advice-actions">
        <button type="button" className="btn btn--primary" onClick={() => pager.answerRebook(r, 'rebook')}>
          Rebook
        </button>
        <button type="button" className="btn" onClick={() => pager.answerRebook(r, 'let-go')}>
          Let it go
        </button>
      </span>
    </section>
  );
}

function BudgetMeter({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="budget" data-testid="budget">
      <span className="budget-label">Silence budget</span>
      <span className="budget-cells" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={`budget-cell ${i < used ? 'budget-cell--used' : ''}`} />
        ))}
      </span>
      <span className="budget-count">
        {used} of {limit} beeps
      </span>
    </div>
  );
}

export function DaySheet({ pager }: { pager: PagerApi }) {
  const { today, tz, statusOf, commitments, places, plan } = pager;
  // A red line marks "now" between the pages already fired and the ones still ahead.
  const isToday = localDayKey(pager.now, tz) === today.dayKey;
  const firstAhead = today.pages.findIndex((p) => p.fireAt > pager.now);
  const nowAt = !isToday ? -1 : firstAhead === -1 ? today.pages.length : firstAhead;
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

        <EndCard pager={pager} />
        <RebookCard pager={pager} />
        <HauntCard pager={pager} />
        <PrepAdvice pager={pager} />

        {today.pages.length === 0 ? (
          <div className="sheet-empty">
            <p>Nothing is armed for today. The pager will stay silent.</p>
            <button type="button" className="btn btn--primary" onClick={pager.loadSample}>
              Load a sample day
            </button>
          </div>
        ) : (
          <ol className="pages" aria-label="Pages planned for today">
            {today.pages.map((p, i) => {
              const status = statusOf(p);
              return (
                <Fragment key={p.id}>
                  {i === nowAt && <NowLine label={readableClock(pager.now, tz)} />}
                  <li className={`page-row page-row--${status} ${p.silent ? 'page-row--silent' : ''}`} data-testid="page-row" data-page-id={p.id} data-status={status}>
                    <span className="page-when">
                      <time className="page-time">{readableClock(p.fireAt, tz)}</time>
                      <span className="page-code">{p.code}</span>
                    </span>
                    <span className="page-what">
                      <span className="page-kind">{KIND_LABEL[p.kind]}</span>
                      <span className="page-text">{p.text}</span>
                      {p.escalateAt.length > 0 && <span className="page-esc">repeats {p.escalateAt.length}x until ACK</span>}
                    </span>
                    {status === 'missed' && !p.silent ? (
                      <span className="rip">
                        <span className="stamp stamp--missed" data-testid="rip">
                          <span className="sr-only">Missed. </span>RIP {readableClock(p.fireAt, tz).replace(/ (AM|PM)$/, '')}
                        </span>
                        {p.countsToBudget && p.commitmentId && (
                          <button type="button" className="btn btn--tiny" onClick={() => pager.resurrect(p.commitmentId!, p.dayKey)} aria-label={`Resurrect: book a call to rebook ${p.text}`}>
                            Resurrect
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className={`stamp stamp--${status}`}>{p.silent && status !== 'acked' ? (status === 'scheduled' ? 'Quiet' : 'Unread') : STATUS_LABEL[status]}</span>
                    )}
                  </li>
                </Fragment>
              );
            })}
            {nowAt === today.pages.length && <NowLine label={readableClock(pager.now, tz)} />}
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
