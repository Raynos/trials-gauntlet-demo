/**
 * Menu sound cues (focus tick, confirm, back), synthesised — no assets. Uses
 * the game's AudioContext when the audio system exposes one (`context`
 * getter on WebAudioSystem) so there is a single output graph; otherwise a
 * tiny private context created on first use. Silent until `unlock()` (a user
 * gesture) like everything else, and it follows the Sound setting.
 */
interface ContextSource {
  context?: AudioContext | null;
}

export class UiSfx {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private enabled = true;
  private lastTick = 0;

  constructor(private readonly source?: ContextSource | undefined) {}

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume * 0.5;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private context(): AudioContext | null {
    if (!this.enabled || this.volume <= 0) return null;
    const shared = this.source?.context ?? null;
    const ctx = shared ?? this.ctx;
    if (!ctx) {
      if (typeof AudioContext === 'undefined') return null;
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return null;
      }
    }
    const c = (shared ?? this.ctx)!;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    if (!this.gain || this.gain.context !== c) {
      this.gain = c.createGain();
      this.gain.gain.value = this.volume * 0.5;
      this.gain.connect(c.destination);
    }
    return c;
  }

  private blip(freq: number, dur: number, type: OscillatorType, level: number, slide = 1): void {
    const c = this.context();
    if (!c || !this.gain) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Focus moved. Rate-limited so a held stick does not machine-gun. */
  tick(): void {
    const now = performance.now();
    if (now - this.lastTick < 40) return;
    this.lastTick = now;
    this.blip(1900, 0.045, 'square', 0.12);
  }

  confirm(): void {
    this.blip(620, 0.09, 'triangle', 0.35, 1.5);
    this.blip(1240, 0.14, 'sine', 0.2, 1.2);
  }

  back(): void {
    this.blip(520, 0.1, 'triangle', 0.25, 0.7);
  }

  /** Track select → countdown. */
  launch(): void {
    this.blip(180, 0.35, 'sawtooth', 0.22, 2.8);
    this.blip(900, 0.2, 'sine', 0.18, 1.6);
  }
}
