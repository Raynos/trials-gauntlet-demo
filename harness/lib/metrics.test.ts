import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SIM_IDENTICAL_STAMPS, fingerprintMatches, simFingerprint } from './metrics';

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-fp-'));
  const w = (rel: string, body: string): void => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  w('src/physics/v2/bike.ts', 'export const g = 9.81;\n');
  w('src/physics/v2/bike.test.ts', 'test\n');
  w('src/tracks/b1.ts', 'export const b1 = 1;\n');
  w('src/game/rules.ts', 'export const rules = 1;\n');
  w('src/core/hash.ts', 'export const h = 1;\n');
  w('src/core/replay.ts', 'export const r = 1;\n');
  w('src/core/rng.ts', 'export const rng = 1;\n');
  w('src/core/riderGeometry.ts', 'export const torso = 0.52;\n');
  w('src/core/types.ts', 'export interface State { x: number }\n');
  w('src/core/loop.ts', 'export const loop = 1;\n');
  w('src/core/global.d.ts', 'declare const x: number;\n');
  return root;
}

describe('srcFingerprint (round 12: sim files only)', () => {
  it('ignores a types.ts / loop.ts / .d.ts / .test.ts edit and moves on a physics, track, rules or runtime-core edit', () => {
    const root = fixtureRoot();
    const base = simFingerprint(root);
    expect(base).toMatch(/^[0-9a-f]{8}$/);
    for (const rel of ['src/core/types.ts', 'src/core/loop.ts', 'src/core/global.d.ts', 'src/physics/v2/bike.test.ts']) {
      fs.appendFileSync(path.join(root, rel), '// a hook type\n');
      expect(simFingerprint(root), rel).toBe(base);
    }
    let prev = base;
    for (const rel of ['src/physics/v2/bike.ts', 'src/tracks/b1.ts', 'src/game/rules.ts', 'src/core/hash.ts', 'src/core/replay.ts', 'src/core/rng.ts', 'src/core/riderGeometry.ts']) {
      fs.appendFileSync(path.join(root, rel), '// changed\n');
      const next = simFingerprint(root);
      expect(next, rel).not.toBe(prev);
      prev = next;
    }
  });

  it('fingerprintMatches accepts the current stamp and the stamps proven identical to it, nothing else', () => {
    expect(fingerprintMatches('abcd1234', 'abcd1234')).toBe(true);
    expect(fingerprintMatches('abcd1234', 'abcd1235')).toBe(false);
    expect(fingerprintMatches(null, 'abcd1234')).toBe(false);
    expect(fingerprintMatches(undefined, 'abcd1234')).toBe(false);
    for (const [fp, olds] of Object.entries(SIM_IDENTICAL_STAMPS)) {
      for (const old of olds) {
        expect(fingerprintMatches(old, fp)).toBe(true);
        expect(fingerprintMatches(fp, old), 'aliases are one-way: the old stamp is not current').toBe(false);
      }
    }
  });
});
