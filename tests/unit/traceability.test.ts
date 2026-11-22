import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Spec traceability, for every folder under .kiro/specs: the three spec files exist,
 * every EARS acceptance criterion in requirements.md is claimed by at least one task
 * in tasks.md, every task names criteria that exist, and a checked task has no open
 * sub-task. The Kiro Stop and post-task hooks run this.
 */
const SPECS = join(import.meta.dirname, '../../.kiro/specs');
const FILES = ['requirements.md', 'design.md', 'tasks.md'] as const;

/** The first spec keeps its size thresholds and may cite a whole requirement ("(Req 3)"); a newer spec may not. */
const FIRST_SPEC = 'time-blind-paging';

const folders = readdirSync(SPECS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

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

function readSpec(folder: string) {
  const requirements = readFileSync(join(SPECS, folder, 'requirements.md'), 'utf8');
  const tasks = readFileSync(join(SPECS, folder, 'tasks.md'), 'utf8');
  const criteria = [...requirements.matchAll(/^(\d+)\.(\d+) (WHEN|WHILE|IF|WHERE|THE SYSTEM)\b/gm)].map((m) => `${m[1]}.${m[2]}`);
  const requirementNumbers = [...requirements.matchAll(/^## Requirement (\d+):/gm)].map((m) => m[1]!);
  const refs = [...tasks.matchAll(/\(Req ([^)]*)\)/g)].flatMap((m) => m[1]!.split(',')).map(expand);
  return {
    tasks,
    criteria,
    requirementNumbers,
    claimed: new Set(refs.flatMap((r) => r.ids)),
    claimedWhole: new Set(refs.flatMap((r) => r.whole)),
  };
}

describe('spec folders (Req 12.1-12.3)', () => {
  it('finds the specs', () => {
    expect(folders).toContain(FIRST_SPEC);
    expect(folders).toContain('on-call-escalation');
  });
});

describe.each(folders)('spec traceability: %s (Req 12.1-12.3)', (folder) => {
  it('has requirements.md, design.md and tasks.md', () => {
    expect(FILES.filter((f) => !existsSync(join(SPECS, folder, f)))).toEqual([]);
  });

  const spec = readSpec(folder);

  it('reads the spec', () => {
    if (folder === FIRST_SPEC) {
      expect(spec.requirementNumbers.length).toBeGreaterThanOrEqual(10);
      expect(spec.criteria.length).toBeGreaterThan(100);
    } else {
      expect(spec.requirementNumbers.length).toBeGreaterThanOrEqual(1);
      expect(spec.criteria.length).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(spec.criteria).size).toBe(spec.criteria.length);
  });

  it('every acceptance criterion is claimed by a task', () => {
    const orphans = spec.criteria.filter((id) => !spec.claimed.has(id) && !spec.claimedWhole.has(id.split('.')[0]!));
    expect(orphans).toEqual([]);
  });

  it('every task names criteria and requirements that exist', () => {
    const known = new Set(spec.criteria);
    expect([...spec.claimed].filter((id) => !known.has(id))).toEqual([]);
    expect([...spec.claimedWhole].filter((n) => !spec.requirementNumbers.includes(n))).toEqual([]);
  });

  it.skipIf(folder === FIRST_SPEC)('cites criteria, never a whole requirement', () => {
    expect([...spec.claimedWhole]).toEqual([]);
  });

  it('a checked task has no open sub-task', () => {
    const broken: string[] = [];
    let parent: { done: boolean; title: string } | null = null;
    for (const line of spec.tasks.split('\n')) {
      const top = /^- \[( |x)\] (\d+)\./.exec(line);
      const sub = /^\s+- \[( |x)\] (\d+\.\d+)/.exec(line);
      if (top) parent = { done: top[1] === 'x', title: `task ${top[2]}` };
      else if (sub && parent?.done && sub[1] === ' ') broken.push(`${parent.title} is checked but ${sub[2]} is open`);
    }
    expect(broken).toEqual([]);
  });
});

describe('the checks catch what they should (Req 12.1-12.3)', () => {
  it('expands a range, a single criterion and a whole requirement', () => {
    expect(expand('2.1-2.3')).toEqual({ ids: ['2.1', '2.2', '2.3'], whole: [] });
    expect(expand('4.5')).toEqual({ ids: ['4.5'], whole: [] });
    expect(expand('3')).toEqual({ ids: [], whole: ['3'] });
    expect(() => expand('1.1-2.4')).toThrow();
    expect(() => expand('one')).toThrow();
  });
});
