/**
 * Touch → InputFrame (CONTRACT §2.8). Full-screen pointer-event overlay with
 * `touch-action: none`. Left half = two lean zones (back | forward), right
 * half = brake | throttle. Restart button top-right, pause top-left, both
 * ≥ 44 pt. Every pointer id is tracked independently so lean + throttle +
 * brake can all be held at once; a thumb may slide between the two zones of
 * its half without lifting.
 */
import type { InputFrame } from '../../core/types';
import { clearMeta, type InputSource, type MetaButtons } from './types';

type Zone = 'back' | 'fwd' | 'brake' | 'throttle' | 'restart' | 'pause' | 'none';

export class TouchInput implements InputSource {
  readonly device = 'touch' as const;
  readonly root: HTMLDivElement;
  private readonly zones = new Map<number, Zone>();
  private readonly meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false };
  private enabled = false;
  private readonly els: Record<Exclude<Zone, 'none'>, HTMLDivElement>;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    this.root.setAttribute('aria-hidden', 'true');
    const mk = (cls: string, label: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = `tz ${cls}`;
      d.innerHTML = `<span>${label}</span>`;
      this.root.appendChild(d);
      return d;
    };
    this.els = {
      back: mk('tz-back', '◀ LEAN'),
      fwd: mk('tz-fwd', 'LEAN ▶'),
      brake: mk('tz-brake', 'BRAKE'),
      throttle: mk('tz-throttle', 'GAS'),
      pause: mk('tz-pause tz-btn', '❚❚'),
      restart: mk('tz-restart tz-btn', '↻'),
    };
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
    this.root.addEventListener('lostpointercapture', this.onUp);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Only intercept pointers while a run is on screen (menus need their own clicks). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('on', on);
    if (!on) this.zones.clear();
  }

  /** Show the zone outlines (called when touch becomes the active device). */
  setVisible(on: boolean): void {
    this.root.classList.toggle('visible', on);
  }

  private zoneAt(x: number, y: number, current: Zone | undefined): Zone {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const r = this.els.restart.getBoundingClientRect();
    const p = this.els.pause.getBoundingClientRect();
    if (current === undefined) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'restart';
      if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return 'pause';
    } else if (current === 'restart' || current === 'pause') {
      return current; // buttons latch to the pointer that pressed them
    }
    if (y < 0 || y > h) return 'none';
    const fx = x / w;
    if (current === 'back' || current === 'fwd') return fx < 0.25 ? 'back' : 'fwd';
    if (current === 'brake' || current === 'throttle') return fx < 0.75 ? 'brake' : 'throttle';
    if (fx < 0.25) return 'back';
    if (fx < 0.5) return 'fwd';
    if (fx < 0.75) return 'brake';
    return 'throttle';
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.root.setPointerCapture?.(e.pointerId);
    const z = this.zoneAt(e.clientX, e.clientY, undefined);
    this.zones.set(e.pointerId, z);
    this.meta.active = true;
    if (z === 'pause') this.meta.pause = true;
    this.paint();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const cur = this.zones.get(e.pointerId);
    if (cur === undefined) return;
    e.preventDefault();
    const z = this.zoneAt(e.clientX, e.clientY, cur);
    if (z !== cur) {
      this.zones.set(e.pointerId, z);
      this.paint();
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.zones.has(e.pointerId)) return;
    this.zones.delete(e.pointerId);
    this.paint();
  };

  private has(z: Zone): boolean {
    for (const v of this.zones.values()) if (v === z) return true;
    return false;
  }

  private paint(): void {
    for (const k of Object.keys(this.els) as Array<Exclude<Zone, 'none'>>) {
      this.els[k].classList.toggle('held', this.has(k));
    }
  }

  read(out: InputFrame): void {
    out.throttle = this.has('throttle') ? 1 : 0;
    out.brake = this.has('brake') ? 1 : 0;
    out.lean = (this.has('fwd') ? 1 : 0) - (this.has('back') ? 1 : 0);
    out.hop = false;
    out.restart = this.has('restart');
  }

  pollMeta(): MetaButtons {
    const m = { ...this.meta };
    clearMeta(this.meta);
    return m;
  }

  dispose(): void {
    this.root.remove();
  }
}
