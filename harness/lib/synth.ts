/**
 * Synthetic input generators shared by gen-input and perf.
 */
import { InputRecorder, quantizeInput, type InputRecording } from '../../src/core/replay';
import { Rng } from '../../src/core/rng';

export type SynthStyle = 'throttle' | 'wiggle';

export interface SynthOptions {
  trackId: string;
  seed: number;
  physicsHz: number;
  seconds: number;
  style?: SynthStyle;
}

export function synthesizeRecording(o: SynthOptions): InputRecording {
  const style = o.style ?? 'wiggle';
  const rec = new InputRecorder({ version: 1, trackId: o.trackId, seed: o.seed, physicsHz: o.physicsHz, note: `generated ${style}` });
  const rng = new Rng(o.seed ^ 0x5eed);
  const ticks = Math.round(o.seconds * o.physicsHz);
  for (let i = 0; i < ticks; i++) {
    const t = i / o.physicsHz;
    if (style === 'throttle') {
      rec.push(quantizeInput({ throttle: 1 }));
      continue;
    }
    // Realistic-ish: throttle modulation, brake taps, slow lean sway, a hop.
    const brakeTap = t > 3 && t < 3.4 ? 1 : t > 7 && t < 7.2 ? 0.6 : 0;
    rec.push(
      quantizeInput({
        throttle: brakeTap ? 0 : 0.85 + 0.15 * Math.sin(t * 1.7),
        brake: brakeTap,
        lean: Math.sin(t * 0.9) * 0.8 + (rng.next() - 0.5) * 0.05,
        hop: t > 5 && t < 5.1,
      }),
    );
  }
  return rec.toRecording();
}
