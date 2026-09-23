// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { ROCKHOP_ALL } from '../tracks';
import type { ArtManifest } from './art';
import type { BestEntry } from './best';
import type { FrontCallbacks, FrontState } from './front';
import type { UiSfx } from './sfx';
import { WorldMapScreen } from './worldMapScreen';

const ALL: TrackDef[] = [...ROCKHOP_ALL];
/** COAST medalled: ALPINE open, the quarry gate next. */
const SEEDED: Record<string, Medal> = { 'c1-low-tide': 'gold', 'c2-crane-hop': 'silver', 'c3-hull-breach': 'bronze' };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function fixture(o: { seeded?: boolean; lastPlayed?: string | null; recording?: boolean; dev?: boolean } = {}) {
  const bestOf = (id: string): BestEntry | null => {
    const medal = o.seeded ? SEEDED[id] : undefined;
    if (!medal) return null;
    return { time: 41.2, faults: 0, medal, bike: id === 'c3-hull-breach' ? 'pro' : 'rookie', ...(o.recording ? { recording: '{}' } : {}) } as unknown as BestEntry;
  };
  const state = { dev: !!o.dev, lastPlayed: o.lastPlayed ?? null, ghost: true, bikeClass: 'rookie' } as FrontState;
  const cb = { play: vi.fn(), goto: vi.fn(), watchPb: vi.fn() } as unknown as FrontCallbacks;
  const sfx = { tick: vi.fn(), confirm: vi.fn(), back: vi.fn(), launch: vi.fn() } as unknown as UiSfx;
  const probed: string[] = [];
  const art = { whenReady: (f: () => void) => f(), probe: (src: string) => { probed.push(src); return Promise.resolve(false); }, medal: () => null, applyBackground: () => undefined } as unknown as ArtManifest;
  const screen = new WorldMapScreen(document.body, sfx, art, cb, bestOf, () => state, () => []);
  screen.build(ALL);
  screen.show();
  const on = (): string | undefined => document.querySelector<HTMLElement>('.wm-marker.on')?.dataset['track'];
  const scene = document.querySelector<HTMLElement>('.wm-scene')!;
  return { screen, cb, sfx, on, scene, probed, state };
}

describe('world map screen — the painted continent as the level select', () => {
  it('builds one scene (a transform root) with the world plate, four zone plates, four names, the road, the fog, a marker per shipped track, a gate and the chrome; CSS injected once', () => {
    const { scene, probed } = fixture();
    expect(document.querySelectorAll('.wm-scene')).toHaveLength(1);
    expect(scene.style.transform).toMatch(/translate\(.*\) scale\(/);
    expect(document.querySelectorAll('.wm-world')).toHaveLength(1);
    expect(document.querySelectorAll('.wm-region')).toHaveLength(4);
    expect([...document.querySelectorAll<HTMLElement>('.wm-name b')].map((n) => n.textContent)).toEqual(['Coastal Scrapyard', 'Alpine Forest Trail', 'Desert Quarry', 'Snowline']);
    expect(document.querySelectorAll('.wm-route path.dim')).toHaveLength(1);
    expect(document.querySelectorAll('.wm-fog ellipse').length).toBeGreaterThan(0);
    const markers = [...document.querySelectorAll<HTMLElement>('.wm-marker')];
    expect(markers.length).toBe(16);
    expect(markers.every((m) => !!m.dataset['track'] && m.querySelector('button.wm-hit') !== null)).toBe(true);
    expect(document.querySelectorAll('.wm-gate')).toHaveLength(1);
    expect(document.querySelectorAll('style#worldmap-css')).toHaveLength(1);
    expect(document.querySelector('.tracks-screen .backbtn')?.textContent).toContain('Menu');
    expect(document.querySelector('.wm-progress')?.textContent).toContain('0 / 12 cleared');
    expect(document.querySelector('.wm-brand svg')?.getAttribute('aria-label')).toBe('ROCKHOP');
    expect(document.querySelectorAll('.wm-ride')).toHaveLength(1);
    // The world plate is probed (lazy art, never the boot set); the focused region's plate too.
    expect(probed.some((p) => /art\/worldmap\/world-\d+\.webp/.test(p))).toBe(true);
    expect(probed.some((p) => /art\/worldmap\/region-coast-\d+\.webp/.test(p))).toBe(true);
    // Nothing scrolls: the viewport is touch-action none, the scene a transform.
    expect(document.querySelector<HTMLElement>('.wm-view')).not.toBeNull();
  });

  it('fresh profile opens on C1 (up next), RIDE enabled, the gate into ALPINE; coast medalled opens on A1; last played wins when its zone is open', () => {
    const a = fixture();
    expect(a.on()).toBe('c1-low-tide');
    expect(a.scene.dataset['track']).toBe('c1-low-tide');
    expect(a.scene.dataset['region']).toBe('coast');
    expect(document.querySelector<HTMLButtonElement>('.wm-ride')!.disabled).toBe(false);
    expect(document.querySelector('.wm-ride')!.textContent).toContain('Low Tide');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Alpine Forest Trail · Medal every Coast track');
    document.body.innerHTML = '';
    const b = fixture({ seeded: true });
    expect(b.on()).toBe('a1-sawdust');
    expect(document.querySelector('.wm-progress')!.textContent).toContain('3 / 12 cleared');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Desert Quarry · Medal every Alpine track');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Dust Devil');
    document.body.innerHTML = '';
    const c = fixture({ seeded: true, lastPlayed: 'c2-crane-hop' });
    expect(c.on()).toBe('c2-crane-hop');
    document.body.innerHTML = '';
    const d = fixture({ lastPlayed: 's1-lift-line' }); // locked: ignored
    expect(d.on()).toBe('c1-low-tide');
  });

  it('markers carry their state: medal class, UP NEXT tag, the padlock + rule on locked ones, PRO on the Pro best, FREE RIDE flags', () => {
    fixture({ seeded: true });
    const m = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.wm-marker[data-track="${id}"]`)!;
    expect(m('c1-low-tide').classList.contains('gold')).toBe(true);
    expect(m('c2-crane-hop').classList.contains('silver')).toBe(true);
    expect(m('a1-sawdust').classList.contains('next')).toBe(true);
    expect(m('a1-sawdust').querySelector('.tag.next')?.textContent).toBe('Up next');
    expect(m('d1-dust-devil').classList.contains('locked')).toBe(true);
    expect(m('d1-dust-devil').querySelector('.wm-rule')?.textContent).toBe('Medal every Alpine track');
    expect(m('c3-hull-breach').querySelector('.tag.pro')?.textContent).toBe('Pro');
    expect(m('p-coast').classList.contains('proving')).toBe(true);
    expect(m('p-coast').querySelector('.wm-plate b')?.textContent).toBe('Free ride');
    expect(document.querySelector('.wm-marker[data-track^="lab-"]')).toBeNull();
  });

  it('nav: ← → step the markers along the trail (C1 → C2 → C3 → A1 …), the card follows; confirm launches after 180 ms', () => {
    const { screen, cb, sfx, on } = fixture();
    screen.nav(1, 0);
    expect(on()).toBe('c2-crane-hop');
    screen.nav(1, 0);
    screen.nav(1, 0);
    expect(on()).toBe('a1-sawdust');
    expect(document.querySelector('.wm-card .name')?.textContent).toBe('Sawdust');
    expect(sfx.tick).toHaveBeenCalled();
    screen.nav(-1, 0);
    screen.nav(-1, 0);
    screen.nav(-1, 0);
    expect(on()).toBe('c1-low-tide');
    screen.nav(-1, 0);
    expect(on()).toBe('p-snowline'); // wraps to the last FREE RIDE flag
    screen.nav(1, 0);
    expect(on()).toBe('c1-low-tide');
    screen.confirm();
    expect(cb.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb.play).toHaveBeenCalledWith('c1-low-tide');
    expect(sfx.launch).toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(screen.visible).toBe(false);
  });

  it('a locked marker never launches: confirm shakes, the card, the plate and the pill state the rule', () => {
    const { screen, cb, sfx, on } = fixture({ seeded: true });
    for (let i = 0; i < 3; i++) screen.nav(1, 0); // A1 → A2 A3 D1
    expect(on()).toBe('d1-dust-devil');
    expect(document.querySelector('.wm-card .rule')?.textContent).toBe('Locked · Medal every Alpine track');
    expect(document.querySelector<HTMLButtonElement>('.wm-ride')!.disabled).toBe(true);
    expect(document.querySelector('.wm-ride')!.textContent).toContain('Medal every Alpine track');
    screen.confirm();
    vi.advanceTimersByTime(500);
    expect(cb.play).not.toHaveBeenCalled();
    expect(sfx.back).toHaveBeenCalled();
    expect(screen.visible).toBe(true);
  });

  it('back → menu; alt (GHOST) only with a recording, never on a locked track; the GHOST pill hides without one', () => {
    const a = fixture({ seeded: true });
    expect(document.querySelector<HTMLButtonElement>('.wm-ghost')!.hidden).toBe(true);
    a.screen.alt();
    expect(a.cb.watchPb).not.toHaveBeenCalled();
    a.screen.back();
    expect(a.cb.goto).toHaveBeenCalledWith('menu');
    document.body.innerHTML = '';
    const b = fixture({ seeded: true, lastPlayed: 'c1-low-tide', recording: true });
    expect(b.on()).toBe('c1-low-tide');
    expect(document.querySelector<HTMLButtonElement>('.wm-ghost')!.hidden).toBe(false);
    b.screen.alt();
    expect(b.cb.watchPb).toHaveBeenCalledWith('c1-low-tide');
    // ↓ reaches RIDE, → the GHOST pill, confirm there = ghost.
    b.screen.nav(0, 1);
    expect(document.querySelector('.wm-ride')!.classList.contains('on')).toBe(true);
    b.screen.nav(1, 0);
    expect(document.querySelector('.wm-ghost')!.classList.contains('on')).toBe(true);
    b.screen.confirm();
    expect(b.cb.watchPb).toHaveBeenCalledTimes(2);
    b.screen.nav(0, -1);
    expect(document.querySelector('.wm-ride')!.classList.contains('on')).toBe(false);
  });

  it('fog lifts: a rebuild after ALPINE is medalled animates the quarry fog away instead of dropping it', () => {
    const { screen } = fixture({ seeded: true });
    const before = document.querySelectorAll('.wm-fog ellipse[data-key="quarry"]').length;
    expect(before).toBeGreaterThan(0);
    expect(document.querySelectorAll('.wm-fog ellipse.open')).toHaveLength(0);
    // Every Alpine track medalled now: the quarry opens.
    const medal = (id: string): Medal | null => (SEEDED[id] ?? (id.startsWith('a') ? 'silver' : null)) as Medal | null;
    (screen as unknown as { bestOf: (id: string) => BestEntry | null }).bestOf = (id) => (medal(id) ? ({ time: 50, faults: 0, medal: medal(id), bike: 'rookie' } as unknown as BestEntry) : null);
    screen.build(ALL);
    expect(document.querySelectorAll('.wm-fog ellipse.open[data-key="quarry"]')).toHaveLength(before);
    expect(document.querySelectorAll('.wm-fog ellipse:not(.open)[data-key="quarry"]')).toHaveLength(0);
    // A third build: the lifted fog is gone for good.
    screen.build(ALL);
    expect(document.querySelectorAll('.wm-fog ellipse[data-key="quarry"]')).toHaveLength(0);
  });

  it('the card stands above a marker in the lower part of the view (`.up`), beside one higher up', () => {
    const { screen } = fixture({ seeded: true });
    const view = document.querySelector<HTMLElement>('.wm-view')!;
    Object.defineProperty(view, 'clientWidth', { value: 932, configurable: true });
    Object.defineProperty(view, 'clientHeight', { value: 430, configurable: true });
    const cam = screen as unknown as { cam: { x: number; y: number; k: number }; placeCard(): void };
    const m1 = document.querySelector<HTMLElement>('.wm-marker.on')!; // A1
    const my = parseFloat(m1.style.top);
    cam.cam = { x: 0, y: 40 - my * 0.8, k: 0.8 }; // M1 at 40 px from the top
    cam.placeCard();
    expect(document.querySelector('.wm-card')!.classList.contains('up')).toBe(false);
    cam.cam = { x: 0, y: 400 - my * 0.8, k: 0.8 }; // M1 at 400 px: the lowest 20 %
    cam.placeCard();
    expect(document.querySelector('.wm-card')!.classList.contains('up')).toBe(true);
  });

  it('camera(): opens at the region zoom on the focused track, reports its bounds and the focused region', () => {
    const { screen } = fixture({ seeded: true });
    const c = screen.camera();
    expect(c.zoom).toBeCloseTo(0.8, 3); // jsdom has no box: the frame fly never runs, the zoom stays at the region default
    expect(c.zoomMax).toBeGreaterThan(c.zoom);
    expect(c.track).toBe('a1-sawdust');
    expect(c.region).toBe('alpine');
    expect(c.far).toBe(false);
    expect(screen.currentRegion()).toBe('alpine');
  });

  it('dev: every zone open, no gate', () => {
    fixture({ dev: true });
    expect(document.querySelectorAll('.wm-gate')).toHaveLength(0);
    expect(document.querySelectorAll('.wm-marker.locked')).toHaveLength(0);
  });
});
