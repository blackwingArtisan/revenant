import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const GUARD = join(ROOT, 'scripts/hooks/engine-write-guard.mjs');

/** Runs the write guard the way Kiro does: the hook event as JSON on stdin. */
function guard(event: unknown): { status: number | null; stderr: string } {
  const r = spawnSync(process.execPath, [GUARD], { input: typeof event === 'string' ? event : JSON.stringify(event), encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
}
const write = (path: string, tool_input: Record<string, string>) => ({ hook_event_name: 'preToolUse', tool_name: 'fs_write', tool_input: { path, ...tool_input } });

describe('engine write guard (PreToolUse on fs_write)', () => {
  it('blocks a new engine file that reads the clock', () => {
    const r = guard(write('src/engine/plan.ts', { command: 'create', file_text: 'export const now = () => Date.now();\n' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Date.now()');
    expect(r.stderr).toContain('src/engine/plan.ts');
  });

  it('blocks an edit that adds randomness, by absolute path too', () => {
    const r = guard(write(`${ROOT}/src/engine/learn.ts`, { command: 'str_replace', old_str: 'a', new_str: 'const jitter = Math.random();' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Math.random()');
  });

  it('blocks an import from outside the engine', () => {
    const r = guard(write('src/engine/report.ts', { command: 'create', file_text: "import { beep } from '../app/beep';\n" }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("'../app/beep'");
  });

  it('lets a pure engine write through, even when a comment names what it avoids', () => {
    const r = guard(write('src/engine/time.ts', { command: 'create', file_text: "// Never call Date.now() here.\nimport { MINUTE } from './time';\nexport const later = (now: number) => now + MINUTE;\n" }));
    expect(r).toEqual({ status: 0, stderr: '' });
  });

  it('leaves files outside the engine alone', () => {
    expect(guard(write('src/app/usePager.ts', { command: 'create', file_text: 'const t = Date.now();' })).status).toBe(0);
    expect(guard(write('tests/unit/plan.test.ts', { command: 'create', file_text: 'Math.random()' })).status).toBe(0);
  });

  it('never blocks on an event it cannot read', () => {
    expect(guard('not json').status).toBe(0);
    expect(guard({}).status).toBe(0);
  });
});

describe('Kiro hook files', () => {
  const dir = join(ROOT, '.kiro/hooks');
  const scripts = Object.keys((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('has the eight hooks the README and KIRO-LOG describe', () => {
    expect(files).toHaveLength(8);
  });

  for (const file of files) {
    it(`${file} is valid, enabled and runs a command that exists`, () => {
      const spec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        version: string;
        hooks: { name: string; trigger: string; matcher?: string; action: { type: string; command?: string; prompt?: string }; enabled: boolean }[];
      };
      expect(spec.version).toBe('v1');
      expect(spec.hooks.length).toBeGreaterThan(0);
      for (const hook of spec.hooks) {
        expect(hook.enabled).toBe(true);
        if (hook.matcher) expect(() => new RegExp(hook.matcher!)).not.toThrow();
        if (hook.action.type === 'agent') expect(hook.action.prompt?.length).toBeGreaterThan(20);
        else {
          const command = hook.action.command ?? '';
          for (const [, name] of command.matchAll(/npm run (?:-s )?([\w:-]+)/g)) expect(scripts).toContain(name);
          for (const [, path] of command.matchAll(/node (\S+\.mjs)/g)) expect(() => readFileSync(join(ROOT, path!))).not.toThrow();
        }
      }
    });
  }
});
