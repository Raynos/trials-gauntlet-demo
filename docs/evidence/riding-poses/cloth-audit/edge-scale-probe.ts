import * as T from 'three';
import {loadRigAt} from '../../../../src/render/hero/gltfTestUtils';
import {prepareHero} from '../../../../src/render/hero/lod';
for(const [file,ids] of [['rider-street-mustard.glb',[25589]],['rider-race-bluewhite.glb',[15596,15599]]] as const){
 const g=await loadRigAt(new URL('../../../../public/models/'+file,import.meta.url),true);await prepareHero(g);g.scene.updateMatrixWorld(true);
 g.scene.traverse(o=>{if(!(o instanceof T.SkinnedMesh)||o.name!=='rider_body')return;const a=o.geometry.getAttribute('position'),index=o.geometry.index;for(const id of ids){const points=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(a,index?.getX(id*3+k)??id*3+k).applyMatrix4(o.matrixWorld));console.info(file,id,'bindEdgeLengths',points.map((p,k)=>p.distanceTo(points[(k+1)%3]!)),'bindPoints',points.map(p=>p.toArray()));}});
}
