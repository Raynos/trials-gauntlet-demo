/**
 * Pause overlay (SPEC.md direction A: low action bar), spatial focus
 * navigation helper, and the rotate prompt.
 * Every target ≥ 44 px; mouse, touch, keyboard and pad via `confirm()`/`move()`.
 */
import type { QualityTier } from '../core/types';
import type { ModelChoice } from './best';
import { formatTime } from './format';
import { BUILD_STAMP, GAME_NAME, escapeHtml, hardReload } from './front';
import { TileRow } from './tiles';
import { logicalRect } from './orientation';
import type { UiSfx } from './sfx';
import { conceal, reveal } from './live';

export type QualityChoice = QualityTier | 'auto';

export interface PauseCallbacks {
  resume(): void;
  restartTrack(): void;
  quit(): void;
  /** Live rider / bike model swap (renderer `setModels`); rows exist only when `models` is given. */
  models?: {
    get(): { rider: ModelChoice; bike: ModelChoice };
    set(which: 'rider' | 'bike', v: ModelChoice): void;
  };
}

const MODEL_OPTIONS = [
  { v: 'proc', l: 'Procedural' },
  { v: 'gltf', l: 'Modelled' },
];

/**
 * Spatial focus navigation over the visible buttons of `root`: pick the nearest
 * button in the requested direction (distance along the axis + 2× the
 * perpendicular offset). Wraps nothing; keeps focus where it is at an edge.
 */
export function spatialMove(root: HTMLElement, dx: number, dy: number): void {
  const items = [...root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')].filter((b) => b.offsetParent !== null);
  if (items.length === 0) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur as HTMLButtonElement)) {
    items[0]!.focus({ preventScroll: true });
    items[0]!.scrollIntoView({ block: 'nearest' });
    return;
  }
  // Logical boxes: under forced landscape the client rects are rotated 90°.
  const r = logicalRect(cur);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best: HTMLButtonElement | null = null;
  let bestScore = Infinity;
  for (const b of items) {
    if (b === cur) continue;
    const q = logicalRect(b);
    const qx = q.left + q.width / 2;
    const qy = q.top + q.height / 2;
    const along = dx !== 0 ? (qx - cx) * dx : (qy - cy) * dy;
    if (along <= 4) continue;
    // Prefer items that overlap on the cross axis (same row / column).
    const overlap = dx !== 0 ? Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) : Math.min(r.right, q.right) - Math.max(r.left, q.left);
    const perp = dx !== 0 ? Math.abs(qy - cy) : Math.abs(qx - cx);
    const score = along + (overlap > 0 ? 0 : 2 * perp + 200);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest' });
  }
}

export interface PauseInfo {
  trackName: string;
  tier: string;
  runTime: number;
  faults: number;
  /** `crashed` renders the CRASHED kicker + checkpoint line (SPEC §4.1). */
  phase?: string;
  checkpoint?: number;
  checkpointCount?: number;
}

const LEGEND_PAUSE_KB = `<span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Resume</span><span><kbd>R</kbd>Restart</span>`;
const LEGEND_PAUSE_PAD = `<span><i class="pad a">A</i>Select</span><span><i class="pad b">B</i>Resume</span>`;
const RELOAD_ARM_MS = 2000;

/**
 * Pause overlay (assets/design/pause/SPEC.md, direction A "low action bar"):
 * title block top-left (kicker · title · stats), Visuals chip row top-right
 * (only with `cb.models`, live preview behind the flat 50 % scrim), three
 * tiles RESUME / RESTART / QUIT centred in the lower third for landscape-phone
 * thumbs, Reload as an armed two-press corner link, device legend bottom-right.
 * Focus ring: seg row ⇅ tiles ⇅ reload; left/right on a segment flips it.
 */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly kicker: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly visuals: HTMLDivElement | null = null;
  private readonly segs: Record<'rider' | 'bike', HTMLElement[]> = { rider: [], bike: [] };
  private readonly tiles: TileRow;
  private readonly reload: HTMLButtonElement;
  private readonly legend: HTMLDivElement;
  /** Focus row: 0 = visuals segs (rider/bike), 1 = tiles, 2 = reload. */
  private row: 0 | 1 | 2 = 1;
  private seg: 'rider' | 'bike' = 'rider';
  private reloadArmedAt = -1;
  private reloadTimer = 0;
  private short = false;

  constructor(parent: HTMLElement, sfx: UiSfx, private readonly cb: PauseCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay pause-overlay';
    const head = document.createElement('div');
    head.className = 'ov-head';
    const block = document.createElement('div');
    block.className = 'ov-title';
    this.kicker = document.createElement('div');
    this.kicker.className = 'ov-kicker';
    this.title = document.createElement('div');
    this.title.className = 'ov-name';
    this.stats = document.createElement('div');
    this.stats.className = 'ov-stats';
    block.append(this.kicker, this.title, this.stats);
    head.appendChild(block);
    if (cb.models) {
      const v = document.createElement('div');
      v.className = 'visuals';
      const seg = (which: 'rider' | 'bike', label: string) =>
        `<span class="vlab">${label}</span><span class="mini-seg" data-which="${which}">${MODEL_OPTIONS.map((o) => `<b data-v="${o.v}">${o.l}</b>`).join('')}</span>`;
      v.innerHTML = `<span class="vtitle">Visuals</span>${seg('rider', 'Rider')}<i class="vsep"></i>${seg('bike', 'Bike')}`;
      for (const which of ['rider', 'bike'] as const) this.segs[which] = [...v.querySelectorAll<HTMLElement>(`.mini-seg[data-which="${which}"] b`)];
      v.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('.mini-seg b');
        if (!b) return;
        const which = b.parentElement!.dataset['which'] as 'rider' | 'bike';
        const v2 = b.dataset['v'] as ModelChoice;
        this.row = 0;
        this.seg = which;
        if (cb.models!.get()[which] !== v2) cb.models!.set(which, v2);
        this.paintModels();
      });
      v.addEventListener('pointermove', (e) => {
        const seg2 = (e.target as HTMLElement).closest<HTMLElement>('.mini-seg');
        if (!seg2) return;
        const which = seg2.dataset['which'] as 'rider' | 'bike';
        if (this.row !== 0 || this.seg !== which) {
          this.row = 0;
          this.seg = which;
          this.paintFocus();
        }
      });
      head.appendChild(v);
      this.visuals = v;
    }
    const free = document.createElement('div');
    free.className = 'ov-free';
    this.tiles = new TileRow(this.root, sfx);
    this.tiles.setTiles([
      { id: 'resume', label: 'Resume', icon: 'play' },
      { id: 'restart', label: 'Restart', icon: 'restart' },
      { id: 'quit', label: 'Quit', icon: 'door' },
    ]);
    this.tiles.onPick = (id) => {
      if (id === 'resume') cb.resume();
      else if (id === 'restart') cb.restartTrack();
      else if (id === 'quit') cb.quit();
    };
    this.root.insertBefore(free, this.tiles.root);
    this.root.insertBefore(head, free);
    const foot = document.createElement('div');
    foot.className = 'ov-foot';
    this.reload = document.createElement('button');
    this.reload.type = 'button';
    this.reload.className = 'ov-reload';
    this.reload.addEventListener('click', () => this.pressReload());
    this.reload.addEventListener('pointermove', () => {
      if (this.row !== 2) {
        this.row = 2;
        this.paintFocus();
      }
    });
    this.legend = document.createElement('div');
    this.legend.className = 'legend';
    this.legend.innerHTML = LEGEND_PAUSE_KB;
    foot.append(this.reload, this.legend);
    this.root.appendChild(foot);
    this.tiles.root.addEventListener('pointermove', () => {
      if (this.row !== 1) {
        this.row = 1;
        this.paintFocus();
      }
    });
    this.paintReload(false);
    parent.appendChild(this.root);
  }

  setDevice(d: 'keyboard' | 'gamepad' | 'touch'): void {
    this.legend.innerHTML = d === 'gamepad' ? LEGEND_PAUSE_PAD : LEGEND_PAUSE_KB;
    this.legend.classList.toggle('hide', d === 'touch');
  }

  show(info?: PauseInfo): void {
    this.short = document.documentElement.classList.contains('short');
    if (info) {
      const crashed = info.phase === 'crashed';
      this.kicker.textContent = `${crashed ? 'Crashed' : 'Paused'} · ${info.tier}`;
      this.kicker.classList.toggle('red', crashed);
      this.title.textContent = info.trackName;
      let stats = `<span>Time <b>${formatTime(info.runTime)}</b></span><i>·</i><span>Faults <b>${info.faults}</b></span>`;
      if (crashed && typeof info.checkpointCount === 'number' && info.checkpointCount > 0) {
        stats += `<i>·</i><span>Checkpoint <b>${Math.max(0, (info.checkpoint ?? -1) + 1)}</b> of <b>${info.checkpointCount}</b></span>`;
      }
      this.stats.innerHTML = stats;
    }
    this.root.classList.add('show');
    reveal(this.root);
    this.row = 1;
    this.tiles.focusId('resume');
    this.disarmReload();
    this.paintModels();
    this.paintFocus();
  }

  /** Hard hide (restart / quit): no fade. `resume()` callers fade via `.leaving`. */
  hide(): void {
    if (!this.root.classList.contains('show')) return;
    // Hard cut: no 240 ms fade before a restart / quit (SPEC §6).
    conceal(this.root);
    this.root.style.transition = 'none';
    this.root.classList.remove('show', 'leaving');
    void this.root.offsetHeight;
    this.root.style.transition = '';
    this.disarmReload();
  }

  /** Resume: the game unpauses on this frame; the overlay fades over --t1. */
  fadeOut(): void {
    if (!this.root.classList.contains('show')) return;
    conceal(this.root); // dead from the first frame of the fade
    this.root.classList.add('leaving');
    this.disarmReload();
    setTimeout(() => {
      if (this.root.classList.contains('leaving')) this.root.classList.remove('show', 'leaving');
    }, 130);
  }

  get visible(): boolean {
    return this.root.classList.contains('show') && !this.root.classList.contains('leaving');
  }

  /** `R` while paused = RESTART, no hold needed (SPEC §5). */
  restartShortcut(): void {
    this.tiles.focusId('restart');
    this.row = 1;
    this.paintFocus();
    this.tiles.press();
    this.cb.restartTrack();
  }

  confirm(): void {
    if (this.row === 1) {
      this.tiles.press();
      this.tiles.pick();
    } else if (this.row === 0) this.cycleModel(this.seg, 1);
    else this.pressReload();
  }

  /** Up/down moves between the seg row, the tiles and reload; left/right moves tiles or flips the focused segment. */
  move(dx: number, dy: number): void {
    if (dy) {
      const rows: Array<0 | 1 | 2> = this.visuals ? [0, 1, 2] : [1, 2];
      const i = rows.indexOf(this.row);
      const j = Math.min(rows.length - 1, Math.max(0, i + dy));
      if (rows[j] !== this.row) {
        this.row = rows[j]!;
        this.paintFocus();
      }
      return;
    }
    if (!dx) return;
    if (this.row === 1) this.tiles.move(dx);
    else if (this.row === 0) this.cycleModel(this.seg, dx);
  }

  private cycleModel(which: 'rider' | 'bike', d: number): void {
    const m = this.cb.models;
    if (!m) return;
    const cur = m.get()[which];
    const i = MODEL_OPTIONS.findIndex((o) => o.v === cur);
    const next = MODEL_OPTIONS[(i + d + MODEL_OPTIONS.length) % MODEL_OPTIONS.length]!.v as ModelChoice;
    m.set(which, next);
    this.paintModels();
  }

  private paintModels(): void {
    const m = this.cb.models;
    if (!m) return;
    const cur = m.get();
    for (const which of ['rider', 'bike'] as const) for (const b of this.segs[which]) b.classList.toggle('on', b.dataset['v'] === cur[which]);
  }

  private paintFocus(): void {
    this.root.classList.toggle('focus-visuals', this.row === 0);
    this.root.classList.toggle('focus-tiles', this.row === 1);
    this.root.classList.toggle('focus-reload', this.row === 2);
    if (this.visuals) for (const which of ['rider', 'bike'] as const) this.visuals.querySelector(`.mini-seg[data-which="${which}"]`)!.classList.toggle('focus', this.row === 0 && this.seg === which);
    this.reload.classList.toggle('focus', this.row === 2);
  }

  /** Two activations within 2 s on every input method: one brush of the corner never reloads. */
  private pressReload(): void {
    if (this.reloadArmedAt >= 0 && performance.now() - this.reloadArmedAt < RELOAD_ARM_MS) {
      void hardReload();
      return;
    }
    this.reloadArmedAt = performance.now();
    this.paintReload(true);
    clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => this.disarmReload(), RELOAD_ARM_MS);
  }

  private disarmReload(): void {
    this.reloadArmedAt = -1;
    clearTimeout(this.reloadTimer);
    this.paintReload(false);
  }

  private paintReload(armed: boolean): void {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.reload.textContent = armed ? `⟳ ${touch ? 'Tap' : 'Press'} again to reload` : this.short ? '⟳ Reload' : '⟳ Reload game';
    this.reload.classList.toggle('armed', armed);
  }
}

/**
 * Full-screen portrait prompt (CSS decides when it shows: portrait + coarse pointer). A designed
 * screen in the menu tokens: wordmark, rotating phone glyph, a "Reload game" button (home-screen /
 * standalone iOS has no browser chrome to reload with), build stamp. Rotate-to-play is the rule:
 * forced landscape was tried and abandoned (round 3, docs/design/game.md §11).
 */
export function mountRotatePrompt(parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'rotate armed';
  d.innerHTML = `<div class="wordmark">${GAME_NAME.split(' ')[0]}<br>${GAME_NAME.split(' ').slice(1).join(' ')}</div>
    <i></i>
    <div class="msg">Rotate to landscape</div>
    <button type="button" class="btn primary reload">⟳ Reload game</button>
    <div class="build">${escapeHtml(BUILD_STAMP)}</div>`;
  d.querySelector('button')!.addEventListener('click', () => void hardReload());
  parent.appendChild(d);
  return d;
}
