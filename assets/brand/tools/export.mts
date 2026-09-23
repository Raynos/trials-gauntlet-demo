// Exports the ROCKHOP wordmark + medal masters from the code that draws them in the game (src/ui/brand.ts), so the
// store kit and the game can never drift:
//
//   pnpm exec tsx assets/brand/tools/export.mts
//
// Writes assets/brand/rockhop-wordmark{,-cream}.svg, wordmark.png (transparent, 2400 px wide, teal) and
// wordmark-cream.png, and medal-<id>.svg. Needs `rsvg-convert` (librsvg) for the PNGs.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, medalSvg, wordmarkSvg, type MedalId } from '../../../src/ui/brand';

const out = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgs: Record<string, string> = {
  'rockhop-wordmark.svg': wordmarkSvg({ fill: PALETTE.teal }),
  'rockhop-wordmark-cream.svg': wordmarkSvg({ fill: PALETTE.cream }),
  'rockhop-wordmark-ink.svg': wordmarkSvg({ fill: PALETTE.ink }),
};
for (const m of ['bronze', 'silver', 'gold', 'platinum'] as MedalId[]) svgs[`medal-${m}.svg`] = medalSvg(m);
for (const [name, svg] of Object.entries(svgs)) writeFileSync(join(out, name), svg + '\n');
execFileSync('rsvg-convert', ['-w', '2400', '-o', join(out, 'wordmark.png'), join(out, 'rockhop-wordmark.svg')]);
execFileSync('rsvg-convert', ['-w', '2400', '-o', join(out, 'wordmark-cream.png'), join(out, 'rockhop-wordmark-cream.svg')]);
console.log(`wrote ${Object.keys(svgs).length} SVGs + wordmark.png / wordmark-cream.png to ${out}`);
