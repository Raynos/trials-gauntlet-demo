// @vitest-environment jsdom
/**
 * iOS-style touch lifecycle for TouchInput: Safari ends touches with
 * pointercancel / touchcancel / lostpointercapture (not pointerup) whenever it
 * claims the gesture. Every one of those must release the zone within one
 * read(), and a watchdog must catch the case where no end event arrives at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT, type InputFrame } from '../../core/types';
import { resetLive, tickLive } from '../../ui/live';
import { _setOrientationForTest, toLogical, toPhysical } from '../../ui/orientation';
import { TouchInput } from './touch';

// jsdom has no PointerEvent / TouchEvent; minimal stand-ins carrying the fields TouchInput reads.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerId: number; pointerType?: string }) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId;
    this.pointerType = init.pointerType ?? 'touch';
  }
}
class FakeTouchEvent extends Event {
  touches: { length: number };
  constructor(type: string, fingers: number) {
    super(type, { bubbles: true, cancelable: true });
    this.touches = { length: fingers };
  }
}

let clock = 0;
const now = (): number => clock;
const inputs: TouchInput[] = [];

function setup(): { t: TouchInput; frame: () => InputFrame; root: HTMLElement } {
  document.body.innerHTML = '<div id="ui"></div>';
  const ui = document.getElementById('ui')!;
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
  const t = new TouchInput(ui, { now });
  inputs.push(t);
  // jsdom has no layout: give the layer a size and put the buttons off to the corners.
  Object.defineProperty(t.root, 'clientWidth', { value: 1000, configurable: true });
  Object.defineProperty(t.root, 'clientHeight', { value: 500, configurable: true });
  for (const b of t.root.querySelectorAll<HTMLElement>('.tz-btn')) {
    b.getBoundingClientRect = () => ({ left: -100, right: -50, top: -100, bottom: -50, width: 50, height: 50, x: -100, y: -100, toJSON: () => ({}) });
  }
  (t.root as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
  (t.root as unknown as { hasPointerCapture: (id: number) => boolean }).hasPointerCapture = () => true;
  t.setEnabled(true);
  const out: InputFrame = { ...NEUTRAL_INPUT };
  return {
    t,
    root: t.root,
    frame: () => {
      t.read(out);
      return out;
    },
  };
}

const down = (root: HTMLElement, id: number, x: number, y: number, pointerType = 'touch'): void => {
  root.dispatchEvent(new FakePointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, buttons: 1, pointerType }));
};
const move = (root: HTMLElement, id: number, x: number, y: number): void => {
  root.dispatchEvent(new FakePointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, buttons: 1 }));
};

beforeEach(() => {
  clock = 0;
});

afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose();
  resetLive();
});

function restartSetup(): ReturnType<typeof setup> {
  const fixture = setup();
  const { t, root } = fixture;
  const restart = root.querySelector<HTMLElement>('.tz-restart')!;
  restart.getBoundingClientRect = () => ({ left: 900, right: 980, top: 10, bottom: 70, width: 80, height: 60, x: 900, y: 10, toJSON: () => ({}) });
  // Drive the real button reveal gate; jsdom does not supply default opacity.
  for (const el of [root.parentElement!, root, ...root.querySelectorAll<HTMLElement>('.tz-btn')]) el.style.opacity = '1';
  t.setVisible(true);
  tickLive(0);
  tickLive(150);
  expect(root.classList.contains('live')).toBe(true);
  return fixture;
}

const restartUp = (root: HTMLElement, type = 'pointerup'): void => {
  root.dispatchEvent(new FakePointerEvent(type, { pointerId: 1, clientX: 940, clientY: 40 }));
};

describe('restart taps between game frames', () => {
  it('delivers one completed fast tap even when no read occurred while held', () => {
    const { root, frame } = restartSetup();
    down(root, 1, 940, 40);
    restartUp(root);
    restartUp(root, 'lostpointercapture'); // Normal implicit capture release after UP.
    expect(frame().restart).toBe(true);
    expect(frame().restart).toBe(false);
    expect(frame().throttle).toBe(0);
  });

  it('keeps restart held for the app’s long-hold threshold without firing again on release', () => {
    const { root, frame } = restartSetup();
    down(root, 1, 940, 40);
    root.dispatchEvent(new FakeTouchEvent('touchstart', 1));
    for (clock = 0; clock <= 1500; clock += 100) expect(frame().restart).toBe(true);
    restartUp(root);
    root.dispatchEvent(new FakeTouchEvent('touchend', 0));
    expect(frame().restart).toBe(false);
    expect(frame().restart).toBe(false);
  });

  it.each(['raw-first', 'pointer-first', 'read-before-raw'] as const)('does not lose or double a fast tap with %s release ordering', (order) => {
    const { root, frame } = restartSetup();
    down(root, 1, 940, 40);
    const rawEnd = (): void => { root.dispatchEvent(new FakeTouchEvent('touchend', 0)); };
    if (order === 'raw-first') rawEnd();
    restartUp(root);
    if (order === 'read-before-raw') expect(frame().restart).toBe(true);
    if (order !== 'raw-first') rawEnd();
    if (order !== 'read-before-raw') expect(frame().restart).toBe(true);
    restartUp(root); // A duplicate end has no live pointer to complete.
    expect(frame().restart).toBe(false);
  });

  it.each(['pointercancel', 'lostpointercapture', 'touchcancel', 'slide-off', 'up-outside'] as const)('does not queue a restart after %s', (cancel) => {
    const { root, frame } = restartSetup();
    down(root, 1, 940, 40);
    if (cancel === 'touchcancel') root.dispatchEvent(new FakeTouchEvent('touchcancel', 0));
    else if (cancel === 'slide-off') {
      move(root, 1, 940, 200);
      move(root, 1, 940, 40); // Returning to the button cannot revive a cancelled press.
    } else if (cancel === 'up-outside') root.dispatchEvent(new FakePointerEvent('pointerup', { pointerId: 1, clientX: 940, clientY: 200 }));
    else restartUp(root, cancel);
    restartUp(root);
    root.dispatchEvent(new FakeTouchEvent('touchend', 0));
    expect(frame().restart).toBe(false);
    expect(frame().throttle).toBe(0);
  });

  it.each(['reset', 'blur', 'pagehide', 'disabled', 'overlay', 'hidden-controls'] as const)('clears an already completed unread tap on %s even with no active pointers', (interruption) => {
    const { t, root, frame } = restartSetup();
    down(root, 1, 940, 40);
    restartUp(root);
    expect(t.activePointers).toBe(0);
    if (interruption === 'reset') t.reset();
    else if (interruption === 'disabled') t.setEnabled(false);
    else if (interruption === 'overlay') t.setOverlay(true);
    else if (interruption === 'hidden-controls') t.setVisible(false);
    else window.dispatchEvent(new Event(interruption));
    root.dispatchEvent(new FakeTouchEvent('touchend', 0));
    expect(frame().restart).toBe(false);
    expect(frame().restart).toBe(false);
  });

  it('ignores new pointers under an overlay and clears a held restart on reset', () => {
    const { t, root, frame } = restartSetup();
    down(root, 1, 940, 40);
    t.reset();
    restartUp(root);
    expect(frame().restart).toBe(false);
    t.setOverlay(true);
    down(root, 1, 940, 40);
    restartUp(root);
    expect(frame().restart).toBe(false);
    expect(frame().throttle).toBe(0);
  });
});

describe('TouchInput lifecycle (iOS Safari semantics)', () => {
  it('holds throttle while the finger is down and releases on pointerup', () => {
    const { root, frame } = setup();
    down(root, 1, 900, 300);
    expect(frame().throttle).toBe(1);
    root.dispatchEvent(new FakePointerEvent('pointerup', { pointerId: 1, clientX: 900, clientY: 300 }));
    expect(frame().throttle).toBe(0);
  });

  it('tap-and-hold throttle → pointercancel releases within one read()', () => {
    const { root, frame } = setup();
    down(root, 7, 900, 300);
    expect(frame().throttle).toBe(1);
    root.dispatchEvent(new FakePointerEvent('pointercancel', { pointerId: 7 }));
    expect(frame().throttle).toBe(0);
  });

  it('lostpointercapture alone releases too', () => {
    const { root, frame } = setup();
    down(root, 3, 900, 300);
    root.dispatchEvent(new FakePointerEvent('lostpointercapture', { pointerId: 3 }));
    expect(frame().throttle).toBe(0);
  });

  it('two fingers down (throttle + lean back), one cancelled: only that zone releases', () => {
    const { root, frame, t } = setup();
    down(root, 1, 900, 300);
    down(root, 2, 100, 300);
    let f = frame();
    expect(f.throttle).toBe(1);
    expect(f.lean).toBe(-1);
    root.dispatchEvent(new FakePointerEvent('pointercancel', { pointerId: 2 }));
    f = frame();
    expect(f.throttle).toBe(1);
    expect(f.lean).toBe(0);
    expect(t.activePointers).toBe(1);
    root.dispatchEvent(new FakeTouchEvent('touchend', 0)); // last finger lifted per the raw stream
    expect(frame().throttle).toBe(0);
  });

  it('GAS held, then LEAN: Safari fires gesturestart for the second finger — nothing releases (multi-touch P0)', () => {
    const { root, frame, t } = setup();
    down(root, 1, 900, 300); // GAS
    root.dispatchEvent(new FakeTouchEvent('touchstart', 1));
    expect(frame().throttle).toBe(1);
    down(root, 2, 100, 300); // LEAN back, second finger
    root.dispatchEvent(new FakeTouchEvent('touchstart', 2));
    const g = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(g);
    expect(g.defaultPrevented).toBe(true);
    document.dispatchEvent(new Event('gesturechange', { bubbles: true, cancelable: true }));
    let f = frame();
    expect(f.throttle).toBe(1);
    expect(f.lean).toBe(-1);
    expect(t.activePointers).toBe(2);
    expect(t.releaseLog.count).toBe(0);
    // Slide the lean finger across to lean-forward while GAS stays down.
    move(root, 2, 400, 300);
    f = frame();
    expect(f.throttle).toBe(1);
    expect(f.lean).toBe(1);
    // Lift only the lean finger (one finger still on the glass).
    root.dispatchEvent(new FakePointerEvent('pointerup', { pointerId: 2, clientX: 400, clientY: 300 }));
    root.dispatchEvent(new FakeTouchEvent('touchend', 1));
    f = frame();
    expect(f.throttle).toBe(1);
    expect(f.lean).toBe(0);
    // Brake + lean and a third finger: ignored gracefully (it just lands in a zone).
    down(root, 3, 600, 300);
    down(root, 4, 100, 300);
    f = frame();
    expect(f.throttle).toBe(1);
    expect(f.brake).toBe(1);
    expect(f.lean).toBe(-1);
  });

  it('forced landscape: physical (portrait) touch points map onto the logical halves', () => {
    const { root, frame } = setup();
    // Portrait phone 390×844 rotated: logical layer is 844×390 (setup gave 1000×500; override).
    Object.defineProperty(root, 'clientWidth', { value: 844, configurable: true });
    Object.defineProperty(root, 'clientHeight', { value: 390, configurable: true });
    _setOrientationForTest({ forced: true, physW: 390, physH: 844 });
    try {
      // Logical GAS zone centre (x=760,y=200) ↔ physical (390-200, 760) = (190, 760): near the home indicator.
      const gas = toPhysical(760, 200);
      expect(gas).toEqual({ x: 190, y: 760 });
      expect(toLogical(gas.x, gas.y)).toEqual({ x: 760, y: 200 });
      down(root, 1, gas.x, gas.y);
      expect(frame().throttle).toBe(1);
      // Logical lean-back centre (x=100, y=200) ↔ physical (190, 100): near the notch.
      const back = toPhysical(100, 200);
      down(root, 2, back.x, back.y);
      const f = frame();
      expect(f.throttle).toBe(1);
      expect(f.lean).toBe(-1);
    } finally {
      _setOrientationForTest({ forced: false, physW: 0, physH: 0 });
    }
  });

  it('raw touchcancel with zero fingers releases everything even without pointer events', () => {
    const { root, frame } = setup();
    down(root, 1, 900, 300);
    down(root, 2, 600, 300);
    root.dispatchEvent(new FakeTouchEvent('touchcancel', 0));
    const f = frame();
    expect(f.throttle).toBe(0);
    expect(f.brake).toBe(0);
  });

  it('hold + visibilitychange (hidden) releases; blur and pagehide too', () => {
    const { root, frame } = setup();
    down(root, 1, 900, 300);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frame().throttle).toBe(0);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    down(root, 2, 900, 300);
    window.dispatchEvent(new Event('blur'));
    expect(frame().throttle).toBe(0);
    down(root, 3, 900, 300);
    window.dispatchEvent(new Event('pagehide'));
    expect(frame().throttle).toBe(0);
  });

  it('watchdog: a touch pointer "held" > 400 ms after the raw stream saw the last finger lift is released', () => {
    const { root, frame } = setup();
    root.dispatchEvent(new FakeTouchEvent('touchstart', 1));
    down(root, 1, 900, 300);
    clock = 100;
    // Safari drops the pointerup but the raw touchend still says 0 fingers... except the
    // raw event is ALSO lost here: simulate a touchmove that reported 0 fingers earlier.
    root.dispatchEvent(new FakeTouchEvent('touchmove', 0));
    clock = 300;
    expect(frame().throttle).toBe(1); // < 400 ms: still trusted
    clock = 600;
    expect(frame().throttle).toBe(0); // watchdog fired
  });

  it('a finger sliding from throttle into brake swaps cleanly; from lean-back into lean-forward too', () => {
    const { root, frame } = setup();
    down(root, 1, 900, 300);
    expect(frame().throttle).toBe(1);
    move(root, 1, 600, 300);
    let f = frame();
    expect(f.throttle).toBe(0);
    expect(f.brake).toBe(1);
    move(root, 1, 100, 300); // cannot cross into the other half
    f = frame();
    expect(f.brake).toBe(1);
    expect(f.lean).toBe(0);
    down(root, 2, 100, 300);
    expect(frame().lean).toBe(-1);
    move(root, 2, 400, 300);
    expect(frame().lean).toBe(1);
  });

  it('disabling the layer (menu open) releases everything and ignores new touches', () => {
    const { root, frame, t } = setup();
    down(root, 1, 900, 300);
    t.setEnabled(false);
    expect(frame().throttle).toBe(0);
    down(root, 2, 900, 300);
    expect(frame().throttle).toBe(0);
  });
});
