/**
 * The reflex player: a continuous real-time controller with human limits.
 *
 *   perception  20–30 Hz glances (perceive.ts) + noise (±2° pitch, ±5% speed)
 *   reaction    every decision acts on the glance that is `reactionS` old
 *               (180–250 ms, drawn once per run, jittered per glance)
 *   rules       the handful of things a rider says to themselves:
 *               nose too high → lean forward / off gas; drop ahead → lean back;
 *               steep up ahead → gas + lean forward; airborne → level to the
 *               landing slope; too fast into a feature → brake; pit → speed
 *               and nose up at the lip; stuck → restart
 *   hands       keys are binary: throttle/brake 0/1 and lean −1/0/+1, changed
 *               at most once per ~80 ms tap; analog intent becomes a tap
 *               rhythm (sigma-delta duty cycle) like a thumb feathering a key
 *   lapses      every N s (exp.) the hands freeze for 0.25–0.5 s
 *   learning    memory.ts: a fault at x changes how the next attempt approaches x
 *
 * No snapshot lookahead, no search, no track internals beyond the visible
 * profile ahead. The same class drives the node sim (time = run clock) and
 * the live browser (time = wall clock): the driver supplies observations and
 * consumes key states.
 */
import { Rng } from '../../src/core/rng';
import type { BikeClass } from '../../src/core/types';
import type { Observation } from './perceive';
import { SectionMemory, type FaultContext } from './memory';

export type SkillName = 'novice' | 'average' | 'good';

export interface SkillParams {
  name: SkillName;
  /** Reaction delay range (s): one value drawn per run, ±jitter per glance. */
  reactionS: [number, number];
  reactionJitterS: number;
  perceiveHz: number;
  pitchNoiseDeg: number;
  speedNoiseFrac: number;
  /** Mean seconds between lapses (exponential) and lapse duration range (s). */
  lapseMeanS: number;
  lapseDurS: [number, number];
  /** Minimum time between key changes (s). */
  tapS: number;
  /** Rule gains multiplier (weaker rules = smaller corrections, later). */
  gain: number;
  /** Comfortable cruising speed on the flat (m/s). */
  cruise: number;
  /** Anticipation: features are acted on this many seconds of travel ahead. */
  leadS: number;
  /** How much of a fault's lesson is applied (memory.ts). */
  learnRate: number;
  /** Seconds a crashed rider waits before hitting restart (on top of reaction). */
  restartAfterS: number;
}

export const SKILLS: Record<SkillName, SkillParams> = {
  novice: {
    name: 'novice',
    reactionS: [0.23, 0.28],
    reactionJitterS: 0.03,
    perceiveHz: 20,
    pitchNoiseDeg: 3,
    speedNoiseFrac: 0.07,
    lapseMeanS: 6,
    lapseDurS: [0.3, 0.5],
    tapS: 0.1,
    gain: 0.7,
    cruise: 9,
    leadS: 0.7,
    learnRate: 0.8,
    restartAfterS: 0.5,
  },
  average: {
    name: 'average',
    reactionS: [0.18, 0.22],
    reactionJitterS: 0.02,
    perceiveHz: 25,
    pitchNoiseDeg: 2,
    speedNoiseFrac: 0.05,
    lapseMeanS: 10,
    lapseDurS: [0.25, 0.4],
    tapS: 0.08,
    gain: 1,
    cruise: 11,
    leadS: 0.9,
    learnRate: 1,
    restartAfterS: 0.35,
  },
  good: {
    name: 'good',
    reactionS: [0.15, 0.17],
    reactionJitterS: 0.015,
    perceiveHz: 30,
    pitchNoiseDeg: 1.5,
    speedNoiseFrac: 0.04,
    lapseMeanS: 20,
    lapseDurS: [0.2, 0.3],
    tapS: 0.07,
    gain: 1.2,
    cruise: 13,
    leadS: 1.1,
    learnRate: 1.1,
    restartAfterS: 0.25,
  },
};

/** Binary key state — exactly what KeyboardInput reads. */
export interface Keys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  restart: boolean;
}

export const KEYS_UP: Readonly<Keys> = Object.freeze({ up: false, down: false, left: false, right: false, restart: false });

export interface Intent {
  throttle: number;
  brake: number;
  lean: number;
  restart: boolean;
  /** Which rule spoke last (for logs / death reasons). */
  rule: string;
}

export interface ControllerOptions {
  skill: SkillName;
  seed: number;
  memory?: SectionMemory;
  /** Override skill params (tuning). */
  params?: Partial<SkillParams>;
  /** Bike class the rider is on (round 9: the ramp pose is per class; default rookie, the tier's bike). */
  bike?: BikeClass;
}

/**
 * Air control constants (round 9, from physics v2 R4 "Rookie air rules in one sentence"): the lean is an
 * acceleration (a held unit builds ~170 deg/s in 0.5 s, K_att 265 deg/s^2), gas and brake are nudges (+6 / -15 deg per
 * half second), and releasing a lean swings the chassis another ~30 deg the other way (-1 -> 0: +31 deg by 0.3 s).
 */
export const AIR = {
  /** Degrees of predicted error per unit lean (e / 18). */
  degPerLean: 18,
  /** Seconds of pitch-rate lead on top of the reaction delay (the wheelie-hold regulator's 0.25 s at a 0.1 s loop). */
  leadS: 0.25,
  /** |lean| cap unless the predicted error is beyond `fullBeyondDeg`. */
  softCap: 0.5,
  fullBeyondDeg: 35,
  /** A full press is never held longer than this (s); after it the cap applies. */
  fullHoldMaxS: 0.3,
  /** Release this long before the predicted zero crossing (s). */
  releaseLeadS: 0.15,
  /** Degrees the chassis swings per unit of lean released (the rider pose swing; -1 -> 0 pops the nose +30). */
  releaseSwingDeg: 30,
  /** After a release the hands stay light for this long (s) so the swing is not re-grabbed. */
  releaseCooldownS: 0.3,
  /** Brake nudge when the predicted error is beyond this (deg, nose high); gas nudge when below minus `gasBelowDeg`. */
  brakeBeyondDeg: 30,
  gasBelowDeg: 30,
} as const;

export class ReflexController {
  readonly P: SkillParams;
  readonly memory: SectionMemory;
  readonly rng: Rng;
  readonly reactionS: number;
  /** Delayed glances, oldest first. */
  private glances: Observation[] = [];
  private lastGlanceT = -Infinity;
  private acted: Observation | null = null;
  private intent: Intent = { throttle: 0, brake: 0, lean: 0, restart: false, rule: 'start' };
  private keys: Keys = { ...KEYS_UP };
  private nextTapT = -Infinity;
  private thrAcc = 0;
  private leanAcc = 0;
  private lapseUntil = -Infinity;
  private nextLapseT: number;
  private crashedSince: number | null = null;
  private restartHeldUntil = -Infinity;
  private progressX = -Infinity;
  private progressT = 0;
  private clearedBucket = -Infinity;
  private lastRule = 'start';
  /** A practised hop in progress: preload (gas + back) then snap (gas + forward). */
  private hop: { phase: 'preload' | 'snap' | 'tuck'; until: number } | null = null;
  private lastHopT = -Infinity;
  /** Run-clock time until which the landing rule keeps the weight off the back (set at touchdown). */
  private landingUntil = -Infinity;
  /** Air control state (round 9): the lean the last air decision commanded, when a full press began, the last release. */
  private airLean = 0;
  private airFullSince = -Infinity;
  private airReleasedAt = -Infinity;
  readonly bike: BikeClass;
  ruleCounts = new Map<string, number>();

  constructor(o: ControllerOptions) {
    this.P = { ...SKILLS[o.skill], ...o.params };
    this.bike = o.bike ?? 'rookie';
    this.rng = new Rng((o.seed ^ 0x5eed) >>> 0);
    this.memory = o.memory ?? new SectionMemory();
    this.reactionS = this.rng.range(this.P.reactionS[0], this.P.reactionS[1]);
    this.nextLapseT = this.expo(this.P.lapseMeanS);
  }

  private expo(mean: number): number {
    return -Math.log(1 - this.rng.next()) * mean;
  }
  private gauss(): number {
    const u = 1 - this.rng.next();
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Whether the eyes are due for a glance at time t (the driver may call perceive less often). */
  glanceDue(t: number): boolean {
    return t - this.lastGlanceT >= 1 / this.P.perceiveHz - 1e-9;
  }

  private rateEma = 0;

  /** Feed one glance. Noise is added here; it is queued behind the reaction delay. */
  observe(o: Observation): void {
    this.lastGlanceT = o.t;
    // The eye integrates rotation over ~100 ms: a one-frame landing spike is not "the bike is flipping".
    this.rateEma = 0.5 * this.rateEma + 0.5 * o.pitchRateDeg;
    const n: Observation = {
      ...o,
      pitchDeg: o.pitchDeg + this.gauss() * this.P.pitchNoiseDeg,
      pitchRateDeg: this.rateEma + this.gauss() * this.P.pitchNoiseDeg * 6,
      speed: o.speed * (1 + this.gauss() * this.P.speedNoiseFrac),
      height: o.height + this.gauss() * 0.08,
      t: o.t + this.gauss() * this.P.reactionJitterS,
    };
    this.glances.push(n);
    if (this.glances.length > 64) this.glances.shift();
  }

  /** The last glance the player has acted on (what they "saw" before a fault). */
  lastActed(): Observation | null {
    return this.acted;
  }

  /** New attempt (after a respawn): forget the delayed glances, keep the memory. */
  respawned(t: number): void {
    this.glances = [];
    this.acted = null;
    this.rateEma = 0;
    this.crashedSince = null;
    this.progressX = -Infinity;
    this.progressT = t;
    this.thrAcc = 0;
    this.leanAcc = 0;
    this.hop = null;
    this.landingUntil = -Infinity;
    this.airLean = 0;
    this.airFullSince = -Infinity;
    this.airReleasedAt = -Infinity;
    this.intent = { throttle: 0, brake: 0, lean: 0, restart: false, rule: 'respawn' };
  }

  /** Learn from a fault (called by the driver with the true fault position). */
  learn(c: FaultContext): string[] {
    return this.memory.learn(c, this.P.learnRate).map((a) => a.note);
  }

  /** Key state at time t. Call as often as the driver likes; keys change at most every tapS. */
  keysAt(t: number): Keys {
    // Newest glance old enough to have been reacted to.
    let seen: Observation | null = null;
    while (this.glances.length && this.glances[0]!.t <= t - this.reactionS) seen = this.glances.shift()!;
    if (seen) {
      this.acted = seen;
      this.intent = this.decide(seen, t);
      this.lastRule = this.intent.rule;
    }
    // Lapses: the hands freeze.
    if (t >= this.nextLapseT) {
      this.lapseUntil = t + this.rng.range(this.P.lapseDurS[0], this.P.lapseDurS[1]);
      this.nextLapseT = this.lapseUntil + this.expo(this.P.lapseMeanS);
    }
    if (t < this.lapseUntil) return this.keys;
    if (t < this.nextTapT) return this.keys;
    this.nextTapT = t + this.P.tapS;
    const it = this.intent;
    // Sigma-delta: analog intent → tap rhythm.
    this.thrAcc += it.throttle;
    const up = this.thrAcc >= 1 - 1e-9;
    if (up) this.thrAcc -= 1;
    this.leanAcc += Math.abs(it.lean);
    const leanOn = this.leanAcc >= 1 - 1e-9;
    if (leanOn) this.leanAcc -= 1;
    const right = leanOn && it.lean > 0;
    const left = leanOn && it.lean < 0;
    const down = it.brake >= 0.5;
    const restart = it.restart || t < this.restartHeldUntil;
    this.keys = { up: up && !down, down, left, right, restart };
    this.ruleCounts.set(this.lastRule, (this.ruleCounts.get(this.lastRule) ?? 0) + 1);
    return this.keys;
  }

  currentIntent(): Intent {
    return this.intent;
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  private decide(o: Observation, t: number): Intent {
    const P = this.P;
    const g = P.gain;
    const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

    // Crashed: wait a beat, then hit restart (a short tap: the edge respawns).
    if (o.phase === 'crashed') {
      if (this.crashedSince === null) this.crashedSince = t;
      if (t - this.crashedSince >= P.restartAfterS) {
        this.restartHeldUntil = t + 0.1;
        return { throttle: 0, brake: 0, lean: 0, restart: true, rule: 'restart-after-crash' };
      }
      return { throttle: 0, brake: 0, lean: 0, restart: false, rule: 'crashed' };
    }
    this.crashedSince = null;
    if (o.phase === 'finished') return { throttle: 0, brake: 1, lean: 0, restart: false, rule: 'finished' };

    const mem = this.memory.get(o.x);
    const lead = P.leadS + mem.leadS;
    const v = Math.max(0, o.speed);
    const grounded = o.rear || o.front;
    const airborne = !grounded && o.height > 0.25;
    const a = o.ahead;
    const timeTo = (d: number | null): number => (d === null ? Infinity : d / Math.max(2, v));
    let rule = 'cruise';

    // Sections cleared cleanly: note it (memory relaxes).
    const b = SectionMemory.bucketOf(o.x);
    if (b > this.clearedBucket) {
      if (this.clearedBucket !== -Infinity) this.memory.clear((b - 1) * 6);
      this.clearedBucket = b;
    }

    // Stuck detection: no progress for a while → restart at the checkpoint.
    if (o.x > this.progressX + 0.5) {
      this.progressX = o.x;
      this.progressT = t;
    } else if (t - this.progressT > 4 && grounded) {
      this.progressT = t;
      this.restartHeldUntil = t + 0.1;
      return { throttle: 0, brake: 0, lean: 0, restart: true, rule: 'stuck-restart' };
    }

    // --- target speed -----------------------------------------------------
    let vT = P.cruise * mem.speedScale;
    // Steep climb ahead: carry momentum into it.
    if (a.steepDeg > 20 && timeTo(a.steepDist) < lead + 0.5) vT = Math.max(vT, (8 + a.steepDeg * 0.12) * mem.speedScale);
    // A pit needs speed: cover the width before the front wheel drops a wheel radius (~0.3 s), with margin.
    if (a.pitDist !== null && timeTo(a.pitDist) < lead + 0.8) vT = Math.max(vT, (a.pitWidth / 0.32 + 1.5) * mem.speedScale);
    // A drop / ledge: come off it slowly-ish (the beginner lesson).
    if (a.dropDist !== null && timeTo(a.dropDist) < lead && a.dropDepth > 1) vT = Math.min(vT, (7 + a.dropDepth * 0.5) * mem.speedScale);
    // A vertical face (ledge / box / wall): approach at hop speed, then the practised hop.
    const face = a.faceDist !== null && timeTo(a.faceDist) < lead + 0.6;
    if (face) vT = Math.min(Math.max(vT, 5), (6 + a.faceHeight * 2) * mem.speedScale);
    // A checkpoint / finish mark is not a feature; the finish is: keep going.

    // --- throttle / brake from the speed error --------------------------------
    // Proportional duty around the target: a thumb feathering the key, not on/off.
    let thr = clamp(0.5 + (vT - v) / 4, 0, 1);
    let brk = 0;
    if (grounded && v > vT + 2.5) {
      brk = 1;
      thr = 0;
      rule = 'too-fast-brake';
      // ...but never onto a riser: the front brake 1-2 m before a steep rise or stair flight is an endo (e3 trace,
      // round 9: 12 m/s, brake at 1.3 m from a 27 deg flight, -13 -> -109 deg in 0.35 s). Coast into it instead,
      // a reaction early. Kickers (17-22 deg) are not rises: b3 is authored to a speed window and the brake belongs.
      if (a.steepDist !== null && timeTo(a.steepDist) < this.reactionS + 0.3 && a.steepDeg >= 25) {
        brk = 0;
        thr = 0.5;
        rule = 'coast-into-rise';
      }
    }

    // --- pitch on the ground ----------------------------------------------
    // A rider extrapolates what they saw: predicted pitch a reaction later.
    const pp = o.pitchDeg + clamp(o.pitchRateDeg * this.reactionS * 0.8, -30, 30);
    // Ride a few degrees nose-up on the flat; follow the slope under the bike; ignore small wobbles.
    const targetPitch = Math.max(o.slopeHereDeg * 0.8, o.terrainPitchDeg) + 6;
    const errRaw = pp - targetPitch; // +ve = nose too high
    const err = Math.abs(errRaw) < 6 ? 0 : errRaw - Math.sign(errRaw) * 6;
    let lean = clamp((err / 25) * g, -1, 1);

    if (a.steepDeg > 20 && timeTo(a.steepDist) < lead && a.faceDist === null) {
      // Steep up ahead (v2 technique, physics R3): base gas and NEUTRAL weight so the front rolls up onto the
      // face — a front-heavy bike cannot climb a 45 deg step; the weight is thrown forward once it is on.
      thr = Math.max(thr, 0.7);
      lean = clamp(lean, -0.2, 0.1);
      rule = 'steep-ahead';
    }
    const slopeUnder = Math.max(o.slopeHereDeg, o.terrainPitchDeg);
    if (slopeUnder > 18 && grounded) {
      const overSlope = pp - slopeUnder;
      // A kicker / ramp is LEFT, not climbed (v2 R3 "kickers 17-22 @8/11 lean released: land +-20"): the lip
      // is where the ground ahead falls away relative to the ramp line; gas off and neutral weight before it,
      // because a rear wheel driven off a lip keeps the nose rotating up (round-8 trace: 200 deg/s at the top).
      // Stairs read as a 22° slope with the ground ahead alternating flat/steep: only a lip with NO steep ground behind
      // it (or a real drop) is a lip (tracks r7: the rider stalled on the e3 stair flights, throttle chopped every step).
      const lipSoon = (a.nextSlopeDeg < slopeUnder - 12 && a.steepDeg < 15) || (a.dropDist !== null && timeTo(a.dropDist) < 0.4);
      if (v > 5.5 || slopeUnder < 30) {
        // Ride the ramp with the weight well forward and the throttle on, release at the lip. Round 9 (physics v2 R4):
        // on the Rookie the ramp pose is +0.8..1 — same lip pitch as +0.4 (the assist trims the thrust either way),
        // 0.7 m/s more lip speed and the assist stays out of it; a quarter throttle nose-dives the kicker (round 8).
        // The Pro has no assist: full gas on a kicker at neutral leaves the lip at 76 deg / 178 deg/s, so it rides
        // kickers at +1 and, above 9 m/s, on a third throttle (the physics owner's Pro ramp move).
        // A stair flight reads as the same slope but is ridden as before (weight +0.4, gas): +1 on the risers noses
        // the front into every step (e3 30 -> 42 attempts when the ramp pose was applied to stairs).
        const stairs = a.risers >= 2;
        const rampLean = stairs ? 0.4 * g : this.bike === 'pro' ? 1 : 0.8 + 0.2 * Math.min(1, g);
        const rampThr = this.bike === 'pro' && v > 9 && !stairs ? 0.3 : overSlope > 12 ? 0.3 : 0.8;
        thr = lipSoon ? 0 : Math.max(thr, rampThr);
        lean = lipSoon ? 0 : Math.max(lean, rampLean);
        rule = lipSoon ? 'ramp-lip-release' : 'ramp-ride';
      } else {
        // A steep plank from a crawl: the throw — weight to +1 and full gas, chopped when the nose lifts off the
        // slope (the constant-speed limit is 37 deg at +1; 40-45 top only with the throw).
        thr = overSlope > 25 ? 0 : overSlope > 15 ? 0.4 : 1;
        lean = Math.max(lean, 1 * g);
        rule = 'climbing';
      }
    }
    if (a.dropDist !== null && timeTo(a.dropDist) < lead * 0.7 && a.dropDepth > 0.8) {
      // Drop ahead: weight back, ease the gas so the front does not dive off the edge.
      lean = Math.min(lean, -0.5 * g);
      thr = Math.min(thr, 0.4);
      rule = 'drop-ahead-lean-back';
    }
    if (a.pitDist !== null && timeTo(a.pitDist) < 0.3 + mem.leadS) {
      // At the lip of a pit: nose up over it, gas on.
      lean = -1;
      thr = 1;
      brk = 0;
      rule = 'pit-lip';
    } else if (a.pitDist !== null && timeTo(a.pitDist) < lead + 0.8) {
      thr = Math.max(thr, 1);
      brk = 0;
      rule = 'pit-run-up';
    }
    // The hop (v2 reference recipe, physics R2): 0.3 s preload at lean -1 on light gas, a 0.22 s snap to +1,
    // a 0.1 s tuck; triggered when the face is about the preload + a bike length away. Rear apex 0.46 m.
    if (this.hop && t >= this.hop.until) {
      if (this.hop.phase === 'preload') this.hop = { phase: 'snap', until: t + 0.22 };
      else if (this.hop.phase === 'snap') this.hop = { phase: 'tuck', until: t + 0.1 };
      else this.hop = null;
    }
    if (!this.hop && grounded && a.faceDist !== null && a.faceDist < v * 0.4 + 1.0 + mem.leadS * v && t - this.lastHopT > 1.2) {
      this.hop = { phase: 'preload', until: t + 0.3 };
      this.lastHopT = t;
    }
    if (this.hop) {
      brk = 0;
      thr = this.hop.phase === 'preload' ? 0.4 : this.hop.phase === 'snap' ? 0.6 : 0.3;
      lean = this.hop.phase === 'snap' ? 1 : -1;
      rule = `hop-${this.hop.phase}`;
    }
    // Nose too high on the ground → forward and off the gas (the loop-out reflex).
    const over = pp - Math.max(0, o.terrainPitchDeg);
    if (grounded && over > 28 * (0.8 + 0.2 * g)) {
      lean = 1;
      thr = over > 40 ? 0 : Math.min(thr, 0.3);
      rule = 'nose-high';
    }
    // Nose diving on the ground → back, off the brake.
    if (grounded && pp < -18 && o.slopeHereDeg > -12) {
      lean = -0.7;
      brk = 0;
      rule = 'nose-low';
    }
    // Everyone learns this first: gas + lean back on the ground is a loop-out. Only a
    // deliberate lift (pit lip, step, wall face) combines them.
    const deliberateLift = rule === 'pit-lip' || rule === 'hop-preload' || rule === 'hop-tuck';
    // v2: the Rookie's critical lean under gas is ~ -0.1 (loops at -0.25 in 1.1 s), the Pro loops at 0 — gas on the
    // ground is ridden neutral or forward unless the lift is deliberate (v1 tolerated -0.3).
    if (grounded && !deliberateLift && thr > 0.4 && lean < 0) lean = 0;
    // (c) Launch pose: from a standstill (spawn / respawn) the gas goes on with the weight forward — the Pro loops at
    // neutral in ~1 s, the Rookie's 0 -> 16 is quoted at lean +0.25 (physics.md R3).
    if (grounded && v < 4 && thr > 0.4 && !deliberateLift && rule !== 'climbing') {
      lean = Math.max(lean, 0.35);
      if (rule === 'cruise') rule = 'launch';
    }

    // --- in the air -----------------------------------------------------------
    const stairBounce = airborne && o.height < 0.6 && a.risers >= 2 && Math.max(o.slopeHereDeg, o.terrainPitchDeg) > 15;
    if (stairBounce) {
      // Both wheels off the treads for a moment is a bounce, not a flight: the gas stays on and the weight neutral
      // (round 9 e3 trace: throttle cut on every bounce, 10 -> 1 m/s up a 6-step flight, stall or loop at the top).
      thr = Math.max(thr, 0.8);
      brk = 0;
      lean = clamp(lean, -0.2, 0.4);
      rule = 'stair-bounce';
      this.airLean = 0;
    } else if (airborne) {
      // Round 9 air rules (physics v2 R4 spec): the lean is an acceleration, not a rate. The rider regulates the pitch
      // he will have a reaction + lead later (e + rate x lead), leans at most half unless the error is large, never
      // holds a full press longer than 0.3 s, lets go 0.15 s before the predicted zero crossing minus the ~30 deg the
      // release itself swings the chassis (releasing a lean-back pops the nose up another 30 deg), and does not grab
      // again while that swing plays out. Gas and brake are nudges (+6 / -15 deg per half second) on top of the lean.
      const target = a.landingSlopeDeg + 4;
      const rate = o.pitchRateDeg;
      const e = o.pitchDeg - target; // +ve = nose too high
      const lead = this.reactionS + AIR.leadS;
      const ePred = e + rate * lead;
      const prev = this.airLean;
      const cap = Math.abs(ePred) > AIR.fullBeyondDeg && t - this.airFullSince < AIR.fullHoldMaxS + 1e-9 ? 1 : AIR.softCap;
      let want = clamp((ePred / AIR.degPerLean) * g, -cap, cap);
      rule = 'air-level';
      if (prev !== 0) {
        // Holding a lean: release 0.15 s early, and earlier still by the swing the release will add.
        const afterRelease = e + rate * (this.reactionS + AIR.releaseLeadS) - AIR.releaseSwingDeg * prev;
        if (afterRelease * Math.sign(prev) <= 0) {
          want = 0;
          this.airReleasedAt = t;
          rule = 'air-release';
        }
      } else if (t - this.airReleasedAt < AIR.releaseCooldownS && Math.abs(ePred) < AIR.fullBeyondDeg) {
        // The swing from the last release is still playing out: hands light.
        want = clamp(want, -0.25, 0.25);
        rule = 'air-settle';
      }
      // A full press is a 0.3 s event, not a hold.
      if (Math.abs(want) >= 0.99) {
        if (this.airFullSince === -Infinity || Math.abs(prev) < 0.99) this.airFullSince = t;
        if (t - this.airFullSince > AIR.fullHoldMaxS) want = Math.sign(want) * AIR.softCap;
      } else if (Math.abs(prev) >= 0.99) {
        this.airFullSince = -Infinity;
      }
      lean = want;
      thr = 0;
      brk = 0;
      // Touchdown: descending onto ground within ~0.25 s — hands off (no gas + lean back through the landing: on v2
      // that is a loop the moment the rear grips), weight neutral-to-forward for the dip.
      const landingSoon = o.vy < -0.5 && o.height / Math.max(1, -o.vy) < 0.25;
      if (landingSoon) {
        lean = clamp(Math.max(lean, 0), 0, 0.5);
        rule = 'touchdown';
        this.landingUntil = t + 0.15;
      } else if (ePred > AIR.brakeBeyondDeg && rate > -30) {
        // Nose way up and not yet coming down: the brake nudge (-15 deg per half second) on top of the lean.
        brk = 1;
        rule = 'air-brake-nose-down';
      } else if (ePred < -AIR.gasBelowDeg && rate < 20) {
        // Nose way down and still falling: the gas nudge (+6 deg per half second) on top of the lean; the lean is
        // already at its cap here, the tap is not a bang-bang lean -1 (round 8).
        thr = 0.5;
        rule = 'air-gas-nose-up';
      }
      this.airLean = lean;
    } else {
      this.airLean = 0;
      this.airFullSince = -Infinity;
    }

    if (grounded && t < this.landingUntil && lean < 0) lean = 0;

    // Section bias (memory) and caps.
    lean = clamp(lean + mem.leanBias, -1, 1);
    thr = Math.min(thr, mem.throttleCap);
    if (Math.abs(lean) < 0.12) lean = 0;
    return { throttle: clamp(thr, 0, 1), brake: brk, lean, restart: false, rule };
  }
}
