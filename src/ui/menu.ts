/**
 * Pause overlay (same list + amber bar as the main menu), spatial focus
 * navigation for button grids (results panel), and the rotate prompt.
 * Every target ≥ 44 px; mouse, touch, keyboard and pad via `confirm()`/`move()`.
 */
import type { QualityTier } from '../core/types';
import type { ModelChoice } from './best';
import { formatTime } from './format';
import { BUILD_STAMP, FocusList, GAME_NAME, escapeHtml, hardReload } from './front';
import { logicalRect } from './orientation';
import type { UiSfx } from './sfx';

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

export class PauseMenu {
  readonly root: HTMLDivElement;
  private readonly list: FocusList;
  private readonly title: HTMLElement;
  private readonly stats: HTMLDivElement;

  constructor(parent: HTMLElement, sfx: UiSfx, private readonly cb: PauseCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    const panel = document.createElement('div');
    panel.className = 'pause-panel';
    this.title = document.createElement('h2');
    this.title.className = 'pause-title';
    this.title.innerHTML = '<small>Paused</small>Track';
    panel.appendChild(this.title);
    this.list = new FocusList(panel, sfx, 'menu-list-inline');
    this.list.root.style.position = 'relative';
    this.list.setItems([
      { id: 'resume', label: 'Resume' },
      { id: 'restart', label: 'Restart track' },
      ...(cb.models ? [{ id: 'rider', label: 'Rider' }, { id: 'bike', label: 'Bike' }] : []),
      { id: 'quit', label: 'Main menu' },
      // Last row, never top-right: a home-screen install has no browser chrome to reload with.
      { id: 'reload', label: '⟳ Reload game' },
    ]);
    this.list.onPick = (id) => {
      if (id === 'resume') cb.resume();
      else if (id === 'restart') cb.restartTrack();
      else if (id === 'quit') cb.quit();
      else if (id === 'reload') void hardReload();
      else if (id === 'rider' || id === 'bike') this.cycleModel(id, 1);
    };
    this.paintModels();
    this.stats = document.createElement('div');
    this.stats.className = 'pause-stats';
    panel.appendChild(this.stats);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  show(info?: { trackName: string; tier: string; runTime: number; faults: number }): void {
    if (info) {
      this.title.innerHTML = `<small>Paused · ${escapeHtml(info.tier)}</small>${escapeHtml(info.trackName)}`;
      this.stats.innerHTML = `<span>Time <b>${formatTime(info.runTime)}</b></span><span>Faults <b>${info.faults}</b></span>`;
    }
    this.root.classList.add('show');
    this.paintModels();
    this.list.focusId('resume');
    requestAnimationFrame(() => this.list.render(false));
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  confirm(): void {
    this.list.pick();
  }

  /** Up/down moves; left/right flips the focused Rider / Bike row live (scene updates behind the overlay). */
  move(dx: number, dy: number): void {
    if (dy) this.list.move(dy);
    else if (dx) {
      const cur = this.list.current();
      if (cur === 'rider' || cur === 'bike') this.cycleModel(cur, dx);
    }
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
    this.list.setSegment('rider', MODEL_OPTIONS, cur.rider);
    this.list.setSegment('bike', MODEL_OPTIONS, cur.bike);
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
