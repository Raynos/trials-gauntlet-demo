// @vitest-environment jsdom
/**
 * The touch-navigation invariant's helper (docs/tasks/touch-navigation-invariant.md §2): `.live` lands only after the
 * watched surface has been observed drawn (effective opacity ≥ .5) for 150 ms, is dropped synchronously by `conceal`,
 * and re-counts from zero if the surface stops being drawn before the delay is up.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_DELAY_MS, conceal, effectiveOpacity, isLive, isLiveTarget, resetLive, reveal, setLiveClock, tickLive } from './live';

let now = 0;
setLiveClock(() => now);

function el(opacity: string, parent: HTMLElement = document.body): HTMLDivElement {
  const d = document.createElement('div');
  d.style.opacity = opacity;
  parent.appendChild(d);
  return d;
}

afterEach(() => {
  resetLive();
  document.body.innerHTML = '';
  now = 0;
});

describe('live.ts', () => {
  it('effectiveOpacity multiplies through ancestors and is 0 under visibility: hidden', () => {
    const a = el('0.5');
    const b = el('0.5', a);
    expect(effectiveOpacity(a)).toBeCloseTo(0.5);
    expect(effectiveOpacity(b)).toBeCloseTo(0.25);
    a.style.visibility = 'hidden';
    expect(effectiveOpacity(b)).toBe(0);
  });

  it('a drawn element goes live only after LIVE_DELAY_MS of being drawn, and a tap target needs .live plus opacity ≥ .5', () => {
    const d = el('1');
    const btn = el('1', d);
    reveal(d);
    tickLive(now);
    expect(isLive(d)).toBe(false);
    now += LIVE_DELAY_MS - 1;
    tickLive(now);
    expect(isLive(d)).toBe(false);
    now += 1;
    tickLive(now);
    expect(isLive(d)).toBe(true);
    expect(isLiveTarget(btn)).toBe(true);
    btn.style.opacity = '0.3';
    expect(isLiveTarget(btn)).toBe(false); // live frame, but this control is not drawn
  });

  it('the delay counts from the first DRAWN frame, not from reveal, and restarts if the surface stops being drawn', () => {
    const d = el('0');
    reveal(d);
    now += 1000;
    tickLive(now); // a second undrawn (a stalled fade): still nothing counted
    expect(isLive(d)).toBe(false);
    d.style.opacity = '0.6';
    tickLive(now); // first drawn frame
    now += LIVE_DELAY_MS / 2;
    tickLive(now);
    d.style.opacity = '0.2'; // dipped under the threshold
    tickLive(now);
    d.style.opacity = '1';
    now += LIVE_DELAY_MS / 2;
    tickLive(now); // drawn again, but only half the delay since it came back
    expect(isLive(d)).toBe(false);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(isLive(d)).toBe(true);
  });

  it('a surface option and a `when` condition gate the watch (results: tiles drawn AND stage ≥ 3)', () => {
    const frame = el('1');
    const tiles = el('0', frame);
    let stage = 0;
    reveal(frame, { surface: tiles, when: () => stage >= 3 });
    tiles.style.opacity = '1';
    now += LIVE_DELAY_MS * 2;
    tickLive(now);
    expect(isLive(frame)).toBe(false); // drawn, but the condition is off
    stage = 3;
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(isLive(frame)).toBe(true);
  });

  it('conceal drops .live synchronously and cancels a pending watch; a re-reveal starts over', () => {
    const d = el('1');
    reveal(d);
    tickLive(now);
    now += LIVE_DELAY_MS;
    tickLive(now);
    expect(isLive(d)).toBe(true);
    conceal(d);
    expect(isLive(d)).toBe(false);
    now += 1000;
    tickLive(now);
    expect(isLive(d)).toBe(false);
    reveal(d);
    tickLive(now);
    now += LIVE_DELAY_MS - 1;
    tickLive(now);
    expect(isLive(d)).toBe(false);
  });
});
