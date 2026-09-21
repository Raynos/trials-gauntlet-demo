/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous diagnostic JSON rows stay outside the application type graph. */
/** Actual CPU skinning diagnostics; source meshes retain triangles/weights. No visual pass inferred. */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { loadRig } from '../../../../src/render/hero/gltfTestUtils';
import { GltfRider, boneName } from '../../../../src/render/hero/gltfRider';
import { FrameBuilder } from '../../../../src/render/frame';
import { AVAILABLE_RIDER_PRESETS } from '../../../../src/core/riderPresets';
import { riderPoseAtLean, makeRiderRigPose, RIDER_TORSO_REST } from '../../../../src/render/hero/riderRig';
import { BIKE_GEOMETRY_V2 } from '../../../../src/render/hero/assetFrame';
import type { HeroBike } from '../../../../src/render/bike/bikeModel';
import type { MaterialLibrary } from '../../../../src/render/materials/library';

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
function distances(n:Node,p:T.Vector3,best=Infinity):number {
 if(n.box.distanceToPoint(p)>=best) return best;
 if(n.children) {for(const c of n.children)best=distances(c,p,best);return best;}
 for(const t of n.tris!) {if(t.area<1e-12)continue;const d=p.distanceTo(new T.Triangle(t.a,t.b,t.c).closestPointToPoint(p,new T.Vector3()));if(Number.isFinite(d))best=Math.min(best,d);}
 return best;
}
const directions=[new T.Vector3(1,.173,.319).normalize(),new T.Vector3(.137,1,.271).normalize(),new T.Vector3(.219,.113,1).normalize()];
function inside(n:Node,p:T.Vector3):boolean {
 if(!n.box.containsPoint(p))return false;
 return directions.every(d=>{const hs:number[]=[];hits(n,new T.Ray(p,d),hs);hs.sort((a,b)=>a-b);return hs.filter((v,i)=>i===0||v-hs[i-1]>1e-5).length%2===1;});
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
 for(let i=0;i<attr.count;i++){const p=new T.Vector3().fromBufferAttribute(attr,i);if(mesh instanceof T.SkinnedMesh)mesh.applyBoneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);points.push(p);}
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
const summary:any={schema:1,generated:new Date().toISOString(),sourceHashes:{},scope:'10 rider files x 2 bike bodywork assets x 9 shared-target lean poses; diagnostics, NOT visual completion',thresholds:{triangleAreaRestMinimum:1e-8,triangleAreaRatioCollapse:.1,edgeStretch:2,weldGapM:.002,bikeDepthM:.005,bikeVertexStride:8},assets:[],selfTest:null};
// Known independent defects verify that the instruments can reject collapse/stretch/penetration.
const box=new T.Mesh(new T.BoxGeometry(1,1,1));box.updateMatrixWorld(true);const bt=tree(geometry(box).triangles);
const known={inside:inside(bt,new T.Vector3()),outside:!inside(bt,new T.Vector3(2,0,0)),centerDepth:distances(bt,new T.Vector3()),collapsedArea:tri(new T.Vector3(),new T.Vector3(1,0,0),new T.Vector3(2,0,0),0,'test').area};
if(!known.inside||!known.outside||Math.abs(known.centerDepth-.5)>1e-7||known.collapsedArea!==0)throw Error('Diagnostic self-test failed');summary.selfTest=known;
for(const path of ['src/core/riderGeometry.ts','src/render/hero/gltfRider.ts','src/render/hero/sleeveSkin.ts'])summary.sourceHashes[path]=hash(path);
const bikes:Record<string,Node>={};
for(const cls of ['rookie','pro']) {
 const filename=`bike-${cls}.glb`;const g=await loadRig(filename);g.scene.position.x=-.65;g.scene.updateMatrixWorld(true);
 const selected=meshes(g.scene).filter(m=>/bodywork|engine|frame/.test(m.name));
 bikes[cls]=tree(selected.flatMap(m=>geometry(m).triangles));summary.sourceHashes[filename]=hash('public/models/'+filename);
}
for(const preset of AVAILABLE_RIDER_PRESETS)for(const lod of ['', '-lod']) {
 const file=`rider-${preset.id}${lod}.glb`;const gltf=await loadRig(file);summary.sourceHashes[file]=hash('public/models/'+file);
 const frame=new T.Group();const rider=new GltfRider(gltf,{complete(){}} as unknown as MaterialLibrary);rider.attach({frame} as HeroBike);frame.updateMatrixWorld(true);
 const ms=meshes(frame);const rest=ms.map(m=>geometry(m));
 gltf.scene.position.x=-.65;const authoredMixer=new T.AnimationMixer(gltf.scene);const authoredActions=['sit_cruise','hang_back','forward_attack'].map(name=>authoredMixer.clipAction(gltf.animations.find(c=>c.name===name)!));authoredActions.forEach(a=>a.play());
 // Rest-position duplicate vertices capture UV/material seam pairs without assuming the bone weights match.
 const seams=ms.map((m)=>{const map=new Map<string,number>();const pairs:[number,number][]=[];const attr=m.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){const p=new T.Vector3().fromBufferAttribute(attr,i);const key=p.toArray().map(x=>Math.round(x*1e6)).join(',');if(map.has(key))pairs.push([map.get(key)!,i]);else map.set(key,i);}return pairs;});
 const asset:any={file,meshes:ms.map(m=>({name:m.name,vertices:m.geometry.getAttribute('position').count,triangles:(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3})),poses:[]};
 for(const lean of [-1,-.75,-.5,-.25,0,.25,.5,.75,1]) {
  const p=riderPoseAtLean(lean,makeRiderRigPose());const f=new FrameBuilder().frame;f.bikeX=-BIKE_GEOMETRY_V2.chassisToAxle.x;f.bikeY=-BIKE_GEOMETRY_V2.chassisToAxle.y;f.riderBody.present=true;f.riderBody.relX=p.com.x+BIKE_GEOMETRY_V2.chassisToAxle.x;f.riderBody.relY=p.com.y+BIKE_GEOMETRY_V2.chassisToAxle.y;f.riderBody.relAngle=p.torsoAngle-RIDER_TORSO_REST;f.dt=1/60;rider.update(f);frame.updateMatrixWorld(true);
  const pelvis=ms.flatMap(m=>m instanceof T.SkinnedMesh?m.skeleton.bones:[]).find(b=>boneName(b.name)==='pelvis')!;
  const measuredHips=pelvis.getWorldPosition(new T.Vector3()).addScaledVector(new T.Vector3(0,1,0).transformDirection(pelvis.matrixWorld),.02);
  const hipResidual=measuredHips.distanceTo(new T.Vector3(p.hips.x,p.hips.y,0));
  if(hipResidual>.006)throw Error(`Invalid pose fixture ${file} ${lean}: hips residual ${hipResidual}`);
  authoredActions.forEach((a,i)=>a.setEffectiveWeight(i===0?1-Math.abs(lean):i===(lean<0?1:2)?Math.abs(lean):0));authoredMixer.setTime(1.75);gltf.scene.updateMatrixWorld(true);const authored=meshes(gltf.scene).map(m=>geometry(m));
  const actual=ms.map(m=>geometry(m));const all=actual.flatMap(x=>x.triangles);const surface=tree(all.slice());
  const row:any={lean,hipResidual,triangles:all.length,regions:{},seamGaps:[],bikeIntrusion:{},samples:[]};
  for(let mi=0;mi<ms.length;mi++) {
   const m=ms[mi],now=actual[mi],base=rest[mi];
   for(let ti=0;ti<now.triangles.length;ti++) {
    const a=base.triangles[ti],b=now.triangles[ti];if(a.area<1e-8)continue;
    const ratio=b.area/a.area;const edge=Math.max(b.a.distanceTo(b.b)/a.a.distanceTo(a.b),b.b.distanceTo(b.c)/a.b.distanceTo(a.c),b.c.distanceTo(b.a)/a.c.distanceTo(a.a));
    const index=m.geometry.index?.getX(ti*3)??ti*3;const name=region(m,index);const r=row.regions[name]??={triangles:0,collapsed:0,stretched:0,minAreaRatio:Infinity,maxEdgeRatio:0,newCollapseVsAuthored:0,newStretchVsAuthored:0};r.triangles++;r.minAreaRatio=Math.min(r.minAreaRatio,ratio);r.maxEdgeRatio=Math.max(r.maxEdgeRatio,edge);const ab=authored[mi].triangles[ti];const authoredAreaRatio=ab.area/a.area;const authoredEdgeRatio=Math.max(ab.a.distanceTo(ab.b)/a.a.distanceTo(a.b),ab.b.distanceTo(ab.c)/a.b.distanceTo(a.c),ab.c.distanceTo(ab.a)/a.c.distanceTo(a.a));if(ratio<.1)r.collapsed++;if(edge>2)r.stretched++;if(ratio<.1&&authoredAreaRatio>=.1)r.newCollapseVsAuthored++;if(edge>2&&authoredEdgeRatio<=2)r.newStretchVsAuthored++;
    if((ratio<.1||edge>2)&&row.samples.length<200)row.samples.push({mesh:m.name,triangle:ti,region:name,areaRatio:ratio,edgeRatio:edge,authoredAreaRatio,authoredEdgeRatio,center:b.center.toArray(),visibility:exposure(surface,b.center)});
   }
   for(const [a,b] of seams[mi]){const gap=now.points[a].distanceTo(now.points[b]);if(gap>.002&&row.seamGaps.length<24)row.seamGaps.push({mesh:m.name,vertices:[a,b],gap});}
  }
  for(const [cls,bike] of Object.entries(bikes)) {
   const r:any={tested:0,insideOver5mm:0,maxDepth:0,regions:{},examples:[]};
   for(let mi=0;mi<ms.length;mi++)for(let vi=0;vi<actual[mi].points.length;vi+=8){const p=actual[mi].points[vi];r.tested++;if(!inside(bike,p))continue;const depth=distances(bike,p);if(!Number.isFinite(depth)||depth<=.005)continue;r.insideOver5mm++;r.maxDepth=Math.max(depth,r.maxDepth);const name=region(ms[mi],vi);r.regions[name]=(r.regions[name]??0)+1;if(r.examples.length<12)r.examples.push({mesh:ms[mi].name,vertex:vi,region:name,point:p.toArray(),depth,visibility:exposure(surface,p)});}
   row.bikeIntrusion[cls]=r;
  }
  row.samples.sort((a:any,b:any)=>(b.edgeRatio-b.authoredEdgeRatio)-(a.edgeRatio-a.authoredEdgeRatio));row.samples=row.samples.slice(0,24);asset.poses.push(row);
 }
 summary.assets.push(asset);console.info(file,JSON.stringify(asset.poses.map((p:any)=>({lean:p.lean,collapse:Object.values(p.regions).reduce((n:number,r:any)=>n+r.collapsed,0),stretch:Object.values(p.regions).reduce((n:number,r:any)=>n+r.stretched,0),seam:p.seamGaps.length,bike:p.bikeIntrusion.rookie.insideOver5mm}))));
}
summary.codeStableDuringRun=['src/core/riderGeometry.ts','src/render/hero/gltfRider.ts','src/render/hero/sleeveSkin.ts'].every(path=>summary.sourceHashes[path]===hash(path));
writeFileSync(new URL('./report.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
