import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AddForm } from './components/AddForm';
import { BeforeAfter } from './components/BeforeAfter';
import { CodeCard } from './components/CodeCard';
import { DaySheet } from './components/DaySheet';
import { ImportPanel } from './components/ImportPanel';
import { Pager } from './components/Pager';
import { SecondaryPager } from './components/SecondaryPager';
import { SettingsPanel } from './components/SettingsPanel';
import { TimeMachine } from './components/TimeMachine';
import { useBoot } from './useBoot';
import { usePager } from './usePager';

const TABS = [
  { id: 'add', label: 'Add' },
  { id: 'import', label: 'Import .ics' },
  { id: 'settings', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
}

export default function App() {
  const pager = usePager();
  const boot = useBoot(pager.sound);
  const [tab, setTab] = useState<TabId>('add');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'a') pager.ack();
      else if (k === 's') pager.ackSecondary();
      else if (k === 'r') pager.read();
      else if (k === 'm') pager.setSound(!pager.sound);
      else if (k === 'n') pager.controls.nextPage();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pager]);

  useEffect(() => {
    const top = pager.active[0];
    document.title = top && !top.silent ? `${top.code} · Revenant` : 'Revenant · the pager, back from the dead';
  }, [pager.active]);

  function onTabKey(e: ReactKeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className={`app${pager.haunting ? ' app--haunted' : ''}`}>
      {pager.active[0] && !pager.active[0].silent && pager.active[0].code.startsWith('911') && pager.readIndex === null && (
        <div className="alarm" data-testid="alarm" aria-hidden="true" />
      )}
      <a href="#main" className="skip">
        Skip to the day sheet
      </a>
      <div className="fog" aria-hidden="true">
        <span className="fog-a" />
        <span className="fog-b" />
      </div>
      <header className="masthead">
        <h1 className="logo">
          Revenant<span className="logo-dot">.</span>
        </h1>
        <p className="tagline">
          The pager, back from the dead for ADHD brains. It only goes off when you need to <em>act</em>.
        </p>
        <div className="hero">
          <button type="button" className={`cta${boot.booted ? ' cta--wake' : ''}`} onClick={pager.demoDay} data-testid="demo-cta">
            <span className="cta-led" aria-hidden="true" />
            Watch a day (60 s)
          </button>
          <p className="why" data-testid="hero-stat">
            <strong>42%</strong> of patients in an adult ADHD clinic missed three or more appointments (
            <a href="https://doi.org/10.4088/JCP.14m09270" rel="noreferrer">
              Soendergaard et al., 2016
            </a>
            ). The calendar is rarely the problem. The moment to stand up is.
          </p>
        </div>
      </header>

      <main className={`layout${pager.controls.dayRun ? ' layout--running' : ''}`}>
        <div className="col col--device">
          <Pager pager={pager} boot={boot.phase} />
          <SecondaryPager pager={pager} />
          <p className="keys">
            Keys: <kbd>A</kbd> ACK · <kbd>S</kbd> ACK secondary · <kbd>R</kbd> read memory · <kbd>M</kbd> mute · <kbd>N</kbd> next page
          </p>
          <TimeMachine pager={pager} />
          <CodeCard />
        </div>

        <div className="col col--work">
          <BeforeAfter pager={pager} />
          <DaySheet pager={pager} />
          <section className="console" aria-label="Plan your day">
            <div className="tabs" role="tablist" aria-label="Console" onKeyDown={onTabKey}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  role="tab"
                  type="button"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  className={`tab ${tab === t.id ? 'tab--on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
              {tab === 'add' && <AddForm pager={pager} />}
              {tab === 'import' && <ImportPanel pager={pager} />}
              {tab === 'settings' && <SettingsPanel pager={pager} />}
            </div>
          </section>
        </div>
      </main>

      <footer className="foot">
        <p>
          Runs entirely in your browser. No account, no tracking. Made by Stubborn Otter Software for Kiroween 2026. MIT licensed.
        </p>
      </footer>
    </div>
  );
}
