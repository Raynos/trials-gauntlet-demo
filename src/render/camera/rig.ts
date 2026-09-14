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

/**
 * Track-authored modes. Round 11: every course authors `side` over almost its whole length, and
 * `side` used to mean yaw 5° / pitch 4° — so the shipped riding frame was a flat profile (the
 * round-10 recipe's 15° riding pitch never reached a real track: b1 bot-3 measured pitch 4°).
 * `side` is now the reference riding camera (20–25° down, 15–20° round): yaw 16°, pitch 21°;
 * `side-tight` the same with the tighter frame. `high34` / `low` are the deliberate exceptions.
 */
const MODE: Record<NonNullable<CameraKey['mode']>, Partial<Params> & { zoomBias?: number }> = {
  side: { yaw: 16 * DEG, pitch: 21 * DEG },
  'side-tight': { yaw: 14 * DEG, pitch: 19 * DEG, zoomBias: -0.5 },
  high34: { yaw: 30 * DEG, pitch: 48 * DEG },
  low: { yaw: 14 * DEG, pitch: -8 * DEG },
};

/**
 * Inner band the rig aims for when it has to slide / tilt to keep the bike in frame. The harness
 * gate asserts the bike centre inside [0.2, 0.8] (`harness/capture.ts CAMERA_BOX`); round 10 tilted
 * the bike onto the 0.2 edge exactly, and float jitter put 37 b3 frames at 0.1999 → FAIL. Aim 0.04
 * inside the gate box so a pass has margin.
 */
const BAND_LO = 0.24;
const BAND_HI = 0.76;

/** World box the camera may occupy (set per track by the renderer; hard clamp every frame). */
export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private keys: CameraKey[] = [];
  /**
   * Round 8 (user's b3 frame: the apex pull-back put the camera above the hall roof, frame
   * full of skylight backs). After all smoothing the camera POSITION is clamped to `bounds`
   * (floor + 1.5 … roof − 1, inside the hall in z/x; exteriors get a sky ceiling). When the
   * clamp binds the framing widens instead: FOV up to +12°, then the pitch tilts so the bike
   * stays inside the inner [0.24, 0.76] band (gate box [0.2, 0.8]). `clamped` / `posZ` are reported by `debug()`.
   */
  bounds: CameraBounds | null = null;
  private clamped = false;
  private fovBoost = 0;
  private readonly bikeView = new THREE.Vector3();
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
  private zoom: 0 | 1 | 2 = 0;
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
  /** Ground height sampler (profile) for the airborne framing; set by the renderer per track. */
  ground: ((x: number) => number) | null = null;
  /** Finish line x (set per track): the finish hold frames the gate and the coasting bike together. */
  finishX = 0;

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
    // Discrete zoom states with hysteresis: the pull-back is one eased move that
    // arrives, not a continuous drift with speed.
    // Riding holds ≈0.26 up to 10 m/s; the pull-back to 0.14 ramps 10 → 18 m/s
    // (round 4: at 1.85 s the bot is already past 11 m/s, and the old 11 m/s
    // step made every riding frame a wide frame).
    if (cut) this.zoom = speed < 1.5 ? 0 : speed > 14 ? 2 : 1;
    else if (this.zoom === 0 && speed > 2.2) this.zoom = 1;
    else if (this.zoom === 1 && speed < 1.0) this.zoom = 0;
    else if (this.zoom === 1 && speed > 14) this.zoom = 2;
    else if (this.zoom === 2 && speed < 11) this.zoom = 1;
    const airWide = f.airborne && f.airTime > 0.25 ? 1 : 0;
    const zoomT = this.zoom >= 1 ? 1 : 0;
    const fastT = this.zoom === 0 ? 0 : smoothstep(10, 18, speed);
    const airT = smoothstep(0, 0.7, f.airTime);
    const wideT = Math.max(fastT, airWide * 0.7);
    const moving = Math.abs(f.velX) > 0.5 ? Math.sign(f.velX) : 1;
    const p: Params = {
      // Round 11: the pull-back floor rises 0.14 → 0.16 (a 16 m/s bot frame read the bike at
      // 13 % of frame height against the reference's ≈ 20 % at speed).
      heightFrac: lerp(lerp(0.4, 0.26, zoomT), 0.16, wideT),
      // Round 11: 0.30/0.28 put the bike itself (followed point minus the lookahead) on the 0.20
      // edge of the gate box in every fast frame (b1 bot-3 at 16.6 m/s: bx 0.20). 0.34 → 0.36.
      screenX: moving > 0 ? lerp(0.45, 0.34, zoomT) + 0.02 * wideT : lerp(0.55, 0.66, zoomT),
      screenY: lerp(0.55, 0.56, zoomT) - 0.03 * airT,
      // Idle is a 3/4 view (reference start frames sit ≈20° round and ≈10° down), so depth reads before GO.
      // Round 10: the riding pitch goes 11° → 15° and the yaw 15° → 18° (reference riding
      // frames sit 20–25° down / 15–25° round): the top of the deck, the far ledge clutter and
      // the container roofs enter the frame and the window wall drops out of the upper third.
      yaw: moving * lerp(lerp(20, 18, zoomT), 19, wideT) * DEG,
      pitch: lerp(lerp(11, 18, zoomT), 22, fastT) * DEG, // round 11: riding 18° (was 15°) — the reference sits 20–25° down and the `side` key now carries 21° // round 7: never tilt up in the air — pull back instead; round 10: the pull-back looks DOWN (21°) so the wide frame shows the deck and the hall floor, not a band of window wall
      roll: 0,
      fov: lerp(28, 34, zoomT) * DEG,
    };
    if (this.phase === 'countdown' || this.phase === 'menu') {
      p.heightFrac = 0.4;
      p.screenX = 0.45;
      p.yaw = 20 * DEG;
      p.pitch = 11 * DEG;
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
      // Creep in from the crash tick (reference: the camera decelerates and closes during the second before respawn).
      this.crashDist *= 1 - 0.04 * dt;
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
      // Finish hold (round 9; user frame: smear after the line, camera still chasing). The game
      // cuts throttle and auto-brakes, so the bike coasts to a stop on the run-out: ease out of
      // the forward follow over 1.5 s onto the midpoint between the gate and the bike, widen so
      // both stay in frame (confetti + fireworks burst at the gate posts), and dolly slowly for
      // 3 s (yaw 15° → 28°, pitch 11° → 7°, a gentle pull-back), then hold. A crash past the
      // line freezes physics at the tick before (`f.crashed` stays false), so the same hold runs.
      if (this.finishT < 0 || cut) this.finishT = t;
      const since = t - this.finishT;
      const ease = smoothstep(0, 1.5, since);
      const dolly = smoothstep(0, 3.0, since);
      this.fx.halfLife = lerp(0.12, 1.0, ease);
      this.fy.halfLife = 0.18; // the run-out often slopes: keep the vertical follow snappy so the bike does not sink to the frame edge
      const gateX = this.finishX;
      const midX = lerp(f.bikeX, (f.bikeX + gateX) / 2, ease);
      followTarget = { x: midX, y: f.bikeY };
      // Width the frame needs for gate + bike + a margin, as a height fraction at this fov.
      const need = Math.abs(f.bikeX - gateX) + 6;
      const visibleH = need / this.aspect;
      const hfFit = RIDER_HEIGHT / visibleH;
      const hfHold = lerp(0.24, 0.17, dolly);
      p.heightFrac = lerp(p.heightFrac, Math.max(0.13, Math.min(hfHold, hfFit)), ease);
      p.screenX = lerp(p.screenX, 0.5, ease);
      p.screenY = lerp(p.screenY, 0.58, ease);
      p.yaw = lerp(p.yaw, moving * lerp(15, 28, dolly) * DEG, ease);
      p.pitch = lerp(p.pitch, lerp(11, 7, dolly) * DEG, ease);
      p.fov = lerp(p.fov, 34 * DEG, ease);
      this.state = 'finish';
    } else {
      this.finishT = -1;
    }
    if (!f.crashed && !f.finished) {
      this.state = this.phase === 'countdown' ? 'countdown' : this.zoom === 2 || airWide ? 'fast' : this.zoom === 1 ? 'riding' : 'idle';
    }

    // --- Followed point: lookahead in x, dead-zone in y.
    // Lookahead: ≤ 2.5 m and ≤ 8 % of the visible width at the target frame (round 11: in the
    // wide frame 2.5 m was 12 % of the width and pushed the bike onto the box edge).
    const lookCap = Math.min(2.5, 0.08 * (RIDER_HEIGHT / Math.max(0.03, p.heightFrac)) * this.aspect);
    const lookTarget = f.finished ? 0 : Math.min(lookCap, Math.max(-1.5, f.velX * 0.15));
    const fxT = followTarget.x;
    // In the air (round 5, critic: "ground leaves the frame"): aim between the bike and the
    // landing zone and pull back with height, so the ground line stays in the bottom third.
    let fyT = followTarget.y + 0.45 - 0.3 * airT;
    if (f.airborne && !f.crashed && this.ground) {
      // Round 7 (b3 kicker: the bike left the frame for 2.5 s of a 3.4 s flight): the pull-back
      // follows the height immediately (0.2 s ramp, not 0.7), the floor drops to 0.3 so a 15 m
      // apex still fits, and the aim point sits halfway to the landing zone.
      const airQ = smoothstep(0, 0.2, f.airTime);
      const gy = this.ground(f.bikeX + Math.max(0, f.velX) * 0.6);
      const above = Math.max(0, f.bikeY - 0.55 - gy);
      fyT -= 0.5 * above * airQ;
      p.heightFrac *= Math.max(0.3, 1.9 / (1.9 + 1.1 * above * airQ));
    }
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
      const dead = f.airborne || f.crashed || f.finished ? 0 : 0.6;
      // Airborne: the y follow and the pull-back tighten (a 0.35 s half-life lags an 8 m/s launch by 3 m).
      const airDt = f.airborne && !f.crashed ? dt * 2.5 : dt;
      if (Math.abs(dy) > dead) this.fy.follow(fyT - Math.sign(dy) * dead, airDt);
      this.look.follow(lookTarget, dt);
      this.heightFrac.follow(p.heightFrac, airDt);
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
    let halfH = dist * Math.tan(fov / 2);
    let halfW = halfH * this.aspect;
    // Hard constraint (round 7): the bike centre stays inside the central 70 % box on every
    // frame. Estimate where it lands from the smoothed aim offset and, if it would leave
    // [0.2, 0.8], move the followed point (and pull back) so it does not. Roll is 0, so world
    // x maps to screen right by cos(yaw) and world y to screen up by cos(pitch).
    if (!cut && this.primed) {
      const bcx = f.bikeX;
      const bcy = f.bikeY + 0.45;
      let du = ((bcx - bx) * Math.cos(yaw)) / (2 * halfW);
      let dv = ((bcy - by) * Math.cos(pitch)) / (2 * halfH);
      let su = this.screenX.x + du;
      let sv = this.screenY.x - dv;
      // First widen: a bike more than 0.3 off the aim point wants a wider frame, not a slide.
      const over = Math.max(Math.abs(su - 0.5), Math.abs(sv - 0.5)) - 0.3;
      if (over > 0) {
        const k = Math.min(2.5, 1 + over * 4);
        this.heightFrac.snap(Math.max(0.03, hf / k));
        halfH *= k;
        halfW *= k;
        du /= k;
        dv /= k;
        su = this.screenX.x + du;
        sv = this.screenY.x - dv;
      }
      if (sv < BAND_LO) this.fy.snap(this.fy.x + ((BAND_LO - sv) * 2 * halfH) / Math.cos(pitch));
      else if (sv > BAND_HI) this.fy.snap(this.fy.x - ((sv - BAND_HI) * 2 * halfH) / Math.cos(pitch));
      if (su < BAND_LO) this.fx.snap(this.fx.x - ((BAND_LO - su) * 2 * halfW) / Math.cos(yaw));
      else if (su > BAND_HI) this.fx.snap(this.fx.x + ((su - BAND_HI) * 2 * halfW) / Math.cos(yaw));
    }
    const bx2 = this.fx.x + this.look.x;
    const by2 = this.fy.x + shakeY;
    const dist2 = halfH / Math.tan(fov / 2);
    this.dist = dist2;
    const ox = (2 * this.screenX.x - 1) * halfW;
    const oy = (1 - 2 * this.screenY.x) * halfH;
    this.aim.set(bx2, by2, 0).addScaledVector(this.right, -ox).addScaledVector(this.up, -oy);
    this.camera.position.copy(this.aim).addScaledVector(this.dir, -dist2);
    this.camera.quaternion.copy(this.q);
    let fovOut = fov;
    this.clamped = false;
    const B = this.bounds;
    if (B) {
      const cp = this.camera.position;
      const cx = Math.min(B.maxX, Math.max(B.minX, cp.x));
      const cy = Math.min(B.maxY, Math.max(B.minY, cp.y));
      const cz = Math.min(B.maxZ, Math.max(B.minZ, cp.z));
      if (cx !== cp.x || cy !== cp.y || cz !== cp.z) {
        this.clamped = true;
        cp.set(cx, cy, cz);
        // Reframe from the clamped position: where does the bike centre land now?
        // (Round 9 fix: the depth was negated — `-v·dir` — so this block never ran and a
        // z-clamped camera on b3's kicker let the bike leave the top of the frame.)
        const v = this.bikeView.set(f.bikeX - cx, f.bikeY + 0.45 - cy, -cz);
        const zv = v.dot(this.dir);
        const yv = v.dot(this.up);
        const xv = v.dot(this.right);
        if (zv > 0.5) {
          const th = Math.tan(fov / 2);
          let sv = 0.5 - yv / zv / (2 * th);
          const su = 0.5 + xv / zv / (2 * th * this.aspect);
          // (a) widen: the FOV grows (≤ +12°) until the bike is back inside the 0.2–0.8 band.
          // Band half-width 0.26 (BAND_HI − 0.5): the FOV grows until the bike is 0.04 inside the gate box.
          const bw = BAND_HI - 0.5;
          const need = Math.max(Math.abs(yv / zv) / (2 * bw), Math.abs(xv / zv) / (2 * bw * this.aspect));
          if (need > th || sv < BAND_LO || sv > BAND_HI || su < BAND_LO || su > BAND_HI) {
            const fovNeed = 2 * Math.atan(need * 1.02);
            fovOut = Math.min(fov + 12 * DEG, Math.max(fov, fovNeed));
            const th2 = Math.tan(fovOut / 2);
            sv = 0.5 - yv / zv / (2 * th2);
            // (b) still out: tilt the pitch so the bike sits on the inner band edge (not the gate edge).
            if (sv < BAND_LO || sv > BAND_HI) {
              const a = Math.atan2(yv, zv); // angle of the bike above the view axis
              const edge = Math.atan(2 * bw * th2) * (sv < BAND_LO ? 1 : -1);
              const dp = a - edge; // rotate the view up by dp (pitch is positive looking down)
              this.e.set(-(pitch - dp), yaw, roll, 'YXZ');
              this.q.setFromEuler(this.e);
              this.dir.set(0, 0, -1).applyQuaternion(this.q);
              this.right.set(1, 0, 0).applyQuaternion(this.q);
              this.up.set(0, 1, 0).applyQuaternion(this.q);
              this.camera.quaternion.copy(this.q);
            }
          }
        }
      }
    }
    this.fovBoost = fovOut - fov;
    if (Math.abs(this.camera.fov - fovOut / DEG) > 1e-3) {
      this.camera.fov = fovOut / DEG;
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
    const out: CameraDebug & { roll: number; yaw: number; pitch: number; state: string; clamped: boolean; posZ: number; fovBoostDeg: number } = {
      pos: { x: cam.position.x, y: cam.position.y },
      clamped: this.clamped,
      posZ: cam.position.z,
      fovBoostDeg: this.fovBoost / DEG,
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
