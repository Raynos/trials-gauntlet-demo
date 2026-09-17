/** Read-only production-Game / decoded-GLB census. This measures attachment and mass mapping;
 * it is neither visual evidence nor proof that inherited controls clear the changed solver.
 * Run: pnpm exec tsx harness/hero-contracts.ts [output.json] [additional-recording.json ...]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as THREE from 'three';
import type { InputRecording } from '../src/core/replay';
import { iterateFrames } from '../src/core/replay';
import { Game } from '../src/game/game';
import { createBikePhysicsV2 } from '../src/physics/v2/bike';
import { BIKE_GEOMETRY_V2 } from '../src/render/hero/assetFrame';
import { FrameBuilder, type RenderFrame } from '../src/render/frame';
import type { GameRenderer } from '../src/render/index';
import { GltfBike } from '../src/render/hero/gltfBike';
import { boneName, GltfRider } from '../src/render/hero/gltfRider';
import { loadRig } from '../src/render/hero/gltfTestUtils';
import type { MaterialLibrary } from '../src/render/materials/library';

const output = process.argv[2] ?? 'harness/out/blender/hero-contracts.json';
const lib = { complete() {} } as unknown as MaterialLibrary;
Object.assign(globalThis, { document: { createElement: () => ({ width: 128, height: 64,
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), scale() {}, fillRect() {} }) }) } });

async function sourceFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) result.push(...await sourceFiles(path));
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) result.push(path);
  }
  return result;
}
// Ask 43: the live hero family (src/render/hero/urls.ts) — a file per bike class and per outfit; the census takes the
// class the recording names and one Street + one Race outfit (the Street files share a rig, so do the Race ones).
const bikeAssets = { rookie: ['bike-rookie.glb', 'bike-rookie-lod.glb'], pro: ['bike-pro.glb', 'bike-pro-lod.glb'] } as const;
const riderAssets = ['rider-street-mustard.glb', 'rider-street-mustard-lod.glb', 'rider-race-bluewhite.glb', 'rider-race-bluewhite-lod.glb'] as const;
const assets = [...bikeAssets.rookie, ...bikeAssets.pro, ...riderAssets];
let inputs: string[] = [];
for (const dir of await readdir('harness/inputs', { withFileTypes: true })) if (dir.isDirectory()) {
  for (const file of await readdir(`harness/inputs/${dir.name}`)) if (/^bot-3(?:-pro)?\.json$/.test(file)) inputs.push(`harness/inputs/${dir.name}/${file}`);
}
inputs.push('harness/inputs/flat-test/crash.json', 'harness/inputs/flat-test/restart-tap.json');
inputs = [...new Set([...inputs, ...process.argv.slice(3)])].sort();
if (process.env['HERO_CENSUS_INPUT']) inputs = inputs.filter(path => path.includes(process.env['HERO_CENSUS_INPUT']!));
if (!inputs.length) throw new Error('No recordings match HERO_CENSUS_INPUT');
const sources = [...await sourceFiles('src/physics'), ...await sourceFiles('src/game'), ...await sourceFiles('src/core'), ...await sourceFiles('src/tracks'),
  ...await sourceFiles('src/render/hero'), 'src/render/frame.ts', 'harness/hero-contracts.ts',
  ...assets.map(f => `public/models/${f}`), ...inputs];
async function fingerprints() {
  const result: Record<string, string> = {};
  for (const path of sources) result[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  return result;
}
const sourceSha256 = await fingerprints();
const documents = new Map(await Promise.all(assets.map(async f => [f, await loadRig(f)] as const)));

type Witness = { value: number; inputTick: number; phase: string };
const metric = (): Witness => ({ value: 0, inputTick: 0, phase: '' });
function record(m: Witness, value: number, inputTick: number, phase: string) {
  if (value > m.value || !Number.isFinite(value)) Object.assign(m, { value, inputTick, phase });
}
function point(root: THREE.Object3D, name: string): THREE.Vector3 {
  return root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
}
function riderMeter(bike: GltfBike) {
  const nodes = new Map<string, THREE.Object3D>();
  // Traverse only this instance; both outfits can be mounted on the same frame in the census.
  const own = bike.frame.children.at(-1)!;
  own.traverse(n => nodes.set(boneName(n.name), n));
  const p = (n: string) => bike.frame.worldToLocal(nodes.get(n)!.getWorldPosition(new THREE.Vector3()));
  const dir = (n: string) => new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().copy(bike.frame.matrixWorld).invert().multiply(nodes.get(n)!.matrixWorld));
  return (f: RenderFrame) => {
    const hips = p('pelvis').addScaledVector(dir('pelvis'), .02), shoulder = p('neck');
    const com = hips.clone().lerp(shoulder, .5).multiplyScalar(.4346);
    com.addScaledVector(shoulder.clone().addScaledVector(dir('neck'), .175), .0694);
    let grip = 0, sole = 0, length = 0, elbowSide = Infinity;
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
      for (const [a, b, fraction, mass, nominal] of [['upperArm', 'forearm', .5772, .0271, .32], ['forearm', 'hand', .4574, .0162, .27], ['thigh', 'shin', .4095, .1416, .46], ['shin', 'foot', .4395, .0433, .43]] as const) {
        const start = p(`${a}.${side}`), end = p(`${b}.${side}`);
        length = Math.max(length, Math.abs(start.distanceTo(end) - nominal));
        com.addScaledVector(start.lerp(end, fraction), mass);
      }
      const socket = p(`gripSocket.${side}`);
      com.addScaledVector(socket, .0061);
      com.addScaledVector(p(`foot.${side}`).add(new THREE.Vector3(.06, -.055, 0)), .0137);
      grip = Math.max(grip, socket.distanceTo(new THREE.Vector3(.27, .78, sign * .33)));
      sole = Math.max(sole, p(`soleSocket.${side}`).distanceTo(new THREE.Vector3(-.14, .031, sign * .2)));
      const shoulder = p(`upperArm.${side}`), elbow = p(`forearm.${side}`), wrist = p(`hand.${side}`);
      const axis = wrist.sub(shoulder).normalize(), bend = elbow.sub(shoulder), pole = new THREE.Vector3(.6, .5, sign);
      bend.addScaledVector(axis, -bend.dot(axis)); pole.addScaledVector(axis, -pole.dot(axis));
      elbowSide = Math.min(elbowSide, bend.dot(pole));
    }
    const target = new THREE.Vector3(f.bikeX + f.riderBody.relX * Math.cos(f.bikeAngle) - f.riderBody.relY * Math.sin(f.bikeAngle),
      f.bikeY + f.riderBody.relX * Math.sin(f.bikeAngle) + f.riderBody.relY * Math.cos(f.bikeAngle), 0);
    bike.frame.worldToLocal(target);
    return { grip, sole, length, com: com.distanceTo(target), elbowBackwards: Math.max(0, -elbowSide),
      finite: [...nodes.values()].every(n => n.matrixWorld.elements.every(Number.isFinite)) };
  };
}

const rows = [];
for (const input of inputs) {
  const rec = JSON.parse(await readFile(input, 'utf8')) as InputRecording;
  const adapted = input.endsWith('/crash.json') || input.endsWith('/restart-tap.json');
  if (rec.header.version !== 1 || rec.header.physicsHz !== 120 || (!adapted && rec.header.physics !== 'v2')) throw new Error(`unsupported recording ${input}`);
  const cls = rec.header.bike ?? 'rookie';
  const game = new Game({ physics: createBikePhysicsV2(120), renderer: { setTrack() {}, onEvent() {}, setQuality() {}, setBikeClass() {} } as unknown as GameRenderer,
    physicsHz: 120, autoSkipCountdown: true, autoRecord: false, ghostEnabled: false });
  game.loadTrack(rec.header.trackId, rec.header.seed, cls);
  const bikes = bikeAssets[cls].map(asset => {
    const gltf = documents.get(asset)!;
    const chain = gltf.scene.getObjectByName('chain') as THREE.Mesh;
    chain.material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const bike = new GltfBike(gltf, lib); bike.setLivery(cls);
    const axis = point(bike.root, 'attach_fork_top').sub(point(bike.root, 'attach_front_axle_rest')).normalize();
    return { asset, bike, axis, metrics: { wheel: metric(), wheelAngle: metric(), swingAxle: metric(), shockEye: metric(), fork: metric(), rearPhysical: metric(), frontPhysical: metric() } };
  });
  const riders = riderAssets.map(asset => {
    const bike = bikes[asset.includes('-lod') ? 1 : 0]!.bike;
    const rider = new GltfRider(documents.get(asset)!, lib); rider.attach(bike); rider.setLivery(cls);
    return { asset, rider, bike, measure: riderMeter(bike), metrics: { grip: metric(), sole: metric(), length: metric(), com: metric(), elbowBackwards: metric() } };
  });
  const frames = new FrameBuilder(); let inputTick = 0, ridingFrames = 0, ragdollFrames = 0, finishedFrames = 0, cuts = 0, finite = true;
  for (const sample of iterateFrames(rec)) {
    game.setInput(sample); game.step(1); inputTick++;
    const f = frames.build(game.getState(), 1), phase = game.phase();
    cuts += Number(f.cut); finishedFrames += Number(f.finished);
    for (const { bike, axis, metrics } of bikes) {
      bike.update(f); bike.root.updateMatrixWorld(true);
      finite &&= bike.frame.matrixWorld.elements.every(Number.isFinite);
      const c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle), geometry = BIKE_GEOMETRY_V2;
      const fx = (f.front.x - f.bikeX) * c + (f.front.y - f.bikeY) * s - .715;
      const fy = -(f.front.x - f.bikeX) * s + (f.front.y - f.bikeY) * c + .21;
      const rx = (f.rear.x - f.bikeX) * c + (f.rear.y - f.bikeY) * s - geometry.chassisToAxle.x - geometry.swingPivot.x;
      const ry = -(f.rear.x - f.bikeX) * s + (f.rear.y - f.bikeY) * c - geometry.chassisToAxle.y - geometry.swingPivot.y;
      record(metrics.frontPhysical, Math.abs(fx * geometry.forkAxis.y - fy * geometry.forkAxis.x), inputTick, phase);
      record(metrics.rearPhysical, Math.abs(Math.hypot(rx, ry) - geometry.swingRadius), inputTick, phase);
      record(metrics.swingAxle, point(bike.root, 'attach_swing_axle').distanceTo(new THREE.Vector3(f.rear.x, f.rear.y, 0)), inputTick, phase);
      record(metrics.shockEye, point(bike.root, 'attach_shock_eye').distanceTo(point(bike.root, 'attach_shock_link')), inputTick, phase);
      const file = bike.root.getObjectByName('bike')!;
      const front = file.worldToLocal(point(bike.root, 'wheel_front')), top = file.worldToLocal(point(bike.root, 'attach_fork_top'));
      record(metrics.fork, front.sub(top).cross(axis).length(), inputTick, phase);
      for (const [name, wheel] of [['wheel_rear', f.rear], ['wheel_front', f.front]] as const) {
        const object = bike.root.getObjectByName(name)!, m = object.matrixWorld.elements, angle = Math.atan2(m[1]!, m[0]!);
        record(metrics.wheel, object.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(wheel.x, wheel.y, 0)), inputTick, phase);
        record(metrics.wheelAngle, Math.abs(Math.atan2(Math.sin(angle + wheel.spin), Math.cos(angle + wheel.spin))), inputTick, phase);
      }
    }
    for (const r of riders) {
      r.rider.update(f); r.bike.root.updateMatrixWorld(true); r.rider.root.updateMatrixWorld(true);
      r.rider.root.traverse(n => { finite &&= n.matrixWorld.elements.every(Number.isFinite); });
    }
    if (f.ragdoll) { ragdollFrames++; continue; }
    ridingFrames++;
    for (const r of riders) {
      const m = r.measure(f); finite &&= m.finite;
      for (const name of ['grip', 'sole', 'length', 'com', 'elbowBackwards'] as const) record(r.metrics[name], m[name], inputTick, phase);
    }
  }
  rows.push({ input, bikeClass: cls, inputAdaptation: adapted ? 'Legacy inputs explicitly exercised on V2; no claim of reproducing the V1 recording.' : null,
    inputTicks: inputTick, ridingFrames, ragdollFrames, finishedFrames, cuts, finite, phase: game.phase(), counters: game.counters(),
    bikes: bikes.map(({ asset, metrics }) => ({ asset, metrics })), riders: riders.map(({ asset, metrics }) => ({ asset, metrics })) });
  for (const { rider } of riders) rider.dispose();
  for (const { bike } of bikes) bike.dispose();
  process.stdout.write(`${input}: ${inputTick} inputs, ${game.phase()}, ${ridingFrames} ridden / ${ragdollFrames} ragdoll\n`);
}
const endSha256 = await fingerprints(), sourceUnchanged = JSON.stringify(sourceSha256) === JSON.stringify(endSha256);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ method: 'Production Game at 120 Hz, alpha=1 every input tick; actual full/LOD GLBs decoded through GLTFLoader+Meshopt, only images/material bindings removed. Source hashes bind mechanics, renderer, game, inputs and assets. This is numeric evidence, not a played or aesthetic verdict.',
  sourceSha256, sourceUnchanged, rows }, null, 2) + '\n');
if (!sourceUnchanged) throw new Error(`Sources changed during census; ${output} is diagnostic only and must be rerun.`);
process.stdout.write(`Wrote ${output}\n`);
