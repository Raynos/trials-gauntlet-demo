import { describe, expect, it, vi } from 'vitest';
import { bindNativeLifecycle, type LifecycleHost, type NativeLifecycleAdapter } from './lifecycle';

function setup() {
  const listeners = new Map<string, (state: { isActive: boolean }) => void>();
  const removals: ReturnType<typeof vi.fn>[] = [];
  const adapter = {
    addListener: vi.fn(async (event: string, callback: (state: { isActive: boolean }) => void) => {
      listeners.set(event, callback);
      const remove = vi.fn(async () => { listeners.delete(event); });
      removals.push(remove);
      return { remove };
    }),
    getState: vi.fn(async () => ({ isActive: true })),
    minimizeApp: vi.fn(async () => {}),
  };
  const host: LifecycleHost = { setNativeActive: vi.fn(), nativeBack: vi.fn(() => true) };
  return { adapter, host, listeners, removals };
}

describe('native lifecycle adapter', () => {
  it('forwards inactive/active and Back; minimizes only when the host is at root', async () => {
    const { adapter, host, listeners, removals } = setup();
    const dispose = await bindNativeLifecycle(host, adapter as NativeLifecycleAdapter);
    expect(host.setNativeActive).toHaveBeenCalledWith(true);
    listeners.get('appStateChange')!({ isActive: false });
    listeners.get('appStateChange')!({ isActive: true });
    expect(vi.mocked(host.setNativeActive).mock.calls).toEqual([[true], [false], [true]]);
    listeners.get('backButton')!({ isActive: true });
    expect(adapter.minimizeApp).not.toHaveBeenCalled();
    vi.mocked(host.nativeBack).mockReturnValue(false);
    listeners.get('backButton')!({ isActive: true });
    listeners.get('backButton')!({ isActive: true });
    expect(adapter.minimizeApp).toHaveBeenCalledTimes(1);
    await dispose();
    await dispose();
    expect(listeners.size).toBe(0);
    expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });

  it('does not overwrite a newer background event with a stale initial state query', async () => {
    const { adapter, host, listeners } = setup();
    adapter.getState.mockImplementation(async () => {
      listeners.get('appStateChange')!({ isActive: false });
      return { isActive: true };
    });
    const dispose = await bindNativeLifecycle(host, adapter as NativeLifecycleAdapter);
    expect(vi.mocked(host.setNativeActive).mock.calls).toEqual([[false]]);
    await dispose();
  });

  it('removes already registered listeners if initialization fails', async () => {
    const { adapter, host, removals } = setup();
    adapter.getState.mockRejectedValue(new Error('bridge unavailable'));
    await expect(bindNativeLifecycle(host, adapter as NativeLifecycleAdapter)).rejects.toThrow('bridge unavailable');
    expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });
});
