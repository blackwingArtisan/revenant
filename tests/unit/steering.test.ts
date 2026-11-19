import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const STEERING = join(ROOT, '.kiro/steering');

/** Every file under a directory, as repo-relative paths with forward slashes. */
function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(ROOT, join(e.parentPath, e.name)).split('\\').join('/'));
}

/** The YAML front matter of a steering file, as flat key/value pairs. */
function frontMatter(file: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(STEERING, file), 'utf8'));
  if (!m) return {};
  return Object.fromEntries(m[1]!.split('\n').map((l) => l.split(/:\s*/, 2) as [string, string]).map(([k, v]) => [k.trim(), v.trim().replace(/^"|"$/g, '')]));
}

/** Matches the `dir/**` and `dir/*.ext` shapes used in fileMatch patterns. */
function globMatch(pattern: string, path: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
  return re.test(path);
}

describe('steering', () => {
  const files = readdirSync(STEERING).filter((f) => f.endsWith('.md'));

  it('declares an inclusion mode on every file', () => {
    for (const f of files) expect(['always', 'fileMatch', 'manual'], f).toContain(frontMatter(f).inclusion);
  });

  it('uses all three modes: always, conditional on a file match, and manual', () => {
    const modes = new Set(files.map((f) => frontMatter(f).inclusion));
    expect([...modes].sort()).toEqual(['always', 'fileMatch', 'manual']);
  });

  it('gives every fileMatch file a pattern that matches files in the repo', () => {
    for (const f of files.filter((x) => frontMatter(x).inclusion === 'fileMatch')) {
      const pattern = frontMatter(f).fileMatchPattern;
      expect(pattern, f).toBeTruthy();
      expect(filesUnder('src').some((p) => globMatch(pattern!, p)), `${f}: ${pattern}`).toBe(true);
    }
  });

  it('holds the relay rule: AWS SDK imports live under src/relay only', () => {
    const offenders = filesUnder('src')
      .filter((p) => /\.(ts|tsx|mts|js|mjs)$/.test(p) && !globMatch(frontMatter('relay.md').fileMatchPattern!, p))
      .filter((p) => /from\s+['"]@aws-sdk\//.test(readFileSync(join(ROOT, p), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('lists in relay.md every AWS API the relay calls', () => {
    const steering = readFileSync(join(STEERING, 'relay.md'), 'utf8');
    const source = filesUnder('src/relay').map((p) => readFileSync(join(ROOT, p), 'utf8')).join('\n');
    const commands = [...source.matchAll(/\b([A-Z][A-Za-z]+)Command\b/g)].map((m) => m[1]!);
    expect(commands.length).toBeGreaterThan(0);
    for (const c of new Set(commands)) expect(steering, c).toContain(`:${c}`);
  });
});
