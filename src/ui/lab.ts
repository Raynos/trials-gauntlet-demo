/**
 * Physics lab HUD (MEGA_PLAN P0 §3; docs/design/physics-v2.md §15): on `lab-*` tracks (and `?lab=1`) a
 * compact monospace panel bottom-left. Numbers: pitch°, pitch rate °/s, speed m/s, rear slip m/s, rider
 * COM offset (`RiderPose.lean` / crouch), hop phase, airtime, attempt counter. Gauges (canvas): rear /
 * front compression bars with the bump-stop zone marked; τ_att (declared attitude torque) signed bar;
 * throttle / brake bars; the balance bar `d/h` vs `a/g` (the front lifts when d/h crosses a/g); a side
 * schematic with the combined-COM dot and pose-target (hollow) vs body (filled) markers; a 3 s scrolling
 * trace of pitch and both compressions. Last-hop stats (preload %, snap ms, rear apex, airtime, landed
 * pitch) hold for 3 s after each landing.
 *
 * Samples arrive per physics tick (`Game.tickTap`, 120 Hz) into fixed rings; the trace is decimated ×2.
 * Everything is read from `PhysicsState` and — defensively, field by field — from the world's `debug()`
 * (`attTorque`, `poseTarget`, `comDH`, `lastHop`, `suspension.*.compression`, R3: `rider.intent`,
 * `rider.legLen` / `rider.legFrac`) which physics v2 exposes before the fields land in `types.ts`; a
 * missing field leaves its gauge grey, never throws.
 */
import type { PhysicsState } from '../core/types';

export interface LabSample {
  pitchDeg: number;
  pitchRateDps: number;
  speed: number;
  rearComp: number;
  frontComp: number;
  lean: number;
  crouch: number;
  hopPhase: PhysicsState['hopPhase'];
  airTimeS: number;
  attempt: number;
  runTick: number;
  rearSlip: number;
  throttle: number;
  brake: number;
}

/** Loose view of physics `debug()` (v1 has suspension + rider; v2 adds the lab fields). */
interface DebugLike {
  attTorque?: number;
  attTorqueMax?: number;
  poseTarget?: { pos?: { x: number; y: number }; x?: number; y?: number; angle?: number } | number;
  comDH?: { d?: number; h?: number; ag?: number; ratio?: number } | number;
  ag?: number;
  lastHop?: { preload?: number; snapMs?: number; apex?: number; airtime?: number; landedPitchDeg?: number; landedPitch?: number; at?: number };
  suspension?: { rear?: { compression?: number; stopStart?: number }; front?: { compression?: number; stopStart?: number } };
  rider?: {
    body?: { pos?: { x: number; y: number }; angle?: number };
    anchor?: { x: number; y: number };
    offset?: { x: number; y: number };
    /** R3: the intent memory 0..1 — 1 while the pose target itself is moving (a hop's snap), 0 while a pose is held (a landing). Gates the servo's concentric cap: `hill + (1 − hill) · intent`. */
    intent?: number;
    /** R2: hips → pegs distance (m) and the force-length fraction of F_max it allows. */
    legLen?: number;
    legFrac?: number;
  };
}

export interface LabHop {
  preloadPct: number;
  snapMs: number;
  apexM: number;
  airtimeS: number;
  landedPitchDeg: number;
  /** Run tick the landing happened (held 3 s from there). */
  landedTick: number;
}

const TRACE_S = 3;
const DECIMATE = 2;
const RAD = 180 / Math.PI;
const COLS = 180;
const HOLD_S = 3;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class LabPanel {
  readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly hopEl: HTMLPreElement;
  private readonly gauges: HTMLCanvasElement;
  private readonly gctx: CanvasRenderingContext2D | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pitch: Float32Array;
  private readonly rear: Float32Array;
  private readonly front: Float32Array;
  private readonly n: number;
  private head = 0;
  private filled = 0;
  private airTicks = 0;
  private lastTextAt = 0;
  private lastDrawAt = 0;
  private last: LabSample | null = null;
  private dbg: DebugLike | null = null;
  private lastState: PhysicsState | null = null;
  private dirty = false;
  /** Bump-stop zone start as a fraction of travel (physics tuning `stopStart`, default 0.8). */
  stopStart = { rear: 0.8, front: 0.8 };
  private attMax = 300;
  // Last-hop bookkeeping from the tick stream (used when debug() has no `lastHop`).
  private hop: LabHop | null = null;
  private preloadPeak = 0;
  private pushTicks = 0;
  private wasAir = false;
  private takeoffRearY = 0;
  private apex = 0;
  private prevPhase: PhysicsState['hopPhase'] = 'idle';

  constructor(
    parent: HTMLElement,
    private readonly physicsHz: number,
  ) {
    this.n = Math.round(TRACE_S * physicsHz);
    this.pitch = new Float32Array(this.n);
    this.rear = new Float32Array(this.n);
    this.front = new Float32Array(this.n);
    this.root = document.createElement('div');
    this.root.className = 'labhud'; // not `.lab`: that is the settings-row label class
    this.root.hidden = true;
    this.text = document.createElement('pre');
    this.text.className = 'lab-text';
    this.gauges = document.createElement('canvas');
    this.gauges.className = 'lab-gauges';
    this.gauges.width = COLS * 2;
    this.gauges.height = 186;
    this.gctx = this.gauges.getContext('2d');
    this.hopEl = document.createElement('pre');
    this.hopEl.className = 'lab-text lab-hop';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lab-trace';
    this.canvas.width = COLS * 2;
    this.canvas.height = 112;
    this.ctx = this.canvas.getContext('2d');
    this.root.append(this.text, this.gauges, this.hopEl, this.canvas);
    parent.appendChild(this.root);
  }

  /** One physics tick (`Game.tickTap`). `debug` is the world's `debug()` result when it has one (read lazily by the caller). */
  sample(s: PhysicsState, runTick: number, attempt: number, debug?: unknown): void {
    const airborne = !s.wheels.rear.grounded && !s.wheels.front.grounded;
    this.airTicks = airborne ? this.airTicks + 1 : 0;
    const i = this.head;
    this.pitch[i] = s.bike.angle * RAD;
    this.rear[i] = s.wheels.rear.compression;
    this.front[i] = s.wheels.front.compression;
    this.head = (i + 1) % this.n;
    if (this.filled < this.n) this.filled++;
    const l =
      this.last ??
      (this.last = { pitchDeg: 0, pitchRateDps: 0, speed: 0, rearComp: 0, frontComp: 0, lean: 0, crouch: 0, hopPhase: 'idle', airTimeS: 0, attempt: 1, runTick: 0, rearSlip: 0, throttle: 0, brake: 0 });
    l.pitchDeg = s.bike.angle * RAD;
    l.pitchRateDps = s.bike.angVel * RAD;
    l.speed = Math.hypot(s.bike.vel.x, s.bike.vel.y);
    l.rearComp = s.wheels.rear.compression;
    l.frontComp = s.wheels.front.compression;
    l.lean = s.rider.lean;
    l.crouch = s.rider.crouch;
    l.hopPhase = s.hopPhase;
    l.airTimeS = this.airTicks / this.physicsHz;
    l.attempt = attempt;
    l.runTick = runTick;
    l.rearSlip = s.rearSlip;
    l.throttle = s.input.throttle;
    l.brake = s.input.brake;
    this.dbg = debug && typeof debug === 'object' ? (debug as DebugLike) : null;
    this.lastState = s;
    this.trackHop(s, runTick, airborne);
    this.dirty = true;
  }

  /** Last-hop stats from the tick stream: preload depth (peak rear compression while `preload`), snap (ticks in `push`), rear apex above take-off, airtime, pitch at touchdown. */
  private trackHop(s: PhysicsState, runTick: number, airborne: boolean): void {
    const ph = s.hopPhase;
    if (ph === 'preload') {
      if (this.prevPhase !== 'preload') this.preloadPeak = 0;
      this.preloadPeak = Math.max(this.preloadPeak, s.wheels.rear.compression);
    }
    if (ph === 'push') this.pushTicks = this.prevPhase === 'push' ? this.pushTicks + 1 : 1;
    if (airborne && !this.wasAir) {
      this.takeoffRearY = s.wheels.rear.pos.y;
      this.apex = 0;
    }
    if (airborne) this.apex = Math.max(this.apex, s.wheels.rear.pos.y - this.takeoffRearY);
    if (!airborne && this.wasAir && this.airTicks === 0) {
      // Landed (either wheel down). airTicks was reset this tick, so the flight length is the previous run.
      this.hop = { preloadPct: this.preloadPeak * 100, snapMs: (this.pushTicks / this.physicsHz) * 1000, apexM: this.apex, airtimeS: this.lastAirTicks / this.physicsHz, landedPitchDeg: s.bike.angle * RAD, landedTick: runTick };
    }
    if (airborne) this.lastAirTicks = this.airTicks;
    this.wasAir = airborne;
    this.prevPhase = ph;
  }
  private lastAirTicks = 0;

  /** Per rendered frame with the wall clock; text at 10 Hz, canvases at ≤ 30 Hz, nothing when idle. */
  update(now: number): void {
    if (this.root.hidden || !this.last) return;
    if (now - this.lastTextAt >= 100) {
      this.lastTextAt = now;
      this.paintText(this.last);
    }
    if (this.dirty && now - this.lastDrawAt >= 33) {
      this.lastDrawAt = now;
      this.dirty = false;
      this.drawGauges(this.last);
      this.drawTrace();
    }
  }

  private paintText(l: LabSample): void {
    const sgn = (v: number, d: number): string => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
    this.text.textContent = [
      `PITCH ${sgn(l.pitchDeg, 1).padStart(7)}°   RATE ${sgn(l.pitchRateDps, 0).padStart(6)}°/s`,
      `SPEED ${l.speed.toFixed(2).padStart(6)} m/s  SLIP ${sgn(l.rearSlip, 2).padStart(6)} m/s`,
      `COMP  R ${(l.rearComp * 100).toFixed(0).padStart(3)}%  F ${(l.frontComp * 100).toFixed(0).padStart(3)}%   AIR ${l.airTimeS.toFixed(2).padStart(5)} s`,
      `COM   lean ${sgn(l.lean, 2).padStart(5)}  crouch ${l.crouch.toFixed(2)}`,
      `HOP   ${l.hopPhase.padEnd(8)} ATTEMPT ${l.attempt}   t ${(l.runTick / this.physicsHz).toFixed(2)}`,
    ].join('\n');
    // Last hop: physics' own record when it exposes one, else the tick-stream one; held 3 s after landing.
    const d = this.dbg?.lastHop;
    let line = '';
    if (d && (num(d.airtime) !== null || num(d.apex) !== null)) {
      const at = num(d.at);
      if (at === null || (l.runTick - at) / this.physicsHz <= HOLD_S)
        line = `LAST HOP  preload ${fmt(num(d.preload), 0, '%', 100)}  snap ${fmt(num(d.snapMs), 0, ' ms')}  apex ${fmt(num(d.apex), 2, ' m')}  air ${fmt(num(d.airtime), 2, ' s')}  land ${fmt(num(d.landedPitchDeg) ?? num(d.landedPitch), 1, '°')}`;
    } else if (this.hop && (l.runTick - this.hop.landedTick) / this.physicsHz <= HOLD_S) {
      const h = this.hop;
      line = `LAST HOP  preload ${h.preloadPct.toFixed(0)}%  snap ${h.snapMs.toFixed(0)} ms  apex ${h.apexM.toFixed(2)} m  air ${h.airtimeS.toFixed(2)} s  land ${h.landedPitchDeg.toFixed(1)}°`;
    }
    this.hopEl.textContent = line;
    this.hopEl.hidden = line === '';
  }

  private drawGauges(l: LabSample): void {
    const s0 = this.lastState;
    const c = this.gctx;
    if (!c) return;
    const W = this.gauges.width;
    const H = this.gauges.height;
    c.clearRect(0, 0, W, H);
    c.font = '11px ui-monospace, Menlo, monospace';
    const d = this.dbg;
    const barX = 58;
    const barW = 150;
    const row = (y: number, label: string, frac: number | null, color: string, opts: { signed?: boolean; mark?: number | null; text?: string } = {}): void => {
      c.fillStyle = 'rgba(255,255,255,.6)';
      c.fillText(label, 4, y + 10);
      c.fillStyle = 'rgba(255,255,255,.08)';
      c.fillRect(barX, y, barW, 12);
      if (opts.mark !== null && opts.mark !== undefined) {
        // Bump-stop zone: the last (1 − stopStart) of travel, hatched red.
        c.fillStyle = 'rgba(255,80,60,.28)';
        c.fillRect(barX + barW * opts.mark, y, barW * (1 - opts.mark), 12);
      }
      if (frac === null) {
        c.fillStyle = 'rgba(255,255,255,.35)';
        c.fillText('—', barX + barW + 6, y + 10);
        return;
      }
      c.fillStyle = color;
      if (opts.signed) {
        const f = Math.max(-1, Math.min(1, frac));
        const mid = barX + barW / 2;
        c.fillRect(f < 0 ? mid + f * (barW / 2) : mid, y, Math.abs(f) * (barW / 2), 12);
        c.fillStyle = 'rgba(255,255,255,.7)';
        c.fillRect(mid - 0.5, y - 2, 1, 16);
      } else c.fillRect(barX, y, barW * Math.max(0, Math.min(1, frac)), 12);
      c.fillStyle = 'rgba(255,255,255,.8)';
      c.fillText(opts.text ?? `${(frac * 100).toFixed(0)}%`, barX + barW + 6, y + 10);
    };
    row(4, 'REAR', l.rearComp, '#7fd1ff', { mark: this.stopStart.rear });
    row(22, 'FRONT', l.frontComp, '#b8ff7f', { mark: this.stopStart.front });
    const att = num(d?.attTorque);
    if (att !== null) this.attMax = Math.max(this.attMax, num(d?.attTorqueMax) ?? Math.abs(att));
    row(40, 'τ ATT', att === null ? null : att / this.attMax, '#ffb347', { signed: true, text: att === null ? '' : `${att >= 0 ? '+' : '−'}${Math.abs(att).toFixed(0)} N·m` });
    row(58, 'GAS', l.throttle, '#f5a623');
    row(76, 'BRAKE', l.brake, '#ff5b4a');
    // R3 servo gauges. INTENT: 1 = the rider is moving his pose (full F_max both ways), 0 = holding one (a landing
    // absorbs at 0.3 F_max). LEG: hips → pegs length with the force-length fraction it allows (the bar).
    const intent = num(d?.rider?.intent);
    row(112, 'INTENT', intent, intent !== null && intent > 0.5 ? '#ff8fd6' : '#c79bff', { text: intent === null ? '' : intent.toFixed(2) });
    const legFrac = num(d?.rider?.legFrac);
    const legLen = num(d?.rider?.legLen);
    row(130, 'LEG', legFrac, '#7fffd4', { text: legFrac === null ? '' : `${legLen === null ? '' : `${legLen.toFixed(2)} m · `}${(legFrac * 100).toFixed(0)}%` });
    // Balance bar: d/h (COM ahead of the rear contact over COM height) vs a/g (the front lifts when a/g crosses d/h).
    const com = d?.comDH;
    let dh: number | null = null;
    let ag: number | null = num(d?.ag);
    if (typeof com === 'number') dh = com;
    else if (com) {
      const dd = num(com.d);
      const hh = num(com.h);
      dh = num(com.ratio) ?? (dd !== null && hh !== null && hh > 0 ? dd / hh : null);
      ag ??= num(com.ag);
    }
    const y = 94;
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.fillText('d/h·a/g', 4, y + 10);
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.fillRect(barX, y, barW, 12);
    const scale = 2; // bar spans 0 … 2
    if (dh !== null) {
      c.fillStyle = ag !== null && ag > dh ? '#ff5b4a' : '#b8ff7f';
      c.fillRect(barX, y, barW * Math.min(1, dh / scale), 12);
    }
    if (ag !== null) {
      c.fillStyle = '#fff';
      c.fillRect(barX + barW * Math.min(1, Math.max(0, ag / scale)) - 1, y - 2, 2, 16);
    }
    c.fillStyle = 'rgba(255,255,255,.8)';
    c.fillText(dh === null ? '—' : `${dh.toFixed(2)}${ag !== null ? ` · ${ag.toFixed(2)}` : ''}`, barX + barW + 6, y + 10);
    // Side schematic: axles, COM dot (from d/h or the rider lean), pose target (hollow) vs body (filled).
    const sx0 = barX;
    const sx1 = barX + barW;
    const gy = H - 8;
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(sx0, gy + 0.5);
    c.lineTo(sx1, gy + 0.5);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath();
    c.arc(sx0 + 14, gy - 7, 7, 0, Math.PI * 2);
    c.arc(sx1 - 14, gy - 7, 7, 0, Math.PI * 2);
    c.stroke();
    c.fillText('COM · pose', 4, gy - 2);
    // COM x along the wheelbase: d/h × h ≈ fraction of wheelbase (1.3 m) when physics gives d; else lean maps −1..1 → 0.3..0.7.
    const wb = sx1 - 14 - (sx0 + 14);
    let comF = 0.5 + 0.2 * l.lean;
    if (com && typeof com === 'object' && num(com.d) !== null) comF = Math.max(0, Math.min(1, num(com.d)! / 1.3));
    const comX = sx0 + 14 + wb * comF;
    const comY = gy - 34 + 8 * l.crouch;
    c.fillStyle = '#ffb347';
    c.beginPath();
    c.arc(comX, comY, 4, 0, Math.PI * 2);
    c.fill();
    const pt = d?.poseTarget;
    const body = s0?.riderBody?.pos ?? d?.rider?.body?.pos;
    const anchor = d?.rider?.anchor;
    if (pt !== undefined || body) {
      // Markers relative to the rider anchor when physics gives world positions; ±0.5 m → ± wb/2.6.
      const toX = (wx: number | null): number | null => (wx === null || !anchor ? null : comX + ((wx - anchor.x) / 0.5) * (wb / 2.6));
      const tx = typeof pt === 'number' ? comX + pt * (wb / 2.6) : toX(num(pt?.pos?.x) ?? num(pt?.x));
      const bx = toX(num(body?.x));
      if (tx !== null) {
        c.strokeStyle = '#fff';
        c.beginPath();
        c.arc(tx, comY - 12, 4, 0, Math.PI * 2);
        c.stroke();
      }
      if (bx !== null) {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(bx, comY - 12, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  private drawTrace(): void {
    const c = this.ctx;
    if (!c) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    // Grid: pitch −90…+90 on the upper 60 %, compression 0…1 on the lower 40 %.
    const pH = Math.round(H * 0.6);
    const cTop = pH + 6;
    const cH = H - cTop - 2;
    c.strokeStyle = 'rgba(255,255,255,.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, pH / 2 + 0.5);
    c.lineTo(W, pH / 2 + 0.5);
    c.moveTo(0, pH + 0.5);
    c.lineTo(W, pH + 0.5);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.06)';
    c.beginPath();
    for (let s = 1; s < TRACE_S; s++) {
      const x = Math.round((W * s) / TRACE_S) + 0.5;
      c.moveTo(x, 0);
      c.lineTo(x, H);
    }
    for (const a of [-45, 45]) {
      const y = Math.round(pH / 2 - (a / 90) * (pH / 2)) + 0.5;
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    // Bump-stop zone on the compression band.
    c.fillStyle = 'rgba(255,80,60,.12)';
    c.fillRect(0, cTop, W, cH * (1 - this.stopStart.rear));
    const step = (W * DECIMATE) / this.n;
    const oldest = this.head - this.filled;
    const line = (buf: Float32Array, color: string, map: (v: number) => number): void => {
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.beginPath();
      // Newest sample at the right edge; one column per DECIMATE ticks back from there.
      for (let j = this.filled - 1, k = 0; j >= 0; j -= DECIMATE, k++) {
        const idx = (((oldest + j) % this.n) + this.n) % this.n;
        const x = W - k * step;
        const y = map(buf[idx]!);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    };
    line(this.pitch, '#ffb347', (v) => pH / 2 - (Math.max(-90, Math.min(90, v)) / 90) * (pH / 2));
    line(this.rear, '#7fd1ff', (v) => cTop + cH - v * cH);
    line(this.front, '#b8ff7f', (v) => cTop + cH - v * cH);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '11px ui-monospace, Menlo, monospace';
    c.fillText('pitch ±90°', 4, 11);
    c.fillStyle = '#7fd1ff';
    c.fillText('rear', 4, cTop + 11);
    c.fillStyle = '#b8ff7f';
    c.fillText('front', 40, cTop + 11);
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillText('3 s', W - 24, H - 4);
  }
}

function fmt(v: number | null, digits: number, unit: string, scale = 1): string {
  return v === null ? '—' : `${(v * scale).toFixed(digits)}${unit}`;
}
