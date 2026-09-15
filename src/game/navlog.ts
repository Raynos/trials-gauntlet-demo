/**
 * Navigation instrument (docs/tasks/touch-navigation-invariant.md §1): every `quit` / pause /
 * resume / `goto` / restart the app performs is recorded with what triggered it — the DOM event and
 * its target when the call happens inside an event dispatch (`window.event`), else the polled meta
 * flag and the active device — plus the UI state it acted on, the ms since the screen appeared, the
 * last pointerdown, and whether the trigger's target was `.live` and drawn (`isLiveTarget`). A `false`
 * in `targetLive` is a navigation from a control the player could not see: the report's bug.
 *
 * Surfaces: the `?touchdebug=1` overlay (last lines), the run telemetry (`RunTelemetry.nav`), and
 * `window.__trials.navLog()` for the harness. A 200-entry ring; nothing leaves the device.
 */
import type { NavEvent } from '../core/types';
import { effectiveOpacity, isLiveTarget } from '../ui/live';

const RING = 200;

export interface NavContext {
  screen: string;
  phase: string;
  stage: number;
  screenAt: number;
}

/** `button.tile.on[menu]` — tag, first three classes, data-id. */
export function describeTarget(t: EventTarget | null): string {
  if (!(t instanceof Element)) return t === window ? 'window' : t === document ? 'document' : '(none)';
  const cls = typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
  const id = (t as HTMLElement).dataset?.['id'];
  return `${t.tagName.toLowerCase()}${cls}${id ? `[${id}]` : ''}`;
}

export class NavLog {
  private readonly entries: NavEvent[] = [];
  private down: { x: number; y: number; at: number; target: Element | null } | null = null;
  /** Called for every entry (debug overlay, telemetry). */
  onEntry: ((e: NavEvent) => void) | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'pointerdown',
        (e) => {
          this.down = { x: Math.round(e.clientX), y: Math.round(e.clientY), at: this.now(), target: e.target instanceof Element ? e.target : null };
        },
        { capture: true, passive: true },
      );
    }
  }

  /**
   * Record one navigation. `via` names a polled trigger (`poll:touch:pause`); when the call is inside a DOM
   * event dispatch the event + target are recorded instead, and the liveness is judged on that target
   * (for a polled trigger, on the last pointerdown's target — the finger that produced the meta flag).
   */
  record(kind: NavEvent['kind'], ctx: NavContext, via: string | null = null, to?: string): NavEvent {
    const ev = typeof window !== 'undefined' ? window.event : undefined;
    const domTarget = ev && ev.type !== 'keydown' && ev.type !== 'keyup' ? (ev.target instanceof Element ? ev.target : null) : null;
    const target = domTarget ?? (via && via.startsWith('poll:touch') ? (this.down?.target ?? null) : null);
    const now = this.now();
    const e: NavEvent = {
      at: Math.round(now),
      kind,
      ...(to ? { to } : {}),
      trigger: ev ? `${ev.type} ${describeTarget(ev.target)}${via ? ` (${via})` : ''}` : (via ?? 'direct'),
      screen: ctx.screen,
      phase: ctx.phase,
      stage: ctx.stage,
      sinceScreenMs: Math.round(now - ctx.screenAt),
      down: this.down ? { x: this.down.x, y: this.down.y, agoMs: Math.round(now - this.down.at), target: describeTarget(this.down.target) } : null,
      opacity: target ? Math.round(effectiveOpacity(target) * 100) / 100 : 1,
      // Keyboard / gamepad navigations have no target to be visible: they pass by construction.
      targetLive: target ? isLiveTarget(target) : !via || !via.startsWith('poll:touch'),
    };
    this.entries.push(e);
    if (this.entries.length > RING) this.entries.splice(0, this.entries.length - RING);
    this.onEntry?.(e);
    return e;
  }

  all(): NavEvent[] {
    return this.entries.slice();
  }

  /** Entries at or after `sinceMs` (a run's window). */
  since(sinceMs: number): NavEvent[] {
    return this.entries.filter((e) => e.at >= sinceMs);
  }

  /** One line per entry for the debug overlay. */
  static line(e: NavEvent): string {
    const d = e.down ? ` down ${e.down.x},${e.down.y} ${e.down.agoMs}ms ${e.down.target}` : '';
    return `${e.kind}${e.to ? `→${e.to}` : ''} ${e.trigger} @${e.screen}/${e.phase}${e.stage >= 0 ? `/s${e.stage}` : ''} +${e.sinceScreenMs}ms op${e.opacity} ${e.targetLive ? 'LIVE' : 'GHOST'}${d}`;
  }
}
