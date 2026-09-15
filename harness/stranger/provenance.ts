/** Stranger evidence includes production Game rules and the actual controls/briefing.
 * Keep this local until the shared harness fingerprint migrates away from its rule mirror. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/paths';

export function strangerFingerprint(root = REPO_ROOT): string {
  const hash = createHash('sha256');
  const add = (relative: string): void => {
    const bytes = fs.readFileSync(path.join(root, relative));
    hash.update(`${relative.length}:${relative}:${bytes.length}:`);
    hash.update(bytes);
  };
  const walk = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) add(child);
    }
  };
  for (const directory of ['src/physics', 'src/tracks', 'src/core', 'harness/stranger']) walk(directory);
  for (const file of ['src/game/game.ts', 'src/game/rules.ts', 'harness/lib/production-sim.ts', 'harness/lib/metrics.ts', 'harness/bot/actions.ts', 'harness/stranger/PROTOCOL.md']) add(file);
  return hash.digest('hex');
}
