import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { BOOT_CODE, MISSED_CODE } from '../../engine/codes';
import { lcdClock, readableClock } from '../../engine/time';
import type { PagerApi } from '../usePager';

function Bell({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="lcd-icon">
      <path d="M8 1.5c-2.3 0-4 1.8-4 4.2v3.2L2.6 11v1h10.8v-1L12 8.9V5.7c0-2.4-1.7-4.2-4-4.2Zm-1.6 11.3a1.7 1.7 0 0 0 3.2 0Z" fill="currentColor" />
      {muted && <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  );
}

function Envelope() {
  return (
    <svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true" className="lcd-icon">
      <path d="M1 1h14v10H1Z M1 1l7 5.5L15 1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Battery() {
  return (
    <svg viewBox="0 0 22 10" width="20" height="9" aria-hidden="true" className="lcd-icon">
      <path d="M1 1h17v8H1Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M19 3.5h2v3h-2Z M3 3h4v4H3Z M8 3h4v4H8Z M13 3h3v4h-3Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The message line. Text that fits sits still; a longer message shows its
 * start first, holds, then scrolls to its end like a pager's LCD.
 */
function Ticker({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const line = textRef.current;
    if (!box || !line) return;
    const measure = () => setOverflow(Math.max(0, Math.ceil(line.scrollWidth - box.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(line);
    return () => ro.disconnect();
  }, [text]);
  const scrolls = overflow > 2;
  // About 45 px a second while moving; the moving part is 60% of the loop.
  const style = scrolls
    ? ({ '--ticker-shift': `-${overflow}px`, '--ticker-time': `${Math.max(5, overflow / 45 / 0.6).toFixed(1)}s` } as CSSProperties)
    : undefined;
  return (
    <div ref={boxRef} className="lcd-ticker" data-scroll={scrolls ? 'true' : undefined} style={style}>
      <span key={text} ref={textRef} className="lcd-text" data-testid="lcd-text">
        {text}
      </span>
    </div>
  );
}

/** True while the element is scrolled out of view. */
function useOffscreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry?.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, offscreen] as const;
}

export function Pager({ pager }: { pager: PagerApi }) {
  const { shown, active, readIndex, memory, now, tz, sound } = pager;
  const [deviceRef, offscreen] = useOffscreen<HTMLDivElement>();
  const paging = active.length > 0 && readIndex === null;
  const top = active[0];
  const loud = paging && top !== undefined && !top.silent;
  const memoryStatus = readIndex !== null && shown ? (pager.runtime.acks[shown.pageId] !== undefined ? 'ACK' : 'NEW') : null;

  const state = readIndex !== null ? 'reading' : paging ? (loud ? 'paging' : 'quiet') : 'idle';
  const level = shown?.level ?? 0;

  let code = '';
  let text = '';
  let corner = '';
  if (readIndex !== null && shown) {
    const missed = pager.runtime.acks[shown.pageId] === undefined && !active.some((p) => p.id === shown.pageId);
    code = missed && !shown.silent ? MISSED_CODE : shown.code;
    text = `${missed && !shown.silent ? 'MISSED: ' : ''}${shown.text}`;
    corner = `${readIndex + 1}/${memory.length} ${lcdClock(shown.receivedAt, tz)} ${memoryStatus}`;
  } else if (paging && shown) {
    code = shown.code;
    text = shown.text;
    corner = shown.silent ? 'QUIET' : level > 0 ? `x${level + 1}` : 'NEW';
  } else if (paging && top) {
    code = top.code;
    text = top.text;
    corner = 'NEW';
  } else {
    code = lcdClock(now, tz);
    const next = pager.next;
    text = memory.length === 0 && pager.commitments.length === 0 ? `${BOOT_CODE} = hELLO. ADD A PLAN TO ARM THE PAGER.` : next ? `NEXT PAGE ${lcdClock(next, tz)}. ALL QUIET.` : 'ALL QUIET. NOTHING NEEDS YOU.';
    corner = '';
  }
  const unread = active.length;
  const ghost = memory[readIndex === null ? (paging ? 1 : 0) : readIndex + 1]?.code ?? '';

  const label = paging
    ? `Pager is paging: ${code}. ${text}`
    : readIndex !== null
      ? `Message ${readIndex + 1} of ${memory.length}: ${code}. ${text}`
      : `Pager idle. ${readableClock(now, tz)}. ${text}`;

  return (
    <section className="pager-wrap" aria-label="Pager">
      <div ref={deviceRef} className={`pager pager--${state}`} data-state={state} data-beeps={pager.beeps} data-level={level}>
        <div className="pager-clip" aria-hidden="true" />
        <div className="pager-top">
          <span className={`pager-led ${loud ? 'pager-led--on' : ''}`} aria-hidden="true" />
          <span className="pager-brand">REVENANT</span>
          <span className="pager-model">RV-911</span>
        </div>
        <div className="lcd" role="img" aria-label={label}>
          <div className="lcd-glass">
            <div className="lcd-status">
              <span className="lcd-status-left">
                <Bell muted={!sound} />
                {unread > 0 && (
                  <span className="lcd-count">
                    <Envelope /> {unread}
                  </span>
                )}
              </span>
              <span className="lcd-status-right">
                <span>{lcdClock(now, tz)}</span>
                <Battery />
              </span>
            </div>
            <div className="lcd-main">
              <span className="lcd-ghost" aria-hidden="true">
                {ghost}
              </span>
              <span className="lcd-code" data-testid="lcd-code">
                {code}
              </span>
              <span className="lcd-corner" data-testid="lcd-corner">
                {corner}
              </span>
            </div>
            <Ticker text={text} />
          </div>
        </div>
        <div className="pager-buttons">
          <button type="button" className="pbtn pbtn--small" onClick={pager.read} aria-keyshortcuts="r" title="Read stored pages (R)">
            READ
          </button>
          <button
            type="button"
            className="pbtn pbtn--ack"
            onClick={() => pager.ack()}
            aria-keyshortcuts="a"
            aria-label={paging ? `Acknowledge page ${code}` : 'Acknowledge'}
            title="Acknowledge (A)"
          >
            ACK
          </button>
          <button
            type="button"
            className="pbtn pbtn--small"
            onClick={() => pager.setSound(!sound)}
            aria-pressed={!sound}
            aria-keyshortcuts="m"
            title="Mute the beep (M)"
          >
            {sound ? 'MUTE' : 'SOUND'}
          </button>
        </div>
      </div>
      {loud && offscreen && (
        <div className={`dock dock--${state}`} data-testid="dock">
          <span className="dock-code">{code}</span>
          <span className="dock-text">{text}</span>
          <button type="button" className="pbtn pbtn--ack dock-ack" onClick={() => pager.ack()} aria-label={`Acknowledge page ${code} from the dock`}>
            ACK
          </button>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="assertive" data-testid="announcer">
        {pager.announcement}
      </p>
    </section>
  );
}

