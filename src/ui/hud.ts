/**
 * Trials-style DOM HUD: centred run timer + fault pill, checkpoint progress
 * strip, kinetic banners (3-2-1-GO, CRASH!, CHECKPOINT, TRACK FINISHED!),
 * results panel, beginner hints. Every animation is a pure function of the
 * simulated clock in `RunInfo.simTime`, so a capture at any cadence shows the
 * same frames and `animations: disabled` screenshots cannot hide a banner.
 */
import type { GameEvent, InputDevice, Medal, PhysicsState, RunInfo, RunResult, TrackDef } from '../core/types';
import type { BestEntry } from './best';
import { MEDAL_LABEL, formatDelta, formatTime } from './format';
import type { Hud, HudAction } from './index';

type BannerKind = 'count' | 'go' | 'crash' | 'cp' | 'finish';

interface Banner {
  el: HTMLDivElement;
  kind: BannerKind;
  start: number;
  life: number;
  active: boolean;
}

const BANNER_POOL = 8;
const DEVICE_LABEL: Record<InputDevice, string> = { keyboard: 'Keyboard', gamepad: 'Gamepad', touch: 'Touch' };

const DEVICE_PILL_S = 1.5;
const DEFAULT_HINTS: Record<InputDevice, string[]> = {
  keyboard: ['↑ Gas', '↓ Brake', '← Lean back', '→ Lean forward', 'R Restart', 'Hold R Restart track'],
  gamepad: ['RT Gas', 'LT Brake', 'Stick Lean', 'B Restart', 'Hold B Restart track'],
  touch: ['Right thumb Gas / Brake', 'Left thumb Lean', '↻ Restart', 'Hold ↻ Restart track'],
};

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export class DomHud implements Hud {
  readonly root: HTMLDivElement;
  private readonly trackEl: HTMLDivElement;
  private readonly deviceEl: HTMLDivElement;
  private readonly timerEl: HTMLDivElement;
  private readonly faultsEl: HTMLDivElement;
  private readonly faultsN: HTMLSpanElement;
  private readonly deltaEl: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly stripFill: HTMLDivElement;
  private readonly stripPin: HTMLDivElement;
  private readonly ghostPin: HTMLDivElement;
  private lastGhostX = Number.NaN;
  private stripMarks: HTMLDivElement[] = [];
  private readonly bannersEl: HTMLDivElement;
  private readonly banners: Banner[] = [];
  private readonly hintsEl: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly resTime: HTMLDivElement;
  private readonly resFaults: HTMLDivElement;
  private readonly resPb: HTMLDivElement;
  private readonly resMedals: Record<'platinum' | 'gold' | 'silver' | 'bronze', HTMLDivElement>;
  private readonly splitEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private splitStart = -1;
  private flashStart = -1;
  private flashKind: 'cp' | 'finish' = 'cp';
  private resultsAt = -1;
  private resultsStage = -1;

  private track: TrackDef | null = null;
  private best: BestEntry | null = null;
  private device: InputDevice = 'keyboard';
  private deviceShown = false;
  private deviceVisible = false;
  private deviceShowUntil = -1;
  private simTime = 0;
  private lastTimerText = '';
  private lastFaults = -1;
  private flipUntil = -1;
  private pendingCrashAt = -1;
  private crashBanner: Banner | null = null;
  private phase: RunInfo['phase'] = 'menu';
  private lastCheckpoint = -1;
  private lastStripX = Number.NaN;

  onAction: ((action: HudAction) => void) | null = null;

  /** Medal icons from the art manifest for the results panel (fallback: tinted discs). */
  setMedalArt(src: Partial<Record<Medal, string>>): void {
    for (const k of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const i = this.resMedals[k].querySelector<HTMLElement>('i');
      const url = src[k];
      if (!i || !url) continue;
      i.classList.add('img');
      i.style.backgroundImage = `url("${url}")`;
    }
  }

  constructor(parent: HTMLElement, private readonly bestOf: (trackId: string) => BestEntry | null = () => null) {
    this.root = el('div', 'hud hidden');

    // Top band.
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-left');
    this.trackEl = el('div', 'hud-track');
    this.deviceEl = el('div', 'hud-device');
    left.append(this.trackEl, this.deviceEl);
    const center = el('div', 'hud-center');
    this.timerEl = el('div', 'hud-timer');
    this.faultsEl = el('div', 'hud-faults');
    this.faultsEl.innerHTML = '<span class="x">✕</span><span class="n">0</span>';
    this.faultsN = this.faultsEl.querySelector('.n') as HTMLSpanElement;
    center.append(this.timerEl, this.faultsEl);
    this.splitEl = el('div', 'hud-split');
    center.appendChild(this.splitEl);
    const right = el('div', 'hud-right');
    this.strip = el('div', 'strip');
    const bar = el('div', 'bar');
    this.stripFill = el('div', 'fill');
    bar.appendChild(this.stripFill);
    this.stripPin = el('div', 'pin');
    this.ghostPin = el('div', 'pin ghost');
    this.strip.append(bar, el('div', 'finish'), this.ghostPin, this.stripPin);
    right.appendChild(this.strip);
    top.append(left, center, right);
    this.deltaEl = el('div', 'hud-delta');

    // Banners.
    this.bannersEl = el('div', 'banners');
    for (let i = 0; i < BANNER_POOL; i++) {
      const b = el('div', 'banner');
      this.bannersEl.appendChild(b);
      this.banners.push({ el: b, kind: 'count', start: 0, life: 0, active: false });
    }

    this.hintsEl = el('div', 'hints');

    // Results.
    this.results = el('div', 'results');
    this.results.innerHTML = `
      <h2>Track finished</h2>
      <div class="headline"><div class="time">0:00.000</div><div class="faults"><span>✕</span> 0 faults</div></div>
      <div class="pb"></div>
      <div class="medals">
        <div class="medal bronze"><i></i>Bronze<small></small></div>
        <div class="medal silver"><i></i>Silver<small></small></div>
        <div class="medal gold"><i></i>Gold<small></small></div>
        <div class="medal platinum"><i></i>Platinum<small></small></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="retry">Retry</button>
        <button class="btn" data-act="next">Next track</button>
        <button class="btn" data-act="menu">Menu</button>
      </div>`;
    this.resTime = this.results.querySelector('.time') as HTMLDivElement;
    this.resFaults = this.results.querySelector('.faults') as HTMLDivElement;
    this.resPb = this.results.querySelector('.pb') as HTMLDivElement;
    this.resMedals = {
      bronze: this.results.querySelector('.medal.bronze') as HTMLDivElement,
      silver: this.results.querySelector('.medal.silver') as HTMLDivElement,
      gold: this.results.querySelector('.medal.gold') as HTMLDivElement,
      platinum: this.results.querySelector('.medal.platinum') as HTMLDivElement,
    };
    this.results.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act') as HudAction | null;
      if (act) this.onAction?.(act);
    });

    this.flashEl = el('div', 'flash');
    this.root.append(this.flashEl, top, this.deltaEl, this.bannersEl, this.hintsEl, this.results);
    parent.appendChild(this.root);
  }

  // -- Hud interface --------------------------------------------------------

  setTrack(track: TrackDef): void {
    this.track = track;
    this.best = this.bestOf(track.id);
    this.trackEl.innerHTML = `<b>${escapeHtml(track.tier)}</b>${escapeHtml(track.name)}`;
    for (const m of this.stripMarks) m.remove();
    this.stripMarks = [];
    const span = Math.max(1e-6, track.finishX - track.start.pos.x);
    for (const cp of track.checkpoints) {
      const m = el('div', 'mark');
      m.style.left = `${(((cp.x - track.start.pos.x) / span) * 100).toFixed(2)}%`;
      this.strip.appendChild(m);
      this.stripMarks.push(m);
    }
    this.lastCheckpoint = -1;
    this.lastStripX = Number.NaN;
    this.hideResults();
    this.refreshHints();
    for (const b of this.banners) this.retire(b);
  }

  setTrackName(name: string): void {
    this.trackEl.textContent = name;
  }

  /** The pill shows only when the active device changes (and on first detection), for 1.5 s of sim time. */
  setDevice(device: InputDevice, _visible: boolean): void {
    if (device !== this.device || !this.deviceShown) {
      this.device = device;
      this.deviceEl.innerHTML = `<i></i>${DEVICE_LABEL[device]}`;
      this.root.classList.toggle('touch', device === 'touch');
      this.deviceShowUntil = this.simTime + DEVICE_PILL_S;
      this.refreshHints();
    }
    this.deviceShown = true;
  }

  setRun(info: RunInfo): void {
    this.simTime = info.simTime;
    if (info.phase !== this.phase) {
      this.phase = info.phase;
      this.root.classList.toggle('hidden', info.phase === 'menu');
      if (info.phase === 'countdown' || info.phase === 'menu') this.hideResults();
      // One technique line before GO only; nothing floats over play.
      this.hintsEl.classList.toggle('show', info.phase === 'countdown' && this.hintsEl.childElementCount > 0);
    }
    const pillVisible = this.simTime < this.deviceShowUntil;
    if (pillVisible !== this.deviceVisible) {
      this.deviceVisible = pillVisible;
      this.deviceEl.classList.toggle('show', pillVisible);
    }
    const text = formatTime(info.runTime);
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      const dot = text.indexOf('.');
      this.timerEl.innerHTML = `${text.slice(0, dot)}<span class="ms">${text.slice(dot)}</span>`;
    }
    this.timerEl.classList.toggle('frozen', info.phase === 'finished');
    if (info.faults !== this.lastFaults) {
      this.lastFaults = info.faults;
      this.faultsN.textContent = String(info.faults);
    }
    this.faultsEl.classList.toggle('flip', this.simTime < this.flipUntil);

    // Delta vs best at the finish line only (no ghost yet).
    if (info.phase === 'finished' && this.best) {
      const d = info.runTime - this.best.time;
      this.deltaEl.textContent = formatDelta(d);
      this.deltaEl.className = `hud-delta show ${d <= 0 ? 'ahead' : 'behind'}`;
    } else if (this.deltaEl.classList.contains('show')) {
      this.deltaEl.className = 'hud-delta';
    }

    this.animateSplit();
    this.animateFlash();
    this.animateResults();

    // Deferred CRASH! stamp (0.2 s after the fault, Rising timing).
    if (this.pendingCrashAt >= 0 && this.simTime >= this.pendingCrashAt) {
      this.pendingCrashAt = -1;
      this.crashBanner = this.spawn('crash', 'Crash!', 1.4);
    }
    this.animateBanners();
  }

  update(state: PhysicsState, ghost?: PhysicsState | null): void {
    const t = this.track;
    if (!t) return;
    const span = Math.max(1e-6, t.finishX - t.start.pos.x);
    const gx = ghost ? ghost.bike.pos.x : Number.NaN;
    if (!(gx === this.lastGhostX || (Number.isNaN(gx) && Number.isNaN(this.lastGhostX)))) {
      this.lastGhostX = gx;
      if (Number.isNaN(gx)) this.ghostPin.style.opacity = '0';
      else {
        this.ghostPin.style.opacity = '1';
        this.ghostPin.style.left = `${(clamp01((gx - t.start.pos.x) / span) * 100).toFixed(2)}%`;
      }
    }
    const x = state.bike.pos.x;
    if (x !== this.lastStripX) {
      this.lastStripX = x;
      const f = clamp01((x - t.start.pos.x) / span);
      const pct = `${(f * 100).toFixed(2)}%`;
      this.stripFill.style.width = pct;
      this.stripPin.style.left = pct;
    }
    if (state.checkpoint !== this.lastCheckpoint) {
      this.lastCheckpoint = state.checkpoint;
      this.stripMarks.forEach((m, i) => m.classList.toggle('done', i <= state.checkpoint));
    }
  }

  onEvent(event: GameEvent): void {
    switch (event.type) {
      case 'countdown':
        this.spawn('count', String(event.n), 0.9);
        return;
      case 'go':
        this.spawn('go', 'Go!', 0.8);
        return;
      case 'fault':
        if (event.reason !== 'restart') this.pendingCrashAt = this.simTime + 0.2;
        return;
      case 'restart':
        this.pendingCrashAt = -1;
        if (this.crashBanner) {
          this.retire(this.crashBanner);
          this.crashBanner = null;
        }
        if (event.checkpoint >= -1 && this.lastFaults > 0) this.flipUntil = this.simTime + 0.3;
        if (event.checkpoint < 0) {
          this.hideResults();
          for (const b of this.banners) if (b.kind === 'finish') this.retire(b);
        }
        return;
      case 'checkpoint':
        this.spawn('cp', `Checkpoint ${event.index + 1}`, 0.9);
        this.flashKind = 'cp';
        this.flashStart = this.simTime;
        return;
      case 'finish':
        this.spawn('finish', 'Track finished!', 2.3);
        this.flashKind = 'finish';
        this.flashStart = this.simTime;
        return;
      default:
        return;
    }
  }

  showSplit(_checkpoint: number, delta: number): void {
    this.splitEl.textContent = formatDelta(delta);
    this.splitEl.className = `hud-split ${delta <= 0 ? 'ahead' : 'behind'}`;
    this.splitStart = this.simTime;
    this.animateSplit();
  }

  private animateSplit(): void {
    if (this.splitStart < 0) return;
    const age = this.simTime - this.splitStart;
    const life = 1.5;
    const s = this.splitEl.style;
    if (age < 0 || age >= life) {
      this.splitStart = -1;
      s.opacity = '0';
      return;
    }
    const k = easeOut(clamp01(age / 0.12));
    const left = life - age;
    const op = left < 0.3 ? left / 0.3 : 1;
    s.opacity = op.toFixed(3);
    s.transform = `translateX(${(-14 * (1 - k)).toFixed(1)}px) scale(${(1.25 - 0.25 * k).toFixed(3)})`;
  }

  private animateFlash(): void {
    if (this.flashStart < 0) return;
    const age = this.simTime - this.flashStart;
    const life = this.flashKind === 'finish' ? 0.35 : 0.3;
    const s = this.flashEl.style;
    if (age < 0 || age >= life) {
      this.flashStart = -1;
      s.opacity = '0';
      return;
    }
    this.flashEl.className = `flash ${this.flashKind}`;
    // Snap on, decay out (Evolution's white burst / green checkpoint light).
    const k = age / life;
    s.opacity = ((1 - k) * (1 - k)).toFixed(3);
  }

  /** Layered reveal (Evolution results): headline → faults → medal row → earned medal burst → PB line → actions. */
  private animateResults(): void {
    if (this.resultsAt < 0) return;
    const age = this.simTime - this.resultsAt;
    const stage = age < 0.15 ? 0 : age < 0.35 ? 1 : age < 0.6 ? 2 : age < 0.9 ? 3 : age < 1.1 ? 4 : 5;
    if (stage !== this.resultsStage) {
      this.resultsStage = stage;
      this.results.className = `results show stage-${stage}`;
    }
  }

  showResults(r: RunResult): void {
    this.resultsAt = this.simTime;
    this.resultsStage = -1;
    this.resTime.textContent = formatTime(r.time);
    this.resFaults.innerHTML = `<span>✕</span> ${r.faults} ${r.faults === 1 ? 'fault' : 'faults'}`;
    this.resPb.textContent = r.personalBest
      ? r.previousBest === null
        ? 'First clear'
        : `New personal record  ${formatDelta(r.time - r.previousBest)}`
      : r.previousBest !== null
        ? `Best ${formatTime(r.previousBest)}`
        : '';
    const T = r.targetTimeS;
    const thresholds = T
      ? { platinum: `≤ ${formatTime(T * 0.85)} · 0✕`, gold: `≤ ${formatTime(T)} · ≤1✕`, silver: `≤ ${formatTime(T * 1.25)} · ≤5✕`, bronze: 'finish' }
      : { platinum: '—', gold: '0 faults', silver: '—', bronze: 'finish' };
    for (const k of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const m = this.resMedals[k];
      m.classList.toggle('earned', k === r.medal);
      (m.querySelector('small') as HTMLElement).textContent = thresholds[k];
    }
    this.results.querySelector('h2')!.textContent = `${MEDAL_LABEL[r.medal]} · ${this.track?.name ?? ''}`;
    this.results.className = 'results show stage-0';
    this.best = this.bestOf(r.trackId);
    for (const b of this.banners) if (b.kind === 'finish') this.retire(b); // the panel restates it
  }

  hideResults(): void {
    this.results.className = 'results';
    this.resultsAt = -1;
    this.resultsStage = -1;
  }

  dispose(): void {
    this.root.remove();
  }

  // -- internals ------------------------------------------------------------

  /**
   * Countdown-only technique line (the track-select card carries the full technique). The first
   * authored hint wins; beginner tracks without one get a single device keycap pair. Never shown
   * after GO.
   */
  private refreshHints(): void {
    const t = this.track;
    const authored = t?.meta?.hints?.[0] ?? t?.meta?.technique;
    const line = authored ?? (t?.tier === 'beginner' ? DEFAULT_HINTS[this.device][0] : undefined);
    if (!line) {
      this.hintsEl.innerHTML = '';
      this.hintsEl.classList.remove('show');
      return;
    }
    const isDefault = !authored;
    const sp = line.indexOf(' ');
    this.hintsEl.innerHTML =
      isDefault && sp > 0
        ? `<span><kbd>${escapeHtml(line.slice(0, sp))}</kbd>${escapeHtml(line.slice(sp + 1))}</span>`
        : `<span>${escapeHtml(line)}</span>`;
    this.hintsEl.classList.toggle('show', this.phase === 'countdown');
  }

  private spawn(kind: BannerKind, text: string, life: number): Banner {
    let b = this.banners.find((x) => !x.active);
    if (!b) {
      // Pool exhausted: recycle the oldest.
      b = this.banners.reduce((a, c) => (c.start < a.start ? c : a));
    }
    b.kind = kind;
    b.start = this.simTime;
    b.life = life;
    b.active = true;
    b.el.className = `banner ${kind}`;
    b.el.textContent = text;
    this.animateOne(b);
    return b;
  }

  private retire(b: Banner): void {
    b.active = false;
    b.el.style.opacity = '0';
    b.el.style.transform = 'translate(-50%,-50%) scale(0)';
  }

  private animateBanners(): void {
    for (const b of this.banners) if (b.active) this.animateOne(b);
  }

  private animateOne(b: Banner): void {
    const age = this.simTime - b.start;
    if (age >= b.life || age < 0) {
      this.retire(b);
      if (b === this.crashBanner) this.crashBanner = null;
      return;
    }
    const s = b.el.style;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let op = 1;
    const fadeT = b.life - age; // seconds remaining
    switch (b.kind) {
      case 'count': {
        const k = easeOut(clamp01(age / 0.15)); // tall-and-thin snap (Evolution squash-and-stretch)
        sx = 0.55 + 0.45 * k;
        sy = 1.45 - 0.45 * k;
        if (fadeT < 0.2) {
          op = fadeT / 0.2;
          sx *= 1 + (0.2 - fadeT);
          sy *= 1 + (0.2 - fadeT);
        }
        break;
      }
      case 'go': {
        const k = easeOut(clamp01(age / 0.12));
        sx = sy = 1.7 - 0.7 * k;
        const d = clamp01((age - 0.12) / (b.life - 0.12));
        dx = 40 * d;
        dy = -40 * d;
        op = 1 - d * d;
        break;
      }
      case 'crash': {
        const k = clamp01(age / 0.25);
        const over = 1 + 0.12 * Math.sin(k * Math.PI); // slight overshoot
        sx = sy = (0.6 + 0.4 * easeOut(k)) * over;
        rot = -6;
        if (fadeT < 0.15) op = fadeT / 0.15;
        break;
      }
      case 'cp': {
        const k = easeOut(clamp01(age / 0.15));
        dx = -60 * (1 - k);
        op = k;
        if (fadeT < 0.25) op = fadeT / 0.25;
        dy = 90; // sits below the countdown line, still above the bike band
        break;
      }
      case 'finish': {
        const k = easeOut(clamp01(age / 0.12));
        sx = 2.2 - 1.2 * k; // streak in
        op = k;
        if (fadeT < 0.4) op = fadeT / 0.4;
        break;
      }
    }
    s.opacity = op.toFixed(3);
    s.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) rotate(${rot}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  }
}

function el<K extends 'div'>(tag: K, className: string): HTMLDivElement {
  const d = document.createElement(tag);
  d.className = className;
  return d;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
