/**
 * MOCK physics: a rigid box gliding along the ground profile so the harness
 * has a deterministic, hashable thing to drive and render. No suspension, no
 * rider dynamics — those belong to the real PhysicsWorld.
 */
import type { CompiledTrack, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState, TrackDef, Vec2 } from '../core/types';
import { Rng } from '../core/rng';
import { WHEELBASE, WHEEL_RADIUS } from '../core/types';
import type { PhysicsWorld } from '../physics';

const MAX_SPEED = 14; // m/s
const ACCEL = 9;
const BRAKE_DECEL = 16;
const DRAG = 0.6;
const LEAN_RATE = 3.5;
const MAX_ANGLE = 0.5;
/** Mock crash: lean back + throttle held this many ticks at speed = loop-out. */
const LOOP_OUT_TICKS = 120;
const RAGDOLL_IDS = ['head', 'torso', 'pelvis', 'upperArm', 'forearm', 'thigh', 'shin'] as const;

function profileY(track: TrackDef, x: number): number {
  const p = track.profile;
  if (p.length === 0) return 0;
  if (x <= p[0]!.x) return p[0]!.y;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return p[p.length - 1]!.y;
}

export class MockPhysics implements PhysicsWorld {
  readonly physicsHz: number;
  private readonly dt: number;
  private track: TrackDef | null = null;
  private rng = new Rng(0);
  private seed = 0;
  private state: PhysicsState = MockPhysics.blankState();
  private events: GameEvent[] = [];
  private hopLatch = false;
  private restartLatch = false;
  /** Consecutive ticks of lean-back + throttle at speed; loops out past LOOP_OUT_TICKS. */
  private wheelieTicks = 0;
  private oobY = -6;

  constructor(physicsHz: number) {
    this.physicsHz = physicsHz;
    this.dt = 1 / physicsHz;
  }

  private static blankState(): PhysicsState {
    const wheel = (): PhysicsState['wheels']['rear'] => ({
      pos: { x: 0, y: 0 },
      spin: 0,
      spinVel: 0,
      compression: 0,
      grounded: true,
    });
    return {
      tick: 0,
      time: 0,
      bike: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, angVel: 0 },
      wheels: { rear: wheel(), front: wheel() },
      rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
      checkpoint: -1,
      finished: false,
      faulted: null,
      finishTime: null,
      input: { throttle: 0, brake: 0, lean: 0 },
      engine: { rpm: 1500, throttleEff: 0, limiter: false },
      contacts: { rear: 'dirt', front: 'dirt' },
      rearSlip: 0,
      hopPhase: 'idle',
      ragdoll: null,
      seesaws: [],
      drums: [],
    };
  }

  loadTrack(track: CompiledTrack, seed: number): void {
    this.track = track.def;
    this.seed = seed >>> 0;
    this.oobY = track.oobY;
    this.reset(-1);
  }

  reset(checkpoint: number): void {
    const track = this.requireTrack();
    const s = MockPhysics.blankState();
    const spawn = checkpoint >= 0 ? track.checkpoints[checkpoint]?.spawn ?? track.start : track.start;
    s.bike.pos = { x: spawn.pos.x, y: spawn.pos.y + WHEEL_RADIUS + 0.2 };
    s.bike.angle = spawn.angle;
    s.checkpoint = checkpoint;
    this.state = s;
    this.rng = new Rng((this.seed ^ Math.imul(checkpoint + 2, 0x9e3779b9)) >>> 0);
    this.hopLatch = false;
    this.restartLatch = false;
    this.wheelieTicks = 0;
    this.placeWheels();
    this.events.push({ type: 'restart', checkpoint, tick: 0 });
  }

  step(input: InputFrame): void {
    const track = this.requireTrack();
    const s = this.state;
    const dt = this.dt;

    // Restart edge.
    if (input.restart && !this.restartLatch) {
      this.restartLatch = true;
      const cp = s.checkpoint;
      this.events.push({ type: 'fault', reason: 'restart', tick: s.tick, time: s.time });
      this.reset(cp);
      return;
    }
    if (!input.restart) this.restartLatch = false;
    if (s.faulted) {
      // Ragdoll tumbles deterministically until the game resets us.
      this.stepRagdoll();
      s.tick++;
      s.time = s.tick * dt;
      return;
    }
    if (s.finished) {
      // Frozen; still tick the clock so hashes advance predictably.
      s.tick++;
      return;
    }

    // Longitudinal.
    let ax = input.throttle * ACCEL - Math.sign(s.bike.vel.x) * input.brake * BRAKE_DECEL - s.bike.vel.x * DRAG;
    // Slope from the ground profile pulls back / pushes forward.
    const slope = profileY(track, s.bike.pos.x + 0.5) - profileY(track, s.bike.pos.x - 0.5);
    ax -= slope * 9.81 * 0.5;
    s.bike.vel.x += ax * dt;
    if (s.bike.vel.x > MAX_SPEED) s.bike.vel.x = MAX_SPEED;
    if (input.brake > 0 && Math.abs(s.bike.vel.x) < BRAKE_DECEL * dt * input.brake) s.bike.vel.x = 0;
    s.bike.pos.x += s.bike.vel.x * dt;

    // Lean: rider weight shift pitches the box, spring back to level.
    const targetAngle = -input.lean * MAX_ANGLE;
    s.bike.angVel = (targetAngle - s.bike.angle) * LEAN_RATE;
    s.bike.angle += s.bike.angVel * dt;
    s.rider.lean += (input.lean - s.rider.lean) * Math.min(1, 8 * dt);
    s.rider.torsoPitch = -s.rider.lean * 0.3;
    s.rider.armExtend = Math.max(0, -s.rider.lean);

    // Loop-out: lean back with throttle at speed for too long = crash (the
    // mock's only fault, so the harness has a deterministic crash probe).
    const wheelie = input.lean <= -0.9 && input.throttle >= 0.5 && Math.abs(s.bike.vel.x) > 2;
    this.wheelieTicks = wheelie ? this.wheelieTicks + 1 : 0;
    s.rider.crouch = Math.max(0, s.rider.crouch - 4 * dt);
    s.hopPhase = wheelie ? 'preload' : 'idle';
    const groundY = profileY(track, s.bike.pos.x) + WHEEL_RADIUS + 0.2;
    s.bike.vel.y -= 9.81 * dt;
    s.bike.pos.y += s.bike.vel.y * dt;
    if (s.bike.pos.y <= groundY) {
      s.bike.pos.y = groundY;
      s.bike.vel.y = 0;
    }

    this.placeWheels();

    // Checkpoints and finish.
    const frontX = s.wheels.front.pos.x;
    const nextCp = s.checkpoint + 1;
    const cpDef = track.checkpoints[nextCp];
    if (cpDef && frontX >= cpDef.x) {
      s.checkpoint = nextCp;
      this.events.push({ type: 'checkpoint', index: nextCp, tick: s.tick, time: s.time });
    }

    s.tick++;
    s.time = s.tick * dt;

    if (frontX >= track.finishX) {
      s.finished = true;
      s.finishTime = s.time;
      this.events.push({ type: 'finish', tick: s.tick, time: s.time });
    } else if (this.wheelieTicks >= LOOP_OUT_TICKS) {
      this.crash('crash');
    } else if (s.bike.pos.y < this.oobY) {
      this.crash('out-of-bounds');
    }

    // Consume one RNG value per tick so the RNG stream is part of the hash
    // surface (mirrors what real physics does with contact jitter).
    void this.rng.next();
  }

  private crash(reason: 'crash' | 'out-of-bounds'): void {
    const s = this.state;
    s.faulted = reason;
    s.hopPhase = 'idle';
    s.bike.angVel = -6;
    // Rider leaves the bike backwards and up; bodies trail the pelvis.
    s.ragdoll = RAGDOLL_IDS.map((id, i) => ({
      id,
      pos: { x: s.bike.pos.x - i * 0.12, y: s.bike.pos.y + 0.9 - i * 0.1 },
      angle: -0.3 * i,
    }));
    this.events.push({ type: 'fault', reason, tick: s.tick, time: s.time });
  }

  private stepRagdoll(): void {
    const s = this.state;
    const dt = this.dt;
    const track = this.requireTrack();
    // Bike slides to a stop on its side.
    s.bike.vel.x *= 1 - 3 * dt;
    s.bike.pos.x += s.bike.vel.x * dt;
    s.bike.angle = Math.max(-1.4, s.bike.angle + s.bike.angVel * dt);
    s.bike.angVel *= 1 - 4 * dt;
    this.placeWheels();
    // Bodies: ballistic with a bounce, each body slightly behind the last.
    const ground = profileY(track, s.bike.pos.x);
    for (let i = 0; i < (s.ragdoll?.length ?? 0); i++) {
      const b = s.ragdoll![i]!;
      const vx = -1.5 - i * 0.2;
      const vy = 3.5 - 9.81 * Math.min(1.2, (s.tick % 400) * dt);
      b.pos.x += vx * dt;
      b.pos.y = Math.max(ground + 0.15, b.pos.y + vy * dt);
      b.angle += (2 + i * 0.4) * dt;
    }
  }

  private placeWheels(): void {
    const s = this.state;
    const c = Math.cos(s.bike.angle);
    const sn = Math.sin(s.bike.angle);
    const half = WHEELBASE / 2;
    const rear: Vec2 = { x: s.bike.pos.x - half * c, y: s.bike.pos.y - half * sn - 0.2 };
    const front: Vec2 = { x: s.bike.pos.x + half * c, y: s.bike.pos.y + half * sn - 0.2 };
    const spinVel = s.bike.vel.x / WHEEL_RADIUS;
    for (const [w, pos] of [
      [s.wheels.rear, rear],
      [s.wheels.front, front],
    ] as const) {
      w.pos = pos;
      w.spinVel = spinVel;
      w.spin += spinVel * this.dt;
      w.grounded = s.bike.vel.y === 0;
      w.compression = w.grounded ? 0.15 + Math.min(0.5, Math.abs(s.bike.vel.x) / MAX_SPEED) * 0.2 : 0;
    }
  }

  getState(): PhysicsState {
    // Structured clone keeps callers from mutating live state.
    return structuredClone(this.state);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Mock snapshot: JSON of the state + latches packed into u8, rng in f64. */
  snapshot(): PhysicsSnapshot {
    const f64 = new Float64Array([this.seed, ...this.rng.state()]);
    const u8 = new TextEncoder().encode(
      JSON.stringify({ s: this.state, h: this.hopLatch, r: this.restartLatch, w: this.wheelieTicks, o: this.oobY }),
    );
    return { v: 1, f64, u8 };
  }

  restore(snap: PhysicsSnapshot): void {
    const o = JSON.parse(new TextDecoder().decode(snap.u8)) as {
      s: PhysicsState;
      h: boolean;
      r: boolean;
      w?: number;
      o?: number;
    };
    this.state = o.s;
    this.hopLatch = o.h;
    this.restartLatch = o.r;
    this.wheelieTicks = o.w ?? 0;
    this.oobY = o.o ?? -6;
    this.seed = snap.f64[0]! >>> 0;
    this.rng.setState([snap.f64[1]!, snap.f64[2]!, snap.f64[3]!, snap.f64[4]!]);
  }

  private requireTrack(): TrackDef {
    if (!this.track) throw new Error('MockPhysics: no track loaded');
    return this.track;
  }
}
