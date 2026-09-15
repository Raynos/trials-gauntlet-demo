/** Stranger controls evolve independently of the bot's historical search vocabulary. */
import type { InputFrame, PhysicsState } from '../../src/core/types';
import { quantizeInput } from '../../src/core/replay';
import { ACTIONS as BOT_ACTIONS, HOLD, macroFrameAt as botFrameAt, parseSlots as parseBotSlots, type MacroCtx } from '../bot/actions';
export { COAST, RESTART_FRAME, formatActions, type MacroCtx } from '../bot/actions';

const BACK = quantizeInput({ throttle: 1, lean: -1 });
const FORWARD = quantizeInput({ throttle: 1, lean: 1 });
const TUCK = quantizeInput({ throttle: 0, lean: -1 });
const NEUTRAL = quantizeInput({});
const HOP_SCRIPT = [
  ...Array<InputFrame>(36).fill(BACK),
  ...Array<InputFrame>(32).fill(FORWARD),
  ...Array<InputFrame>(12).fill(TUCK),
  ...Array<InputFrame>(10).fill(NEUTRAL),
] as const;

export const ACTIONS = BOT_ACTIONS.map(action => action.code === 'h'
  ? { ...action, slots: 6, holdTicks: HOP_SCRIPT.length, script: HOP_SCRIPT, frame: BACK }
  : action);

export function macroTicks(id: number): number {
  const action = ACTIONS[id];
  if (!action) throw new Error(`unknown action id ${id}`);
  return action.slots * HOLD;
}

export function macroFrameAt(id: number, tick: number, state: () => PhysicsState, context: MacroCtx): InputFrame {
  const action = ACTIONS[id];
  if (action?.code === 'h') return HOP_SCRIPT[tick] ?? NEUTRAL;
  return botFrameAt(id, tick, state, context);
}

export function parseSlots(text: string, maxSlots = 40): number[] {
  const ids = parseBotSlots(text, maxSlots);
  const count = ids.reduce((sum, id) => sum + ACTIONS[id]!.slots, 0);
  if (count > maxSlots) throw new Error(`too many slots: ${count} > ${maxSlots}`);
  return ids;
}
