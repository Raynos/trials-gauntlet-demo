// @vitest-environment jsdom
/**
 * The "new build" pill (ask 84): when the server's build counts as newer, and the screens it may sit on
 * (a front screen, never a run, the loader, the crash sheet or the review sheet).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { newerBuild, pillAllowed } from './updatePill';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('newerBuild', () => {
  it('lights only for a different, non-empty build string', () => {
    expect(newerBuild('470d8ac', { build: '9f1c2e3', sha: 'x', time: 't' })).toBe('9f1c2e3');
    expect(newerBuild('470d8ac', { build: '470d8ac' })).toBeNull();
    expect(newerBuild('470d8ac', { build: '' })).toBeNull();
    expect(newerBuild('470d8ac', { build: 7 })).toBeNull();
    expect(newerBuild('470d8ac', null)).toBeNull();
    expect(newerBuild('470d8ac', '<!doctype html>')).toBeNull(); // an SPA fallback answering HTML
  });
});

describe('pillAllowed', () => {
  const ui = (inner: string): void => {
    document.body.innerHTML = `<div id="app"><div id="ui">${inner}</div></div>`;
  };
  it('on a shown front screen', () => {
    ui('<div class="screen menu-screen show"></div>');
    expect(pillAllowed(document)).toBe(true);
  });
  it('never mid-run: no screen shown (HUD, pause, results are not screens)', () => {
    ui('<div class="screen menu-screen"></div><div class="hud"></div><div class="overlay pause-overlay show"></div><div class="results show"></div>');
    expect(pillAllowed(document)).toBe(false);
  });
  it('never over the loader, the crash sheet or the review sheet', () => {
    ui('<div class="screen menu-screen show"></div>');
    document.body.insertAdjacentHTML('beforeend', '<div id="loader"></div>');
    expect(pillAllowed(document)).toBe(false);
    document.getElementById('loader')!.remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="crash"></div>');
    expect(pillAllowed(document)).toBe(false);
    document.getElementById('crash')!.remove();
    document.getElementById('ui')!.insertAdjacentHTML('beforeend', '<div class="inbox show"></div>');
    expect(pillAllowed(document)).toBe(false);
  });
});
