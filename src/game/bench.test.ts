import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { benchScenarios, formatReport, parseBenchParams, type BenchReport, type BenchScenarioResult } from './bench';

const P = (q: string): URLSearchParams => new URLSearchParams(q);

describe('parseBenchParams', () => {
  it('off unless ?bench=1', () => {
    expect(parseBenchParams(P(''))).toBeNull();
    expect(parseBenchParams(P('bench=0&quick=1'))).toBeNull();
  });
  it('reads quick, the no= list (unknown names dropped) and cap', () => {
    const o = parseBenchParams(P('bench=1&quick=1&no=audio,hud,bogus,render,touch&cap=60'))!;
    expect(o.quick).toBe(true);
    expect([...o.no]).toEqual(['audio', 'hud', 'render', 'touch']);
    expect(o.cap).toBe(60);
    expect(parseBenchParams(P('bench=1&cap=45'))!.cap).toBeNull();
    expect(parseBenchParams(P('bench=1&cap=30'))!.cap).toBe(30);
  });
});

describe('benchScenarios', () => {
  it('full list: eight scenarios, 20 s + 2 s settle each, tiers forced on three rides, the last at cap 60', () => {
    const s = benchScenarios({ quick: false, no: new Set(), cap: null });
    expect(s.map((x) => x.id)).toEqual(['menu', 'garage', 'b1-start', 'b1-ride', 'b1-ride-low', 'b1-ride-medium', 'b1-ride-high', 'b1-ride-cap60']);
    expect(s.every((x) => x.seconds === 20 && x.settleSeconds === 2)).toBe(true);
    expect(s.filter((x) => x.screen === 'ride').map((x) => x.tier)).toEqual(['current', 'low', 'medium', 'high', 'current']);
    expect(s[7]!.cap).toBe(60);
    expect(s.slice(0, 7).every((x) => x.cap === 'current')).toBe(true);
    const total = s.reduce((n, x) => n + x.seconds + x.settleSeconds, 0);
    expect(total).toBe(176); // ≈ 3 min
  });
  it('&cap=60 applies to every scenario; &quick=1 is menu + garage at 3 s', () => {
    expect(benchScenarios({ quick: false, no: new Set(), cap: 60 }).every((x) => x.cap === 60)).toBe(true);
    const q = benchScenarios({ quick: true, no: new Set(), cap: null });
    expect(q.map((x) => [x.id, x.seconds])).toEqual([
      ['menu', 3],
      ['garage', 3],
    ]);
  });
});

function row(id: string, over: Partial<BenchScenarioResult> = {}): BenchScenarioResult {
  const p = { p50: 1, p95: 2, max: 3 };
  return {
    id,
    label: id,
    tier: 'low',
    cap: 30,
    seconds: 20,
    frames: 600,
    fps: 30,
    fpsFirst5: 30,
    fpsLast5: 29,
    dropped: 0,
    worstMs: 40,
    interval: { p50: 33.3, p95: 34, max: 40 },
    raf: { p50: 8.3, p95: 8.4, max: 9 },
    rafHz: 120,
    total: p,
    poll: p,
    physics: p,
    ticksPerFrame: 4,
    hud: p,
    audio: p,
    submit: p,
    other: p,
    longTasks: null,
    heapMB: null,
    hidden: false,
    render: { tier: 'low', calls: 111, tris: 97368, rtMpx: 0.66 },
    ...over,
  };
}

describe('formatReport', () => {
  const r: BenchReport = {
    kind: 'trials-bench',
    v: 1,
    build: 'abc1234',
    at: '2026-09-15T12:00:00.000Z',
    url: 'https://x/?bench=1',
    quick: false,
    no: ['audio'],
    capParam: null,
    device: { ua: 'UA', platform: 'iPhone', viewport: { w: 932, h: 430 }, screen: { w: 932, h: 430 }, devicePixelRatio: 3, deviceMemory: null, hardwareConcurrency: 6, battery: { level: 0.8, charging: false }, reduceMotion: false, standalone: false, longTasksSupported: false },
    physics: 'v2',
    qualityWhy: 'phone default (low)',
    scenarios: [row('menu', { render: { tier: 'low', calls: 0, tris: 0, rtMpx: 0.66, renderOff: true } }), row('garage'), row('b1-ride-high', { tier: 'high', fpsFirst5: 30, fpsLast5: 24 })],
    thermal: { scenario: 'b1-ride-high', fpsFirst5: 30, fpsLast5: 24, dropPct: 20 },
  };
  it('is a markdown header + one table row per scenario + the JSON in a fenced block that parses back to the report', () => {
    const t = formatReport(r);
    expect(t.startsWith('## Trials bench · 2026-09-15 12:00Z · abc1234')).toBe(true);
    expect(t).toContain('no audio');
    expect(t).toContain('thermal proxy (b1-ride-high): 30 fps first 5 s → 24 fps last 5 s (20 % drop)');
    expect(t.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| scenario')).length).toBe(3);
    expect(t).toContain('| garage | low | 30 | 120 | **30** |');
    expect(t).toContain('111 / 97368 / 0.66');
    const m = /```json\n([\s\S]*?)\n```/.exec(t);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(r);
  });
});

describe('the bench golden', () => {
  it('public/bench/b1-bot-3.json is the committed b1 golden (harness/inputs/b1-first-ride/bot-3.json): same header (the bot restamps `note`) and the same input runs', () => {
    const root = path.resolve(__dirname, '..', '..');
    type Rec = { header: { trackId: string; physicsHz: number; note?: string }; runs: [number, ...number[]][] };
    const pub = JSON.parse(fs.readFileSync(path.join(root, 'public', 'bench', 'b1-bot-3.json'), 'utf8')) as Rec;
    const src = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'inputs', 'b1-first-ride', 'bot-3.json'), 'utf8')) as Rec;
    const strip = (r: Rec): unknown => ({ ...r, header: { ...r.header, note: undefined } });
    expect(strip(pub)).toEqual(strip(src));
    const rec = pub;
    expect(rec.header.trackId).toBe('b1-first-ride');
    const ticks = rec.runs.reduce((n, r) => n + r[0], 0);
    expect(ticks / rec.header.physicsHz).toBeGreaterThan(20); // the 20 s window never runs off the end
  });
});
