/**
 * The pager chirp, synthesized with Web Audio: a square wave near 3 kHz in
 * short bursts. Escalation levels beep longer. No audio files.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers only allow sound after a user gesture; call this from any click. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** Bursts per chirp: 3 on the first beep, 2 more per escalation level, at most 9. */
export function chirpBursts(level: number): number {
  return 3 + Math.min(Math.max(0, level), 3) * 2;
}

/** The chirp's rhythm as a vibration pattern: 110 ms on, 80 ms off, per burst. */
export function vibrationPattern(level: number): number[] {
  const pattern: number[] = [];
  for (let i = 0; i < chirpBursts(level); i++) pattern.push(...(i === 0 ? [110] : [80, 110]));
  return pattern;
}

/** Buzz in the chirp's rhythm where the device can vibrate (most Android phones; not iOS Safari). */
export function vibrate(level: number): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(vibrationPattern(level));
  } catch {
    // vibration is a nicety too
  }
}

/** The secondary pager's chirp: one level-0 chirp, lower than the owner's so a shared screen tells them apart. */
export const SECONDARY_PITCH = 1900;

export function beep(level: number, volume = 0.18, pitch?: number): void {
  const c = context();
  if (!c) return;
  try {
    const bursts = chirpBursts(level);
    const start = c.currentTime + 0.02;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = pitch ?? (level > 0 ? 3200 : 2900);
    osc.connect(gain);
    for (let i = 0; i < bursts; i++) {
      const t = start + i * 0.19;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.setValueAtTime(0, t + 0.11);
    }
    osc.start(start);
    osc.stop(start + bursts * 0.19 + 0.05);
  } catch {
    // audio is a nicety; the LCD and notification still page
  }
}
