import * as THREE from 'three';

/** Release GPU allocations while the lost generation's Three managers still own their
 * disposal listeners. CPU geometry, textures and scene topology remain reusable. Never
 * call after webglcontextrestored: r186 has already replaced its allocation managers. */
export function releaseSceneAllocations(roots: Iterable<THREE.Object3D>): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const addTexture = (value: unknown): void => { if (value instanceof THREE.Texture) textures.add(value); };
  for (const root of roots) root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) materials.add(material);
    if (object instanceof THREE.SkinnedMesh) addTexture(object.skeleton?.boneTexture);
    if (object instanceof THREE.InstancedMesh) object.dispose(); // instance attributes have an object-owned listener
    const shadow = (object as THREE.Light & { shadow?: THREE.LightShadow }).shadow;
    if (shadow) { shadow.map?.dispose(); shadow.mapPass?.dispose(); shadow.map = null; shadow.mapPass = null; }
    if (object instanceof THREE.Scene) { addTexture(object.background); addTexture(object.environment); }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) addTexture(value);
    for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms ?? {})) addTexture(uniform.value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) { texture.dispose(); texture.needsUpdate = true; }
}
