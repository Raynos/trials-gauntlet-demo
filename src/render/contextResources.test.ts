import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { releaseSceneAllocations } from './contextResources';
import { ArtLibrary } from './art/library';

describe('lost-context allocation invalidation', () => {
  it('removes old manager listeners on shared scene resources and inactive documents without changing CPU data', () => {
    const scene = new THREE.Scene(), inactive = new THREE.Group();
    const geometry = new THREE.BoxGeometry(), positions = geometry.getAttribute('position').array;
    const texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1);
    const material = new THREE.ShaderMaterial({ uniforms: { map: { value: texture } } });
    const mesh = new THREE.Mesh(geometry, material), other = new THREE.Mesh(geometry, material);
    scene.add(mesh); inactive.add(other);
    const events: string[] = [];
    for (const resource of [geometry, texture, material]) {
      const listener = () => { events.push(String(resource.type)); resource.removeEventListener('dispose', listener); };
      resource.addEventListener('dispose', listener);
    }
    releaseSceneAllocations([scene, inactive]);
    expect(events).toHaveLength(3);
    expect(geometry.getAttribute('position').array).toBe(positions);
    expect(mesh.parent).toBe(scene); expect(other.parent).toBe(inactive);
    expect(texture.image.data).toEqual(new Uint8Array([1, 2, 3, 4]));
    // Reallocation registers a new manager; later normal disposal cannot invoke the old one.
    const newManager = vi.fn(); geometry.addEventListener('dispose', newManager);
    geometry.dispose(); material.dispose(); texture.dispose();
    expect(events).toHaveLength(3); expect(newManager).toHaveBeenCalledOnce();
  });

  it('invalidates instance attributes, skeleton textures and both shadow targets', () => {
    const root = new THREE.Group(), geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial();
    const instance = new THREE.InstancedMesh(geometry, material, 2);
    const skin = new THREE.SkinnedMesh(geometry, material); skin.skeleton = new THREE.Skeleton([]);
    skin.skeleton.boneTexture = new THREE.DataTexture();
    const light = new THREE.DirectionalLight();
    light.shadow.map = new THREE.WebGLRenderTarget(); light.shadow.mapPass = new THREE.WebGLRenderTarget();
    const releases = [instance, skin.skeleton.boneTexture, light.shadow.map, light.shadow.mapPass].map(object => {
      const fn = vi.fn(); (object as THREE.EventDispatcher<{ dispose: object }>).addEventListener('dispose', fn); return fn;
    });
    root.add(instance, skin, light);
    releaseSceneAllocations([root]);
    for (const release of releases) expect(release).toHaveBeenCalledOnce();
    expect(light.shadow.map).toBeNull(); expect(light.shadow.mapPass).toBeNull();
    expect(skin.skeleton.boneTexture).not.toBeNull();
  });

  it('keeps art bitmap/cache identity through loss and closes the image only on terminal disposal', () => {
    const art = new ArtLibrary(), bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const fields = art as unknown as { bitmaps: Map<string, ImageBitmap> };
    fields.bitmaps.set('test', bitmap);
    const texture = art.texture('test')!;
    const release = vi.fn(); texture.addEventListener('dispose', release);
    art.releaseGPU();
    expect(release).toHaveBeenCalledOnce(); expect(bitmap.close).not.toHaveBeenCalled();
    expect(art.texture('test')).toBe(texture);
    art.dispose();
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(art.texture('test')).toBeNull();
  });
});
