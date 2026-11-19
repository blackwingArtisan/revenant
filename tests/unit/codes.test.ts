import { describe, expect, it } from 'vitest';
import { BOOT_CODE, cardHeading, CODE_CARD, CODE_FOR, escalatedCode, MISSED_CODE } from '../../src/engine/codes';

describe('wallet code card', () => {
  it('lists every code the pager can show', () => {
    const onCard = new Set(CODE_CARD.map((c) => c.code));
    for (const code of [...Object.values(CODE_FOR), BOOT_CODE, MISSED_CODE]) expect(onCard.has(code), code).toBe(true);
  });

  it('ends each heading with exactly one stop', () => {
    expect(cardHeading('Get ready')).toBe('Get ready.');
    expect(cardHeading('Still here?')).toBe('Still here?');
    expect(cardHeading('Done.')).toBe('Done.');
    for (const c of CODE_CARD) expect(cardHeading(c.meaning), c.code).not.toMatch(/[.?!]{2}$/);
  });
});

describe('escalated code', () => {
  it('repeats the code once per level, up to three times', () => {
    expect(escalatedCode('911', 0)).toBe('911');
    expect(escalatedCode('911', 1)).toBe('911 911');
    expect(escalatedCode('911', 5)).toBe('911 911 911');
  });
});
