/**
 * MaterialLibrary: every material in the game by name, plus the map from a
 * SurfaceKind to the material the ridden ribbon uses. Materials are created
 * flat (colour only) so the first frame draws instantly; `generateTextures()`
 * runs once after the first frame and assigns the procedural maps to all of
 * them in one deterministic step (frame 2 in every capture).
 */
import * as THREE from 'three';
import type { SurfaceKind } from '../../core/types';
import { fogify } from '../lighting/environment';
import { flatSet, painters, TexGenJob, type PainterName, type TexSet } from './texgen';

interface TexJob {
  painter: PainterName;
  size: number;
  strength: number;
  rotate?: boolean;
  /** Materials that receive the maps. */
  targets: string[];
  /** Which maps to bind (albedo always unless `noAlbedo`). */
  noAlbedo?: boolean;
}

export const SURFACE_MATERIAL: Record<SurfaceKind, string> = {
  dirt: 'dirt',
  wood: 'plank',
  metal: 'steelPlate',
  concrete: 'concrete',
  rubber: 'rubberMat',
  grate: 'grate',
  stone: 'rock',
  snow: 'snow',
};

export class MaterialLibrary {
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly sets: TexSet[] = [];
  private readonly derived: { base: THREE.MeshStandardMaterial; mat: THREE.MeshStandardMaterial; hero?: boolean; mapAtDerive: THREE.Texture | null }[] = [];
  private generated = false;
  /** 2x2 neutral maps: every MeshStandardMaterial carries the same map set → one program variant. */
  private readonly flat = flatSet();
  /** Bytes of generated textures (for stats). */
  textureBytes = 0;
  /** Wall-clock ms the last generation took (reported, never used for logic). */
  generateMs = 0;

  constructor(private readonly seed: number) {
    const std = (name: string, p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
      // Every material carries the same onBeforeCompile (the fog uniform hook):
      // a different hook is a different program even with identical defines.
      const m = fogify(new THREE.MeshStandardMaterial(p));
      m.name = name;
      this.mats.set(name, m);
      return m;
    };
    // Ground / ridden surfaces
    std('dirt', { color: 0x948676, roughness: 0.95 });
    std('plank', { color: 0xc9b58e, roughness: 0.75 });
    std('steelPlate', { color: 0x5a5b5e, roughness: 0.55, metalness: 0.8 });
    std('concrete', { color: 0xa4a29e, roughness: 0.85 });
    std('rubberMat', { color: 0x1c1c1e, roughness: 0.9 });
    std('grate', { color: 0x3a3c40, roughness: 0.6, metalness: 0.7 });
    std('rock', { color: 0xc49a74, roughness: 0.9 });
    std('asphaltWet', { color: 0x2a2c30, roughness: 0.3 }); // nightCity ride surface: wet, reflective
    std('snow', { color: 0xeef3f8, roughness: 0.7 });
    // Props
    std('container', { color: 0xffffff, roughness: 0.5, metalness: 0.6 }); // per-instance colour
    std('containerRed', { color: 0x8a2c22, roughness: 0.5, metalness: 0.6 });
    std('labContainerRed', { color: 0xb83d35, roughness: 0.72, metalness: 0.15 });
    std('labContainerIvory', { color: 0xeee9dc, roughness: 0.8, metalness: 0.1 });
    std('containerBlue', { color: 0x2a4f7a, roughness: 0.5, metalness: 0.6 });
    std('rustSteel', { color: 0x6b5a4c, roughness: 0.7, metalness: 0.6 });
    std('darkSteel', { color: 0x2a2c30, roughness: 0.55, metalness: 0.8 });
    std('brick', { color: 0x6d4a3a, roughness: 0.95 });
    std('plywood', { color: 0xbfa882, roughness: 0.8 });
    std('barrelRed', { color: 0xa42a1e, roughness: 0.45, metalness: 0.5 });
    std('barrelWhite', { color: 0xd8d2c4, roughness: 0.45, metalness: 0.5 });
    std('barrelBlue', { color: 0x244d8a, roughness: 0.45, metalness: 0.5 });
    std('pallet', { color: 0x9a7d55, roughness: 0.85 });
    std('plaque', { color: 0xf2efe6, roughness: 0.6 });
    std('plaqueInk', { color: 0x141416, roughness: 0.6 });
    std('hazardTape', { color: 0xe8b21c, roughness: 0.6 });
    std('safetyGreen', { color: 0x2e8b4a, roughness: 0.7 });
    // Bike (round 6 hero): metallic blue frame + plastics, black engine mass, brushed alloy,
    // anodised black lowers, chrome stanchions, steel exhaust. No noise albedo on paint.
    std('framePaint', { color: 0x1d4fd8, roughness: 0.38, metalness: 0.55 }); // metallic blue spars
    std('framePaintLow', { color: 0x2f4a9a, roughness: 0.62, metalness: 0.4 }); // cradle / bash plate: dusted
    std('bodyPaint', { color: 0x2158e0, roughness: 0.32, metalness: 0.08 }); // tank, seat base, fenders, shrouds, guards
    std('plastic', { color: 0xf2f2f0, roughness: 0.5 });
    std('chrome', { color: 0xe8e9ec, roughness: 0.12, metalness: 1.0 }); // stanchions, shock shaft
    std('engine', { color: 0x1e1f23, roughness: 0.55, metalness: 0.7 }); // black engine mass
    std('engineDusty', { color: 0x3a3630, roughness: 0.85, metalness: 0.4 }); // lower cases: dust build-up
    std('alloy', { color: 0x9a9ca2, roughness: 0.4, metalness: 0.95 }); // hubs, carb, levers
    std('alloyBrushed', { color: 0xb4b6ba, roughness: 0.48, metalness: 0.9 }); // swingarm, clamps, covers, bars
    std('anodised', { color: 0x1b1c20, roughness: 0.3, metalness: 0.85 }); // fork lowers, shock body, axle blocks
    std('blackMatte', { color: 0x151517, roughness: 0.85, metalness: 0.1 });
    std('blackGloss', { color: 0x101012, roughness: 0.35, metalness: 0.2 });
    std('tyre', { color: 0x141415, roughness: 0.92 });
    std('rim', { color: 0xc9cbd0, roughness: 0.3, metalness: 1.0 });
    std('spoke', { color: 0xcfcfcf, roughness: 0.3, metalness: 1.0 });
    std('disc', { color: 0xa8aaae, roughness: 0.35, metalness: 1.0, side: THREE.DoubleSide });
    std('seat', { color: 0x1c1c1e, roughness: 0.95 });
    std('exhaust', { color: 0x8e8f93, roughness: 0.38, metalness: 0.95 }); // heat-dulled steel header
    std('silencer', { color: 0x2a2b2e, roughness: 0.45, metalness: 0.6 }); // black silencer can
    std('shockSpring', { color: 0xd42a1e, roughness: 0.4, metalness: 0.5 });
    std('numberPlate', { color: 0xfafafa, roughness: 0.5 });
    // Rider: yellow jersey, dark blue pants, black boots/gloves, blue helmet, mirrored visor.
    std('jersey', { color: 0xf5c518, roughness: 1.0, metalness: 0 });
    std('pants', { color: 0x1c2a4e, roughness: 0.9 });
    std('armour', { color: 0x24262b, roughness: 0.45, metalness: 0.05 });
    std('boots', { color: 0x131315, roughness: 0.55 });
    std('bootSole', { color: 0x2c2a26, roughness: 0.9 });
    std('gloves', { color: 0x1c1e22, roughness: 0.8 });
    std('helmet', { color: 0x1c48d4, roughness: 0.22, metalness: 0.25 });
    std('helmetTrim', { color: 0xf4f4f2, roughness: 0.3 });
    std('visor', { color: 0x1a2028, roughness: 0.06, metalness: 1.0 }); // mirrored: catches the sky/windows
    std('jerseyNumber', { color: 0xffffff, roughness: 0.9 });
    // One vertex-coloured cloth material for the rider kit (jersey / pants / gloves / boots /
    // armour tints baked per vertex) so every limb segment is a single draw.
    std('riderCloth', { color: 0xffffff, roughness: 0.9, vertexColors: true });
    std('skin', { color: 0xc9946a, roughness: 0.7 });
    for (const m of this.mats.values()) this.complete(m);
  }

  /** Fill missing maps with the neutral set so the material shares the common program. */
  complete(m: THREE.MeshStandardMaterial): void {
    const flat = this.flat;
    if (!m.map || m.map === flat.map) m.map = m.map ?? flat.map;
    if (!m.normalMap) m.normalMap = flat.normalMap;
    if (!m.roughnessMap) m.roughnessMap = flat.ormMap;
    if (!m.metalnessMap) m.metalnessMap = flat.ormMap;
    if (!m.aoMap) m.aoMap = flat.ormMap;
    if (!m.emissiveMap) m.emissiveMap = flat.map;
    m.needsUpdate = true;
  }

  get(name: string): THREE.MeshStandardMaterial {
    const m = this.mats.get(name);
    if (!m) throw new Error(`material missing: ${name}`);
    return m;
  }

  has(name: string): boolean {
    return this.mats.has(name);
  }

  /** The library name of a material instance (identity), or null for a derived / local one. */
  nameOf(m: THREE.Material): string | null {
    for (const [name, mat] of this.mats) if (mat === m) return name;
    return null;
  }

  surface(kind: SurfaceKind): THREE.MeshStandardMaterial {
    return this.get(SURFACE_MATERIAL[kind] ?? 'dirt');
  }

  /** Clone a library material; the clone receives the procedural maps too (now or when generated). */
  derive(name: string): THREE.MeshStandardMaterial {
    const base = this.get(name);
    const m = fogify(base.clone());
    m.name = '';
    this.derived.push({ base, mat: m, mapAtDerive: m.map });
    if (this.generated) this.copyMaps(base, m);
    return m;
  }

  /**
   * Round 11 (liveries): a per-instance clone of a hero material. Like `derive` it receives the
   * procedural map set when that is generated, but it is NOT fogified (hero materials never are —
   * same program variant as the rest of the bike), maps already set on it are kept (the number
   * plate canvas) and its colour / roughness / metalness are never copied back over.
   */
  deriveHero(name: string): THREE.MeshStandardMaterial {
    const base = this.get(name);
    const m = base.clone();
    m.name = '';
    this.derived.push({ base, mat: m, hero: true, mapAtDerive: m.map });
    if (this.generated) this.copyMaps(base, m, true);
    return m;
  }

  private copyMaps(base: THREE.MeshStandardMaterial, m: THREE.MeshStandardMaterial, hero = false, mapAtDerive: THREE.Texture | null = null): void {
    if (hero) {
      if (!m.map || m.map === base.map) m.map = base.map;
      if (!m.normalMap) m.normalMap = base.normalMap;
      m.normalScale.copy(base.normalScale);
      if (!m.roughnessMap) m.roughnessMap = base.roughnessMap;
      if (!m.metalnessMap) m.metalnessMap = base.metalnessMap;
      if (!m.aoMap) m.aoMap = base.aoMap;
      m.aoMapIntensity = base.aoMapIntensity;
      if (!m.emissiveMap) m.emissiveMap = base.emissiveMap;
      m.needsUpdate = true;
      return;
    }
    // Round 11: a derived material that set its OWN albedo (the hall's eight container skins,
    // `hall.ts containerSkin`) keeps it — this copy used to replace the skins with the generic
    // container map on the first world of every session (built before `generateTextures`), so
    // load 1 and load 2 of the same track drew different containers (49 vs 70 MB of textures).
    if (!m.map || m.map === mapAtDerive || m.map === base.map) m.map = base.map;
    m.normalMap = base.normalMap;
    m.normalScale.copy(base.normalScale);
    m.roughnessMap = base.roughnessMap;
    m.metalnessMap = base.metalnessMap;
    m.aoMap = base.aoMap;
    m.aoMapIntensity = base.aoMapIntensity;
    m.emissiveMap = base.emissiveMap;
    m.roughness = base.roughness;
    m.metalness = base.metalness;
    m.needsUpdate = true;
  }

  all(): Iterable<THREE.MeshStandardMaterial> {
    return this.mats.values();
  }

  get hasTextures(): boolean {
    return this.generated;
  }

  /**
   * Generate every procedural map and bind it. Synchronous by design so that
   * the frame on which textures appear is the same in every capture.
   */
  private static readonly JOBS: TexJob[] = [
    { painter: 'dirt', size: 512, strength: 2.0, targets: ['dirt'] },
    { painter: 'plank', size: 512, strength: 1.4, rotate: true, targets: ['plank', 'plywood', 'pallet'] },
    { painter: 'concrete', size: 512, strength: 1.2, targets: ['concrete', 'asphaltWet'] },
    { painter: 'rust', size: 256, strength: 1.2, targets: ['steelPlate', 'rustSteel', 'grate', 'darkSteel'], noAlbedo: false },
    { painter: 'corrugated', size: 512, strength: 2.2, targets: ['container', 'containerRed', 'containerBlue', 'barrelRed', 'barrelWhite', 'barrelBlue'] },
    { painter: 'rubber', size: 256, strength: 2.5, targets: ['tyre'], noAlbedo: true },
    { painter: 'paintMetallic', size: 256, strength: 0.6, targets: ['framePaint', 'framePaintLow', 'bodyPaint', 'helmet'] }, // flake + edge chips (albedo only darkens at chips)
    { painter: 'brushed', size: 256, strength: 0.5, targets: ['alloyBrushed', 'anodised', 'exhaust', 'rim'], noAlbedo: true },
    { painter: 'fabric', size: 256, strength: 0.8, targets: ['jersey', 'pants', 'gloves', 'riderCloth'], noAlbedo: true },
    { painter: 'rock', size: 512, strength: 2.0, targets: ['rock'] },
    { painter: 'snow', size: 256, strength: 1.5, targets: ['snow'] },
  ];
  private nextJob = 0;

  /** Number of texture jobs (for progress reporting). */
  get jobCount(): number {
    return MaterialLibrary.JOBS.length;
  }
  get jobsDone(): number {
    return this.nextJob;
  }

  /** Job in progress (round 9: painters run in row bands so no loader task exceeds the budget). */
  private current: TexGenJob | null = null;

  /** Name of the job in progress / next up (for the loading screen). */
  get currentJobName(): string {
    const job = MaterialLibrary.JOBS[Math.min(this.nextJob, MaterialLibrary.JOBS.length - 1)];
    return job ? `${job.painter} ${job.size}²` : '';
  }

  /** Fraction of all texture work done (whole jobs + the current job's rows). */
  get generateProgress(): number {
    const n = MaterialLibrary.JOBS.length;
    return Math.min(1, (this.nextJob + (this.current?.progress ?? 0)) / n);
  }

  /**
   * Run texture work for up to `budgetMs` of wall time (Infinity = one whole job, the
   * synchronous path). Returns false when every job is done. A job that finishes inside the
   * budget binds its maps at once; the next job starts on the next call.
   */
  generateStep(budgetMs = Infinity): boolean {
    const jobs = MaterialLibrary.JOBS;
    if (this.nextJob >= jobs.length) return false;
    const t0 = performance.now();
    const idx = this.nextJob;
    const job = jobs[idx]!;
    if (!this.current) this.current = new TexGenJob(job.size, (this.seed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0, painters[job.painter], job.strength);
    const finished = this.current.step(budgetMs);
    if (!finished) {
      this.generateMs += performance.now() - t0;
      return true;
    }
    const set = this.current.result!;
    this.current = null;
    this.nextJob++;
    this.sets.push(set);
    this.textureBytes += set.bytes;
    if (job.rotate) {
      for (const t of [set.map, set.normalMap, set.ormMap]) {
        t.center.set(0.5, 0.5);
        t.rotation = Math.PI / 2;
      }
    }
    for (const name of job.targets) {
      const m = this.get(name);
      if (!job.noAlbedo) m.map = set.map;
      m.normalMap = set.normalMap;
      m.normalScale.set(1, 1);
      m.roughnessMap = set.ormMap;
      m.metalnessMap = set.ormMap;
      m.aoMap = set.ormMap;
      m.aoMapIntensity = 0.8;
      // When a map is present the scalar multiplies the texel; painters bake
      // mid-grey so the scalar keeps its meaning.
      if (m.metalnessMap) m.metalness = Math.max(m.metalness, 1);
      m.roughness = 1;
      m.needsUpdate = true;
    }
    this.generateMs += performance.now() - t0;
    if (this.nextJob >= jobs.length) this.finishTextures();
    return this.nextJob < jobs.length;
  }

  private finishTextures(): void {
    if (this.generated) return;
    this.generated = true;
    // Wet asphalt keeps a low roughness scalar over the concrete ORM (reflections of the neon/sky).
    this.get('asphaltWet').roughness = 0.35;
    for (const m of this.mats.values()) this.complete(m);
    for (const d of this.derived) this.copyMaps(d.base, d.mat, d.hero === true, d.mapAtDerive);
  }

  /** Generate every remaining job synchronously (the render() fallback: one deterministic step). */
  generateTextures(): void {
    while (this.generateStep()) {
      /* next job */
    }
  }

  dispose(): void {
    for (const s of this.sets) {
      s.map.dispose();
      s.normalMap.dispose();
      s.ormMap.dispose();
    }
    for (const m of this.mats.values()) m.dispose();
  }
}
