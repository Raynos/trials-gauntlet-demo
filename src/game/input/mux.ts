/**
 * One InputMux reads every device each rendered frame and produces the single
 * quantized InputFrame the game ticks with. Throttle/brake = max over devices,
 * lean = clamped sum, restart = OR. The last device with a non-neutral frame
 * is the active device (HUD indicator, hint glyph set).
 */
import { NEUTRAL_INPUT, type InputDevice, type InputFrame } from '../../core/types';
import { quantizeInput } from '../../core/replay';
import type { InputSource, MetaButtons } from './types';

export class InputMux {
  private readonly sources: InputSource[] = [];
  private readonly scratch: InputFrame = { ...NEUTRAL_INPUT };
  private readonly merged: InputFrame = { ...NEUTRAL_INPUT };
  private active: InputDevice | null = null;
  private activeChangedAt = 0;
  private frameIndex = 0;
  /** Called when the active device changes. */
  onDeviceChange: ((device: InputDevice) => void) | null = null;

  add(source: InputSource): this {
    this.sources.push(source);
    return this;
  }

  activeDevice(): InputDevice | null {
    return this.active;
  }

  /** Frames since the active device last produced input (for fading the indicator). */
  idleFrames(): number {
    return this.frameIndex - this.activeChangedAt;
  }

  /** Poll all devices; returns the quantized frame plus merged meta buttons. */
  poll(): { frame: InputFrame; meta: MetaButtons } {
    const m = this.merged;
    m.throttle = m.brake = m.lean = 0;
    m.hop = false;
    m.restart = false;
    const meta: MetaButtons = { pause: false, confirm: false, back: false, navX: 0, navY: 0, active: false, alt: false };
    this.frameIndex++;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i]!;
      const f = this.scratch;
      s.read(f);
      const sm = s.pollMeta();
      const busy = f.throttle > 0 || f.brake > 0 || f.lean !== 0 || f.restart === true || sm.active;
      if (busy) {
        this.activeChangedAt = this.frameIndex;
        if (this.active !== s.device) {
          this.active = s.device;
          this.onDeviceChange?.(s.device);
        }
      }
      if (f.throttle > m.throttle) m.throttle = f.throttle;
      if (f.brake > m.brake) m.brake = f.brake;
      m.lean += f.lean;
      if (f.restart) m.restart = true;
      meta.pause ||= sm.pause;
      meta.confirm ||= sm.confirm;
      meta.back ||= sm.back;
      meta.active ||= sm.active;
      if (sm.alt) meta.alt = true;
      if (sm.navX) meta.navX = sm.navX;
      if (sm.navY) meta.navY = sm.navY;
    }
    if (m.lean > 1) m.lean = 1;
    else if (m.lean < -1) m.lean = -1;
    return { frame: quantizeInput(m), meta };
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
    this.sources.length = 0;
  }
}
