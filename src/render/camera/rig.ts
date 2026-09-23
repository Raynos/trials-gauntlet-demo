/**
 * Camera rig (reference notes: techniques obs 1–6, visuals obs 1–4): three speed-driven zoom
 * states (idle ≈40 % frame height, riding ≈24 %, fast/air ≈9 %), bike at
 * x≈30 % / y≈55 % when moving, yaw toward travel + pitch down in the riding
 * state flattening when tight, velocity lookahead, landing shake, crash
 * stop-follow then creep, finish freeze, restart hard cut. Track-authored
 * `CameraKey`s override / bias the state table. Everything is clocked from
 * simulated time, so the rig is a pure function of the state history.
 */
import * as THREE from 'three';
import type { CameraDebug, CameraKey, CameraOverride, GamePhase } from '../../core/types';
import type { RenderFrame } from '../frame';

const DEG = Math.PI / 180;
const RIDER_HEIGHT = 1.9;
/** Garage orbit (`CameraOverride.mode === 'orbit'`): defaults and clamps — the screen owns the gesture, the rig owns the limits. */
export const ORBIT = {
  yaw: 0.42,
  pitch: 0.14,
  dist: 6.0,
  pitchMin: -0.06,
  pitchMax: 0.55,
  distMin: 3.0,
  distMax: 8.0,
  fov: 30 * (Math.PI / 180),
} as const;

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

/**
 * Critically-damped second-order follower (round 15, lead): no overshoot, and unlike the
 * exponential `Smooth` its velocity is continuous, so the bike does not jerk in the frame when the
 * lead target steps (throttle on / off, a landing).
 */
class Spring {
  x = 0;
  v = 0;
  constructor(public omega: number) {}
  follow(target: number, dt: number): number {
    if (dt <= 0) return this.x;
    // Semi-implicit Euler on x'' = ω²(t − x) − 2ωx', sub-stepped so a 1/20 s harness frame is stable.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.omega * this.omega * (target - this.x) - 2 * this.omega * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  snap(v: number): void {
    this.x = v;
    this.v = 0;
  }
}

/**
 * Round 15 motion table — the camera owes the bike something (docs/design/rendering.md §11j). Every
 * state-driven beat is a named constant here; the speed / air / key table stays in `update()`.
 */
export const MOTION = {
  /** (a) Lead: look-ahead = LEAD.gainS × velX (m), capped at LEAD.capFrac of the visible width at the target frame (LEAD.capM hard cap); followed by a critically-damped spring at LEAD.omega rad/s (settles in ≈ 4/ω = 0.6 s). Airborne the cap grows by LEAD.airGain (the landing zone enters by look-ahead, not distance — round 14). */
  LEAD: { gainS: 0.22, capFrac: 0.12, capM: 3.0, omega: 6.5, airGain: 1.0 },
  /** (b) Landing tighten: on touchdown after ≥ minAir s of air the distance closes by `dist` (×0.85) over `inS`, holds, and opens back over `outS`; the bike rises `screenY` in the frame (the camera drops). Scaled by min(1, air / fullAir). */
  LAND: { minAir: 0.4, fullAir: 1.0, dist: 0.15, inS: 0.3, outS: 0.6, screenY: 0.03 },
  /** (c) Apex hold: airborne the aim rises with the bike (y dead-zone 0, follow ×2.5 faster), the distance grows at most ×distCap (the user's rule: a smaller range of zoom-out) and pitch / roll are untouched — the horizon does not tilt unless the hall roof clamps the camera (last resort, b3 apex). */
  AIR: { distCap: 1.2, followMul: 2.5, riseFrac: 0.5 },
  /** Facing hysteresis: yaw / screenX mirror only after the bike has moved backwards faster than `speed` m/s for `holdS` s (was an instant flip at −0.5 m/s: a 36° yaw swing in 0.3 s on every stall / roll-back). */
  FACING: { speed: 1.2, holdS: 0.3 },
  /** (d) Foreground occluders (camera/occluders.ts): props whose bounding sphere crosses the camera → rider segment fade out over `frames` frames (dithered discard, no transparency queue) and back in over the same; queried against z > `minZ` instances only. */
  OCCLUDE: { frames: 4, minZ: 1.0, radiusPad: 1.0 },
} as const;

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
  private readonly look = new Spring(MOTION.LEAD.omega);
  /** Round 15: facing with hysteresis (see MOTION.FACING). */
  private facing: 1 | -1 = 1;
  private facingT = -1;
  /** Round 15 (b): landing tighten clock / weight. */
  private landT = -1;
  private landW = 0;
  private lastAirTime = 0;
  /** Round 15 (2): replay / reviewer override; the rig keeps integrating underneath so `null` restores it exactly. */
  private override: CameraOverride | null = null;
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

  /** Biome framing scales (`Biome.camPitchScale` / `camYawScale`), set by the renderer per track. */
  pitchScale = 1;
  yawScale = 1;

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

  /**
   * Round 15: replay / reviewer camera override (`GameRenderer.setCameraOverride`). `free` holds the aim
   * at world (x, y) `dist` m back along the rig's current view direction; `fixed` pins the camera position;
   * `follow-wide` widens ×1/0.76. `null` = the game camera — the rig integrates underneath every mode,
   * so restoring is exact (no cut, no re-settle).
   */
  setOverride(o: CameraOverride | null): void {
    this.override = o;
  }

  get overrideMode(): string | null {
    return this.override?.mode ?? null;
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
    // Round 14: the air no longer widens the state (was `max(fastT, airWide * 0.7)`): on the b3
    // flights the rig pulled back until the bike was 4 % of the frame; the reference barely changes
    // distance in the air and lets the bike rise. Air handling is the aim + a ≤ 20 % pull-back below.
    const wideT = fastT;
    // Round 15: facing flips only after a sustained roll-back (MOTION.FACING), and snaps on a cut.
    if (cut) {
      this.facing = f.velX < -MOTION.FACING.speed ? -1 : 1;
      this.facingT = -1;
    } else if (Math.sign(f.velX) === -this.facing && Math.abs(f.velX) > MOTION.FACING.speed) {
      if (this.facingT < 0) this.facingT = t;
      else if (t - this.facingT >= MOTION.FACING.holdS) {
        this.facing = this.facing === 1 ? -1 : 1;
        this.facingT = -1;
      }
    } else this.facingT = -1;
    const moving = this.facing;
    const p: Params = {
      // Round 11: the pull-back floor rises 0.14 → 0.16 (a 16 m/s bot frame read the bike at
      // 13 % of frame height against the reference's ≈ 20 % at speed).
      // Round 15: the pull-back floor 0.16 → 0.18 (the reference sits ≈ 0.20 at speed; r4 critic: "distant, non-committal", "filmed from so far away").
      heightFrac: lerp(lerp(0.4, 0.26, zoomT), 0.18, wideT),
      // Round 11: 0.30/0.28 put the bike itself (followed point minus the lookahead) on the 0.20
      // edge of the gate box in every fast frame (b1 bot-3 at 16.6 m/s: bx 0.20). 0.34 → 0.36.
      // Round 15: the static offset eases (0.34 → 0.40 riding); the speed-proportional lead spring
      // (MOTION.LEAD) carries the bike back of centre at speed and lets it sit centred at rest.
      screenX: moving > 0 ? lerp(0.45, 0.4, zoomT) + 0.02 * wideT : lerp(0.55, 0.6, zoomT),
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

    // --- Store release (D20): the ROCKHOP zones are framed near side-on (B-ride / C-ride / Q2 hold the horizon
    // in the upper third), so the biome scales the riding pitch and yaw after the keys (`Biome.camPitchScale`).
    p.pitch *= this.pitchScale;
    p.yaw *= this.yawScale;

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
    // Round 15 (a): lead = LEAD.gainS × velX, capped at LEAD.capFrac of the visible width (LEAD.capM);
    // airborne the cap grows by LEAD.airGain (round 14: the landing zone enters by look-ahead).
    const L = MOTION.LEAD;
    const lookCap = Math.min(L.capM, L.capFrac * (RIDER_HEIGHT / Math.max(0.03, p.heightFrac)) * this.aspect);
    const airLook = f.airborne && !f.crashed ? smoothstep(0, 0.3, f.airTime) : 0;
    const lookTarget = f.finished ? 0 : Math.min(lookCap * (1 + L.airGain * airLook), Math.max(-lookCap, f.velX * L.gainS * (1 + L.airGain * airLook)));
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
      fyT -= MOTION.AIR.riseFrac * above * airQ;
      // Round 14: distance grows ≤ 20 % in the air (was ≤ 3.3×); the bike climbs toward the top of
      // the [0.2, 0.8] box and the box clamp slides the aim up after it instead of widening.
      p.heightFrac *= Math.max(1 / MOTION.AIR.distCap, 1.9 / (1.9 + 1.1 * above * airQ));
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
      const airDt = f.airborne && !f.crashed ? dt * MOTION.AIR.followMul : dt;
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

    // --- Landing shake + round 15 (b) landing tighten (MOTION.LAND): armed by the air time of the
    // flight that just ended (`f.airTime` is already 0 on the touchdown frame).
    if (f.justLanded && !cut) {
      this.shakeT = t;
      this.shakeAmp = Math.min(0.12, Math.max(0, f.landImpulse * 0.02));
      if (this.lastAirTime >= MOTION.LAND.minAir && !f.crashed && !f.finished) {
        this.landT = t;
        this.landW = Math.min(1, this.lastAirTime / MOTION.LAND.fullAir);
      }
    }
    if (cut) this.landT = -1;
    this.lastAirTime = f.airborne ? f.airTime : 0;
    let landEnv = 0;
    if (this.landT >= 0) {
      const lt = t - this.landT;
      const LD = MOTION.LAND;
      if (lt < LD.inS + LD.outS) landEnv = this.landW * (lt < LD.inS ? smoothstep(0, LD.inS, lt) : 1 - smoothstep(LD.inS, LD.inS + LD.outS, lt));
      else this.landT = -1;
      if (f.airborne && f.airTime > 0.15) this.landT = -1; // the next flight cancels the settle
    }
    const landTight = 1 / (1 - MOTION.LAND.dist * landEnv);
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
    const hfBase = Math.max(0.03, this.heightFrac.x);
    let hf = hfBase * landTight;
    const screenYc = this.screenY.x - MOTION.LAND.screenY * landEnv;
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
      let sv = screenYc - dv;
      // First widen: a bike more than 0.3 off the aim point wants a wider frame, not a slide.
      const over = Math.max(Math.abs(su - 0.5), Math.abs(sv - 0.5)) - 0.3;
      // Round 14: airborne the widen is skipped (the slide below keeps the bike on the band); on the
      // ground it stays (a wall of obstacles ahead reads better wide than slid).
      if (over > 0 && !(f.airborne && !f.crashed)) {
        const k = Math.min(2.5, 1 + over * 4);
        this.heightFrac.snap(Math.max(0.03, hfBase / k));
        hf /= k;
        halfH *= k;
        halfW *= k;
        du /= k;
        dv /= k;
        su = this.screenX.x + du;
        sv = screenYc - dv;
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
    const oy = (1 - 2 * screenYc) * halfH;
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
    // --- Round 15 (2): override (replay viewer / level reviewer). Applied after the rig has fully
    // integrated, so `setOverride(null)` returns the exact rig frame on the next update.
    const ov = this.override;
    if (ov) {
      const cp = this.camera.position;
      if (ov.mode === 'free') {
        const d = ov.dist ?? this.dist;
        this.aim.set(ov.x ?? this.aim.x, ov.y ?? this.aim.y, 0);
        cp.copy(this.aim).addScaledVector(this.dir, -d);
        this.dist = d;
      } else if (ov.mode === 'fixed') {
        cp.set(ov.x ?? cp.x, ov.y ?? cp.y, cp.z);
      } else if (ov.mode === 'follow-wide') {
        // ×0.76 height fraction = ×1/0.76 distance from the same aim, inside the track bounds.
        const d = this.dist / 0.76;
        cp.copy(this.aim).addScaledVector(this.dir, -d);
        if (B) cp.set(Math.min(B.maxX, Math.max(B.minX, cp.x)), Math.min(B.maxY, Math.max(B.minY, cp.y)), Math.min(B.maxZ, Math.max(B.minZ, cp.z)));
        this.dist = d;
      } else if (ov.mode === 'orbit') {
        // Garage model explorer: a turntable orbit about the hero's centre. Yaw / pitch / distance are the
        // screen's (drag / pinch); the fov is the idle one (ORBIT.fov) so the hero's frame share is
        // RIDER_HEIGHT / (2 · dist · tan(fov / 2)) — dist 6.0 m ≈ 0.59 of the height (bbox ≈ 0.6). `screenX` / `screenY` slide the
        // aim across the frame (a rail on the left, a panel on the right, nothing over the hero). No bounds clamp: the stage
        // is its own room. The rig integrated above, so `setOverride(null)` restores the menu frame exactly.
        const O = ORBIT;
        const yaw = ov.yaw ?? O.yaw;
        const pitch = Math.min(O.pitchMax, Math.max(O.pitchMin, ov.pitch ?? O.pitch));
        const d = Math.min(O.distMax, Math.max(O.distMin, ov.dist ?? O.dist));
        this.aim.set(ov.x ?? f.bikeX, ov.y ?? f.bikeY + 0.45, 0);
        const cp2 = Math.cos(pitch);
        this.dir.set(-Math.sin(yaw) * cp2, -Math.sin(pitch), -Math.cos(yaw) * cp2); // camera → aim
        this.e.set(-pitch, yaw, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.right.set(1, 0, 0).applyQuaternion(this.q);
        this.up.set(0, 1, 0).applyQuaternion(this.q);
        fovOut = O.fov;
        const sy = Math.min(0.9, Math.max(0.1, ov.screenY ?? 0.5));
        const sx = Math.min(0.9, Math.max(0.1, ov.screenX ?? 0.5));
        const halfHOrbit = d * Math.tan(fovOut / 2);
        this.aim.addScaledVector(this.up, -(1 - 2 * sy) * halfHOrbit);
        this.aim.addScaledVector(this.right, -(2 * sx - 1) * halfHOrbit * this.aspect);
        cp.copy(this.aim).addScaledVector(this.dir, -d);
        this.camera.quaternion.copy(this.q);
        this.dist = d;
      }
    }
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

  /** Bike anchor in screen UV (0..1, y down) without allocating — `render()` reads this every frame for the post uniforms. */
  bikeScreen(out: { x: number; y: number }): void {
    this.proj.set(this.lastBikeX, this.lastBikeY + 0.45, 0).project(this.camera);
    out.x = (this.proj.x + 1) / 2;
    out.y = (1 - this.proj.y) / 2;
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
