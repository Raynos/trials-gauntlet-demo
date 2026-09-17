/**
 * Ask 51 step 3: the in-level hands / elbows trace over the b1 goldens (rookie `bot-3.json`, pro `bot-3-pro.json`),
 * the real physics (`Game` + v2 at the recording's Hz) driving `GltfRider` tick by tick, measured from the posed
 * joints in the bike frame — not from the driver's own debug fields except `wristErr` (the IK's reach shortfall).
 * Bars: grip socket ≤ 2 cm from the grip on every ridden tick, elbow never above the shoulder joint, elbow ≤ 175°.
 *   npx tsx docs/evidence/hero-art/pose-compare/trace.mts [--label=before|after] [--outfit=street-mustard] [--out=DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const ROOT = new URL('../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { loadRig } = await import(`${ROOT}/src/render/hero/gltfTestUtils.ts`);
const { prepareHero } = await import(`${ROOT}/src/render/hero/lod.ts`);
const { GltfRider, boneName } = await import(`${ROOT}/src/render/hero/gltfRider.ts`);
const { BIKE_GEOMETRY_V2 } = await import(`${ROOT}/src/render/hero/assetFrame.ts`);
const { Game } = await import(`${ROOT}/src/game/game.ts`);
const { createBikePhysicsV2 } = await import(`${ROOT}/src/physics/v2/bike.ts`);
const { FrameBuilder } = await import(`${ROOT}/src/render/frame.ts`);

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const label = args.get('label') ?? 'trace';
const outfit = args.get('outfit') ?? 'street-mustard';
const outDir = args.get('out') ?? path.dirname(new URL(import.meta.url).pathname);
const gltf = await loadRig(`rider-${outfit}.glb`);
await prepareHero(gltf);
const GRIP = (s: number) => new THREE.Vector3(0.27, 0.78, s * 0.33);
const SOLE = (s: number) => new THREE.Vector3(-0.14, 0.031, s * 0.2);
const deg = (r: number) => r * 180 / Math.PI;

interface Row { tick: number; grip: number; sole: number; wrist: number; ankle: number; elbow: number; elbowUp: number; torso: number; pose: string; blend: number; air: boolean; lean: number; land: number; extend: number; dy: number; lag: number; limit: number }

function run(cls: 'rookie' | 'pro'): { rows: Row[]; summary: Record<string, number | string> } {
  const rec = JSON.parse(fs.readFileSync(`${ROOT}/harness/inputs/b1-first-ride/bot-3${cls === 'pro' ? '-pro' : ''}.json`, 'utf8')) as { header: { trackId: string; seed: number; physicsHz: number; bike: string }; runs: number[][] };
  const physics = createBikePhysicsV2(rec.header.physicsHz);
  const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as never, physicsHz: rec.header.physicsHz, autoSkipCountdown: true, ghostEnabled: false });
  game.loadTrack(rec.header.trackId, rec.header.seed, cls);
  const frames = new FrameBuilder();
  const frame = new THREE.Group();
  const rider = new GltfRider(gltf, { complete() {} } as never);
  rider.attach({ frame } as never);
  const nodes = new Map<string, THREE.Object3D>();
  frame.traverse((o: THREE.Object3D) => nodes.set(boneName(o.name), o));
  const point = (n: string) => frame.worldToLocal(nodes.get(n)!.getWorldPosition(new THREE.Vector3()));
  const rows: Row[] = [];
  let tick = 0, ridden = 0, gripOver2 = 0, elbowAbove = 0, elbowOver175 = 0, limited = 0, seated = 0, flat = 0, flatSeated = 0, run = 0, longestRun = 0, transitions = 0;
  const runs: number[] = [];
  const peak = { grip: 0, gripTick: 0, sole: 0, wrist: 0, wristTick: 0, elbow: 0, elbowUp: -1, elbowUpTick: 0 };
  outer: for (const [count, throttle, brake, lean, flags] of rec.runs) for (let i = 0; i < count!; i++) {
    tick++;
    game.setInput({ throttle: throttle! / 255, brake: brake! / 255, lean: lean! / 127, hop: Boolean(flags! & 1), restart: Boolean(flags! & 2) });
    game.step(1);
    const st = game.getState();
    const f = frames.build(st, 1);
    const offset = BIKE_GEOMETRY_V2.chassisToAxle;
    const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, 0);
    frame.rotation.z = f.bikeAngle;
    frame.updateMatrixWorld(true);
    rider.update(f);
    frame.updateMatrixWorld(true);
    if (f.ragdoll || !f.riderBody.present) { if (st.finished) break outer; continue; }
    ridden++;
    let grip = 0, sole = 0, elbow = 0, elbowUp = -Infinity;
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
      grip = Math.max(grip, point(`gripSocket.${side}`).distanceTo(GRIP(sign)));
      sole = Math.max(sole, point(`soleSocket.${side}`).distanceTo(SOLE(sign)));
      const sh = point(`upperArm.${side}`), el = point(`forearm.${side}`), wr = point(`hand.${side}`);
      elbow = Math.max(elbow, deg(sh.clone().sub(el).angleTo(wr.clone().sub(el))));
      elbowUp = Math.max(elbowUp, el.y - sh.y);
    }
    const t = point('neck').sub(point('pelvis'));
    const d = rider.debug as { wristErr: number[]; ankleErr: number[]; stance?: { on: boolean; pose: string; blend: number; land: number; extend: number; dy: number; lag: number; limit: number } };
    const row: Row = { tick, grip, sole, wrist: Math.max(...d.wristErr), ankle: Math.max(...d.ankleErr), elbow, elbowUp, torso: deg(Math.atan2(t.y, t.x)), pose: d.stance?.on ? d.stance.pose : '-', blend: d.stance?.blend ?? 0, air: f.airborne, lean: f.rider.lean, land: d.stance?.land ?? 0, extend: d.stance?.extend ?? 0, dy: d.stance?.dy ?? 0, lag: d.stance?.lag ?? 0, limit: d.stance?.limit ?? 1 };
    rows.push(row);
    if (grip > 0.02) gripOver2++;
    if (elbowUp > 0) elbowAbove++;
    if (elbow > 175) elbowOver175++;
    if (row.limit < 1) limited++;
    // Seated = the stance weight under 0.2; flat = both wheels down and the bike within 6° of level; a transition = a run of ticks with the weight strictly between 0 and 1.
    const w = row.blend;
    if (w < 0.2) seated++;
    if (f.rear.grounded && f.front.grounded && Math.abs(f.bikeAngle) < 0.1) { flat++; if (w < 0.2) flatSeated++; }
    if (w > 0 && w < 1) run++;
    else { if (run > 0) { transitions++; runs.push(run); } longestRun = Math.max(longestRun, run); run = 0; }
    if (grip > peak.grip) { peak.grip = grip; peak.gripTick = tick; }
    if (row.wrist > peak.wrist) { peak.wrist = row.wrist; peak.wristTick = tick; }
    peak.sole = Math.max(peak.sole, sole);
    peak.elbow = Math.max(peak.elbow, elbow);
    if (elbowUp > peak.elbowUp) { peak.elbowUp = elbowUp; peak.elbowUpTick = tick; }
    if (st.finished) break outer;
  }
  const summary = { cls, ticks: tick, ridden, gripPeakCm: +(peak.grip * 100).toFixed(1), gripPeakTick: peak.gripTick, ticksGripOver2cm: gripOver2, wristErrPeakCm: +(peak.wrist * 100).toFixed(1), wristErrPeakTick: peak.wristTick, solePeakCm: +(peak.sole * 100).toFixed(2), elbowMaxDeg: +peak.elbow.toFixed(1), ticksElbowOver175: elbowOver175, elbowUpMaxCm: +(peak.elbowUp * 100).toFixed(1), elbowUpTick: peak.elbowUpTick, ticksElbowAboveShoulder: elbowAbove, ticksReachLimited: limited, seatedShare: +(seated / ridden).toFixed(3), flatTicks: flat, flatSeatedShare: +(flatSeated / Math.max(1, flat)).toFixed(3), transitions, transitionsWithin30Ticks: runs.filter((r) => r <= 30).length, medianTransitionTicks: runs.length ? runs.slice().sort((a, b) => a - b)[Math.floor(runs.length / 2)]! : 0, longestTransitionTicks: longestRun, finished: String(game.getState().finished) };
  return { rows, summary };
}

const result: Record<string, unknown> = { label, outfit, when: new Date().toISOString() };
for (const cls of ['rookie', 'pro'] as const) {
  const { rows, summary } = run(cls);
  console.log(JSON.stringify(summary));
  result[cls] = { summary, every10: rows.filter((r) => r.tick % 10 === 0).map((r) => ({ ...r, grip: +(r.grip * 100).toFixed(1), sole: +(r.sole * 100).toFixed(2), wrist: +(r.wrist * 100).toFixed(1), ankle: +(r.ankle * 100).toFixed(1), elbow: +r.elbow.toFixed(1), elbowUp: +(r.elbowUp * 100).toFixed(1), torso: +r.torso.toFixed(1), blend: +r.blend.toFixed(2), lean: +r.lean.toFixed(2) })) };
}
fs.writeFileSync(path.join(outDir, `trace-${label}.json`), JSON.stringify(result, null, 1));
console.log('wrote', path.join(outDir, `trace-${label}.json`));
