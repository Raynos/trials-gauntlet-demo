import { afterEach, expect, it, vi } from 'vitest';
import { isNativeApp } from './target';

afterEach(() => vi.unstubAllGlobals());

it('uses the explicit build target and defaults to web without a define', () => {
  expect(isNativeApp()).toBe(false);
  vi.stubGlobal('__NATIVE_APP__', true);
  expect(isNativeApp()).toBe(true);
  vi.stubGlobal('__NATIVE_APP__', false);
  expect(isNativeApp()).toBe(false);
});
