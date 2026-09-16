// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtManifest } from './art';
import type { RiderOutfit } from '../core/types';
import { GARAGE_VIEW, GarageScreen, type GarageCallbacks, type GarageView } from './garage';
import type { ModelChoice } from './best';
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
  const cb = { previewBike: vi.fn(), setBike: vi.fn(), setOutfit: vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockResolvedValue(true), back: vi.fn() };
  const sfx = { tick: vi.fn(), confirm: vi.fn(), back: vi.fn() };
  const art = { whenReady: () => undefined } as unknown as ArtManifest;
  const garage = new GarageScreen(document.body, sfx as unknown as UiSfx, art, cb);
  const outfit = (name: string) => garage.root.querySelector<HTMLButtonElement>(`button[data-outfit="${name}"]`)!;
  const bike = (name: string) => garage.root.querySelector<HTMLButtonElement>(`button[data-bike="${name}"]`)!;
  const makeLive = () => {
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(garage.root.classList.contains('live')).toBe(true);
  };
  return { garage, cb, outfit, bike, makeLive };
}

describe('garage rider outfits', () => {
  it('navigates all five independently selectable designs', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    expect(outfit('street-openface').disabled).toBe(false);
    outfit('street-mustard').focus();
    for (const id of ['street-openface', 'race-bluewhite', 'street-charcoal', 'race-charcoalyellow', 'street-mustard']) {
      garage.nav(1, 0);
      expect(document.activeElement).toBe(outfit(id));
    }
    garage.nav(-1, 0);
    expect(document.activeElement).toBe(outfit('race-charcoalyellow'));
    expect(cb.setOutfit).not.toHaveBeenCalled();
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
    expect(cb.previewBike).not.toHaveBeenCalled();
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

  it('shares directional and confirm navigation for keyboard/gamepad without committing focus', () => {
    const { garage, outfit, bike, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    garage.setDevice('gamepad');
    garage.nav(0, -1); // up the rail: bike (lowest) → outfit
    expect(document.activeElement).toBe(outfit('street-mustard'));
    garage.nav(1, 0);
    expect(document.activeElement).toBe(outfit('street-openface'));
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('street-openface');
    garage.setDevice('keyboard');
    garage.nav(0, 1); // back down to the bike row
    garage.nav(1, 0);
    expect(document.activeElement).toBe(bike('pro'));
    expect(cb.previewBike).toHaveBeenCalledExactlyOnceWith('pro');
    garage.back();
    expect(cb.previewBike).toHaveBeenLastCalledWith('rookie');
    expect(cb.setBike).not.toHaveBeenCalled();
    expect(cb.setOutfit).toHaveBeenCalledTimes(1);
  });

  it('synchronizes native tab focus with confirm, including the menu button', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    outfit('race-bluewhite').focus();
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
    garage.root.querySelector<HTMLButtonElement>('.backbtn')!.focus();
    garage.confirm();
    expect(cb.back).toHaveBeenCalledTimes(1);
    expect(cb.setBike).not.toHaveBeenCalled();
  });

  it('retains focus taken during the reveal without acting before the live gate', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').focus();
    garage.confirm();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(cb.previewBike).not.toHaveBeenCalled();
    makeLive();
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
    expect(cb.setBike).not.toHaveBeenCalled();
  });

  it('rejects input until drawn long enough, after hiding, and during a new reveal', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    outfit('race-bluewhite').click();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').click();
    garage.nav(0, 1);
    garage.confirm();
    garage.back();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(cb.setBike).not.toHaveBeenCalled();
    expect(cb.back).not.toHaveBeenCalled();
    makeLive();
    garage.hide();
    expect(garage.root.inert).toBe(true);
    expect(garage.root.getAttribute('aria-hidden')).toBe('true');
    outfit('race-bluewhite').click();
    garage.confirm();
    garage.show('rookie', 'street-mustard');
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    makeLive();
    outfit('race-bluewhite').click();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
  });
});

/** Garage round: rider model chips + the model explorer (stage / orbit callbacks, drag / pinch / wheel). */
function explorer(opts: { models?: boolean } = {}) {
  let rider: ModelChoice = 'gltf';
  const orbit = vi.fn<(view: GarageView | null) => void>();
  const stage = vi.fn<(on: boolean) => void>();
  const setModel = vi.fn<(v: ModelChoice) => void>().mockImplementation((v) => { rider = v; });
  const cb: GarageCallbacks = {
    previewBike: vi.fn(),
    setBike: vi.fn(),
    setOutfit: vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockResolvedValue(true),
    back: vi.fn(),
    ...(opts.models === false ? {} : { models: { get: () => rider, set: setModel } }),
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
  const model = (v: string) => garage.root.querySelector<HTMLButtonElement>(`button[data-model="${v}"]`)!;
  const pointer = (type: string, id: number, x: number, y: number, pointerType = 'touch') => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }) as MouseEvent & { pointerId: number; pointerType: string };
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    garage.stage.dispatchEvent(e);
  };
  return { garage, cb, orbit, stage, setModel, model, pointer, makeLive, rider: () => rider };
}

describe('garage rider model + model explorer', () => {
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

  it('offers Classic / Blender / Img2 chips, commits the rider model once, and shows outfits as Blender-only', () => {
    const { garage, model, setModel, cb, makeLive, rider } = explorer();
    garage.show('rookie', 'street-mustard');
    expect(model('gltf').getAttribute('aria-pressed')).toBe('true');
    model('img2').click(); // not live yet
    expect(setModel).not.toHaveBeenCalled();
    makeLive();
    model('img2').click();
    expect(setModel).toHaveBeenCalledExactlyOnceWith('img2');
    expect(model('img2').getAttribute('aria-pressed')).toBe('true');
    expect(garage.root.querySelector('[data-outfit][aria-pressed="true"]')).toBeNull();
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Img2 experiment · pick an outfit for the Blender rider');
    model('img2').click(); // already current: no second commit
    expect(setModel).toHaveBeenCalledTimes(1);
    model('proc').click();
    expect(rider()).toBe('proc');
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Classic rider · pick an outfit for the Blender rider');
    // Picking an outfit brings the Blender rider back (the app flips the model on a loaded outfit).
    (cb.setOutfit as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { setModel('gltf'); return true; });
    garage.root.querySelector<HTMLButtonElement>('button[data-outfit="race-bluewhite"]')!.click();
    return vi.waitFor(() => {
      expect(garage.root.querySelector('[data-outfit="race-bluewhite"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(model('gltf').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('keyboard rows run up the rail bike → outfit → rider (and down to ‹ MENU) when models are offered, and skip the rider row otherwise', () => {
    const a = explorer();
    a.garage.show('rookie', 'street-mustard');
    a.makeLive();
    // The rail reads rider / outfit / bike top → bottom; focus opens on the bike row (lowest, under the thumb).
    expect([...a.garage.root.querySelectorAll<HTMLElement>('.rail-group')].map((g) => g.dataset['group'])).toEqual(['rider', 'outfit', 'bike']);
    a.garage.nav(0, -1);
    expect(document.activeElement?.getAttribute('data-outfit')).toBe('street-mustard');
    a.garage.nav(0, -1);
    expect(document.activeElement).toBe(a.model('gltf'));
    a.garage.nav(1, 0);
    expect(document.activeElement).toBe(a.model('img2'));
    a.garage.confirm();
    expect(a.setModel).toHaveBeenCalledExactlyOnceWith('img2');
    a.garage.nav(0, -1); // wraps past the top to ‹ MENU
    expect(document.activeElement).toBe(a.garage.root.querySelector('.backbtn'));
    a.garage.nav(0, 1);
    expect(document.activeElement).toBe(a.model('img2'));
    a.garage.hide();
    document.body.innerHTML = '';
    resetLive();
    const b = explorer({ models: false });
    expect(b.garage.root.querySelector('[data-model]')).toBeNull();
    expect([...b.garage.root.querySelectorAll<HTMLElement>('.rail-group')].map((g) => g.dataset['group'])).toEqual(['outfit', 'bike']);
    b.garage.show('rookie', 'street-mustard');
    b.makeLive();
    b.garage.nav(0, -1);
    expect(document.activeElement?.getAttribute('data-outfit')).toBe('street-mustard');
    b.garage.nav(0, -1);
    expect(document.activeElement).toBe(b.garage.root.querySelector('.backbtn'));
  });
});
