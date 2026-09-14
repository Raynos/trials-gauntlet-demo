/**
 * Keyboard → InputFrame for live play. Gamepad support lands with the real
 * input pass; this exists so the scaffold is playable in a real browser.
 */
import type { InputFrame } from '../core/types';
import { NEUTRAL_INPUT } from '../core/types';

export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.down.add(e.code);
    if (TRACKED.has(e.code)) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
  }

  read(): InputFrame {
    const d = this.down;
    const lean = (d.has('ArrowRight') || d.has('KeyD') ? 1 : 0) - (d.has('ArrowLeft') || d.has('KeyA') ? 1 : 0);
    return {
      ...NEUTRAL_INPUT,
      throttle: d.has('ArrowUp') || d.has('KeyW') ? 1 : 0,
      brake: d.has('ArrowDown') || d.has('KeyS') ? 1 : 0,
      lean,
      hop: d.has('Space'),
      restart: d.has('KeyR') || d.has('Backspace'),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
  }
}

const TRACKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'Backspace']);
