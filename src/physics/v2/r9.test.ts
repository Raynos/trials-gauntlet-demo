/**
 * R9 rows (physics.md "v2 status - R9"): the drawn / physical pose split. The servo keeps R8's physical table
 * (`tuning.rider.poses`); Astra's seated table (`DRAWN`, docs/evidence/hero-r15/seated-candidate.patch) is what the
 * hero draws, exported at `riderBody.drawn` as a pure function of the body's state and never hashed. Every row prints
 * `FEEL <quantity> = <value> [band]`.
 */
import { describe, expect, it } from 'vitest';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from './bike';
import { BIKE_CLASSES_V2, bikeTuningV2, type BikeClassV2 } from './tuning';
import { DRAWN, DRAWN_SEAT, drawnBody, drawnPose, drawnPoseId, GRIP_X, GRIP_Y, CH, type DrawnPoseId } from './rider';
import { makeTrack } from '../testTracks';
import { stepN } from '../controllers';
import { quantizeInput } from '../../core/replay';
import { hashPhysicsState } from '../../core/hash';

const HZ = 120;
const DEG = 180 / Math.PI;
const f = (x: number, d = 3): string => (Number.isNaN(x) ? 'nan' : x.toFixed(d));
function feel(name: string, value: number | string, band: string): void {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
}

/** R8's physical table, verbatim (tuning.ts): the rows the hop / landing / wheelie tables are green on. */
const PHYSICAL_R8 = [
  { lean: -1, x: -0.42, y: 0.37, psi: 0.17 },
  { lean: -0.5, x: -0.27, y: 0.5, psi: 0.08 },
  { lean: 0, x: -0.12, y: 0.62, psi: 0 },
  { lean: 0.5, x: -0.03, y: 0.65, psi: -0.12 },
  { lean: 1, x: 0.06, y: 0.67, psi: -0.24 },
];

function row(pose: DrawnPoseId, blend: number): { hipX: number; hipY: number; torso: number; head: number } {
  const o = { hipX: 0, hipY: 0, torso: 0, head: 0 };
  drawnPose(pose, blend, o);
  return o;
}
/** Shoulders -> grip distance of a drawn row (planar; the arm's extension). */
function armLen(r: { hipX: number; hipY: number; torso: number }): number {
  const sx = r.hipX + CH.torso * Math.cos(r.torso);
  const sy = r.hipY + CH.torso * Math.sin(r.torso);
  return Math.hypot(GRIP_X - sx, GRIP_Y - sy);
}
function pelvisBottomY(r: { hipY: number; torso: number }): number {
  return r.hipY - DRAWN_SEAT.pelvisDrop * Math.sin(r.torso);
}

function flatWorld(cls: BikeClassV2): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}

describe('R9: the drawn / physical pose split (Astra\'s seated table is drawn; R8\'s standing table is held)', () => {
  it('the drawn table is a pure function of (pose id, blend): the same inputs give the same row, the -1 / 0 / +1 rows are Astra\'s seated candidate verbatim, and every column is linear in the blend', () => {
    for (const [lean, pose, blend] of [[-1, 'back', 1], [-0.25, 'back', 0.25], [0, 'seated', 0], [0.5, 'forward', 0.5], [1, 'forward', 1], [1.7, 'forward', 1], [-3, 'back', 1]] as const) {
      const id = drawnPoseId(lean);
      expect(id.pose).toBe(pose);
      expect(id.blend).toBeCloseTo(blend, 12);
    }
    for (const pose of ['back', 'seated', 'forward'] as const) {
      for (const b of [0, 0.3, 1]) {
        const a = row(pose, b);
        const c = row(pose, b);
        expect(a).toEqual(c);
      }
      const full = row(pose, 1);
      expect(full.hipX).toBeCloseTo(DRAWN[pose].hipX, 12);
      expect(full.hipY).toBeCloseTo(DRAWN[pose].hipY, 12);
      expect(full.torso * DEG).toBeCloseTo(DRAWN[pose].torso, 9);
      expect(full.head * DEG).toBeCloseTo(DRAWN[pose].head, 9);
      const zero = row(pose, 0);
      expect(zero).toEqual(row('seated', 0));
      // linear: the half blend is the midpoint
      const half = row(pose, 0.5);
      for (const k of ['hipX', 'hipY', 'torso', 'head'] as const) expect(half[k]).toBeCloseTo(0.5 * (zero[k] + full[k]), 12);
      feel(`r9.drawn.${pose}`, `hips (${f(full.hipX)}, ${f(full.hipY)}) torso ${f(full.torso * DEG, 0)} head ${f(full.head * DEG, 0)} arm ${f(armLen(full))} pelvis-bottom ${f(pelvisBottomY(full))}`, 'Astra seated candidate (axle frame)');
    }
  });

  it('Astra\'s pose requirements on the drawn table: seated = the pelvis on the seat (bottom within 2 cm of the seat top, hips over its span); forward = rise off the seat (>= 0.15 m) and lean the torso in (<= 45 deg); back = hips >= 0.3 m rearward, off the seat\'s back edge, arms extended (longer than seated)', () => {
    const seated = row('seated', 0);
    const fwd = row('forward', 1);
    const back = row('back', 1);
    feel('r9.seated.pelvisGap', pelvisBottomY(seated) - DRAWN_SEAT.topY, '|gap| <= 0.02 m');
    expect(Math.abs(pelvisBottomY(seated) - DRAWN_SEAT.topY)).toBeLessThanOrEqual(0.02);
    expect(seated.hipX).toBeGreaterThanOrEqual(DRAWN_SEAT.rearX);
    expect(seated.hipX).toBeLessThanOrEqual(DRAWN_SEAT.frontX);
    feel('r9.forward.rise', fwd.hipY - seated.hipY, '>= 0.15 m');
    expect(fwd.hipY - seated.hipY).toBeGreaterThanOrEqual(0.15);
    expect(fwd.torso * DEG).toBeLessThanOrEqual(45);
    expect(fwd.torso).toBeLessThan(seated.torso);
    feel('r9.back.rearward', seated.hipX - back.hipX, '>= 0.3 m');
    expect(seated.hipX - back.hipX).toBeGreaterThanOrEqual(0.3);
    expect(back.hipX).toBeLessThan(DRAWN_SEAT.rearX);
    feel('r9.back.armExtension', armLen(back) - armLen(seated), '> 0 (arms toward the bars)');
    expect(armLen(back)).toBeGreaterThan(armLen(seated));
    expect(armLen(back)).toBeLessThanOrEqual(CH.upperArm + CH.forearm);
  });

  it('the physical table is R8\'s, unchanged, on both classes (the servo target did not move: the hop / landing / wheelie rows are that table\'s)', () => {
    for (const cls of BIKE_CLASSES_V2) expect(bikeTuningV2(cls).rider.poses).toEqual(PHYSICAL_R8);
  });

  it('the export: riderBody.drawn is drawnBody(lean, height below the target, angle behind it) on every tick; a held -1 / 0 / +1 on the flat draws back / seated / forward; hashPhysicsState is blind to it', () => {
    for (const cls of BIKE_CLASSES_V2) {
      for (const [lean, pose] of [[-1, 'back'], [0, 'seated'], [1, 'forward']] as const) {
        const w = flatWorld(cls);
        stepN(w, { throttle: 0.3, lean }, 120);
        const s = w.getState();
        const d = s.riderBody!.drawn!;
        // lean 0: the body rides a few mm behind its target on the flat, so the effective lean reads ~ -0.01 (a 'back' blend under 0.05)
        if (lean === 0) expect(d.blend).toBeLessThan(0.05);
        else expect(d.pose).toBe(pose);
        const dbg = w.debug();
        const want = { pose: 'seated' as DrawnPoseId, blend: 0, hips: { x: 0, y: 0 }, torso: 0, head: 0 };
        // the excursion: the body's chassis-frame height below its target (debug's poseTarget is the state's) and its angle behind it
        const c = Math.cos(s.bike.angle);
        const sn = Math.sin(s.bike.angle);
        const rx = s.riderBody!.pos.x - s.bike.pos.x;
        const ry = s.riderBody!.pos.y - s.bike.pos.y;
        const ly = -rx * sn + ry * c;
        drawnBody(s.rider.lean, ly - dbg.poseTarget.y, s.riderBody!.angle - s.bike.angle - dbg.poseTarget.psi, want);
        expect(d.hips.x).toBeCloseTo(want.hips.x, 9);
        expect(d.hips.y).toBeCloseTo(want.hips.y, 9);
        expect(d.torso).toBeCloseTo(want.torso, 9);
        expect(d.head).toBeCloseTo(want.head, 9);
        feel(`r9.export.${cls}.lean${lean}`, `${d.pose} ${f(d.blend, 2)} hips (${f(d.hips.x)}, ${f(d.hips.y)}) torso ${f(d.torso * DEG, 0)} head ${f(d.head * DEG, 0)}`, 'the drawn table at the effective lean');
        const h1 = hashPhysicsState(s);
        const bare = { ...s, riderBody: { pos: s.riderBody!.pos, angle: s.riderBody!.angle, vel: s.riderBody!.vel, angVel: s.riderBody!.angVel } };
        expect(hashPhysicsState(bare)).toBe(h1);
      }
    }
  });

  it('the landing sit is not drawn through the seat: a 3 m flat drop at lean 0 sits the physical hips to the seat line (R8) while the drawn seated hips never go below the seated height; the same drop at lean +0.5 (hips 0.1 m over the seat) draws the sink to the seat and no further', () => {
    for (const cls of BIKE_CLASSES_V2) {
      for (const lean of [0, 0.5]) {
        const w = flatWorld(cls);
        const s0 = w.getState();
        w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + 3 }, angle: 0, vel: { x: 6, y: 0 } });
        let minDrawn = Infinity;
        let minPhysHip = Infinity;
        let minTable = Infinity;
        let maxSink = 0;
        let belowSeat = 0;
        const tmp = { hipX: 0, hipY: 0, torso: 0, head: 0 };
        const s = stepN(w, { throttle: 0.2, lean }, HZ * 2, (st) => {
          const d = st.riderBody!.drawn!;
          drawnPose(d.pose, d.blend, tmp);
          minDrawn = Math.min(minDrawn, d.hips.y);
          minTable = Math.min(minTable, tmp.hipY);
          maxSink = Math.max(maxSink, tmp.hipY - d.hips.y);
          // the invariant: never drawn below the table row's own height when that is at or under the seated height, never below the seated height otherwise
          if (d.hips.y < Math.min(tmp.hipY, DRAWN.seated.hipY) - 1e-9) belowSeat++;
          // the physical hip point in the chassis frame (the hold's seat limit reads it; R8: sits to seatY 0.20 on this drop)
          const c = Math.cos(st.bike.angle);
          const sn = Math.sin(st.bike.angle);
          const rx = st.riderBody!.pos.x - st.bike.pos.x;
          const ry = st.riderBody!.pos.y - st.bike.pos.y;
          const ly = -rx * sn + ry * c;
          minPhysHip = Math.min(minPhysHip, ly - bikeTuningV2(cls).rider.comFromHips.y);
        });
        feel(`r9.sit.${cls}.lean${lean}`, `physical hips min ${f(minPhysHip)} (seat line ${f(bikeTuningV2(cls).rider.hold.seatY, 2)}) drawn hips min ${f(minDrawn)} table min ${f(minTable)} sink drawn ${f(maxSink)} ${s.faulted ?? 'rides away'}`, 'drawn >= seated height; physical sits');
        expect(s.faulted).toBeNull();
        expect(minPhysHip).toBeLessThan(0.3); // the R8 sit (hips 0.187-0.198 on the punch)
        expect(belowSeat).toBe(0);
        // at lean 0 the read lean dips a little back / forward through the sit: the table row moves, the sink drawn is at most the
        // room a slightly-forward read has (< 2 cm); at +0.5 the drawn hips start 0.1 m over the seat and sink to it
        if (lean === 0) expect(maxSink).toBeLessThan(0.02);
        else expect(maxSink).toBeGreaterThan(0.05);
      }
    }
  });

  it('a lean pressed in place moves the drawn pose without moving the physics: the flat-test hash with the export is the R8 golden\'s (determinism D1 covers the recording; here the state hash of 600 ticks of a scripted ride is identical with `drawn` deleted)', () => {
    const w = flatWorld('rookie');
    let withDrawn = '';
    let without = '';
    for (let i = 0; i < 600; i++) {
      const t = i / HZ;
      w.step(quantizeInput({ throttle: 0.5, lean: t < 2 ? -1 : t < 3 ? 1 : 0 }));
      const s = w.getState();
      withDrawn = hashPhysicsState(s);
      const { drawn: _d, ...rb } = s.riderBody!;
      without = hashPhysicsState({ ...s, riderBody: rb });
      expect(withDrawn).toBe(without);
    }
    expect(withDrawn).toBe(without);
  });
});
