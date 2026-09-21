// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { browserStorage, getStorage, installStorage } from './storage';

describe('explicit synchronous storage boundary', () => {
  it('uses browser storage by default and restores it after a native adapter is uninstalled', () => {
    expect(getStorage()).toBe(localStorage);
    expect(browserStorage()).toBe(localStorage);
    const override = {} as Storage;
    const undo = installStorage(override);
    expect(getStorage()).toBe(override);
    expect(window.localStorage).toBe(localStorage); // globals are untouched
    undo();
    expect(getStorage()).toBe(localStorage);
  });
});
