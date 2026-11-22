#!/usr/bin/env node
// Kiro PreToolUse hook for fs_write: refuses a write under src/engine that would
// break the pure-engine rules, before it reaches the disk.
//
// Reads the hook event as JSON on stdin ({ tool_name, tool_input: { path, ... } }).
// Exit 0 lets the write through; exit 2 blocks it and the reason on stderr goes
// back to the agent.
import { engineViolations, isEnginePath } from './engine-rules.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let event;
try {
  event = JSON.parse(raw || '{}');
} catch {
  process.exit(0); // Not an event this guard understands: never block on a parse error.
}

const input = event?.tool_input ?? {};
const path = input.path ?? input.file_path;
if (!isEnginePath(path)) process.exit(0);

// The new text arrives as `text` (fs_write) or `newStr` (str_replace) in kiro-cli 3.5;
// file_text, new_str and content are the older names.
const texts = [input.text, input.newStr, input.file_text, input.new_str, input.content].filter((t) => typeof t === 'string');
const reasons = [...new Set(texts.flatMap(engineViolations))];
if (reasons.length === 0) process.exit(0);

process.stderr.write(
  `Blocked: ${path} is part of the pure engine, and this write adds ${reasons.join(', ')}. ` +
    'Pass the time or the value in as an argument instead (see .kiro/steering/tech.md).\n',
);
process.exit(2);
