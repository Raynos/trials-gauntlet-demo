// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';
import { InputMux } from './mux';

describe('native interruption input reset', () => {
  it('forgets held keyboard throttle and queued pause/confirm edges', () => {
    const mux = new InputMux().add(new KeyboardInput());
    for (const code of ['ArrowUp', 'Escape', 'Enter']) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    mux.reset();
    const { frame, meta } = mux.poll();
    expect(frame.throttle).toBe(0);
    expect(frame.restart).toBe(false);
    expect(meta.pause).toBe(false);
    expect(meta.confirm).toBe(false);
    mux.dispose();
  });

  it('requires held controller buttons to be released before they can dismiss pause', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false }));
    const pad = { connected: true, mapping: 'standard', buttons, axes: [0, 0] } as unknown as Gamepad;
    const nav = { getGamepads: () => [pad] } as unknown as Navigator;
    const mux = new InputMux().add(new GamepadInput(nav));
    buttons[9]!.pressed = true;
    buttons[9]!.value = 1;
    mux.reset();
    expect(mux.poll().meta.pause).toBe(false);
    buttons[9]!.pressed = false;
    buttons[9]!.value = 0;
    expect(mux.poll().meta.pause).toBe(false);
    buttons[9]!.pressed = true;
    buttons[9]!.value = 1;
    expect(mux.poll().meta.pause).toBe(true);
    mux.dispose();
  });
});
