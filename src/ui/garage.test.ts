// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtManifest } from './art';
import type { RiderOutfit } from '../core/types';
import { GARAGE_VIEW, GarageScreen, type GarageCallbacks, type GarageView } from './garage';
import { LIVE_DELAY_MS, resetLive, setLiveClock, tickLive } from './live';
import type { UiSfx } from './sfx';

let now = 0;
beforeEach(() => {
  now = 0;
  setLiveClock(() => now);
  document.head.innerHTML = '<style>* { opacity: 1; } .garage-screen { opacity: 0; visibility: hidden; } .garage-screen.show { opacity: 1; visibility: visible; }</style>';
});
afterEach(() => {
  resetLive();
  setLiveClock(() => performance.now());
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function fixture() {
  const cb = { setBike: vi.fn(), setOutfit: vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockResolvedValue(true), back: vi.fn() };
  const sfx = { tick: vi.fn(), confirm: vi.fn(), back: vi.fn() };
  const art = { whenReady: () => undefined } as unknown as ArtManifest;
  const garage = new GarageScreen(document.body, sfx as unknown as UiSfx, art, cb);
  const outfit = (name: string) => garage.root.querySelector<HTMLButtonElement>(`button[data-outfit="${name}"]`)!;
  const bike = (name: string) => garage.root.querySelector<HTMLButtonElement>(`button[data-bike="${name}"]`)!;
  const hover = (el: HTMLElement, pointerType = 'mouse') => {
    const e = new MouseEvent('pointerenter', { bubbles: false }) as MouseEvent & { pointerType: string };
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    el.dispatchEvent(e);
  };
  const makeLive = () => {
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(garage.root.classList.contains('live')).toBe(true);
  };
  return { garage, cb, outfit, bike, hover, makeLive };
}

describe('garage rider outfits', () => {
  it('offers all five designs; the pointer highlights one without committing (ask 32: no key rows)', () => {
    const { garage, outfit, cb, hover, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    expect(outfit('street-openface').disabled).toBe(false);
    for (const id of ['street-openface', 'race-bluewhite', 'street-charcoal', 'race-charcoalyellow', 'street-mustard']) {
      hover(outfit(id));
      expect(garage.root.querySelector('[data-outfit].on')).toBe(outfit(id));
    }
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect('nav' in garage).toBe(false);
    expect('confirm' in garage).toBe(false);
  });
  it('exposes both named choices and the current selection separately from bike class', () => {
    const { garage, outfit, bike } = fixture();
    garage.show('pro', 'race-bluewhite');
    expect(garage.root.querySelector('[role="group"][aria-label="Rider outfit"]')).not.toBeNull();
    expect(outfit('street-mustard').title).toBe('Mustard · barehead — Hoodie, jeans & trainers');
    expect(outfit('street-mustard').textContent).toContain('Mustard');
    expect(outfit('street-mustard').textContent).toContain('barehead');
    expect(outfit('race-bluewhite').textContent).toContain('Blue & white');
    expect(outfit('street-mustard').type).toBe('button');
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('false');
    expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true');
    expect(bike('pro').getAttribute('aria-pressed')).toBe('true');
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Blue & white · Race selected');
  });

  it('commits a touch/click choice once through the outfit callback without changing the bike', async () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('pro', 'street-mustard');
    makeLive();
    // Touch produces a click; hover must not be necessary for correct selection.
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
    expect(cb.setBike).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true'));
    expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the selected outfit during failure and supports an explicit retry', async () => {
    const { garage, outfit, cb, makeLive } = fixture();
    let finish!: (ok: boolean) => void;
    cb.setOutfit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    garage.show('rookie', 'street-mustard');
    makeLive();
    outfit('race-bluewhite').click();
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).toHaveBeenCalledTimes(1);
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    expect(outfit('race-bluewhite').getAttribute('aria-busy')).toBe('true');
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Loading Blue & white · Race…');
    finish(false);
    await vi.waitFor(() => expect(garage.root.querySelector('[role="status"]')?.textContent).toContain('Select it to retry'));
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    outfit('race-bluewhite').click();
    await vi.waitFor(() => expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true'));
    expect(cb.setOutfit).toHaveBeenCalledTimes(2);
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Blue & white · Race selected');
  });

  it('ignores an older result after the player selects another outfit', async () => {
    const { garage, outfit, cb, makeLive } = fixture();
    let finish!: (ok: boolean) => void;
    cb.setOutfit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    garage.show('rookie', 'street-mustard');
    makeLive();
    outfit('race-bluewhite').click();
    outfit('street-mustard').click();
    await vi.waitFor(() => expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Mustard · barehead selected'));
    finish(true);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    expect(outfit('race-bluewhite').getAttribute('aria-busy')).toBe('false');
  });

  it('a bike chip under the pointer only highlights (ask 40): the sheet and the hero change on click', () => {
    const { garage, bike, cb, hover, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    hover(bike('pro'));
    expect(bike('pro').classList.contains('on')).toBe(true);
    expect(bike('rookie').getAttribute('aria-pressed')).toBe('true'); // still the committed class
    expect(garage.root.querySelector('.gp-name b')?.textContent).toBe('Rookie'); // the sheet did not move
    expect(cb.setBike).not.toHaveBeenCalled();
    bike('pro').dispatchEvent(new MouseEvent('pointerleave'));
    expect(bike('rookie').classList.contains('on')).toBe(true); // the highlight returns to the chosen chip
    bike('pro').click();
    expect(cb.setBike).toHaveBeenCalledExactlyOnceWith('pro');
    expect(garage.root.querySelector('.gp-name b')?.textContent).toBe('Pro');
    garage.back();
    expect(cb.back).toHaveBeenCalledTimes(1);
  });

  it('a click commits the bike; the legend names only the way out', () => {
    const { garage, bike, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    bike('pro').click();
    expect(cb.setBike).toHaveBeenCalledExactlyOnceWith('pro');
    expect(bike('pro').getAttribute('aria-pressed')).toBe('true');
    garage.setDevice('keyboard');
    expect(garage.root.querySelector('.legend')?.textContent).toBe('EscBack');
    garage.setDevice('gamepad');
    expect(garage.root.querySelector('.legend')?.textContent).toBe('BBack');
    garage.root.querySelector<HTMLButtonElement>('.backbtn')!.click();
    expect(cb.back).toHaveBeenCalledTimes(1);
  });

  it('native focus (Tab) commits nothing before or after the live gate', () => {
    const { garage, outfit, bike, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').focus();
    bike('pro').focus();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    makeLive();
    outfit('race-bluewhite').focus();
    bike('pro').focus();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(cb.setBike).not.toHaveBeenCalled();
  });

  it('rejects input until drawn long enough, after hiding, and during a new reveal', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    outfit('race-bluewhite').click();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').click();
    garage.back();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(cb.setBike).not.toHaveBeenCalled();
    expect(cb.back).not.toHaveBeenCalled();
    makeLive();
    garage.hide();
    expect(garage.root.inert).toBe(true);
    expect(garage.root.getAttribute('aria-hidden')).toBe('true');
    outfit('race-bluewhite').click();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    makeLive();
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
  });
});

/** Garage round: the model explorer (stage / orbit callbacks, drag / pinch / wheel). */
function explorer() {
  const orbit = vi.fn<(view: GarageView | null) => void>();
  const stage = vi.fn<(on: boolean) => void>();
  const cb: GarageCallbacks = {
    setBike: vi.fn(),
    setOutfit: vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockResolvedValue(true),
    back: vi.fn(),
    stage,
    orbit,
  };
  const sfx = { tick: vi.fn(), confirm: vi.fn(), back: vi.fn() };
  const garage = new GarageScreen(document.body, sfx as unknown as UiSfx, { whenReady: () => undefined } as unknown as ArtManifest, cb);
  const makeLive = () => {
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
  };
  const pointer = (type: string, id: number, x: number, y: number, pointerType = 'touch') => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }) as MouseEvent & { pointerId: number; pointerType: string };
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    garage.stage.dispatchEvent(e);
  };
  return { garage, cb, orbit, stage, pointer, makeLive };
}

describe('garage model explorer', () => {
  it('stages the hero and opens on the default orbit; hiding releases both', () => {
    const { garage, orbit, stage } = explorer();
    expect(stage).not.toHaveBeenCalled();
    garage.show('rookie', 'street-mustard');
    expect(stage).toHaveBeenCalledExactlyOnceWith(true);
    expect(orbit).toHaveBeenLastCalledWith({ yaw: GARAGE_VIEW.yaw, pitch: GARAGE_VIEW.pitch, dist: GARAGE_VIEW.dist, screenX: GARAGE_VIEW.screenX, screenY: GARAGE_VIEW.screenY });
    garage.hide();
    expect(orbit).toHaveBeenLastCalledWith(null);
    expect(stage).toHaveBeenLastCalledWith(false);
    expect(stage).toHaveBeenCalledTimes(2);
    garage.hide(); // idempotent: every screen switch hides every screen
    expect(stage).toHaveBeenCalledTimes(2);
  });

  it('drag rotates (right drag turns the model to the right), vertical drag pitches within limits, wheel zooms within limits', () => {
    const { garage, orbit, pointer, makeLive } = explorer();
    garage.show('rookie', 'street-mustard');
    makeLive();
    orbit.mockClear();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 164, 100);
    const v1 = orbit.mock.lastCall![0]!;
    expect(v1.yaw).toBeCloseTo(GARAGE_VIEW.yaw - 64 * GARAGE_VIEW.yawPerPx, 6);
    pointer('pointermove', 1, 164, 1100); // far past the pitch clamp
    expect(orbit.mock.lastCall![0]!.pitch).toBe(GARAGE_VIEW.pitchMax);
    pointer('pointerup', 1, 164, 1100);
    expect(garage.currentView().yaw).toBeCloseTo(v1.yaw, 6);
    // Wheel: zoom in then far out, clamped to the distance band.
    garage.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(orbit.mock.lastCall![0]!.dist).toBeLessThan(GARAGE_VIEW.dist);
    for (let i = 0; i < 40; i++) garage.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
    expect(orbit.mock.lastCall![0]!.dist).toBe(GARAGE_VIEW.distMax);
    expect(garage.root.querySelector('.garage-hint')!.classList.contains('used')).toBe(true);
  });

  it('two-finger pinch zooms by the span ratio and never rotates', () => {
    const { garage, orbit, pointer, makeLive } = explorer();
    garage.show('rookie', 'street-mustard');
    makeLive();
    const yaw0 = garage.currentView().yaw;
    pointer('pointerdown', 1, 100, 200);
    pointer('pointerdown', 2, 300, 200); // span 200
    pointer('pointermove', 2, 500, 200); // span 400 → half the distance
    expect(orbit.mock.lastCall![0]!.dist).toBeCloseTo(Math.max(GARAGE_VIEW.distMin, GARAGE_VIEW.dist / 2), 6);
    expect(garage.currentView().yaw).toBe(yaw0);
    pointer('pointerup', 2, 500, 200);
    pointer('pointerup', 1, 100, 200);
  });

  it('ignores gestures before the screen is live and after it hides', () => {
    const { garage, orbit, pointer } = explorer();
    garage.show('rookie', 'street-mustard');
    orbit.mockClear();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 200, 100);
    pointer('pointerup', 1, 200, 100);
    garage.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(orbit).not.toHaveBeenCalled();
  });

  it('carries no rider-model row (asks 30 / 31): the rail is outfit then bike, the sheet has no rider line', () => {
    const { garage } = explorer();
    garage.show('rookie', 'street-mustard');
    expect(garage.root.querySelector('[data-model]')).toBeNull();
    expect([...garage.root.querySelectorAll<HTMLElement>('.rail-group')].map((g) => g.dataset['group'])).toEqual(['outfit', 'bike']);
    expect([...garage.root.querySelectorAll('.gp-kv span')].map((e) => e.textContent)).toEqual(['Outfit']);
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Mustard · barehead selected');
  });
});
