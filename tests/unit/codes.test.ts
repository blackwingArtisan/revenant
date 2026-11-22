import { describe, expect, it } from 'vitest';
import { BOOT_CODE, cardHeading, CODE_CARD, CODE_FOR, escalatedCode, MISSED_CODE, SECONDARY_LABEL } from '../../src/engine/codes';

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

describe('on-call escalation code (Req 4.1, 4.6)', () => {
  it('999 belongs to the escalation kind and has its own card row (Req 4.1, 4.6)', () => {
    expect(CODE_FOR.escalation).toBe('999');
    const row = CODE_CARD.find((c) => c.code === '999');
    expect(row?.meaning).toBe('Secondary on call');
    expect(row?.detail.length).toBeGreaterThan(0);
  });

  it('labels the second pager SECONDARY ON CALL (Req 4.4)', () => {
    expect(SECONDARY_LABEL).toBe('SECONDARY ON CALL');
  });

  it('every code in CODE_FOR is on the card exactly once (Req 4.6)', () => {
    for (const code of new Set(Object.values(CODE_FOR))) expect(CODE_CARD.filter((c) => c.code === code), code).toHaveLength(1);
  });

  it('keeps one stop on the 999 heading (Req 4.6)', () => {
    expect(cardHeading('Secondary on call')).toBe('Secondary on call.');
  });
});

describe('escalated code', () => {
  it('repeats the code once per level, up to three times', () => {
    expect(escalatedCode('911', 0)).toBe('911');
    expect(escalatedCode('911', 1)).toBe('911 911');
    expect(escalatedCode('911', 5)).toBe('911 911 911');
  });
});
