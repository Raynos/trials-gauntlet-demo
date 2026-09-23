/**
 * `OnboardingCard`: the single first-launch card explaining gas / lean, dismissed once
 * (`rockhop.onboarded`). Shown over the first countdown with the game paused.
 *
 * A waiting build is adopted at the very start of the loading screen (src/boot/sw.ts); a build that
 * lands while the game is open lights the menu's update pill (src/ui/updatePill.ts), never a mid-run prompt.
 */
import type { InputDevice } from '../core/types';
import { BALANCE_HINT } from './garage';
import { conceal, reveal } from './live';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
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
    reveal(this.root);
  }

  setDevice(device: InputDevice): void {
    if (this.visible) this.lines.innerHTML = ONBOARD_LINES[device].map((l) => `<div>${l}</div>`).join('');
  }

  dismiss(): void {
    if (!this.visible) return;
    conceal(this.root);
    this.root.classList.remove('show');
    this.onDone();
  }
}
