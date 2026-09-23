/**
 * `?bench=1` — the on-device benchmark (Rider on Glass G2; docs/plans/PERF.md §0; docs/device/README.md).
 *
 * The headless bench (harness/bench) sees ~1 ms of JS for the garage frame; the user's iPhone reads 24–28 fps
 * there at a 30 cap. This is the instrument that runs *on the phone*: a fixed list of scenarios, each measured
 * for a fixed window from the app's own RAF loop, with the frame split (`mux.poll` / physics / HUD DOM /
 * `audio.update` / renderer submit / everything else) bracketed by `performance.now()` in `App.tickFrame`
 * and `Game.render` — no allocation per frame, no timers deciding anything: every number is a measured one.
 *
 * Scenarios (full run, 20 s each after a 2 s settle, ≈ 3 min, no input): `menu` (canvas covered — render is
 * off), `garage` (idle bike), `b1 start` (start line after the countdown, HUD + touch layer on), `b1 ride`
 * (the committed bot-3 golden replayed through the game's playback path) at the current tier, then `b1 ride`
 * at low / medium / high forced, then `b1 ride` at cap 60. `&quick=1` = menu + garage, 3 s each (the e2e).
 *
 * Toggles, honoured inside the same scenario list so runs are comparable: `&no=audio` (skip `audio.update`,
 * suspend the context), `&no=hud` (no HUD DOM writes), `&no=render` (skip `renderer.render`, keep the rest),
 * `&no=touch` (layer hidden), `&cap=60` (every scenario at 60). Several: `&no=audio,hud`.
 *
 * Report: on screen at the end (one row per scenario), **Copy report** (clipboard, in the tap's own handler so
 * iOS allows it; textarea fallback) and **Share** (`navigator.share`) — markdown table + JSON in one string;
 * also appended to the local telemetry (`rockhop.benchlog`, in the run-log export). `window.__rockhop.bench`
 * drives it headlessly (`start()`, `state()`, `report()`, `text()`).
 */
import type { QualityTier } from '../core/types';
import type { AudioSystem } from '../audio';
import { isLive, reveal } from '../ui/live';
import { copyText } from '../ui/clipboard';
import type { Game } from './game';

export type BenchToggle = 'audio' | 'hud' | 'render' | 'touch';

export interface BenchOptions {
  /** `&quick=1`: menu + garage, 3 s each (headless proof). */
  quick: boolean;
  no: Set<BenchToggle>;
  /** `&cap=60`: every scenario at this cap (else the app's cap, and the last scenario at 60). */
  cap: 30 | 60 | null;
}

/** `?bench=1[&quick=1][&no=audio,hud,render,touch][&cap=30|60]` → options; null when the bench is off. */
export function parseBenchParams(params: URLSearchParams): BenchOptions | null {
  if (params.get('bench') !== '1') return null;
  const no = new Set<BenchToggle>();
  for (const v of (params.get('no') ?? '').split(',')) {
    if (v === 'audio' || v === 'hud' || v === 'render' || v === 'touch') no.add(v);
  }
  const cap = params.get('cap');
  return { quick: params.get('quick') === '1', no, cap: cap === '60' ? 60 : cap === '30' ? 30 : null };
}

/** One rendered frame's split, filled by `App.tickFrame` (a reused object; never allocated per frame). */
export interface FrameSplit {
  /** Whole `tickFrame` (input poll → advance → HUD/meter housekeeping). */
  totalMs: number;
  pollMs: number;
  /** `game.advance` = physics ticks + the render pass. */
  advanceMs: number;
  physicsMs: number;
  ticks: number;
  hudMs: number;
  audioMs: number;
  submitMs: number;
  /** total − poll − advance, plus the game's state prep before the HUD: the shell's own work (touch settle, lab / perf / trace panels, run info, ghost). */
  otherMs: number;
}

export interface BenchScenarioDef {
  id: string;
  label: string;
  screen: 'menu' | 'garage' | 'start' | 'ride';
  tier: QualityTier | 'current';
  cap: 30 | 60 | 'current';
  seconds: number;
  settleSeconds: number;
}

export function benchScenarios(o: BenchOptions): BenchScenarioDef[] {
  const cap = o.cap ?? 'current';
  if (o.quick) {
    return [
      { id: 'menu', label: 'menu', screen: 'menu', tier: 'current', cap, seconds: 3, settleSeconds: 0.5 },
      { id: 'garage', label: 'garage', screen: 'garage', tier: 'current', cap, seconds: 3, settleSeconds: 0.5 },
    ];
  }
  const S = 20;
  const T = 2;
  return [
    { id: 'menu', label: 'menu', screen: 'menu', tier: 'current', cap, seconds: S, settleSeconds: T },
    { id: 'garage', label: 'garage', screen: 'garage', tier: 'current', cap, seconds: S, settleSeconds: T },
    { id: 'b1-start', label: 'b1 start line', screen: 'start', tier: 'current', cap, seconds: S, settleSeconds: T },
    { id: 'b1-ride', label: 'b1 ride', screen: 'ride', tier: 'current', cap, seconds: S, settleSeconds: T },
    { id: 'b1-ride-low', label: 'b1 ride · low', screen: 'ride', tier: 'low', cap, seconds: S, settleSeconds: T },
    { id: 'b1-ride-medium', label: 'b1 ride · medium', screen: 'ride', tier: 'medium', cap, seconds: S, settleSeconds: T },
    { id: 'b1-ride-high', label: 'b1 ride · high', screen: 'ride', tier: 'high', cap, seconds: S, settleSeconds: T },
    { id: 'b1-ride-cap60', label: 'b1 ride · cap 60', screen: 'ride', tier: 'current', cap: 60, seconds: S, settleSeconds: T },
  ];
}

export interface Pct {
  p50: number;
  p95: number;
  max: number;
}

export interface BenchScenarioResult {
  id: string;
  label: string;
  tier: QualityTier;
  cap: number;
  seconds: number;
  frames: number;
  fps: number;
  /** p50 fps of the first / last 5 s of the window (the thermal proxy on the long ride). */
  fpsFirst5: number;
  fpsLast5: number;
  /** Rendered-frame intervals > 1.5 × the cap period. */
  dropped: number;
  worstMs: number;
  interval: Pct;
  /** RAF callback interval over the window (every callback, rendered or skipped): the display's cadence. */
  raf: Pct;
  rafHz: number;
  total: Pct;
  poll: Pct;
  physics: Pct;
  ticksPerFrame: number;
  hud: Pct;
  audio: Pct;
  submit: Pct;
  other: Pct;
  longTasks: { count: number; totalMs: number; maxMs: number } | null;
  heapMB: { start: number; end: number } | null;
  hidden: boolean;
  render: Record<string, unknown> | null;
}

export interface BenchReport {
  kind: 'rockhop-bench';
  v: 1;
  build: string;
  at: string;
  url: string;
  quick: boolean;
  no: BenchToggle[];
  capParam: number | null;
  device: {
    ua: string;
    platform: string;
    viewport: { w: number; h: number };
    screen: { w: number; h: number };
    devicePixelRatio: number;
    deviceMemory: number | null;
    hardwareConcurrency: number | null;
    battery: { level: number; charging: boolean } | null;
    reduceMotion: boolean;
    standalone: boolean;
    longTasksSupported: boolean;
  };
  physics: string;
  qualityWhy: string;
  scenarios: BenchScenarioResult[];
  /** `b1-ride-high` (or the last ride): fps p50 first 5 s vs last 5 s. */
  thermal: { scenario: string; fpsFirst5: number; fpsLast5: number; dropPct: number } | null;
}

/** What the bench drives (the App provides it). */
export interface BenchHost {
  game: Game;
  audio: AudioSystem | undefined;
  gotoMenu(): void;
  gotoGarage(): void;
  /** b1 at the start line (countdown then idle), HUD + touch layer as in play. */
  startB1(): void;
  /** b1 riding the golden through the playback path (rewinds in place when already up). */
  rideB1(json: string): void;
  setCapOverride(hz: 30 | 60 | null): void;
  currentCap(): number;
  setTouchHidden(hidden: boolean): void;
  qualityWhy(): string;
  build: string;
  physics: string;
}

const MAX_FRAMES = 4096;
const MAX_RAF = 8192;

function pct(buf: Float32Array, n: number): Pct {
  if (n === 0) return { p50: 0, p95: 0, max: 0 };
  const a = Array.from(buf.subarray(0, n)).sort((x, y) => x - y);
  const at = (q: number): number => a[Math.min(n - 1, Math.floor(n * q))]!;
  return { p50: at(0.5), p95: at(0.95), max: a[n - 1]! };
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const rp = (p: Pct): Pct => ({ p50: r2(p.p50), p95: r2(p.p95), max: r2(p.max) });

/** Recorder for one scenario window: typed arrays, filled per rendered frame / per RAF. */
class Window_ {
  n = 0;
  nRaf = 0;
  readonly interval = new Float32Array(MAX_FRAMES);
  readonly at = new Float32Array(MAX_FRAMES);
  readonly total = new Float32Array(MAX_FRAMES);
  readonly poll = new Float32Array(MAX_FRAMES);
  readonly physics = new Float32Array(MAX_FRAMES);
  readonly hud = new Float32Array(MAX_FRAMES);
  readonly audio = new Float32Array(MAX_FRAMES);
  readonly submit = new Float32Array(MAX_FRAMES);
  readonly other = new Float32Array(MAX_FRAMES);
  readonly raf = new Float32Array(MAX_RAF);
  ticks = 0;
  longCount = 0;
  longTotal = 0;
  longMax = 0;
  hidden = false;
  heapStart = 0;
  reset(): void {
    this.n = this.nRaf = 0;
    this.ticks = 0;
    this.longCount = 0;
    this.longTotal = 0;
    this.longMax = 0;
    this.hidden = false;
    this.heapStart = heapMB();
  }
}

function heapMB(): number {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : 0;
}

type Phase = 'idle' | 'loading' | 'settle' | 'record' | 'done';

export class Bench {
  readonly root: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly scenarios: BenchScenarioDef[];
  private phase: Phase = 'idle';
  private index = -1;
  private readonly win = new Window_();
  private results: BenchScenarioResult[] = [];
  private reportObj: BenchReport | null = null;
  private reportText: string | null = null;
  private recordingJson: string | null = null;
  private phaseAt = 0;
  private lastFrameAt = 0;
  private lastRafAt = 0;
  private lastStatus = '';
  private statusAt = 0;
  private initialTier: QualityTier = 'low';
  private battery: { level: number; charging: boolean } | null = null;
  private longTasksSupported = false;
  private observer: PerformanceObserver | null = null;
  private currentTier: QualityTier = 'low';
  private currentCap = 30;

  constructor(
    parent: HTMLElement,
    private readonly host: BenchHost,
    readonly options: BenchOptions,
    private readonly onReport: ((r: BenchReport) => void) | null = null,
  ) {
    this.scenarios = benchScenarios(options);
    this.root = document.createElement('div');
    this.root.className = 'bench';
    this.card = document.createElement('div');
    this.card.className = 'bench-card';
    const toggles = [...options.no].map((t) => `no ${t}`).concat(options.cap ? [`cap ${options.cap}`] : []);
    const secs = this.scenarios.reduce((s, x) => s + x.seconds + x.settleSeconds, 0);
    this.card.innerHTML =
      `<div class="kicker">Device bench</div>` +
      `<h2>${this.scenarios.length} scenarios · ${secs < 60 ? `${secs} s` : `~${Math.ceil(secs / 60)} min`} · no input needed</h2>` +
      `<ol>${this.scenarios.map((s) => `<li>${s.label}${s.tier !== 'current' ? '' : ''} <small>${s.seconds} s</small></li>`).join('')}</ol>` +
      `<p>${toggles.length ? `Toggles: <b>${toggles.join(' · ')}</b>. ` : ''}Keep the screen on and the phone still. The report appears at the end with a Copy button.</p>` +
      `<button type="button" class="btn primary bench-start">Start</button>`;
    this.card.querySelector<HTMLButtonElement>('.bench-start')!.addEventListener('click', () => this.start());
    this.status = document.createElement('div');
    this.status.className = 'bench-status';
    this.status.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'bench-report';
    this.panel.hidden = true;
    this.root.append(this.card, this.status, this.panel);
    parent.appendChild(this.root);
    reveal(this.card.querySelector<HTMLElement>('.bench-start')!, { surface: this.card });
    void this.probeDevice();
  }

  private async probeDevice(): Promise<void> {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    try {
      if (typeof nav.getBattery === 'function') {
        const b = await nav.getBattery();
        this.battery = { level: b.level, charging: b.charging };
      }
    } catch {
      this.battery = null;
    }
  }

  /** The START tap (or `window.__rockhop.bench.start()`): fetch the golden, then scenario 0. */
  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'loading';
    this.card.hidden = true;
    this.status.hidden = false;
    this.initialTier = this.host.game.qualityTier;
    this.installLongTasks();
    const done = (json: string | null): void => {
      this.recordingJson = json;
      this.index = -1;
      this.next(performance.now());
    };
    // The golden is a static asset (public/bench, a copy of harness/inputs/b1-first-ride/bot-3.json — a
    // vitest asserts they match) so the bench chunk stays out of the boot's core set.
    const needsRide = this.scenarios.some((s) => s.screen === 'ride');
    if (!needsRide) done(null);
    else {
      fetch('./bench/b1-bot-3.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : null))
        .then(done)
        .catch(() => done(null));
    }
  }

  private installLongTasks(): void {
    try {
      const supported = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
      this.longTasksSupported = supported;
      if (!supported) return;
      this.observer = new PerformanceObserver((list) => {
        if (this.phase !== 'record') return;
        for (const e of list.getEntries()) {
          if (e.startTime < this.phaseAt) continue;
          this.win.longCount++;
          this.win.longTotal += e.duration;
          if (e.duration > this.win.longMax) this.win.longMax = e.duration;
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this.longTasksSupported = false;
    }
  }

  state(): { running: boolean; done: boolean; scenario: string | null; index: number; total: number } {
    const s = this.scenarios[this.index];
    return { running: this.phase !== 'idle' && this.phase !== 'done', done: this.phase === 'done', scenario: s?.id ?? null, index: this.index, total: this.scenarios.length };
  }

  report(): BenchReport | null {
    return this.reportObj;
  }

  text(): string | null {
    return this.reportText;
  }

  /** Every RAF callback (rendered or skipped): the display cadence. */
  raf(now: number): void {
    if (this.lastRafAt && this.phase === 'record' && this.win.nRaf < MAX_RAF) this.win.raf[this.win.nRaf++] = now - this.lastRafAt;
    this.lastRafAt = now;
  }

  /** Every rendered frame, after `tickFrame`: record the split, advance the state machine. */
  frame(now: number, split: FrameSplit): void {
    const phase = this.phase;
    if (phase === 'idle' || phase === 'loading' || phase === 'done') {
      this.lastFrameAt = now;
      return;
    }
    const sc = this.scenarios[this.index]!;
    if (phase === 'settle') {
      if (now - this.phaseAt >= sc.settleSeconds * 1000) {
        this.phase = 'record';
        this.phaseAt = now;
        this.win.reset();
        this.lastFrameAt = 0;
      }
      this.lastFrameAt = now;
      this.paintStatus(now, sc, 'settle');
      return;
    }
    // record
    const w = this.win;
    if (document.hidden) w.hidden = true;
    if (w.n < MAX_FRAMES && this.lastFrameAt) {
      const i = w.n++;
      w.interval[i] = now - this.lastFrameAt;
      w.at[i] = now - this.phaseAt;
      w.total[i] = split.totalMs;
      w.poll[i] = split.pollMs;
      w.physics[i] = split.physicsMs;
      w.hud[i] = split.hudMs;
      w.audio[i] = split.audioMs;
      w.submit[i] = split.submitMs;
      w.other[i] = split.otherMs;
      w.ticks += split.ticks;
    }
    this.lastFrameAt = now;
    if (sc.screen === 'ride') this.keepRiding();
    if (now - this.phaseAt >= sc.seconds * 1000) {
      this.finishScenario(sc, now - this.phaseAt);
      this.next(now);
    } else this.paintStatus(now, sc, 'record');
  }

  /** The golden is 41 s; a 20 s window never reaches its end, but a longer one loops the ride. */
  private keepRiding(): void {
    const info = this.host.game.playbackInfo();
    if (info && info.ended && this.recordingJson) this.host.game.startPlayback(this.recordingJson, { ghost: false });
  }

  private paintStatus(now: number, sc: BenchScenarioDef, phase: 'settle' | 'record'): void {
    if (now - this.statusAt < 500) return; // two DOM writes per second at most, dirty-checked
    this.statusAt = now;
    const t = phase === 'record' ? `${Math.floor((now - this.phaseAt) / 1000)} / ${sc.seconds} s` : 'settle';
    const text = `bench ${this.index + 1}/${this.scenarios.length} · ${sc.label} · ${this.currentTier[0]!.toUpperCase()} cap ${this.currentCap} · ${t}`;
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.status.textContent = text;
    }
  }

  private next(now: number): void {
    this.index++;
    const sc = this.scenarios[this.index];
    if (!sc) {
      this.finish();
      return;
    }
    this.setup(sc);
    this.phase = 'settle';
    this.phaseAt = now;
    this.lastFrameAt = now;
  }

  private setup(sc: BenchScenarioDef): void {
    const h = this.host;
    const g = h.game;
    // Toggles: every scenario, so the audio context created by the START tap's unlock is suspended too.
    g.benchSkip.hud = this.options.no.has('hud');
    g.benchSkip.audio = this.options.no.has('audio');
    g.benchSkip.render = this.options.no.has('render');
    h.setTouchHidden(this.options.no.has('touch'));
    if (this.options.no.has('audio')) {
      const ctx = (h.audio as { context?: AudioContext | null } | undefined)?.context;
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    }
    const tier = sc.tier === 'current' ? this.initialTier : sc.tier;
    if (g.qualityTier !== tier) g.setQuality(tier);
    this.currentTier = tier;
    h.setCapOverride(sc.cap === 'current' ? null : sc.cap);
    this.currentCap = h.currentCap();
    if (sc.screen === 'menu') {
      if (g.inPlayback()) g.stopPlayback();
      h.gotoMenu();
    } else if (sc.screen === 'garage') {
      if (g.inPlayback()) g.stopPlayback();
      h.gotoGarage();
    } else if (sc.screen === 'start') {
      if (g.inPlayback()) g.stopPlayback();
      h.startB1();
    } else if (this.recordingJson) h.rideB1(this.recordingJson);
    else h.startB1(); // golden missing: the ride rows measure the start line and say so through `frames`/ticks
  }

  private finishScenario(sc: BenchScenarioDef, elapsedMs: number): void {
    const w = this.win;
    const n = w.n;
    const seconds = elapsedMs / 1000;
    const period = 1000 / this.currentCap;
    let dropped = 0;
    let first = 0;
    let last = 0;
    for (let i = 0; i < n; i++) {
      if (w.interval[i]! > period * 1.5) dropped++;
      if (w.at[i]! < 5000) first++;
      if (w.at[i]! >= elapsedMs - 5000) last++;
    }
    const rafP = pct(w.raf, w.nRaf);
    const res: BenchScenarioResult = {
      id: sc.id,
      label: sc.label,
      tier: this.currentTier,
      cap: this.currentCap,
      seconds: r1(seconds),
      frames: n,
      fps: r1(n / seconds),
      fpsFirst5: r1(first / Math.min(5, seconds)),
      fpsLast5: r1(last / Math.min(5, seconds)),
      dropped,
      worstMs: r1(pct(w.interval, n).max),
      interval: rp(pct(w.interval, n)),
      raf: rp(rafP),
      rafHz: rafP.p50 > 0 ? Math.round(1000 / rafP.p50) : 0,
      total: rp(pct(w.total, n)),
      poll: rp(pct(w.poll, n)),
      physics: rp(pct(w.physics, n)),
      ticksPerFrame: n ? r2(w.ticks / n) : 0,
      hud: rp(pct(w.hud, n)),
      audio: rp(pct(w.audio, n)),
      submit: rp(pct(w.submit, n)),
      other: rp(pct(w.other, n)),
      longTasks: this.longTasksSupported ? { count: w.longCount, totalMs: r1(w.longTotal), maxMs: r1(w.longMax) } : null,
      heapMB: w.heapStart ? { start: r1(w.heapStart), end: r1(heapMB()) } : null,
      hidden: w.hidden,
      render: this.host.game.rendererDebug(),
    };
    // three's per-frame counters are not reset while nothing renders (menu, `&no=render`): they would show the
    // last frame that did render — the boot warm-up's — so a window with no submit reports 0 calls / tris.
    if (res.render && res.submit.max === 0) res.render = { ...res.render, calls: 0, tris: 0, renderOff: true };
    this.results.push(res);
  }

  private finish(): void {
    const h = this.host;
    this.phase = 'done';
    this.observer?.disconnect();
    const g = h.game;
    g.benchSkip.hud = g.benchSkip.audio = g.benchSkip.render = false;
    h.setTouchHidden(false);
    h.setCapOverride(null);
    if (g.inPlayback()) g.stopPlayback();
    if (g.qualityTier !== this.initialTier) g.setQuality(this.initialTier);
    h.gotoMenu();
    this.status.hidden = true;
    this.reportObj = this.buildReport();
    this.reportText = formatReport(this.reportObj);
    this.onReport?.(this.reportObj);
    this.showPanel();
  }

  private buildReport(): BenchReport {
    const rides = this.results.filter((r) => r.id.startsWith('b1-ride'));
    const th = this.results.find((r) => r.id === 'b1-ride-high') ?? rides[rides.length - 1] ?? null;
    const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
    const mm = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;
    return {
      kind: 'rockhop-bench',
      v: 1,
      build: this.host.build,
      at: new Date().toISOString(),
      url: location.href,
      quick: this.options.quick,
      no: [...this.options.no],
      capParam: this.options.cap,
      device: {
        ua: navigator.userAgent,
        platform: navigator.platform,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        screen: { w: screen.width, h: screen.height },
        devicePixelRatio: window.devicePixelRatio || 1,
        deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
        hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
        battery: this.battery,
        reduceMotion: mm('(prefers-reduced-motion: reduce)'),
        standalone: mm('(display-mode: standalone)') || nav.standalone === true,
        longTasksSupported: this.longTasksSupported,
      },
      physics: this.host.physics,
      qualityWhy: this.host.qualityWhy(),
      scenarios: this.results,
      thermal: th ? { scenario: th.id, fpsFirst5: th.fpsFirst5, fpsLast5: th.fpsLast5, dropPct: th.fpsFirst5 > 0 ? r1((100 * (th.fpsFirst5 - th.fpsLast5)) / th.fpsFirst5) : 0 } : null,
    };
  }

  private showPanel(): void {
    const r = this.reportObj!;
    const rows = r.scenarios
      .map(
        (s) =>
          `<tr><td>${s.label}</td><td>${s.tier[0]!.toUpperCase()}${s.cap}</td><td><b>${s.fps}</b></td><td>${s.interval.p95}</td><td>${s.worstMs}</td>` +
          `<td>${s.total.p50}</td><td>${s.physics.p50}</td><td>${s.hud.p50}</td><td>${s.audio.p50}</td><td>${s.submit.p50}</td><td>${s.dropped}</td></tr>`,
      )
      .join('');
    const dev = `${r.device.viewport.w}×${r.device.viewport.h} @${r.device.devicePixelRatio} · raf ${r.scenarios[0]?.rafHz ?? '?'} Hz · ${r.build}` + (r.no.length ? ` · no ${r.no.join(',')}` : '') + (r.thermal ? ` · thermal ${r.thermal.fpsFirst5}→${r.thermal.fpsLast5} fps` : '');
    this.panel.innerHTML =
      `<div class="kicker">Bench report</div><div class="bench-dev">${escapeHtml(dev)}</div>` +
      `<div class="bench-tablewrap"><table><thead><tr><th>scenario</th><th>tier·cap</th><th>fps</th><th>p95 ms</th><th>worst</th><th>tick</th><th>phys</th><th>hud</th><th>audio</th><th>submit</th><th>drop</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<div class="bench-btns"><button type="button" class="btn primary bench-copy">Copy report</button>` +
      (typeof navigator.share === 'function' ? `<button type="button" class="btn bench-share">Share</button>` : '') +
      `<button type="button" class="btn bench-again">Run again</button><span class="bench-note"></span></div>`;
    const note = this.panel.querySelector<HTMLElement>('.bench-note')!;
    const copy = this.panel.querySelector<HTMLButtonElement>('.bench-copy')!;
    copy.addEventListener('click', () => {
      if (!isLive(copy)) return;
      void copyText(this.reportText ?? '').then((ok) => {
        note.textContent = ok ? 'Copied — paste it to the parent.' : 'Copy failed: select the text below.';
        if (!ok) this.showRaw();
      });
    });
    this.panel.querySelector<HTMLButtonElement>('.bench-share')?.addEventListener('click', () => {
      void navigator.share({ title: 'Trials bench report', text: this.reportText ?? '' }).catch(() => undefined);
    });
    this.panel.querySelector<HTMLButtonElement>('.bench-again')!.addEventListener('click', () => location.reload());
    this.panel.hidden = false;
    reveal(copy, { surface: this.panel });
  }

  private showRaw(): void {
    if (this.panel.querySelector('textarea')) return;
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = this.reportText ?? '';
    this.panel.appendChild(ta);
    ta.focus();
    ta.select();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Markdown header + table + the JSON in a fenced block: one string for the clipboard / share sheet. */
export function formatReport(r: BenchReport): string {
  const d = r.device;
  const head = [
    `## Trials bench · ${r.at.slice(0, 16).replace('T', ' ')}Z · ${r.build}`,
    '',
    `- device: ${d.ua}`,
    `- viewport ${d.viewport.w}×${d.viewport.h} @ dpr ${d.devicePixelRatio} · screen ${d.screen.w}×${d.screen.h} · cores ${d.hardwareConcurrency ?? '?'} · mem ${d.deviceMemory ?? '?'} GB · battery ${d.battery ? `${Math.round(d.battery.level * 100)}%${d.battery.charging ? ' charging' : ''}` : '?'} · reduce-motion ${d.reduceMotion ? 'on' : 'off'}${d.standalone ? ' · standalone' : ''}`,
    `- physics ${r.physics} · quality: ${r.qualityWhy} · toggles: ${r.no.length ? r.no.map((t) => `no ${t}`).join(', ') : 'none'}${r.capParam ? ` · cap ${r.capParam}` : ''}${r.quick ? ' · quick' : ''}`,
    r.thermal ? `- thermal proxy (${r.thermal.scenario}): ${r.thermal.fpsFirst5} fps first 5 s → ${r.thermal.fpsLast5} fps last 5 s (${r.thermal.dropPct} % drop)` : '- thermal proxy: n/a',
    '',
    '| scenario | tier | cap | raf Hz | fps | fps 0–5 s | fps last 5 s | dropped | worst ms | interval p50 / p95 | tick p50 / p95 | poll | physics (ticks) | hud | audio | submit | other | long tasks | calls / tris / Mpx | heap MB |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const rows = r.scenarios.map((s) => {
    const rd = s.render as Partial<{ calls: number; tris: number; rtMpx: number }> | null;
    const p = (x: Pct): string => `${x.p50} / ${x.p95}`;
    return `| ${s.label} | ${s.tier} | ${s.cap} | ${s.rafHz} | **${s.fps}** | ${s.fpsFirst5} | ${s.fpsLast5} | ${s.dropped} | ${s.worstMs} | ${p(s.interval)} | ${p(s.total)} | ${s.poll.p50} | ${s.physics.p50} (${s.ticksPerFrame}) | ${s.hud.p50} | ${s.audio.p50} | ${p(s.submit)} | ${s.other.p50} | ${s.longTasks ? `${s.longTasks.count} / ${s.longTasks.totalMs} ms` : 'n/a'} | ${rd ? `${rd.calls ?? '?'} / ${rd.tris ?? '?'} / ${rd.rtMpx ?? '?'}` : '—'} | ${s.heapMB ? `${s.heapMB.start}→${s.heapMB.end}` : 'n/a'} |`;
  });
  return [...head, ...rows, '', '```json', JSON.stringify(r), '```', ''].join('\n');
}
