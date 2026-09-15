// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtManifest } from './art';
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
  const cb = { previewBike: vi.fn(), setBike: vi.fn(), setOutfit: vi.fn(), back: vi.fn() };
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
  it('exposes both named choices and the current selection separately from bike class', () => {
    const { garage, outfit, bike } = fixture();
    garage.show('pro', 'race');
    expect(garage.root.querySelector('[role="group"][aria-label="Rider outfit"]')).not.toBeNull();
    expect(outfit('street').textContent).toContain('Hoodie, jeans & trainers');
    expect(outfit('race').textContent).toContain('Race kit');
    expect(outfit('street').type).toBe('button');
    expect(outfit('street').getAttribute('aria-pressed')).toBe('false');
    expect(outfit('race').getAttribute('aria-pressed')).toBe('true');
    expect(bike('pro').getAttribute('aria-pressed')).toBe('true');
    expect(garage.root.querySelector('[role="status"]')?.textContent).toBe('Race kit selected');
  });

  it('commits a touch/click choice once through the outfit callback without changing the bike', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('pro', 'street');
    makeLive();
    // Touch produces a click; hover must not be necessary for correct selection.
    outfit('race').click();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race');
    expect(cb.setBike).not.toHaveBeenCalled();
    expect(cb.previewBike).not.toHaveBeenCalled();
    expect(outfit('race').getAttribute('aria-pressed')).toBe('true');
  });

  it('shares directional and confirm navigation for keyboard/gamepad without committing focus', () => {
    const { garage, outfit, bike, cb, makeLive } = fixture();
    garage.show('rookie', 'street');
    makeLive();
    garage.setDevice('gamepad');
    garage.nav(0, 1); // outfit section
    expect(document.activeElement).toBe(outfit('street'));
    garage.nav(1, 0);
    expect(document.activeElement).toBe(outfit('race'));
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(outfit('street').getAttribute('aria-pressed')).toBe('true');
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race');
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
    garage.show('rookie', 'street');
    makeLive();
    outfit('race').focus();
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race');
    garage.root.querySelector<HTMLButtonElement>('.backbtn')!.focus();
    garage.confirm();
    expect(cb.back).toHaveBeenCalledTimes(1);
    expect(cb.setBike).not.toHaveBeenCalled();
  });

  it('retains focus taken during the reveal without acting before the live gate', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    garage.show('rookie', 'street');
    outfit('race').focus();
    garage.confirm();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    expect(cb.previewBike).not.toHaveBeenCalled();
    makeLive();
    garage.confirm();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race');
    expect(cb.setBike).not.toHaveBeenCalled();
  });

  it('rejects input until drawn long enough, after hiding, and during a new reveal', () => {
    const { garage, outfit, cb, makeLive } = fixture();
    outfit('race').click();
    garage.show('rookie', 'street');
    outfit('race').click();
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
    outfit('race').click();
    garage.confirm();
    garage.show('rookie', 'street');
    outfit('race').click();
    expect(cb.setOutfit).not.toHaveBeenCalled();
    makeLive();
    outfit('race').click();
    expect(cb.setOutfit).toHaveBeenCalledExactlyOnceWith('race');
  });
});
