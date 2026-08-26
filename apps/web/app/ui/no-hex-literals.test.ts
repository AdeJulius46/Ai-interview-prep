import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// gate:4: "A lint assertion that no file under packages/ui/src contains a
// hex colour literal" (shared.md Part B), now enforced over apps/web/app/ui/
// after the ui-primitives package was folded into apps/web. Every colour
// must flow through the CSS custom properties / Tailwind theme tokens
// declared in tokens.css. tokens.css itself is the one legitimate place hex
// values live, and it sits at apps/web/app/tokens.css, outside this
// directory, so it is not walked here.
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '.');

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (CHECKED_EXTENSIONS.has(extname(full)) && !full.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('no raw hex colour literals under apps/web/app/ui', () => {
  it('finds none in source files', () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(HEX_COLOUR);
      if (matches) {
        offenders.push(`${file}: ${matches.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
