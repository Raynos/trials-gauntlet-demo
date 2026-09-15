/**
 * Trailer survey: replay each track's best bot recording in node and print a
 * compact timeline (airtime, landings, crashes, checkpoints, finish) so beats
 * can be picked by tick.  pnpm tsx harness/trailer/survey.ts [trackId ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { expandFrames } from '../../src/core/replay';
import { getTrack, listTrackIds } from '../../src/tracks';
import { loadRecording } from '../lib/recording';
import { createSim } from '../lib/sim';
import { HARNESS_DIR } from '../lib/paths';
import { recordingFingerprint } from '../lib/golden';
import { srcFingerprint } from '../lib/metrics';

async function main(): Promise<void> {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : listTrackIds().filter((i) => /^[bemhx]\d-/.test(i));
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const dir = path.join(HARNESS_DIR, 'inputs', id);
    // Hard/extreme tracks: the Pro golden rides the storyboard set pieces (physics v2); else the rookie golden.
    const pro = /^[hx]\d-/.test(id) && fs.existsSync(path.join(dir, 'bot-3-pro.json'));
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => (pro ? /^bot-3-pro\.json$/ : /^bot-[0-3]\.json$/).test(f)).sort().reverse() : [];
    const def = getTrack(id);
    console.log(`\n== ${id} biome=${def?.meta?.biome} finishX=${def ? 'n/a' : ''} recordings=${files.join(',')} src=${srcFingerprint()}`);
    for (const f of files) {
      const file = path.join(dir, f);
      const rec = loadRecording(file);
      const sim = await createSim(id, rec.header.seed, rec.header.physicsHz, { bike: rec.header.bike });
      const frames = expandFrames(rec);
      const hz = rec.header.physicsHz;
      const lines: string[] = [];
      let air = -1; let maxH = 0; let airStartX = 0;
      for (let i = 0; i < frames.length; i++) {
        const evs = sim.step(frames[i]!);
        const s = sim.state();
        const grounded = s.contacts.rear !== null || s.contacts.front !== null;
        if (!grounded && air < 0) { air = i; maxH = s.bike.pos.y; airStartX = s.bike.pos.x; }
        if (!grounded) maxH = Math.max(maxH, s.bike.pos.y);
        if (grounded && air >= 0) {
          const dur = (i - air) / hz;
          if (dur >= 0.45) lines.push(`  t=${(air / hz).toFixed(2)}-${(i / hz).toFixed(2)} AIR ${dur.toFixed(2)}s x=${airStartX.toFixed(1)}->${s.bike.pos.x.toFixed(1)} apexY=${maxH.toFixed(2)} landY=${s.bike.pos.y.toFixed(2)} v=${Math.hypot(s.bike.vel.x, s.bike.vel.y).toFixed(1)}`);
          air = -1;
        }
        for (const e of evs) {
          if (e.type === 'land' && e.impulse > 6) lines.push(`  t=${(i / hz).toFixed(2)} LAND ${e.wheel} imp=${e.impulse.toFixed(1)} x=${s.bike.pos.x.toFixed(1)}`);
          if (e.type === 'fault') lines.push(`  t=${(i / hz).toFixed(2)} FAULT ${e.reason} x=${s.bike.pos.x.toFixed(1)} y=${s.bike.pos.y.toFixed(2)}`);
          if (e.type === 'restart') lines.push(`  t=${(i / hz).toFixed(2)} RESTART cp=${e.checkpoint}`);
          if (e.type === 'checkpoint') lines.push(`  t=${(i / hz).toFixed(2)} CP ${e.index} x=${s.bike.pos.x.toFixed(1)}`);
          if (e.type === 'finish') lines.push(`  t=${(i / hz).toFixed(2)} FINISH x=${s.bike.pos.x.toFixed(1)} runTime=${sim.runTime().toFixed(2)}`);
        }
      }
      const st = sim.state();
      console.log(` -- ${f} bike=${rec.header.bike ?? 'rookie'} ticks=${frames.length} (${(frames.length / hz).toFixed(1)}s) finished=${st.finishTime !== null} faults=${sim.faults()} stamp=${recordingFingerprint(file)} ${recordingFingerprint(file) === srcFingerprint() ? 'CURRENT' : 'stale'}`);
      for (const l of lines) console.log(l);
      out[`${id}/${f}`] = lines;
      break; // best-skill file only
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
