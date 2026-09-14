/**
 * UI contract: HUD (timer, faults, checkpoint), restart prompt, track select.
 * The scaffold ships a minimal DOM HUD so the harness clips show run state.
 */
import type { GameEvent, PhysicsState } from '../core/types';

export interface Hud {
  update(state: PhysicsState): void;
  onEvent(event: GameEvent): void;
  setTrackName(name: string): void;
  dispose(): void;
}

export function formatTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

export class DomHud implements Hud {
  private readonly root: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private faults = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#e8ecf1',
      textShadow: '0 1px 2px rgba(0,0,0,.8)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.timer = document.createElement('div');
    Object.assign(this.timer.style, {
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '28px',
      fontWeight: '600',
      letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      position: 'absolute',
      top: '52px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '14px',
      opacity: '0.85',
    } satisfies Partial<CSSStyleDeclaration>);
    this.track = document.createElement('div');
    Object.assign(this.track.style, {
      position: 'absolute',
      top: '16px',
      left: '16px',
      fontSize: '13px',
      opacity: '0.7',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.append(this.timer, this.status, this.track);
    parent.appendChild(this.root);
  }

  update(state: PhysicsState): void {
    this.timer.textContent = formatTime(state.finishTime ?? state.time);
    const cp = state.checkpoint >= 0 ? `CP ${state.checkpoint + 1}` : 'START';
    const outcome = state.finished ? (state.faulted ? `FAULT: ${state.faulted}` : 'FINISH') : 'RUNNING';
    this.status.textContent = `${outcome}  ·  ${cp}  ·  faults ${this.faults}  ·  tick ${state.tick}`;
  }

  onEvent(event: GameEvent): void {
    if (event.type === 'fault') this.faults++;
    if (event.type === 'restart' && event.checkpoint < 0) this.faults = 0;
  }

  setTrackName(name: string): void {
    this.track.textContent = name;
  }

  dispose(): void {
    this.root.remove();
  }
}
