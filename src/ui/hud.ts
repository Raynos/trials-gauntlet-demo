import { getStorage } from '../platform/storage';
/**
 * Trials-style DOM HUD: centred run timer + fault pill, checkpoint progress
 * strip, kinetic banners (3-2-1-GO, CRASH!, CHECKPOINT, TRACK FINISHED!),
 * results panel, beginner hints. Every animation is a pure function of the
 * simulated clock in `RunInfo.simTime`, so a capture at any cadence shows the
 * same frames and `animations: disabled` screenshots cannot hide a banner.
 */
import type { BikeClass, GameEvent, InputDevice, Medal, PhysicsState, RunInfo, RunResult, TrackDef } from '../core/types';
import { BOARD_SIZE, type BoardEntry } from './best';
import { formatDelta, formatTime } from './format';
import type { Hud, HudAction } from './index';
import { conceal, isLive, reveal } from './live';
import { TileRow } from './tiles';

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

const RESULTS_LEGEND: Record<InputDevice, string> = {
  keyboard: `<span><kbd>Enter</kbd>Select</span><span><kbd>R</kbd>Retry</span><span><kbd>Esc</kbd>Menu</span>`,
  gamepad: `<span><i class="pad a">A</i>Select</span><span><i class="pad b">B</i>Retry</span>`,
  touch: '',
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
  private readonly strip: HTMLDivElement;
  private readonly stripFill: HTMLDivElement;
  private readonly stripPin: HTMLDivElement;
  private readonly ghostPin: HTMLDivElement;
  private lastGhostX = Number.NaN;
  private stripMarks: HTMLDivElement[] = [];
  private readonly bannersEl: HTMLDivElement;
  private readonly banners: Banner[] = [];
  /** Track entry hold (game.md § entry hold): "Loading <biome>… 1.2 s" where the 3 will be. */
  private readonly entryEl: HTMLDivElement;
  private entryOn = false;
  private lastEntryText = '';
  private readonly hintsEl: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly resKicker: HTMLDivElement;
  private readonly resName: HTMLDivElement;
  private readonly resStats: HTMLDivElement;
  private readonly resTiles: TileRow;
  private readonly resLegend: HTMLDivElement;
  private nextEnabled = true;
  private readonly resTime: HTMLDivElement;
  private readonly resFaults: HTMLDivElement;
  private readonly resPb: HTMLDivElement;
  private readonly resMedals: Record<'platinum' | 'gold' | 'silver' | 'bronze', HTMLDivElement>;
  /** Local per-track leaderboard (game.md § leaderboard): top 5 for the class ridden, this run's row marked. */
  private readonly resBoard: HTMLDivElement;
  private readonly splitEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private splitStart = -1;
  private flashStart = -1;
  private flashKind: 'cp' | 'finish' = 'cp';
  private resultsAt = -1;
  private resultsStage = -1;

  private track: TrackDef | null = null;
  private device: InputDevice = 'keyboard';
  private deviceShown = false;
  private deviceVisible = false;
  private deviceShowUntil = -1;
  private simTime = 0;
  private lastTimerText = '';
  private lastFaults = -1;
  private flipUntil = -1;
  private flipOn = false;
  private pendingCrashAt = -1;
  private crashBanner: Banner | null = null;
  private phase: RunInfo['phase'] = 'menu';
  /** Review inbox control (`src/ui/inbox.ts`, lazy): only built when a review password is stored or the URL has `?review=1`. */
  private readonly noteBtn: HTMLButtonElement | null = null;
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

  /**
   * `_bestOf` is kept for the composition signature; the PB delta is stated by the results panel (from `RunResult`), never floated under the timer.
   * `boardOf` is the local leaderboard source (`BestTimes.board`); without it the results panel shows no board.
   */
  constructor(
    parent: HTMLElement,
    _bestOf?: (trackId: string) => unknown,
    private readonly boardOf?: (trackId: string, bike: BikeClass) => BoardEntry[],
  ) {
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

    // Banners.
    this.bannersEl = el('div', 'banners');
    this.entryEl = el('div', 'entry');
    this.bannersEl.appendChild(this.entryEl);
    for (let i = 0; i < BANNER_POOL; i++) {
      const b = el('div', 'banner');
      this.bannersEl.appendChild(b);
      this.banners.push({ el: b, kind: 'count', start: 0, life: 0, active: false });
    }

    this.hintsEl = el('div', 'hints');

    // Results (SPEC.md §4.2 / §4.3): full-frame overlay in the pause frame — title block top-left,
    // headline centred in the free band, tile row in the lower third, legend bottom-right.
    this.results = el('div', 'results');
    this.results.innerHTML = `
      <div class="ov-head"><div class="ov-title"><div class="ov-kicker"></div><div class="ov-name"></div><div class="ov-stats"></div></div><div class="board" hidden></div></div>
      <div class="ov-free headline">
        <div class="row"><div class="time">0:00.000</div><div class="faults"><span>✕</span> 0 faults</div></div>
        <div class="pb"></div>
        <div class="medals">
          <div class="medal bronze"><i></i><b>Bronze</b><small></small></div>
          <div class="medal silver"><i></i><b>Silver</b><small></small></div>
          <div class="medal gold"><i></i><b>Gold</b><small></small></div>
          <div class="medal platinum"><i></i><b>Platinum</b><small></small></div>
        </div>
      </div>`;
    this.resKicker = this.results.querySelector('.ov-kicker') as HTMLDivElement;
    this.resName = this.results.querySelector('.ov-name') as HTMLDivElement;
    this.resStats = this.results.querySelector('.ov-stats') as HTMLDivElement;
    this.resTime = this.results.querySelector('.time') as HTMLDivElement;
    this.resFaults = this.results.querySelector('.faults') as HTMLDivElement;
    this.resPb = this.results.querySelector('.pb') as HTMLDivElement;
    this.resBoard = this.results.querySelector('.board') as HTMLDivElement;
    this.resMedals = {
      bronze: this.results.querySelector('.medal.bronze') as HTMLDivElement,
      silver: this.results.querySelector('.medal.silver') as HTMLDivElement,
      gold: this.results.querySelector('.medal.gold') as HTMLDivElement,
      platinum: this.results.querySelector('.medal.platinum') as HTMLDivElement,
    };
    this.resTiles = new TileRow(this.results, null);
    this.resTiles.setTiles([
      { id: 'retry', label: 'Retry', icon: 'restart' },
      { id: 'next', label: 'Next track', icon: 'next' },
      { id: 'replay', label: 'Watch replay', icon: 'play' },
      { id: 'menu', label: 'Menu', icon: 'door' },
    ]);
    // A click can only reach a tile through `.results.live` (styles.ts), and live lands from stage-3; this is the same gate for anything else that calls pick().
    this.resTiles.onPick = (id) => {
      if (this.resultsInteractive()) this.onAction?.(id as HudAction);
    };
    const foot = el('div', 'ov-foot');
    this.resLegend = el('div', 'legend');
    this.resLegend.innerHTML = RESULTS_LEGEND.keyboard;
    foot.appendChild(this.resLegend);
    this.results.appendChild(foot);

    this.flashEl = el('div', 'flash');
    this.root.append(this.flashEl, top, this.bannersEl, this.hintsEl, this.results);
    if (reviewEnabled()) {
      this.noteBtn = document.createElement('button');
      this.noteBtn.type = 'button';
      this.noteBtn.className = 'hud-note';
      this.noteBtn.innerHTML = '<span>✎</span><small>Note</small>';
      this.noteBtn.addEventListener('click', () => {
        void import('./inbox').then((m) =>
          m.openInbox({
            hud: () => ({ trackName: this.track?.name ?? '', device: this.device }),
            // Pause through the ordinary HUD action (a no-op outside a run); never touches physics.
            pause: () => {
              if (!this.root.classList.contains('under-overlay')) this.onAction?.('pause');
            },
          }),
        );
      });
      this.root.appendChild(this.noteBtn);
    }
    parent.appendChild(this.root);
  }

  // -- Hud interface --------------------------------------------------------

  setTrack(track: TrackDef): void {
    this.track = track;
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
      this.resLegend.innerHTML = RESULTS_LEGEND[device];
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
      if (this.noteBtn) (info.phase === 'menu' ? conceal : reveal)(this.noteBtn);
      // Finish: the timer freezes green, the progress strip fades, no split / delta floats under the
      // timer (the PB delta is stated once, inside the results panel).
      const fin = info.phase === 'finished';
      this.root.classList.toggle('finished', fin);
      this.timerEl.classList.toggle('frozen', fin);
      if (fin) {
        this.splitStart = -1;
        this.splitEl.style.opacity = '0';
      }
      if (info.phase === 'countdown' || info.phase === 'menu') this.hideResults();
      // One technique line before GO only; nothing floats over play.
      this.hintsEl.classList.toggle('show', info.phase === 'countdown' && this.hintsEl.childElementCount > 0);
    }
    const entry = info.entry ?? null;
    if (entry) {
      // Tenths only: one text write per 100 ms of hold, none while the label is unchanged.
      const text = `Loading ${entry.biome}\u2026 ${(Math.floor(entry.ms / 100) / 10).toFixed(1)} s`;
      if (!this.entryOn) {
        this.entryOn = true;
        this.entryEl.classList.add('show');
      }
      if (text !== this.lastEntryText) {
        this.lastEntryText = text;
        this.entryEl.textContent = text;
      }
    } else if (this.entryOn) {
      this.entryOn = false;
      this.lastEntryText = '';
      this.entryEl.classList.remove('show');
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
    if (info.faults !== this.lastFaults) {
      this.lastFaults = info.faults;
      this.faultsN.textContent = String(info.faults);
    }
    const flip = this.simTime < this.flipUntil;
    if (flip !== this.flipOn) {
      this.flipOn = flip; // dirty-checked: this was the one HUD write that ran every frame of every run
      this.faultsEl.classList.toggle('flip', flip);
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
    if (this.phase === 'finished') return;
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
      this.results.className = `results show stage-${stage}${isLive(this.results) ? ' live' : ''}`;
    }
  }

  showResults(r: RunResult): void {
    this.resultsAt = this.simTime;
    this.resultsStage = -1;
    const name = this.track?.name ?? '';
    const tier = this.track?.tier ?? '';
    const earned = r.medal !== 'bronze' || (r.targetTimeS === null && r.faults === 0);
    this.resKicker.textContent = `Track cleared · ${tier}`;
    this.resKicker.className = `ov-kicker ${earned ? 'green' : ''}`;
    this.resName.textContent = name;
    const T = r.targetTimeS;
    const bike = r.bike === 'pro' ? 'Pro' : 'Rookie';
    this.resStats.innerHTML = `<span>PB <b>${r.previousBest !== null ? formatTime(Math.min(r.previousBest, r.time)) : '—'}</b></span>${T ? `<i>·</i><span>Target <b>${formatTime(T)}</b></span>` : ''}<i>·</i><span>Bike <b class="bike-${r.bike ?? 'rookie'}">${bike}</b></span>`;
    const text = formatTime(r.time);
    const dot = text.indexOf('.');
    this.resTime.innerHTML = `${text.slice(0, dot)}<span class="ms">${text.slice(dot)}</span>`;
    this.resFaults.innerHTML = `<span>✕</span> ${r.faults} ${r.faults === 1 ? 'fault' : 'faults'}`;
    if (r.personalBest) {
      this.resPb.className = 'pb green';
      this.resPb.textContent = r.previousBest === null ? 'First clear' : `${formatDelta(r.time - r.previousBest)} · New personal best`;
    } else if (r.previousBest !== null) {
      this.resPb.className = 'pb behind';
      this.resPb.innerHTML = `<em>${formatDelta(r.time - r.previousBest)}</em> · Best ${formatTime(r.previousBest)}`;
    } else {
      this.resPb.className = 'pb';
      this.resPb.textContent = '';
    }
    const thresholds = T
      ? { platinum: `≤ ${formatTime(T * 0.85)} · 0✕`, gold: `≤ ${formatTime(T)} · ≤1✕`, silver: `≤ ${formatTime(T * 1.25)} · ≤5✕`, bronze: 'finish' }
      : { platinum: '—', gold: '0 faults', silver: '—', bronze: 'finish' };
    for (const k of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const m = this.resMedals[k];
      m.classList.toggle('earned', k === r.medal);
      (m.querySelector('small') as HTMLElement).textContent = thresholds[k];
    }
    this.renderBoard(r);
    this.results.className = 'results show stage-0';
    // Tappable only once the TILES are drawn (stage-3 at 0.6 s, then their 240 ms rise) for the invariant's delay.
    reveal(this.results, { surface: this.resTiles.root, when: () => this.resultsStage >= 3 });
    this.root.classList.add('results-on');
    this.resTiles.setDisabled('next', !this.nextEnabled);
    this.resTiles.focusId(this.nextEnabled ? 'next' : 'retry');
    for (const b of this.banners) if (b.kind === 'finish') this.retire(b); // the panel restates it
  }

  /** The track's top 5 for the class ridden (`BestTimes.board`), medal dot per row, this run's row marked `you`. */
  private renderBoard(r: RunResult): void {
    const rows = this.boardOf?.(r.trackId, r.bike ?? 'rookie') ?? [];
    if (rows.length === 0) {
      this.resBoard.hidden = true;
      this.resBoard.innerHTML = '';
      return;
    }
    const bike = r.bike === 'pro' ? 'Pro' : 'Rookie';
    const rank = r.rank ?? null;
    const items = rows
      .slice(0, BOARD_SIZE)
      .map((e, i) => `<li class="${i + 1 === rank ? 'you' : ''}"><span class="n">${i + 1}</span><i class="dot ${e.medal}" title="${e.medal}"></i><b>${formatTime(e.time)}</b><small>${e.faults}✕</small></li>`)
      .join('');
    this.resBoard.innerHTML = `<div class="board-head">Top ${BOARD_SIZE} · ${bike}${rank ? ` · <em>#${rank}</em>` : ''}</div><ol>${items}</ol>`;
    this.resBoard.hidden = false;
  }

  /** NEXT TRACK is disabled when the next track is locked / this is the last one (App decides); `name` labels the tile with the track ahead. */
  setNextEnabled(on: boolean, name?: string | null): void {
    this.nextEnabled = on;
    this.resTiles.setLabel('next', 'Next track', on && name ? escapeHtml(name) : undefined);
    this.resTiles.setDisabled('next', !on);
    if (this.resultsAt >= 0) this.resTiles.focusId(on ? 'next' : 'retry');
  }

  /** Tiles are on screen (stage ≥ 3, 0.6 s after `showResults`): pad / keyboard may drive them. */
  resultsInteractive(): boolean {
    return this.resultsAt >= 0 && this.resultsStage >= 3;
  }

  /** Results reveal stage 0..5, -1 while the panel is down (instrument). */
  stage(): number {
    return this.resultsAt >= 0 ? this.resultsStage : -1;
  }

  resultsMove(dx: number): void {
    if (this.resultsInteractive()) this.resTiles.move(dx);
  }

  resultsConfirm(): void {
    if (!this.resultsInteractive()) return;
    this.resTiles.press();
    this.resTiles.pick();
  }

  /**
   * Menu backdrop: hide the HUD on this frame, no fade, and drop the countdown banner the backdrop
   * load spawned — the title / menu must be the first thing after the loader crossfade and after
   * run → menu, never a fading timer or a "3" (docs/design/game.md §10).
   */
  hideNow(): void {
    this.phase = 'menu';
    this.root.style.transition = 'none';
    this.root.classList.add('hidden');
    void this.root.offsetHeight;
    this.root.style.transition = '';
    for (const b of this.banners) this.retire(b);
    this.pendingCrashAt = -1;
    if (this.noteBtn) conceal(this.noteBtn);
    this.hideResults();
  }

  /** Replay scrub: every banner / flash / split of the re-simulated stretch is dropped before the next frame. */
  clearBanners(): void {
    for (const b of this.banners) this.retire(b);
    this.crashBanner = null;
    this.pendingCrashAt = -1;
    this.flashStart = -1;
    this.flashEl.style.opacity = '0';
    this.splitStart = -1;
    this.splitEl.style.opacity = '0';
  }

  /** Replay viewer: the REPLAY tile is meaningless on a run with no recording (harness-driven runs, storage off). */
  setReplayEnabled(on: boolean): void {
    this.resTiles.setDisabled('replay', !on);
  }

  /** Replay viewer up: the track plate / device pill give way to the viewer's kicker; timer, faults and strip stay (they read the replayed run). */
  setReplay(on: boolean): void {
    this.root.classList.toggle('replay-on', on);
  }

  /** Level reviewer parked (docs/design/game.md §21): the whole HUD is off — the held world is not a run; RIDE turns it back on. */
  setReview(on: boolean): void {
    this.root.classList.toggle('review-on', on);
  }

  /** Pause overlay up: the whole HUD top band hides (SPEC §6); banners stay. */
  setOverlay(on: boolean): void {
    this.root.classList.toggle('under-overlay', on);
  }

  hideResults(): void {
    conceal(this.results);
    if (this.results.classList.contains('show')) {
      // Hard cut on retry / next / menu: the frame is gone the same tick the world resets.
      this.results.style.transition = 'none';
      this.results.className = 'results';
      void this.results.offsetHeight;
      this.results.style.transition = '';
    } else this.results.className = 'results';
    this.root.classList.remove('results-on');
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

/** Mirrors `reviewEnabled` in src/ui/inbox.ts without importing it (that module stays a lazy chunk). */
function reviewEnabled(): boolean {
  try {
    return /[?&]review=1(&|$)/.test(location.search) || !!getStorage()?.getItem('trials.reviewPassword');
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
