import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeRenderer } from './index';

afterEach(() => vi.useRealTimers());

interface Compiler {
  compileMaterials(mats: THREE.Material[], report?: (done: number, total: number) => void, abort?: () => boolean): Promise<number>;
}

function fixture(scene: THREE.Scene) {
  vi.useFakeTimers();
  const originalTarget = new THREE.WebGLRenderTarget(), compileTarget = new THREE.WebGLRenderTarget();
  let target: THREE.WebGLRenderTarget | null = originalTarget, face = 2, mip = 3;
  const calls: { batch: THREE.Object3D; camera: THREE.Camera; targetScene: THREE.Scene; resolve(): void; reject(e: Error): void }[] = [];
  const gl = {
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null, cube = 0, level = 0) => { target = next; face = cube; mip = level; }),
    compileAsync: vi.fn((batch: THREE.Object3D, camera: THREE.Camera, targetScene: THREE.Scene) =>
      new Promise<void>((resolve, reject) => { calls.push({ batch, camera, targetScene, resolve, reject }); })),
  };
  const post = { sceneTarget: compileTarget as THREE.WebGLRenderTarget | null, setQuality: () => { post.sceneTarget = null; } };
  const fields = { scene, renderer: gl, postRef: post, rig: { camera: new THREE.PerspectiveCamera() },
    compilePending: Promise.resolve(), tier: 'high', lightingRig: null, emitters: {}, bikeRef: null, riderRef: null,
    resize: vi.fn(), applyTierVisibility: vi.fn() };
  const renderer = Object.assign(Object.create(ThreeRenderer.prototype) as object, fields) as unknown as ThreeRenderer;
  return { renderer, compiler: renderer as unknown as Compiler, fields, gl, calls, originalTarget, compileTarget,
    target: () => ({ target, face, mip }) };
}

function meshMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const found = new Set<THREE.Material>();
  // Matches Three's compile traversal: hidden meshes still participate.
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) found.add(m);
  });
  return found;
}

describe('isolated shader compilation', () => {
  it('compiles only each material batch with real scene lighting and exact skin/instance/morph variants', async () => {
    const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
    geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
    const a = new THREE.MeshStandardMaterial(), b = a.clone(), c = a.clone();
    const skin = new THREE.SkinnedMesh(geometry, a);
    skin.skeleton = new THREE.Skeleton([]);
    skin.receiveShadow = true;
    const instances = new THREE.InstancedMesh(geometry, a, 2);
    instances.setColorAt(0, new THREE.Color('red'));
    instances.morphTexture = new THREE.DataTexture();
    const multi = new THREE.Mesh(geometry, [b, c]);
    multi.visible = false;
    const plain = new THREE.Mesh(geometry, a), light = new THREE.DirectionalLight();
    scene.add(skin, instances, multi, plain, light);
    scene.fog = new THREE.Fog('white', 1, 100);
    scene.environment = new THREE.Texture();
    const f = fixture(scene), progress = vi.fn();
    const job = f.compiler.compileMaterials([a, b, c], progress);
    await Promise.resolve();
    const first = f.calls[0]!;
    expect(meshMaterials(first.batch)).toEqual(new Set([a, b]));
    expect(first.targetScene).toBe(scene);
    expect(first.targetScene.children).toContain(light);
    expect(first.targetScene.fog).toBe(scene.fog);
    expect(first.targetScene.environment).toBe(scene.environment);
    const copies = first.batch.children as THREE.Mesh[];
    expect(copies).toHaveLength(4);
    expect(copies.every((mesh) => mesh.geometry === geometry)).toBe(true);
    const skinCopy = copies.find((mesh) => (mesh as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
    expect(skinCopy.skeleton).toBe(skin.skeleton);
    expect(skinCopy.receiveShadow).toBe(true);
    expect(skinCopy.morphTargetInfluences).toEqual(skin.morphTargetInfluences);
    const instanceCopy = copies.find((mesh) => (mesh as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(instanceCopy.count).toBe(2);
    expect(instanceCopy.instanceColor).not.toBeNull();
    expect(instanceCopy.morphTexture).not.toBeNull();
    expect(f.target()).toEqual({ target: f.originalTarget, face: 2, mip: 3 });
    expect([skin.parent, instances.parent, multi.parent, plain.parent]).toEqual([scene, scene, scene, scene]);
    expect(multi.visible).toBe(false);
    expect(multi.material).toEqual([b, c]);
    // Rendering may select another target while readiness is pending. Completion cannot reset it.
    f.gl.setRenderTarget(null, 0, 0);
    first.resolve();
    await vi.runAllTimersAsync();
    expect(meshMaterials(f.calls[1]!.batch)).toEqual(new Set([c]));
    expect(f.target()).toEqual({ target: null, face: 0, mip: 0 });
    f.calls[1]!.resolve();
    await vi.runAllTimersAsync();
    await job;
    expect(progress.mock.calls).toEqual([[2, 3], [3, 3]]);
    expect(f.target()).toEqual({ target: null, face: 0, mip: 0 });
  });

  it('serializes a replacement entry, skips the stale tail, and preserves a quality change during the old poll', async () => {
    const scene = new THREE.Scene(), mats = Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial());
    const meshes = mats.map((m) => new THREE.Mesh(new THREE.BufferGeometry(), m));
    scene.add(...meshes);
    const f = fixture(scene), oldProgress = vi.fn();
    let stale = false;
    const old = f.compiler.compileMaterials(mats.slice(0, 3), oldProgress, () => stale);
    await Promise.resolve();
    expect(f.calls).toHaveLength(1);
    stale = true;
    scene.remove(meshes[0]!); mats[0]!.dispose();
    f.fields.applyTierVisibility.mockImplementation(() => { meshes[2]!.visible = false; });
    f.renderer.setQuality('low');
    const replacement = f.compiler.compileMaterials([mats[3]!]);
    await Promise.resolve();
    expect(f.calls).toHaveLength(1);
    expect(meshes[2]!.visible).toBe(false);
    f.calls[0]!.resolve();
    await vi.runAllTimersAsync();
    expect(f.calls).toHaveLength(2);
    expect(meshMaterials(f.calls[1]!.batch)).toEqual(new Set([mats[3]!]));
    expect(meshes[2]!.visible).toBe(false);
    expect(oldProgress).not.toHaveBeenCalled();
    f.calls[1]!.resolve();
    await vi.runAllTimersAsync();
    await Promise.all([old, replacement]);
    expect(meshes[2]!.visible).toBe(false);
  });

  it('restores target state after a failed compilation and permits the next request', async () => {
    const scene = new THREE.Scene(), mat = new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), mat));
    const f = fixture(scene);
    const failed = f.compiler.compileMaterials([mat]);
    const rejected = expect(failed).rejects.toThrow('driver failure');
    await Promise.resolve();
    expect(f.target()).toEqual({ target: f.originalTarget, face: 2, mip: 3 });
    f.calls[0]!.reject(new Error('driver failure'));
    await rejected;
    const next = f.compiler.compileMaterials([mat]);
    await Promise.resolve();
    expect(f.calls).toHaveLength(2);
    f.calls[1]!.resolve();
    await vi.runAllTimersAsync();
    await next;
  });
});
