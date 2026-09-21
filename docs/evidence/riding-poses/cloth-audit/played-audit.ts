/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous diagnostic JSON rows stay outside the application type graph. */
/** Actual CPU skinning diagnostics; source meshes retain triangles/weights. No visual pass inferred. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
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
let localFromWorld:T.Matrix4|null=null;
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

const [inputDir = 'harness/inputs/riding-poses', motion = 'lean-transitions', outputPath = new URL('./played-candidate-report.json', import.meta.url).pathname] = process.argv.slice(2);
if (existsSync(outputPath)) throw new Error('Use a fresh output path to preserve earlier evidence');
const paths=['src/core/riderGeometry.ts','src/render/hero/gltfRider.ts','src/render/hero/sleeveSkin.ts','src/physics/v2/bike.ts'];
const report:any={generated:new Date().toISOString(),scope:'Actual120Hz Game playback, geometry sampled12Hz, all10riders and bothbikeclasses. No visual pass inferred.',sourceHashes:Object.fromEntries(paths.map(p=>[p,hash(p)])),subjects:[]};
for(const cls of ['rookie','pro'] as const){
 const inputPath=`${inputDir}/${motion}-${cls}.json`,rec=JSON.parse(readFileSync(inputPath,'utf8')) as InputRecording;report.sourceHashes[inputPath]=hash(inputPath);
 const bg=await loadRig(`bike-${cls}.glb`);bg.scene.position.x=-.65;bg.scene.updateMatrixWorld(true);localFromWorld=null;
 const bodywork=tree(meshes(bg.scene).filter(m=>/bodywork/.test(m.name)).flatMap(m=>geometry(m).triangles));
 for(const preset of AVAILABLE_RIDER_PRESETS)for(const lod of ['','-lod']){
  const file=`rider-${preset.id}${lod}.glb`,g=await loadRigAt(new URL('../../../../public/models/'+file,import.meta.url),true);await prepareHero(g);report.sourceHashes[file]=hash('public/models/'+file);
  const frame=new T.Group(),rider=new GltfRider(g,{complete(){}} as unknown as MaterialLibrary);rider.attach({frame} as HeroBike);rider.setLivery(cls);frame.updateMatrixWorld(true);localFromWorld=null;
  const ms=meshes(frame),rest=ms.map(m=>geometry(m));
  const pelvic=ms.map(m=>{if(!(m instanceof T.SkinnedMesh))return [];const ix=m.geometry.getAttribute('skinIndex'),w=m.geometry.getAttribute('skinWeight');const ids:number[]=[];for(let i=0;i<ix.count;i++){let v=0;for(let k=0;k<4;k++)if(/pelvis|thigh/.test(m.skeleton.bones[ix.getComponent(i,k)].name))v+=w.getComponent(i,k);if(v>=.5)ids.push(i);}return ids;});
  const game=new Game({physics:createBikePhysicsV2(120),renderer:{setTrack(){},onEvent(){},setQuality(){},setBikeClass(){}} as unknown as GameRenderer,physicsHz:120,autoSkipCountdown:true,ghostEnabled:false});game.loadTrack(rec.header.trackId,rec.header.seed,cls);const frames=new FrameBuilder();
  const subject:any={file,cls,geometryHz:12,frames:[],ridingTicks:0,ragdollTicks:0};let tick=0;
  for(const [count,throttle,brake,lean,flags]of rec.runs)for(let j=0;j<count;j++){
   tick++;game.setInput({throttle:throttle/255,brake:brake/255,lean:lean/127,hop:Boolean(flags&1),restart:Boolean(flags&2)});game.step(1);const f=frames.build(game.getState(),1),o=BIKE_GEOMETRY_V2.chassisToAxle,c=Math.cos(f.bikeAngle),sn=Math.sin(f.bikeAngle);frame.position.set(f.bikeX+o.x*c-o.y*sn,f.bikeY+o.x*sn+o.y*c,0);frame.rotation.z=f.bikeAngle;frame.updateMatrixWorld(true);rider.update(f);frame.updateMatrixWorld(true);
   if(f.ragdoll){subject.ragdollTicks++;continue;}subject.ridingTicks++;if(tick%10!==0&&tick!==1)continue;
   localFromWorld=new T.Matrix4().copy(frame.matrixWorld).invert();const actual=ms.map(m=>geometry(m));const row:any={tick,time:tick/120,lean:lean/127,bikeAngle:f.bikeAngle,bodyRel:{x:f.riderBody.relX,y:f.riderBody.relY,angle:f.riderBody.relAngle+RIDER_TORSO_REST},fenderSamples:0,fenderBelow5mm:0,minFenderClearance:null,stretchCount:0,collapseCount:0,regionWorst:{},exposedCandidates:[]};
   let min=Infinity;const candidates:any[]=[];
   for(let mi=0;mi<ms.length;mi++){
    for(const vi of pelvic[mi]){const v=actual[mi].points[vi];if(v.x<-.95||v.x>-.5||Math.abs(v.z)>.2)continue;const hs:number[]=[];hits(bodywork,new T.Ray(new T.Vector3(v.x,1,v.z),new T.Vector3(0,-1,0)),hs);const tops=hs.map(d=>1-d).filter(y=>y>.3&&y<.7);if(!tops.length)continue;const top=Math.max(...tops),gap=v.y-top;row.fenderSamples++;if(gap<-.005)row.fenderBelow5mm++;if(gap<min){min=gap;row.worstFender={mesh:ms[mi].name,vertex:vi,point:v.toArray(),top};}}
    for(let ti=0;ti<actual[mi].triangles.length;ti++){const a=rest[mi].triangles[ti],b=actual[mi].triangles[ti];if(a.area<1e-8)continue;const ratio=b.area/a.area,edge=Math.max(b.a.distanceTo(b.b)/a.a.distanceTo(a.b),b.b.distanceTo(b.c)/a.b.distanceTo(a.c),b.c.distanceTo(b.a)/a.c.distanceTo(a.a));if(edge>2)row.stretchCount++;if(ratio<.1)row.collapseCount++;const reg=region(ms[mi],ms[mi].geometry.index?.getX(ti*3)??ti*3);if(!/Arm|forearm|chest|spine|neck|head/.test(reg))continue;const candidate={mesh:ms[mi].name,triangle:ti,region:reg,edgeRatio:edge,areaRatio:ratio,center:b.center.toArray()};if(!row.regionWorst[reg]||edge>row.regionWorst[reg].edgeRatio)row.regionWorst[reg]=candidate;if(edge>2)candidates.push(candidate);}
   }
   row.minFenderClearance=Number.isFinite(min)?min:null;const surface=tree(actual.flatMap(x=>x.triangles));candidates.sort((a,b)=>b.edgeRatio-a.edgeRatio);for(const candidate of candidates.slice(0,100)){const visibility=exposure(surface,new T.Vector3().fromArray(candidate.center));if(!visibility.startsWith('occluded'))row.exposedCandidates.push({...candidate,visibility});if(row.exposedCandidates.length>=8)break;}
   subject.frames.push(row);
  }
  report.subjects.push(subject);console.info(file,cls,subject.frames.length,'frames',Math.min(...subject.frames.map((f:any)=>f.minFenderClearance??Infinity)));
 }
}
report.codeStableDuringRun=paths.every(p=>report.sourceHashes[p]===hash(p));
writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
