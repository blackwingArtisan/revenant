import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The engine is pure: the same inputs always give the same pages. This scans
 * every source file under src/engine for the usual ways purity leaks in.
 * The Kiro hook `engine-purity-guard.json` runs this test whenever the engine changes.
 */
const ENGINE = join(import.meta.dirname, '../../src/engine');
const FORBIDDEN: [RegExp, string][] = [
  [/\bDate\.now\s*\(/, 'Date.now() (inject the clock instead)'],
  [/\bnew Date\s*\(\s*\)/, 'new Date() without an argument'],
  [/\bperformance\.now\s*\(/, 'performance.now()'],
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\bcrypto\.(randomUUID|getRandomValues)\b/, 'random ids'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/, 'network access'],
  [/\b(window|document|navigator)\./, 'browser globals'],
  [/\bprocess\.env\b/, 'environment variables'],
];

/** Drops comments and string contents, so documentation can name what it avoids. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
}

const files = readdirSync(ENGINE).filter((f) => f.endsWith('.ts'));

describe('engine purity', () => {
  it('has engine files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} reads no clock, randomness, storage, network or browser globals, and imports only the engine`, () => {
      const source = readFileSync(join(ENGINE, file), 'utf8');
      const body = code(source);
      const leaks = FORBIDDEN.filter(([re]) => re.test(body)).map(([, what]) => what);
      expect(leaks).toEqual([]);
      const imports = [...source.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
      expect(imports.filter((spec) => !spec.startsWith('./'))).toEqual([]);
    });
  }
});
