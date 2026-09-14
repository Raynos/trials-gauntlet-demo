// @vitest-environment jsdom
/**
 * iOS-style touch lifecycle for TouchInput: Safari ends touches with
 * pointercancel / touchcancel / lostpointercapture (not pointerup) whenever it
 * claims the gesture. Every one of those must release the zone within one
 * read(), and a watchdog must catch the case where no end event arrives at all.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT, type InputFrame } from '../../core/types';
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

function setup(): { t: TouchInput; frame: () => InputFrame; root: HTMLElement } {
  document.body.innerHTML = '<div id="ui"></div>';
  const ui = document.getElementById('ui')!;
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
  const t = new TouchInput(ui, { now });
  // jsdom has no layout: give the layer a size and put the buttons off to the corners.
  Object.defineProperty(t.root, 'clientWidth', { value: 1000 });
  Object.defineProperty(t.root, 'clientHeight', { value: 500 });
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
