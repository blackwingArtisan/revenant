import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineViolations } from '../../scripts/hooks/engine-rules.mjs';

/**
 * The engine is pure: the same inputs always give the same pages. This scans
 * every source file under src/engine for the usual ways purity leaks in.
 * The Kiro hook `engine-purity-guard.json` runs this test whenever the engine changes,
 * and `engine-write-guard.json` applies the same rules before a write lands.
 */
const ENGINE = join(import.meta.dirname, '../../src/engine');
const files = readdirSync(ENGINE).filter((f) => f.endsWith('.ts'));

describe('engine purity', () => {
  it('has engine files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} reads no clock, randomness, storage, network or browser globals, and imports only the engine`, () => {
      const source = readFileSync(join(ENGINE, file), 'utf8');
      expect(engineViolations(source)).toEqual([]);
    });
  }
});
