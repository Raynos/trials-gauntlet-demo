import { describe, expect, it } from 'vitest';
import { ASTRA_CLIP_WINDOWS, clipWindows } from './clipAliases';

const legacy = ['stand_attack', 'crouch', 'extend', 'land_absorb', 'idle_breathe', 'sit_cruise', 'forward_attack', 'hang_back'].map((name) => ({ name, duration: name === 'extend' ? 0.633 : name === 'idle_breathe' ? 4 : 0.967 }));
const astra = [['sit_cruise', 59 / 30], ['forward_attack', 119 / 30], ['hang_back', 119 / 30], ['compression', 149 / 30], ['extension', 149 / 30], ['landing_absorption', 149 / 30]].map(([name, duration]) => ({ name: name as string, duration: duration as number }));

describe('clip windows', () => {
  it('passes the legacy authored eight through whole, sampled at their round-13 frames', () => {
    const w = clipWindows(legacy);
    expect([...w.keys()]).toEqual(legacy.map((c) => c.name));
    expect(w.get('land_absorb')).toEqual({ source: 'land_absorb', from: 0, to: 0.967, ref: 0, pose: 0.967 * (8 / 30) });
    expect(w.get('extend')).toEqual({ source: 'extend', from: 0, to: 0.633, ref: 0, pose: 0.633 * (8 / 20) });
    expect(w.get('idle_breathe')).toEqual({ source: 'idle_breathe', from: 0, to: 4, ref: 0, pose: 0 });
  });

  it("adds the game's four names as stance-rested windows of Astra's cycles and keeps the six references", () => {
    const w = clipWindows(astra);
    for (const c of astra) expect(w.get(c.name)).toEqual({ source: c.name, from: 0, to: c.duration, ref: 0, pose: 0 });
    for (const [name, window] of Object.entries(ASTRA_CLIP_WINDOWS)) expect(w.get(name)).toEqual(window);
    expect(w.has('idle_breathe')).toBe(false);
    // Every window rests on the shared stance and samples its hold inside the window.
    for (const window of Object.values(ASTRA_CLIP_WINDOWS)) {
      expect(window.ref).toBe(1);
      expect(window.from).toBe(1);
      expect(window.pose).toBeGreaterThanOrEqual(0);
      expect(window.pose).toBeLessThanOrEqual(window.to - window.from);
    }
  });

  it('never overrides an authored game clip and clamps a window to a shorter re-timed source', () => {
    const w = clipWindows([...astra, { name: 'extend', duration: 0.5 }, { name: 'landing_absorption', duration: 2 }].filter((c, i, a) => a.findIndex((d) => d.name === c.name) === i || c.name === 'landing_absorption'));
    expect(w.get('extend')).toEqual({ source: 'extend', from: 0, to: 0.5, ref: 0, pose: 0.5 * (8 / 20) });
    const short = clipWindows([{ name: 'landing_absorption', duration: 2 }]);
    expect(short.get('land_absorb')).toEqual({ source: 'landing_absorption', from: 1, to: 2, ref: 1, pose: 1 });
    expect(clipWindows([{ name: 'landing_absorption', duration: 0.5 }]).get('land_absorb')).toEqual({ source: 'landing_absorption', from: 0.5, to: 0.5, ref: 0.5, pose: 0 });
    expect(clipWindows([]).size).toBe(0);
  });
});
