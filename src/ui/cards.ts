/**
 * Two one-shot cards in the front-end language:
 *  - `UpdateToast`: "Update available → Reload" when the service worker has a new build waiting
 *    (the standalone-PWA reload problem: no browser chrome, no other way to pick it up).
 *  - `OnboardingCard`: the single first-launch card explaining gas / lean, dismissed once
 *    (`trials.onboarded`). Shown over the first countdown with the game paused.
 */
import type { InputDevice } from '../core/types';
import { BALANCE_HINT } from './garage';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class UpdateToast {
  readonly root: HTMLDivElement;
  private readonly btn: HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly onReload: () => void) {
    this.root = h('div', 'toast');
    this.root.innerHTML = `<span class="toast-dot"></span><span class="toast-text"><b>Update available</b><small>A newer build is ready</small></span><button type="button" class="btn primary">⟳ Reload</button>`;
    this.btn = this.root.querySelector('button') as HTMLButtonElement;
    this.btn.addEventListener('click', () => this.reload());
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  show(): void {
    this.root.classList.add('show');
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  reload(): void {
    this.btn.textContent = 'Reloading…';
    this.onReload();
  }
}

const ONBOARD_LINES: Record<InputDevice, string[]> = {
  keyboard: ['<kbd>↑</kbd> or <kbd>W</kbd> gas · <kbd>↓</kbd> <kbd>S</kbd> brake', '<kbd>←</kbd> <kbd>→</kbd> lean back / forward — keep the front wheel where you want it', '<kbd>R</kbd> tap: back to the checkpoint · hold: restart the track'],
  gamepad: ['<b>RT</b> gas · <b>LT</b> brake', '<b>Left stick</b> lean back / forward — keep the front wheel where you want it', '<b>B</b> tap: back to the checkpoint · hold: restart the track'],
  touch: ['<b>Right half</b>: gas on the right, brake on the left', '<b>Left half</b>: lean back / forward — keep the front wheel where you want it', '<b>↻ top-right</b> tap: back to the checkpoint · hold: restart the track'],
};

export class OnboardingCard {
  readonly root: HTMLDivElement;
  private readonly lines: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly onDone: () => void) {
    this.root = h('div', 'onboard');
    this.root.innerHTML = `<div class="ob-card rise"><div class="kicker">First ride</div><h2>Gas, brake, lean.</h2><div class="ob-lines"></div><div class="ob-hop">There is no hop button: lean back on the gas, then snap forward.</div><div class="ob-tip">${BALANCE_HINT}</div><button type="button" class="btn primary">Got it · Ride</button></div>`;
    this.lines = this.root.querySelector('.ob-lines') as HTMLDivElement;
    this.root.querySelector('button')!.addEventListener('click', () => this.dismiss());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.dismiss();
    });
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  show(device: InputDevice | null): void {
    this.lines.innerHTML = ONBOARD_LINES[device ?? 'keyboard'].map((l) => `<div>${l}</div>`).join('');
    this.root.classList.add('show');
  }

  setDevice(device: InputDevice): void {
    if (this.visible) this.lines.innerHTML = ONBOARD_LINES[device].map((l) => `<div>${l}</div>`).join('');
  }

  dismiss(): void {
    if (!this.visible) return;
    this.root.classList.remove('show');
    this.onDone();
  }
}
