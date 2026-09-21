// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindGraphicsLifecycle } from './graphics';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('graphics interruption binding', () => {
  it('waits for GPU rebuild and ignores a stale restoration after another loss', async () => {
    const canvas = document.createElement('canvas');
    const first = deferred(), second = deferred();
    const host = { setGraphicsAvailable: vi.fn() };
    const whenReady = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const dispose = bindGraphicsLifecycle(host, { canvas, whenReady });
    const loss = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await Promise.resolve();
    expect(host.setGraphicsAvailable.mock.calls).toEqual([[false]]);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    first.resolve();
    await first.promise; await Promise.resolve();
    expect(host.setGraphicsAvailable.mock.calls).toEqual([[false], [false]]);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    second.resolve();
    await vi.waitFor(() => expect(host.setGraphicsAvailable).toHaveBeenLastCalledWith(true));
    dispose();
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(host.setGraphicsAvailable).toHaveBeenCalledTimes(3);
  });

  it('keeps failed recovery unavailable and prevents disposed callbacks from resuming', async () => {
    const canvas = document.createElement('canvas');
    const host = { setGraphicsAvailable: vi.fn() };
    const failure = deferred(), late = deferred();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dispose = bindGraphicsLifecycle(host, { canvas, whenReady: vi.fn().mockReturnValueOnce(failure.promise).mockReturnValueOnce(late.promise) });
    try {
      canvas.dispatchEvent(new Event('webglcontextlost'));
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      failure.reject(new Error('GPU rebuild failed'));
      await vi.waitFor(() => expect(warning).toHaveBeenCalledOnce());
      expect(host.setGraphicsAvailable.mock.calls).toEqual([[false]]);
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      await Promise.resolve();
      dispose(); late.resolve();
      await late.promise; await Promise.resolve();
      expect(host.setGraphicsAvailable.mock.calls).toEqual([[false]]);
    } finally { dispose(); warning.mockRestore(); }
  });
});
