// @vitest-environment jsdom
/**
 * Rotate-to-play: applyOrientation never rotates (forced landscape was
 * abandoned, round 3); it only sets the short/narrow layout classes. The
 * mapping helpers stay as utilities and their rotated branch is checked via
 * the test hook.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { _setOrientationForTest, applyOrientation, isForcedLandscape, logicalRect, toLogical, toPhysical } from './orientation';
import { UI_CSS } from './styles';

const html = (): HTMLElement => document.documentElement;

afterEach(() => {
  _setOrientationForTest({ forced: false, physW: 0, physH: 0 });
  applyOrientation({ touch: false, width: 1280, height: 720 });
});

describe('orientation (rotate-to-play)', () => {
  it('desktop / harness 1280×720: no rotation class, identity mapping, no viewport overrides', () => {
    const s = applyOrientation({ touch: false, width: 1280, height: 720 });
    expect(s).toEqual({ w: 1280, h: 720, forced: false });
    expect(html().classList.contains('forced-landscape')).toBe(false);
    expect(html().classList.contains('short')).toBe(false);
    expect(html().style.getPropertyValue('--vw')).toBe('');
    expect(toLogical(100, 50)).toEqual({ x: 100, y: 50 });
  });

  it('a portrait DESKTOP window (mouse) is never rotated', () => {
    const s = applyOrientation({ touch: false, width: 600, height: 900 });
    expect(s.forced).toBe(false);
    expect(html().classList.contains('forced-landscape')).toBe(false);
  });

  it('a landscape phone (844×390 touch) is not rotated but gets the short/narrow layout classes', () => {
    const s = applyOrientation({ touch: true, width: 844, height: 390 });
    expect(s).toEqual({ w: 844, h: 390, forced: false });
    expect(html().classList.contains('short')).toBe(true);
    expect(html().classList.contains('narrow')).toBe(false);
  });

  it('a portrait phone (390×844 touch) is NOT rotated: the CSS portrait prompt takes over', () => {
    const s = applyOrientation({ touch: true, width: 390, height: 844 });
    expect(s).toEqual({ w: 390, h: 844, forced: false });
    expect(isForcedLandscape()).toBe(false);
    expect(html().classList.contains('forced-landscape')).toBe(false);
    expect(html().style.getPropertyValue('--lw')).toBe('');
    expect(html().style.getPropertyValue('--vw')).toBe('');
  });

  it('utility mapping (test hook only) is the inverse of rotate(90deg) translateY(-100%) about the top-left corner', () => {
    _setOrientationForTest({ forced: true, physW: 390, physH: 844 });
    // Logical origin (game top-left) sits at the phone's top-RIGHT corner (notch side = game left).
    expect(toPhysical(0, 0)).toEqual({ x: 390, y: 0 });
    // Game top-right → phone bottom-right (home indicator side = game right).
    expect(toPhysical(844, 0)).toEqual({ x: 390, y: 844 });
    // Game bottom-left → phone top-left.
    expect(toPhysical(0, 390)).toEqual({ x: 0, y: 0 });
    // Round trip.
    for (const [x, y] of [[0, 0], [844, 390], [700, 100], [123, 321]]) {
      const p = toPhysical(x!, y!);
      expect(toLogical(p.x, p.y)).toEqual({ x, y });
    }
    // Right half of the game (GAS side) = lower half of the phone (y > 422).
    expect(toLogical(200, 700).x).toBeGreaterThan(422);
    expect(toLogical(200, 100).x).toBeLessThan(422);
  });

  it('logicalRect maps a rotated client rect back into the game frame (test hook only)', () => {
    _setOrientationForTest({ forced: true, physW: 390, physH: 844 });
    const el = document.createElement('div');
    // Restart button at logical (760..840, 10..54) → physical left = 390-54 = 336, right = 380, top = 760, bottom = 840.
    el.getBoundingClientRect = () => ({ left: 336, right: 380, top: 760, bottom: 840, width: 44, height: 80, x: 336, y: 760, toJSON: () => ({}) });
    expect(logicalRect(el)).toEqual({ left: 760, top: 10, right: 840, bottom: 54, width: 80, height: 44 });
  });

  it('stylesheet: no forced-landscape rules; the portrait prompt is CSS-gated on portrait + coarse pointer; phone rules are class-scoped', () => {
    expect(UI_CSS).not.toMatch(/forced-landscape/);
    expect(UI_CSS).toMatch(/@media \(orientation: portrait\) and \(pointer: coarse\)[^{]*\{ \.rotate\.armed \{ display: flex; \}/);
    expect(UI_CSS).toMatch(/--sat: env\(safe-area-inset-top/);
    expect(UI_CSS).not.toMatch(/@media \(max-height/);
    expect(UI_CSS).toMatch(/html\.short \.pause-title/);
  });
});
