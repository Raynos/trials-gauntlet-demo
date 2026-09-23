/**
 * Level reviewer (docs/design/game.md §21): a first-class screen — REVIEW on the main menu → a level
 * picker → the review UI for one track. The track is loaded with nothing racing (phase `menu`), the bike
 * parked at the segment start, and the reviewer walks it in six segments (`meta.segments` when the track
 * authors them, else six equal x-ranges), leaves a note per segment (rating 1–5, quick tags, a comment;
 * localStorage per track/segment) and copies / shares one review string (markdown table + JSON) that the
 * parent files under `docs/reviews/levels/<track>.md`.
 *
 * Camera, honestly: the renderer has no free-camera hook (`setCameraOverride` is not implemented), so
 * "pan" teleports the parked bike along the ground (`Game.teleportBike`) and the rig follows it — the bike
 * is the probe. Zoom drives the rig's public `setKeys` (a full-track `CameraKey` with `dist`) through
 * `renderer.debug.rig`, the same seam the replay viewer uses. Vertical pan needs the render hook and is
 * not offered. FLY auto-advances the probe at FLY_MPS; RIDE starts a run (GO, no countdown), drops the
 * bike at the probe's x and hands the strip to the player; a crash / restart returns it to the segment start.
 */
import type { CameraKey, PlacedObstacle, TrackDef } from '../core/types';
import { SHIP_SEGMENTS, segmentsOf } from '../tracks';
import type { Game } from './game';

export const REVIEW_TAGS = ['too hard', 'too easy', 'boring', 'unreadable', 'camera', 'asset missing', 'fun'] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];
export const SEGMENT_COUNT = 6;
/** FLY speed along the track, m/s of world per real second. */
export const FLY_MPS = 8;
/** Camera distance range the pinch / wheel walks (m from the bike; the rig clamps to the hall on interiors). */
export const ZOOM_RANGE: [number, number] = [5, 34];
export const ZOOM_DEFAULT = 12;
const STORE_PREFIX = 'rockhop.review.';

export interface SegmentNote {
  /** 0 = unrated. */
  rating: number;
  tags: ReviewTag[];
  comment: string;
  /** ISO time of the last edit. */
  at: string;
}

export interface ReviewSegment {
  /** 1-based, as the strip shows it. */
  i: number;
  from: number;
  to: number;
  label: string;
  /** Obstacle / decor kinds placed in [from, to) with their counts, most frequent first. */
  kinds: [string, number][];
}

export interface ReviewExport {
  track: string;
  name: string;
  build: string;
  segments: { i: number; from: number; to: number; label: string; rating: number; tags: ReviewTag[]; comment: string }[];
  at: string;
}

const EMPTY_NOTE = (): SegmentNote => ({ rating: 0, tags: [], comment: '', at: '' });

/** The authored six for a track: a playground's `meta.segments` (`segmentsOf`), else the ship table (`SHIP_SEGMENTS`), else none. */
export function authoredSegments(def: TrackDef): readonly { from: number; to: number; label: string }[] {
  const own = segmentsOf(def);
  if (own.length === SEGMENT_COUNT) return own;
  return SHIP_SEGMENTS[def.id] ?? [];
}

/** Six review segments of a track: the authored six when given, else equal x-ranges start → finish. */
export function reviewSegments(def: TrackDef, placed: readonly PlacedObstacle[] = [], authored: readonly { from: number; to: number; label: string }[] | undefined = authoredSegments(def)): ReviewSegment[] {
  const x0 = def.start.pos.x;
  const x1 = def.finishX;
  const ranges: { from: number; to: number; label: string }[] =
    Array.isArray(authored) && authored.length === SEGMENT_COUNT && authored.every((s) => Number.isFinite(s.from) && Number.isFinite(s.to))
      ? authored.map((s) => ({ from: s.from, to: s.to, label: s.label || '' }))
      : Array.from({ length: SEGMENT_COUNT }, (_, k) => ({ from: x0 + ((x1 - x0) * k) / SEGMENT_COUNT, to: x0 + ((x1 - x0) * (k + 1)) / SEGMENT_COUNT, label: `Segment ${k + 1}` }));
  return ranges.map((r, k) => {
    const counts = new Map<string, number>();
    const last = k === ranges.length - 1;
    for (const p of placed) {
      if (p.pos.x >= r.from && (p.pos.x < r.to || (last && p.pos.x <= r.to))) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    }
    const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { i: k + 1, from: r.from, to: r.to, label: r.label, kinds };
  });
}

/** Segment index (0-based) containing x; clamped to the ends. */
export function segmentAt(segments: readonly ReviewSegment[], x: number): number {
  for (let k = 0; k < segments.length; k++) if (x < segments[k]!.to) return k;
  return Math.max(0, segments.length - 1);
}

/** Notes per track / segment in localStorage (`rockhop.review.<track>` → { [i]: SegmentNote }). Storage failures are silent. */
export class ReviewStore {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {}

  load(trackId: string): Record<number, SegmentNote> {
    try {
      const raw = this.storage?.getItem(STORE_PREFIX + trackId);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<SegmentNote>>;
      const out: Record<number, SegmentNote> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const i = Number(k);
        if (!Number.isInteger(i) || !v || typeof v !== 'object') continue;
        out[i] = { ...EMPTY_NOTE(), ...v, tags: Array.isArray(v.tags) ? (v.tags.filter((t) => (REVIEW_TAGS as readonly string[]).includes(t)) as ReviewTag[]) : [] };
      }
      return out;
    } catch {
      return {};
    }
  }

  get(trackId: string, i: number): SegmentNote {
    return this.load(trackId)[i] ?? EMPTY_NOTE();
  }

  save(trackId: string, i: number, note: Omit<SegmentNote, 'at'>): SegmentNote {
    const all = this.load(trackId);
    const stored: SegmentNote = { rating: Math.max(0, Math.min(5, Math.round(note.rating))), tags: [...note.tags], comment: note.comment, at: new Date().toISOString() };
    if (!stored.rating && !stored.tags.length && !stored.comment.trim()) delete all[i];
    else all[i] = stored;
    try {
      this.storage?.setItem(STORE_PREFIX + trackId, JSON.stringify(all));
    } catch {
      /* storage unavailable: the session keeps its copy */
    }
    return stored;
  }

  /** Segments with anything written (the picker's "n / 6 noted"). */
  count(trackId: string): number {
    return Object.keys(this.load(trackId)).length;
  }
}

/** The review as data (`{track, build, segments:[...], at}`), plus the string Copy review puts on the clipboard: a markdown table, then the JSON in a fence. */
export function buildReview(def: TrackDef, build: string, segments: readonly ReviewSegment[], notes: Record<number, SegmentNote>, at = new Date().toISOString()): { data: ReviewExport; text: string } {
  const data: ReviewExport = {
    track: def.id,
    name: def.name,
    build,
    segments: segments.map((s) => {
      const n = notes[s.i] ?? EMPTY_NOTE();
      return { i: s.i, from: round1(s.from), to: round1(s.to), label: s.label, rating: n.rating, tags: [...n.tags], comment: n.comment };
    }),
    at,
  };
  const rows = data.segments.map((s) => `| ${s.i} | ${s.from}–${s.to} m | ${cell(s.label)} | ${s.rating ? '★'.repeat(s.rating) : '—'} | ${s.tags.join(', ') || '—'} | ${cell(s.comment) || '—'} |`);
  const text = [`# Level review · ${def.name} (\`${def.id}\`)`, '', `${build} · ${at}`, '', '| # | Range | Segment | Rating | Tags | Comment |', '|---|---|---|---|---|---|', ...rows, '', '```json', JSON.stringify(data), '```', ''].join('\n');
  return { data, text };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

// ---------------------------------------------------------------------------------------------
// Session: the loaded track under the review UI
// ---------------------------------------------------------------------------------------------

interface RigLike {
  setKeys(keys: { x0: number; x1: number; dist?: number; blend?: number; zoomBias?: number }[] | undefined): void;
}

export interface ReviewView {
  trackId: string;
  name: string;
  segments: ReviewSegment[];
  /** 0-based current segment (the strip's highlight). */
  seg: number;
  /** Probe x (the parked bike, or the ridden bike while riding). */
  x: number;
  dist: number;
  flying: boolean;
  riding: boolean;
}

export interface ReviewSessionHooks {
  /** The view changed (segment, x, fly / ride flags): the UI repaints from it. */
  onView(v: ReviewView): void;
  /** RIDE on/off: the app hands the touch strip to the player and back. */
  onRide(on: boolean): void;
}

export class ReviewSession {
  active = false;
  private def: TrackDef | null = null;
  private segments: ReviewSegment[] = [];
  private seg = 0;
  private x = 0;
  private dist = ZOOM_DEFAULT;
  private flying = false;
  private riding = false;
  private respawnPending = false;
  private trackKeys: CameraKey[] | undefined;
  private unsub: (() => void) | null = null;
  readonly store = new ReviewStore();

  constructor(
    private readonly game: Game,
    private readonly hooks: ReviewSessionHooks,
  ) {}

  /** Load `trackId` under the reviewer with nothing racing; false for an unknown track. */
  open(trackId: string, seg = 0): boolean {
    if (!this.game.loadTrack(trackId)) return false;
    this.game.setParked(true);
    const def = this.game.currentTrack!;
    this.def = def;
    this.trackKeys = def.meta?.camera;
    this.segments = reviewSegments(def, this.game.compiledTrack?.placed ?? []);
    this.active = true;
    this.flying = false;
    this.riding = false;
    this.dist = ZOOM_DEFAULT;
    this.applyZoom();
    this.unsub?.();
    this.unsub = this.game.onEvent((e) => {
      // A crash's auto-respawn (or R) resets to the checkpoint: the reviewer wants the segment start.
      if (this.riding && e.type === 'restart') this.respawnPending = true;
    });
    this.jumpTo(seg);
    return true;
  }

  close(): void {
    if (!this.active) return;
    this.stopRide();
    this.flying = false;
    this.active = false;
    this.unsub?.();
    this.unsub = null;
    const rig = this.rig();
    if (rig) rig.setKeys(this.trackKeys);
    this.game.setParked(false);
  }

  view(): ReviewView {
    return { trackId: this.def?.id ?? '', name: this.def?.name ?? '', segments: this.segments, seg: this.seg, x: this.x, dist: this.dist, flying: this.flying, riding: this.riding };
  }

  get trackId(): string {
    return this.def?.id ?? '';
  }

  // -- segments -----------------------------------------------------------------------

  jumpTo(seg: number): void {
    const s = this.segments[Math.max(0, Math.min(this.segments.length - 1, seg))];
    if (!s) return;
    this.stopRide();
    this.flying = false;
    this.seg = s.i - 1;
    this.setX(s.from + Math.min(1.5, (s.to - s.from) * 0.1));
  }

  private setX(x: number): void {
    const def = this.def;
    if (!def) return;
    this.x = Math.max(def.start.pos.x, Math.min(def.finishX, x));
    if (!this.riding) this.game.teleportBike(this.x);
    this.seg = segmentAt(this.segments, this.x);
    this.hooks.onView(this.view());
  }

  // -- camera -------------------------------------------------------------------------

  /** A drag of `dxPx` CSS px across a `widthPx` wide view: the probe moves the opposite way, the visible width ≈ 1.1 × dist. */
  panPx(dxPx: number, widthPx: number): void {
    if (this.riding) this.stopRide();
    this.flying = false;
    const metresPerPx = (this.dist * 1.1) / Math.max(1, widthPx);
    this.setX(this.x - dxPx * metresPerPx);
  }

  /** Move the probe by metres (keyboard ←/→, tests). */
  panM(dx: number): void {
    if (this.riding) this.stopRide();
    this.flying = false;
    this.setX(this.x + dx);
  }

  /** Multiply the camera distance (pinch scale < 1 zooms in, wheel up zooms in). */
  zoomBy(factor: number): void {
    this.dist = Math.max(ZOOM_RANGE[0], Math.min(ZOOM_RANGE[1], this.dist * factor));
    this.applyZoom();
    this.hooks.onView(this.view());
  }

  private applyZoom(): void {
    const rig = this.rig();
    if (!rig) return;
    rig.setKeys([{ x0: -1e9, x1: 1e9, dist: this.dist, blend: 0.25 }]);
  }

  private rig(): RigLike | null {
    const r = this.game.rendererRef as unknown as Partial<{ debug: { rig: RigLike } }>;
    const rig = r.debug?.rig;
    return rig && typeof rig.setKeys === 'function' ? rig : null;
  }

  // -- fly / ride -----------------------------------------------------------------------

  toggleFly(): void {
    if (this.riding) this.stopRide();
    this.flying = !this.flying;
    if (this.flying && this.def && this.x >= this.def.finishX - 0.01) this.setX(this.def.start.pos.x);
    this.hooks.onView(this.view());
  }

  toggleRide(): void {
    if (this.riding) this.stopRide();
    else this.startRide();
    this.hooks.onView(this.view());
  }

  private startRide(): void {
    if (!this.def || this.riding) return;
    this.flying = false;
    const x = this.x;
    this.game.startRun();
    this.game.skipCountdown();
    if (this.game.phase() !== 'riding') {
      // The countdown is held on the renderer's track entry: leave the run armed; the next frame's GO lands the bike where the probe is.
      this.respawnPending = true;
    }
    this.riding = true;
    this.game.teleportBike(x);
    this.game.setPaused(false);
    this.hooks.onRide(true);
  }

  private stopRide(): void {
    if (!this.riding) return;
    this.riding = false;
    this.respawnPending = false;
    this.game.setInput({ throttle: 0, brake: 0, lean: 0, restart: false });
    this.game.setParked(true);
    this.game.teleportBike(this.x);
    this.hooks.onRide(false);
  }

  /** Per app frame, before `game.advance`: FLY moves the probe; RIDE keeps the probe on the bike and applies a pending respawn to the segment start. */
  frame(elapsed: number): void {
    if (!this.active || !this.def) return;
    // Parked: the held world still steps (gravity, a tick inside an obstacle) — pin the probe every frame.
    if (!this.riding) this.game.teleportBike(this.x);
    if (this.flying) {
      const next = this.x + FLY_MPS * elapsed;
      if (next >= this.def.finishX) {
        this.flying = false;
        this.setX(this.def.finishX);
      } else this.setX(next);
      return;
    }
    if (this.riding) {
      if (this.respawnPending && this.game.phase() === 'riding') {
        this.respawnPending = false;
        const s = this.segments[this.seg]!;
        this.game.teleportBike(s.from + Math.min(1.5, (s.to - s.from) * 0.1));
      }
      const bx = this.game.getState().bike.pos.x;
      const seg = segmentAt(this.segments, bx);
      if (Math.abs(bx - this.x) > 0.05 || seg !== this.seg) {
        this.x = bx;
        this.seg = seg;
        this.hooks.onView(this.view());
      }
      if (this.game.phase() === 'finished') this.stopRide();
    }
  }

  // -- notes --------------------------------------------------------------------------

  note(i: number): SegmentNote {
    return this.store.get(this.trackId, i);
  }

  saveNote(i: number, note: Omit<SegmentNote, 'at'>): SegmentNote {
    return this.store.save(this.trackId, i, note);
  }

  /** Copy / Share payload for the loaded track. */
  export(build: string): { data: ReviewExport; text: string } {
    return buildReview(this.def!, build, this.segments, this.store.load(this.trackId));
  }
}
