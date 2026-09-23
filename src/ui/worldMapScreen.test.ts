// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { getTrack, listTrackIds } from '../tracks';
import type { ArtManifest } from './art';
import type { BestEntry } from './best';
import type { FrontCallbacks, FrontState } from './front';
import type { UiSfx } from './sfx';
import { WorldMapScreen } from './worldMapScreen';

const ALL: TrackDef[] = listTrackIds().map((id) => getTrack(id)!).filter((t) => !!t);
const SEEDED: Record<string, Medal> = { 'b1-first-ride': 'gold', 'b2-lean-back': 'silver', 'b3-kicker-row': 'bronze', 'e1-uphill-weight': 'silver', 'e2-rear-wheel-first': 'bronze', 'e3-stairway': 'silver' };

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
    return { time: 41.2, faults: 0, medal, bike: id === 'e3-stairway' ? 'pro' : 'rookie', ...(o.recording ? { recording: '{}' } : {}) } as unknown as BestEntry;
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
  it('builds one scene (a transform root) with the world plate, five region plates, five names, the road, the fog, a marker per shipped track, a gate and the chrome; CSS injected once', () => {
    const { scene, probed } = fixture();
    expect(document.querySelectorAll('.wm-scene')).toHaveLength(1);
    expect(scene.style.transform).toMatch(/translate\(.*\) scale\(/);
    expect(document.querySelectorAll('.wm-world')).toHaveLength(1);
    expect(document.querySelectorAll('.wm-region')).toHaveLength(5);
    expect([...document.querySelectorAll<HTMLElement>('.wm-name b')].map((n) => n.textContent)).toEqual(['Industrial', 'Canyon', 'Snow', 'Night City', 'Foundry']);
    expect(document.querySelectorAll('.wm-route path.dim')).toHaveLength(1);
    expect(document.querySelectorAll('.wm-fog ellipse').length).toBeGreaterThan(0);
    const markers = [...document.querySelectorAll<HTMLElement>('.wm-marker')];
    expect(markers.length).toBe(ALL.filter((t) => !t.id.endsWith('-test') || t.id.startsWith('lab-')).length);
    expect(markers.every((m) => !!m.dataset['track'] && m.querySelector('button.wm-hit') !== null)).toBe(true);
    expect(document.querySelectorAll('.wm-gate')).toHaveLength(1);
    expect(document.querySelectorAll('style#worldmap-css')).toHaveLength(1);
    expect(document.querySelector('.tracks-screen .backbtn')?.textContent).toContain('Menu');
    expect(document.querySelector('.wm-progress')?.textContent).toContain('0 / 15 cleared');
    expect(document.querySelector('.wm-brand svg')?.getAttribute('aria-label')).toBe('ROCKHOP');
    expect(document.querySelectorAll('.wm-ride')).toHaveLength(1);
    // The world plate is probed (lazy art, never the boot set); the focused region's plate too.
    expect(probed.some((p) => /art\/worldmap\/world-\d+\.webp/.test(p))).toBe(true);
    expect(probed.some((p) => /art\/worldmap\/region-industrial-\d+\.webp/.test(p))).toBe(true);
    // Nothing scrolls: the viewport is touch-action none, the scene a transform.
    expect(document.querySelector<HTMLElement>('.wm-view')).not.toBeNull();
  });

  it('fresh profile opens on B1 (up next), RIDE enabled, the gate at Easy; seeded opens on M1; last played wins when its tier is open', () => {
    const a = fixture();
    expect(a.on()).toBe('b1-first-ride');
    expect(a.scene.dataset['track']).toBe('b1-first-ride');
    expect(a.scene.dataset['region']).toBe('industrial');
    expect(document.querySelector<HTMLButtonElement>('.wm-ride')!.disabled).toBe(false);
    expect(document.querySelector('.wm-ride')!.textContent).toContain('First Ride');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Easy');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Medal every Beginner track');
    document.body.innerHTML = '';
    const b = fixture({ seeded: true });
    expect(b.on()).toBe('m1-hop-up');
    expect(document.querySelector('.wm-progress')!.textContent).toContain('6 / 15 cleared');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Hard · Medal every Medium track');
    expect(document.querySelector('.wm-gate')!.textContent).toContain('Rooftop Wire');
    document.body.innerHTML = '';
    const c = fixture({ seeded: true, lastPlayed: 'e2-rear-wheel-first' });
    expect(c.on()).toBe('e2-rear-wheel-first');
    document.body.innerHTML = '';
    const d = fixture({ lastPlayed: 'h1-wheelie-wire' }); // locked: ignored
    expect(d.on()).toBe('b1-first-ride');
  });

  it('markers carry their state: medal class, UP NEXT tag, the padlock + rule on locked ones, PRO on the Pro best', () => {
    fixture({ seeded: true });
    const m = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.wm-marker[data-track="${id}"]`)!;
    expect(m('b1-first-ride').classList.contains('gold')).toBe(true);
    expect(m('b2-lean-back').classList.contains('silver')).toBe(true);
    expect(m('m1-hop-up').classList.contains('next')).toBe(true);
    expect(m('m1-hop-up').querySelector('.tag.next')?.textContent).toBe('Up next');
    expect(m('h1-wheelie-wire').classList.contains('locked')).toBe(true);
    expect(m('h1-wheelie-wire').querySelector('.wm-rule')?.textContent).toBe('Medal every Medium track');
    expect(m('e3-stairway').querySelector('.tag.pro')?.textContent).toBe('Pro');
    expect(m('p1-container-yard').classList.contains('proving')).toBe(true);
    expect(m('lab-physics-test').querySelector('.wm-plate b')?.textContent).toBe('LAB');
  });

  it('nav: ← → step the markers along the road (B1 → B2 → B3 → M1 → E1 …), the card follows; ↓ from the last row reaches RIDE; confirm launches after 180 ms', () => {
    const { screen, cb, sfx, on } = fixture();
    screen.nav(1, 0);
    expect(on()).toBe('b2-lean-back');
    screen.nav(1, 0);
    screen.nav(1, 0);
    expect(on()).toBe('m1-hop-up');
    screen.nav(1, 0);
    expect(on()).toBe('e1-uphill-weight');
    expect(document.querySelector('.wm-card .name')?.textContent).toBe('Uphill Weight');
    expect(sfx.tick).toHaveBeenCalled();
    screen.nav(-1, 0);
    screen.nav(-1, 0);
    screen.nav(-1, 0);
    screen.nav(-1, 0);
    expect(on()).toBe('b1-first-ride');
    screen.nav(-1, 0);
    expect(on()).toBe('p5-foundry-floor'); // wraps to the last proving marker
    screen.nav(1, 0);
    expect(on()).toBe('b1-first-ride');
    screen.confirm();
    expect(cb.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb.play).toHaveBeenCalledWith('b1-first-ride');
    expect(sfx.launch).toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(screen.visible).toBe(false);
  });

  it('a locked marker never launches: confirm shakes, the card, the plate and the pill state the rule', () => {
    const { screen, cb, sfx, on } = fixture({ seeded: true });
    for (let i = 0; i < 6; i++) screen.nav(1, 0); // M1 → E1 E2 E3 M2 X1 H1
    expect(on()).toBe('h1-wheelie-wire');
    expect(document.querySelector('.wm-card .rule')?.textContent).toBe('Locked · Medal every Medium track');
    expect(document.querySelector<HTMLButtonElement>('.wm-ride')!.disabled).toBe(true);
    expect(document.querySelector('.wm-ride')!.textContent).toContain('Medal every Medium track');
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
    const b = fixture({ seeded: true, lastPlayed: 'b1-first-ride', recording: true });
    expect(b.on()).toBe('b1-first-ride');
    expect(document.querySelector<HTMLButtonElement>('.wm-ghost')!.hidden).toBe(false);
    b.screen.alt();
    expect(b.cb.watchPb).toHaveBeenCalledWith('b1-first-ride');
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

  it('fog lifts: a rebuild after Medium is medalled animates the Night City fog away instead of dropping it', () => {
    const { screen } = fixture({ seeded: true });
    const before = document.querySelectorAll('.wm-fog ellipse[data-key="nightCity"]').length;
    expect(before).toBeGreaterThan(0);
    expect(document.querySelectorAll('.wm-fog ellipse.open')).toHaveLength(0);
    // Every Medium track medalled now: Hard opens, Night City is no longer locked.
    const medal = (id: string): Medal | null => (SEEDED[id] ?? (id.startsWith('m') ? 'silver' : null)) as Medal | null;
    (screen as unknown as { bestOf: (id: string) => BestEntry | null }).bestOf = (id) => (medal(id) ? ({ time: 50, faults: 0, medal: medal(id), bike: 'rookie' } as unknown as BestEntry) : null);
    screen.build(ALL);
    expect(document.querySelectorAll('.wm-fog ellipse.open[data-key="nightCity"]')).toHaveLength(before);
    expect(document.querySelectorAll('.wm-fog ellipse:not(.open)[data-key="nightCity"]')).toHaveLength(0);
    // A third build: the lifted fog is gone for good.
    screen.build(ALL);
    expect(document.querySelectorAll('.wm-fog ellipse[data-key="nightCity"]')).toHaveLength(0);
  });

  it('the card stands above a marker in the lower part of the view (`.up`), beside one higher up', () => {
    const { screen } = fixture({ seeded: true });
    const view = document.querySelector<HTMLElement>('.wm-view')!;
    Object.defineProperty(view, 'clientWidth', { value: 932, configurable: true });
    Object.defineProperty(view, 'clientHeight', { value: 430, configurable: true });
    const cam = screen as unknown as { cam: { x: number; y: number; k: number }; placeCard(): void };
    const m1 = document.querySelector<HTMLElement>('.wm-marker.on')!;
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
    expect(c.track).toBe('m1-hop-up');
    expect(c.region).toBe('industrial');
    expect(c.far).toBe(false);
    expect(screen.currentRegion()).toBe('industrial');
  });

  it('dev: the `-test` strips get markers too, every tier open, no gate', () => {
    fixture({ dev: true });
    expect(document.querySelectorAll('.wm-marker[data-track$="-test"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.wm-gate')).toHaveLength(0);
    expect(document.querySelectorAll('.wm-marker.locked')).toHaveLength(0);
  });
});
