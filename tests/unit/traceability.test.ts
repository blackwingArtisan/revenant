import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Spec traceability: every EARS acceptance criterion in requirements.md is claimed
 * by at least one task in tasks.md, every task names criteria that exist, and a
 * checked task has no open sub-task. The Kiro Stop and post-task hooks run this.
 */
const SPEC = join(import.meta.dirname, '../../.kiro/specs/time-blind-paging');
const requirements = readFileSync(join(SPEC, 'requirements.md'), 'utf8');
const tasks = readFileSync(join(SPEC, 'tasks.md'), 'utf8');

const criteria = [...requirements.matchAll(/^(\d+)\.(\d+) (WHEN|WHILE|IF|WHERE|THE SYSTEM)\b/gm)].map((m) => `${m[1]}.${m[2]}`);
const requirementNumbers = [...requirements.matchAll(/^## Requirement (\d+):/gm)].map((m) => m[1]!);

/** Expands "1.1-1.4", "8.10-8.12", "4.5", "3" and "1-7" into criterion ids or whole requirements. */
function expand(ref: string): { ids: string[]; whole: string[] } {
  const r = ref.trim();
  let m = /^(\d+)\.(\d+)-(?:(\d+)\.)?(\d+)$/.exec(r);
  if (m) {
    const [, req, from, toReq, to] = m;
    if (toReq && toReq !== req) throw new Error(`range across requirements: ${r}`);
    return { ids: Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => `${req}.${Number(from) + i}`), whole: [] };
  }
  if (/^\d+\.\d+$/.test(r)) return { ids: [r], whole: [] };
  m = /^(\d+)(?:-(\d+))?$/.exec(r);
  if (m) {
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    return { ids: [], whole: Array.from({ length: to - from + 1 }, (_, i) => String(from + i)) };
  }
  throw new Error(`unreadable requirement reference: "${r}"`);
}

const refs = [...tasks.matchAll(/\(Req ([^)]*)\)/g)].flatMap((m) => m[1]!.split(',')).map(expand);
const claimed = new Set(refs.flatMap((r) => r.ids));
const claimedWhole = new Set(refs.flatMap((r) => r.whole));

describe('spec traceability', () => {
  it('reads the spec', () => {
    expect(requirementNumbers.length).toBeGreaterThanOrEqual(10);
    expect(criteria.length).toBeGreaterThan(100);
    expect(new Set(criteria).size).toBe(criteria.length);
  });

  it('every acceptance criterion is claimed by a task', () => {
    const orphans = criteria.filter((id) => !claimed.has(id) && !claimedWhole.has(id.split('.')[0]!));
    expect(orphans).toEqual([]);
  });

  it('every task names criteria and requirements that exist', () => {
    const known = new Set(criteria);
    expect([...claimed].filter((id) => !known.has(id))).toEqual([]);
    expect([...claimedWhole].filter((n) => !requirementNumbers.includes(n))).toEqual([]);
  });

  it('a checked task has no open sub-task', () => {
    const lines = tasks.split('\n');
    const broken: string[] = [];
    let parent: { done: boolean; title: string } | null = null;
    for (const line of lines) {
      const top = /^- \[( |x)\] (\d+)\./.exec(line);
      const sub = /^\s+- \[( |x)\] (\d+\.\d+)/.exec(line);
      if (top) parent = { done: top[1] === 'x', title: `task ${top[2]}` };
      else if (sub && parent?.done && sub[1] === ' ') broken.push(`${parent.title} is checked but ${sub[2]} is open`);
    }
    expect(broken).toEqual([]);
  });
});
