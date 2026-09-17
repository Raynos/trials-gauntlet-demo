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
  const state = { models: true, rider: 'gltf', bikeClass: 'rookie' } as FrontState; // never handed to the menu: it reads no state
  const set = vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockImplementation(async outfit => { current = outfit; return true; });
  const cb = {
    outfits: { get: () => current, set },
    setModel: vi.fn<FrontCallbacks['setModel']>().mockImplementation((_which, model) => { state.rider = model; }),
    goto: vi.fn(),
  } as unknown as FrontCallbacks;
  const menu = new MainMenuScreen(document.body, { tick: vi.fn(), confirm: vi.fn() } as unknown as UiSfx,
    { whenReady: () => undefined, all: () => [] } as unknown as ArtManifest, cb);
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

describe('main menu (round 3 B2 "Strip", ask 42: the title menu leaks nothing)', () => {
  it('renders only the title, the badge + stamp, the four tiles and credits — no ticker, chip, track, time or count', () => {
    const { menu } = fixture();
    expect(menu.root.querySelectorAll('.menu-ticker, .menu-ticker-track, .menu-chip, .menu-card, .menu-next, .menu-session')).toHaveLength(0);
    expect(menu.root.querySelector('.menu-title')?.textContent).toBe('TrialsGauntlet');
    expect(menu.root.querySelector('.menu-plate .wordmark')?.textContent).toBe('Trials Gauntlet');
    expect(menu.root.querySelector('.menu-build')?.textContent).toMatch(/^build /);
    // Every word on the screen, with the build stamp removed: the five actions and the title only.
    const words = [...menu.root.querySelectorAll<HTMLElement>('.menu-title span, .wordmark, .menu-item')].map((el) => el.textContent?.trim());
    expect(words).toEqual(['Trials', 'Gauntlet', 'Trials Gauntlet', 'Play', 'Garage', 'Review', 'Settings', 'Credits']);
    expect(menu.root.textContent?.replace(/\s+/g, '')).toBe('TrialsGauntletTrialsGauntlet' + menu.root.querySelector('.menu-build')!.textContent!.replace(/\s+/g, '') + 'PlayGarageReviewSettingsCredits');
    expect(menu.root.textContent).not.toMatch(/\d+:\d\d|\d+ ?\/ ?\d+|cleared|next|last|session|best|rookie|pro bike|medal/i);
  });

  it('draws the icon above the word on the three secondary tiles and none on PLAY / CREDITS', () => {
    const { menu } = fixture();
    const icon = (id: string) => menu.root.querySelector(`.menu-item[data-id="${id}"] .ico svg`);
    expect(icon('garage')).not.toBeNull();
    expect(icon('review')).not.toBeNull();
    expect(icon('settings')).not.toBeNull();
    expect(icon('play')).toBeNull();
    expect(icon('credits')).toBeNull();
    expect(menu.root.querySelector('.menu-item[data-id="play"]')?.textContent?.trim()).toBe('Play');
  });

  it('shows the Nalati tint until the pack plate decodes, and asks the pack for keyart-nalati only', () => {
    const applied: string[] = [];
    const art = {
      whenReady: (cb: () => void) => cb(),
      all: () => [
        { id: 'keyart-industrial-960', kind: 'keyart', biome: 'industrial', variant: '1x', src: 'art/menu/keyart-industrial-960.webp' },
        { id: 'keyart-nalati-960', kind: 'keyart', biome: 'nalati', variant: '1x', src: 'art/menu/keyart-nalati-960.webp' },
        { id: 'keyart-nalati-1920', kind: 'keyart', biome: 'nalati', variant: '2x', src: 'art/menu/keyart-nalati-1920.webp' },
      ],
      applyBackground: (_el: HTMLElement, e: { id: string } | null) => { if (e) applied.push(e.id); },
    } as unknown as ArtManifest;
    const menu = new MainMenuScreen(document.body, { tick: vi.fn(), confirm: vi.fn() } as unknown as UiSfx, art, { goto: vi.fn() } as unknown as FrontCallbacks);
    const strip = menu.root.querySelector<HTMLElement>('.menu-keyart')!;
    expect(strip.style.backgroundImage).toMatch(/^linear-gradient/);
    expect(strip.classList.contains('loaded')).toBe(false);
    expect(applied).toEqual(['keyart-nalati-960']); // jsdom: DPR 1, a 1024 px window
  });
});
