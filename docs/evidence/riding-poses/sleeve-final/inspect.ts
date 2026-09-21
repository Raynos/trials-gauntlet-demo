import {loadRigAt} from '../../../../src/render/hero/gltfTestUtils';
import {prepareHero} from '../../../../src/render/hero/lod';
import * as T from 'three';
const g=await loadRigAt(new URL('../../../../public/models/rider-race-bluewhite.glb',import.meta.url),true);await prepareHero(g);
g.scene.traverse(o=>{if(o instanceof T.SkinnedMesh){const p=o.geometry.getAttribute('position'),ix=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight');const mixes=new Map<string,number>();for(let i=0;i<p.count;i++){const names=[];for(let k=0;k<4;k++)if(w.getComponent(i,k)>1e-6)names.push(o.skeleton.bones[ix.getComponent(i,k)]!.name);names.sort();const key=names.join(',');mixes.set(key,(mixes.get(key)??0)+1);}console.log(o.name,p.count,Array.from(mixes).filter(([k])=>/Arm|forearm/.test(k)));}});
