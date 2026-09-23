/**
 * AudioWorkletProcessor hosting RockhopSynth. Loaded via `?worker&url` so Vite
 * bundles it (with the dsp/ imports) as its own chunk. Messages:
 *   Float32Array            packed AudioParams (params.ts wire format)
 *   { master: number }      master volume (0..1, already perceptual-scaled)
 *   { seed: number }        reseed → new synth
 *   { scene: number }       music scene (0 run, 1 menu, 2 results) — the front end posts no frames
 *   { bed: boolean }        procedural music bed on/off (off while a recorded cue plays, src/audio/music)
 *   { stop: true }          let the processor be garbage-collected
 * The processor name is 'rockhop-synth' (mirrored in webAudio.ts; do not
 * import this module from the main thread — it calls registerProcessor).
 */
import { RockhopSynth } from '../dsp/synth';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

class RockhopSynthProcessor extends AudioWorkletProcessor {
  private synth = new RockhopSynth(sampleRate);
  private alive = true;
  private scene = 0;
  private bed = true;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent) => {
      const d = ev.data as Float32Array | { master?: number; seed?: number; scene?: number; bed?: boolean; stop?: boolean };
      if (d instanceof Float32Array) this.synth.setParams(d);
      else if (typeof d.master === 'number') this.synth.setMaster(d.master);
      else if (typeof d.seed === 'number') {
        this.synth = new RockhopSynth(sampleRate, { seed: d.seed });
        this.synth.setScene(this.scene);
        this.synth.setBed(this.bed);
      } else if (typeof d.bed === 'boolean') {
        this.bed = d.bed;
        this.synth.setBed(d.bed);
      } else if (typeof d.scene === 'number') {
        this.scene = d.scene;
        this.synth.setScene(d.scene);
      } else if (d.stop) this.alive = false;
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

registerProcessor('rockhop-synth', RockhopSynthProcessor);
