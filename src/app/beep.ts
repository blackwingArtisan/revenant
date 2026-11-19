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

export function beep(level: number, volume = 0.18): void {
  const c = context();
  if (!c) return;
  try {
    const bursts = 3 + Math.min(level, 3) * 2;
    const start = c.currentTime + 0.02;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = level > 0 ? 3200 : 2900;
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
