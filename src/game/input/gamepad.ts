/**
 * Gamepad API → InputFrame (standard mapping): RT (7) throttle, LT (6) brake,
 * left stick x (axis 0) lean with a rescaled deadzone, B/circle (1) restart,
 * Start (9) pause, A/cross (0) confirm. Face buttons also act as fallbacks
 * on pads whose triggers report as buttons without analog values.
 */
import type { InputFrame } from '../../core/types';
import { clearMeta, type InputSource, type MetaButtons } from './types';

const DEADZONE = 0.18;
const BTN_A = 0;
const BTN_B = 1;
const BTN_LT = 6;
const BTN_RT = 7;
const BTN_START = 9;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;
const NAV_THRESHOLD = 0.6;

export class GamepadInput implements InputSource {
  readonly device = 'gamepad' as const;
  private readonly meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false };
  private prevNavX = 0;
  private prevNavY = 0;
  private prevStart = false;
  private prevA = false;
  private prevB = false;
  private readonly nav: Navigator;

  constructor(nav: Navigator = navigator) {
    this.nav = nav;
  }

  /** First connected pad with the standard mapping (or any, as a fallback). */
  private pad(): Gamepad | null {
    if (typeof this.nav.getGamepads !== 'function') return null;
    const pads = this.nav.getGamepads();
    let fallback: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      fallback ??= p;
    }
    return fallback;
  }

  read(out: InputFrame): void {
    const p = this.pad();
    if (!p) {
      out.throttle = out.brake = out.lean = 0;
      out.hop = false;
      out.restart = false;
      return;
    }
    const rt = button(p, BTN_RT);
    const lt = button(p, BTN_LT);
    const x = p.axes[0] ?? 0;
    let lean = Math.abs(x) < DEADZONE ? 0 : (Math.sign(x) * (Math.abs(x) - DEADZONE)) / (1 - DEADZONE);
    if (lean === 0) lean = (pressed(p, DPAD_RIGHT) ? 1 : 0) - (pressed(p, DPAD_LEFT) ? 1 : 0);
    out.throttle = rt;
    out.brake = lt;
    out.lean = Math.max(-1, Math.min(1, lean));
    out.hop = false;
    const b = pressed(p, BTN_B);
    out.restart = b;

    const start = pressed(p, BTN_START);
    const a = pressed(p, BTN_A);
    if (start && !this.prevStart) this.meta.pause = true;
    if (a && !this.prevA) this.meta.confirm = true;
    if (b && !this.prevB) this.meta.back = true;
    if (rt > 0.05 || lt > 0.05 || lean !== 0 || b || a || start) this.meta.active = true;
    // Menu navigation edges from d-pad or left stick.
    const y = p.axes[1] ?? 0;
    const navX = pressed(p, DPAD_RIGHT) || x > NAV_THRESHOLD ? 1 : pressed(p, DPAD_LEFT) || x < -NAV_THRESHOLD ? -1 : 0;
    const navY = pressed(p, DPAD_DOWN) || y > NAV_THRESHOLD ? 1 : pressed(p, DPAD_UP) || y < -NAV_THRESHOLD ? -1 : 0;
    if (navX !== 0 && navX !== this.prevNavX) this.meta.navX = navX;
    if (navY !== 0 && navY !== this.prevNavY) this.meta.navY = navY;
    if (navX || navY) this.meta.active = true;
    this.prevNavX = navX;
    this.prevNavY = navY;
    this.prevStart = start;
    this.prevA = a;
    this.prevB = b;
  }

  pollMeta(): MetaButtons {
    const m = { ...this.meta };
    clearMeta(this.meta);
    return m;
  }

  dispose(): void {}
}

function button(p: Gamepad, i: number): number {
  const b = p.buttons[i];
  if (!b) return 0;
  const v = typeof b.value === 'number' ? b.value : b.pressed ? 1 : 0;
  return v < 0.02 ? 0 : v > 1 ? 1 : v;
}

function pressed(p: Gamepad, i: number): boolean {
  const b = p.buttons[i];
  return b ? b.pressed || b.value > 0.5 : false;
}
