/**
 * Per track: the storyboard set pieces (kind/label x0-x1) with the tick the golden enters each, the placed
 * obstacles (kind @ x), and the golden's wheelie spans (front up, rear down >= 0.5 s). Hard/extreme tracks use
 * the Pro golden (bot-3-pro.json) when it exists; `--rec path` overrides.
 *   npx tsx harness/trailer/features.ts h1-wheelie-wire x1-vertical-limit
 */
import fs from 'node:fs';
import { expandFrames } from '../../src/core/replay';
import { getTrack } from '../../src/tracks';
import { setPiecesOf } from '../../src/tracks/author';
import { loadRecording } from '../lib/recording';
import { createSim } from '../lib/sim';

async function main(): Promise<void> {
  for (const id of process.argv.slice(2)) {
    const pro = /^[hx]\d-/.test(id) && fs.existsSync(`harness/inputs/${id}/bot-3-pro.json`);
    const file = `harness/inputs/${id}/${pro ? 'bot-3-pro.json' : 'bot-3.json'}`;
    const rec = loadRecording(file);
    const sim = await createSim(id, rec.header.seed, rec.header.physicsHz, { bike: rec.header.bike });
    const frames = expandFrames(rec);
    const hz = rec.header.physicsHz;
    const xs: number[] = [];
    const lines: string[] = [];
    let wh = -1;
    for (let i = 0; i < frames.length; i++) {
      sim.step(frames[i]!);
      const s = sim.state();
      xs.push(s.bike.pos.x);
      const wheelie = s.contacts.rear !== null && s.contacts.front === null;
      if (wheelie && wh < 0) wh = i;
      if (!wheelie && wh >= 0) {
        if ((i - wh) / hz >= 0.5) lines.push(`  WHEELIE t=${(wh / hz).toFixed(2)}-${(i / hz).toFixed(2)} (${((i - wh) / hz).toFixed(2)}s) ticks ${wh}-${i} x=${xs[wh]!.toFixed(1)}->${s.bike.pos.x.toFixed(1)}`);
        wh = -1;
      }
    }
    const reach = (x: number): string => {
      const i = xs.findIndex((v) => v >= x);
      return i < 0 ? 'never' : `tick ${i} (${(i / hz).toFixed(2)}s)`;
    };
    const def = getTrack(id)!;
    console.log(`== ${id} "${def.name}" biome=${def.meta?.biome} rec=${file} bike=${rec.header.bike ?? 'rookie'} ticks=${frames.length}`);
    for (const sp of setPiecesOf(def)) console.log(`  SETPIECE ${sp.kind.padEnd(10)} ${(sp.label ?? '').padEnd(22)} x=${sp.x0.toFixed(1)}-${sp.x1.toFixed(1)} enter ${reach(sp.x0)} exit ${reach(sp.x1)}`);
    for (const l of lines) console.log(l);
    for (const o of sim.compiled.placed as unknown as { kind: string; x?: number; x0?: number }[]) {
      const x = o.x ?? o.x0 ?? NaN;
      console.log(`  ${(o.kind ?? '?').padEnd(14)} x=${Number.isFinite(x) ? x.toFixed(1) : '?'} reached ${Number.isFinite(x) ? reach(x) : '-'}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
