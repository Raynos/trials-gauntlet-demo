/**
 * Checkpoint gates (steel posts, hanging plaque with the zone label, lamp that
 * turns green once armed) and the finish gate (arch + checkered banner).
 */
import * as THREE from 'three';
import type { CompiledTrack } from '../../core/types';
import type { MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { profileY } from './track';

export interface Gates {
  group: THREE.Group;
  lamps: THREE.MeshStandardMaterial[];
  finishLamp: THREE.MeshStandardMaterial;
  /** Flame jet emitter positions per checkpoint (world). */
  jets: { x: number; y: number; z: number }[][];
  drawCalls: number;
  triangles: number;
  textureBytes: number;
}

function labelTexture(text: string, w = 256, h = 128, ink = '#141416', paper = '#f2efe6'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink;
  g.fillRect(0, 0, w, 6);
  g.fillRect(0, h - 6, w, 6);
  g.font = `italic bold ${Math.floor(h * 0.62)}px Impact, "Arial Black", Helvetica, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  const n = 4;
  const s = c.height / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < c.width / s; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f4f4f2' : '#121214';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  g.fillStyle = 'rgba(220,40,30,0.92)';
  g.fillRect(96, 28, 320, 72);
  g.fillStyle = '#ffffff';
  g.font = 'italic bold 58px Impact, "Arial Black", Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ZONE = ['D', 'C', 'B', 'A'];

export function buildGates(track: CompiledTrack, lib: MaterialLibrary): Gates {
  const group = new THREE.Group();
  group.name = 'gates';
  const profile = track.def.profile;
  const steel = fogify(lib.get('darkSteel'));
  const lamps: THREE.MeshStandardMaterial[] = [];
  const jets: Gates['jets'] = [];
  let drawCalls = 0;
  let triangles = 0;
  let textureBytes = 0;
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 3.4, 10);
  const beamGeo = new THREE.BoxGeometry(0.1, 0.12, 4.4);
  const lampGeo = new THREE.SphereGeometry(0.11, 12, 8);
  const plaqueGeo = new THREE.BoxGeometry(0.9, 0.45, 0.04);
  const chainGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5);

  track.def.checkpoints.forEach((cp, i) => {
    const gy = cp.spawn.pos.y;
    const x = cp.x;
    const g = new THREE.Group();
    g.position.set(x, gy, 0);
    for (const z of [-2.0, 2.0]) {
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(0, 1.7, z);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, steel);
    beam.position.set(0, 3.4, 0);
    beam.castShadow = true;
    g.add(beam);
    // Lamp on the near post: dark red until armed, then green.
    const lampMat = fogify(new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0x7a1010, emissiveIntensity: 1.5, roughness: 0.3 }));
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 3.55, 2.0);
    g.add(lamp);
    lamps.push(lampMat);
    // Hanging plaque with the zone label, offset toward the camera side.
    const label = `${ZONE[Math.min(3, Math.floor(i / 3))]}${(i % 3) + 1}`;
    const tex = labelTexture(label);
    textureBytes += 256 * 128 * 4 * 1.33;
    const plaqueMat = fogify(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    const plaque = new THREE.Mesh(plaqueGeo, [lib.get('plaque'), lib.get('plaque'), lib.get('plaque'), lib.get('plaque'), plaqueMat, plaqueMat]);
    plaque.position.set(0, 2.55, 1.6);
    plaque.rotation.y = 0.25;
    plaque.castShadow = true;
    g.add(plaque);
    for (const dz of [-0.3, 0.3]) {
      const chain = new THREE.Mesh(chainGeo, lib.get('chrome'));
      chain.position.set(0, 3.08, 1.6 + dz);
      g.add(chain);
    }
    group.add(g);
    jets.push([
      { x: x - 0.6, y: gy, z: -1.6 },
      { x: x + 0.6, y: gy, z: -1.6 },
      { x: x - 0.6, y: gy, z: 1.6 },
      { x: x + 0.6, y: gy, z: 1.6 },
    ]);
    drawCalls += 8;
    triangles += 900;
  });

  // Finish gate: two big posts, arch, checkered banner, white lamp.
  const fx = track.def.finishX;
  const fy = profileY(profile, fx);
  const fin = new THREE.Group();
  fin.position.set(fx, fy, 0);
  const bigPost = new THREE.CylinderGeometry(0.12, 0.14, 4.8, 12);
  for (const z of [-2.3, 2.3]) {
    const p = new THREE.Mesh(bigPost, steel);
    p.position.set(0, 2.4, z);
    p.castShadow = true;
    fin.add(p);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 5.0), steel);
  arch.position.set(0, 4.85, 0);
  arch.castShadow = true;
  fin.add(arch);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), fogify(new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7, side: THREE.DoubleSide })));
  banner.rotation.y = Math.PI / 2;
  banner.position.set(0, 4.15, 0);
  banner.castShadow = true;
  fin.add(banner);
  textureBytes += 512 * 128 * 4 * 1.33;
  const finishLamp = fogify(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 2.0, roughness: 0.3 }));
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), finishLamp);
  fl.position.set(0, 5.1, 0);
  fin.add(fl);
  group.add(fin);
  drawCalls += 5;
  triangles += 800;

  return { group, lamps, finishLamp, jets, drawCalls, triangles, textureBytes };
}
