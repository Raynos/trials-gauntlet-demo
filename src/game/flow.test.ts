import { describe, expect, it } from 'vitest';
import { resolveBoot } from './flow';

const has = (id: string): boolean => id === 'b1-first-ride' || id === 'e1-uphill-weight';

describe('boot routing', () => {
  it('?harness=1 bypasses the menu entirely (hook-only mode)', () => {
    expect(resolveBoot(new URLSearchParams('harness=1'), has).mode).toBe('harness');
    expect(resolveBoot(new URLSearchParams('harness=1&track=e1-uphill-weight'), has)).toMatchObject({ mode: 'harness', track: 'e1-uphill-weight' });
    // Even with dev / countdown flags the harness never gets a front end.
    expect(resolveBoot(new URLSearchParams('harness=1&dev=1&countdown=1'), has).mode).toBe('harness');
  });

  it('?track= goes straight into that track when it exists', () => {
    expect(resolveBoot(new URLSearchParams('track=e1-uphill-weight'), has)).toMatchObject({ mode: 'run', track: 'e1-uphill-weight' });
    expect(resolveBoot(new URLSearchParams('track=nope'), has).mode).toBe('front');
  });

  it('a plain visit opens the main menu with the harbour backdrop', () => {
    const r = resolveBoot(new URLSearchParams(''), has);
    expect(r).toMatchObject({ mode: 'front', track: null, dev: false, backdrop: 'c1-low-tide' });
  });

  it('?dev=1 is carried for the unlock-all rule', () => {
    expect(resolveBoot(new URLSearchParams('dev=1'), has).dev).toBe(true);
  });
});
