/**
 * Backflip hunt for the trailer (ask 63 round 2).
 *
 * The committed goldens contain no flips — the bot rides for time, and `survey.ts` measures its
 * largest airborne rotation anywhere at 40 deg. A flip therefore has to be authored: follow a
 * golden up to a big-air takeoff, then hold lean-back through the air and sweep when to start it,
 * how long to hold it and whether to level out for the landing, keeping whichever run rotates
 * furthest AND still lands clean.
 *
 *   npx tsx harness/trailer/make-flip.ts x3-gauntlet --golden harness/inputs/x3-gauntlet/bot-3-pro.json \
 *     --takeoff 37.0 [--window 1.2] [--out harness/inputs/x3-gauntlet/trailer-flip.json]
 *
 * Prints the sweep's best rows; writes the winner as a replayable recording (node == browser, so
 * `capture-beats.ts` can render it like any golden).
 */
import fs from 'node:fs';
import path from 'node:path';
import { InputRecorder, expandFrames, quantizeInput } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { srcFingerprint } from '../lib/metrics';
import { loadRecording, saveRecording } from '../lib/recording';
import { createSim, type Sim } from '../lib/sim';

interface Trial {
  delay: number;
  hold: number;
  lean: number;
  throttle: number;
  level: number;
  rotDeg: number;
  airS: number;
  landed: boolean;
  faulted: boolean;
  apexY: number;
  x1: number;
}

interface Plan {
  delay: number;
  hold: number;
  lean: number;
  throttle: number;
  level: number;
}

/**
 * Run one candidate from the current sim state. `sink` receives every input frame, so the search
 * and the emitted recording go through exactly this routine — the first version computed the lean
 * schedule at a slightly different point in the two loops and the written recording faulted where
 * the scored one had landed.
 *
 * `settleS` keeps riding after touchdown: a flip that lands and then loops out is not a flip that
 * landed, and the emitted recording needs that tail anyway for the cut.
 */
function fly(
  sim: Sim,
  o: Plan,
  hz: number,
  opts: { settleS?: number; sink?: (f: InputFrame) => void } = {},
): Omit<Trial, keyof Plan> {
  const maxTicks = Math.round(6 * hz);
  const settle = Math.round((opts.settleS ?? 0.4) * hz);
  // Recordings quantise throttle/brake to u8 and lean to i8 (`src/core/replay.ts`), so a plan
  // value of -0.8 is stored as -102/127 = -0.80315. Stepping the search with the raw float meant
  // the sim saw a lean the recording cannot hold, and a marginal flip that landed in the search
  // replayed as a crash. Quantise once, here, so search, emit and replay all step the same frame.
  const step = (raw: InputFrame): void => {
    const f = quantizeInput(raw);
    opts.sink?.(f);
    sim.step(f);
  };
  let airStart = -1;
  let angle0 = 0;
  let rot = 0;
  let apexY = -Infinity;
  let landed = false;
  let faulted = false;
  let airTicks = 0;
  let x1 = 0;
  for (let k = 0; k < maxTicks; k++) {
    const inAir = airStart >= 0;
    const since = inAir ? k - airStart : -1;
    const lean = !inAir ? 0 : since < o.delay ? 0 : since < o.delay + o.hold ? o.lean : o.level;
    step({ throttle: o.throttle, brake: 0, lean });
    const s = sim.state();
    const grounded = s.contacts.rear !== null || s.contacts.front !== null;
    if (!grounded && airStart < 0) {
      airStart = k;
      angle0 = s.bike.angle;
      apexY = s.bike.pos.y;
    }
    if (!grounded && airStart >= 0) {
      apexY = Math.max(apexY, s.bike.pos.y);
      rot = ((s.bike.angle - angle0) * 180) / Math.PI;
      airTicks = k - airStart;
    }
    x1 = s.bike.pos.x;
    if (s.faulted) {
      faulted = true;
      break;
    }
    // Down and staying down: ride it out for `settleS` before calling the flip landed.
    if (grounded && airStart >= 0 && k > airStart + 6) {
      let stuck = true;
      for (let j = 0; j < settle; j++) {
        step({ throttle: o.throttle, brake: 0, lean: o.level });
        const st = sim.state();
        x1 = st.bike.pos.x;
        if (st.faulted) {
          faulted = true;
          stuck = false;
          break;
        }
      }
      landed = stuck;
      break;
    }
  }
  return { rotDeg: rot, airS: airTicks / hz, landed, faulted, apexY, x1 };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const trackId = positional[0]!;
  const goldenPath = flagStr(flags, 'golden', `harness/inputs/${trackId}/bot-3-pro.json`);
  const golden = loadRecording(goldenPath);
  const takeoffS = flagNum(flags, 'takeoff', 37.0);
  const hz = golden.header.physicsHz;
  const bike = golden.header.bike;
  const base = expandFrames(golden);
  const upto = Math.min(base.length, Math.round(takeoffS * hz));

  const sim = await createSim(trackId, golden.header.seed, hz, { bike });
  for (let i = 0; i < upto; i++) sim.step(base[i]!);
  const at = sim.snap();
  const s0 = sim.state();
  console.log(`[flip] ${trackId} ${path.basename(goldenPath)} bike=${bike ?? 'rookie'} src=${srcFingerprint()}`);
  console.log(`[flip] takeoff at ${takeoffS.toFixed(2)} s: x=${s0.bike.pos.x.toFixed(1)} y=${s0.bike.pos.y.toFixed(2)} v=${Math.hypot(s0.bike.vel.x, s0.bike.vel.y).toFixed(1)}`);

  // The settle must match the tail the recording carries: a flip that is upright 0.4 s after
  // touchdown and loops out at 1.5 s is not a landed flip, and scoring it as one is how the first
  // emitted recording came out faulted while its sweep row said LANDED.
  const tailS = flagNum(flags, 'tail', 2.0);
  const trials: Trial[] = [];
  for (const delay of [0, 4, 8, 14, 20, 30]) {
    for (const hold of [40, 70, 100, 140, 180, 240]) {
      for (const lean of [-1, -0.8, -0.6]) {
        for (const throttle of [1, 0.5, 0]) {
          for (const level of [0, -0.3, 0.3]) {
            sim.restore(at);
            const r = fly(sim, { delay, hold, lean, throttle, level }, hz, { settleS: tailS });
            trials.push({ delay, hold, lean, throttle, level, ...r });
          }
        }
      }
    }
  }
  // Backward rotation is the flip we want; sort by how far it went, landed runs first.
  const byRot = [...trials].sort((a, b) => Math.abs(b.rotDeg) - Math.abs(a.rotDeg));
  const landedFlips = byRot.filter((t) => t.landed && !t.faulted);
  console.log(`[flip] ${trials.length} candidates · best rotation ${byRot[0]!.rotDeg.toFixed(0)} deg · landed clean: ${landedFlips.length}`);
  const show = (t: Trial): string =>
    `rot=${t.rotDeg.toFixed(0).padStart(5)}deg air=${t.airS.toFixed(2)}s apexY=${t.apexY.toFixed(1)} ` +
    `${t.landed ? 'LANDED' : t.faulted ? 'crashed' : 'open  '} (delay=${t.delay} hold=${t.hold} lean=${t.lean} thr=${t.throttle} level=${t.level})`;
  console.log('  -- furthest rotation, any outcome:');
  for (const t of byRot.slice(0, 6)) console.log(`     ${show(t)}`);
  if (landedFlips.length) {
    console.log('  -- furthest rotation that landed clean:');
    for (const t of landedFlips.slice(0, 6)) console.log(`     ${show(t)}`);
  }

  const best = landedFlips[0] ?? byRot[0]!;
  if (Math.abs(best.rotDeg) < 120) {
    console.log(`[flip] no flip here: best is ${best.rotDeg.toFixed(0)} deg. Try another --takeoff (survey.ts lists the airs).`);
  }

  // Re-run the winner recording every frame, then 2 s past the landing for the cut's tail.
  const rec = new InputRecorder({
    version: 1,
    trackId,
    seed: golden.header.seed,
    physicsHz: hz,
    ...(bike ? { bike } : {}),
    ...(golden.header.physics ? { physics: golden.header.physics } : {}),
    note: `trailer flip rot=${best.rotDeg.toFixed(0)}deg landed=${best.landed} bike=${bike ?? 'rookie'} src=${srcFingerprint()}`,
  });
  const sim2 = await createSim(trackId, golden.header.seed, hz, { bike });
  const push = (f: InputFrame): void => {
    rec.push(f);
    sim2.step(f);
  };
  for (let i = 0; i < upto; i++) push(base[i]!);
  // Same routine the search scored, with a longer settle so the cut has a tail after the landing.
  const emitted = fly(sim2, best, hz, { settleS: tailS, sink: (f) => rec.push(f) });
  const out = flagStr(flags, 'out', `harness/inputs/${trackId}/trailer-flip.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  saveRecording(out, rec.toRecording());
  const end = sim2.state();
  console.log(
    `[flip] wrote ${out}: takeoff tick ${upto} (${takeoffS.toFixed(2)} s), ` +
      `rot ${emitted.rotDeg.toFixed(0)} deg, landed=${emitted.landed}, faulted=${end.faulted}, ` +
      `apexY=${emitted.apexY.toFixed(1)}, end x=${end.bike.pos.x.toFixed(1)}`,
  );
  if (!emitted.landed || emitted.faulted) {
    console.log('[flip] WARNING: the emitted run did not land clean — the sweep row and the recording disagree.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
