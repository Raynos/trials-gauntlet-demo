/**
 * Garage (MEGA_PLAN P4; garage round): the model explorer, layout B "tool wall" on set E "shutter door"
 * (assets/design/garage/SPEC.md). The live 3D hero is the centrepiece — the renderer stages it in the
 * shutter-door bay (`setGarageStage`) and the screen drives an orbit camera (`setCameraOverride({ mode:
 * 'orbit' })`): one-finger / mouse drag rotates, pinch / wheel zooms, a short inertia settles the turn.
 * Nothing overlaps the hero: the controls hang as tags on a rail down the LEFT edge (outfit, bike class —
 * bike lowest, under the thumb; every tag ≥ 44 px, two per row, no scrolling), the metadata sits in a panel
 * on the RIGHT (the chosen bike's class, POWER / GRIP / WEIGHT bars and note, the outfit line, the load
 * status), badge plate top-left, ‹ MENU top-right, the gesture hint under the hero.
 * Pointer + Esc only (ask 32): a bike chip previews under the pointer (the staged hero swaps livery, no
 * track reload — ask 29) and commits on click (`trials.bikeClass`); an outfit commits on click
 * (`trials.riderOutfit`). The rider-model row is gone (asks 30 / 31): the Blender rider is the rider;
 * `?rider=` stays a harness / debug override. Copy states the physics v2 R3 numbers (physics.md "v2 status — R3").
 */
import type { BikeClass, RiderOutfit } from '../core/types';
import { RIDER_PRESETS } from '../core/riderPresets';
import type { ArtManifest } from './art';
import { BUILD_STAMP_SHORT, GAME_NAME, escapeHtml } from './front';
import type { UiSfx } from './sfx';
import { conceal, isLiveTarget, reveal } from './live';
import { DEFAULT_RIDER_OUTFIT, OUTFIT_DETAIL, OUTFIT_LABEL } from './outfit';

export interface BikeSpec {
  id: BikeClass;
  name: string;
  /** One line of character. */
  line: string;
  /** 0..1 bars. */
  power: number;
  grip: number;
  weight: number;
  weightFeel: string;
  /** Rule note under the strip. */
  note: string;
  /** Card tint (CSS colour). */
  tint: string;
}

export const BIKE_SPECS: Record<BikeClass, BikeSpec> = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    // physics.md "v2 status — R3": never loops at neutral (6.7° max pitch at lean 0), loops only leaning back
    // (−0.5 in 0.82 s), 0→16 m/s in 3.98 s at the launch pose, limiter 20 m/s, landings absorb (3 m drops ride away).
    line: 'Never loops at neutral. Forgiving landings, 0→16 in 4.0 s, tops 20 m/s.',
    power: 0.55,
    grip: 0.82,
    weight: 0.72,
    weightFeel: 'Planted',
    note: 'Loops only leaning back · standard medal targets',
    tint: '#ffb020',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    // R3 Pro row: 54 kg rider, 1 000 N, 0.08 s throttle, loops at lean 0 in 0.96 s under full gas, 0→16 in 3.25 s,
    // limiter 21 m/s, hop 5–10 % higher than the Rookie.
    line: 'Loops at neutral under full gas in ~1 s. 21 m/s, sharper throttle, higher hop.',
    power: 0.92,
    grip: 0.58,
    weight: 0.42,
    weightFeel: 'Flickable',
    note: 'Raw · medal targets 10 % tighter',
    tint: '#5aa9ff',
  },
};

export const BIKE_LABEL: Record<BikeClass, string> = { rookie: 'Rookie', pro: 'Pro' };

/**
 * The one place a player reads the wheelie balance point (physics.md R3 coasting-balance row, Rookie:
 * lean −1 / 0 / +1 → 24 / 50 / 69°; the Pro is within 3°). Garage detail line + the first-run card; never
 * floated during play.
 */
export const BALANCE_HINT = 'Wheelie balance point: ~50° at neutral · lean back and it moves to 69°, forward to 24°';

/** Orbit view the explorer opens on and the gesture limits (the renderer's rig clamps the same way). */
export const GARAGE_VIEW = {
  yaw: 0.42,
  pitch: 0.12,
  dist: 6.0,
  /** Where the hero's centre lands on the frame: between the rail (left ~27 %) and the panel (right ~23 %), mid-height. */
  screenX: 0.52,
  screenY: 0.47,
  pitchMin: -0.06,
  pitchMax: 0.55,
  distMin: 3.0,
  distMax: 8.0,
  /** Radians per CSS px of drag. */
  yawPerPx: (2 * Math.PI) / 640,
  pitchPerPx: 0.006,
} as const;

export interface GarageView {
  yaw: number;
  pitch: number;
  dist: number;
  screenX: number;
  screenY: number;
}

/** Outfit swatches for the tags (CSS backgrounds keyed by preset id). */
export const OUTFIT_SWATCH: Record<RiderOutfit, string> = {
  'street-mustard': '#d6a021',
  'street-openface': 'linear-gradient(135deg, #3a3d44 60%, #d9dde3 60%)',
  'race-bluewhite': 'linear-gradient(135deg, #2e6fd8 50%, #f2f2f2 50%)',
  'street-charcoal': '#2a2c31',
  'race-charcoalyellow': 'linear-gradient(135deg, #2a2c31 50%, #f5c518 50%)',
};

export interface GarageCallbacks {
  /** Focus moved: swap the live preview (not persisted). */
  previewBike(b: BikeClass): void;
  /** Confirmed: persist. */
  setBike(b: BikeClass): void;
  /** Load and commit clothing; false leaves the existing outfit selected. */
  setOutfit(outfit: RiderOutfit): Promise<boolean>;
  back(): void;
  /** Model explorer: stage the hero on the garage set (renderer `setGarageStage`). */
  stage?(on: boolean): void;
  /** Model explorer: orbit camera (`setCameraOverride({ mode: 'orbit', … })`); null restores the menu framing. */
  orbit?(view: GarageView | null): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function bar(label: string, v: number, text?: string): string {
  const n = Math.round(v * 100);
  return `<div class="stat"><span>${label}</span><i><b style="width:${n}%"></b></i><em>${text ? escapeHtml(text) : `${n}`}</em></div>`;
}

export class GarageScreen {
  readonly root: HTMLDivElement;
  /** The explorer surface (drag / pinch / wheel), under every control. */
  readonly stage: HTMLDivElement;
  private readonly cards = new Map<BikeClass, HTMLButtonElement>();
  private readonly outfits = new Map<RiderOutfit, HTMLButtonElement>();
  private readonly outfitStatus: HTMLSpanElement;
  private readonly detail: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly backButton: HTMLButtonElement;
  private readonly legend: HTMLDivElement;
  /** The bike under the pointer: the staged hero and the sheet follow it (ask 29); a click commits it. */
  private focus: BikeClass = 'rookie';
  private current: BikeClass = 'rookie';
  private outfitFocus: RiderOutfit = DEFAULT_RIDER_OUTFIT;
  private currentOutfit: RiderOutfit = DEFAULT_RIDER_OUTFIT;
  private pendingOutfit: RiderOutfit | null = null;
  private failedOutfit: RiderOutfit | null = null;
  private outfitRequest = 0;
  // --- explorer
  private readonly view: GarageView = { yaw: GARAGE_VIEW.yaw, pitch: GARAGE_VIEW.pitch, dist: GARAGE_VIEW.dist, screenX: GARAGE_VIEW.screenX, screenY: GARAGE_VIEW.screenY };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private pinchDist0 = 0;
  private yawVel = 0;
  private lastMoveAt = 0;
  private inertia = 0;
  private staged = false;
  private touched = false;

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    art: ArtManifest,
    private readonly cb: GarageCallbacks,
  ) {
    this.root = h('div', 'screen garage-screen');
    this.root.inert = true;
    this.root.setAttribute('aria-hidden', 'true');
    // The explorer surface: full-bleed under the badge / rail / panel; the live scene shows through the screen.
    this.stage = h('div', 'garage-stage');
    this.stage.setAttribute('aria-label', 'Model explorer: drag to rotate, pinch or scroll to zoom');
    this.bindExplorer();
    const badge = h('div', 'garage-badge', `<div class="garage-plate"><span class="wordmark">${escapeHtml(GAME_NAME)}</span><span class="garage-title">Garage</span></div><div class="garage-build">${escapeHtml(BUILD_STAMP_SHORT)}</div>`);
    this.hint = h('div', 'garage-hint', '<i></i>Drag to rotate · pinch to zoom');
    // --- The rail (left edge): outfit, bike class — bike lowest (SPEC §5: under the thumb). Pointer + Esc only
    // (ask 32): a chip previews under the pointer and commits on click; no key rows, no Tab-follow.
    const rail = h('div', 'garage-rail');
    const group = (id: string, label: string, head: string): HTMLDivElement => {
      const g = h('div', 'rail-group');
      g.dataset['group'] = id;
      const grid = h('div', 'rail-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', label);
      g.append(h('span', 'rail-head', escapeHtml(head)), grid);
      rail.appendChild(g);
      return grid;
    };
    {
      const grid = group('outfit', 'Rider outfit', 'Outfit');
      for (const preset of RIDER_PRESETS) {
        const outfit = preset.id;
        const [colour, style] = OUTFIT_LABEL[outfit].split(' · ');
        const button = h('button', 'chip outfit-button', `<i class="swatch"></i><b>${escapeHtml(colour ?? OUTFIT_LABEL[outfit])}</b>${style ? `<em>${escapeHtml(style)}</em>` : ''}`);
        button.type = 'button';
        button.dataset['outfit'] = outfit;
        button.title = `${OUTFIT_LABEL[outfit]} — ${OUTFIT_DETAIL[outfit]}`;
        button.querySelector<HTMLElement>('.swatch')!.style.background = OUTFIT_SWATCH[outfit];
        button.addEventListener('pointerenter', (event) => {
          if (event.pointerType !== 'touch' && this.canAct(button)) this.setOutfitFocus(outfit, true);
        });
        button.addEventListener('click', () => {
          if (!this.canAct(button)) return;
          this.setOutfitFocus(outfit, false);
          this.commitOutfit(outfit);
        });
        grid.appendChild(button);
        this.outfits.set(outfit, button);
      }
    }
    {
      const grid = group('bike', 'Bike class', 'Bike');
      for (const spec of [BIKE_SPECS.rookie, BIKE_SPECS.pro]) {
        const el = h('button', 'chip bike-chip', `<i class="chip-tint"></i><i class="chip-art"></i><b>${escapeHtml(spec.name)}</b><em>${spec.id === 'rookie' ? 'Class A' : 'Class P'}</em>`);
        el.type = 'button';
        el.dataset['bike'] = spec.id;
        el.style.setProperty('--tint', spec.tint);
        const artEl = el.querySelector<HTMLElement>('.chip-art')!;
        art.whenReady(() => art.applyBackground(artEl, art.bikeArt(spec.id))); // the tag's bike icon (menu art pack)
        el.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'touch' && this.canAct(el)) this.setFocus(spec.id, true);
        });
        el.addEventListener('click', () => {
          if (!this.canAct(el)) return;
          this.setFocus(spec.id, false);
          this.commitBike();
        });
        grid.appendChild(el);
        this.cards.set(spec.id, el);
      }
    }
    // --- The panel (right edge, under ‹ MENU): the chosen bike's sheet + the outfit / rider lines + the load status.
    const panel = h('div', 'garage-panel');
    this.detail = h('div', 'gp-sheet');
    this.outfitStatus = h('span', 'outfit-current');
    this.outfitStatus.setAttribute('role', 'status');
    panel.append(this.detail, this.outfitStatus);
    this.legend = h('div', 'legend');
    this.setDevice('keyboard');
    this.root.append(this.stage, h('div', 'grain'), badge, this.hint, rail, panel, this.legend);
    this.backButton = h('button', 'backbtn', '<span>‹</span>Menu');
    this.backButton.type = 'button';
    this.backButton.addEventListener('click', () => { if (this.canAct(this.backButton)) this.back(); });
    this.root.appendChild(this.backButton);
    parent.appendChild(this.root);
    this.paint();
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  show(current: BikeClass, outfit: RiderOutfit = DEFAULT_RIDER_OUTFIT): void {
    this.current = current;
    this.focus = current;
    this.currentOutfit = this.outfitFocus = outfit;
    this.resetView();
    this.paint();
    this.root.inert = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.classList.add('show');
    reveal(this.root);
    if (!this.staged) {
      this.staged = true;
      this.cb.stage?.(true);
    }
    this.pushView();
  }

  hide(): void {
    conceal(this.root);
    this.root.inert = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.classList.remove('show');
    this.stopInertia();
    this.pointers.clear();
    if (this.staged) {
      this.staged = false;
      this.cb.orbit?.(null);
      this.cb.stage?.(false);
    }
  }

  /** Ask 32: the garage is pointer-driven; the legend only names the way out (Esc / B). */
  setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    this.legend.innerHTML =
      d === 'gamepad'
        ? `<span><i class="pad b">B</i>Back</span>`
        : d === 'touch'
          ? `<span>Tap a chip to choose</span>`
          : `<span><kbd>Esc</kbd>Back</span>`;
    this.legend.classList.toggle('hide', d === 'touch'); // a thumb needs no key legend; the hint carries the gesture
    this.hint.innerHTML = `<i></i>${d === 'touch' ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom'}`;
  }

  /** The orbit the explorer is showing (tests / harness). */
  currentView(): GarageView {
    return { ...this.view };
  }

  private canAct(target: HTMLElement = this.root): boolean {
    return this.visible && isLiveTarget(target);
  }

  // -- explorer --------------------------------------------------------------------------

  private resetView(): void {
    this.view.yaw = GARAGE_VIEW.yaw;
    this.view.pitch = GARAGE_VIEW.pitch;
    this.view.dist = GARAGE_VIEW.dist;
    this.view.screenX = GARAGE_VIEW.screenX;
    this.view.screenY = GARAGE_VIEW.screenY;
    this.yawVel = 0;
    this.stopInertia();
    this.touched = false;
    this.hint.classList.remove('used');
  }

  private pushView(): void {
    if (!this.staged) return;
    this.cb.orbit?.({ ...this.view });
  }

  /** Programmatic turn / zoom (keyboard, harness): radians and a distance factor. */
  rotate(dYaw: number, dPitch = 0, zoom = 1): void {
    if (!this.canAct()) return;
    this.view.yaw += dYaw;
    this.view.pitch = clamp(this.view.pitch + dPitch, GARAGE_VIEW.pitchMin, GARAGE_VIEW.pitchMax);
    this.view.dist = clamp(this.view.dist * zoom, GARAGE_VIEW.distMin, GARAGE_VIEW.distMax);
    this.markUsed();
    this.pushView();
  }

  private markUsed(): void {
    if (this.touched) return;
    this.touched = true;
    this.hint.classList.add('used');
  }

  private bindExplorer(): void {
    const el = this.stage;
    el.addEventListener('pointerdown', (e) => {
      if (!this.canAct(el)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.stopInertia();
      try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        this.pinch0 = this.pinchSpan();
        this.pinchDist0 = this.view.dist;
      }
      this.yawVel = 0;
      this.lastMoveAt = performance.now();
      el.classList.add('grabbing');
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        const dYaw = -dx * GARAGE_VIEW.yawPerPx;
        this.view.yaw += dYaw;
        this.view.pitch = clamp(this.view.pitch + dy * GARAGE_VIEW.pitchPerPx, GARAGE_VIEW.pitchMin, GARAGE_VIEW.pitchMax);
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMoveAt);
        this.lastMoveAt = now;
        // Angular velocity in rad/ms, lightly smoothed, for the release inertia.
        this.yawVel = 0.6 * this.yawVel + 0.4 * (dYaw / dt);
        if (dx || dy) this.markUsed();
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const span = this.pinchSpan();
        if (span > 0) {
          this.view.dist = clamp((this.pinchDist0 * this.pinch0) / span, GARAGE_VIEW.distMin, GARAGE_VIEW.distMax);
          this.markUsed();
        }
      }
      this.pushView();
    });
    const release = (e: PointerEvent): void => {
      if (!this.pointers.delete(e.pointerId)) return;
      try { el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (this.pointers.size === 1) {
        // Back to one finger: the survivor becomes the drag origin, no pinch state.
        this.pinch0 = 0;
      } else if (this.pointers.size === 0) {
        el.classList.remove('grabbing');
        if (performance.now() - this.lastMoveAt < 80 && Math.abs(this.yawVel) > 0.0004) this.startInertia();
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('wheel', (e) => {
      if (!this.canAct(el)) return;
      e.preventDefault();
      const f = Math.exp(clamp(e.deltaY, -240, 240) * 0.0012);
      this.view.dist = clamp(this.view.dist * f, GARAGE_VIEW.distMin, GARAGE_VIEW.distMax);
      this.markUsed();
      this.pushView();
    }, { passive: false });
    // Two-finger trackpad pinch on macOS Safari arrives as a gesture event, not a wheel.
    let gestureDist = 0;
    el.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureDist = this.view.dist; });
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      if (!this.canAct(el) || !gestureDist || !scale) return;
      this.view.dist = clamp(gestureDist / scale, GARAGE_VIEW.distMin, GARAGE_VIEW.distMax);
      this.markUsed();
      this.pushView();
    });
  }

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private startInertia(): void {
    this.stopInertia();
    if (typeof requestAnimationFrame !== 'function') return;
    let last = performance.now();
    const step = (): void => {
      const now = performance.now();
      const dt = Math.min(50, now - last);
      last = now;
      this.yawVel *= Math.pow(0.9, dt / 16.7);
      this.view.yaw += this.yawVel * dt;
      this.pushView();
      if (Math.abs(this.yawVel) < 0.00003 || !this.visible) {
        this.inertia = 0;
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

  // -- choices --------------------------------------------------------------------------

  /** The pointer moves the preview too (the staged bike swaps livery), so the player sees before they commit. */
  private setFocus(b: BikeClass, tick: boolean): void {
    const changed = b !== this.focus;
    this.focus = b;
    if (tick && changed) this.sfx.tick();
    if (changed) this.cb.previewBike(b);
    this.paint();
  }

  private setOutfitFocus(outfit: RiderOutfit, tick: boolean): void {
    const moved = this.outfitFocus !== outfit;
    this.outfitFocus = outfit;
    this.outfits.get(outfit)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (tick && moved) this.sfx.tick();
    this.paint();
  }

  private paint(): void {
    for (const [id, el] of this.cards) {
      el.classList.toggle('on', id === this.focus);
      el.classList.toggle('selected', id === this.current);
      el.setAttribute('aria-pressed', String(id === this.current));
    }
    for (const [outfit, button] of this.outfits) {
      button.classList.toggle('on', outfit === this.outfitFocus);
      button.classList.toggle('selected', outfit === this.currentOutfit);
      button.setAttribute('aria-pressed', String(outfit === this.currentOutfit));
      button.setAttribute('aria-busy', String(outfit === this.pendingOutfit));
    }
    const active = `${OUTFIT_LABEL[this.currentOutfit]} selected`;
    const status = this.pendingOutfit
      ? `Loading ${OUTFIT_LABEL[this.pendingOutfit]}…`
      : this.failedOutfit
        ? `Could not load ${OUTFIT_LABEL[this.failedOutfit]}. Select it to retry. ${active}`
        : active;
    if (this.outfitStatus.textContent !== status) this.outfitStatus.textContent = status;
    // The sheet: the previewed bike's class, bars, character and note (the preview follows the pointer, so the
    // copy does too), then the outfit line. The balance hint rides as the sheet's title.
    const spec = BIKE_SPECS[this.focus];
    const sheet = `<div class="gp-name" style="--tint:${spec.tint}"><b>${escapeHtml(spec.name)}</b><small>${spec.id === 'rookie' ? 'Class A' : 'Class P'}</small></div>
      <div class="gp-stats">${bar('Power', spec.power)}${bar('Grip', spec.grip)}${bar('Weight', spec.weight, spec.weightFeel)}</div>
      <div class="gp-line">${escapeHtml(spec.line)}</div>
      <div class="gp-note">${escapeHtml(spec.note)}</div>
      <div class="gp-kv"><span>Outfit</span><b>${escapeHtml(OUTFIT_LABEL[this.currentOutfit])}</b></div>`;
    if (this.detail.innerHTML !== sheet) this.detail.innerHTML = sheet;
    this.detail.title = BALANCE_HINT;
  }

  private commitOutfit(outfit: RiderOutfit): void {
    if (this.pendingOutfit === outfit) return;
    const request = ++this.outfitRequest;
    this.pendingOutfit = outfit;
    this.failedOutfit = null;
    this.paint();
    void this.cb.setOutfit(outfit).catch(() => false).then((loaded) => {
      if (request !== this.outfitRequest) return;
      this.pendingOutfit = null;
      this.failedOutfit = loaded ? null : outfit;
      if (loaded) {
        this.currentOutfit = outfit;
        this.sfx.confirm();
      }
      this.paint();
    });
  }

  private commitBike(): void {
    this.current = this.focus;
    this.cb.setBike(this.focus);
    this.sfx.confirm();
    this.paint();
    const el = this.cards.get(this.focus);
    el?.animate?.([{ transform: 'scale(1.03)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1.03)' }], { duration: 240, easing: 'ease-out' });
  }

  back(): void {
    if (!this.canAct()) return;
    // Leaving restores the committed class if the player only browsed.
    if (this.focus !== this.current) this.cb.previewBike(this.current);
    this.sfx.back();
    this.cb.back();
  }
}
