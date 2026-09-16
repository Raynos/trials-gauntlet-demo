import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const source = path.resolve('assets/design/hero-targets/reconstruction/createStreetMustard.ts');
const module = await import(pathToFileURL(source).href);
const factory = Object.entries(module).find(([key, value]) => /^create.*Model$/.test(key) && typeof value === 'function')![1] as () => THREE.Group;
const load = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
let root: THREE.Group;
try { root = factory(); } finally { THREE.TextureLoader.prototype.load = load; }
root.updateMatrixWorld(true);
const records: object[] = [];
for (const [id, mesh] of Object.entries(root.userData.sculptRuntime.meshes) as [string, THREE.Mesh][]) {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({length: positions.count}, (_,i)=>i);
  const parent = Array.from({length:positions.count},(_,i)=>i);
  const find = (i:number):number => { while(parent[i]!==i){parent[i]=parent[parent[i]!]!; i=parent[i]!;} return i; };
  const join=(a:number,b:number)=>{parent[find(a)]=find(b);};
  for(let i=0;i<indices.length;i+=3){join(indices[i]!,indices[i+1]!);join(indices[i]!,indices[i+2]!);}
  const used=new Set(indices),components=new Map<number,number>();
  for(const i of used){const r=find(i);components.set(r,(components.get(r)??0)+1);}
  const bounds=new THREE.Box3();
  for(const i of used){const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld); if(!p.toArray().every(Number.isFinite))throw Error('nonfinite '+id);bounds.expandByPoint(p);}
  const edgeUses=new Map<string,number>();
  for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i]!,indices[i+1]!],[indices[i+1]!,indices[i+2]!],[indices[i+2]!,indices[i]!]]){const key=a<b?`${a},${b}`:`${b},${a}`;edgeUses.set(key,(edgeUses.get(key)??0)+1);}
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const hiddenMaterial=materials.every(m=>m.transparent && m.opacity===0);
  let visible=true;for(let o:THREE.Object3D|null=mesh;o;o=o.parent)visible&&=o.visible;
  records.push({id,visible,hiddenMaterial,renderVisible:visible&&!hiddenMaterial,boundaryEdges:[...edgeUses.values()].filter(n=>n===1).length,nonManifoldEdges:[...edgeUses.values()].filter(n=>n>2).length,vertices:positions.count,triangles:indices.length/3,indexConnectedComponents:components.size,componentVertexCounts:[...components.values()].sort((a,b)=>b-a),worldBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},unboundSkinBaseGeometryOnly:!!((mesh as THREE.SkinnedMesh).isSkinnedMesh && !(mesh as THREE.SkinnedMesh).skeleton)});
}
const report={source,sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),method:'Actual indexed triangle graph; no position welding or proximity merge. Base geometry before future skin binding; unbound skins explicit. Texture pixels not needed for geometry census.',records};
await writeFile('assets/design/hero-targets/reconstruction/shape-fit-r12-measured.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
