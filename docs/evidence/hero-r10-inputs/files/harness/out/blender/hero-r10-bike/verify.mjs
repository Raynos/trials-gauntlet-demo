import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
async function load(path) {
 const original=await fs.readFile(path), len=original.readUInt32LE(12), doc=JSON.parse(original.subarray(20,20+len));
 const raw=structuredClone(doc);
 for(const m of doc.meshes) for(const p of m.primitives) {delete p.material;if(p.extensions)delete p.extensions.KHR_materials_variants;}
 doc.materials=[];doc.textures=[];doc.images=[];delete doc.extensions.KHR_materials_variants;
 const j=Buffer.from(JSON.stringify(doc)), pad=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bin=original.subarray(20+len), result=Buffer.alloc(20+pad.length+bin.length);
 original.copy(result,0,0,12);result.writeUInt32LE(result.length,8);result.writeUInt32LE(pad.length,12);result.writeUInt32LE(0x4e4f534a,16);pad.copy(result,20);bin.copy(result,20+pad.length);
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(result.buffer,'');gltf.scene.updateMatrixWorld(true);
 return {scene:gltf.scene,doc:raw,bytes:original.length,sha256:crypto.createHash('sha256').update(original).digest('hex')};
}
const reports=[];
for(const name of ['bike','bike-lod']) {
 const actual=await load(`harness/out/blender/hero-r10-bike/models/${name}.glb`),base=await load(`harness/out/blender/mega-bike/final-candidate/models/${name}.glb`);
 let maxMarkerError=0, triangles=0, finite=true,meshCount=0;
 actual.scene.traverse(o=>{if(o.name.startsWith('attach_')) {const other=base.scene.getObjectByName(o.name);if(!other)throw Error(o.name);maxMarkerError=Math.max(maxMarkerError,o.getWorldPosition(new THREE.Vector3()).distanceTo(other.getWorldPosition(new THREE.Vector3())));}if(o.isMesh){meshCount++;triangles+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;for(const value of o.geometry.attributes.position.array) finite&&=Number.isFinite(value);}});
 let geometryEqual=true;
 actual.scene.traverse(o=>{if(o.isMesh){const other=base.scene.getObjectByName(o.name).geometry;for(const key of Object.keys(o.geometry.attributes)){const a=o.geometry.attributes[key].array,b=other.attributes[key].array;geometryEqual&&=a.length===b.length&&a.every((v,i)=>v===b[i]);}}});
 if(!geometryEqual)throw Error('Geometry changed');
 const bounds=new THREE.Box3().setFromObject(actual.scene);
 const names=actual.doc.nodes.map(n=>n.name).sort(),bnames=base.doc.nodes.map(n=>n.name).sort();
 const nodeNamesEqual=JSON.stringify(names)===JSON.stringify(bnames);
 const variants=actual.doc.extensions.KHR_materials_variants.variants.map(v=>v.name);
 const hose=actual.scene.getObjectByName('brake_hose').userData;
 if(!finite||!nodeNamesEqual||maxMarkerError>1e-8)throw Error('Integrity failure');
 reports.push({name,bytes:actual.bytes,sha256:actual.sha256,triangles,meshCount,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},nodeNamesEqual,maxMarkerError,finite,geometryEqual,variants,hoseStations:hose.hose_stations.length/3,hoseLength:hose.hose_length,extensions:actual.doc.extensionsUsed});
}
await fs.writeFile('harness/out/blender/hero-r10-bike/validation.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
