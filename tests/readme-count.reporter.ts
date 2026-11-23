import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter, TestModule } from 'vitest/node';

// Fails a full unit run when the README's unit test count no longer matches the
// tests Vitest collected. Partial runs (one file, watch reruns) are not checked.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COUNT = /(\d+) unit tests in (\d+) files \(Vitest[^)]*\), plus (\d+) skipped by design/;

function testFiles(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? testFiles(join(dir, e.name)) : e.name.endsWith('.test.ts') ? 1 : 0),
    0,
  );
}

export default class ReadmeCountReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    if (testModules.length !== testFiles(join(ROOT, 'tests/unit'))) return;
    const claim = COUNT.exec(readFileSync(join(ROOT, 'README.md'), 'utf8'));
    const collected = testModules.reduce((n, m) => n + [...m.children.allTests()].length, 0);
    const stated = claim ? Number(claim[1]) + Number(claim[3]) : NaN;
    if (!claim || stated !== collected || Number(claim[2]) !== testModules.length) {
      const said = claim ? `${stated} tests in ${claim[2]} files` : 'no count found';
      console.error(`\nREADME unit test count is out of date: README ${said}, Vitest ${collected} tests in ${testModules.length} files.\n`);
      process.exitCode = 1;
    }
  }
}
