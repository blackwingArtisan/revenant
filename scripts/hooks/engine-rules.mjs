// The pure-engine rules, shared by the purity unit test and the Kiro write guard.
// Nothing under src/engine may read the clock, randomness, storage, the network,
// browser globals or the environment, and it imports only other engine files.

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
export const FORBIDDEN = [
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
export function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
}

/** Every rule a piece of engine source breaks, as readable reasons. Empty when it is pure. */
export function engineViolations(source) {
  const body = stripCommentsAndStrings(source);
  const leaks = FORBIDDEN.filter(([re]) => re.test(body)).map(([, what]) => what);
  const imports = [...source.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const outside = imports.filter((spec) => !spec.startsWith('./')).map((spec) => `an import from outside the engine ('${spec}')`);
  return [...leaks, ...outside];
}

/** True for a TypeScript file directly under src/engine. */
export function isEnginePath(path) {
  return typeof path === 'string' && /(?:^|\/)src\/engine\/[^/]+\.ts$/.test(path.replace(/\\/g, '/'));
}
