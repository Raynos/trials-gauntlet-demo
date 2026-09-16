/** Read-only production CPU pose measurement of existing played traces. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadRig } from '../../../src/render/hero/gltfTestUtils';
import { GltfRider, boneName } from '../../../src/render/hero/gltfRider';
import { FrameBuilder } from '../../../src/render/frame';
import { BIKE_GEOMETRY_V2 } from '../../../src/physics/v2/tuning';
const output = 'harness/out/blender/arms-r13';
await mkdir(output, { recursive: true });
const gltf = await loadRig('rider-street.glb');
gltf.scene.updateMatrixWorld(true);
const rest = new Map<string, THREE.Matrix4>();
gltf.scene.traverse(o => { if ((o as THREE.Bone).isBone) rest.set(boneName(o.name), o.matrixWorld.clone()); });
const reports = [];
for (const capture of ['played-hop-full', 'played-crash-full-close']) {
  const path = capture === 'played-hop-full' ? 'harness/out/blender/arms-r13/before-hop/evidence.json' : `harness/out/blender/openface-r12/${capture}/evidence.json`;
  const bytes = await readFile(path), evidence = JSON.parse(bytes.toString());
  const frame = new THREE.Group(), rider = new GltfRider(gltf, { complete() {} } as never);
  rider.attach({ frame } as never);
  const frames = new FrameBuilder(), rows = [];
  for (const t of evidence.trace) {
    const state = JSON.parse(t.stateJson), f = frames.build(state, 1);
    const off = BIKE_GEOMETRY_V2.chassisToAxle, c = Math.cos(f.bikeAngle), s = Math.sin(f.bikeAngle);
    frame.position.set(f.bikeX + off.x*c-off.y*s, f.bikeY+off.x*s+off.y*c, 0);
    frame.rotation.z = f.bikeAngle; frame.updateMatrixWorld(true);
    rider.update(f); frame.updateMatrixWorld(true); rider.root.updateMatrixWorld(true);
    if (f.ragdoll) continue;
    const nodes = new Map<string, THREE.Object3D>(); frame.traverse(o => nodes.set(boneName(o.name), o));
    const point = (n: string) => frame.worldToLocal(nodes.get(n)!.getWorldPosition(new THREE.Vector3()));
    const S=point('upperArm.L'), E=point('forearm.L'), W=point('hand.L');
    const u=E.clone().sub(S), v=W.clone().sub(E), d=W.clone().sub(S), dir=d.clone().normalize();
    const torso=point('neck').sub(point('pelvis')).normalize(), front=new THREE.Vector3(torso.y,-torso.x,0);
    const row = { tick:t.inputTick, elbowInteriorDegrees:180-u.angleTo(v)*180/Math.PI,
      shoulderSagittalDegrees:Math.atan2(u.dot(front),-u.dot(torso))*180/Math.PI,
      upperAnterior:u.dot(front), wristAnterior:d.dot(front), elbowOutward:u.z,
      wristDistance:d.length(), poleLength:u.clone().addScaledVector(dir,-u.dot(dir)).length(),
      gripError:Math.max(...rider.debug.gripErr), physicalPose:rider.debug.physicalPose };
    if(t.inputTick>=evidence.from && t.inputTick<=evidence.to) rows.push(row);
    if(capture==='played-hop-full' && [242,292,316,336].includes(t.inputTick)) {
      const inv=frame.matrixWorld.clone().invert(), shift=new THREE.Matrix4().makeTranslation(.65,0,0);
      const transforms=Object.fromEntries([...rest].map(([name, r])=> {
        const posed=shift.clone().multiply(inv).multiply(nodes.get(name)!.matrixWorld);
        return [name,{rest:r.toArray(),posed:posed.toArray(),deform:posed.clone().multiply(r.clone().invert()).toArray()}];
      }));
      await writeFile(`${output}/pose-${t.inputTick}.json`,JSON.stringify({row,transforms},null,2)+'\n');
    }
  }
  reports.push({capture,path,sha256:createHash('sha256').update(bytes).digest('hex'),rows});
  rider.dispose();
}
await writeFile('docs/evidence/hero-r13-arms/trace-measurements.json',JSON.stringify({
  command:'pnpm exec tsx docs/evidence/hero-r13-arms/measure-traces.mts',
  scope:'Actual recorded states through production FrameBuilder and GltfRider, CPU geometry decoder; no visual acceptance.',reports},null,2)+'\n');
console.log('Measured traces and exported four actual runtime deformation samples.');
