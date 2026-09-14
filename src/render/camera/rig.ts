/**
 * Camera rig (techniques.md obs 1–6, rising obs 1–4): three speed-driven zoom
 * states (idle ≈40 % frame height, riding ≈24 %, fast/air ≈9 %), bike at
 * x≈30 % / y≈55 % when moving, yaw toward travel + pitch down in the riding
 * state flattening when tight, velocity lookahead, landing shake, crash
 * stop-follow then creep, finish freeze, restart hard cut. Track-authored
 * `CameraKey`s override / bias the state table. Everything is clocked from
 * simulated time, so the rig is a pure function of the state history.
 */
import * as THREE from 'three';
import type { CameraDebug, CameraKey, GamePhase } from '../../core/types';
import type { RenderFrame } from '../frame';

const DEG = Math.PI / 180;
const RIDER_HEIGHT = 1.9;

class Smooth {
  x = 0;
  constructor(public halfLife: number) {}
  follow(target: number, dt: number): number {
    if (dt <= 0) return this.x;
    this.x += (target - this.x) * (1 - Math.pow(0.5, dt / this.halfLife));
    return this.x;
  }
  snap(v: number): void {
    this.x = v;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Params {
  heightFrac: number;
  screenX: number;
  screenY: number;
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
}

const MODE: Record<NonNullable<CameraKey['mode']>, Partial<Params> & { zoomBias?: number }> = {
  side: { yaw: 5 * DEG, pitch: 4 * DEG },
  'side-tight': { yaw: 4 * DEG, pitch: 2 * DEG, zoomBias: -0.5 },
  high34: { yaw: 30 * DEG, pitch: 48 * DEG },
  low: { yaw: 14 * DEG, pitch: -8 * DEG },
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private keys: CameraKey[] = [];
  private readonly keyWeights: Smooth[] = [];
  // Followed bike point.
  private readonly fx = new Smooth(0.12);
  private readonly fy = new Smooth(0.18);
  private readonly look = new Smooth(0.25);
  private readonly heightFrac = new Smooth(0.35);
  private readonly screenX = new Smooth(0.5);
  private readonly screenY = new Smooth(0.5);
  private readonly yaw = new Smooth(0.45);
  private readonly pitch = new Smooth(0.45);
  private readonly roll = new Smooth(0.6);
  private readonly fov = new Smooth(0.3);
  private crashT = -1;
  private crashDist = 1;
  private finishT = -1;
  private shakeT = -1;
  private shakeAmp = 0;
  private phase: GamePhase = 'riding';
  private aspect = 16 / 9;
  private state: 'idle' | 'riding' | 'fast' | 'crash' | 'finish' | 'countdown' = 'idle';
  // Scratch
  private readonly aim = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly proj = new THREE.Vector3();
  private lastBikeX = 0;
  private lastBikeY = 0;
  private dist = 10;
  private primed = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.2, 900);
  }

  setKeys(keys: CameraKey[] | undefined): void {
    this.keys = keys ?? [];
    this.keyWeights.length = 0;
    for (const k of this.keys) this.keyWeights.push(new Smooth(Math.max(0.05, (k.blend ?? 0.7) / 3)));
    this.primed = false;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setPhase(p: GamePhase): void {
    this.phase = p;
  }

  get zoomState(): string {
    return this.state;
  }

  /** Distance from camera to the aim plane (for shadow frustum sizing). */
  get distance(): number {
    return this.dist;
  }

  update(f: RenderFrame): void {
    const dt = f.dt;
    const cut = f.cut || !this.primed;
    const t = f.tSim;

    // --- Targets from the state table.
    const speed = f.speed;
    const zoomT = smoothstep(1.5, 9, speed);
    const fastT = smoothstep(9, 15, speed);
    const airT = smoothstep(0, 0.7, f.airTime);
    const wideT = Math.max(fastT, airT);
    const moving = Math.abs(f.velX) > 0.5 ? Math.sign(f.velX) : 1;
    const p: Params = {
      heightFrac: lerp(lerp(0.4, 0.24, zoomT), 0.09, wideT),
      screenX: moving > 0 ? lerp(0.45, 0.3, zoomT) - 0.02 * wideT : lerp(0.55, 0.7, zoomT),
      screenY: lerp(0.55, 0.53, zoomT) - 0.03 * airT,
      yaw: moving * lerp(lerp(5, 15, zoomT), 18, wideT) * DEG,
      pitch: lerp(lerp(3, 17, zoomT), 24, fastT) * DEG + 6 * DEG * airT,
      roll: 0,
      fov: lerp(28, 34, zoomT) * DEG,
    };
    if (this.phase === 'countdown' || this.phase === 'menu') {
      p.heightFrac = 0.4;
      p.screenX = 0.45;
      p.yaw = 6 * DEG;
      p.pitch = 4 * DEG;
      p.fov = 28 * DEG;
    }

    // --- Track-authored keys.
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i]!;
      const w = this.keyWeights[i]!;
      const inside = f.bikeX >= k.x0 && f.bikeX <= k.x1 ? 1 : 0;
      const wt = k.cut || cut ? (w.snap(inside), inside) : w.follow(inside, dt);
      if (wt < 0.001) continue;
      const mode = k.mode ? MODE[k.mode] : {};
      const yaw = k.yaw ?? mode.yaw;
      const pitch = k.pitch ?? mode.pitch;
      const roll = k.roll ?? mode.roll ?? 0;
      const bias = k.zoomBias ?? mode.zoomBias ?? 0;
      if (yaw !== undefined) p.yaw = lerp(p.yaw, yaw, wt);
      if (pitch !== undefined) p.pitch = lerp(p.pitch, pitch, wt);
      p.roll = lerp(p.roll, roll, wt);
      if (bias !== 0) p.heightFrac = lerp(p.heightFrac, p.heightFrac * (1 - 0.6 * bias), wt);
      if (k.dist !== undefined) {
        // Convert an explicit distance into a height fraction at the current fov.
        const hf = RIDER_HEIGHT / (2 * k.dist * Math.tan(p.fov / 2));
        p.heightFrac = lerp(p.heightFrac, hf, wt);
      }
    }

    // --- Crash / finish beats.
    let followTarget = { x: f.bikeX, y: f.bikeY };
    if (f.crashed) {
      if (this.crashT < 0 || cut) {
        this.crashT = t;
        this.crashDist = 1;
      }
      const since = t - this.crashT;
      // Ragdoll pelvis if present.
      const pelvis = f.ragdoll?.find((b) => b.id === 'pelvis') ?? f.ragdoll?.[0];
      if (pelvis) followTarget = { x: pelvis.pos.x, y: pelvis.pos.y };
      this.fx.halfLife = lerp(0.12, 1.0, Math.min(1, since));
      this.fy.halfLife = lerp(0.18, 1.0, Math.min(1, since));
      if (since > 1) this.crashDist *= 1 - 0.025 * dt;
      p.heightFrac = 0.24 / this.crashDist;
      p.pitch = 14 * DEG;
      p.yaw = 12 * DEG;
      p.screenX = 0.45;
      this.state = 'crash';
    } else {
      this.crashT = -1;
      this.fx.halfLife = 0.12;
      this.fy.halfLife = 0.18;
    }
    if (f.finished) {
      if (this.finishT < 0 || cut) this.finishT = t;
      const since = t - this.finishT;
      this.fx.halfLife = lerp(0.12, 1.5, Math.min(1, since));
      p.pitch -= 15 * DEG * Math.min(1, since);
      p.heightFrac = Math.max(p.heightFrac, 0.2);
      this.state = 'finish';
    } else {
      this.finishT = -1;
    }
    if (!f.crashed && !f.finished) {
      this.state = this.phase === 'countdown' ? 'countdown' : wideT > 0.5 ? 'fast' : zoomT > 0.5 ? 'riding' : 'idle';
    }

    // --- Followed point: lookahead in x, dead-zone in y.
    const lookTarget = Math.min(2.5, Math.max(-1.5, f.velX * 0.15));
    const fxT = followTarget.x;
    const fyT = followTarget.y + 0.45 - 0.3 * airT;
    if (cut) {
      this.fx.snap(fxT);
      this.fy.snap(fyT);
      this.look.snap(lookTarget);
      this.heightFrac.snap(p.heightFrac);
      this.screenX.snap(p.screenX);
      this.screenY.snap(p.screenY);
      this.yaw.snap(p.yaw);
      this.pitch.snap(p.pitch);
      this.roll.snap(p.roll);
      this.fov.snap(p.fov);
      this.shakeT = -1;
      this.primed = true;
    } else {
      this.fx.follow(fxT, dt);
      const dy = fyT - this.fy.x;
      const dead = f.airborne || f.crashed ? 0 : 0.6;
      if (Math.abs(dy) > dead) this.fy.follow(fyT - Math.sign(dy) * dead, dt);
      this.look.follow(lookTarget, dt);
      this.heightFrac.follow(p.heightFrac, dt);
      this.screenX.follow(p.screenX, dt);
      this.screenY.follow(p.screenY, dt);
      this.yaw.follow(p.yaw, dt);
      this.pitch.follow(p.pitch, dt);
      this.roll.follow(p.roll, dt);
      this.fov.follow(p.fov, dt);
    }

    // --- Landing shake.
    if (f.justLanded && !cut) {
      this.shakeT = t;
      this.shakeAmp = Math.min(0.12, Math.max(0, f.landImpulse * 0.02));
    }
    let shakeY = 0;
    let shakeRoll = 0;
    if (this.shakeT >= 0) {
      const st = t - this.shakeT;
      if (st < 0.8) {
        const env = Math.exp(-st / 0.18) * Math.sin(2 * Math.PI * 9 * st);
        shakeY = this.shakeAmp * env;
        shakeRoll = 0; // Trials never rolls the camera (only a CameraKey.roll may)
      } else this.shakeT = -1;
    }

    // --- Compose the camera.
    const fov = this.fov.x;
    const hf = Math.max(0.03, this.heightFrac.x);
    const visibleH = RIDER_HEIGHT / hf;
    const dist = visibleH / 2 / Math.tan(fov / 2);
    this.dist = dist;
    const yaw = this.yaw.x;
    const pitch = this.pitch.x;
    const roll = this.roll.x + shakeRoll;
    this.e.set(-pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.dir.set(0, 0, -1).applyQuaternion(this.q);
    this.right.set(1, 0, 0).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    // Bike point we want on screen at (screenX, screenY).
    const bx = this.fx.x + this.look.x;
    const by = this.fy.x + shakeY;
    const halfH = dist * Math.tan(fov / 2);
    const halfW = halfH * this.aspect;
    const ox = (2 * this.screenX.x - 1) * halfW;
    const oy = (1 - 2 * this.screenY.x) * halfH;
    this.aim.set(bx, by, 0).addScaledVector(this.right, -ox).addScaledVector(this.up, -oy);
    this.camera.position.copy(this.aim).addScaledVector(this.dir, -dist);
    this.camera.quaternion.copy(this.q);
    if (Math.abs(this.camera.fov - fov / DEG) > 1e-3) {
      this.camera.fov = fov / DEG;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
    this.lastBikeX = f.bikeX;
    this.lastBikeY = f.bikeY;
  }

  /** Where the camera is looking in world XY (for shadows / ambient). */
  get targetX(): number {
    return this.fx.x + this.look.x;
  }
  get targetY(): number {
    return this.fy.x;
  }

  debug(): CameraDebug {
    const cam = this.camera;
    this.proj.set(this.lastBikeX, this.lastBikeY + 0.45, 0).project(cam);
    const sx = (this.proj.x + 1) / 2;
    const sy = (1 - this.proj.y) / 2;
    this.proj.set(this.lastBikeX, this.lastBikeY - 0.55, 0).project(cam);
    const bottom = this.proj.y;
    this.proj.set(this.lastBikeX, this.lastBikeY - 0.55 + RIDER_HEIGHT, 0).project(cam);
    const heightFrac = Math.abs(this.proj.y - bottom) / 2;
    // True roll: angle of the camera's right vector against the world horizontal plane.
    this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const roll = Math.atan2(this.right.y, Math.hypot(this.right.x, this.right.z));
    const out: CameraDebug & { roll: number; yaw: number; pitch: number; state: string } = {
      pos: { x: cam.position.x, y: cam.position.y },
      dist: this.dist,
      bikeScreenX: sx,
      bikeScreenY: sy,
      bikeHeightFrac: heightFrac,
      roll,
      yaw: this.yaw.x,
      pitch: this.pitch.x,
      state: this.state,
    };
    return out;
  }
}
