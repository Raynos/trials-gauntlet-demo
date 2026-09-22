// @vitest-environment jsdom
/**
 * The crash screen (ask 84): the noise filter's five rules, the headline/stack split, the one-sheet-many-errors
 * counter, the capture-phase hand-off that keeps the inline loader's listener quiet, and the `?crash=` modes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { armCrashTest, crashTestMode, describe as describeThrown, installErrorModal, isNoise, showError } from './errorModal';

const here = { leaving: false, online: true };

afterEach(() => {
  document.getElementById('crash')?.remove();
});

describe('isNoise', () => {
  it('drops the ResizeObserver loop warnings (both engines word it differently)', () => {
    expect(isNoise({ message: 'ResizeObserver loop completed with undelivered notifications.' }, here)).toBe(true);
    expect(isNoise({ message: 'ResizeObserver loop limit exceeded' }, here)).toBe(true);
  });
  it('drops AbortError, by name or by headline', () => {
    expect(isNoise({ message: 'x', error: new DOMException('The operation was aborted.', 'AbortError') }, here)).toBe(true);
    expect(isNoise({ message: 'AbortError: The user aborted a request.' }, here)).toBe(true);
  });
  it('drops a network failure only while leaving or offline; shows it online and staying', () => {
    const e = { message: 'TypeError: Load failed', error: new TypeError('Load failed') };
    expect(isNoise(e, here)).toBe(false);
    expect(isNoise(e, { leaving: true, online: true })).toBe(true);
    expect(isNoise(e, { leaving: false, online: false })).toBe(true);
    expect(isNoise({ message: 'TypeError: Failed to fetch', error: new TypeError('Failed to fetch') }, { leaving: true, online: true })).toBe(true);
  });
  it('drops a redacted cross-origin "Script error." and extension scripts, never our own', () => {
    expect(isNoise({ message: 'Script error.' }, here)).toBe(true);
    expect(isNoise({ message: 'boom', error: new Error('boom'), filename: 'safari-web-extension://abc/content.js' }, here)).toBe(true);
    expect(isNoise({ message: 'boom', error: new Error('boom'), filename: 'https://trials-gauntlet-demo.vercel.app/assets/index-x.js' }, here)).toBe(false);
    expect(isNoise({ message: "TypeError: undefined is not an object (evaluating 'a.b')", error: new TypeError("undefined is not an object (evaluating 'a.b')") }, here)).toBe(false);
  });
});

describe('describe', () => {
  it('splits an Error into headline + stack without repeating the headline (V8 prefixes it)', () => {
    const e = new RangeError('bad');
    e.stack = 'RangeError: bad\n    at tickFrame (index.js:1:2)';
    expect(describeThrown(e)).toEqual({ message: 'RangeError: bad', stack: '    at tickFrame (index.js:1:2)' });
    e.stack = 'tickFrame@index.js:1:2'; // WebKit: frames only
    expect(describeThrown(e).stack).toBe('tickFrame@index.js:1:2');
  });
  it('handles strings, objects and circular objects', () => {
    expect(describeThrown('nope').message).toBe('nope');
    expect(describeThrown({ code: 7 }).message).toBe('{"code":7}');
    const c: Record<string, unknown> = {};
    c['self'] = c;
    expect(describeThrown(c).message).toBe('[object Object]');
  });
});

describe('showError', () => {
  it('one sheet: the first error keeps the headline, later ones tick the counter', () => {
    showError('Error: first', 'at a');
    showError('Error: second', 'at b');
    const roots = document.querySelectorAll('#crash');
    expect(roots.length).toBe(1);
    expect(document.querySelector('#crash .msg')!.textContent).toBe('Error: first');
    expect(document.querySelector('#crash pre.stack')!.textContent).toBe('at a');
    expect(document.querySelector('#crash .n')!.textContent).toContain('+1 more');
    expect(document.querySelector('#crash pre.meta')!.textContent).toMatch(/^build /);
    expect([...document.querySelectorAll('#crash button')].map((b) => b.textContent)).toEqual(['⟳ Reload', 'Copy report', 'Dismiss']);
  });
  it('dismiss removes it and the next error opens a fresh sheet', () => {
    showError('Error: one');
    document.querySelector<HTMLButtonElement>('#crash button.close')!.click();
    expect(document.getElementById('crash')).toBeNull();
    showError('Error: two');
    expect(document.querySelector('#crash .msg')!.textContent).toBe('Error: two');
  });
});

describe('installErrorModal', () => {
  it('capture phase: the sheet opens and a later bubble listener on window (the inline loader) never hears it', () => {
    let loaderHeard = 0;
    installErrorModal();
    addEventListener('error', () => loaderHeard++); // registered after, like the loader's; bubble phase
    dispatchEvent(new ErrorEvent('error', { message: 'Uncaught Error: kaboom', error: new Error('kaboom') }));
    expect(document.querySelector('#crash .msg')!.textContent).toBe('Error: kaboom');
    expect(loaderHeard).toBe(0);
  });
  it('noise is swallowed too, and opens nothing', () => {
    installErrorModal();
    dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    expect(document.getElementById('crash')).toBeNull();
  });
});

describe('?crash=', () => {
  it('parses the modes', () => {
    expect(crashTestMode('?crash=1')).toBe('play');
    expect(crashTestMode('?sw=0&crash=reject')).toBe('reject');
    expect(crashTestMode('?crash=boot')).toBe('boot');
    expect(crashTestMode('?crash=nope')).toBeNull();
    expect(crashTestMode('')).toBeNull();
  });
  it('throws once, from inside setRun, only after the riding threshold', () => {
    const seen: number[] = [];
    const hud = { setRun: (i: { phase: string; runTime: number }) => void seen.push(i.runTime) };
    armCrashTest(hud, 'play', 1);
    hud.setRun({ phase: 'countdown', runTime: 5 });
    hud.setRun({ phase: 'riding', runTime: 0.5 });
    expect(() => hud.setRun({ phase: 'riding', runTime: 1.2 })).toThrow(/crash test/);
    expect(() => hud.setRun({ phase: 'riding', runTime: 1.3 })).not.toThrow();
    expect(seen).toEqual([5, 0.5, 1.2, 1.3]);
  });
});
