/**
 * Minimal real-time driver for a Game without the App shell (tests, embeds):
 * polls an InputMux and feeds elapsed seconds. The browser entry uses `App`.
 */
import type { Game } from './game';
import type { InputMux } from './input';

export class RafDriver {
  private handle = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly game: Game,
    private readonly mux: InputMux,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const elapsed = (now - this.last) / 1000;
      this.last = now;
      this.game.setInput(this.mux.poll().frame);
      this.game.advance(elapsed);
      this.handle = requestAnimationFrame(frame);
    };
    this.handle = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
