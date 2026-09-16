// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtManifest } from './art';
import type { RiderOutfit } from '../core/types';
import { GarageScreen } from './garage';
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
  it('shows an unavailable openface design and navigates only the four working choices', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('rookie', 'street-mustard');
    makeLive();
    const unavailable = garage.root.querySelector<HTMLButtonElement>('[data-design="street-openface"]')!;
    expect(unavailable.disabled).toBe(true);
    unavailable.click();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    outfit('street-mustard').focus();
    for (const id of ['race-bluewhite', 'street-charcoal', 'race-charcoalyellow', 'street-mustard']) {
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
    expect(outfit('street-mustard').textContent).toContain('Hoodie, jeans & trainers');
    expect(outfit('race-bluewhite').textContent).toContain('Blue & white · Race');
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
    garage.nav(0, 1); // outfit section
    expect(document.activeElement).toBe(outfit('street-mustard'));
    garage.nav(1, 0);
    expect(document.activeElement).toBe(outfit('race-bluewhite'));
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race-bluewhite');
    garage.setDevice('keyboard');
    garage.nav(0, -1); // bike section
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
