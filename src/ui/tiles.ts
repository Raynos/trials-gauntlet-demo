/**
 * Action tile row (assets/design/pause/SPEC.md §3.4, §5): three equal tiles
 * centred on the viewport in the lower third, one amber (the focused one) at a
 * time. Shared by the pause overlay and the results frame. Pointer hover moves
 * focus, click picks; `move(±1)` wraps at the ends; `pick()` fires the focused
 * tile. Tiles are real `<button>`s so spatial navigation and screen readers see
 * them. Icons are inline SVG, 2 px stroke, `currentColor`.
 */
import type { UiSfx } from './sfx';

export type TileIcon = 'play' | 'restart' | 'door' | 'next' | 'grid' | 'map';

export interface TileDef {
  id: string;
  label: string;
  icon: TileIcon;
  disabled?: boolean;
}

const ICONS: Record<TileIcon, string> = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/>',
  door: '<path d="M4 4h9v16H4z"/><path d="M13 12h7"/><path d="M17 9l3 3-3 3"/><circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  next: '<path d="M4 5v14l8-7z" fill="currentColor" stroke="none"/><path d="M12 5v14l8-7z" fill="currentColor" stroke="none"/>',
  map: '<path d="M2.5 19.5l6.2-11 4.2 6.4 2.6-3.8 6 8.4z" fill="currentColor" stroke="none"/><path d="M8.7 8.5l1.6 2.5" stroke="none"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
};

export function tileIconSvg(icon: TileIcon): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
}

export class TileRow {
  readonly root: HTMLDivElement;
  private tiles: TileDef[] = [];
  private index = 0;
  onPick: ((id: string) => void) | null = null;

  constructor(parent: HTMLElement, private readonly sfx: UiSfx | null = null) {
    this.root = document.createElement('div');
    this.root.className = 'tiles';
    parent.appendChild(this.root);
    this.root.addEventListener('pointermove', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tile');
      if (b && !b.disabled) this.focus(Number(b.dataset['i']), true);
    });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tile');
      if (!b || b.disabled) return;
      this.focus(Number(b.dataset['i']), false);
      this.pick();
    });
  }

  setTiles(tiles: TileDef[]): void {
    this.tiles = tiles;
    this.root.innerHTML = '';
    tiles.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset['i'] = String(i);
      b.dataset['id'] = t.id;
      b.disabled = !!t.disabled;
      b.innerHTML = `${tileIconSvg(t.icon)}<span>${t.label}</span>`;
      this.root.appendChild(b);
    });
    if (this.tiles[this.index]?.disabled || !this.tiles[this.index]) this.index = Math.max(0, this.tiles.findIndex((t) => !t.disabled));
    this.render();
  }

  /** Relabel a tile (results: "Next track · Lean Back"); `sub` is a quieter second line (already escaped). */
  setLabel(id: string, label: string, sub?: string): void {
    const i = this.tiles.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.tiles[i]!.label = label;
    const b = this.root.children[i] as HTMLButtonElement | undefined;
    const span = b?.querySelector('span');
    if (span) span.innerHTML = `${label}${sub ? `<small>${sub}</small>` : ''}`;
  }

  setDisabled(id: string, disabled: boolean): void {
    const i = this.tiles.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.tiles[i]!.disabled = disabled;
    const b = this.root.children[i] as HTMLButtonElement | undefined;
    if (b) b.disabled = disabled;
    if (disabled && i === this.index) this.index = Math.max(0, this.tiles.findIndex((t) => !t.disabled));
    this.render();
  }

  current(): string | null {
    return this.tiles[this.index]?.id ?? null;
  }

  focusId(id: string): void {
    const i = this.tiles.findIndex((t) => t.id === id && !t.disabled);
    if (i >= 0) {
      this.index = i;
      this.render();
    }
  }

  focus(i: number, tick: boolean): void {
    if (i === this.index || !this.tiles[i] || this.tiles[i]!.disabled) return;
    this.index = i;
    if (tick) this.sfx?.tick();
    this.render();
  }

  /** Left / right with wrap; skips disabled tiles. */
  move(dx: number): void {
    if (!dx || this.tiles.length === 0) return;
    let i = this.index;
    for (let n = 0; n < this.tiles.length; n++) {
      i = (i + dx + this.tiles.length) % this.tiles.length;
      if (!this.tiles[i]!.disabled) break;
    }
    this.focus(i, true);
  }

  pick(): void {
    const t = this.tiles[this.index];
    if (!t || t.disabled) return;
    this.sfx?.confirm();
    this.onPick?.(t.id);
  }

  /** Pressed feedback on the focused tile (keyboard / pad confirm). */
  press(): void {
    const b = this.root.children[this.index] as HTMLElement | undefined;
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 140);
  }

  private render(): void {
    const kids = this.root.children;
    for (let i = 0; i < kids.length; i++) kids[i]!.classList.toggle('on', i === this.index);
  }
}
