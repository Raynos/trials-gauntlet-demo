/**
 * Main menu (track select by tier with best times, quality, audio) and the
 * pause overlay. Plain DOM; every target ≥ 44 px; works with mouse, touch,
 * keyboard (Enter / Esc) and the gamepad meta buttons via `confirm()`/`back()`.
 */
import type { QualityTier, TrackDef, TrackTier } from '../core/types';
import type { BestEntry } from './best';
import { formatTime } from './format';

export type QualityChoice = QualityTier | 'auto';

export interface MenuCallbacks {
  play(trackId: string): void;
  setQuality(q: QualityChoice): void;
  setAudio(on: boolean): void;
}

export interface PauseCallbacks {
  resume(): void;
  restartTrack(): void;
  quit(): void;
}

const TIER_ORDER: TrackTier[] = ['beginner', 'easy', 'medium', 'hard', 'extreme'];

export class MainMenu {
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly qualitySeg: HTMLDivElement;
  private readonly audioBtn: HTMLButtonElement;
  private lastTrackId: string | null = null;
  private audioOn = true;

  constructor(
    parent: HTMLElement,
    private readonly cb: MenuCallbacks,
    private readonly bestOf: (trackId: string) => BestEntry | null,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <h1 class="title"><small>Physics trials</small>Gauntlet</h1>
      <p class="sub">Gas, brake, lean. The clock runs through every crash. Tap restart for the last checkpoint, hold it to restart the track.</p>
      <div class="list"></div>
      <div class="row">
        <span class="lbl">Quality</span>
        <div class="seg quality">
          <button data-q="auto">Auto</button><button data-q="low">Low</button><button data-q="medium">Medium</button><button data-q="high">High</button>
        </div>
        <button class="btn audio">Sound on</button>
      </div>`;
    this.list = panel.querySelector('.list') as HTMLDivElement;
    this.qualitySeg = panel.querySelector('.seg.quality') as HTMLDivElement;
    this.audioBtn = panel.querySelector('.btn.audio') as HTMLButtonElement;
    this.qualitySeg.addEventListener('click', (e) => {
      const q = (e.target as HTMLElement).closest('[data-q]')?.getAttribute('data-q') as QualityChoice | null;
      if (!q) return;
      this.setQuality(q);
      this.cb.setQuality(q);
    });
    this.audioBtn.addEventListener('click', () => {
      this.audioOn = !this.audioOn;
      this.audioBtn.textContent = this.audioOn ? 'Sound on' : 'Sound off';
      this.cb.setAudio(this.audioOn);
    });
    this.list.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest('[data-track]')?.getAttribute('data-track');
      if (id) this.cb.play(id);
    });
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  setTracks(tracks: TrackDef[], lastPlayed: string | null): void {
    this.lastTrackId = lastPlayed ?? tracks[0]?.id ?? null;
    const byTier = new Map<TrackTier, TrackDef[]>();
    // Authored tracks first; the harness test strips (`*-test`) last within their tier.
    const ordered = [...tracks].sort((a, b) => Number(a.id.endsWith('-test')) - Number(b.id.endsWith('-test')));
    for (const t of ordered) {
      const arr = byTier.get(t.tier) ?? [];
      arr.push(t);
      byTier.set(t.tier, arr);
    }
    let html = '';
    for (const tier of TIER_ORDER) {
      const arr = byTier.get(tier);
      if (!arr?.length) continue;
      html += `<div class="tier">${tier}</div><div class="tracks">`;
      for (const t of arr) {
        const best = this.bestOf(t.id);
        const bestHtml = best
          ? `<span>${formatTime(best.time)} · ${best.faults}✕</span><b class="${best.medal}">${best.medal}</b>`
          : `<span>—</span><b></b>`;
        const target = t.meta?.targetTimeS ? ` · target ${formatTime(t.meta.targetTimeS)}` : '';
        html += `<button class="track" data-track="${t.id}"><span class="name">${escape(t.name)}</span><span class="best">${bestHtml}</span><span class="best"><span>${escape(t.meta?.technique ?? '')}${target}</span></span></button>`;
      }
      html += '</div>';
    }
    this.list.innerHTML = html;
  }

  setQuality(q: QualityChoice): void {
    for (const b of this.qualitySeg.querySelectorAll('button')) b.classList.toggle('on', b.getAttribute('data-q') === q);
  }

  show(): void {
    this.root.classList.add('show');
    const focus = this.list.querySelector<HTMLButtonElement>(`[data-track="${this.lastTrackId ?? ''}"]`) ?? this.list.querySelector('button');
    focus?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  /** Gamepad A / Enter: play the focused (or last played) track. */
  confirm(): void {
    const focused = document.activeElement?.closest?.('[data-track]')?.getAttribute('data-track');
    const id = focused ?? this.lastTrackId;
    if (id) this.cb.play(id);
  }
}

export class PauseMenu {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, cb: PauseCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.innerHTML = `
      <div class="panel" style="width:min(24rem,100%)">
        <h2 class="pause-title">Paused</h2>
        <div class="row" style="flex-direction:column;align-items:stretch">
          <button class="btn primary" data-a="resume">Resume</button>
          <button class="btn" data-a="restart">Restart track</button>
          <button class="btn" data-a="quit">Quit to menu</button>
        </div>
      </div>`;
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'resume') cb.resume();
      else if (a === 'restart') cb.restartTrack();
      else if (a === 'quit') cb.quit();
    });
    parent.appendChild(this.root);
  }

  show(): void {
    this.root.classList.add('show');
    this.root.querySelector<HTMLButtonElement>('[data-a="resume"]')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.remove('show');
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }
}

/** Full-screen "rotate your phone" prompt; CSS decides when it shows. */
export function mountRotatePrompt(parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'rotate armed';
  d.innerHTML = '<i></i><div>Rotate to landscape</div>';
  parent.appendChild(d);
  return d;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
