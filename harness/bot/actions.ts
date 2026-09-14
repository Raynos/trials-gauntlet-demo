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
import type { InputFrame } from '../../src/core/types';

export const HOLD = 15;

export interface Macro {
  id: number;
  name: string;
  /** Stranger slot code. */
  code: string;
  frame: InputFrame;
  /** Ticks the frame is held; the remainder of HOLD is coast. */
  holdTicks: number;
}

const COAST_FRAME = quantizeInput({});

let nextId = 0;
function m(name: string, code: string, frame: Partial<InputFrame>, holdTicks = HOLD): Macro {
  return { id: nextId++, name, code, frame: quantizeInput(frame), holdTicks };
}

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
];

export const ACTION_BY_CODE: ReadonlyMap<string, Macro> = new Map(ACTIONS.map((a) => [a.code, a]));
export const ACTION_BY_NAME: ReadonlyMap<string, Macro> = new Map(ACTIONS.map((a) => [a.name, a]));

/** The HOLD frames one macro expands to. */
export function expandMacro(a: Macro): InputFrame[] {
  const out: InputFrame[] = [];
  for (let i = 0; i < HOLD; i++) out.push(i < a.holdTicks ? a.frame : COAST_FRAME);
  return out;
}

const EXPANDED: readonly (readonly InputFrame[])[] = ACTIONS.map(expandMacro);
export function framesOf(actionId: number): readonly InputFrame[] {
  const f = EXPANDED[actionId];
  if (!f) throw new Error(`unknown action id ${actionId}`);
  return f;
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
  if (out.length > maxSlots) throw new Error(`too many slots: ${out.length} > ${maxSlots}`);
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
