import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import type { HeroBike } from '../bike/bikeModel';
import type { MaterialLibrary } from '../materials/library';
import { GltfRider, type RiderMaterialVariant } from './gltfRider';
import { prepareHero } from './lod';

async function fixture(rows: string[][] = [['rider_rookie', 'rider_pro']]) {
  const scene = new THREE.Group();
  const names = [...new Set(rows.flat())];
  const materials = names.map(name => Object.assign(new THREE.MeshStandardMaterial(), { name }));
  rows.forEach((row, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = `part${index}`;
    mesh.userData = { gltfExtensions: { KHR_materials_variants: {
      mappings: row.map(name => ({ material: names.indexOf(name), variants: [names.indexOf(name)] })),
    } } };
    scene.add(mesh);
  });
  const gltf = { scene, animations: [], userData: { gltfExtensions: { KHR_materials_variants: {
    variants: names.map(name => ({ name })),
  } } }, parser: { getDependency: async (_kind: string, index: number) => materials[index] } } as unknown as GLTF;
  await prepareHero(gltf);
  const rider = new GltfRider(gltf, { complete() {} } as unknown as MaterialLibrary);
  const frame = new THREE.Group();
  rider.attach({ frame } as HeroBike);
  const installed = () => rows.map((_, index) => (frame.getObjectByName(`part${index}`) as THREE.Mesh).material as THREE.Material);
  return { rider, installed, materials };
}

describe('explicit rider material variants', () => {
  it('selects exact asset palettes with instance-owned materials and keeps the compatibility adapter', async () => {
    const { rider, installed, materials } = await fixture();
    expect(installed()[0]!.name).toBe('rider_rookie');
    rider.setMaterialVariant('rider_pro');
    const pro = installed()[0];
    expect(pro!.name).toBe('rider_pro');
    expect(pro).not.toBe(materials[1]);
    rider.setMaterialVariant('rider_pro');
    expect(installed()[0]).toBe(pro);
    rider.setLivery('rookie');
    expect(installed()[0]!.name).toBe('rider_rookie');
    rider.setLivery('pro');
    expect(installed()[0]).toBe(pro);
    rider.dispose();
  });

  it('rejects a missing palette before changing any participating mesh', async () => {
    const { rider, installed } = await fixture([['rider_rookie', 'rider_pro'], ['rider_rookie']]);
    const before = installed();
    expect(() => rider.setMaterialVariant('rider_pro')).toThrow('part1 is missing material variant rider_pro');
    expect(installed()).toEqual(before);
    expect(() => rider.setLivery('pro')).toThrow('missing material variant');
    expect(installed()).toEqual(before);
    rider.dispose();
  });

  it('does not accept another material merely because its name ends in _pro', async () => {
    const { rider, installed } = await fixture([['rider_rookie', 'bike_pro']]);
    const before = installed();
    expect(() => rider.setMaterialVariant('rider_pro')).toThrow('missing material variant rider_pro');
    expect(() => rider.setMaterialVariant('bike_pro' as RiderMaterialVariant)).toThrow('Unknown rider material variant');
    expect(installed()).toEqual(before);
    rider.dispose();
  });

  it('keeps legacy variant-free documents compatible but fails explicit palette requests', async () => {
    const { rider, installed } = await fixture([[]]);
    const before = installed();
    expect(() => rider.setLivery('pro')).not.toThrow();
    expect(() => rider.setMaterialVariant('rider_rookie')).toThrow('Rider has no material variants');
    expect(installed()).toEqual(before);
    rider.dispose();
  });
});
