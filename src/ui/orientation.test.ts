// @vitest-environment jsdom
/**
 * Forced landscape: only a portrait touch viewport rotates; the mapping is the
 * exact inverse of the CSS transform (clockwise, game top on the phone's right
 * edge); desktop / harness sizes never get the class.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { applyOrientation, isForcedLandscape, logicalRect, toLogical, toPhysical } from './orientation';
import { UI_CSS } from './styles';

const html = (): HTMLElement => document.documentElement;

afterEach(() => {
  applyOrientation({ touch: false, width: 1280, height: 720 });
});

describe('forced landscape', () => {
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

  it('a portrait phone (390×844 touch) is rotated: logical 844×390, class + vars set', () => {
    const s = applyOrientation({ touch: true, width: 390, height: 844 });
    expect(s).toEqual({ w: 844, h: 390, forced: true });
    expect(isForcedLandscape()).toBe(true);
    expect(html().classList.contains('forced-landscape')).toBe(true);
    expect(html().classList.contains('short')).toBe(true);
    expect(html().style.getPropertyValue('--lw')).toBe('844px');
    expect(html().style.getPropertyValue('--lh')).toBe('390px');
    expect(html().style.getPropertyValue('--vw')).toBe('8.44px');
    expect(html().style.getPropertyValue('--vh')).toBe('3.9px');
  });

  it('mapping is the inverse of rotate(90deg) translateY(-100%) about the top-left corner', () => {
    applyOrientation({ touch: true, width: 390, height: 844 });
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

  it('logicalRect maps a rotated client rect back into the game frame', () => {
    applyOrientation({ touch: true, width: 390, height: 844 });
    const el = document.createElement('div');
    // Restart button at logical (760..840, 10..54) → physical left = 390-54 = 336, right = 380, top = 760, bottom = 840.
    el.getBoundingClientRect = () => ({ left: 336, right: 380, top: 760, bottom: 840, width: 44, height: 80, x: 336, y: 760, toJSON: () => ({}) });
    expect(logicalRect(el)).toEqual({ left: 760, top: 10, right: 840, bottom: 54, width: 80, height: 44 });
  });

  it('stylesheet: safe-area insets rotate with the page, viewport units go through --vw/--vh, phone rules are class-scoped', () => {
    expect(UI_CSS).toMatch(/html\.forced-landscape \{\s*--sat: env\(safe-area-inset-right/);
    expect(UI_CSS).toMatch(/--sal: env\(safe-area-inset-top/);
    expect(UI_CSS).toMatch(/html\.forced-landscape #app \{[^}]*rotate\(90deg\) translateY\(-100%\)/);
    expect(UI_CSS).not.toMatch(/(?<![\w.-])\d*\.?\d+v[wh]\b(?![^{]*--v[wh])/);
    expect(UI_CSS).not.toMatch(/@media \(max-height/);
    expect(UI_CSS).not.toMatch(/@media \(max-width/);
    expect(UI_CSS).toMatch(/html\.short \.pause-title/);
    expect(UI_CSS).not.toMatch(/\.rotate/);
  });
});
