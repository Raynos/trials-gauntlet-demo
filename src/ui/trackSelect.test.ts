// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Medal, TrackDef } from '../core/types';
import { getTrack, listTrackIds } from '../tracks';
import type { ArtManifest } from './art';
import type { BestEntry } from './best';
import { TrackSelectScreen, type FrontCallbacks, type FrontState } from './front';
import type { UiSfx } from './sfx';

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

function fixture(o: { seeded?: boolean; lastPlayed?: string | null; recording?: boolean } = {}) {
  const bestOf = (id: string): BestEntry | null => {
    const medal = o.seeded ? SEEDED[id] : undefined;
    if (!medal) return null;
    return { time: 41.2, faults: 0, medal, bike: id === 'e3-stairway' ? 'pro' : 'rookie', ...(o.recording ? { recording: '{}' } : {}) } as unknown as BestEntry;
  };
  const state = { dev: false, lastPlayed: o.lastPlayed ?? null, ghost: true, bikeClass: 'rookie' } as FrontState;
  const cb = { play: vi.fn(), goto: vi.fn(), watchPb: vi.fn() } as unknown as FrontCallbacks;
  const sfx = { tick: vi.fn(), confirm: vi.fn(), back: vi.fn(), launch: vi.fn() } as unknown as UiSfx;
  const art = { whenReady: (f: () => void) => f(), probe: () => Promise.resolve(false), medal: () => null, applyBackground: () => undefined } as unknown as ArtManifest;
  const screen = new TrackSelectScreen(document.body, sfx, art, cb, bestOf, () => state, () => []);
  screen.build(ALL);
  screen.show();
  const on = (): string | undefined => document.querySelector<HTMLElement>('.tpin.on')?.dataset['track'];
  const page = (): string | undefined => document.querySelector<HTMLElement>('.tm.on')?.dataset['id'];
  return { screen, cb, sfx, on, page };
}

describe('track select — one world map (six regions on one mountain, a camera, pins)', () => {
  it('builds six regions in one scene, one altimeter rung each (the summit on top), the CSS injected once, and every pin is a button with its track id', () => {
    fixture();
    expect(document.querySelectorAll('.tregion')).toHaveLength(6);
    expect(document.querySelectorAll('.tscene')).toHaveLength(1);
    expect(document.querySelectorAll('.tseam')).toHaveLength(5);
    expect(document.querySelectorAll('.tm')).toHaveLength(6);
    expect([...document.querySelectorAll<HTMLElement>('.tm')].map((b) => b.dataset['id'])).toEqual(['foundry', 'nightCity', 'snow', 'canyon', 'industrial', 'island']);
    // One trail over the whole mountain, one gate barrier.
    expect(document.querySelectorAll('.troute .route')).toHaveLength(1);
    expect(document.querySelectorAll('.gate')).toHaveLength(1);
    expect(document.querySelectorAll('style#trackmap-css')).toHaveLength(1);
    const pins = [...document.querySelectorAll<HTMLButtonElement>('.tpin')];
    expect(pins.length).toBe(ALL.filter((t) => !t.id.endsWith('-test') || t.id.startsWith('lab-')).length);
    expect(pins.every((p) => p.tagName === 'BUTTON' && !!p.dataset['track'])).toBe(true);
    // One map, nothing scrolls (the camera is a transform on the scene root); the head, the altimeter and the MENU pill stay.
    expect(document.querySelectorAll('.tmap')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.tscene')!.style.transform).toMatch(/translate\(.*\) scale\(/);
    expect(document.querySelector('.tracks-screen .backbtn')?.textContent).toContain('Menu');
    expect(document.querySelector('.tracks-totals')?.textContent).toContain('0/15 cleared');
  });

  it('fresh profile opens on Industrial with B1 focused; the card carries RIDE and REVIEW; the gate barrier names E1 and its rule', () => {
    const { on, page } = fixture();
    expect(page()).toBe('industrial');
    expect(on()).toBe('b1-first-ride');
    expect(document.querySelector('.tcard .tc-name')?.textContent).toBe('First Ride');
    expect(document.querySelector<HTMLElement>('.tcard')?.dataset['page']).toBe('industrial');
    expect(document.querySelector('.tcard .tc-ride')?.textContent).toBe('Ride');
    expect(document.querySelector('.tcard .tc-review')).not.toBeNull();
    expect((document.querySelector('.tcard .tc-ghost') as HTMLButtonElement).hidden).toBe(true);
    const gate = document.querySelector<HTMLButtonElement>('.gate')!;
    expect(gate.dataset['track']).toBe('e1-uphill-weight');
    expect(gate.textContent).toContain('Medal every Beginner track');
    expect(gate.textContent).toContain('E1 Uphill Weight');
    expect(document.querySelector('.tpin[data-track=b1-first-ride] .flag')?.textContent).toBe('Up next');
  });

  it('seeded (6/15): opens on M1 (UP NEXT) at the opening zoom, Night City pins carry the Hard rule, totals read 6/15, the barrier names H1 on the trail, the altimeter shows the locks', () => {
    const { on, page, screen } = fixture({ seeded: true });
    expect(page()).toBe('industrial');
    expect(on()).toBe('m1-hop-up');
    expect(document.querySelector('.tracks-totals')?.textContent).toContain('6/15 cleared');
    expect(document.querySelector('.tpin[data-track=h1-wheelie-wire] .rule')?.textContent).toBe('Medal every Medium track');
    const gate = document.querySelector<HTMLButtonElement>('.gate')!;
    expect(gate.textContent).toContain('H1 Rooftop Wire');
    expect(gate.textContent).toContain('Hard · Medal every Medium track');
    expect(document.querySelector('.troute .route .lit')).not.toBeNull();
    expect([...document.querySelectorAll('.tregion[data-page=industrial] .ledge i')].map((i) => i.className)).toEqual(['gold', 'silver', 'bronze', 'open']);
    expect([...document.querySelectorAll('.tm[data-id=nightCity] .tm-dots i')].map((i) => i.className)).toEqual(['locked', 'locked']);
    expect(document.querySelector('.tm[data-id=nightCity]')?.classList.contains('locked')).toBe(true);
    const cam = screen.camera();
    expect(cam.zoom).toBeCloseTo(1.3, 5);
    expect(cam.zoomMin).toBeLessThan(cam.zoom);
    expect(cam.zoomMax).toBeGreaterThan(cam.zoom);
  });

  it('last played wins the opening focus when its tier is open', () => {
    const { on, page } = fixture({ seeded: true, lastPlayed: 'e3-stairway' });
    expect(page()).toBe('canyon');
    expect(on()).toBe('e3-stairway');
  });

  it('←→ walks the pins then crosses to the next region; ↑↓ steps regions; the card follows', () => {
    const { screen, on, page, sfx } = fixture();
    screen.nav(1, 0);
    expect(on()).toBe('b2-lean-back');
    screen.nav(1, 0);
    screen.nav(1, 0);
    expect(on()).toBe('m1-hop-up');
    screen.nav(1, 0);
    expect(page()).toBe('canyon');
    expect(on()).toBe('e1-uphill-weight');
    screen.nav(-1, 0);
    expect(page()).toBe('industrial');
    expect(on()).toBe('m1-hop-up');
    screen.nav(0, -1);
    expect(page()).toBe('island');
    expect(sfx.tick).toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('.tcard')?.dataset['page']).toBe('island');
  });

  it('Enter on an open pin launches it (play ≈180 ms into the fly-up); on a locked pin it shakes and never launches', () => {
    const { screen, cb, sfx, on } = fixture();
    screen.nav(1, 0);
    screen.nav(1, 0);
    screen.nav(1, 0);
    expect(on()).toBe('m1-hop-up');
    screen.confirm();
    expect(cb.play).not.toHaveBeenCalled();
    expect(sfx.back).toHaveBeenCalledTimes(1);
    screen.nav(-1, 0);
    screen.confirm();
    expect(sfx.launch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(cb.play).toHaveBeenCalledWith('b3-kicker-row');
  });

  it('a tap on an unfocused pin focuses it; a tap on the focused pin launches; an altimeter rung flies to its region; the gate barrier flies to its pin', () => {
    const { cb, on, page } = fixture();
    const b2 = document.querySelector<HTMLButtonElement>('.tpin[data-track=b2-lean-back]')!;
    b2.click();
    expect(on()).toBe('b2-lean-back');
    expect(cb.play).not.toHaveBeenCalled();
    b2.click();
    vi.advanceTimersByTime(200);
    expect(cb.play).toHaveBeenCalledWith('b2-lean-back');
    vi.advanceTimersByTime(500);
    document.querySelector<HTMLButtonElement>('.tm[data-id=snow]')!.click();
    expect(page()).toBe('snow');
    expect(on()).toBe('m2-drum-roll');
    document.querySelector<HTMLButtonElement>('.gate')!.click();
    expect(page()).toBe('canyon');
    expect(on()).toBe('e1-uphill-weight');
  });

  it('the card: ↓ reaches its actions, REVIEW goes to the review picker, the ghost button watches the PB', () => {
    const { screen, cb } = fixture({ seeded: true, recording: true });
    screen.nav(-1, 0); // M1 → B3 (has a recording)
    screen.nav(0, 1);
    expect(document.querySelector('.tcard .tc-ride.on')).not.toBeNull();
    screen.nav(1, 0);
    screen.confirm();
    expect(cb.watchPb).toHaveBeenCalledWith('b3-kicker-row');
    screen.nav(1, 0);
    screen.confirm();
    expect(cb.goto).toHaveBeenCalledWith('review');
    screen.nav(0, -1);
    expect(document.querySelector('.tcard .tc-actions .on')).toBeNull();
    screen.back();
    expect(cb.goto).toHaveBeenLastCalledWith('menu');
  });
});
