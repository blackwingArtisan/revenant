import { useEffect, useState } from 'react';
import { BOOT_MS, BOOT_TIMELINE, shouldBoot, type BootPhase } from './boot';
import { beep } from './beep';

function wantsBoot(): boolean {
  if (typeof window === 'undefined') return false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return shouldBoot(window.location.search, { reducedMotion, automated: navigator.webdriver === true });
}

/**
 * Runs the power-on sequence once per load. Returns the current phase (null
 * when it is over or skipped) and whether it ran, so the CTA can wake after it.
 */
export function useBoot(sound: boolean): { phase: BootPhase | null; booted: boolean } {
  const [ran] = useState(wantsBoot);
  const [phase, setPhase] = useState<BootPhase | null>(ran ? 'dark' : null);
  useEffect(() => {
    if (!ran) return;
    const timers = BOOT_TIMELINE.slice(1).map((step) => window.setTimeout(() => setPhase(step.phase), step.at));
    timers.push(window.setTimeout(() => setPhase(null), BOOT_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [ran]);
  useEffect(() => {
    // One chirp on hELLO. Browsers keep audio locked until the first tap, so on a cold load this is often silent.
    if (phase === 'hello' && sound) beep(0, 0.1);
    // Only a phase change chirps, not a later mute toggle, so `sound` is read but not a dependency.
  }, [phase]);
  return { phase, booted: ran && phase === null };
}
