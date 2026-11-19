/**
 * The power-on sequence: the pager wakes up the way a 1990s pager did. A dark
 * LCD, the backlight flickering twice, every segment lit (88888), then 07734,
 * hELLO upside down. About two seconds, once per page load.
 *
 * Pure: the caller passes in the URL query and the motion preference.
 */
export type BootPhase = 'dark' | 'flicker' | 'segments' | 'hello';

/** Each phase with the time it starts, in milliseconds after load. */
export const BOOT_TIMELINE: readonly { phase: BootPhase; at: number }[] = [
  { phase: 'dark', at: 0 },
  { phase: 'flicker', at: 350 },
  { phase: 'segments', at: 800 },
  { phase: 'hello', at: 1300 },
];
export const BOOT_MS = 2100;

/** What the LCD's big digits show in each phase. */
export function bootCode(phase: BootPhase): string {
  if (phase === 'segments') return '88888';
  if (phase === 'hello') return '07734';
  return '';
}

/** The phase at a moment after load, or null once the sequence is over. */
export function bootPhaseAt(elapsedMs: number): BootPhase | null {
  if (elapsedMs < 0 || elapsedMs >= BOOT_MS) return null;
  let phase: BootPhase = 'dark';
  for (const step of BOOT_TIMELINE) if (elapsedMs >= step.at) phase = step.phase;
  return phase;
}

/**
 * Whether to play the sequence. `?boot` asks for it. Otherwise it plays on a
 * plain visit, and never on the switches tests and demos use (`?at`, `?fresh`,
 * `?sample`, `?speed`) or for automated browsers, so they start on a ready
 * pager. Reduced motion always wins.
 */
export function shouldBoot(search: string, opts: { reducedMotion: boolean; automated: boolean }): boolean {
  if (opts.reducedMotion) return false;
  const params = new URLSearchParams(search);
  if (params.has('boot')) return true;
  if (opts.automated) return false;
  return !['at', 'fresh', 'sample', 'speed'].some((k) => params.has(k));
}
