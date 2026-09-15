/**
 * Macro-action vocabulary shared by the bot (search atoms) and the stranger
 * (slot codes). One quantized InputFrame held for HOLD ticks (125 ms at
 * 120 Hz; 8 decisions per second). Short actions are padded with coast so
 * the search tree is uniform: depth d = d * 125 ms.
 *
 * There is no hop button (CONTRACT §2.8): the hop is preload (lean back +
 * throttle) then snap forward, which the vocabulary expresses as
 * `gas-back` followed by `gas-fwd`.
 */
import { quantizeInput } from '../../src/core/replay';
import type { InputFrame, PhysicsState } from '../../src/core/types';

export const HOLD = 15;

/** Per-rollout scratch a closed-loop macro keeps between its ticks (fresh object per macro start). */
export interface MacroCtx {
  v0?: number;
  slopeDeg?: number;
}

/**
 * A closed-loop macro decides its frame per tick from the physics state the way the physics owner's
 * technique controllers do (`src/physics/controllers`); the recording still holds plain frames.
 */
export type MacroControl = (st: PhysicsState, tick: number, ctx: MacroCtx) => InputFrame;

export interface Macro {
  id: number;
  name: string;
  /** Stranger slot code. */
  code: string;
  frame: InputFrame;
  /** Ticks the frame is held; the remainder of HOLD is coast. */
  holdTicks: number;
  /** Length in 125 ms slots (1 for the 13 atoms; the round-8 technique macros span several). */
  slots: number;
  /** Closed-loop technique macro (round 8): the frame comes from `control`, not `frame`. */
  control?: MacroControl;
  /** Physical entry condition used by the search. Explicit stranger inputs remain unrestricted. */
  canStart?: (state: PhysicsState) => boolean;
  /** Fixed frame script for an open-loop multi-slot macro (length `slots * HOLD`). */
  script?: readonly InputFrame[];
}

const COAST_FRAME = quantizeInput({});
const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

let nextId = 0;
function m(name: string, code: string, frame: Partial<InputFrame>, holdTicks = HOLD): Macro {
  return { id: nextId++, name, code, frame: quantizeInput(frame), holdTicks, slots: 1 };
}
function script(name: string, code: string, slots: number, parts: [seconds: number, frame: Partial<InputFrame>][]): Macro {
  const total = slots * HOLD;
  const out: InputFrame[] = [];
  for (const [secs, f] of parts) {
    const q = quantizeInput(f);
    for (let i = 0; i < Math.round(secs * 120) && out.length < total; i++) out.push(q);
  }
  while (out.length < total) out.push(COAST_FRAME);
  return { id: nextId++, name, code, frame: out[0]!, holdTicks: total, slots, script: out };
}
function closed(name: string, code: string, slots: number, control: MacroControl, canStart?: Macro['canStart']): Macro {
  return { id: nextId++, name, code, frame: COAST_FRAME, holdTicks: slots * HOLD, slots, control, ...(canStart ? { canStart } : {}) };
}

/**
 * Wheelie hold with anticipation (physics `wheelieHoldV3`, R3): the lean is parked where the coasting balance
 * sits just above 40 deg (Rookie/Pro both ~-0.5), the throttle regulates the PREDICTED pitch
 * `pitch + rate * 0.25 s` (the Rookie throttle is a 0.15 s lag), the rear brake catches an over-rotation.
 * Speed is held at whatever the macro started with. Entry is not its job: `gas-back` lifts the front first.
 */
const wheelieHold: MacroControl = (st, tick, ctx) => {
  if (ctx.v0 === undefined) ctx.v0 = st.bike.vel.x;
  const pitch = st.bike.angle * DEG;
  const rate = st.bike.angVel * DEG;
  const err = 40 - (pitch + rate * 0.25);
  const throttle = clamp(0.12 + 0.035 * err - 0.004 * rate + 0.03 * (ctx.v0 - st.bike.vel.x), 0, 1);
  const brake = err < -3 ? clamp(-0.03 * (err + 3), 0, 1) : 0;
  void tick;
  return quantizeInput({ throttle, brake, lean: -0.5 });
};

/**
 * The Trials plank technique (physics r3.test.ts `plank`): neutral with base gas until the front wheel is ON the
 * face (a front-heavy bike cannot climb a 45 deg step), then THROW the weight to +1 and gas; the throttle is
 * chopped when the nose is 20-30 deg over the slope and the brake catches 40. The slope is read from the wheel
 * line the moment the front is on.
 */
const climbThrow: MacroControl = (st, tick, ctx) => {
  void tick;
  const f = st.wheels.front.pos;
  const r = st.wheels.rear.pos;
  if (ctx.slopeDeg === undefined) {
    if (f.y - r.y > 0.12) ctx.slopeDeg = Math.atan2(f.y - r.y, Math.max(0.2, f.x - r.x)) * DEG;
    else return quantizeInput({ throttle: 0.6, lean: 0 });
  }
  const rel = st.bike.angle * DEG - ctx.slopeDeg;
  return quantizeInput({ throttle: rel > 30 ? 0 : rel > 20 ? 0.4 : 1, lean: 1, brake: rel > 40 ? 1 : 0 });
};

export const ACTIONS: readonly Macro[] = [
  m('coast', 'c', { throttle: 0, brake: 0, lean: 0 }),
  m('gas', 'g', { throttle: 1, brake: 0, lean: 0 }),
  m('gas-back', 'gb', { throttle: 1, brake: 0, lean: -1 }), // wheelie launch / hop preload
  m('gas-fwd', 'gf', { throttle: 1, brake: 0, lean: 1 }), // climb, nose down / hop snap
  m('half-gas', 'hg', { throttle: 0.5, brake: 0, lean: 0 }),
  m('half-gas-back', 'hgb', { throttle: 0.5, brake: 0, lean: -0.5 }),
  m('half-gas-fwd', 'hgf', { throttle: 0.5, brake: 0, lean: 0.5 }),
  m('brake', 'b', { throttle: 0, brake: 1, lean: 0 }),
  m('brake-fwd', 'bf', { throttle: 0, brake: 1, lean: 1 }),
  m('brake-back', 'bb', { throttle: 0, brake: 1, lean: -1 }),
  m('lean-back', 'lb', { throttle: 0, brake: 0, lean: -1 }),
  m('lean-fwd', 'lf', { throttle: 0, brake: 0, lean: 1 }),
  m('tap-gas', 't', { throttle: 1, brake: 0, lean: 0 }, 4), // 33 ms blip, 11 ticks coast
  // Round 8 technique macros (physics v2 R2/R3): the moves the beam does not discover at 125 ms granularity.
  // hop = the reference bunny hop (0.3 s preload at lean -1 / throttle 0.3, 0.22 s snap to +1 at 0.5, 0.1 s tuck): 0.46 m rear apex.
  script('hop', 'h', 5, [
    [0.3, { throttle: 0.3, lean: -1 }],
    [0.22, { throttle: 0.5, lean: 1 }],
    [0.1, { throttle: 0.3, lean: -1 }],
  ]),
  closed('wheelie-hold', 'wh', 4, wheelieHold, (st) =>
    st.wheels.rear.grounded && !st.wheels.front.grounded && st.bike.angle > 0 && st.bike.vel.x > 0),
  closed('climb-throw', 'ct', 4, climbThrow), // base gas at neutral, throw when the front is on the face
];


export const ACTION_BY_CODE: ReadonlyMap<string, Macro> = new Map(ACTIONS.map((a) => [a.code, a]));
export const ACTION_BY_NAME: ReadonlyMap<string, Macro> = new Map(ACTIONS.map((a) => [a.name, a]));

/** The frames one OPEN-LOOP macro expands to (`slots * HOLD`; a closed-loop macro expands to coast — use `macroFrameAt`). */
export function expandMacro(a: Macro): InputFrame[] {
  if (a.script) return [...a.script];
  const out: InputFrame[] = [];
  for (let i = 0; i < a.slots * HOLD; i++) out.push(!a.control && i < a.holdTicks ? a.frame : COAST_FRAME);
  return out;
}

const EXPANDED: readonly (readonly InputFrame[])[] = ACTIONS.map(expandMacro);
export function framesOf(actionId: number): readonly InputFrame[] {
  const f = EXPANDED[actionId];
  if (!f) throw new Error(`unknown action id ${actionId}`);
  return f;
}

/** Ticks a macro occupies (`slots * HOLD`). */
export function macroTicks(actionId: number): number {
  const a = ACTIONS[actionId];
  if (!a) throw new Error(`unknown action id ${actionId}`);
  return a.slots * HOLD;
}

/**
 * The frame a macro plays at tick `i` of its rollout: the fixed script for open-loop macros, the controller's
 * decision from the current state for closed-loop ones. `ctx` is one fresh `{}` per macro start.
 */
export function macroFrameAt(actionId: number, i: number, state: () => PhysicsState, ctx: MacroCtx): InputFrame {
  const a = ACTIONS[actionId];
  if (!a) throw new Error(`unknown action id ${actionId}`);
  if (a.control) return a.control(state(), i, ctx);
  return EXPANDED[actionId]![i] ?? COAST_FRAME;
}

/** Slot count of an action id list (technique macros span several 125 ms slots). */
export function slotCount(ids: readonly number[]): number {
  let n = 0;
  for (const id of ids) n += ACTIONS[id]?.slots ?? 1;
  return n;
}

export const RESTART_FRAME: InputFrame = quantizeInput({ restart: true });
export const COAST: InputFrame = COAST_FRAME;

/**
 * Parse a stranger slot string like "g8 gb4 c2 gf1" into macro ids (one per
 * 125 ms slot). Throws on unknown codes; enforces `maxSlots`.
 */
export function parseSlots(text: string, maxSlots = 40): number[] {
  const out: number[] = [];
  for (const tok of text.trim().split(/[\s,]+/).filter(Boolean)) {
    const mm = /^([a-z]+)(\d*)$/i.exec(tok);
    if (!mm) throw new Error(`bad slot token '${tok}'`);
    const macro = ACTION_BY_CODE.get(mm[1]!.toLowerCase());
    if (!macro) throw new Error(`unknown slot code '${mm[1]}' (codes: ${ACTIONS.map((a) => a.code).join(' ')})`);
    const n = mm[2] ? Number(mm[2]) : 1;
    if (!Number.isInteger(n) || n < 1) throw new Error(`bad count in '${tok}'`);
    for (let i = 0; i < n; i++) out.push(macro.id);
  }
  if (out.length === 0) throw new Error('empty slot list');
  if (slotCount(out) > maxSlots) throw new Error(`too many slots: ${slotCount(out)} > ${maxSlots}`);
  return out;
}

/** Compact "g8 gb4" form of an action id list (for logs). */
export function formatActions(ids: readonly number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < ids.length) {
    let j = i;
    while (j < ids.length && ids[j] === ids[i]) j++;
    parts.push(`${ACTIONS[ids[i]!]!.code}${j - i}`);
    i = j;
  }
  return parts.join(' ');
}
