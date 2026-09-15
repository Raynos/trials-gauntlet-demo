/**
 * Level reviewer UI (docs/design/game.md §21): the REVIEW picker screen (one row per track: tier, name,
 * how many of its six segments carry a note) and the review overlay over the loaded track — a segment
 * strip along the top (1–6, tap to jump, the current one lit), a notes card docked bottom-left (label,
 * range, the kinds placed in the segment, ★ rating, quick tags, a comment box), a toolbar bottom-right
 * (FLY, RIDE, zoom −/+, Copy review, Share, Exit) and, under everything, the pan stage: one finger / mouse
 * drag pans along the track, pinch / wheel zooms. The strip and the card keep clear of the track centre.
 * Every control is behind `.live` (src/ui/live.ts): nothing here takes a pointer until it is drawn.
 */
import type { TrackDef } from '../core/types';
import { REVIEW_TAGS, type ReviewSegment, type ReviewTag, type ReviewView, type SegmentNote } from '../game/review';
import { Screen, escapeHtml } from './front';
import { TIER_LABEL } from './progress';
import { conceal, reveal } from './live';
import type { UiSfx } from './sfx';

export interface ReviewPickCallbacks {
  pick(trackId: string): void;
  back(): void;
}

/** REVIEW → the level picker: every track (curriculum, playgrounds, lab) as a row; ↑/↓ + confirm on keyboard / pad. */
export class ReviewPickScreen extends Screen {
  private readonly rows: HTMLDivElement;
  private items: HTMLButtonElement[] = [];
  private index = 0;

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    private readonly cb: ReviewPickCallbacks,
    private readonly noted: (trackId: string) => number,
  ) {
    super(parent, 'review-pick-screen');
    const head = h('div', 'rvp-head', `<div class="ov-kicker">Level review</div><div class="ov-name">Pick a track</div><div class="ov-stats">Walk it in six segments · note each · copy the review</div>`);
    this.rows = h('div', 'rvp-rows');
    this.root.append(h('div', 'grain'), head, this.rows);
    this.addBackButton('Menu');
    this.rows.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.rvp-row');
      if (!b?.dataset['track']) return;
      this.sfx.confirm();
      this.cb.pick(b.dataset['track']);
    });
  }

  build(tracks: readonly TrackDef[]): void {
    this.rows.innerHTML = '';
    this.items = [];
    for (const t of tracks) {
      const n = this.noted(t.id);
      const b = h('button', 'rvp-row');
      b.type = 'button';
      b.dataset['track'] = t.id;
      const kind = t.id.startsWith('lab-') ? 'Lab' : /^p\d-/.test(t.id) ? 'Playground' : TIER_LABEL[t.tier] ?? t.tier;
      b.innerHTML = `<span class="tier">${escapeHtml(kind)}</span><span class="name">${escapeHtml(t.name)}</span><span class="id">${escapeHtml(t.id)}</span><span class="noted${n ? ' some' : ''}">${n} / 6 noted</span>`;
      this.rows.appendChild(b);
      this.items.push(b);
    }
    this.focus(Math.min(this.index, Math.max(0, this.items.length - 1)));
  }

  private focus(i: number): void {
    this.index = i;
    this.items.forEach((b, k) => b.classList.toggle('on', k === i));
    this.items[i]?.scrollIntoView({ block: 'nearest' });
  }

  nav(_dx: number, dy: number): void {
    if (!dy || !this.items.length) return;
    this.sfx.tick();
    this.focus((this.index + dy + this.items.length) % this.items.length);
  }

  confirm(): void {
    const id = this.items[this.index]?.dataset['track'];
    if (id) this.cb.pick(id);
  }

  back(): void {
    this.cb.back();
  }
}

// ---------------------------------------------------------------------------------------------

export interface ReviewPanelCallbacks {
  jump(seg: number): void;
  /** Drag delta in CSS px against the stage width. */
  pan(dxPx: number, widthPx: number): void;
  zoom(factor: number): void;
  fly(): void;
  ride(): void;
  copy(): Promise<boolean>;
  share(): Promise<boolean>;
  exit(): void;
  note(i: number): SegmentNote;
  save(i: number, note: Omit<SegmentNote, 'at'>): void;
}

const STARS = 5;

export class ReviewPanel {
  readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly segBtns: HTMLButtonElement[] = [];
  private readonly name: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly segTitle: HTMLDivElement;
  private readonly kinds: HTMLDivElement;
  private readonly stars: HTMLButtonElement[] = [];
  private readonly tagBtns = new Map<ReviewTag, HTMLButtonElement>();
  private readonly comment: HTMLTextAreaElement;
  private readonly flyBtn: HTMLButtonElement;
  private readonly rideBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly notesBtn: HTMLButtonElement;
  private view: ReviewView | null = null;
  private editing = -1;
  private draft: Omit<SegmentNote, 'at'> = { rating: 0, tags: [], comment: '' };
  private saveTimer = 0;
  visible = false;

  constructor(parent: HTMLElement, private readonly cb: ReviewPanelCallbacks) {
    this.root = h('div', 'review-ui');
    this.stage = h('div', 'rv-stage');
    // Top band: kicker + strip + exit.
    const top = h('div', 'rv-top');
    const head = h('div', 'rv-head');
    this.name = h('div', 'ov-name');
    this.readout = h('div', 'ov-stats');
    head.append(h('div', 'ov-kicker', 'Level review'), this.name, this.readout);
    this.strip = h('div', 'rv-strip');
    for (let i = 1; i <= 6; i++) {
      const b = btn('rv-seg', String(i), `Segment ${i}`, () => this.cb.jump(i - 1));
      b.dataset['seg'] = String(i);
      this.strip.appendChild(b);
      this.segBtns.push(b);
    }
    const exit = btn('rv-exit', '<span>‹</span>Tracks', 'Back to the level picker', () => this.cb.exit());
    top.append(head, this.strip, exit);
    // Notes card (bottom-left).
    this.card = h('div', 'rv-card');
    this.segTitle = h('div', 'rv-seg-title');
    this.kinds = h('div', 'rv-kinds');
    const rate = h('div', 'rv-rate');
    for (let k = 1; k <= STARS; k++) {
      const b = btn('rv-star', '★', `${k} of 5`, () => this.setRating(k));
      b.dataset['k'] = String(k);
      rate.appendChild(b);
      this.stars.push(b);
    }
    const tags = h('div', 'rv-tags');
    for (const t of REVIEW_TAGS) {
      const b = btn('rv-tag', escapeHtml(t), `Tag: ${t}`, () => this.toggleTag(t));
      b.dataset['tag'] = t;
      tags.appendChild(b);
      this.tagBtns.set(t, b);
    }
    this.comment = document.createElement('textarea');
    this.comment.className = 'rv-comment';
    this.comment.rows = 2;
    this.comment.placeholder = 'What happens here? What should change?';
    this.comment.setAttribute('aria-label', 'Segment comment');
    this.comment.addEventListener('input', () => {
      this.draft.comment = this.comment.value;
      this.scheduleSave();
    });
    this.comment.addEventListener('blur', () => this.flush());
    const actions = h('div', 'rv-actions');
    this.copyBtn = btn('rv-copy', 'Copy review', 'Copy the review (markdown + JSON)', () => {
      this.flush();
      void this.cb.copy().then((ok) => this.flash(this.copyBtn, ok ? 'Copied' : 'Copy failed', 'Copy review'));
    });
    this.shareBtn = btn('rv-share', 'Share', 'Share the review', () => {
      this.flush();
      void this.cb.share().then((ok) => this.flash(this.shareBtn, ok ? 'Shared' : 'Share failed', 'Share'));
    });
    this.shareBtn.hidden = typeof navigator === 'undefined' || typeof navigator.share !== 'function';
    actions.append(this.copyBtn, this.shareBtn);
    this.card.append(this.segTitle, this.kinds, rate, tags, this.comment, actions);
    // Toolbar (bottom-right).
    const bar = h('div', 'rv-bar');
    this.notesBtn = btn('rv-notes', 'Notes', 'Show / hide the notes card', () => this.root.classList.toggle('notes-off'));
    this.flyBtn = btn('rv-fly', 'Fly', 'Fly along the track at 8 m/s', () => this.cb.fly());
    this.rideBtn = btn('rv-ride', 'Ride', 'Ride from here', () => this.cb.ride());
    const zoomOut = btn('rv-zoom out', '−', 'Zoom out', () => this.cb.zoom(1.25));
    const zoomIn = btn('rv-zoom in', '+', 'Zoom in', () => this.cb.zoom(0.8));
    bar.append(this.notesBtn, this.flyBtn, this.rideBtn, zoomOut, zoomIn);
    this.root.append(this.stage, top, this.card, bar);
    parent.appendChild(this.root);
    this.wireStage();
  }

  // -- pan / pinch / wheel on the stage --------------------------------------------------

  private wireStage(): void {
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    const dist = (): number => {
      const [a, b] = [...pts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    this.stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) pinch0 = dist();
    });
    this.stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size >= 2) {
        const d = dist();
        if (pinch0 > 0 && d > 0) {
          this.cb.zoom(pinch0 / d);
          pinch0 = d;
        }
        return;
      }
      if (dx !== 0) this.cb.pan(dx, this.stage.clientWidth || window.innerWidth);
    });
    const up = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
      pinch0 = pts.size === 2 ? dist() : 0;
    };
    this.stage.addEventListener('pointerup', up);
    this.stage.addEventListener('pointercancel', up);
    this.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.cb.zoom(e.deltaY > 0 ? 1.1 : 0.91);
      else if (e.deltaX !== 0) this.cb.pan(-e.deltaX, this.stage.clientWidth || window.innerWidth);
    }, { passive: false });
    this.stage.addEventListener('dblclick', () => this.cb.zoom(0.7));
  }

  // -- show / hide -----------------------------------------------------------------------

  show(): void {
    this.visible = true;
    this.root.classList.add('show');
    this.root.classList.remove('notes-off');
    reveal(this.root);
  }

  hide(): void {
    this.flush();
    this.visible = false;
    conceal(this.root);
    this.root.classList.remove('show', 'riding');
    this.editing = -1;
  }

  // -- view -----------------------------------------------------------------------------

  update(v: ReviewView): void {
    const prev = this.view;
    this.view = v;
    if (!prev || prev.trackId !== v.trackId) this.name.textContent = v.name;
    const s = v.segments[v.seg];
    this.readout.textContent = `${v.x.toFixed(1)} m · segment ${v.seg + 1} of ${v.segments.length}${v.riding ? ' · riding' : v.flying ? ' · flying' : ''} · cam ${v.dist.toFixed(0)} m`;
    if (!prev || prev.seg !== v.seg) this.segBtns.forEach((b, k) => b.classList.toggle('on', k === v.seg));
    this.flyBtn.classList.toggle('on', v.flying);
    this.rideBtn.classList.toggle('on', v.riding);
    this.rideBtn.textContent = v.riding ? 'Park' : 'Ride';
    this.root.classList.toggle('riding', v.riding);
    if (s && (this.editing !== s.i || !prev || prev.trackId !== v.trackId)) this.edit(s);
    this.paintNoted();
  }

  private edit(s: ReviewSegment): void {
    this.flush();
    this.editing = s.i;
    const n = this.cb.note(s.i);
    this.draft = { rating: n.rating, tags: [...n.tags], comment: n.comment };
    this.segTitle.innerHTML = `<b>${s.i}</b> ${escapeHtml(s.label)} <span>${s.from.toFixed(0)}–${s.to.toFixed(0)} m</span>`;
    this.kinds.innerHTML = s.kinds.length ? s.kinds.map(([k, c]) => `<span>${escapeHtml(k)}<b>×${c}</b></span>`).join('') : '<span class="none">no obstacles or props placed</span>';
    this.comment.value = n.comment;
    this.paintDraft();
  }

  private paintDraft(): void {
    this.stars.forEach((b, k) => b.classList.toggle('on', k < this.draft.rating));
    for (const [t, b] of this.tagBtns) b.classList.toggle('on', this.draft.tags.includes(t));
  }

  private paintNoted(): void {
    const v = this.view;
    if (!v) return;
    for (const s of v.segments) {
      const n = s.i === this.editing ? this.draft : this.cb.note(s.i);
      this.segBtns[s.i - 1]?.classList.toggle('noted', !!(n.rating || n.tags.length || n.comment.trim()));
    }
  }

  private setRating(k: number): void {
    this.draft.rating = this.draft.rating === k ? 0 : k;
    this.paintDraft();
    this.flush();
  }

  private toggleTag(t: ReviewTag): void {
    const i = this.draft.tags.indexOf(t);
    if (i >= 0) this.draft.tags.splice(i, 1);
    else this.draft.tags.push(t);
    this.paintDraft();
    this.flush();
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 400);
  }

  /** Persist the draft now (segment change, blur, copy, hide). */
  flush(): void {
    clearTimeout(this.saveTimer);
    if (this.editing < 0) return;
    this.cb.save(this.editing, { rating: this.draft.rating, tags: [...this.draft.tags], comment: this.draft.comment });
    this.paintNoted();
  }

  private flash(b: HTMLButtonElement, text: string, back: string): void {
    b.textContent = text;
    b.classList.add('flash');
    setTimeout(() => {
      b.textContent = back;
      b.classList.remove('flash');
    }, 1400);
  }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

function btn(cls: string, html: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = html;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}
