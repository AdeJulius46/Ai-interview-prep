#!/usr/bin/env node
// testing.md, gate:10: "A CI step greps apps/web for ANAM_API_KEY and
// ANTHROPIC_API_KEY and fails if found." Nothing prefixed NEXT_PUBLIC_ may
// ever hold a provider key (README.md), and neither secret name should
// appear anywhere under apps/web at all — not even in a comment referring
// to it by name in application code, since that's how a real leak starts.
// Plain Node, not a shell grep, so this runs identically on every OS.
const { readdirSync, readFileSync, statSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'apps', 'web');
const FORBIDDEN = ['ANAM_API_KEY', 'ANTHROPIC_API_KEY'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results', 'playwright-report']);

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const offenders = [];
for (const file of walk(ROOT, [])) {
  // .env.local(.example) legitimately name NEXT_PUBLIC_API_BASE only, but
  // scan every file regardless — the point is that the two secret names
  // never appear here at all, in any form.
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable file, not a text leak vector
  }
  for (const secret of FORBIDDEN) {
    if (content.includes(secret)) {
      offenders.push(`${path.relative(process.cwd(), file)}: contains "${secret}"`);
    }
  }
}

if (offenders.length > 0) {
  console.error('Found forbidden secret references under apps/web:\n');
  for (const line of offenders) console.error(`  ${line}`);
  process.exit(1);
}

console.log('OK: no ANAM_API_KEY or ANTHROPIC_API_KEY references found under apps/web.');
