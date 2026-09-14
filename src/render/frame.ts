/**
 * RenderFrame: the interpolated view of two consecutive PhysicsStates plus the
 * cues derived from them. Built once per render() call, pooled (no allocation
 * after the first build). Everything time-based in the renderer reads `tSim`
 * from here, never the wall clock, so a capture is frame-reproducible.
 */
import type { PhysicsState, RagdollBody, SurfaceKind, Vec2 } from '../core/types';

export const WHEEL_RADIUS = 0.34;
export const WHEELBASE = 1.3;

export interface WheelView {
  x: number;
  y: number;
  spin: number;
  spinVel: number;
  compression: number;
  grounded: boolean;
}

export interface RenderFrame {
  /** Simulated seconds, interpolated. Monotonic except across a restart. */
  tSim: number;
  /** tSim delta since the previous frame (0 on the first frame / after a cut). */
  dt: number;
  tick: number;
  /** True on the frame where tick went backwards (reset) or a track was loaded. */
  cut: boolean;
  bikeX: number;
  bikeY: number;
  bikeAngle: number;
  velX: number;
  velY: number;
  speed: number;
  /** Velocity projected on the bike x axis. */
  groundSpeed: number;
  rear: WheelView;
  front: WheelView;
  rider: { lean: number; crouch: number; torsoPitch: number; armExtend: number };
  /** Physics hop state machine (glTF rider plays `extend` on 'push'). */
  hopPhase: 'idle' | 'preload' | 'push' | 'recover';
  throttle: number;
  throttleEff: number;
  rpm: number;
  rearSlip: number;
  contactRear: SurfaceKind | null;
  contactFront: SurfaceKind | null;
  airborne: boolean;
  airTime: number;
  justLanded: boolean;
  landedWheel: 'rear' | 'front';
  landImpulse: number;
  crashed: boolean;
  finished: boolean;
  faulted: boolean;
  ragdoll: RagdollBody[] | null;
  seesaws: { id: number; angle: number }[];
  drums: { id: number; spin: number }[];
  checkpoint: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class FrameBuilder {
  private prev: PhysicsState | null = null;
  private lastTSim = 0;
  private airSince = -1;
  private firstFrame = true;
  readonly frame: RenderFrame = {
    tSim: 0,
    dt: 0,
    tick: 0,
    cut: true,
    bikeX: 0,
    bikeY: 0,
    bikeAngle: 0,
    velX: 0,
    velY: 0,
    speed: 0,
    groundSpeed: 0,
    rear: { x: 0, y: 0, spin: 0, spinVel: 0, compression: 0, grounded: true },
    front: { x: 0, y: 0, spin: 0, spinVel: 0, compression: 0, grounded: true },
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    hopPhase: 'idle',
    throttle: 0,
    throttleEff: 0,
    rpm: 1500,
    rearSlip: 0,
    contactRear: null,
    contactFront: null,
    airborne: false,
    airTime: 0,
    justLanded: false,
    landedWheel: 'rear',
    landImpulse: 0,
    crashed: false,
    finished: false,
    faulted: false,
    ragdoll: null,
    seesaws: [],
    drums: [],
    checkpoint: -1,
  };

  /** Force a cut on the next build (track change). */
  invalidate(): void {
    this.prev = null;
    this.firstFrame = true;
  }

  build(cur: PhysicsState, alpha: number): RenderFrame {
    const f = this.frame;
    let prev = this.prev;
    // A reset drops tick to 0 (or the state object is from a different run);
    // interpolating across it would smear the hard cut, so snap.
    const cut = this.firstFrame || prev === null || cur.tick < prev.tick || cur.time < prev.time;
    if (cut || prev === null) prev = cur;
    const a = cut ? 1 : Math.min(1, Math.max(0, alpha));

    f.cut = cut;
    f.tick = cur.tick;
    f.tSim = lerp(prev.time, cur.time, a);
    f.dt = cut ? 0 : Math.max(0, f.tSim - this.lastTSim);
    this.lastTSim = f.tSim;

    f.bikeX = lerp(prev.bike.pos.x, cur.bike.pos.x, a);
    f.bikeY = lerp(prev.bike.pos.y, cur.bike.pos.y, a);
    f.bikeAngle = lerpAngle(prev.bike.angle, cur.bike.angle, a);
    f.velX = lerp(prev.bike.vel.x, cur.bike.vel.x, a);
    f.velY = lerp(prev.bike.vel.y, cur.bike.vel.y, a);
    f.speed = Math.hypot(f.velX, f.velY);
    const c = Math.cos(f.bikeAngle);
    const s = Math.sin(f.bikeAngle);
    f.groundSpeed = f.velX * c + f.velY * s;

    this.wheel(f.rear, prev.wheels.rear, cur.wheels.rear, a);
    this.wheel(f.front, prev.wheels.front, cur.wheels.front, a);

    f.rider.lean = lerp(prev.rider.lean, cur.rider.lean, a);
    f.rider.crouch = lerp(prev.rider.crouch, cur.rider.crouch, a);
    f.rider.torsoPitch = lerp(prev.rider.torsoPitch, cur.rider.torsoPitch, a);
    f.rider.armExtend = lerp(prev.rider.armExtend, cur.rider.armExtend, a);
    f.hopPhase = cur.hopPhase ?? 'idle';

    f.throttle = cur.input?.throttle ?? 0;
    f.throttleEff = cur.engine?.throttleEff ?? f.throttle;
    f.rpm = cur.engine?.rpm ?? 1500;
    f.rearSlip = cur.rearSlip ?? 0;
    f.contactRear = cur.contacts?.rear ?? (cur.wheels.rear.grounded ? 'dirt' : null);
    f.contactFront = cur.contacts?.front ?? (cur.wheels.front.grounded ? 'dirt' : null);

    const wasAir = !prev.wheels.rear.grounded && !prev.wheels.front.grounded;
    f.airborne = !cur.wheels.rear.grounded && !cur.wheels.front.grounded;
    if (f.airborne) {
      if (this.airSince < 0 || cut) this.airSince = f.tSim;
      f.airTime = f.tSim - this.airSince;
    } else {
      f.airTime = 0;
      this.airSince = -1;
    }
    // Landing = a wheel that was in the air touching down this tick.
    const rearLand = !prev.wheels.rear.grounded && cur.wheels.rear.grounded;
    const frontLand = !prev.wheels.front.grounded && cur.wheels.front.grounded;
    f.justLanded = !cut && (rearLand || frontLand) && (wasAir || prev.bike.vel.y < -1.5);
    f.landedWheel = rearLand ? 'rear' : 'front';
    f.landImpulse = f.justLanded ? Math.max(0, -prev.bike.vel.y) : 0;

    f.crashed = cur.faulted === 'crash' || cur.faulted === 'hazard' || cur.ragdoll !== null;
    f.finished = cur.finished && cur.faulted === null;
    f.faulted = cur.faulted !== null;
    // Ragdoll bodies interpolate like everything else (both states ragdolling, same body list);
    // on the spawn frame only `cur` exists and the rider model blends from its last posed frame.
    f.ragdoll = this.ragdoll(prev.ragdoll ?? null, cur.ragdoll ?? null, a);
    f.seesaws = cur.seesaws ?? [];
    f.drums = cur.drums ?? [];
    f.checkpoint = cur.checkpoint;

    this.prev = cur;
    this.firstFrame = false;
    return f;
  }

  private readonly ragPool: RagdollBody[] = [];
  private ragdoll(p: RagdollBody[] | null, c: RagdollBody[] | null, a: number): RagdollBody[] | null {
    if (!c) return null;
    if (!p || p.length !== c.length || a >= 1) return c;
    const out = this.ragPool;
    for (let i = 0; i < c.length; i++) {
      const cb = c[i]!;
      const pb = p[i]!;
      if (pb.id !== cb.id) return c;
      const o = out[i] ?? (out[i] = { id: cb.id, pos: { x: 0, y: 0 }, angle: 0 });
      o.id = cb.id;
      o.pos.x = lerp(pb.pos.x, cb.pos.x, a);
      o.pos.y = lerp(pb.pos.y, cb.pos.y, a);
      o.angle = lerpAngle(pb.angle, cb.angle, a);
    }
    out.length = c.length;
    return out;
  }

  private wheel(out: WheelView, p: PhysicsState['wheels']['rear'], c: PhysicsState['wheels']['rear'], a: number): void {
    out.x = lerp(p.pos.x, c.pos.x, a);
    out.y = lerp(p.pos.y, c.pos.y, a);
    out.spin = lerp(p.spin, c.spin, a);
    out.spinVel = lerp(p.spinVel, c.spinVel, a);
    out.compression = lerp(p.compression, c.compression, a);
    out.grounded = c.grounded;
  }
}

export type { Vec2 };
