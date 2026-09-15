/**
 * Replay viewer transport (docs/design/game.md §16): one bar in the lower band — play/pause,
 * restart, scrub track with the run clock either side, speed segment (¼ ½ 1×), camera segment
 * (Game / Wide / Fixed), exit — and a quiet kicker top-left (`REPLAY · LAST RUN`, track, ghost
 * note). DOM/CSS on the shared tokens; ≥ 44 px targets; the scrub track takes pointer capture so
 * a thumb can drag off it. Keyboard / pad drive the same callbacks through the app (`src/game/replay.ts`).
 */
import type { ReplayCameraMode } from '../core/types';
import { formatTime } from './format';
import { tileIconSvg } from './tiles';
import { conceal, reveal } from './live';

export interface ReplayBarState {
  tick: number;
  length: number;
  physicsHz: number;
  playing: boolean;
  /** Recording exhausted and the coast settled: the play button reads ↺. */
  ended: boolean;
  speed: number;
  camera: ReplayCameraMode;
}

export interface ReplayBarCallbacks {
  toggle(): void;
  restart(): void;
  /** Scrub to a fraction of the recording; `live` while the pointer is still down. */
  seek(frac: number, live: boolean): void;
  setSpeed(v: number): void;
  setCamera(m: ReplayCameraMode): void;
  exit(): void;
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1] as const;
export const REPLAY_CAMERAS: { id: ReplayCameraMode; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'follow-wide', label: 'Wide' },
  { id: 'fixed', label: 'Fixed' },
];

const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor"/></svg>';
const AGAIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/></svg>';
const EXIT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export class ReplayBar {
  readonly root: HTMLDivElement;
  private readonly kicker: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly tNow: HTMLSpanElement;
  private readonly tEnd: HTMLSpanElement;
  private readonly scrub: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly camBtns: HTMLButtonElement[] = [];
  private readonly legend: HTMLDivElement;
  private dragging = false;
  private lastFrac = -1;
  private lastPlay = '';
  private lastNow = '';
  visible = false;

  constructor(parent: HTMLElement, private readonly cb: ReplayBarCallbacks) {
    this.root = h('div', 'replay');
    const head = h('div', 'rp-head');
    this.kicker = h('div', 'ov-kicker', 'Replay');
    this.name = h('div', 'ov-name');
    this.note = h('div', 'ov-stats');
    head.append(this.kicker, this.name, this.note);

    const bar = h('div', 'rp-bar');
    this.playBtn = btn('rp-play', tileIconSvg('play'), 'Play / pause', () => this.cb.toggle());
    const again = btn('rp-again', AGAIN_ICON, 'Restart replay', () => this.cb.restart());
    this.tNow = document.createElement('span');
    this.tNow.className = 'rp-time';
    this.tEnd = document.createElement('span');
    this.tEnd.className = 'rp-time end';
    this.scrub = h('div', 'rp-scrub');
    this.fill = h('div', 'rp-fill');
    this.knob = h('div', 'rp-knob');
    this.scrub.append(h('div', 'rp-track'), this.fill, this.knob);
    const speeds = h('div', 'rp-seg speeds');
    for (const v of REPLAY_SPEEDS) {
      const b = btn('rp-opt', v === 1 ? '1×' : v === 0.5 ? '½×' : '¼×', `${v}× speed`, () => this.cb.setSpeed(v));
      b.dataset['v'] = String(v);
      speeds.appendChild(b);
      this.speedBtns.push(b);
    }
    const cams = h('div', 'rp-seg cams');
    for (const c of REPLAY_CAMERAS) {
      const b = btn('rp-opt', c.label, `${c.label} camera`, () => this.cb.setCamera(c.id));
      b.dataset['cam'] = c.id;
      cams.appendChild(b);
      this.camBtns.push(b);
    }
    const exit = btn('rp-exit', `${EXIT_ICON}<span>Exit</span>`, 'Exit replay', () => this.cb.exit());
    bar.append(this.playBtn, again, this.tNow, this.scrub, this.tEnd, speeds, cams, exit);

    this.legend = h('div', 'legend rp-legend');
    this.root.append(head, bar, this.legend);
    parent.appendChild(this.root);

    // Scrub: pointer capture so the drag survives leaving the track; live seeks while down.
    this.scrub.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dragging = true;
      this.scrub.setPointerCapture(e.pointerId);
      this.cb.seek(this.frac(e), true);
    });
    this.scrub.addEventListener('pointermove', (e) => {
      if (this.dragging) this.cb.seek(this.frac(e), true);
    });
    const up = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.cb.seek(this.frac(e), false);
    };
    this.scrub.addEventListener('pointerup', up);
    this.scrub.addEventListener('pointercancel', up);
  }

  private frac(e: PointerEvent): number {
    const r = this.scrub.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
  }

  get scrubbing(): boolean {
    return this.dragging;
  }

  show(o: { kicker: string; trackName: string; note: string }): void {
    this.kicker.textContent = o.kicker;
    this.name.textContent = o.trackName;
    this.note.textContent = o.note;
    this.visible = true;
    this.lastFrac = -1;
    this.lastPlay = '';
    this.lastNow = '';
    this.root.classList.add('show');
    reveal(this.root);
  }

  hide(): void {
    this.visible = false;
    this.dragging = false;
    conceal(this.root);
    this.root.classList.remove('show');
  }

  setDevice(d: 'keyboard' | 'gamepad' | 'touch'): void {
    this.legend.innerHTML =
      d === 'gamepad'
        ? `<span><i class="pad a">A</i>Play / pause</span><span><i class="pad">◀▶</i>Scrub</span><span><i class="pad">▲▼</i>Speed</span><span><i class="pad">Y</i>Camera</span><span><i class="pad b">B</i>Exit</span>`
        : d === 'touch'
          ? ''
          : `<span><kbd>Space</kbd>Play / pause</span><span><kbd>← →</kbd>Scrub</span><span><kbd>↑ ↓</kbd>Speed</span><span><kbd>V</kbd>Camera</span><span><kbd>R</kbd>Restart</span><span><kbd>Esc</kbd>Exit</span>`;
    this.root.classList.toggle('touch', d === 'touch');
  }

  /** Per rendered frame: only the strings / widths that changed touch the DOM. */
  update(s: ReplayBarState): void {
    const total = s.length / s.physicsHz;
    const now = Math.min(total, s.tick / s.physicsHz);
    const nowText = formatTime(now);
    if (nowText !== this.lastNow) {
      this.lastNow = nowText;
      this.tNow.textContent = nowText;
      this.tEnd.textContent = formatTime(total);
    }
    const frac = s.length > 0 ? Math.min(1, s.tick / s.length) : 0;
    if (frac !== this.lastFrac) {
      this.lastFrac = frac;
      const pct = `${(frac * 100).toFixed(2)}%`;
      this.fill.style.width = pct;
      this.knob.style.left = pct;
    }
    const play = s.ended ? 'again' : s.playing ? 'pause' : 'play';
    if (play !== this.lastPlay) {
      this.lastPlay = play;
      this.playBtn.innerHTML = play === 'again' ? AGAIN_ICON : play === 'pause' ? PAUSE_ICON : tileIconSvg('play');
      this.playBtn.classList.toggle('on', play !== 'pause');
    }
    for (const b of this.speedBtns) b.classList.toggle('on', Number(b.dataset['v']) === s.speed);
    for (const b of this.camBtns) b.classList.toggle('on', b.dataset['cam'] === s.camera);
  }
}

function h(tag: 'div', cls: string, html = ''): HTMLDivElement {
  const d = document.createElement(tag);
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

function btn(cls: string, html: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = html;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}
