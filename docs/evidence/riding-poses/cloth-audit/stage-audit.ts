/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any -- heterogeneous diagnostic JSON rows stay outside the application type graph. */
/** Actual CPU skinning diagnostics; source meshes retain triangles/weights. No visual pass inferred. */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { loadRig, loadRigAt } from '../../../../src/render/hero/gltfTestUtils';
import { GltfRider, boneName } from '../../../../src/render/hero/gltfRider';
import { FrameBuilder } from '../../../../src/render/frame';
import { AVAILABLE_RIDER_PRESETS } from '../../../../src/core/riderPresets';
import { RIDER_TORSO_REST } from '../../../../src/render/hero/riderRig';
import { BIKE_GEOMETRY_V2 } from '../../../../src/render/hero/assetFrame';
import type { HeroBike } from '../../../../src/render/bike/bikeModel';
import type { MaterialLibrary } from '../../../../src/render/materials/library';

import { Game } from '../../../../src/game/game';
import { createBikePhysicsV2 } from '../../../../src/physics/v2/bike';
import type { GameRenderer } from '../../../../src/render/index';
import type { InputRecording } from '../../../../src/core/replay';
import { prepareHero } from '../../../../src/render/hero/lod';
const localFromWorld:T.Matrix4|null=null;
type Tri = { a:T.Vector3; b:T.Vector3; c:T.Vector3; box:T.Box3; center:T.Vector3; area:number; index:number; mesh:string };
type Node = { box:T.Box3; children?:Node[]; tris?:Tri[] };
function tri(a:T.Vector3,b:T.Vector3,c:T.Vector3,index:number,mesh:string):Tri {
 return {a,b,c,index,mesh,box:new T.Box3().setFromPoints([a,b,c]),center:a.clone().add(b).add(c).multiplyScalar(1/3),area:new T.Triangle(a,b,c).getArea()};
}
function tree(tris:Tri[]):Node {
 const box=new T.Box3(); for(const t of tris) box.union(t.box);
 if(tris.length<=16) return {box,tris};
 const size=box.getSize(new T.Vector3()); const axis=size.x>size.y?(size.x>size.z?'x':'z'):(size.y>size.z?'y':'z');
 tris.sort((a,b)=>a.center[axis]-b.center[axis]); const mid=tris.length>>1;
 return {box,children:[tree(tris.slice(0,mid)),tree(tris.slice(mid))]};
}
const hit=new T.Vector3();
function hits(n:Node,ray:T.Ray,result:number[]):void {
 if(!ray.intersectBox(n.box,hit)) return;
 if(n.children) {for(const c of n.children) hits(c,ray,result);return;}
 for(const t of n.tris!) if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)) {const d=ray.origin.distanceTo(hit);if(d>1e-6)result.push(d);}
}
function exposure(n:Node,p:T.Vector3):string {
 // Principal directions are a conservative inspection aid, not the game's camera or a visibility proof.
 const dirs=[new T.Vector3(0,0,1),new T.Vector3(0,0,-1),new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,-1,0)];
 const visible=dirs.filter(d=>{const hs:number[]=[];hits(n,new T.Ray(p.clone().addScaledVector(d,1e-4),d),hs);return hs.length===0;}).length;
 return visible?`exposed-from-${visible}-axis-directions`:'occluded-from-all-six-axis-directions';
}
function meshes(root:T.Object3D):T.Mesh[] {const a:T.Mesh[]=[];root.traverse(o=>{if(o instanceof T.Mesh)a.push(o);});return a;}
function geometry(mesh:T.Mesh):{points:T.Vector3[];triangles:Tri[]} {
 if(mesh instanceof T.SkinnedMesh)mesh.skeleton.update();
 const attr=mesh.geometry.getAttribute('position');const points:T.Vector3[]=[];
 for(let i=0;i<attr.count;i++){const p=new T.Vector3().fromBufferAttribute(attr,i);if(mesh instanceof T.SkinnedMesh)mesh.applyBoneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);if(localFromWorld)p.applyMatrix4(localFromWorld);points.push(p);}
 const ix=mesh.geometry.index;const count=ix?.count??attr.count;const triangles:Tri[]=[];
 for(let i=0;i<count;i+=3){const a=ix?ix.getX(i):i,b=ix?ix.getX(i+1):i+1,c=ix?ix.getX(i+2):i+2;triangles.push(tri(points[a],points[b],points[c],i/3,mesh.name));}
 return {points,triangles};
}
function region(mesh:T.Mesh,vertex:number):string {
 if(!(mesh instanceof T.SkinnedMesh))return mesh.name;
 const ix=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight');
 let max=-1,name='unweighted';for(let k=0;k<4;k++){const v=w.getComponent(vertex,k);if(v>max){max=v;name=boneName(mesh.skeleton.bones[ix.getComponent(vertex,k)].name);}}
 return name;
}
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');


const report:any={generated:new Date().toISOString(),sourceHashes:Object.fromEntries(['src/render/hero/gltfRider.ts','src/render/hero/sleeveSkin.ts'].map(p=>[p,hash(p)])),subjects:[]};
for(const preset of AVAILABLE_RIDER_PRESETS)for(const lod of ['','-lod']){
 const file=`rider-${preset.id}${lod}.glb`,g=await loadRigAt(new URL('../../../../public/models/'+file,import.meta.url),true);await prepareHero(g);g.scene.updateMatrixWorld(true);const source=meshes(g.scene),rest=source.map(m=>geometry(m));
 const weightHash=()=>createHash('sha256').update(Buffer.concat(source.map(m=>{const a=m.geometry.getAttribute('skinWeight').array;return Buffer.from(a.buffer,a.byteOffset,a.byteLength);}))).digest('hex'),before=weightHash();
 const frame=new T.Group(),rider=new GltfRider(g,{complete(){}} as unknown as MaterialLibrary);rider.attach({frame} as HeroBike);rider.setStage(true);const f=new FrameBuilder().frame;f.tSim=1.75;f.dt=0;f.bikeX=-.065;f.bikeY=.21;rider.update(f);frame.updateMatrixWorld(true);const ms=meshes(frame),actual=ms.map(m=>geometry(m));
 g.scene.position.x=-.65;const mixer=new T.AnimationMixer(g.scene);mixer.clipAction(g.animations.find(c=>c.name==='sit_cruise')!).play();mixer.setTime(1.75);g.scene.updateMatrixWorld(true);const authored=source.map(m=>geometry(m));
 const surface=tree(actual.flatMap(m=>m.triangles));const row:any={file,originalWeightsUnchanged:before===weightHash(),maxVertexDelta:0,newStretchVsOriginal:0,newCollapseVsOriginal:0,candidates:[]};
 for(let mi=0;mi<ms.length;mi++){for(let vi=0;vi<actual[mi].points.length;vi++)row.maxVertexDelta=Math.max(row.maxVertexDelta,actual[mi].points[vi].distanceTo(authored[mi].points[vi]));for(let ti=0;ti<actual[mi].triangles.length;ti++){const a=rest[mi].triangles[ti],b=actual[mi].triangles[ti],o=authored[mi].triangles[ti];if(a.area<1e-8)continue;const edge=(t:Tri)=>Math.max(t.a.distanceTo(t.b)/a.a.distanceTo(a.b),t.b.distanceTo(t.c)/a.b.distanceTo(a.c),t.c.distanceTo(t.a)/a.c.distanceTo(a.a)),now=edge(b),old=edge(o);if(now>2&&old<=2)row.newStretchVsOriginal++;if(b.area/a.area<.1&&o.area/a.area>=.1)row.newCollapseVsOriginal++;if(now-old>.25)row.candidates.push({mesh:ms[mi].name,triangle:ti,edgeRatio:now,originalEdgeRatio:old,center:b.center.toArray()});}}
 row.candidates.sort((a:any,b:any)=>(b.edgeRatio-b.originalEdgeRatio)-(a.edgeRatio-a.originalEdgeRatio));row.candidates=row.candidates.slice(0,24).map((x:any)=>({...x,visibility:exposure(surface,new T.Vector3().fromArray(x.center))}));report.subjects.push(row);console.info(file,row.maxVertexDelta,row.newStretchVsOriginal,row.newCollapseVsOriginal);
}
report.codeStableDuringRun=Object.entries(report.sourceHashes).every(([p,h])=>hash(p)===h);writeFileSync(new URL('./stage-candidate-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
