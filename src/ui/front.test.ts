// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainMenuScreen, type FrontCallbacks, type FrontState } from './front';
import type { RiderOutfit } from '../core/types';
import type { ArtManifest } from './art';
import type { UiSfx } from './sfx';
import { LIVE_DELAY_MS, resetLive, setLiveClock, tickLive } from './live';

let now = 0;
beforeEach(() => {
  now = 0;
  setLiveClock(() => now);
  document.head.innerHTML = '<style>* { opacity: 1; }</style>';
});
afterEach(() => {
  resetLive();
  setLiveClock(() => performance.now());
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function fixture() {
  let current: RiderOutfit = 'street-mustard';
  const state = { models: true, rider: 'gltf', bikeClass: 'rookie' } as FrontState;
  const set = vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockImplementation(async outfit => { current = outfit; return true; });
  const cb = {
    outfits: { get: () => current, set },
    setModel: vi.fn<FrontCallbacks['setModel']>().mockImplementation((_which, model) => { state.rider = model; }),
    goto: vi.fn(),
  } as unknown as FrontCallbacks;
  const menu = new MainMenuScreen(document.body, { tick: vi.fn(), confirm: vi.fn() } as unknown as UiSfx,
    { whenReady: () => undefined } as unknown as ArtManifest, cb, () => null, () => state);
  const makeLive = () => { tickLive(now); now += LIVE_DELAY_MS; tickLive(now); };
  menu.show();
  return { menu, set, cb, makeLive };
}

describe('main menu (garage round: customisation lives in the garage)', () => {
  it('offers no outfit or rider-model rows even when the renderer supports models and outfits', () => {
    const { menu, cb, set } = fixture();
    expect(menu.root.querySelectorAll('[data-outfit], [data-model], .menu-customize')).toHaveLength(0);
    expect(menu.root.querySelector('[role="status"]')).toBeNull();
    expect(cb.setModel).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    // The band keeps its five tabs, Garage second.
    expect([...menu.root.querySelectorAll<HTMLElement>('.menu-item')].map((b) => b.dataset['id'])).toEqual(['play', 'garage', 'review', 'settings', 'credits']);
  });

  it('steps along the tabs on either axis and confirms the focused one', () => {
    const { menu, cb, makeLive } = fixture();
    makeLive();
    menu.nav(1, 0);
    menu.confirm();
    expect(cb.goto).toHaveBeenLastCalledWith('garage');
    menu.nav(0, 1);
    menu.confirm();
    expect(cb.goto).toHaveBeenLastCalledWith('review');
    menu.nav(-1, 0);
    menu.nav(-1, 0);
    menu.confirm();
    expect(cb.goto).toHaveBeenLastCalledWith('tracks');
  });

  it('ignores input before the screen is live', () => {
    const { menu, cb } = fixture();
    menu.nav(1, 0);
    menu.confirm();
    expect(cb.goto).not.toHaveBeenCalled();
  });
});
