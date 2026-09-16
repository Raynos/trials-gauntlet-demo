/**
 * Pause overlay (SPEC.md direction A: low action bar), spatial focus
 * navigation helper, and the rotate prompt.
 * Every target ≥ 44 px; mouse, touch, keyboard and pad via `confirm()`/`move()`.
 */
import type { QualityTier, RiderOutfit } from '../core/types';
import type { ModelChoice } from './best';
import { formatTime } from './format';
import { BUILD_STAMP, GAME_NAME, escapeHtml, hardReload } from './front';
import { TileRow } from './tiles';
import { logicalRect } from './orientation';
import type { UiSfx } from './sfx';
import { conceal, reveal, isLiveTarget } from './live';
import { RIDER_OUTFITS, OUTFIT_LABEL, OUTFIT_DETAIL } from './outfit';

export type QualityChoice = QualityTier | 'auto';

export interface PauseCallbacks {
  outfits?: { get(): RiderOutfit; set(outfit: RiderOutfit): Promise<boolean> };
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
const RIDER_MODEL_OPTIONS = [{ v: 'proc', l: 'Classic' }, { v: 'gltf', l: 'Blender' }, { v: 'img2', l: 'Img2 experiment' }];

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
  /** Focus rows: rider, bike, outfits, action tiles, reload. */
  private row: 0 | 1 | 2 | 3 | 4 = 1;
  private seg: 'rider' | 'bike' = 'rider';
  private readonly outfitButtons = new Map<RiderOutfit, HTMLButtonElement>();
  private readonly outfitStatus = document.createElement('div');
  private outfitFocus = 0;
  private pendingOutfit: RiderOutfit | null = null;
  private failedOutfit: RiderOutfit | null = null;
  private outfitRequest = 0;
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
        `<span class="vlab">${label}</span><span class="mini-seg" role="group" aria-label="${label} model" data-which="${which}">${(which === 'rider' ? RIDER_MODEL_OPTIONS : MODEL_OPTIONS).map((o) => `<button type="button" data-v="${o.v}">${o.l}</button>`).join('')}</span>`;
      v.innerHTML = `<span class="vtitle">Visuals</span>${seg('rider', 'Rider')}<i class="vsep"></i>${seg('bike', 'Bike')}`;
      for (const which of ['rider', 'bike'] as const) this.segs[which] = [...v.querySelectorAll<HTMLElement>(`.mini-seg[data-which="${which}"] button`)];
      v.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('.mini-seg button');
        if (!b || !this.visible || !isLiveTarget(b)) return;
        const which = b.parentElement!.dataset['which'] as 'rider' | 'bike';
        const v2 = b.dataset['v'] as ModelChoice;
        this.row = which === 'rider' ? 0 : 4;
        this.seg = which;
        if (cb.models!.get()[which] !== v2) cb.models!.set(which, v2);
        this.paintModels();
        this.paintOutfits();
        this.paintFocus();
      });
      v.addEventListener('pointermove', (e) => {
        const seg2 = (e.target as HTMLElement).closest<HTMLElement>('.mini-seg');
        if (!seg2) return;
        const which = seg2.dataset['which'] as 'rider' | 'bike';
        if (this.row !== 0 || this.seg !== which) {
          this.row = which === 'rider' ? 0 : 4;
          this.seg = which;
          this.paintFocus();
        }
      });
      v.addEventListener('focusin', (event) => {
        const group = (event.target as HTMLElement).closest<HTMLElement>('.mini-seg');
        if (!group) return;
        this.seg = group.dataset['which'] as 'rider' | 'bike';
        this.row = this.seg === 'rider' ? 0 : 4;
        this.paintFocus();
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
    if (cb.outfits) {
      this.root.classList.add('has-outfits');
      const panel = document.createElement('div');
      panel.className = 'pause-outfits';
      panel.innerHTML = '<div class="outfit-heading"><strong>Rider outfit</strong></div>';
      const options = document.createElement('div');
      options.className = 'outfit-options';
      options.setAttribute('role', 'group');
      options.setAttribute('aria-label', 'Rider outfit');
      for (const [index, outfit] of RIDER_OUTFITS.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outfit-button';
        button.dataset['outfit'] = outfit;
        button.innerHTML = `<strong>${escapeHtml(OUTFIT_LABEL[outfit])}</strong><span>${escapeHtml(OUTFIT_DETAIL[outfit])}</span>`;
        button.addEventListener('focus', () => { this.row = 3; this.outfitFocus = index; this.paintFocus(); });
        button.addEventListener('click', () => {
          if (!this.visible || !isLiveTarget(button)) return;
          this.row = 3;
          this.outfitFocus = index;
          void this.selectOutfit(outfit);
        });
        this.outfitButtons.set(outfit, button);
        options.appendChild(button);
      }
      this.outfitStatus.className = 'outfit-current';
      this.outfitStatus.setAttribute('role', 'status');
      panel.append(options, this.outfitStatus);
      this.root.insertBefore(panel, free);
    }
    const foot = document.createElement('div');
    foot.className = 'ov-foot';
    this.reload = document.createElement('button');
    this.reload.type = 'button';
    this.reload.className = 'ov-reload';
    this.reload.addEventListener('click', () => this.pressReload());
    this.reload.addEventListener('focus', () => { this.row = 2; this.paintFocus(); });
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
    this.tiles.root.addEventListener('focusin', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('.tile');
      if (!button) return;
      this.row = 1;
      this.tiles.focusId(button.dataset['id']!);
      this.paintFocus();
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
    this.root.scrollTop = 0;
    reveal(this.root);
    this.row = 1;
    this.tiles.focusId('resume');
    this.disarmReload();
    this.paintModels();
    this.paintOutfits();
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
    if (!this.visible || !isLiveTarget(this.root)) return;
    if (this.row === 1) {
      this.tiles.press();
      this.tiles.pick();
    } else if (this.row === 0 || this.row === 4) {
      const focused = document.activeElement as HTMLElement | null;
      if (focused && this.segs[this.seg].includes(focused)) focused.click();
      else this.cycleModel(this.seg, 1);
    } else if (this.row === 3) void this.selectOutfit(RIDER_OUTFITS[this.outfitFocus]!);
    else this.pressReload();
  }

  /** Up/down moves between the seg row, the tiles and reload; left/right moves tiles or flips the focused segment. */
  move(dx: number, dy: number): void {
    if (!this.visible || !isLiveTarget(this.root)) return;
    if (dy) {
      const rows: Array<0 | 1 | 2 | 3 | 4> = [...(this.visuals ? [0, 4] as const : []), ...(this.cb.outfits ? [3] as const : []), 1, 2];
      const i = rows.indexOf(this.row);
      const j = Math.min(rows.length - 1, Math.max(0, i + dy));
      if (rows[j] !== this.row) {
        this.row = rows[j]!;
        if (this.row === 0 || this.row === 4) this.seg = this.row === 0 ? 'rider' : 'bike';
        if (this.row === 3) this.outfitButtons.get(RIDER_OUTFITS[this.outfitFocus]!)?.focus({ preventScroll: true });
        this.paintFocus();
      }
      return;
    }
    if (!dx) return;
    if (this.row === 1) this.tiles.move(dx);
    else if (this.row === 0 || this.row === 4) this.cycleModel(this.seg, dx);
    else if (this.row === 3) {
      this.outfitFocus = (this.outfitFocus + Math.sign(dx) + RIDER_OUTFITS.length) % RIDER_OUTFITS.length;
      const button = this.outfitButtons.get(RIDER_OUTFITS[this.outfitFocus]!)!;
      button.focus({ preventScroll: true });
      // Scroll only the choices row: scrollIntoView can move the entire HUD root.
      const options = button.parentElement!;
      const rect = button.getBoundingClientRect();
      const bounds = options.getBoundingClientRect();
      if (rect.left < bounds.left) options.scrollLeft += rect.left - bounds.left;
      else if (rect.right > bounds.right) options.scrollLeft += rect.right - bounds.right;
      this.paintFocus();
    }
  }

  private cycleModel(which: 'rider' | 'bike', d: number): void {
    const m = this.cb.models;
    if (!m) return;
    const cur = m.get()[which];
    const options = which === 'rider' ? RIDER_MODEL_OPTIONS : MODEL_OPTIONS;
    const i = options.findIndex((o) => o.v === cur);
    const next = options[(i + d + options.length) % options.length]!.v as ModelChoice;
    m.set(which, next);
    this.paintModels();
    this.paintOutfits();
    this.segs[which].find(button => button.dataset['v'] === next)?.focus({ preventScroll: true });
  }

  private paintModels(): void {
    const m = this.cb.models;
    if (!m) return;
    const cur = m.get();
    for (const which of ['rider', 'bike'] as const) for (const b of this.segs[which]) {
      b.classList.toggle('on', b.dataset['v'] === cur[which]);
      b.setAttribute('aria-pressed', String(b.dataset['v'] === cur[which]));
    }
  }

  private paintOutfits(): void {
    const current = this.cb.outfits?.get();
    const rider = this.cb.models?.get().rider ?? 'gltf';
    const blender = rider === 'gltf';
    for (const [outfit, button] of this.outfitButtons) {
      button.classList.toggle('selected', blender && outfit === current);
      button.setAttribute('aria-pressed', String(blender && outfit === current));
      button.setAttribute('aria-busy', String(outfit === this.pendingOutfit));
    }
    const active = !blender ? `${rider === 'img2' ? 'Img2 experiment' : 'Classic rider'} · choose an outfit to use Blender`
      : current ? `${OUTFIT_LABEL[current]} selected` : '';
    const status = this.pendingOutfit ? `Loading ${OUTFIT_LABEL[this.pendingOutfit]}…`
      : this.failedOutfit ? `Could not load ${OUTFIT_LABEL[this.failedOutfit]}. Select it to retry. ${active}` : active;
    if (this.outfitStatus.textContent !== status) this.outfitStatus.textContent = status;
  }

  private async selectOutfit(outfit: RiderOutfit): Promise<void> {
    const outfits = this.cb.outfits;
    if (!outfits || this.pendingOutfit === outfit) return;
    const request = ++this.outfitRequest;
    this.pendingOutfit = outfit;
    this.failedOutfit = null;
    this.paintOutfits();
    this.paintFocus();
    let loaded = false;
    try { loaded = await outfits.set(outfit); } catch { /* Preserve the current outfit on failure. */ }
    if (request !== this.outfitRequest) return;
    this.pendingOutfit = null;
    this.failedOutfit = loaded ? null : outfit;
    this.paintOutfits();
    this.paintModels();
  }

  private paintFocus(): void {
    this.root.classList.toggle('focus-visuals', this.row === 0 || this.row === 4);
    this.root.classList.toggle('focus-tiles', this.row === 1);
    this.root.classList.toggle('focus-reload', this.row === 2);
    if (this.visuals) for (const which of ['rider', 'bike'] as const) this.visuals.querySelector(`.mini-seg[data-which="${which}"]`)!.classList.toggle('focus', (this.row === 0 || this.row === 4) && this.seg === which);
    for (const [index, button] of [...this.outfitButtons.values()].entries()) button.classList.toggle('on', this.row === 3 && index === this.outfitFocus);
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
