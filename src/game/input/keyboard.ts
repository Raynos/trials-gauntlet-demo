/**
 * Keyboard → InputFrame (CONTRACT §2.8): ↑/W throttle, ↓/S brake, ←/A lean
 * back, →/D lean forward, Enter/R/Backspace restart, Esc menu. No hop key.
 */
import type { InputFrame } from '../../core/types';
import { clearMeta, type InputSource, type MetaButtons } from './types';

const THROTTLE = ['ArrowUp', 'KeyW'];
const BRAKE = ['ArrowDown', 'KeyS'];
const BACK = ['ArrowLeft', 'KeyA'];
const FWD = ['ArrowRight', 'KeyD'];
const RESTART = ['Enter', 'KeyR', 'Backspace', 'NumpadEnter'];
const TRACKED = new Set([...THROTTLE, ...BRAKE, ...BACK, ...FWD, ...RESTART, 'Escape', 'Space', 'KeyV']);

export class KeyboardInput implements InputSource {
  readonly device = 'keyboard' as const;
  private readonly down = new Set<string>();
  private readonly meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false, alt: false };
  private readonly onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (TRACKED.has(e.code)) e.preventDefault();
    this.down.add(e.code);
    this.meta.active = true;
    if (e.code === 'Escape') this.meta.pause = true;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') this.meta.confirm = true;
    if (e.code === 'Backspace') this.meta.back = true;
    if (e.code === 'KeyV') this.meta.alt = true;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.meta.navX = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.meta.navX = 1;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.meta.navY = -1;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.meta.navY = 1;
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private any(codes: string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i]!)) return true;
    return false;
  }

  read(out: InputFrame): void {
    out.throttle = this.any(THROTTLE) ? 1 : 0;
    out.brake = this.any(BRAKE) ? 1 : 0;
    out.lean = (this.any(FWD) ? 1 : 0) - (this.any(BACK) ? 1 : 0);
    out.hop = false;
    out.restart = this.any(RESTART);
  }

  pollMeta(): MetaButtons {
    const m = { ...this.meta };
    clearMeta(this.meta);
    return m;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
