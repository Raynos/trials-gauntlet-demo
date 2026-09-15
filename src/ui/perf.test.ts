/** `?perf=1` overlay lines (docs/design/game.md § perf overlay): the render debugInfo row set and the governor's decision. */
import { describe, expect, it } from 'vitest';
import { perfLines, type PerfSample } from './perf';

const sample: PerfSample = {
  frameMs: { p50: 16.7, p95: 20.1 },
  physicsUs: { p50: 40, p95: 55 },
  stats: { calls: 150, triangles: 90000, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0, texturesMB: 33, renderer: 'x', contextKind: 'webgl2' },
  quality: 'high',
  qualityWhy: 'governor ↑ high (p95 12.0 ms held 8 s)',
  dpr: 1.5,
  render: { tier: 'high', deviceClass: 'phone', profile: 'phone-high', dpr: 1.5, canvasW: 1398, canvasH: 645, calls: 148, tris: 86000, rtMpx: 1.14, passes: 5, shadowMap: 512, heroTris: 12000, skippedFrames: 3, stalePrograms: 0, entryMs: 237 },
  entryHold: false,
};

describe('perfLines', () => {
  it('names every render field and the governor decision', () => {
    const text = perfLines(sample).join('\n');
    for (const s of ['FPS  60', 'RENDER high · phone/phone-high · dpr 1.50 · 1398×645', '148 calls', '86k tris', 'rt 1.14 Mpx', '5 passes', 'shadow 512', 'hero 12k tris', 'skipped 3', 'stale 0', 'entry 237 ms', 'governor ↑ high']) expect(text).toContain(s);
    expect(text).not.toContain('holding');
    expect(perfLines({ ...sample, entryHold: true }).join('\n')).toContain('entry 237 ms (holding)');
  });
  it('a renderer without debugInfo keeps the four base lines', () => {
    expect(perfLines({ ...sample, render: null })).toHaveLength(4);
    expect(perfLines(sample)).toHaveLength(7);
  });
});
