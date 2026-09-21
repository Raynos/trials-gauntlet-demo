import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineHeld, offlineLine } from './offlineStatus';
import { hardReload } from './front';

afterEach(() => vi.unstubAllGlobals());

describe('native offline assets and reload', () => {
  it('reports installed assets without asking a service worker', async () => {
    vi.stubGlobal('__NATIVE_APP__', true);
    const serviceWorker = vi.fn(() => { throw new Error('native must not query service workers'); });
    vi.stubGlobal('navigator', Object.defineProperty({}, 'serviceWorker', { get: serviceWorker }));
    expect(await offlineHeld()).toBeNull();
    expect(serviceWorker).not.toHaveBeenCalled();
    expect(offlineLine(null)).toBe('Offline ready · game files included with this app');
  });

  it('reloads the installed URL without clearing saves, caches or session data', async () => {
    vi.stubGlobal('__NATIVE_APP__', true);
    const reload = vi.fn();
    const replace = vi.fn();
    const clear = vi.fn();
    const keys = vi.fn();
    vi.stubGlobal('location', { reload, replace });
    vi.stubGlobal('sessionStorage', { clear });
    vi.stubGlobal('localStorage', { clear });
    vi.stubGlobal('window', { caches: { keys } });
    await hardReload();
    expect(reload).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
  });
});

describe('website offline status', () => {
  it('keeps uninstalled and cached PWA status unchanged', async () => {
    vi.stubGlobal('__NATIVE_APP__', false);
    vi.stubGlobal('navigator', {});
    expect(await offlineHeld()).toBeNull();
    expect(offlineLine(null)).toBe('');
    expect(offlineLine({ build: 'test', entries: 10, models: 2, bytes: 2_000_000 })).toBe('Offline ready · 2.0 MB in 10 files · iOS clears it after 7 days without opening the game');
  });
});
