/**
 * Ask 51 step 1: the authored `sit_cruise` frame vs the game's garage pose (GltfRider on the frozen spawn state),
 * as a bone-angle table in the axle frame. Run: npx tsx <this file> [outfit]
 */
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
const ROOT = new URL('../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { loadRig } = await import(`${ROOT}/src/render/hero/gltfTestUtils.ts`);
const { prepareHero } = await import(`${ROOT}/src/render/hero/lod.ts`);
const { GltfRider, boneName } = await import(`${ROOT}/src/render/hero/gltfRider.ts`);
const { BIKE_GEOMETRY_V2 } = await import(`${ROOT}/src/render/hero/assetFrame.ts`);
const { Game } = await import(`${ROOT}/src/game/game.ts`);
const { createBikePhysicsV2 } = await import(`${ROOT}/src/physics/v2/bike.ts`);
const { FrameBuilder } = await import(`${ROOT}/src/render/frame.ts`);

const outfit = process.argv[2] ?? 'street-mustard';
const gltf = await loadRig(`rider-${outfit}.glb`);
await prepareHero(gltf);
const SHIFT = 0.65;
const GRIP = (s: number) => new THREE.Vector3(0.27, 0.78, s * 0.33);
const SOLE = (s: number) => new THREE.Vector3(-0.14, 0.031, s * 0.2);
const deg = (r: number) => +(r * 180 / Math.PI).toFixed(1);

type Points = Map<string, THREE.Vector3>;
function angleAt(p: Points, a: string, b: string, c: string): number {
  const u = p.get(a)!.clone().sub(p.get(b)!), v = p.get(c)!.clone().sub(p.get(b)!);
  return deg(u.angleTo(v));
}
function pitch(p: Points, a: string, b: string): number { // degrees of the a→b segment above +x (bike forward)
  const d = p.get(b)!.clone().sub(p.get(a)!);
  return deg(Math.atan2(d.y, d.x));
}
function table(p: Points): Record<string, number | string> {
  const row: Record<string, number | string> = {};
  for (const s of ['L', 'R']) {
    row[`elbow${s}`] = angleAt(p, `upperArm.${s}`, `forearm.${s}`, `hand.${s}`);
    row[`shoulder${s}`] = angleAt(p, `forearm.${s}`, `upperArm.${s}`, 'pelvis'); // upper arm vs the torso line down to the pelvis
    row[`hip${s}`] = angleAt(p, 'neck', 'pelvis', `shin.${s}`);
    row[`knee${s}`] = angleAt(p, `thigh.${s}`, `shin.${s}`, `foot.${s}`);
    row[`grip${s}`] = +(p.get(`gripSocket.${s}`)!.distanceTo(GRIP(s === 'L' ? 1 : -1)) * 100).toFixed(1);
    row[`sole${s}`] = +(p.get(`soleSocket.${s}`)!.distanceTo(SOLE(s === 'L' ? 1 : -1)) * 100).toFixed(1);
    // elbow height above the shoulder joint (cm; > 0 = elbow above shoulder)
    row[`elbowUp${s}`] = +((p.get(`forearm.${s}`)!.y - p.get(`upperArm.${s}`)!.y) * 100).toFixed(1);
  }
  row.torsoPitch = pitch(p, 'pelvis', 'neck');
  row.headPitch = pitch(p, 'neck', 'head');
  row.hipsX = +(p.get('pelvis')!.x * 100).toFixed(1);
  row.hipsY = +(p.get('pelvis')!.y * 100).toFixed(1);
  row.neckY = +(p.get('neck')!.y * 100).toFixed(1);
  return row;
}

// --- A: the authored clip evaluated on the loaded skeleton (file frame → axle frame: −SHIFT in x) -------------
function authored(clipName: string, t: number): Points {
  const scene = cloneSkeleton(gltf.scene);
  const holder = new THREE.Group();
  holder.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const clip = gltf.animations.find((c: THREE.AnimationClip) => c.name === clipName)!;
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(t);
  holder.updateMatrixWorld(true);
  const p: Points = new Map();
  scene.traverse((o: THREE.Object3D) => {
    const n = boneName(o.name);
    p.set(n, o.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(SHIFT, 0, 0)));
  });
  return p;
}

// --- B: the game's garage pose: GltfRider on the spawn state (menu phase; physics never steps) ----------------
function gameGarage(cls: 'rookie' | 'pro', stage = false): { p: Points; dbg: unknown; f: unknown } {
  const physics = createBikePhysicsV2(120);
  const game = new Game({ physics, renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as never, physicsHz: 120, autoSkipCountdown: true, ghostEnabled: false });
  game.loadTrack('b1-first-ride', 138717428, cls);
  const st = game.getState();
  const f = new FrameBuilder().build(st, 1);
  const frame = new THREE.Group();
  const rider = new GltfRider(gltf, { complete() {} } as never);
  rider.attach({ frame } as never);
  rider.setStage(stage);
  const offset = BIKE_GEOMETRY_V2.chassisToAxle;
  const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
  frame.position.set(f.bikeX + offset.x * c - offset.y * s, f.bikeY + offset.x * s + offset.y * c, 0);
  frame.rotation.z = f.bikeAngle;
  frame.updateMatrixWorld(true);
  rider.update(f);
  frame.updateMatrixWorld(true);
  const p: Points = new Map();
  frame.traverse((o: THREE.Object3D) => p.set(boneName(o.name), frame.worldToLocal(o.getWorldPosition(new THREE.Vector3()))));
  return { p, dbg: rider.debug, f: { riderBody: f.riderBody, rider: f.rider, bikeAngle: f.bikeAngle, rear: f.rear, front: f.front } };
}

const rows: Record<string, Record<string, number | string>> = {};
const cruise = gltf.animations.find((c: THREE.AnimationClip) => c.name === 'sit_cruise')!;
rows['sit_cruise t=0'] = table(authored('sit_cruise', 0));
rows['sit_cruise t=1.0'] = table(authored('sit_cruise', 1.0));
rows[`sit_cruise t=${cruise.duration.toFixed(2)}`] = table(authored('sit_cruise', cruise.duration - 1e-3));
for (const name of ['forward_attack', 'hang_back', 'compression', 'extension', 'landing_absorption']) {
  rows[`${name} t=2.25`] = table(authored(name, 2.25));
}
rows['bind pose'] = (() => { const scene = cloneSkeleton(gltf.scene); const h = new THREE.Group(); h.add(scene); h.updateMatrixWorld(true); const p: Points = new Map(); scene.traverse((o: THREE.Object3D) => p.set(boneName(o.name), o.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(SHIFT, 0, 0)))); return table(p); })();
const g = gameGarage('rookie');
rows['game garage rookie'] = table(g.p);
const gp = gameGarage('pro');
rows['game garage pro'] = table(gp.p);
const gs = gameGarage('rookie', true);
rows['game garage rookie, stage clip (after)'] = table(gs.p);
console.log(`outfit ${outfit}; sit_cruise duration ${cruise.duration.toFixed(3)} s, tracks ${cruise.tracks.length}`);
console.table(rows);
console.log('garage rookie frame', JSON.stringify(g.f));
console.log('garage rookie debug', JSON.stringify(g.dbg));
console.log('garage rookie STAGE debug', JSON.stringify(gs.dbg));
// sit_cruise variation across its length: max joint displacement vs t=0
{
  const p0 = authored('sit_cruise', 0);
  let worst = 0, worstName = '', worstT = 0;
  for (let t = 0; t < cruise.duration; t += 1 / 30) {
    const p = authored('sit_cruise', t);
    for (const [n, v] of p) { const d = v.distanceTo(p0.get(n)!); if (d > worst) { worst = d; worstName = n; worstT = t; } }
  }
  console.log(`sit_cruise max joint travel vs t=0: ${(worst * 1000).toFixed(3)} mm (${worstName} at t=${worstT.toFixed(2)})`);
}
