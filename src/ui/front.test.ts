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
  const outfit = (id: string) => menu.root.querySelector<HTMLButtonElement>(`[data-outfit="${id}"]`)!;
  const makeLive = () => { tickLive(now); now += LIVE_DELAY_MS; tickLive(now); };
  menu.show();
  return { menu, outfit, set, cb, makeLive };
}

describe('main menu customization', () => {
  it('offers five outfits and switches experimental rider without choosing an outfit', () => {
    const { menu, cb, set, makeLive } = fixture();
    expect(menu.root.querySelectorAll('[data-outfit]')).toHaveLength(5);
    const experiment = menu.root.querySelector<HTMLButtonElement>('[data-model="img2"]')!;
    experiment.click();
    expect(cb.setModel).not.toHaveBeenCalled();
    makeLive();
    experiment.click();
    expect(cb.setModel).toHaveBeenCalledExactlyOnceWith('rider', 'img2');
    expect(experiment.getAttribute('aria-pressed')).toBe('true');
    expect(menu.root.querySelector('[data-outfit][aria-pressed="true"]')).toBeNull();
    expect(menu.root.querySelector('[role="status"]')?.textContent).toBe('Img2 experiment · choose an outfit to use Blender');
    expect(set).not.toHaveBeenCalled();
    menu.root.querySelector<HTMLButtonElement>('[data-model="proc"]')!.click();
    expect(menu.root.querySelector('[role="status"]')?.textContent).toBe('Classic rider · choose an outfit to use Blender');
    menu.root.querySelector<HTMLButtonElement>('[data-model="gltf"]')!.click();
    expect(menu.root.querySelector('[data-outfit="street-mustard"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the committed outfit through loading and failure, then allows retry', async () => {
    const { menu, outfit, set, makeLive } = fixture();
    let finish!: (ok: boolean) => void;
    set.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    makeLive();
    outfit('race-bluewhite').click();
    outfit('race-bluewhite').click();
    expect(set).toHaveBeenCalledTimes(1);
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    expect(outfit('race-bluewhite').getAttribute('aria-busy')).toBe('true');
    expect(menu.root.querySelector('[role="status"]')?.textContent).toContain('Loading');
    finish(false);
    await vi.waitFor(() => expect(menu.root.querySelector('[role="status"]')?.textContent).toContain('Select it to retry'));
    outfit('race-bluewhite').click();
    await vi.waitFor(() => expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true'));
    menu.hide();
    outfit('street-mustard').click();
    expect(set).toHaveBeenCalledTimes(2);
    menu.show();
    expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true');
  });

  it('navigates from tabs through outfits to models and confirms the focused control', async () => {
    const { menu, outfit, set, cb, makeLive } = fixture();
    makeLive();
    menu.nav(0, -1);
    expect(document.activeElement).toBe(outfit('street-mustard'));
    menu.nav(1, 0);
    expect(document.activeElement).toBe(outfit('street-openface'));
    menu.confirm();
    await vi.waitFor(() => expect(set).toHaveBeenCalledExactlyOnceWith('street-openface'));
    menu.nav(0, -1);
    menu.nav(1, 0);
    menu.confirm();
    expect(cb.setModel).toHaveBeenCalledExactlyOnceWith('rider', 'img2');
  });
});
