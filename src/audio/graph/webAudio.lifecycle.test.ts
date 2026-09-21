// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WebAudioSystem } from './webAudio';

it('keeps native background audio suspended despite recovery events and unlock attempts', async () => {
  const context = {
    state: 'running', onstatechange: null as (() => void) | null,
    suspend: vi.fn(async () => { context.state = 'suspended'; context.onstatechange?.(); }),
    resume: vi.fn(async () => { context.state = 'running'; }),
  };
  const audio = new WebAudioSystem({ context: context as unknown as AudioContext });
  // The lifecycle contract is independent of worklet graph construction.
  Object.assign(audio, { buildBackend: vi.fn(async () => {}) });
  await audio.unlock();
  audio.setAppActive(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await audio.unlock();
  expect(context.suspend).toHaveBeenCalledOnce();
  expect(context.resume).not.toHaveBeenCalled();
  audio.setAppActive(true);
  expect(context.resume).not.toHaveBeenCalled();
  await audio.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
  audio.dispose();
});

describe('native audio before first user gesture', () => {
  it('does not create a context while inactive', async () => {
    const audio = new WebAudioSystem();
    audio.setAppActive(false);
    await audio.unlock();
    expect(audio.context).toBeNull();
    audio.dispose();
  });
});
