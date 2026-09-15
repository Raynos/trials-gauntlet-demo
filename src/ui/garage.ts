/**
 * Garage (MEGA_PLAN P4): choose the bike class. Two cards — Rookie / Pro — each with a
 * one-line character, a stat strip (power / grip / weight feel) and a rule note; the live 3D
 * bike behind the screen is the preview (the menu backdrop reloads with the chosen class via
 * `Game.setBike`, whose `loadTrack` repaints the hero through `renderer.setBikeClass` — render
 * round 11 liveries; a renderer without it leaves the card tint as the only colour difference).
 * Copy states the physics v2 R3 numbers (physics.md "v2 status — R3"). Selection persists
 * (`trials.bikeClass`); the per-tier default applies only until the player has picked once (rules.ts).
 */
import type { BikeClass, RiderOutfit } from '../core/types';
import type { ArtManifest } from './art';
import { escapeHtml } from './front';
import type { UiSfx } from './sfx';
import { conceal, isLiveTarget, reveal } from './live';
import { DEFAULT_RIDER_OUTFIT, OUTFIT_DETAIL, OUTFIT_LABEL, RIDER_OUTFITS } from './outfit';

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
  /** Confirmed clothing choice; cosmetic and independent of the bike class. */
  setOutfit(outfit: RiderOutfit): void;
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
  private readonly outfits = new Map<RiderOutfit, HTMLButtonElement>();
  private readonly outfitStatus: HTMLSpanElement;
  private readonly backButton: HTMLButtonElement;
  private readonly legend: HTMLDivElement;
  private focus: BikeClass = 'rookie';
  private current: BikeClass = 'rookie';
  private focusGroup: 'bike' | 'outfit' | 'back' = 'bike';
  private outfitFocus: RiderOutfit = DEFAULT_RIDER_OUTFIT;
  private currentOutfit: RiderOutfit = DEFAULT_RIDER_OUTFIT;

  constructor(
    parent: HTMLElement,
    private readonly sfx: UiSfx,
    art: ArtManifest,
    private readonly cb: GarageCallbacks,
  ) {
    this.root = h('div', 'screen garage-screen');
    this.root.inert = true;
    this.root.setAttribute('aria-hidden', 'true');
    // Art round 2: garage plate behind the card column (masked clear on the live-bike side), bike renders in the cards.
    const plate = h('div', 'plate-bg garage-plate');
    this.root.appendChild(plate);
    art.whenReady(() => art.applyBackground(plate, art.byId('garage-plate') ?? art.byId('results-garage')));
    const head = h('div', 'garage-head', `<h1><small>Garage</small>Customize your ride</h1><div class="garage-sub">Applies to every track · change it here any time</div><div class="garage-tip">${escapeHtml(BALANCE_HINT)}</div>`);
    const customize = h('div', 'garage-customize');
    const row = h('div', 'garage-cards');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Bike class');
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
        if (e.pointerType !== 'touch' && this.canAct(el)) this.setFocus(spec.id, true);
      });
      el.addEventListener('focus', () => {
        if (!this.visible) return;
        if (this.canAct(el)) this.setFocus(spec.id, false);
        else {
          // Tab may move while the screen is fading in. Remember its target, but wait for live
          // activation before changing a preview or committing anything.
          this.focusGroup = 'bike';
          this.focus = spec.id;
          this.paint();
        }
      });
      el.addEventListener('click', () => {
        if (!this.canAct(el)) return;
        this.setFocus(spec.id, false);
        this.confirm();
      });
      const artEl = el.querySelector<HTMLDivElement>('.bc-art')!;
      art.whenReady(() => art.applyBackground(artEl, art.bikeArt(spec.id)));
      row.appendChild(el);
      this.cards.set(spec.id, el);
    }
    const outfitPanel = h('div', 'garage-outfits');
    const outfitHeading = h('div', 'outfit-heading', '<strong>Rider outfit</strong>');
    this.outfitStatus = h('span', 'outfit-current');
    this.outfitStatus.setAttribute('role', 'status');
    outfitHeading.appendChild(this.outfitStatus);
    const outfitRow = h('div', 'outfit-options');
    outfitRow.setAttribute('role', 'group');
    outfitRow.setAttribute('aria-label', 'Rider outfit');
    for (const outfit of RIDER_OUTFITS) {
      const button = h('button', 'outfit-button', `<strong>${OUTFIT_LABEL[outfit]}</strong><span>${OUTFIT_DETAIL[outfit]}</span>`);
      button.type = 'button';
      button.dataset['outfit'] = outfit;
      button.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch' && this.canAct(button)) this.setOutfitFocus(outfit, true);
      });
      button.addEventListener('focus', () => { if (this.visible) this.setOutfitFocus(outfit, false); });
      button.addEventListener('click', () => {
        if (!this.canAct(button)) return;
        this.setOutfitFocus(outfit, false);
        this.confirm();
      });
      outfitRow.appendChild(button);
      this.outfits.set(outfit, button);
    }
    outfitPanel.append(outfitHeading, outfitRow);
    customize.append(row, outfitPanel);
    this.legend = h('div', 'legend');
    this.setDevice('keyboard');
    this.root.append(h('div', 'grain'), head, customize, this.legend);
    this.backButton = h('button', 'backbtn', '<span>‹</span>Menu');
    this.backButton.type = 'button';
    this.backButton.addEventListener('click', () => { if (this.canAct(this.backButton)) this.back(); });
    this.backButton.addEventListener('focus', () => {
      if (!this.visible) return;
      this.focusGroup = 'back';
      this.paint();
    });
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
    this.focusGroup = 'bike';
    this.paint();
    this.root.inert = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.classList.add('show');
    reveal(this.root);
  }

  hide(): void {
    conceal(this.root);
    this.root.inert = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.classList.remove('show');
  }

  setDevice(d: 'keyboard' | 'gamepad' | 'touch' | null): void {
    this.legend.innerHTML =
      d === 'gamepad'
        ? `<span><i class="pad">✚</i>Choose bike / outfit</span><span><i class="pad a">A</i>Select</span><span><i class="pad b">B</i>Back</span>`
        : d === 'touch'
          ? `<span>Tap a bike or outfit</span>`
          : `<span><kbd>↑↓</kbd>Section</span><span><kbd>←→</kbd>Option</span><span><kbd>Enter</kbd>Select</span><span><kbd>Esc</kbd>Back</span>`;
  }

  private canAct(target: HTMLElement = this.root): boolean {
    return this.visible && isLiveTarget(target);
  }

  /** Focus moves the preview too (the backdrop bike swaps class), so the player sees before they commit. */
  private setFocus(b: BikeClass, tick: boolean): void {
    const changed = b !== this.focus;
    const moved = changed || this.focusGroup !== 'bike';
    this.focusGroup = 'bike';
    this.focus = b;
    if (tick && moved) this.sfx.tick();
    if (changed) this.cb.previewBike(b);
    this.paint();
  }

  private setOutfitFocus(outfit: RiderOutfit, tick: boolean): void {
    const moved = this.outfitFocus !== outfit || this.focusGroup !== 'outfit';
    this.focusGroup = 'outfit';
    this.outfitFocus = outfit;
    if (tick && moved) this.sfx.tick();
    this.paint();
  }

  private paint(): void {
    for (const [id, el] of this.cards) {
      el.classList.toggle('on', this.focusGroup === 'bike' && id === this.focus);
      el.classList.toggle('selected', id === this.current);
      el.setAttribute('aria-pressed', String(id === this.current));
    }
    for (const [outfit, button] of this.outfits) {
      button.classList.toggle('on', this.focusGroup === 'outfit' && outfit === this.outfitFocus);
      button.classList.toggle('selected', outfit === this.currentOutfit);
      button.setAttribute('aria-pressed', String(outfit === this.currentOutfit));
    }
    const status = `${OUTFIT_LABEL[this.currentOutfit]} selected`;
    if (this.outfitStatus.textContent !== status) this.outfitStatus.textContent = status;
    this.backButton.classList.toggle('on', this.focusGroup === 'back');
  }

  nav(dx: number, dy: number): void {
    if (!this.canAct() || (!dx && !dy)) return;
    if (dy) {
      const groups = ['bike', 'outfit', 'back'] as const;
      const index = groups.indexOf(this.focusGroup);
      this.focusGroup = groups[(index + (dy > 0 ? 1 : 2)) % groups.length]!;
      this.sfx.tick();
      this.paint();
    } else if (this.focusGroup === 'bike') this.setFocus(this.focus === 'rookie' ? 'pro' : 'rookie', true);
    else if (this.focusGroup === 'outfit') this.setOutfitFocus(this.outfitFocus === 'street' ? 'race' : 'street', true);
    const target = this.focusGroup === 'bike' ? this.cards.get(this.focus) : this.focusGroup === 'outfit' ? this.outfits.get(this.outfitFocus) : this.backButton;
    target?.focus();
  }

  confirm(): void {
    if (!this.canAct()) return;
    if (this.focusGroup === 'back') return this.back();
    if (this.focusGroup === 'outfit') {
      this.currentOutfit = this.outfitFocus;
      this.cb.setOutfit(this.currentOutfit);
      this.sfx.confirm();
      this.paint();
      return;
    }
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
