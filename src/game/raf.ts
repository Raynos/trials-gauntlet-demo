import type { Game } from './game';
import type { KeyboardInput } from './input';

/** Drives the game from requestAnimationFrame in real browsers. */
export class RafDriver {
  private handle = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly game: Game,
    private readonly keyboard: KeyboardInput,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const elapsed = (now - this.last) / 1000;
      this.last = now;
      this.game.setInput(this.keyboard.read());
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
