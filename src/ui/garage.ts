/**
 * Garage (MEGA_PLAN P4): choose the bike class. Two cards — Rookie / Pro — each with a
 * one-line character, a stat strip (power / grip / weight feel) and a rule note; the live 3D
 * bike behind the screen is the preview (the menu backdrop reloads with the chosen class via
 * `Game.setBike`, whose `loadTrack` repaints the hero through `renderer.setBikeClass` — render
 * round 11 liveries; a renderer without it leaves the card tint as the only colour difference).
 * Copy states the physics v2 R3 numbers (physics.md "v2 status — R3"). Selection persists
 * (`trials.bikeClass`); the per-tier default applies only until the player has picked once (rules.ts).
 */
import type { BikeClass } from '../core/types';
import type { ArtManifest } from './art';
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
 * lean −1 / 0 / +1 → 24 / 50 / 69°; the Pro is within 3°). Garage footer + the first-run card; never
 * floated during play.
 */
export const BALANCE_HINT = 'Wheelie balance point: ~50° at neutral · lean back and it moves to 69°, forward to 24°';

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
    art: ArtManifest,
    private readonly cb: GarageCallbacks,
  ) {
    this.root = h('div', 'screen garage-screen');
    // Art round 2: garage plate behind the card column (masked clear on the live-bike side), bike renders in the cards.
    const plate = h('div', 'plate-bg garage-plate');
    this.root.appendChild(plate);
    art.whenReady(() => art.applyBackground(plate, art.byId('garage-plate') ?? art.byId('results-garage')));
    const head = h('div', 'garage-head', `<h1><small>Garage</small>Choose your bike</h1><div class="garage-sub">Applies to every track · change it here any time</div><div class="garage-tip">${escapeHtml(BALANCE_HINT)}</div>`);
    const row = h('div', 'garage-cards');
    for (const spec of [BIKE_SPECS.rookie, BIKE_SPECS.pro]) {
      const el = h('button', 'bike-card');
      el.type = 'button';
      el.dataset['bike'] = spec.id;
      el.style.setProperty('--tint', spec.tint);
      el.innerHTML = `<div class="bc-art"></div><div class="bc-top"><span class="bc-kicker">${spec.id === 'rookie' ? 'Class A' : 'Class P'}</span><span class="bc-sel">Selected</span></div>
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
      const artEl = el.querySelector<HTMLDivElement>('.bc-art')!;
      art.whenReady(() => art.applyBackground(artEl, art.bikeArt(spec.id)));
      row.appendChild(el);
      this.cards.set(spec.id, el);
    }
    this.legend = h('div', 'legend', `<span><kbd>←→</kbd>Bike</span><span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Back</span>`);
    this.root.append(h('div', 'grain'), head, row, this.legend);
    const backBtn = h('button', 'backbtn', '<span>‹</span>Menu');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this.back());
    this.root.appendChild(backBtn);
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
