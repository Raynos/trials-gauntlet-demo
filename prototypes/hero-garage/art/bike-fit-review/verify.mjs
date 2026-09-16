import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {createBikeSuspension} from '../../src/bikeSuspension.ts';
async function load(file){const original=fs.readFileSync(file),len=original.readUInt32LE(12),d=JSON.parse(original.subarray(20,20+len));
for(const mesh of d.meshes)for(const p of mesh.primitives){delete p.material;if(p.extensions)delete p.extensions.KHR_materials_variants;}
d.materials=[];d.images=[];d.textures=[];delete d.extensions.KHR_materials_variants;
const j=Buffer.from(JSON.stringify(d)),pad=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bin=original.subarray(20+len),input=Buffer.alloc(20+pad.length+bin.length);
original.copy(input,0,0,12);input.writeUInt32LE(input.length,8);input.writeUInt32LE(pad.length,12);input.writeUInt32LE(0x4e4f534a,16);pad.copy(input,20);bin.copy(input,20+pad.length);
return await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(input.buffer,'');
}
const file='public/assets/street01-bike-materials.glb',original=fs.readFileSync(file);const gltf=await load(file);
const riderGLTF=await load('public/assets/street01-rider-garment-repair.glb');
const bike=gltf.scene,rider=riderGLTF.scene,parent=new T.Group();parent.add(bike,rider);bike.position.y=rider.position.y=.34;parent.updateMatrixWorld(true);
const tyreBounds=()=>Object.fromEntries(['wheel_front','wheel_rear'].map(n=>{const box=new T.Box3().setFromObject(bike.getObjectByName(n),true);return[n,{min:box.min.toArray(),max:box.max.toArray()}]}));
const before=tyreBounds(),wholeMin=new T.Box3().setFromObject(bike,true).min.y;
const state=()=>{const out=[];bike.traverse(o=>{out.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray());if(o.isMesh)out.push(...o.geometry.attributes.position.array,...o.geometry.attributes.normal.array);});return out;};
const originalState=state();const api=createBikeSuspension(bike,rider);let maxTyreBoundsError=0,maxArmError=0,maxAxleError=0;const samples=[];
for(let i=0;i<=100;i++){const amount=i/100,diag=api.apply(amount),bounds=tyreBounds();for(const n of Object.keys(before))for(const k of ['min','max'])for(let axis=0;axis<3;axis++)maxTyreBoundsError=Math.max(maxTyreBoundsError,Math.abs(bounds[n][k][axis]-before[n][k][axis]));maxArmError=Math.max(maxArmError,diag.armLengthError);maxAxleError=Math.max(maxAxleError,diag.frontAxleError,diag.rearAxleError);if(i%25===0)samples.push(diag);}
api.apply(0);assert.deepEqual(state(),originalState);assert(maxTyreBoundsError<1e-8);assert(maxArmError<1e-8);assert(maxAxleError<1e-8);

const contactPairs=[['gripSocket.L','attach_grip_L'],['gripSocket.R','attach_grip_R'],['soleSocket.L','attach_peg_L'],['soleSocket.R','attach_peg_R']];
const mixer=new T.AnimationMixer(rider),contacts=[];
let maxContactDistanceChange=0;
for(const clip of riderGLTF.animations){
 mixer.stopAllAction();const action=mixer.clipAction(clip);action.play();
 for(const time of [0,clip.duration/2,clip.duration]){
  api.apply(0);mixer.setTime(time);parent.updateMatrixWorld(true);
  const baseline=contactPairs.map(([r,b])=>{const ro=rider.getObjectByName(T.PropertyBinding.sanitizeNodeName(r)),bo=bike.getObjectByName(b);assert(ro,`Missing ${r}`);assert(bo);return ro.getWorldPosition(new T.Vector3()).distanceTo(bo.getWorldPosition(new T.Vector3()));});
  api.apply(1);parent.updateMatrixWorld(true);
  const compressed=contactPairs.map(([r,b])=>rider.getObjectByName(T.PropertyBinding.sanitizeNodeName(r)).getWorldPosition(new T.Vector3()).distanceTo(bike.getObjectByName(b).getWorldPosition(new T.Vector3())));
  baseline.forEach((v,i)=>maxContactDistanceChange=Math.max(maxContactDistanceChange,Math.abs(v-compressed[i])));
  contacts.push({clip:clip.name,time,baseline,compressed});
 }
}
assert(maxContactDistanceChange<1e-8);

const report={maxContactDistanceChange,contactPairNames:contactPairs,contacts,asset:file,sha256:crypto.createHash('sha256').update(original).digest('hex'),method:'Meshopt-decoded exported GLB, exact Three.js vertex bounds. 101 stroke samples; byte-equivalent numerical transform and geometry arrays at neutral. Actual rider GLB: all six clips at start/mid/end, grip/sole baseline distances compared with full stroke.',beforeCatalogGroundCorrection:before,wholeMinY:wholeMin,afterGrounding:{frontMinY:before.wheel_front.min[1]-wholeMin,rearMinY:before.wheel_rear.min[1]-wholeMin},suspension:{strokeMeters:.025,maxTyreBoundsError,maxArmError,maxAxleError,samples,exactNeutralReset:true},limitations:['Authored kinematic preview, not physical suspension validation.','Parent must review actual rendered motion.','Grip and sole distance baselines measured at 18 clip/time samples; preserved to numerical precision. No new exact surface contact claim.'],finding:'Both tyres differ in minimum height by less than 0.5mm; do not pitch the assembly to chase detached-looking shadows. Added whole-bike compression articulation instead.'};fs.writeFileSync('reports/bike-fit-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
