/**
 * Garage (MEGA_PLAN P4): choose the bike class. Two cards — Rookie / Pro — each with a
 * one-line character, a stat strip (power / grip / weight feel) and a rule note; the live 3D
 * bike behind the screen is the preview (the menu backdrop reloads with the chosen class via
 * `Game.setBike`, and the renderer gets `setBikeClass` when it exports one; otherwise the
 * card tint is the only colour difference). Selection persists (`trials.bikeClass`); the
 * per-tier default applies only until the player has picked once (rules.ts).
 */
import type { BikeClass } from '../core/types';
import { escapeHtml } from './front';
import type { UiSfx } from './sfx';

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
    line: 'Soft and forgiving. The ECU catches your wheelies; the tyres catch your mistakes.',
    power: 0.55,
    grip: 0.82,
    weight: 0.72,
    weightFeel: 'Planted',
    note: 'Wheelie assist on · standard medal targets',
    tint: '#ffb020',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    line: 'Raw. No assist, real drag, a throttle that answers the instant you ask.',
    power: 0.92,
    grip: 0.58,
    weight: 0.42,
    weightFeel: 'Flickable',
    note: 'No assist · medal targets 10 % tighter',
    tint: '#5aa9ff',
  },
};

export const BIKE_LABEL: Record<BikeClass, string> = { rookie: 'Rookie', pro: 'Pro' };

export interface GarageCallbacks {
  /** Focus moved: swap the live preview (not persisted). */
  previewBike(b: BikeClass): void;
  /** Confirmed: persist. */
  setBike(b: BikeClass): void;
  back(): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function bar(label: string, v: number, text?: string): string {
  const n = Math.round(v * 100);
  return `<div class="stat"><span>${label}</span><i><b style="width:${n}%"></b></i><em>${text ? escapeHtml(text) : `${n}`}</em></div>`;
}

export class GarageScreen {
  readonly root: HTMLDivElement;
  private readonly cards = new Map<BikeClass, HTMLButtonElement>();
  private readonly legend: HTMLDivElement;
  private focus: BikeClass = 'rookie';
  private current: BikeClass = 'rookie';

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    private readonly cb: GarageCallbacks,
  ) {
    this.root = h('div', 'screen garage-screen');
    const head = h('div', 'garage-head', `<h1><small>Garage</small>Choose your bike</h1><div class="garage-sub">Applies to every track · change it here any time</div>`);
    const row = h('div', 'garage-cards');
    for (const spec of [BIKE_SPECS.rookie, BIKE_SPECS.pro]) {
      const el = h('button', 'bike-card');
      el.type = 'button';
      el.dataset['bike'] = spec.id;
      el.style.setProperty('--tint', spec.tint);
      el.innerHTML = `<div class="bc-top"><span class="bc-kicker">${spec.id === 'rookie' ? 'Class A' : 'Class P'}</span><span class="bc-sel">Selected</span></div>
        <div class="bc-name">${escapeHtml(spec.name)}</div>
        <div class="bc-line">${escapeHtml(spec.line)}</div>
        <div class="bc-stats">${bar('Power', spec.power)}${bar('Grip', spec.grip)}${bar('Weight', spec.weight, spec.weightFeel)}</div>
        <div class="bc-note">${escapeHtml(spec.note)}</div>`;
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') this.setFocus(spec.id, true);
      });
      el.addEventListener('click', () => {
        this.setFocus(spec.id, false);
        this.confirm();
      });
      row.appendChild(el);
      this.cards.set(spec.id, el);
    }
    this.legend = h('div', 'legend', `<span><kbd>←→</kbd>Bike</span><span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Back</span>`);
    this.root.append(h('div', 'grain'), head, row, this.legend);
    parent.appendChild(this.root);
    this.paint();
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  show(current: BikeClass): void {
    this.current = current;
    this.focus = current;
    this.paint();
    this.root.classList.add('show');
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    this.legend.innerHTML =
      d === 'gamepad'
        ? `<span><i class="pad">✚</i>Bike</span><span><i class="pad a">A</i>Select</span><span><i class="pad b">B</i>Back</span>`
        : d === 'touch'
          ? `<span>Tap a bike</span>`
          : `<span><kbd>←→</kbd>Bike</span><span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Back</span>`;
  }

  /** Focus moves the preview too (the backdrop bike swaps class), so the player sees before they commit. */
  private setFocus(b: BikeClass, tick: boolean): void {
    if (b === this.focus) return;
    this.focus = b;
    if (tick) this.sfx.tick();
    this.cb.previewBike(b);
    this.paint();
  }

  private paint(): void {
    for (const [id, el] of this.cards) {
      el.classList.toggle('on', id === this.focus);
      el.classList.toggle('selected', id === this.current);
    }
  }

  nav(dx: number, dy: number): void {
    const d = dx || dy;
    if (!d) return;
    this.setFocus(this.focus === 'rookie' ? 'pro' : 'rookie', true);
  }

  confirm(): void {
    this.current = this.focus;
    this.cb.setBike(this.focus);
    this.sfx.confirm();
    this.paint();
    const el = this.cards.get(this.focus);
    el?.animate([{ transform: 'scale(1.03)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1.03)' }], { duration: 240, easing: 'ease-out' });
  }

  back(): void {
    // Leaving restores the committed class if the player only browsed.
    if (this.focus !== this.current) this.cb.previewBike(this.current);
    this.sfx.back();
    this.cb.back();
  }
}
