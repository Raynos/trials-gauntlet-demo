/**
 * Fixed-timestep simulation loop with an accumulator.
 *
 * The loop never touches wall-clock APIs itself: callers feed it elapsed time
 * (`advance(dtSeconds)`) or step it directly (`stepTicks(n)`), so the same
 * loop drives the RAF-driven game and the clockless headless harness.
 */

export interface FixedStepLoopOptions {
  /** Physics ticks per simulated second. */
  physicsHz?: number;
  /** Cap on how much real time is consumed per advance() to avoid spirals. */
  maxFrameTime?: number;
  /** Cap on ticks executed per advance(). */
  maxTicksPerAdvance?: number;
}

export interface FixedStepLoopCallbacks {
  /** One deterministic physics tick of `dt` seconds. */
  tick: (dt: number, tickIndex: number) => void;
  /** Optional render/interpolation pass; alpha is accumulator fraction 0..1. */
  render?: (alpha: number, dt: number) => void;
}

export class FixedStepLoop {
  readonly dt: number;
  readonly physicsHz: number;
  private readonly maxFrameTime: number;
  private readonly maxTicksPerAdvance: number;
  private accumulator = 0;
  private tickCount = 0;

  constructor(
    private readonly callbacks: FixedStepLoopCallbacks,
    options: FixedStepLoopOptions = {},
  ) {
    this.physicsHz = options.physicsHz ?? 120;
    if (!Number.isFinite(this.physicsHz) || this.physicsHz <= 0) {
      throw new Error(`physicsHz must be a positive number, got ${this.physicsHz}`);
    }
    this.dt = 1 / this.physicsHz;
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
    this.maxTicksPerAdvance = options.maxTicksPerAdvance ?? Math.ceil(this.physicsHz * this.maxFrameTime);
  }

  get ticks(): number {
    return this.tickCount;
  }

  /** Fraction of a tick currently buffered (for render interpolation). */
  get alpha(): number {
    return this.accumulator / this.dt;
  }

  /** Feed real elapsed seconds; runs as many fixed ticks as fit, then renders. */
  advance(elapsedSeconds: number): number {
    const clamped = Math.min(Math.max(elapsedSeconds, 0), this.maxFrameTime);
    this.accumulator += clamped;
    let ran = 0;
    while (this.accumulator >= this.dt && ran < this.maxTicksPerAdvance) {
      this.callbacks.tick(this.dt, this.tickCount);
      this.tickCount++;
      this.accumulator -= this.dt;
      ran++;
    }
    if (ran >= this.maxTicksPerAdvance) {
      // Drop the backlog rather than spiral; determinism is preserved because
      // the tick count that *did* run is what the recording captures.
      this.accumulator = 0;
    }
    this.callbacks.render?.(this.alpha, this.dt);
    return ran;
  }

  /** Run exactly `n` ticks with no accumulator involvement (harness mode). */
  stepTicks(n: number): number {
    for (let i = 0; i < n; i++) {
      this.callbacks.tick(this.dt, this.tickCount);
      this.tickCount++;
    }
    return this.tickCount;
  }

  /** Render once at the current interpolation alpha. */
  renderOnce(): void {
    this.callbacks.render?.(this.alpha, this.dt);
  }

  reset(): void {
    this.accumulator = 0;
    this.tickCount = 0;
  }
}
