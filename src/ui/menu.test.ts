// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseMenu } from './menu';
import type { ModelChoice } from './best';
import type { RiderOutfit } from '../core/types';
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
  const models: { rider: ModelChoice; bike: ModelChoice } = { rider: 'gltf', bike: 'gltf' };
  const setOutfit = vi.fn<(outfit: RiderOutfit) => Promise<boolean>>().mockImplementation(async outfit => { current = outfit; return true; });
  const setModel = vi.fn<(which: 'rider' | 'bike', model: ModelChoice) => void>().mockImplementation((which, model) => { models[which] = model; });
  const cb = { resume: vi.fn(), restartTrack: vi.fn(), quit: vi.fn(), models: { get: () => models, set: setModel }, outfits: { get: () => current, set: setOutfit } };
  const menu = new PauseMenu(document.body, { tick: vi.fn(), confirm: vi.fn() } as unknown as UiSfx, cb);
  const outfit = (id: string) => menu.root.querySelector<HTMLButtonElement>(`[data-outfit="${id}"]`)!;
  const makeLive = () => { tickLive(now); now += LIVE_DELAY_MS; tickLive(now); };
  menu.show();
  return { menu, outfit, cb, setOutfit, setModel, makeLive };
}

describe('pause customization', () => {
  it('offers all outfits and the experimental rider while keeping bike to two choices', () => {
    const { menu, setModel, makeLive } = fixture();
    expect(menu.root.querySelectorAll('[data-outfit]')).toHaveLength(5);
    expect(menu.root.querySelectorAll('[data-which="rider"] button')).toHaveLength(3);
    expect(menu.root.querySelectorAll('[data-which="bike"] button')).toHaveLength(2);
    const experiment = menu.root.querySelector<HTMLButtonElement>('[data-v="img2"]')!;
    experiment.click();
    expect(setModel).not.toHaveBeenCalled();
    makeLive();
    experiment.click();
    expect(setModel).toHaveBeenCalledExactlyOnceWith('rider', 'img2');
    expect(experiment.getAttribute('aria-pressed')).toBe('true');
    expect(menu.root.querySelector('[data-outfit][aria-pressed="true"]')).toBeNull();
    expect(menu.root.querySelector('[role="status"]')?.textContent).toBe('Img2 experiment · choose an outfit to use Blender');
    menu.root.querySelector<HTMLButtonElement>('[data-which="rider"] [data-v="proc"]')!.click();
    expect(menu.root.querySelector('[role="status"]')?.textContent).toBe('Classic rider · choose an outfit to use Blender');
    menu.root.querySelector<HTMLButtonElement>('[data-which="rider"] [data-v="gltf"]')!.click();
    expect(menu.root.querySelector('[data-outfit="street-mustard"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves outfit during a failed load and allows retry without resuming', async () => {
    const { menu, outfit, cb, setOutfit, makeLive } = fixture();
    let finish!: (ok: boolean) => void;
    setOutfit.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    makeLive();
    outfit('race-bluewhite').click();
    outfit('race-bluewhite').click();
    expect(setOutfit).toHaveBeenCalledTimes(1);
    expect(outfit('street-mustard').getAttribute('aria-pressed')).toBe('true');
    expect(outfit('race-bluewhite').getAttribute('aria-busy')).toBe('true');
    finish(false);
    await vi.waitFor(() => expect(menu.root.querySelector('[role="status"]')?.textContent).toContain('Select it to retry'));
    outfit('race-bluewhite').click();
    await vi.waitFor(() => expect(outfit('race-bluewhite').getAttribute('aria-pressed')).toBe('true'));
    expect(cb.resume).not.toHaveBeenCalled();
    menu.fadeOut();
    outfit('street-mustard').click();
    expect(setOutfit).toHaveBeenCalledTimes(2);
  });

  it('navigates outfits, bike, rider and back to resume using the gamepad API', async () => {
    const { menu, outfit, cb, setOutfit, setModel, makeLive } = fixture();
    makeLive();
    menu.move(0, -1);
    expect(document.activeElement).toBe(outfit('street-mustard'));
    menu.move(1, 0);
    menu.confirm();
    await vi.waitFor(() => expect(setOutfit).toHaveBeenCalledExactlyOnceWith('street-openface'));
    menu.move(0, -1);
    menu.move(1, 0);
    expect(setModel).toHaveBeenLastCalledWith('bike', 'proc');
    menu.move(0, -1);
    menu.move(1, 0);
    expect(setModel).toHaveBeenLastCalledWith('rider', 'img2');
    menu.move(0, 1);
    menu.move(0, 1);
    menu.move(0, 1);
    menu.confirm();
    expect(cb.resume).toHaveBeenCalledOnce();
  });
});
