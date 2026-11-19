import { describe, expect, it } from 'vitest';
import { BOOT_MS, BOOT_TIMELINE, bootCode, bootPhaseAt, shouldBoot } from '../../src/app/boot';
import { chirpBursts, vibrationPattern } from '../../src/app/beep';

describe('power-on sequence', () => {
  const plain = { reducedMotion: false, automated: false };

  it('plays on a plain visit', () => {
    expect(shouldBoot('', plain)).toBe(true);
    expect(shouldBoot('?tz=America/Chicago', plain)).toBe(true);
  });

  it('skips the switches tests and demos use, so they start on a ready pager', () => {
    for (const q of ['?at=2026-11-19T06:00', '?fresh', '?sample', '?speed=900', '?fresh&at=2026-11-19T05:00']) {
      expect(shouldBoot(q, plain)).toBe(false);
    }
    expect(shouldBoot('', { reducedMotion: false, automated: true })).toBe(false);
  });

  it('plays on request with ?boot, but never under reduced motion', () => {
    expect(shouldBoot('?fresh&boot', { reducedMotion: false, automated: true })).toBe(true);
    expect(shouldBoot('?boot', { reducedMotion: true, automated: false })).toBe(false);
    expect(shouldBoot('', { reducedMotion: true, automated: false })).toBe(false);
  });

  it('runs dark, flicker, 88888, then 07734 hELLO, and ends after about two seconds', () => {
    expect(bootPhaseAt(0)).toBe('dark');
    expect(bootPhaseAt(400)).toBe('flicker');
    expect(bootPhaseAt(900)).toBe('segments');
    expect(bootPhaseAt(1500)).toBe('hello');
    expect(bootPhaseAt(BOOT_MS)).toBeNull();
    expect(bootPhaseAt(-1)).toBeNull();
    expect(bootCode('segments')).toBe('88888');
    expect(bootCode('hello')).toBe('07734');
    expect(bootCode('dark')).toBe('');
    const starts = BOOT_TIMELINE.map((s) => s.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(BOOT_MS).toBeLessThanOrEqual(2500);
  });
});

describe('vibration follows the chirp', () => {
  it('buzzes once per burst, more on each escalation, capped like the chirp', () => {
    expect(chirpBursts(0)).toBe(3);
    expect(chirpBursts(1)).toBe(5);
    expect(chirpBursts(9)).toBe(9);
    expect(vibrationPattern(0)).toEqual([110, 80, 110, 80, 110]);
    const loudest = vibrationPattern(3);
    expect(loudest.filter((_, i) => i % 2 === 0)).toHaveLength(9);
    expect(vibrationPattern(-2)).toEqual(vibrationPattern(0));
  });
});
