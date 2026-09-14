/**
 * AudioWorkletProcessor hosting TrialsSynth. Loaded via `?worker&url` so Vite
 * bundles it (with the dsp/ imports) as its own chunk. Messages:
 *   Float32Array            packed AudioParams (params.ts wire format)
 *   { master: number }      master volume (0..1, already perceptual-scaled)
 *   { seed: number }        reseed → new synth
 *   { stop: true }          let the processor be garbage-collected
 * The processor name is 'trials-synth' (mirrored in webAudio.ts; do not
 * import this module from the main thread — it calls registerProcessor).
 */
import { TrialsSynth } from '../dsp/synth';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

class TrialsSynthProcessor extends AudioWorkletProcessor {
  private synth = new TrialsSynth(sampleRate);
  private alive = true;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent) => {
      const d = ev.data as Float32Array | { master?: number; seed?: number; stop?: boolean };
      if (d instanceof Float32Array) this.synth.setParams(d);
      else if (typeof d.master === 'number') this.synth.setMaster(d.master);
      else if (typeof d.seed === 'number') this.synth = new TrialsSynth(sampleRate, { seed: d.seed });
      else if (d.stop) this.alive = false;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return this.alive;
    const L = out[0]!;
    const R = out[1] ?? L;
    this.synth.process(L, R, 0, L.length);
    return this.alive;
  }
}

registerProcessor('trials-synth', TrialsSynthProcessor);
