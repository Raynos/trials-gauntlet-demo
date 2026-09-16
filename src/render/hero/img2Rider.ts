/// <reference types="vite/client" />
/** Runtime adapter for the frozen img2threejs experiment, not an authoring correction. */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MaterialLibrary } from '../materials/library';
import { GltfRider } from './gltfRider';

// Glob keeps the generated authoring module outside the application's strict TS project.
// This adapter itself is loaded dynamically by the renderer.
const factories = import.meta.glob<() => THREE.Group>(
  '../../../assets/design/hero-targets/reconstruction/createStreetMustard.ts',
  { eager: true, import: 'createStreetMustardBareheadRiderModel' },
);

function document(): GLTF {
  const factory = Object.values(factories)[0];
  if (!factory) throw new Error('img2threejs rider factory is unavailable');
  const model = factory();
  // The frozen generator only binds meshes whose component IDs match bone IDs.
  // Complete that runtime binding for named garment shells before normalizing axes.
  const rig = model.userData.rig as { skeleton: THREE.Skeleton; bones: Record<string, THREE.Bone> };
  const pending: THREE.SkinnedMesh[] = [];
  model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !(o as THREE.SkinnedMesh).skeleton) pending.push(o as THREE.SkinnedMesh); });
  model.updateMatrixWorld(true);
  for (const mesh of pending) {
    const id = mesh.userData.sculptComponent.id as string;
    const [part, side] = id.split('-');
    const owner = part === 'hoodie' ? 'chest' : part === 'jeans' ? 'pelvis'
      : `${({ sleeve: 'upperArm', forearm: 'forearm', thigh: 'thigh', shin: 'shin', palm: 'hand', upper: 'foot' } as Record<string, string>)[part!]}.${side?.toUpperCase()}`;
    const index = rig.skeleton.bones.indexOf(rig.bones[owner]!);
    if (index < 0) throw new Error(`Missing img2threejs shell bone: ${id}`);
    mesh.geometry.applyMatrix4(mesh.matrixWorld);
    model.add(mesh);
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    const count = mesh.geometry.getAttribute('position').count;
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) { indices[v * 4] = index; weights[v * 4] = 1; }
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    mesh.bind(rig.skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
  }
  const scene = new THREE.Group();
  scene.add(model);
  // Generated +Z front → game +X front. Side names are swapped below to keep L at +Z.
  model.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  const skins: THREE.SkinnedMesh[] = [];
  const rigid: { mesh: THREE.Mesh; owner: string }[] = [];
  model.traverse(o => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skins.push(o as THREE.SkinnedMesh);
    else if ((o as THREE.Mesh).isMesh) {
      const id = o.userData.sculptComponent?.id as string | undefined;
      const side = id?.endsWith('-l') ? 'L' : 'R';
      const owner = /^(hair|ear-|eye-)/.test(id ?? '') ? 'head'
        : id === 'hood' ? 'chest' : id?.startsWith('cuff-') ? `forearm.${side}`
        : /^(sole-|tongue-)/.test(id ?? '') ? `foot.${side}` : 'pelvis';
      rigid.push({ mesh: o as THREE.Mesh, owner });
    }
  });
  const byName = new Map(bones.map(b => [b.name, b]));
  const positions = new Map(bones.map(b => [b, b.getWorldPosition(new THREE.Vector3())]));
  // Factory bones have identity axes even along downward limbs. GltfRider aims local +Y.
  // Reframe each bind bone while retaining every rest joint and mesh position.
  for (const b of bones) {
    const child = b.children.find(o => (o as THREE.Bone).isBone) as THREE.Bone | undefined;
    const p = positions.get(b)!;
    const dir = child ? positions.get(child)!.clone().sub(p).normalize() : new THREE.Vector3(0, 1, 0);
    if (b.name === 'pelvis' || b.name === 'chest') dir.set(0, 1, 0);
    const worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.parent!.updateWorldMatrix(true, false);
    b.position.copy(b.parent!.worldToLocal(p.clone()));
    b.quaternion.copy(b.parent!.getWorldQuaternion(new THREE.Quaternion())).invert().multiply(worldQ);
    b.updateMatrixWorld(true);
  }
  for (const { mesh, owner } of rigid) byName.get(owner)!.attach(mesh);
  scene.updateMatrixWorld(true);
  // New inverses preserve generated geometry exactly in the reframed rest pose.
  for (const skeleton of new Set(skins.map(m => m.skeleton))) skeleton.calculateInverses();
  for (const skin of skins) skin.bind(skin.skeleton, skin.matrixWorld);
  for (const b of bones) b.name = b.name.replace(/\.([LR])$/, (_, s: string) => s === 'L' ? '.R' : '.L');
  // Authoring metadata contains live Object3Ds and skeletons (cyclic); SkeletonUtils clones
  // userData through JSON. Runtime animation needs only the actual hierarchy and skin data.
  model.traverse(o => { o.userData = {}; });
  return { scene, scenes: [scene], animations: [], cameras: [], asset: { version: '2.0', generator: 'img2threejs runtime adapter' }, userData: {} } as unknown as GLTF;
}

let source: GLTF | undefined;
export class Img2Rider extends GltfRider {
  constructor(lib: MaterialLibrary) {
    super(source ??= document(), lib);
    this.root.name = 'rider:img2threejs';
  }
}

export function createImg2Rider(lib: MaterialLibrary): Img2Rider {
  return new Img2Rider(lib);
}
