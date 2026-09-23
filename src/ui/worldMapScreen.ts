/**
 * World map — the painted continent as the level select (project/archive/WORLD_MAP.md, ask 54; the A "Rebirth" mockup,
 * assets/design/worldmap/A-painted-{world,region}.png). One `translate / scale` scene root under a `touch-action:
 * none` viewport: the world plate, five region plates cross-fading in above the tier zoom, the road (SVG), fog of
 * war over locked land, region names, the markers (a diamond on the terrain with a leader-line name plate, the
 * bike + beacon + card on the current track) and the tier gate — all in map units (worldMap.ts), counter-scaled
 * with `--inv` so a diamond is a true 44 px target at every zoom. Screen-space chrome: badge + build stamp, ‹ MENU,
 * the progress chip, RIDE + GHOST. Camera: drag with inertia, pinch about the midpoint, wheel + Safari gesture
 * about the pointer, tap vs drag by travel, a 380 ms eased fly-to. Same callbacks / state reads as the screen it
 * replaces, so play, lock rules and best times are unchanged.
 */
import type { BikeClass, Medal, TrackDef } from '../core/types';
import type { ArtManifest } from './art';
import type { BestEntry, BoardEntry } from './best';
import { formatTime } from './format';
import { BUILD_STAMP_SHORT, escapeHtml, Screen, type FrontCallbacks, type FrontState } from './front';
import { isLiveTarget } from './live';
import { DEV_SURFACES } from '../core/release';
import { MEDAL_NAME, medalSvg, wordmarkSvg, zoneTitle } from './brand';
import { isLabTrack, medalTotals, nextTrack, shipTracks, stageLabel, type MedalOf } from './progress';
import type { UiSfx } from './sfx';
import { wantsHiRes } from '../boot/tier';
import { allMarkers, buildRegions, fitZoom, FLY_MS, fogPatches, frameFor, locate, MAP, nextGate, PLATE_LEFT, regionPlateSrc, routePath, TAP_SLOP, tierBlend, worldPlateSrc, ZOOM, type FogPatch, type Gate, type Marker, type Region, type RegionId } from './worldMap';
import { injectWorldMapStyles } from './worldMapStyles';

interface Cam {
  x: number;
  y: number;
  k: number;
}

interface MarkerRef {
  marker: Marker;
  el: HTMLDivElement;
  hit: HTMLButtonElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The rider marker: a small motorbike glyph (trusted markup). */
const BIKE_SVG = `<svg viewBox="0 0 30 20" width="30" height="20" aria-hidden="true"><circle cx="7" cy="14" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="23" cy="14" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 14 L12 7 L19 7 L23 14 M12 7 L10 3 L14 3 M15 7 L13 14" fill="none" stroke="#ffd25a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class WorldMapScreen extends Screen {
  private readonly view: HTMLDivElement;
  private readonly scene: HTMLDivElement;
  private readonly world: HTMLDivElement;
  private readonly tier: HTMLDivElement;
  private readonly route: SVGSVGElement;
  private readonly fog: SVGSVGElement;
  private readonly names: HTMLDivElement;
  private readonly markerLayer: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly ride: HTMLButtonElement;
  private readonly ghost: HTMLButtonElement;
  private regions: Region[] = [];
  private refs: MarkerRef[] = [];
  private gateEl: HTMLDivElement | null = null;
  private gate: Gate | null = null;
  /** Index into `refs` (the focused marker). */
  private focus = 0;
  /** −1 = the marker; 0 = RIDE; 1 = GHOST (keyboard / pad focus on the pills). */
  private action = -1;
  private launching = false;
  private plates = new Set<RegionId>();
  /** The fog as last built: a patch that is gone on the next build (its tier opened) lifts instead of vanishing. */
  private fog0: FogPatch[] = [];
  // -- camera --
  private cam: Cam = { x: 0, y: 0, k: ZOOM.region };
  private kMin = 0.3;
  private fly = 0;
  private inertia = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private pinchK0 = 1;
  private vel = { x: 0, y: 0 };
  private lastMoveAt = 0;
  private dragPx = 0;
  private dragging = false;
  private far = false;
  /** The map point under the viewport's focus (the last fly's target): a resize / re-show re-centres on it. */
  private anchor: { x: number; y: number } | null = null;
  private userMoved = false;
  private settleTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    private readonly art: ArtManifest,
    private readonly cb: FrontCallbacks,
    private readonly bestOf: (id: string) => BestEntry | null,
    private readonly state: () => FrontState,
    /** Local leaderboard: the class in effect's top 5 on the card. */
    private readonly boardOf?: (id: string, bike: BikeClass) => BoardEntry[],
  ) {
    super(parent, 'tracks-screen worldmap-screen');
    injectWorldMapStyles();
    this.view = el('div', 'wm-view');
    this.scene = el('div', 'wm-scene');
    this.world = el('div', 'wm-world');
    this.tier = el('div', 'wm-tier');
    this.route = document.createElementNS(SVG_NS, 'svg');
    this.route.setAttribute('class', 'wm-route');
    this.route.setAttribute('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
    this.fog = document.createElementNS(SVG_NS, 'svg');
    this.fog.setAttribute('class', 'wm-fog');
    this.fog.setAttribute('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
    this.names = el('div', 'wm-names');
    this.markerLayer = el('div', 'wm-markers');
    this.card = el('div', 'wm-card');
    this.scene.append(this.world, this.tier, this.route, this.fog, this.names, this.markerLayer);
    this.view.append(this.scene, el('div', 'wm-haze'), el('div', 'wm-clouds'));
    const brand = el('div', 'wm-brand', `<div class="plate"><b class="wordmark">${wordmarkSvg()}</b><span>World map</span></div>${DEV_SURFACES ? `<div class="stamp">${escapeHtml(BUILD_STAMP_SHORT)}</div>` : ''}`);
    this.progress = el('div', 'wm-progress');
    const actions = el('div', 'wm-actions');
    this.ride = el('button', 'wm-ride');
    this.ride.type = 'button';
    this.ghost = el('button', 'wm-ghost', '<span>▶</span> Ghost');
    this.ghost.type = 'button';
    actions.append(this.ride, this.ghost);
    this.legend = el('div', 'legend');
    this.root.append(this.view, brand, this.progress, actions, this.legend, el('i', 'wm-safe'));
    this.addBackButton('Menu');
    this.bindCamera();
    this.view.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || this.dragging || this.far) return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('.wm-marker');
      if (b) this.focusMarker(Number(b.dataset['i']), true, false);
    });
    this.view.addEventListener('click', (e) => {
      if (this.dragPx > TAP_SLOP || this.launching) return; // a drag that ended on a button is not a tap
      const t = e.target as HTMLElement;
      const m = t.closest<HTMLElement>('.wm-marker');
      if (m && !this.far && !m.classList.contains('shaded')) {
        const i = Number(m.dataset['i']);
        const already = i === this.focus && this.action < 0;
        this.focusMarker(i, true, true);
        if (already || this.refs[i]?.marker.locked) this.confirm(); // the focused marker launches; a locked one shakes and states its rule
        return;
      }
      const g = t.closest<HTMLElement>('.wm-gate');
      if (g && !this.far && this.gate) {
        const at = locate(this.regions, this.gate.track.id);
        if (at) this.focusMarker(this.indexOf(at), true, true, ZOOM.region);
        return;
      }
      if (this.far) {
        // The whole continent: a tap on the land flies to the nearest marker at region zoom.
        const near = this.nearest(e.clientX, e.clientY);
        if (near >= 0) this.focusMarker(near, true, true, ZOOM.region);
      }
    });
    this.ride.addEventListener('click', () => {
      this.action = -1;
      this.confirm();
    });
    this.ghost.addEventListener('click', () => this.alt());
    window.addEventListener('resize', () => {
      if (this.visible) this.layout();
    });
  }

  // ------------------------------------------------------------------ camera

  private bindCamera(): void {
    const v = this.view;
    const move = (e: PointerEvent): void => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.dragPx += Math.abs(dx) + Math.abs(dy);
      if (this.dragPx > TAP_SLOP && !this.dragging) {
        this.dragging = true;
        v.classList.add('grabbing');
      }
      if (this.pointers.size === 1) {
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMoveAt);
        this.lastMoveAt = now;
        this.cam.x += dx;
        this.cam.y += dy;
        this.anchor = null;
        this.userMoved = true;
        this.vel = { x: 0.6 * this.vel.x + 0.4 * (dx / dt), y: 0.6 * this.vel.y + 0.4 * (dy / dt) };
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()];
        const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (span > 0) {
          const r = v.getBoundingClientRect();
          // Pinch about the midpoint: the midpoint's drift pans, the span's ratio zooms.
          this.zoomAt(this.pinchK0 * (span / this.pinch0), (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
          if (this.pointers.size === 2) {
            this.cam.x += dx / 2;
            this.cam.y += dy / 2;
          }
        }
      }
      this.pushCam();
    };
    const release = (e: PointerEvent): void => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 1) {
        this.pinch0 = 0;
        this.vel = { x: 0, y: 0 };
      } else if (this.pointers.size === 0) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        v.classList.remove('grabbing');
        if (this.dragging && performance.now() - this.lastMoveAt < 80 && Math.hypot(this.vel.x, this.vel.y) > 0.05) this.startInertia();
        else this.settle();
        // The click that follows a drag is swallowed (`dragPx` is read there), then the slate is clean.
        setTimeout(() => {
          this.dragPx = 0;
          this.dragging = false;
        }, 0);
      }
    };
    v.addEventListener('pointerdown', (e) => {
      if (!this.visible || !isLiveTarget(this.root) || this.launching) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.stopFly();
      this.stopInertia();
      if (this.pointers.size === 0) {
        this.dragPx = 0;
        this.dragging = false;
        this.vel = { x: 0, y: 0 };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.pinchK0 = this.cam.k;
      }
      this.lastMoveAt = performance.now();
    });
    v.addEventListener(
      'wheel',
      (e) => {
        if (!this.visible || !isLiveTarget(this.root)) return;
        e.preventDefault();
        this.stopFly();
        this.stopInertia();
        const r = v.getBoundingClientRect();
        if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 3) {
          // Trackpad pinch arrives as a ctrl-wheel in Chrome; a plain wheel zooms about the pointer.
          const f = Math.exp(-Math.max(-240, Math.min(240, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.0016));
          this.zoomAt(this.cam.k * f, e.clientX - r.left, e.clientY - r.top);
        } else {
          this.cam.x -= e.deltaX;
          this.cam.y -= e.deltaY;
          this.anchor = null;
          this.userMoved = true;
        }
        this.pushCam();
        this.settleSoon();
      },
      { passive: false },
    );
    // Two-finger trackpad pinch on macOS Safari arrives as a gesture event, not a wheel: zoom about the pointer.
    let gk = 0;
    v.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gk = this.cam.k;
    });
    v.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      if (!this.visible || !gk || !g.scale) return;
      const r = v.getBoundingClientRect();
      this.zoomAt(gk * g.scale, (g.clientX ?? r.left + r.width / 2) - r.left, (g.clientY ?? r.top + r.height / 2) - r.top);
      this.pushCam();
    });
    v.addEventListener('gestureend', () => {
      gk = 0;
      this.settle();
    });
  }

  /** Set the zoom keeping the map point under (`sx`, `sy`) (view px) where it is. */
  private zoomAt(k: number, sx: number, sy: number): void {
    this.anchor = null;
    this.userMoved = true;
    const nk = Math.max(this.kMin, Math.min(ZOOM.max, k));
    const f = nk / this.cam.k;
    this.cam.x = sx - (sx - this.cam.x) * f;
    this.cam.y = sy - (sy - this.cam.y) * f;
    this.cam.k = nk;
  }

  /** Keep the map on screen: never pan past its edge (the sea and sky are the limit); centre it when it is smaller than the view. */
  private clampCam(c: Cam): Cam {
    const w = this.view.clientWidth || 1;
    const hgt = this.view.clientHeight || 1;
    const k = c.k;
    const mw = MAP.w * k;
    const mh = MAP.h * k;
    const x = mw <= w ? (w - mw) / 2 : Math.max(w - mw, Math.min(0, c.x));
    const y = mh <= hgt ? (hgt - mh) / 2 : Math.max(hgt - mh, Math.min(0, c.y));
    return { x, y, k };
  }

  /** Write the camera to the scene root (one transform), the counter-scales, the tier blend, and the harness-readable state. */
  private pushCam(): void {
    this.cam = this.clampCam(this.cam);
    const k = this.cam.k;
    this.scene.style.transform = `translate(${this.cam.x.toFixed(2)}px, ${this.cam.y.toFixed(2)}px) scale(${k.toFixed(5)})`;
    this.scene.style.setProperty('--inv', (1 / k).toFixed(4));
    this.scene.style.setProperty('--invh', (1 / Math.sqrt(k)).toFixed(4));
    this.tier.style.opacity = tierBlend(k).toFixed(3);
    const far = k < ZOOM.plates;
    if (far !== this.far) {
      this.far = far;
      this.scene.classList.toggle('far', far);
    }
    if (!far && tierBlend(k) > 0) this.loadPlates(false);
    this.scene.dataset['zoom'] = k.toFixed(3);
    this.scene.dataset['x'] = Math.round(this.cam.x).toString();
    this.scene.dataset['y'] = Math.round(this.cam.y).toString();
    this.scene.dataset['far'] = far ? '1' : '0';
    // No finger down (a fly, inertia, a wheel step): the shading tracks the camera frame by frame, never a stale one.
    if (this.pointers.size === 0) this.shade();
  }

  /** Screen position of a marker (view px) under the current camera. */
  private screenOf(m: Marker): { x: number; y: number } {
    return { x: this.cam.x + m.x * this.cam.k, y: this.cam.y + m.y * this.cam.k };
  }

  private nearest(clientX: number, clientY: number): number {
    const r = this.view.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    let best = -1;
    let bd = Infinity;
    this.refs.forEach((ref, i) => {
      const s = this.screenOf(ref.marker);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Where a focused marker is brought to: a little above the view's centre (the card hangs to its right, the pills sit below). */
  private focusPoint(): { x: number; y: number } {
    const w = this.view.clientWidth || 1;
    const hgt = this.view.clientHeight || 1;
    return { x: w * 0.42, y: hgt * 0.5 };
  }

  /** Fly the camera so map point (`mx`, `my`) lands at the focus point, at zoom `k` (default: the current zoom, raised to the region zoom when far). */
  private flyTo(mx: number, my: number, k?: number, smooth = true): void {
    const fp = this.focusPoint();
    const nk = Math.max(this.kMin, Math.min(ZOOM.max, k ?? (this.far ? ZOOM.region : this.cam.k)));
    this.flyCam(this.clampCam({ x: fp.x - mx * nk, y: fp.y - my * nk, k: nk }), { x: mx, y: my }, smooth);
  }

  /** The 380 ms eased tween to camera `to`; `anchor` is the map point the view is about (a resize re-centres on it). */
  private flyCam(to: Cam, anchor: { x: number; y: number }, smooth: boolean): void {
    this.anchor = anchor;
    this.userMoved = false;
    this.stopInertia();
    this.stopFly();
    if (!smooth || typeof requestAnimationFrame !== 'function') {
      this.cam = to;
      this.pushCam();
      this.settle();
      return;
    }
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (): void => {
      const t = Math.min(1, (performance.now() - t0) / FLY_MS);
      const e = 1 - Math.pow(1 - t, 3);
      // Zoom interpolates geometrically so a fly across zoom levels keeps a steady pace.
      const k = from.k * Math.pow(to.k / from.k, e);
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k };
      this.pushCam();
      if (t < 1) this.fly = requestAnimationFrame(step);
      else {
        this.fly = 0;
        this.settle();
      }
    };
    this.fly = requestAnimationFrame(step);
  }

  private stopFly(): void {
    if (this.fly && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.fly);
    this.fly = 0;
  }

  private startInertia(): void {
    this.stopInertia();
    if (typeof requestAnimationFrame !== 'function') return;
    let last = performance.now();
    const step = (): void => {
      const now = performance.now();
      const dt = Math.min(50, now - last);
      last = now;
      const d = Math.pow(0.92, dt / 16.7);
      this.vel = { x: this.vel.x * d, y: this.vel.y * d };
      const before = { x: this.cam.x, y: this.cam.y };
      this.cam.x += this.vel.x * dt;
      this.cam.y += this.vel.y * dt;
      this.pushCam();
      const stuck = Math.abs(this.cam.x - before.x) < 0.01 && Math.abs(this.cam.y - before.y) < 0.01;
      if (stuck || Math.hypot(this.vel.x, this.vel.y) < 0.01 || !this.visible) {
        this.inertia = 0;
        this.settle();
        return;
      }
      this.inertia = requestAnimationFrame(step);
    };
    this.inertia = requestAnimationFrame(step);
  }

  private stopInertia(): void {
    if (this.inertia && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.inertia);
    this.inertia = 0;
  }

  private settleSoon(): void {
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.settle(), 140);
  }

  /** The camera has stopped: shade the markers under the card, load the region plates in view. */
  private settle(): void {
    this.shade();
    if (!this.far) this.loadPlates(false);
  }

  /** Screen-space boxes (view px) the overlays cover — the card, the brand plate, MENU, the progress chip, the pills: a marker under one is shaded. */
  private blocks: { src: string; l: number; t: number; r: number; b: number }[] = [];

  private measureBlocks(): void {
    const v = this.view.getBoundingClientRect();
    this.blocks = [];
    if (!v.width) return;
    for (const sel of ['.wm-card', '.wm-brand', '.backbtn', '.wm-progress', '.wm-actions']) {
      const e = this.root.querySelector<HTMLElement>(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2) continue;
      this.blocks.push({ src: sel, l: r.left - v.left - 4, t: r.top - v.top - 4, r: r.right - v.left + 4, b: r.bottom - v.top + 4 });
    }
    // The side safe areas (the notch, the rounded corners): nothing tappable stands in them.
    const safe = this.safeInsets();
    if (safe.l > 0) this.blocks.push({ src: 'safe', l: -1e4, t: -1e4, r: safe.l, b: 1e4 });
    if (safe.r > 0) this.blocks.push({ src: 'safe', l: v.width - safe.r, t: -1e4, r: 1e4, b: 1e4 });
  }

  /**
   * The card hangs beside the marker: right and down by default, else right-up, left-down, left-up — the first that
   * stays inside the view (clear of the side safe areas) and off every chrome box (brand, MENU, the progress chip, the
   * pills); none clear, the one that covers the least. Its box is measured (it is drawn at 1 screen px per CSS px at
   * every zoom), or assumed 178 × 110 before layout.
   */
  private placeCard(): void {
    const ref = this.refs[this.focus];
    const w = this.view.clientWidth;
    const hgt = this.view.clientHeight;
    if (!ref || !hgt) return;
    const f = this.far ? 0.7 : 1;
    const cw = (this.card.offsetWidth || 178) * f;
    const ch = (this.card.offsetHeight || 110) * f;
    const gap = 26 * f;
    const s = this.screenOf(ref.marker);
    const safe = this.safeInsets();
    const chrome = this.blocks.filter((b) => b.src !== '.wm-card');
    const box = (left: boolean, up: boolean): { l: number; t: number; r: number; b: number } => {
      const l = left ? s.x - gap - cw : s.x + gap;
      const t = up ? s.y - ch * 0.9 : s.y - ch * 0.14;
      return { l, t, r: l + cw, b: t + ch };
    };
    const cost = (b: { l: number; t: number; r: number; b: number }): number => {
      let c = Math.max(0, safe.l + 4 - b.l) * ch + Math.max(0, b.r - (w - safe.r - 4)) * ch + Math.max(0, 4 - b.t) * cw + Math.max(0, b.b - (hgt - 4)) * cw;
      for (const o of chrome) c += Math.max(0, Math.min(b.r, o.r) - Math.max(b.l, o.l)) * Math.max(0, Math.min(b.b, o.b) - Math.max(b.t, o.t));
      return c;
    };
    let pick: [boolean, boolean] = [false, false];
    let best = Infinity;
    for (const [left, up] of [[false, false], [false, true], [true, false], [true, true]] as [boolean, boolean][]) {
      const c = cost(box(left, up));
      if (c < best - 0.5) {
        best = c;
        pick = [left, up];
      }
    }
    this.card.classList.toggle('left', pick[0]);
    this.card.classList.toggle('up', pick[1]);
  }

  /** The side safe areas (px) as the page resolves them (`--sal` / `--sar` on a probe; 0 in jsdom). */
  private safeInsets(): { l: number; r: number } {
    const p = this.root.querySelector<HTMLElement>('.wm-safe');
    return { l: p?.offsetWidth ?? 0, r: p?.offsetHeight ?? 0 };
  }

  /** A marker (or the gate) whose diamond meets an overlay's box is shaded: drawn dim, no pointer — nothing tappable hides under another tappable. */
  private shade(): void {
    if (!this.view.clientWidth) return;
    this.measureBlocks();
    this.placeCard();
    this.measureBlocks();
    const hit = (sx: number, sy: number): boolean => {
      for (const b of this.blocks) if (sx + 23 > b.l && sx - 23 < b.r && sy + 23 > b.t && sy - 23 < b.b) return true;
      return false;
    };
    this.refs.forEach((ref, i) => {
      const s = this.screenOf(ref.marker);
      ref.el.classList.toggle('shaded', i !== this.focus && hit(s.x, s.y));
    });
    if (this.gateEl && this.gate) this.gateEl.classList.toggle('shaded', hit(this.cam.x + this.gate.x * this.cam.k, this.cam.y + this.gate.y * this.cam.k));
    // A zone name (and its sign) that runs under the chrome steps back, so the badge and ‹ MENU never sit on a word.
    const v = this.view.getBoundingClientRect();
    for (const n of this.names.children as HTMLCollectionOf<HTMLElement>) {
      const r = n.getBoundingClientRect();
      const under = this.blocks.some((b) => b.src !== 'safe' && b.src !== '.wm-card' && r.right - v.left > b.l && r.left - v.left < b.r && r.bottom - v.top > b.t && r.top - v.top < b.b);
      n.classList.toggle('under', under);
    }
  }

  /** The fit zoom from the view's box; the camera re-centres on its anchor. Called on build, show and resize (never per frame). */
  private layout(): void {
    const w = this.view.clientWidth;
    const hgt = this.view.clientHeight;
    if (!w || !hgt) {
      this.pushCam(); // no box yet (hidden, or jsdom): the camera is still written so the scene has a transform
      return;
    }
    this.kMin = fitZoom(w, hgt);
    const cur = this.refs[this.focus];
    if (this.anchor) this.flyTo(this.anchor.x, this.anchor.y, undefined, false);
    else if (cur && !this.userMoved) this.frameRegion(cur.marker, false);
    else this.pushCam();
  }

  /**
   * Open on the focused marker's region frame (the mockup's composition: the region with its neighbour beyond), the
   * marker's card on it; when the marker would fall outside the view, centre on the marker at that zoom instead.
   */
  private frameRegion(m: Marker, smooth: boolean): void {
    const w = this.view.clientWidth || 1;
    const hgt = this.view.clientHeight || 1;
    const region = this.regions.find((r) => r.id === m.region) ?? this.regions[0];
    if (!region) return;
    const f = frameFor(region, w, hgt);
    const c = { x: w / 2 - f.x * f.k, y: hgt / 2 - f.y * f.k, k: f.k };
    // The frame first; then the camera slides just enough that the focused marker (and its card to the right) sits
    // inside the middle of the view — the frame's far edge gives way, never the marker.
    const sx = c.x + m.x * f.k;
    const sy = c.y + m.y * f.k;
    c.x -= Math.max(0, sx - w * 0.72) - Math.max(0, w * 0.15 - sx);
    c.y -= Math.max(0, sy - hgt * 0.68) - Math.max(0, hgt * 0.15 - sy);
    // Then the zone's painted name comes fully into view (clear of the side safe areas and the brand plate), as far as
    // the marker allows: it may slide to 10 % / 85 % of the width, 12 % / 72 % of the height, never off the view.
    const nameEl = this.names.querySelector<HTMLElement>(`.wm-name[data-region="${region.id}"]`);
    if (nameEl?.offsetWidth) {
      this.measureBlocks();
      const safe = this.safeInsets();
      const sc = Math.sqrt(f.k); // the name counter-scales by 1 / √k inside a scene drawn at k
      const hw = (nameEl.offsetWidth * sc) / 2 + 14;
      const hh = (nameEl.offsetHeight * sc) / 2 + 10;
      const nx = c.x + region.name.x * f.k;
      const ny = c.y + region.name.y * f.k;
      const mx = c.x + m.x * f.k;
      const my = c.y + m.y * f.k;
      let dx = Math.max(0, safe.l - (nx - hw)) - Math.max(0, nx + hw - (w - safe.r));
      const brand = this.blocks.find((b) => b.src === '.wm-brand');
      let dy = Math.max(0, 4 - (ny - hh)) - Math.max(0, ny + hh - (hgt - 4));
      if (brand && nx - hw + dx < brand.r && ny - hh + dy < brand.b) dy = Math.max(dy, brand.b - (ny - hh));
      dx = Math.max(w * 0.1 - mx, Math.min(w * 0.85 - mx, dx));
      dy = Math.max(hgt * 0.12 - my, Math.min(hgt * 0.72 - my, dy));
      c.x += dx;
      c.y += dy;
    }
    this.flyCam(this.clampCam(c), { x: (w / 2 - c.x) / f.k, y: (hgt / 2 - c.y) / f.k }, smooth);
  }

  // ------------------------------------------------------------------ build

  build(tracks: TrackDef[]): void {
    const s = this.state();
    const medalOf: MedalOf = (t) => this.bestOf(t)?.medal ?? null;
    const ship = shipTracks(tracks, s.dev);
    const regions = buildRegions(tracks, medalOf, s.dev);
    this.regions = regions;
    this.gate = nextGate(regions);
    this.action = -1;
    // Terrain plates: the world plate (tinted sea until it decodes), the region plates (each fades in when it decodes).
    void this.plate((hi) => worldPlateSrc(hi)).then((src) => {
      if (!src) return;
      this.world.style.backgroundImage = `url("${src}")`;
      this.world.classList.add('loaded');
    });
    this.tier.innerHTML = '';
    for (const r of regions) {
      const p = el('div', 'wm-region');
      p.dataset['region'] = r.id;
      p.style.left = `${r.crop.x}px`;
      p.style.top = `${r.crop.y}px`;
      p.style.width = `${r.crop.w}px`;
      p.style.height = `${r.crop.h}px`;
      this.tier.appendChild(p);
    }
    this.plates = new Set();
    // The road.
    const path = routePath(regions);
    const svgPath = (cls: string, d: string): string => (d ? `<path class="${cls}" d="${d}"/>` : '');
    this.route.innerHTML = `${svgPath('spur', path.spurs)}${svgPath('dim', path.dim)}${svgPath('glow', path.lit)}${svgPath('lit', path.lit)}`;
    // Fog of war: the locked regions' ellipses and a patch on every locked marker in open land; fog that was there at
    // the last build and is gone now (the tier opened while the player rode) lifts over 1.4 s instead of vanishing.
    const fog = fogPatches(regions);
    const now = new Set(fog.map((f) => f.key));
    const lifted = this.fog0.filter((f) => !now.has(f.key));
    this.fog0 = fog;
    const ell = (f: FogPatch, cls: string): string => `<ellipse class="${cls}" data-key="${escapeHtml(f.key)}" cx="${f.x}" cy="${f.y}" rx="${f.rx}" ry="${f.ry}"/>`;
    this.fog.innerHTML = `<defs><radialGradient id="wm-fog-g"><stop offset="0" stop-color="#a9b6c9" stop-opacity=".6"/><stop offset=".55" stop-color="#8b97ad" stop-opacity=".42"/><stop offset="1" stop-color="#6b7688" stop-opacity="0"/></radialGradient></defs>${fog.map((f) => ell(f, 'fog')).join('')}${lifted.map((f) => ell(f, 'fog open')).join('')}`;
    // Zone names, painted over the land on two lines (W-worldmap); under an open zone its count, under a locked one its
    // sign — the rule stated once per zone (the gate zone's sign also names the next unlock), a padlock on each marker.
    this.names.innerHTML = '';
    for (const r of regions) {
      const [first, ...rest] = r.label.split(' ');
      const rule = r.markers.find((m) => m.locked && !m.proving)?.rule;
      const next = this.gate && this.gate.region === r.id ? `<small>Next unlock · ${escapeHtml(this.gate.track.name)}</small>` : '';
      const foot = rule ? `<span class="wm-sign"><i class="wm-padlock"></i>${escapeHtml(rule)}${next}</span>` : `<small>${r.total ? `${r.done} / ${r.total}` : ''}</small>`;
      const n = el('div', `wm-name${r.locked ? ' locked' : ''}`, `<b><span>${escapeHtml(first ?? '')}</span>${rest.length ? ` <span>${escapeHtml(rest.join(' '))}</span>` : ''}</b>${foot}`);
      n.dataset['region'] = r.id;
      n.style.left = `${r.name.x}px`;
      n.style.top = `${r.name.y}px`;
      this.names.appendChild(n);
    }
    // Markers: the route first, then the Lab and the playgrounds (the order `nav()` steps).
    this.markerLayer.innerHTML = '';
    this.refs = allMarkers(regions).map((marker, i) => {
      const m = this.markerEl(marker, i);
      this.markerLayer.appendChild(m.el);
      return m;
    });
    // The tier gate.
    this.gateEl = null;
    if (this.gate) {
      const g = this.gate;
      const ge = el('div', 'wm-gate');
      ge.dataset['track'] = g.track.id;
      ge.style.left = `${g.x}px`;
      ge.style.top = `${g.y}px`;
      const deg = (Math.atan2(g.dy, g.dx) * 180) / Math.PI;
      // The chevrons across the road; the rule itself stands on the zone's sign (once per zone).
      ge.innerHTML = `<button type="button" class="wm-hit" aria-label="${escapeHtml(zoneTitle(g.stage))} locked: ${escapeHtml(g.rule)}. Next unlock: ${escapeHtml(g.track.name)}"></button><span class="chev" style="transform: rotate(${deg.toFixed(1)}deg)">›››</span>`;
      this.markerLayer.appendChild(ge);
      this.gateEl = ge;
    }
    this.markerLayer.appendChild(this.card);
    // Progress chip: cleared / total and the medal dots.
    const totals = medalTotals(ship, medalOf);
    // W-worldmap's chip: the count, a rule, then each medal as its badge and a number (the name is the badge's label).
    const dot = (m: Medal, n: number): string => `<span class="${m}" title="${MEDAL_NAME[m]}">${medalSvg(m, MEDAL_NAME[m])}${n}</span>`;
    this.progress.innerHTML = `<span class="n"><b>${totals.cleared}</b> / ${totals.total} cleared</span><span class="dots">${dot('platinum', totals.platinum)}${dot('gold', totals.gold)}${dot('silver', totals.silver)}${dot('bronze', totals.bronze)}</span>`;
    // Opening focus: last played if still open, else the first unridden track of the highest open tier (`nextTrack`).
    const target = nextTrack(ship, medalOf, s.dev, s.lastPlayed);
    const at = locate(regions, target?.id);
    this.focus = at ? this.indexOf(at) : 0;
    this.cam.k = ZOOM.region;
    this.anchor = null;
    this.userMoved = false;
    this.applyFocus(false);
    this.layout();
  }

  private indexOf(at: { region: number; marker: number }): number {
    const m = this.regions[at.region]?.markers[at.marker];
    const i = this.refs.findIndex((r) => r.marker === m);
    return i >= 0 ? i : 0;
  }

  private markerEl(marker: Marker, i: number): MarkerRef {
    const t = marker.track;
    const best = this.bestOf(t.id);
    const kind = marker.locked ? 'locked' : marker.proving ? 'proving' : marker.medal ? marker.medal : 'open';
    const wrap = el('div', `wm-marker ${kind}${marker.upNext ? ' next' : ''}${PLATE_LEFT.has(t.id) ? ' lead-left' : ''}`);
    wrap.dataset['i'] = String(i);
    wrap.dataset['track'] = t.id;
    wrap.dataset['region'] = marker.region;
    wrap.style.left = `${marker.x}px`;
    wrap.style.top = `${marker.y}px`;
    const ghost = best?.recording && !marker.locked ? `<em class="tag ghost">▶ ${this.state().ghost ? 'Ghost' : 'PB'}</em>` : '';
    const pro = best?.bike === 'pro' ? '<em class="tag pro">Pro</em>' : '';
    const next = marker.upNext ? '<em class="tag next">Up next</em>' : '';
    const title = marker.locked ? `${marker.code} ${t.name} — locked: ${marker.rule ?? ''}` : `${marker.code} ${t.name}`;
    wrap.innerHTML = `<span class="wm-beacon"></span><span class="wm-spire"></span><span class="wm-foot"></span><span class="wm-ring"></span><button type="button" class="wm-hit" aria-label="${escapeHtml(title)}"><i class="wm-diamond"></i><i class="wm-lock"></i></button><span class="wm-lead"></span><span class="wm-plate"><b>${escapeHtml(marker.code)}</b> · ${escapeHtml(t.name)}${next}${pro}${ghost}</span><span class="wm-bike">${BIKE_SVG}</span>`;
    return { marker, el: wrap, hit: wrap.querySelector<HTMLButtonElement>('.wm-hit')! };
  }

  /** The region plates: the focused marker's region first, the rest when the camera settles at a zoom that shows them. */
  private loadPlates(focusedOnly: boolean): void {
    const want = focusedOnly ? [this.refs[this.focus]?.marker.region].filter((x): x is RegionId => !!x) : this.regions.map((r) => r.id);
    for (const id of want) {
      if (this.plates.has(id)) continue;
      this.plates.add(id);
      const p = this.tier.querySelector<HTMLElement>(`.wm-region[data-region="${id}"]`);
      void this.plate((hi) => regionPlateSrc(id, hi)).then((src) => {
        if (!src || !p?.isConnected) return;
        p.style.backgroundImage = `url("${src}")`;
        p.classList.add('loaded');
      });
    }
  }

  /**
   * One plate at THIS device's tier, degrading to the other (ask 59). The offline pack downloads a single
   * tier — the one `wantsHiRes()` picked on the load that filled the cache — so a window later dragged to a
   * 1x monitor (or a phone mirrored to a desktop) asks for a file the cache does not have. Offline that
   * probe fails, and the map would be a blue sea with markers on it; the second probe draws the tier the
   * device actually has. Online the first one simply hits the network and this costs nothing.
   */
  private async plate(src: (hi: boolean) => string): Promise<string | null> {
    const hi = wantsHiRes();
    if (await this.art.probe(src(hi))) return src(hi);
    return (await this.art.probe(src(!hi))) ? src(!hi) : null;
  }

  /** Top-5 chips for the class the next launch rides (`FrontState.bikeClass`), medal-coloured; nothing when the board is empty. */
  private boardHtml(trackId: string): string {
    const bike = this.state().bikeClass;
    const rows = this.boardOf?.(trackId, bike) ?? [];
    if (rows.length === 0) return '';
    const short = (t: number): string => {
      const m = Math.floor(t / 60);
      const sec = (t - m * 60).toFixed(1);
      return m > 0 ? `${m}:${sec.padStart(4, '0')}` : sec;
    };
    return `<div class="board" data-bike="${bike}" data-rows="${rows.length}">${rows.map((e, i) => `<span class="${e.medal}" title="#${i + 1} ${bike} · ${formatTime(e.time)} · ${e.faults} ${e.faults === 1 ? 'bail' : 'bails'}">${short(e.time)}</span>`).join('')}</div>`;
  }

  /** The card on the focused marker and the RIDE / GHOST pills: re-rendered on every focus. */
  private renderCard(ref: MarkerRef): void {
    const { marker } = ref;
    const t = marker.track;
    const best = this.bestOf(t.id);
    const target = t.meta?.targetTimeS;
    const ahead = best && target ? best.time <= target : false;
    const kind = marker.proving ? (isLabTrack(t) ? 'Lab · proving ground' : `Free ride · ${stageLabel(marker.region)}`) : stageLabel(marker.region);
    const times = marker.proving
      ? `<div class="times"><b class="none">No medals</b></div>`
      : marker.locked
        ? `<div class="rule">Locked · ${escapeHtml(marker.rule ?? '')}</div>`
        : `<div class="times"><b class="${best ? (ahead ? '' : 'behind') : 'none'}">${best ? formatTime(best.time) : '—'}</b> / ${target ? formatTime(target) : '—'}</div>`;
    const canGhost = !!best?.recording && !marker.locked;
    this.card.dataset['track'] = t.id;
    this.card.dataset['region'] = marker.region;
    this.card.style.left = `${marker.x}px`;
    this.card.style.top = `${marker.y}px`;
    this.card.innerHTML = `<div class="head"><b>${escapeHtml(marker.code)}</b> · ${escapeHtml(kind)}</div><div class="name">${escapeHtml(t.name)}</div>${times}${marker.proving || marker.locked ? '' : this.boardHtml(t.id)}<span class="wm-card-ghost"${canGhost ? '' : ' hidden'}>▶ ${this.state().ghost ? 'Ghost' : 'Watch PB'}</span>`;
    this.ride.disabled = marker.locked;
    this.ride.innerHTML = marker.locked ? `Locked <small>${escapeHtml(marker.rule ?? '')}</small>` : `Ride <small>${escapeHtml(t.name)}</small><span class="arrow">›</span>`;
    this.ghost.hidden = !canGhost;
    this.ghost.innerHTML = `<span>▶</span> ${this.state().ghost ? 'Ghost' : 'Watch PB'}`;
    this.applyAction();
  }

  private applyAction(): void {
    this.ride.classList.toggle('on', this.action === 0);
    this.ghost.classList.toggle('on', this.action === 1);
  }

  /** Focus a marker; with `follow`, the camera brings it to the focus point (a fly when it is outside the middle of the view, or when `k` asks for a zoom). */
  private focusMarker(i: number, tick: boolean, follow: boolean, k?: number): void {
    if (this.launching) return;
    const ref = this.refs[i];
    if (!ref) return;
    const moved = i !== this.focus || this.action >= 0;
    this.focus = i;
    this.action = -1;
    if (tick && moved) this.sfx.tick();
    this.applyFocus(moved);
    if (follow) this.follow(ref.marker, k);
  }

  /** The camera follows the focused marker: a fly when it sits outside the middle 60 % of the view (or when far), else stay. */
  private follow(m: Marker, k?: number): void {
    const w = this.view.clientWidth || 1;
    const hgt = this.view.clientHeight || 1;
    const s = this.screenOf(m);
    const inside = s.x >= w * 0.2 && s.x <= w * 0.7 && s.y >= hgt * 0.2 && s.y <= hgt * 0.8;
    if (inside && k === undefined && !this.far) {
      this.settle();
      return;
    }
    this.flyTo(m.x, m.y, k);
  }

  private applyFocus(animate: boolean): void {
    this.refs.forEach((r, i) => r.el.classList.toggle('on', i === this.focus));
    const ref = this.refs[this.focus];
    if (!ref) return;
    this.scene.dataset['track'] = ref.marker.track.id;
    this.scene.dataset['region'] = ref.marker.region;
    this.renderCard(ref);
    this.card.classList.remove('rise');
    if (animate) {
      void this.card.offsetWidth;
      this.card.classList.add('rise');
    }
    this.loadPlates(true);
    this.shade();
  }

  current(): MarkerRef | null {
    return this.refs[this.focus] ?? null;
  }

  override setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    if (!this.legend) return;
    this.legend.innerHTML =
      d === 'touch'
        ? '<span>Tap a track</span><span>Drag · pinch</span>'
        : d === 'gamepad'
          ? '<span><i class="pad">✚</i>Tracks</span><span><i class="pad a">A</i>Ride</span><span><i class="pad b">B</i>Back</span>'
          : '<span><kbd>←→</kbd>Along the road</span><span><kbd>↑↓</kbd>Across</span><span><kbd>Enter</kbd>Ride</span><span><kbd>V</kbd>Ghost</span><span>Drag · wheel</span><span><kbd>Esc</kbd>Back</span>';
  }

  /** The region of the focused marker (the harness reads it). */
  currentRegion(): RegionId | null {
    return this.refs[this.focus]?.marker.region ?? null;
  }

  /** The camera, for the harness: zoom, its bounds, the focused track and the markers whose anchors are on screen. */
  camera(): { zoom: number; zoomMin: number; zoomMax: number; x: number; y: number; far: boolean; track: string | null; region: RegionId | null; markersInView: string[]; plates: string[] } {
    const w = this.view.clientWidth;
    const hgt = this.view.clientHeight;
    return {
      zoom: this.cam.k,
      zoomMin: this.kMin,
      zoomMax: ZOOM.max,
      x: this.cam.x,
      y: this.cam.y,
      far: this.far,
      track: this.refs[this.focus]?.marker.track.id ?? null,
      region: this.currentRegion(),
      markersInView: this.refs
        .filter((r) => {
          const s = this.screenOf(r.marker);
          return s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= hgt;
        })
        .map((r) => r.marker.track.id),
      plates: [...this.tier.querySelectorAll<HTMLElement>('.wm-region.loaded')].map((p) => p.dataset['region'] ?? ''),
    };
  }

  override show(): void {
    this.launching = false;
    super.show();
    this.layout();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.layout());
  }

  override hide(): void {
    this.stopFly();
    this.stopInertia();
    super.hide();
  }

  /** ←→ step the markers along the road (then the Lab and the playgrounds); ↑↓ pick the nearest marker in that direction, or reach the pills. */
  nav(dx: number, dy: number): void {
    if (this.launching || this.refs.length === 0) return;
    if (this.action >= 0) {
      if (dy < 0) {
        this.action = -1;
        this.sfx.tick();
        this.applyAction();
        return;
      }
      if (dx) {
        const n = this.ghost.hidden ? 1 : 2;
        this.action = Math.max(0, Math.min(n - 1, this.action + dx));
        this.sfx.tick();
        this.applyAction();
      }
      return;
    }
    if (dx) {
      const i = (this.focus + dx + this.refs.length) % this.refs.length;
      this.focusMarker(i, true, true);
      return;
    }
    if (!dy) return;
    const cur = this.refs[this.focus]!.marker;
    // The nearest marker within ±60° of straight up / down in map space; none that way and ↓ reaches the pills.
    let best = -1;
    let bd = Infinity;
    this.refs.forEach((r, i) => {
      if (i === this.focus) return;
      const ddx = r.marker.x - cur.x;
      const ddy = (r.marker.y - cur.y) * dy;
      if (ddy <= 0 || Math.abs(ddx) > ddy * 1.8) return;
      const d = Math.hypot(ddx, ddy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) this.focusMarker(best, true, true);
    else if (dy > 0) {
      this.action = 0;
      this.sfx.tick();
      this.applyAction();
    }
  }

  confirm(): void {
    const cur = this.current();
    if (!cur || this.launching) return;
    if (this.action === 1) return this.alt();
    if (cur.marker.locked) {
      this.sfx.back();
      cur.el.animate?.([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 240, easing: 'ease-out' });
      this.ride.animate?.([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    this.launching = true;
    this.sfx.launch();
    cur.el.classList.add('go');
    setTimeout(() => this.cb.play(cur.marker.track.id), 180);
    setTimeout(() => this.root.classList.add('leave'), 200);
    setTimeout(() => {
      cur.el.classList.remove('go');
      this.hide();
      this.launching = false;
    }, 420);
  }

  back(): void {
    if (this.launching) return;
    this.sfx.back();
    this.cb.goto('menu');
  }

  /** `V` / pad Y / the GHOST pill: replay viewer on the focused track's PB (no-op without a recording). */
  override alt(): void {
    const cur = this.current();
    if (!cur || this.launching || cur.marker.locked) return;
    if (!this.bestOf(cur.marker.track.id)?.recording) return;
    this.sfx.confirm();
    this.cb.watchPb(cur.marker.track.id);
  }
}
