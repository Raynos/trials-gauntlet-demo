/**
 * `?trace=1` input trace: three thin bars under the HUD timer — throttle (amber), brake (red),
 * lean (bipolar, from the centre) — fed the InputFrame the world is being driven with every
 * rendered frame. For filming the phone: the viewer sees what the thumbs did. Widths change
 * only when the quantized value does.
 */
import type { InputFrame } from '../core/types';

export class TraceBars {
  readonly root: HTMLDivElement;
  private readonly t: HTMLDivElement;
  private readonly b: HTMLDivElement;
  private readonly l: HTMLDivElement;
  private lt = -1;
  private lb = -1;
  private ll = 2;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'trace';
    this.root.innerHTML = `<div class="tr-row"><b>GAS</b><div class="tr-bar"><i class="t"></i></div></div><div class="tr-row"><b>BRK</b><div class="tr-bar"><i class="b"></i></div></div><div class="tr-row"><b>LEAN</b><div class="tr-bar lean"><i class="l"></i><s></s></div></div>`;
    this.t = this.root.querySelector('.t') as HTMLDivElement;
    this.b = this.root.querySelector('.b') as HTMLDivElement;
    this.l = this.root.querySelector('.l') as HTMLDivElement;
    parent.appendChild(this.root);
  }

  update(f: Readonly<InputFrame>): void {
    if (f.throttle !== this.lt) {
      this.lt = f.throttle;
      this.t.style.width = `${(f.throttle * 100).toFixed(1)}%`;
    }
    if (f.brake !== this.lb) {
      this.lb = f.brake;
      this.b.style.width = `${(f.brake * 100).toFixed(1)}%`;
    }
    if (f.lean !== this.ll) {
      this.ll = f.lean;
      const w = Math.abs(f.lean) * 50;
      this.l.style.width = `${w.toFixed(1)}%`;
      this.l.style.left = f.lean < 0 ? `${(50 - w).toFixed(1)}%` : '50%';
      this.l.classList.toggle('back', f.lean < 0);
    }
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('show', on);
  }
}
