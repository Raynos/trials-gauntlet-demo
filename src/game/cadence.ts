/**
 * Frame-cap cadence for the RAF loop (docs/plans/PERF.md §0 F4 / F6).
 *
 * The old rule — render when `now - lastRenderAt >= period - 2 ms` — was free-running: every rendered
 * frame re-based the clock on the RAF timestamp it happened to land on, so one frame that overran
 * (a 120 Hz RAF that fired a slot late, a GC) shifted the phase for good, and a 30 cap on a 60 Hz
 * display sat at 24–28 whenever a frame crossed the next slot by a hair.
 *
 * This one is phase-locked: a render is due at `nextDue`, and after each render `nextDue += period`
 * regardless of when the RAF actually fired, so a late frame is followed by an early one and the
 * long-run rate is exactly the cap. Slack = half the measured RAF interval (EMA), so a due time that
 * falls between two RAF slots takes the earlier one rather than the later (33.33 ms due, RAF at
 * 33.30: render). If the loop falls more than two periods behind (tab hidden, a long task) it
 * resyncs to `now` instead of bursting to catch up.
 */
export class FrameCadence {
  private nextDue = 0;
  private lastRaf = 0;
  /** EMA of the RAF interval (ms); starts at a 60 Hz guess. */
  rafIntervalMs = 1000 / 60;

  /** Called on every RAF with its timestamp and the cap; true = render this frame. */
  shouldRender(now: number, capHz: number): boolean {
    if (this.lastRaf) {
      const d = now - this.lastRaf;
      if (d > 0 && d < 100) this.rafIntervalMs += (d - this.rafIntervalMs) * 0.1;
    }
    this.lastRaf = now;
    const period = 1000 / capHz;
    if (!this.nextDue) {
      this.nextDue = now + period;
      return true;
    }
    const slack = Math.min(period * 0.45, this.rafIntervalMs * 0.5);
    if (now < this.nextDue - slack) return false;
    if (now - this.nextDue > 2 * period) this.nextDue = now + period; // far behind: resync, do not burst
    else this.nextDue += period;
    return true;
  }

  /** Forget the phase (cap change, resume from background). */
  reset(): void {
    this.nextDue = 0;
  }
}
