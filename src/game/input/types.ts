import type { InputDevice, InputFrame } from '../../core/types';

/** A live input source polled once per rendered frame. */
export interface InputSource {
  readonly device: InputDevice;
  /** Current raw (unquantized) frame; must be cheap and allocation-free. */
  read(out: InputFrame): void;
  /** Menu / meta buttons pressed since the last poll (edge-triggered). */
  pollMeta(): MetaButtons;
  dispose(): void;
}

export interface MetaButtons {
  pause: boolean;
  confirm: boolean;
  back: boolean;
  /** Any activity at all this frame (for device indicator + audio unlock). */
  active: boolean;
}

export const NO_META: Readonly<MetaButtons> = Object.freeze({ pause: false, confirm: false, back: false, active: false });

export function clearMeta(m: MetaButtons): void {
  m.pause = m.confirm = m.back = m.active = false;
}
