/** Mechanical evidence only; evaluate appearance from played clips. Run: pnpm exec tsx docs/evidence/riding-poses/current-geometry/measure.ts */
import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { loadRig } from '../../../../src/render/hero/gltfTestUtils';
import { GltfRider, boneName } from '../../../../src/render/hero/gltfRider';
import { FrameBuilder } from '../../../../src/render/frame';
import { AVAILABLE_RIDER_PRESETS } from '../../../../src/core/riderPresets';
import { bikeTuningV2, BIKE_GEOMETRY_V2 } from '../../../../src/physics/v2/tuning';
import { poseAt, drawnBody, buildChain } from '../../../../src/physics/v2/rider';
import type { HeroBike } from '../../../../src/render/bike/bikeModel';
import type { MaterialLibrary } from '../../../../src/render/materials/library';
const rows: unknown[] = [];
const v = (p: THREE.Vector3) => p.toArray().map(n => +n.toFixed(6));
for (const preset of AVAILABLE_RIDER_PRESETS) for (const lod of ['', '-lod']) {
 const file = `rider-${preset.id}${lod}.glb`, gltf = await loadRig(file);
 for (const cls of ['rookie', 'pro'] as const) {
  const frame = new THREE.Group(), rider = new GltfRider(gltf, { complete() {} } as unknown as MaterialLibrary);
  rider.attach({ frame } as HeroBike); rider.setLivery(cls);
  const nodes = new Map<string, THREE.Object3D>(); frame.traverse(o => nodes.set(boneName(o.name), o));
  const point = (name: string) => frame.worldToLocal(nodes.get(boneName(name))!.getWorldPosition(new THREE.Vector3()));
  const direction = (name: string) => new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(nodes.get(boneName(name))!.matrixWorld));
  for (const lean of [-1, -.5, 0, .5, 1]) {
   const tuning = bikeTuningV2(cls), target = {x:0,y:0,psi:0}; poseAt(tuning.rider.poses, lean, target);
   const d = {pose:'seated' as 'seated'|'back'|'forward',blend:0,hips:{x:0,y:0},torso:0,head:0}; drawnBody(lean,0,0,d);
   const f = new FrameBuilder().frame;
   f.riderBody.present = true; f.riderBody.relX=target.x; f.riderBody.relY=target.y; f.riderBody.relAngle=target.psi;
   f.riderBody.drawn = {present:true,pose:d.pose,blend:d.blend,hipY:d.hips.y,torso:d.torso}; f.dt=1/60;
   const off=BIKE_GEOMETRY_V2.chassisToAxle; frame.position.set(off.x,off.y,0); frame.updateMatrixWorld(true); rider.update(f); frame.updateMatrixWorld(true);
   const hips=point('pelvis').addScaledVector(direction('pelvis'),.02), shoulder=point('neck');
   const com = new THREE.Vector3().lerpVectors(hips, shoulder,.5).multiplyScalar(.4346);
   com.addScaledVector(shoulder.clone().addScaledVector(direction('neck'),.175),.0694);
   for (const side of ['L','R']) {
    for(const [a,b,frac,mass] of [['upperArm','forearm',.5772,.0271],['forearm','hand',.4574,.0162],['thigh','shin',.4095,.1416],['shin','foot',.4395,.0433]] as const)
     com.addScaledVector(point(`${a}.${side}`).lerp(point(`${b}.${side}`),frac),mass);
    com.addScaledVector(point(`gripSocket.${side}`),.0061); com.addScaledVector(point(`foot.${side}`).add(new THREE.Vector3(.06,-.055,0)),.0137);
   }
   const chain={x:new Float64Array(7),y:new Float64Array(7),dx:0,dy:0,hx:0,hy:0,hipAx:0,hipAy:0}; buildChain(lean,0,0,0,0,0,1,0,0,0,chain);
   const physicalCOM=new THREE.Vector3(target.x-off.x,target.y-off.y,0);
   const actualHead=point('head'), sensorHead=new THREE.Vector3(chain.x[2],chain.y[2],0);
   rows.push({file,cls,lean,stanceWeight:rider.debug.stance.blend,authoredHips:v(hips),actualHead:v(actualHead),torsoDegrees:+(Math.atan2(shoulder.y-hips.y,shoulder.x-hips.x)*180/Math.PI).toFixed(3),measuredCOM:v(com),physicalCOM:v(physicalCOM),comError:+com.distanceTo(physicalCOM).toFixed(6),sensorHead:v(sensorHead),headSensorError:+actualHead.distanceTo(sensorHead).toFixed(6),physicalChainHips:[chain.x[0],chain.y[0]],gripError:[...rider.debug.gripErr],soleError:[...rider.debug.soleErr]});
  }
 }
}
await writeFile(new URL('./measurements.json',import.meta.url),JSON.stringify({method:'Static zero-excursion exact pose targets through production GLB decoder and production stance+IK path, all ten assets and both bikes. All points axle-local metres. Head bone origin is authored head center.',rows},null,2)+'\n');
console.info(JSON.stringify(rows.slice(0,5),null,2));
