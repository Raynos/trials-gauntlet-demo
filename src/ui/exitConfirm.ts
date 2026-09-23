/**
 * "Exit ROCKHOP?" (store release Phase 5, Android system back on the home screen): a small cream card over the home
 * screen, STAY focused, EXIT calls the platform's `exitApp()`. A second back press closes it. It follows the touch
 * invariant (src/ui/live.ts): nothing takes a pointer until it has been drawn for the invariant's delay.
 */
import { conceal, reveal } from './live';
import { GAME_TITLE } from './brand';

export class ExitConfirm {
  readonly root: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, private readonly onExit: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'exit-confirm';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.innerHTML = `<div class="xc-card"><h2>Exit ${GAME_TITLE}?</h2><p>Your times and medals are saved on this device.</p><div class="xc-btns"><button type="button" class="xc-stay">Stay</button><button type="button" class="xc-exit">Exit</button></div></div>`;
    this.root.querySelector('.xc-stay')!.addEventListener('click', () => this.hide());
    this.root.querySelector('.xc-exit')!.addEventListener('click', () => {
      this.hide();
      this.onExit();
    });
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.root.classList.add('show');
    reveal(this.root);
    this.root.querySelector<HTMLButtonElement>('.xc-stay')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.open = false;
    conceal(this.root);
    this.root.classList.remove('show');
  }
}
