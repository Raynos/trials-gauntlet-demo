import { readFileSync,writeFileSync } from 'node:fs';
import * as T from 'three';
import { loadRig } from '../../../../src/render/hero/gltfTestUtils';
import { GltfRider } from '../../../../src/render/hero/gltfRider';
import { FrameBuilder } from '../../../../src/render/frame';
import { BIKE_GEOMETRY_V2 } from '../../../../src/render/hero/assetFrame';
import { riderRigFromHips,makeRiderRigPose,RIDER_TORSO_REST } from '../../../../src/render/hero/riderRig';
import type { HeroBike } from '../../../../src/render/bike/bikeModel';
import type { MaterialLibrary } from '../../../../src/render/materials/library';
const bikeClass=process.env.AUDIT_BIKE??'rookie',riderFile=process.env.AUDIT_RIDER??'rider-street-mustard.glb';
const bike=await loadRig(`bike-${bikeClass}.glb`);bike.scene.position.x=-.65;bike.scene.updateMatrixWorld(true);
const body:T.Mesh[]=[];bike.scene.traverse(o=>{if(o instanceof T.Mesh&&/bodywork/.test(o.name)){body.push(o);(o.material as T.Material).side=T.DoubleSide;}});
const ray=new T.Raycaster();const tops:number[]=[];
for(let x=-.9;x<=-.5;x+=.02)for(let z=-.14;z<=.14;z+=.02){ray.set(new T.Vector3(x,1,z),new T.Vector3(0,-1,0));const h=ray.intersectObjects(body).filter(x=>x.point.y>.3&&x.point.y<.7);if(h.length)tops.push(h[0].point.y);}
const evidence=JSON.parse(readFileSync(process.argv[2]??'/tmp/trials-poses-round2-visual/controls/evidence.json','utf8'));
const cases=evidence.trace.filter((x:{renderedTime:number})=>x.renderedTime>=4.5&&x.renderedTime<=4.72).map((x:{stateJson:string;renderedTime:number})=>{const s=JSON.parse(x.stateJson),dx=s.riderBody.pos.x-s.bike.pos.x,dy=s.riderBody.pos.y-s.bike.pos.y,c=Math.cos(s.bike.angle),sn=Math.sin(s.bike.angle);return {name:`played-${x.renderedTime}`,x:dx*c+dy*sn,y:-dx*sn+dy*c,a:s.riderBody.angle-s.bike.angle};});
for(const y of [.46,.65,.70,.72,.75]){const p=riderRigFromHips(-.66,y,40*Math.PI/180,makeRiderRigPose());cases.push({name:`target-hipY-${y}`,x:p.com.x+.065,y:p.com.y-.21,a:p.torsoAngle-RIDER_TORSO_REST});}
if(process.env.AUDIT_SUPPORT_SWEEP){cases.length=0;for(const x of [-.70,-.60,-.55])for(const degrees of [20,30,40,50,60]){const a=degrees*Math.PI/180,u=Math.min(1,Math.max(0,(40-degrees)/20)),y=.5504+.12+.03*u*u*(3-2*u)+.08*Math.sin(a);const p=riderRigFromHips(x,y,a,makeRiderRigPose());if(p.armReach>1||p.legReach>1)continue;cases.push({name:`support-x${x}-angle${degrees}-hipY${y}`,x:p.com.x+.065,y:p.com.y-.21,a:p.torsoAngle-RIDER_TORSO_REST});}}
const report={riderFile,bikeClass,rearFenderTop:{min:Math.min(...tops),max:Math.max(...tops),sampleCount:tops.length},cases:[] as unknown[]};
for(const test of cases){const g=await loadRig(riderFile);const frame=new T.Group(),rider=new GltfRider(g,{complete(){}} as unknown as MaterialLibrary);rider.attach({frame} as HeroBike);const f=new FrameBuilder().frame;f.bikeX=-BIKE_GEOMETRY_V2.chassisToAxle.x;f.bikeY=-BIKE_GEOMETRY_V2.chassisToAxle.y;f.riderBody.present=true;f.riderBody.relX=test.x;f.riderBody.relY=test.y;f.riderBody.relAngle=test.a;f.dt=1/60;rider.update(f);frame.updateMatrixWorld(true);
 const samples:{vertex:number;point:number[];top:number;clearance:number}[]=[];
 frame.traverse(o=>{if(!(o instanceof T.SkinnedMesh))return;o.skeleton.update();const p=o.geometry.getAttribute('position'),ix=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight');for(let i=0;i<p.count;i++){let pelvic=0;for(let k=0;k<4;k++)if(/pelvis|thigh/.test(o.skeleton.bones[ix.getComponent(i,k)].name))pelvic+=w.getComponent(i,k);if(pelvic<.5)continue;const v=new T.Vector3().fromBufferAttribute(p,i);o.applyBoneTransform(i,v);v.applyMatrix4(o.matrixWorld);if(v.x<-.9||v.x>-.5||Math.abs(v.z)>.2)continue;ray.set(new T.Vector3(v.x,1,v.z),new T.Vector3(0,-1,0));const h=ray.intersectObjects(body).filter(h=>h.point.y>.3&&h.point.y<.7);if(h.length)samples.push({vertex:i,point:v.toArray(),top:h[0].point.y,clearance:v.y-h[0].point.y});}});
 samples.sort((a,b)=>a.clearance-b.clearance);report.cases.push({name:test.name,samples:samples.length,belowTop:samples.filter(s=>s.clearance<-.005).length,minClearance:samples[0]?.clearance,worst:samples.slice(0,8)});
}
writeFileSync(new URL(`./rear-support-${process.env.AUDIT_SUPPORT_SWEEP?'support-sweep-':''}${riderFile.replace('.glb','')}-${bikeClass}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.info(JSON.stringify(report));
