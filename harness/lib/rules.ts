/**
 * Node mirror of the game's run-rule layer (src/game/game.ts `tick()` for the
 * riding / crashed / finished phases, starting at GO — exactly what
 * `hook.runRecording` does in the browser). Physics alone does not know about
 * the 1.0 s auto-respawn, the restart edge, the 0.6 s hold-for-full-restart or
 * the run clock; without this layer node and browser replays diverge at the
 * first crash (determinism D3 caught exactly that).
 *
 * Kept deliberately tiny and data-only so it can be snapshotted next to the
 * physics snapshot. REQUESTED src change: core-game exports this state
 * machine from `src/game` (renderer-free) so the harness imports instead of
 * mirroring. Until then, `docs/design/game.md` §2.8 and this file must agree;
 * `gate/determinism.ts` D3 is the test that they do.
 */
import { NEUTRAL_INPUT, type GameEvent, type GamePhase, type InputFrame } from '../../src/core/types';
import type { PhysicsWorld } from '../../src/physics';
import { ruleTicks, type RuleTicks } from '../../src/game/rules';

export interface RulesCounters {
  phase: GamePhase;
  runTicks: number;
  finishRunTicks: number;
  faults: number;
  countdownTick: number;
  crashTicks: number;
  holdTicks: number;
  holdFired: boolean;
  restartLatch: boolean;
  resultsTicks: number;
  resultsShown: boolean;
}

export class RunRules {
  readonly T: RuleTicks;
  private c: RulesCounters = RunRules.atGo();
  private readonly fwd: InputFrame = { throttle: 0, brake: 0, lean: 0, hop: false, restart: false };
  private pending: GameEvent[] = [];

  constructor(
    private readonly physics: PhysicsWorld,
    readonly hz: number,
  ) {
    this.T = ruleTicks(hz);
  }

  static atGo(): RulesCounters {
    return {
      phase: 'riding',
      runTicks: 0,
      finishRunTicks: 0,
      faults: 0,
      countdownTick: 0,
      crashTicks: 0,
      holdTicks: 0,
      holdFired: false,
      restartLatch: false,
      resultsTicks: 0,
      resultsShown: false,
    };
  }

  /** Mirror of Game.go(): physics at the start line, run clock 0, riding. */
  go(): void {
    this.physics.reset(-1);
    this.physics.drainEvents();
    this.c = RunRules.atGo();
    this.pending = [];
  }

  counters(): RulesCounters {
    return { ...this.c };
  }

  restoreCounters(c: RulesCounters): void {
    this.c = { ...c };
    this.pending = [];
  }

  phase(): GamePhase {
    return this.c.phase;
  }
  runTicks(): number {
    return this.c.phase === 'finished' ? this.c.finishRunTicks : this.c.runTicks;
  }
  faults(): number {
    return this.c.faults;
  }

  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private emit(e: GameEvent): void {
    if (e.type === 'fault') this.c.faults++;
    if (e.type === 'restart' && e.checkpoint < 0) this.c.faults = 0;
    this.pending.push(e);
  }

  private respawn(checkpoint: number): void {
    this.physics.reset(checkpoint);
    this.physics.drainEvents();
    this.c.crashTicks = 0;
    this.c.phase = 'riding';
    this.emit({ type: 'restart', checkpoint, tick: 0 });
  }

  /** Harness mode: a full restart goes straight to GO (no countdown). */
  private restartFromStart(): void {
    this.physics.reset(-1);
    this.physics.drainEvents();
    this.emit({ type: 'restart', checkpoint: -1, tick: 0 });
    const faults = 0;
    this.c = { ...RunRules.atGo(), faults };
    this.emit({ type: 'go' });
  }

  private stepPhysics(input: InputFrame): void {
    const f = this.fwd;
    f.throttle = input.throttle;
    f.brake = input.brake;
    f.lean = input.lean;
    f.hop = false;
    f.restart = false;
    this.physics.step(f);
    for (const e of this.physics.drainEvents()) this.processPhysicsEvent(e);
  }

  private processPhysicsEvent(e: GameEvent): void {
    switch (e.type) {
      case 'fault':
        if (this.c.phase !== 'riding') return;
        this.c.crashTicks = 0;
        this.c.phase = 'crashed';
        this.emit(e);
        return;
      case 'finish':
        if (this.c.phase !== 'riding') return;
        this.c.finishRunTicks = this.c.runTicks;
        this.c.resultsTicks = 0;
        this.c.resultsShown = false;
        this.c.phase = 'finished';
        this.emit(e);
        return;
      case 'restart':
        return;
      default:
        this.emit(e);
    }
  }

  /** One game tick with the given (quantized) input. Mirrors Game.tick(). */
  tick(input: InputFrame): void {
    const c = this.c;
    const T = this.T;
    const pressed = input.restart === true;
    const edge = pressed && !c.restartLatch;
    c.restartLatch = pressed;
    if (pressed) c.holdTicks++;
    else {
      c.holdTicks = 0;
      c.holdFired = false;
    }
    if (pressed && !c.holdFired && c.holdTicks >= T.holdRestart && c.phase !== 'menu') {
      c.holdFired = true;
      if (c.phase === 'crashed' || c.phase === 'riding') c.runTicks++;
      this.restartFromStart();
      return;
    }
    switch (c.phase) {
      case 'menu':
        return;
      case 'countdown': {
        this.physics.step(NEUTRAL_INPUT);
        this.physics.drainEvents();
        c.countdownTick++;
        if (c.countdownTick % T.countdownBeat === 0 && c.countdownTick >= T.countdownTotal) this.go();
        return;
      }
      case 'riding': {
        c.runTicks++;
        if (edge) {
          const s = this.physics.getState();
          this.emit({ type: 'fault', reason: 'restart', tick: s.tick, time: s.time });
          this.respawn(s.checkpoint);
          return;
        }
        this.stepPhysics(input);
        return;
      }
      case 'crashed': {
        c.runTicks++;
        c.crashTicks++;
        if (edge || c.crashTicks >= T.autoRespawn) {
          this.respawn(this.physics.getState().checkpoint);
          return;
        }
        this.stepPhysics(input);
        return;
      }
      case 'finished': {
        if (edge) {
          this.restartFromStart();
          return;
        }
        c.resultsTicks++;
        if (!c.resultsShown && c.resultsTicks >= T.resultsDelay) c.resultsShown = true;
        this.stepPhysics(input);
        return;
      }
    }
  }
}
