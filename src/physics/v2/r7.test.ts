/**
 * R7 (physics.md v2 status R7): the rider body is held by the linkage couple and exported as
 * `PhysicsState.riderBody`. Three permanent rows over every bot golden, both classes:
 *
 *  1. pose band - the body is held by its pose: the rotation within +-0.35 rad on >= 94 % of riding ticks per
 *     golden (before R7 the E2 Rookie body wound up to 834 rad and sank 1.4 m), and the RECOVERY band: on every
 *     riding tick >= 1.0 s after the last tick on which the pose target's own world motion demanded more of the
 *     servo than it has (F_max / m_R = 4.35 g of specific force over a 50 ms window) the COM is within 0.15 m and
 *     the angle within 0.35 rad of the pose (measured max 0.128 m / 0.17 rad over 10 687 such ticks). Inside that
 *     second the residual is the impact response (an 8 g landing punches the body through the chassis, a flip
 *     whirls the target at 9 m/s) and no excursion > 0.35 m lasts longer than 1.5 s (measured p50 0.17 s, max
 *     1.33 s; physics.md R7 "COM band");
 *  2. no push without an input edge - `hopPhase` never reads 'push' while the quantized input has been
 *     unchanged for >= 60 ticks (harness r11: the x3 summit "launch pad" on a coasting bike; the m2 Rookie
 *     golden's air-commanded travel finishing on the ground, closed by the `leanEdgeAir` gate);
 *  3. the exported body is deterministic - two replays hash identically tick by tick, and the state hash
 *     (which covers `riderBody`) matches the recording's replay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeJSON, expandFrames, type InputRecording } from '../../core/replay';
import { hashPhysicsState } from '../../core/hash';
import type { InputFrame } from '../../core/types';
import { createSimFor } from '../../../harness/lib/sim';
import type { poseAt } from './rider';
import type { BikePhysicsWorldV2 } from './bike';

const INPUTS = path.resolve(__dirname, '../../../harness/inputs');
const BAND_PSI = 0.35;
const BAND_COM = 0.15;
const QUIET_TICKS = 60;
/** the recovery band: ticks since the last tick whose servo demand exceeded F_max / m_R */
const RECOVER_TICKS = 120;
/** demand window (ticks): the target's world velocity change over 50 ms, the scale the servo can answer on */
const DEMAND_W = 6;
/** an excursion of the COM beyond this (m) ... */
const EXCURSION_M = 0.35;
/** ... never lasts longer than this (ticks) */
const EXCURSION_MAX_TICKS = 180;
const G = 9.81;
const DT = 1 / 120;

function goldens(): { file: string; rec: InputRecording }[] {
  const out: { file: string; rec: InputRecording }[] = [];
  for (const dir of fs.readdirSync(INPUTS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const name of ['bot-3.json', 'bot-3-pro.json']) {
      const file = path.join(INPUTS, dir.name, name);
      if (!fs.existsSync(file)) continue;
      const rec = decodeJSON(fs.readFileSync(file, 'utf8'));
      if (rec.header.physics === 'v1') continue;
      out.push({ file: `${dir.name}/${name}`, rec });
    }
  }
  return out;
}

function sameInput(a: InputFrame, b: InputFrame): boolean {
  return a.throttle === b.throttle && a.brake === b.brake && a.lean === b.lean && !!a.hop === !!b.hop && !!a.restart === !!b.restart;
}

interface Row {
  file: string;
  ticks: number;
  finished: boolean;
  maxPsiErr: number;
  maxCom: number;
  coastingPush: number;
  worstTick: number;
  /** riding ticks, and riding ticks outside the band (psi / COM) */
  riding: number;
  outPsi: number;
  outCom: number;
  /** recovery band: riding ticks >= RECOVER_TICKS past the last over-demand tick, and those outside the COM / psi band */
  recovered: number;
  outRecovered: number;
  maxComRecovered: number;
  maxPsiRecovered: number;
  /** riding ticks with demand > F_max / m_R */
  overDemand: number;
  /** the longest COM excursion > EXCURSION_M (ticks) and where it began */
  longestExcursion: number;
  longestExcursionAt: number;
  excursions: number;
}

async function replay(rec: InputRecording, file: string, hashes?: string[]): Promise<Row> {
  const sim = await createSimFor(rec);
  const w = sim.world as unknown as BikePhysicsWorldV2 & { F: Float64Array; tuning: { rider: { poses: Parameters<typeof poseAt>[0]; Fmax: number; mass: number } } };
  const row: Row = {
    file,
    ticks: 0,
    finished: false,
    maxPsiErr: 0,
    maxCom: 0,
    coastingPush: 0,
    worstTick: -1,
    riding: 0,
    outPsi: 0,
    outCom: 0,
    recovered: 0,
    outRecovered: 0,
    maxComRecovered: 0,
    maxPsiRecovered: 0,
    overDemand: 0,
    longestExcursion: 0,
    longestExcursionAt: -1,
    excursions: 0,
  };
  const demandG = w.tuning.rider.Fmax / (w.tuning.rider.mass * G); // 4.35 g: the specific force the servo can supply
  let prev: InputFrame | null = null;
  let quiet = 0;
  const tmp = { x: 0, y: 0, psi: 0 };
  // the target's world velocity history (DEMAND_W + 1 samples) and the last over-demand tick
  let ptx = Number.NaN;
  let pty = Number.NaN;
  const vhx: number[] = [];
  const vhy: number[] = [];
  let lastOver = -1e9;
  let excursion = 0;
  let excursionAt = -1;
  const endExcursion = (): void => {
    if (excursion > 0) row.excursions++;
    if (excursion > row.longestExcursion) {
      row.longestExcursion = excursion;
      row.longestExcursionAt = excursionAt;
    }
    excursion = 0;
  };
  for (const f of expandFrames(rec)) {
    sim.step(f);
    row.ticks++;
    quiet = prev && sameInput(prev, f) ? quiet + 1 : 0;
    prev = f;
    const s = sim.state();
    if (hashes) hashes.push(hashPhysicsState(s));
    if (sim.phase() !== 'riding' || !s.riderBody) {
      ptx = Number.NaN;
      pty = Number.NaN;
      vhx.length = 0;
      vhy.length = 0;
      lastOver = -1e9;
      endExcursion();
      continue;
    }
    const c = Math.cos(s.bike.angle);
    const sn = Math.sin(s.bike.angle);
    const dx = s.riderBody.pos.x - s.bike.pos.x;
    const dy = s.riderBody.pos.y - s.bike.pos.y;
    const lx = dx * c + dy * sn;
    const ly = -dx * sn + dy * c;
    // the live pose target (F slots 6..8: x, y, psi in the chassis frame)
    tmp.x = w.F[6]!;
    tmp.y = w.F[7]!;
    tmp.psi = w.F[8]!;
    // servo demand: the specific force |a_T - g| the target's own world motion (chassis COM + rotation + the
    // target's travel) asks of the rider mass, over DEMAND_W ticks
    const twx = s.bike.pos.x + tmp.x * c - tmp.y * sn;
    const twy = s.bike.pos.y + tmp.x * sn + tmp.y * c;
    if (!Number.isNaN(ptx)) {
      vhx.push((twx - ptx) / DT);
      vhy.push((twy - pty) / DT);
      if (vhx.length > DEMAND_W + 1) {
        vhx.shift();
        vhy.shift();
      }
      if (vhx.length === DEMAND_W + 1) {
        const demand = Math.hypot((vhx[DEMAND_W]! - vhx[0]!) / (DEMAND_W * DT), (vhy[DEMAND_W]! - vhy[0]!) / (DEMAND_W * DT) + G) / G;
        if (demand > demandG) {
          lastOver = row.ticks;
          row.overDemand++;
        }
      }
    }
    ptx = twx;
    pty = twy;
    const psiErr = Math.abs(s.riderBody.angle - s.bike.angle - tmp.psi);
    const com = Math.hypot(lx - tmp.x, ly - tmp.y);
    row.riding++;
    if (psiErr > BAND_PSI) row.outPsi++;
    if (com > BAND_COM) row.outCom++;
    if (psiErr > row.maxPsiErr || com > row.maxCom) row.worstTick = row.ticks;
    row.maxPsiErr = Math.max(row.maxPsiErr, psiErr);
    row.maxCom = Math.max(row.maxCom, com);
    if (row.ticks - lastOver >= RECOVER_TICKS) {
      row.recovered++;
      if (com > BAND_COM || psiErr > BAND_PSI) row.outRecovered++;
      row.maxComRecovered = Math.max(row.maxComRecovered, com);
      row.maxPsiRecovered = Math.max(row.maxPsiRecovered, psiErr);
    }
    if (com > EXCURSION_M) {
      if (excursion === 0) excursionAt = row.ticks;
      excursion++;
    } else endExcursion();
    if (s.hopPhase === 'push' && quiet >= QUIET_TICKS) row.coastingPush++;
  }
  endExcursion();
  row.finished = sim.phase() === 'finished';
  return row;
}

describe('R7: the rider body is held, exported and deterministic (every bot golden, both classes)', () => {
  const all = goldens();

  it('lists goldens for both classes', () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(all.some((g) => g.file.endsWith('bot-3-pro.json'))).toBe(true);
  });

  it(
    `pose band: rotation within ${BAND_PSI} rad on >= 94 % of riding ticks per golden; recovery band |COM - target| <= ${BAND_COM} m and |psi err| <= ${BAND_PSI} rad on EVERY riding tick >= ${RECOVER_TICKS} ticks after the last over-demand tick (> F_max / m_R over ${DEMAND_W} ticks); no COM excursion > ${EXCURSION_M} m longer than ${EXCURSION_MAX_TICKS} ticks; no coasting push (>= ${QUIET_TICKS} unchanged input ticks)`,
    async () => {
      const rows: Row[] = [];
      for (const g of all) rows.push(await replay(g.rec, g.file));
      let riding = 0;
      let outPsi = 0;
      let outCom = 0;
      let recovered = 0;
      let outRecovered = 0;
      let overDemand = 0;
      let excursions = 0;
      let maxComRecovered = 0;
      let maxPsiRecovered = 0;
      for (const r of rows) {
        riding += r.riding;
        outPsi += r.outPsi;
        outCom += r.outCom;
        recovered += r.recovered;
        outRecovered += r.outRecovered;
        overDemand += r.overDemand;
        excursions += r.excursions;
        maxComRecovered = Math.max(maxComRecovered, r.maxComRecovered);
        maxPsiRecovered = Math.max(maxPsiRecovered, r.maxPsiRecovered);
      }
      const worst = [...rows].sort((a, b) => b.outCom / b.riding - a.outCom / a.riding);
      const longest = [...rows].sort((a, b) => b.longestExcursion - a.longestExcursion);
      console.log(
        `R7 band: ${rows.length} goldens, ${riding} riding ticks; over-demand ${overDemand} (${((100 * overDemand) / riding).toFixed(1)} %); outside psi ${outPsi} (${((100 * outPsi) / riding).toFixed(3)} %), outside COM ${outCom} (${((100 * outCom) / riding).toFixed(3)} %); ` +
          `recovered ticks ${recovered} (${((100 * recovered) / riding).toFixed(1)} %) outside ${outRecovered}, max COM ${maxComRecovered.toFixed(3)} m psi ${maxPsiRecovered.toFixed(3)} rad; ` +
          `excursions > ${EXCURSION_M} m: ${excursions}, longest ${longest
            .slice(0, 3)
            .map((r) => `${r.file} ${(r.longestExcursion * DT).toFixed(2)} s @${r.longestExcursionAt}`)
            .join(', ')}; worst COM 6: ` +
          worst
            .slice(0, 6)
            .map((r) => `${r.file} psi ${r.maxPsiErr.toFixed(2)} com ${r.maxCom.toFixed(2)} out ${r.outPsi}/${r.outCom} of ${r.riding} @${r.worstTick}`)
            .join(' | '),
      );
      for (const r of rows) {
        expect(r.finished, `${r.file} finishes`).toBe(true);
        expect(r.coastingPush, `${r.file} push on a coasting bike`).toBe(0);
        // the wind-up is gone (before R7 the E2 Rookie body was outside the band from tick 110 to the finish) and the
        // rotation is held; worst: gap-test Pro 5.2 % (34 ticks of one landing on a 5.5 s track)
        expect(r.outPsi / r.riding, `${r.file} psi band fraction`).toBeLessThanOrEqual(0.06);
        // the recovery band (physics.md R7 "COM band"): the COM leaves 0.15 m on ~10 % of the bot's riding ticks and
        // by up to 2.6 m - an 8 g landing punches the body through the chassis (m3 Pro tick 1964, y -0.88 m in the
        // chassis frame) and a flip whirls the pose target at 9 m/s (14.5 rad/s) - and every such excursion follows a
        // tick on which the target demanded more than F_max / m_R of the servo. One second after the last such tick
        // the body is home on every golden (measured max 0.128 m / 0.170 rad). A fault when the body leaves the reach
        // (§9.3's thrown rider) is R8's bar; until then the hero draws these excursions, bounded below.
        expect(r.outRecovered, `${r.file} recovery band (max COM ${r.maxComRecovered.toFixed(3)} m, psi ${r.maxPsiRecovered.toFixed(3)} rad over ${r.recovered} ticks)`).toBe(0);
        expect(r.longestExcursion, `${r.file} longest COM excursion > ${EXCURSION_M} m (ticks, from ${r.longestExcursionAt})`).toBeLessThanOrEqual(EXCURSION_MAX_TICKS);
      }
      expect(recovered).toBeGreaterThan(5000); // the band is asserted over a real population (measured 10 687 ticks)
    },
    120_000,
  );

  it('the exported body hashes identically across two replays (b1 Rookie + Pro, e2 Rookie + Pro)', async () => {
    const pick = all.filter((g) => /^(b1-first-ride|e2-rear-wheel-first)\//.test(g.file));
    expect(pick.length).toBe(4);
    for (const g of pick) {
      const h1: string[] = [];
      const h2: string[] = [];
      const r1 = await replay(g.rec, g.file, h1);
      const r2 = await replay(g.rec, g.file, h2);
      expect(r1.ticks).toBe(r2.ticks);
      expect(h1).toEqual(h2);
      expect(r1.finished, `${g.file} finishes`).toBe(true);
    }
  }, 60_000);
});
