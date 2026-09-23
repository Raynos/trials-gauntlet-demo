/**
 * Every ROCKHOP course's skill-3 golden (`harness/inputs/<id>/bot-3.json`, the recording the store evidence, the
 * clip sheets and `harness:determinism` stand on) still finishes, with 0 faults, when replayed in node on today's
 * physics and today's geometry. A physics or geometry change that breaks a golden fails here, in CI, instead of in
 * the next evidence run: a736a26f (riding-poses physics) left all sixteen short of the line (1-10 faults each) and
 * nothing red said so. Re-record with `pnpm harness:bot <id>` on the new tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expandFrames } from '../../core/replay';
import { createSimFor } from '../../../harness/lib/sim';
import { loadRecording } from '../../../harness/lib/recording';
import { ROCKHOP_ALL } from '../index';

const INPUTS = fileURLToPath(new URL('../../../harness/inputs/', import.meta.url));

describe('ROCKHOP goldens replay in node', () => {
  it.each(ROCKHOP_ALL.map((t) => [t.id] as const))('%s: bot-3.json finishes with 0 faults', async (id) => {
    const file = path.join(INPUTS, id, 'bot-3.json');
    expect(fs.existsSync(file), `${id} has no golden`).toBe(true);
    const rec = loadRecording(file);
    expect(rec.header.trackId).toBe(id);
    expect(rec.header.bike ?? 'rookie').toBe('rookie');
    const sim = await createSimFor(rec);
    sim.run(expandFrames(rec));
    expect({ phase: sim.phase(), faults: sim.faults() }).toEqual({ phase: 'finished', faults: 0 });
  });
});
