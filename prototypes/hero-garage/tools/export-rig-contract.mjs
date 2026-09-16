/** Decode actual GLB rig/socket data and measure every exported clip frame. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await fs.readFile(path.join(root,'public/assets/catalog.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function load(kind){
 const asset=catalog.assets.find(a=>a.kind===kind);assert(asset);
 const bytes=await fs.readFile(path.join(root,'public',asset.url));
 const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len));
 // Strip only materials in memory; original geometry, skin and animation buffers remain.
 for(const mesh of doc.meshes??[])for(const p of mesh.primitives){delete p.material;if(p.extensions)delete p.extensions.KHR_materials_variants;}
 doc.materials=[];doc.images=[];doc.textures=[];if(doc.extensions)delete doc.extensions.KHR_materials_variants;
 const json=Buffer.from(JSON.stringify(doc)),pad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bin=bytes.subarray(20+len),input=Buffer.alloc(20+pad.length+bin.length);
 bytes.copy(input,0,0,12);input.writeUInt32LE(input.length,8);input.writeUInt32LE(pad.length,12);input.writeUInt32LE(0x4e4f534a,16);pad.copy(input,20);bin.copy(input,20+pad.length);
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(input.buffer,'');
 const scene=gltf.scene;
 if(asset.position)scene.position.fromArray(asset.position);if(asset.rotation)scene.rotation.set(...asset.rotation);if(asset.scale!==undefined)scene.scale.setScalar(asset.scale);
 scene.updateMatrixWorld(true);return {asset,bytes,gltf,scene,nodeNames:doc.nodes.map(n=>({exported:n.name,runtime:T.PropertyBinding.sanitizeNodeName(n.name??'')}))};
}
const rider=await load('rider'),bike=await load('bike');
const transform=o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray()});
const point=o=>o.getWorldPosition(new T.Vector3());
const required=(root,name)=>{const o=root.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));assert(o,`Missing ${name}`);return o;};
const meshBindings=[],sockets=[];
rider.scene.traverse(o=>{if(o.isSkinnedMesh)meshBindings.push({mesh:o.name,bindMatrix:o.bindMatrix.toArray(),bindMatrixInverse:o.bindMatrixInverse.toArray(),joints:o.skeleton.bones.map((b,i)=>({name:b.name,parent:b.parent?.name??null,local:transform(b),worldPosition:point(b).toArray(),inverseBindMatrix:o.skeleton.boneInverses[i].toArray()}))});});
assert(meshBindings.length);
const joints=[...new Set(meshBindings.flatMap(m=>m.joints.map(j=>j.name)))];
for(const [kind,data] of [['rider',rider],['bike',bike]])data.scene.traverse(o=>{if(/Socket|^attach_/.test(o.name))sockets.push({asset:kind,name:o.name,parent:o.parent?.name??null,local:transform(o),worldPosition:point(o).toArray()});});
const pairs=[['gripSocket.L','attach_grip_L'],['gripSocket.R','attach_grip_R'],['soleSocket.L','attach_peg_L'],['soleSocket.R','attach_peg_R']];
const mixer=new T.AnimationMixer(rider.scene),contactSamples=[];
for(const clip of rider.gltf.animations){
 mixer.stopAllAction();mixer.clipAction(clip).reset().play();const rows=[];
 for(let frame=0;frame<=Math.round(clip.duration*30);frame++){
  mixer.setTime(Math.min(frame/30,clip.duration-1e-7));rider.scene.updateMatrixWorld(true);
  rows.push(pairs.map(([rn,bn])=>point(required(rider.scene,rn)).sub(point(required(bike.scene,bn)))));
 }
 contactSamples.push({clip:clip.name,samples:rows.length,contacts:pairs.map(([r,b],i)=>({rider:r,bike:b,minDistanceMeters:Math.min(...rows.map(row=>row[i].length())),maxDistanceMeters:Math.max(...rows.map(row=>row[i].length())),maxOffsetVariationMeters:Math.max(...rows.map(row=>row[i].distanceTo(rows[0][i]))),firstOffset:rows[0][i].toArray()}))});
}
const report={schema:'hero-garage.rig-contract.v1',units:'metres',coordinates:{up:'+Y',bikeForward:'+X',depth:'Z; left/right are named sockets, never inferred from screen direction',transforms:'Local TRS and inverse bind matrices from GLBs; world positions include catalog placement, exclude shared floor offset and garage suspension. Bind data is captured before mixer evaluation.'},assets:[rider,bike].map(a=>({id:a.asset.id,url:a.asset.url,sha256:sha(a.bytes),placement:transform(a.scene),nodeNames:a.nodeNames})),jointNames:joints,meshBindings,sockets,clips:rider.gltf.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.map(t=>({name:t.name,type:t.ValueTypeName,keys:t.times.length}))})),contactSamples,driverOrder:['AnimationMixer evaluates selected rider clip at absolute time','Garage suspension transforms rider and bike together, then solves wheel/fork/swingarm/shock/chain/hose','Common floor offset inherited from hero parent','Render'],integrationConstraints:['Game physics pose remains authoritative; clips must not move visible mass independently of the shared physical mass/pose mapping.','Current 19 deform bones lack finger and forearm twist chains; facial/garment corrective approval is not implied.','Socket distances do not prove glove/sole surface fit or collision clearance.','Prescribed garage kinematics do not validate weight transfer, impact response or game integration.']};
for(const row of contactSamples)for(const c of row.contacts){assert(Number.isFinite(c.maxDistanceMeters));assert(c.maxOffsetVariationMeters<1e-4,`${row.clip} ${c.rider} drifts`);}
await fs.writeFile(path.join(root,'reports/rig-contract.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({joints:joints.length,skinnedMeshes:meshBindings.length,sockets:sockets.length,clips:contactSamples.length,frames:contactSamples.reduce((n,c)=>n+c.samples,0),maxContactDriftMeters:Math.max(...contactSamples.flatMap(c=>c.contacts.map(p=>p.maxOffsetVariationMeters)))}));
