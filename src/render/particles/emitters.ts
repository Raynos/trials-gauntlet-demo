/**
 * Emitter rules: RenderFrame cues + game events → bursts into the pools.
 * Dirt kick from rearSlip, landing dust by surface, sparks on metal, exhaust
 * puffs from throttleEff, checkpoint flame jets, finish confetti, crash dust,
 * ambient motes / snow / embers. All seeded by (trackSeed ^ tick).
 */
import * as THREE from 'three';
import { Rng } from '../../core/rng';
import type { GameEvent, SurfaceKind } from '../../core/types';
import type { Biome } from '../biomes';
import type { RenderFrame } from '../frame';
import { ParticleSystem, puffTexture, type Burst } from './ParticleSystem';

const DUST_COLOR: Partial<Record<SurfaceKind, number>> = {
  dirt: 0x5e4e3a,
  wood: 0x9a8a6a,
  metal: 0x8a8a8a,
  concrete: 0x7a7670,
  rubber: 0x444444,
  grate: 0x777777,
  stone: 0xa89888,
  snow: 0xffffff,
};

export class Emitters {
  readonly group = new THREE.Group();
  readonly dust: ParticleSystem;
  readonly smoke: ParticleSystem;
  readonly sparks: ParticleSystem;
  readonly flame: ParticleSystem;
  readonly confetti: ParticleSystem;
  readonly ambient: ParticleSystem;
  private readonly rng = new Rng(1);
  /** Multiplies every burst count (low tier = 0.5). */
  set countScale(v: number) {
    for (const s of this.systems) s.countScale = v;
  }
  private seed = 0;
  private lastExhaustT = -10;
  private lastDirtT = -10;
  private lastSparkT = -10;
  private lastAmbientT = -10;
  private pendingEvents: GameEvent[] = [];
  private jets: { x: number; y: number; z: number }[][] = [];
  private finishX = 0;
  private finishY = 0;
  private biome: Biome | null = null;
  private readonly burst: Burst = {
    x: 0, y: 0, z: 0, count: 0, life: [0.5, 1], size: [0.2, 0.6], vx: 0, vy: 0, vz: 0, spread: 0.5, jitter: 0.05, color: 0xffffff,
  };
  /** Surface the systems tint from when contacts are unknown. */
  private lastSurface: SurfaceKind = 'dirt';

  constructor() {
    const soft = puffTexture('soft');
    const spark = puffTexture('spark');
    const flake = puffTexture('flake');
    this.dust = new ParticleSystem(2048, soft, { gravity: -0.6, drag: 2.2, fadeIn: 0.08, opacity: 0.26 });
    this.smoke = new ParticleSystem(512, soft, { gravity: 0.4, drag: 1.8, fadeIn: 0.05, opacity: 0.3 });
    this.sparks = new ParticleSystem(1024, spark, { additive: true, gravity: -9.81, drag: 0.6, fadeIn: 0.0, opacity: 1 });
    this.flame = new ParticleSystem(1024, soft, { additive: true, gravity: 4.0, drag: 1.2, fadeIn: 0.05, opacity: 0.9 });
    this.confetti = new ParticleSystem(1024, flake, { gravity: -2.0, drag: 1.5, fadeIn: 0.0, opacity: 1 });
    this.ambient = new ParticleSystem(1024, soft, { gravity: -0.05, drag: 0.3, fadeIn: 0.3, opacity: 0.35, depthTest: true });
    for (const s of [this.dust, this.smoke, this.sparks, this.flame, this.confetti, this.ambient]) this.group.add(s.points);
  }

  get systems(): ParticleSystem[] {
    return [this.dust, this.smoke, this.sparks, this.flame, this.confetti, this.ambient];
  }

  setTrack(seed: number, jets: Emitters['jets'], finishX: number, finishY: number, biome: Biome): void {
    this.seed = seed >>> 0;
    this.jets = jets;
    this.finishX = finishX;
    this.finishY = finishY;
    this.biome = biome;
    this.clear();
  }

  clear(): void {
    for (const s of this.systems) s.clear();
    this.pendingEvents = [];
    this.lastExhaustT = this.lastDirtT = this.lastSparkT = this.lastAmbientT = -10;
  }

  onEvent(e: GameEvent): void {
    this.pendingEvents.push(e);
  }

  setViewport(heightPx: number, fov: number): void {
    for (const s of this.systems) s.setViewport(heightPx, fov);
  }

  private reseed(tick: number, salt: number): Rng {
    this.rng.reseed((this.seed ^ Math.imul(tick + 1, 0x9e3779b9) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0);
    return this.rng;
  }

  update(f: RenderFrame, exhaustTip: THREE.Vector3, camX: number): void {
    const t = f.tSim;
    for (const s of this.systems) s.setTime(t);
    if (f.cut) this.clear();
    const b = this.burst;
    const surf = f.contactRear ?? this.lastSurface;
    if (f.contactRear) this.lastSurface = f.contactRear;

    // Events.
    for (const e of this.pendingEvents) {
      if (e.type === 'land') this.landing(f, e.wheel, e.impulse, e.surface);
      else if (e.type === 'checkpoint') this.flames(f, e.index);
      else if (e.type === 'finish') this.finish(f);
      else if (e.type === 'fault' && (e.reason === 'crash' || e.reason === 'hazard')) this.crash(f);
    }
    this.pendingEvents = [];
    // Derived landing when no event arrived (mock physics).
    if (f.justLanded && f.landImpulse > 0.5) this.landing(f, f.landedWheel, f.landImpulse, surf);

    // Dirt kick from wheelspin (dirt / snow / stone only; sparks on metal).
    if (f.rearSlip > 1.2 && f.rear.grounded && t - this.lastDirtT > 0.03) {
      const rng = this.reseed(f.tick, 1);
      if (surf === 'metal' || surf === 'grate') {
        if (f.rearSlip > 2.5 && t - this.lastSparkT > 0.04) {
          this.lastSparkT = t;
          Object.assign(b, { x: f.rear.x - 0.2, y: f.rear.y - 0.3, z: 0.1, count: 8, life: [0.2, 0.5], size: [0.03, 0.01], vx: -f.velX * 0.5 - 3, vy: 1.5, vz: 0.5, spread: 2.5, jitter: 0.05, color: 0xffb060, gravityScale: 1 });
          this.sparks.emit(b, t, rng);
        }
      } else if (surf !== 'concrete' && surf !== 'wood' && surf !== 'rubber') {
        this.lastDirtT = t;
        const n = Math.min(10, Math.round(2 + f.rearSlip * 1.5));
        Object.assign(b, { x: f.rear.x - 0.25, y: f.rear.y - 0.28, z: 0, count: n, life: [0.35, 1.0], size: [0.1, 0.45], vx: -f.velX * 0.35 - 1.6 - f.rearSlip * 0.4, vy: 0.7, vz: 0, spread: 0.5, jitter: 0.06, color: DUST_COLOR[surf] ?? 0x9c8462, gravityScale: 1 });
        this.dust.emit(b, t, rng);
      }
    }

    // Exhaust puffs on throttle: cadence rises with throttle.
    const puffGap = f.throttleEff > 0.6 ? 0.12 : 0.3;
    if (f.throttleEff > 0.15 && t - this.lastExhaustT > puffGap) {
      this.lastExhaustT = t;
      const rng = this.reseed(f.tick, 2);
      const strength = f.throttleEff;
      Object.assign(b, { x: exhaustTip.x, y: exhaustTip.y, z: exhaustTip.z, count: Math.round(2 + strength * 3), life: [0.3, 0.55], size: [0.08, 0.2 + strength * 0.12], vx: -1.0 - f.velX * 0.2, vy: 0.25, vz: 0.15, spread: 0.35, jitter: 0.02, color: 0x5a5a5c, gravityScale: 0.15 });
      this.smoke.emit(b, t, rng);
    }

    // Ambient: motes / snow / embers around the camera.
    if (this.biome && this.biome.ambient !== 'none' && t - this.lastAmbientT > 0.1) {
      this.lastAmbientT = t;
      const rng = this.reseed(f.tick, 3);
      const kind = this.biome.ambient;
      Object.assign(b, {
        x: camX + rng.range(-14, 22), y: f.bikeY + rng.range(-1, 9), z: rng.range(-12, 4),
        count: kind === 'snow' ? 10 : 4,
        life: kind === 'snow' ? [4, 7] : [3, 6],
        size: kind === 'snow' ? [0.05, 0.05] : kind === 'embers' ? [0.04, 0.01] : [0.06, 0.06],
        vx: kind === 'snow' ? -0.4 : 0.1, vy: kind === 'snow' ? -0.6 : kind === 'embers' ? 0.5 : 0.05, vz: 0,
        spread: kind === 'snow' ? 0.25 : 0.12, jitter: 0.5,
        color: kind === 'embers' ? 0xff8a30 : 0xffffff, colorJitter: 0.3, gravityScale: kind === 'snow' ? 0.4 : kind === 'embers' ? -0.6 : 0,
      });
      if (kind === 'embers') this.sparks.emit(b, t, rng);
      else this.ambient.emit(b, t, rng);
    }
  }

  private landing(f: RenderFrame, wheel: 'rear' | 'front', impulse: number, surface: SurfaceKind): void {
    const w = wheel === 'rear' ? f.rear : f.front;
    const rng = this.reseed(f.tick, 4);
    const k = Math.min(1, impulse / 6);
    const b = this.burst;
    if (surface === 'metal' || surface === 'grate') {
      Object.assign(b, { x: w.x, y: w.y - 0.3, z: 0, count: Math.round(6 + 14 * k), life: [0.2, 0.5], size: [0.03, 0.01], vx: 0, vy: 2, vz: 0, spread: 3, jitter: 0.1, color: 0xffb060, gravityScale: 1 });
      this.sparks.emit(b, f.tSim, rng);
      return;
    }
    const life: [number, number] = surface === 'snow' ? [0.4, 0.9] : surface === 'wood' || surface === 'concrete' ? [0.3, 0.6] : [0.8, 1.6];
    const n = Math.round(8 + 32 * k) * (surface === 'wood' ? 0.4 : 1);
    Object.assign(b, { x: w.x, y: w.y - 0.32, z: 0, count: Math.round(n), life, size: [0.15, 0.3 + 0.6 * k], vx: -f.velX * 0.2, vy: 0.6 + 0.7 * k, vz: 0, spread: 1.1, jitter: 0.2, color: DUST_COLOR[surface] ?? 0x9c8462, gravityScale: 1 });
    this.dust.emit(b, f.tSim, rng);
  }

  private flames(f: RenderFrame, index: number): void {
    const jets = this.jets[index];
    if (!jets) return;
    const rng = this.reseed(f.tick, 5);
    const b = this.burst;
    for (const j of jets) {
      // Column: fast bright core, then a slower yellow bloom. Staggered births make it burn ~0.9 s.
      // Thin fast column: many small sprites launched straight up over 0.7 s.
      for (let k = 0; k < 10; k++) {
        Object.assign(b, { x: j.x, y: j.y + 0.05, z: j.z, count: 9, life: [0.28, 0.5], size: [0.16, 0.3], vx: 0, vy: 7.5, vz: 0, spread: 0.25, jitter: 0.04, color: k % 2 ? 0xffc040 : 0xff7a18, colorJitter: 0.15, gravityScale: 0.6 });
        this.flame.emit(b, f.tSim + k * 0.07, rng);
      }
      Object.assign(b, { x: j.x, y: j.y + 0.4, z: j.z, count: 10, life: [0.8, 1.4], size: [0.3, 0.9], vx: 0, vy: 2.5, vz: 0, spread: 0.4, jitter: 0.1, color: 0x2a2624, colorJitter: 0.2, gravityScale: 0.3 });
      this.smoke.emit(b, f.tSim + 0.5, rng);
    }
  }

  private finish(f: RenderFrame): void {
    const rng = this.reseed(f.tick, 6);
    const b = this.burst;
    for (const z of [-2.3, 2.3]) {
      for (const col of [0x1e5fe6, 0xffffff, 0x1e5fe6, 0xffffff]) {
        Object.assign(b, { x: this.finishX, y: this.finishY + 1, z, count: 50, life: [1.6, 2.6], size: [0.09, 0.09], vx: rng.range(-1, 1), vy: 9, vz: -z * 0.8, spread: 2.5, jitter: 0.1, color: col, colorJitter: 0.1, gravityScale: 1 });
        this.confetti.emit(b, f.tSim, rng);
      }
    }
  }

  private crash(f: RenderFrame): void {
    const rng = this.reseed(f.tick, 8);
    const b = this.burst;
    Object.assign(b, { x: f.bikeX, y: f.bikeY, z: 0, count: 30, life: [0.6, 1.4], size: [0.3, 1.2], vx: f.velX * 0.3, vy: 1.5, vz: 0, spread: 1.5, jitter: 0.3, color: 0x9c8e7a, gravityScale: 1 });
    this.dust.emit(b, f.tSim, rng);
  }
}
