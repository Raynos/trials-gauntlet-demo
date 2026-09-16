// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseMenu } from './menu';
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
  const cb = { resume: vi.fn(), restartTrack: vi.fn(), quit: vi.fn() };
  const menu = new PauseMenu(document.body, { tick: vi.fn(), confirm: vi.fn() } as unknown as UiSfx, cb);
  const makeLive = () => { tickLive(now); now += LIVE_DELAY_MS; tickLive(now); };
  menu.show({ trackName: 'First Ride', tier: 'Beginner', runTime: 12.5, faults: 1 });
  return { menu, cb, makeLive };
}

describe('pause overlay (garage round: no cosmetic rows mid-run)', () => {
  it('carries no outfit or rider / bike model controls — those live in the garage', () => {
    const { menu } = fixture();
    expect(menu.root.querySelectorAll('[data-outfit]')).toHaveLength(0);
    expect(menu.root.querySelectorAll('[data-which], .mini-seg, .visuals, .pause-outfits')).toHaveLength(0);
    expect(menu.root.querySelector('[role="status"]')).toBeNull();
    // What remains: the three tiles and the armed reload link.
    expect([...menu.root.querySelectorAll<HTMLElement>('.tile')].map((t) => t.dataset['id'])).toEqual(['resume', 'restart', 'quit']);
    expect(menu.root.querySelector('.ov-reload')).not.toBeNull();
  });

  it('moves along the tiles, down to reload and back, and confirms the focused tile', () => {
    const { menu, cb, makeLive } = fixture();
    makeLive();
    menu.move(1, 0);
    menu.confirm();
    expect(cb.restartTrack).toHaveBeenCalledOnce();
    menu.move(0, 1);
    expect(menu.root.classList.contains('focus-reload')).toBe(true);
    menu.move(0, -1);
    expect(menu.root.classList.contains('focus-tiles')).toBe(true);
    menu.move(1, 0);
    menu.confirm();
    expect(cb.quit).toHaveBeenCalledOnce();
    menu.move(-1, 0);
    menu.move(-1, 0);
    menu.confirm();
    expect(cb.resume).toHaveBeenCalledOnce();
  });

  it('ignores input before the overlay is live', () => {
    const { menu, cb } = fixture();
    menu.confirm();
    menu.move(1, 0);
    expect(cb.resume).not.toHaveBeenCalled();
    expect(cb.restartTrack).not.toHaveBeenCalled();
  });
});
