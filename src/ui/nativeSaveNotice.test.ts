// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeSaveStorage, type SaveFiles } from '../platform/native-storage';
import { installNativeSaveNotice } from './nativeSaveNotice';

function disk() {
  const values = new Map<string, string>();
  const state = { denied: false };
  const files: SaveFiles = {
    async read(path) { return values.get(path) ?? null; },
    async write(path, value) { if (state.denied) throw new Error('storage unavailable'); values.set(path, value); },
    async remove(path) { values.delete(path); },
    async rename(from, to) { values.set(to, values.get(from)!); values.delete(from); },
  };
  return { files, state };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('native save failure notice', () => {
  it('preserves the committed save, warns during repeated failure, and retries the newest changes', async () => {
    const { files, state } = disk();
    const saves = await NativeSaveStorage.open(files, null);
    saves.setItem('trials.volume', '0.3');
    await saves.flush();
    const remove = installNativeSaveNotice(saves);
    const notice = document.querySelector<HTMLElement>('.native-save-notice')!;
    const retry = notice.querySelector('button')!;
    expect(notice.hidden).toBe(true);
    state.denied = true;
    saves.setItem('trials.volume', '0.7');
    await expect(saves.flush()).rejects.toThrow('storage unavailable');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('Progress isn’t saved');
    expect((await NativeSaveStorage.open(files, null)).getItem('trials.volume')).toBe('0.3');
    retry.click();
    expect(retry.disabled).toBe(true);
    await vi.waitFor(() => expect(retry.disabled).toBe(false));
    expect(notice.hidden).toBe(false);
    // Further unsaved progress is retained too, not just the first failed mutation.
    saves.setItem('trials.riderOutfit', 'race-bluewhite');
    await expect(saves.flush()).rejects.toThrow();
    state.denied = false;
    retry.click();
    await vi.waitFor(() => expect(notice.hidden).toBe(true));
    const restored = await NativeSaveStorage.open(files, null);
    expect(restored.getItem('trials.volume')).toBe('0.7');
    expect(restored.getItem('trials.riderOutfit')).toBe('race-bluewhite');
    remove();
    expect(document.querySelector('.native-save-notice')).toBeNull();
  });

  it('clears after an automatic successful save and isolates broken status observers', async () => {
    const { files, state } = disk();
    const saves = await NativeSaveStorage.open(files, null);
    installNativeSaveNotice(saves);
    const notice = document.querySelector<HTMLElement>('.native-save-notice')!;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unsubscribe = saves.subscribeSaveStatus(failed => { if (failed) throw new Error('bad presentation'); });
    state.denied = true;
    saves.setItem('trials.sound', '0');
    await expect(saves.flush()).rejects.toThrow('storage unavailable');
    expect(notice.hidden).toBe(false);
    expect(warning).toHaveBeenCalledOnce();
    unsubscribe();
    state.denied = false;
    saves.setItem('trials.volume', '0.5');
    await saves.flush();
    expect(notice.hidden).toBe(true);
    expect((await NativeSaveStorage.open(files, null)).getItem('trials.sound')).toBe('0');
  });
});
