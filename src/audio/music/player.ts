/**
 * MusicPlayer — the recorded cues (cues.ts) on the live AudioContext, beside the synth.
 *
 *   voice (AudioBufferSource → fade gain) ─┐
 *   voice (the one fading out)  ───────────┼─► duck (under the engine) ─► out (master² × music volume) ─► destination
 *
 * Scenes → cues: menu → `menu`; map → `map`; run → the track's zone loop; results → the `results`
 * sting once, then the menu theme low underneath the panel. A ride loop keeps playing through
 * crashes and instant restarts (same scene, same zone: nothing to do) — the run never re-cues.
 *
 * Loading never blocks anything: nothing is fetched before the first gesture (the context does not
 * exist before it), a cue is fetched + decoded the first time a scene wants it, the likely next cue's
 * bytes are prefetched. Until a cue is playing the procedural MusicBed carries menu/results
 * (`onBed(true)`); once a recorded cue is wanted the bed yields (`onBed(false)`), and a failed fetch
 * or decode hands it straight back. Decoded PCM is ~0.4 MB/s, so at most three cues stay decoded
 * (the playing one, the one fading out, the next): iOS kills tabs over a few hundred MB.
 */
import type { AudioScene } from '../index';
import { MUSIC_CUES, type CueFile, type MusicCue } from './cues';
import { DEFAULT_ZONE, type MusicZone } from './zone';

/**
 * Scene levels, dB, before the per-file trim. Masters sit at −16 LUFS integrated; measured offline
 * (renderDemo / renderScript at master 1): the procedural menu bed plays at −22.8 LUFS, the results bed
 * −21.5, a b1 ride's engine bus −15.7 and the full ride mix −14.4.
 */
export const MUSIC_LEVELS = {
  /** Front end + map → −22 LUFS: level with the procedural bed they replace. */
  front: -6,
  /** Ride loops → −24 LUFS before the engine duck (−25 closed throttle, −28 wide open): ~10 LU under the engine. */
  ride: -8,
  /** The results sting → −20 LUFS: the moment may stand up (the results bed was −21.5). */
  sting: -4,
  /** The menu theme under the results panel after the sting → −28 LUFS. */
  afterSting: -12,
} as const;

const FADE_IN_S = { front: 0.9, ride: 0.35, sting: 0.02, afterSting: 2.5 } as const;
/** setTargetAtTime constant for a fade out; the source stops after ~5 τ. */
const FADE_OUT_TAU = 0.16;
const MAX_DECODED = 3;

export type MusicLevel = keyof typeof MUSIC_LEVELS;

/**
 * A zone without its own loop rides to its nearest neighbour's (snow is a cold alpine trail; the quarry and the
 * coast are both hot and rhythmic) before giving up to silence — the procedural bed never played in a run.
 */
export const RIDE_FALLBACK: Readonly<Record<MusicZone, readonly MusicZone[]>> = {
  coast: ['coast', 'quarry', 'alpine', 'snowline'],
  alpine: ['alpine', 'snowline', 'coast', 'quarry'],
  quarry: ['quarry', 'coast', 'alpine', 'snowline'],
  snowline: ['snowline', 'alpine', 'coast', 'quarry'],
};

interface Want {
  cue: MusicCue;
  level: MusicLevel;
}

interface Voice extends Want {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export interface MusicPlayerOptions {
  cues?: Readonly<Partial<Record<MusicCue, CueFile>>>;
  /** URL prefix for the files; default `./audio/` (relative: works on Vercel and inside the native shells). */
  base?: string;
  /** Injected for tests. */
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  /** true = the procedural bed may play (no recorded cue is carrying this scene). */
  onBed?: (on: boolean) => void;
}

const dbToGain = (db: number): number => Math.pow(10, db / 20);

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
}

/** Promise + callback forms both: older WebKit returns undefined from decodeAudioData. */
function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

export class MusicPlayer {
  readonly output: GainNode;
  private readonly duck: GainNode;
  private readonly cues: Readonly<Partial<Record<MusicCue, CueFile>>>;
  private readonly base: string;
  private readonly fetchBytes: (url: string) => Promise<ArrayBuffer>;
  private readonly onBed: (on: boolean) => void;
  private readonly bytes = new Map<MusicCue, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<MusicCue, Promise<AudioBuffer | null>>();
  private voice: Voice | null = null;
  /** The cue being fetched / decoded for the current scene. */
  private pending: Want | null = null;
  private scene: AudioScene | null = null;
  private zone: MusicZone = DEFAULT_ZONE;
  private stingDone = false;
  private token = 0;
  private master = 1;
  private music = 1;
  private duckDb = 0;
  private bed: boolean | null = null;
  private disposed = false;
  /** Every cue a scene asked for, in order (tests / the harness read it). */
  readonly log: string[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    opts: MusicPlayerOptions = {},
  ) {
    this.cues = opts.cues ?? MUSIC_CUES;
    this.base = opts.base ?? './audio/';
    this.fetchBytes = opts.fetchBytes ?? defaultFetch;
    this.onBed = opts.onBed ?? (() => undefined);
    this.output = ctx.createGain();
    this.duck = ctx.createGain();
    this.duck.connect(this.output);
    this.output.connect(destination);
    this.output.gain.value = this.master * this.music;
  }

  /** The cue now audible (or fading in), null when silent / procedural. */
  get playing(): MusicCue | null {
    return this.voice?.cue ?? null;
  }

  has(cue: MusicCue): boolean {
    return !!this.cues[cue];
  }

  setScene(scene: AudioScene | null, zone?: MusicZone): void {
    if (scene === this.scene && (!zone || zone === this.zone)) return;
    if (zone) this.zone = zone;
    if (scene !== this.scene) this.stingDone = false;
    this.scene = scene;
    this.apply();
    this.prefetchNext();
  }

  /** The track's zone (Game.loadTrack → setTrack). Re-cues only while riding. */
  setZone(zone: MusicZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.scene === 'run') this.apply();
    else {
      const ride = RIDE_FALLBACK[zone].find((z) => this.has(z));
      if (ride) void this.load(ride); // decode ahead of the countdown
    }
  }

  /** Master volume, already perceptual (WebAudioSystem squares the slider). */
  setVolume(master: number): void {
    this.master = Math.max(0, master);
    this.rampOut();
  }

  /** The music-only slider, 0..1 linear slider value (squared here like the master). */
  setMusicVolume(v: number): void {
    const p = Math.max(0, Math.min(1, v));
    this.music = p * p;
    this.rampOut();
  }

  /** Attenuation under the engine, dB ≥ 0. Fast down, slow back up; ignores sub-0.5 dB wiggle. */
  setDuckDb(db: number): void {
    const d = Math.max(0, db);
    if (Math.abs(d - this.duckDb) < 0.5) return;
    const t = this.ctx.currentTime;
    this.duck.gain.setTargetAtTime(dbToGain(-d), t, d > this.duckDb ? 0.06 : 0.4);
    this.duckDb = d;
  }

  prefetch(cue: MusicCue): void {
    void this.fetchCue(cue);
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.fadeOut(this.voice);
    this.voice = null;
    this.decoded.clear();
    this.bytes.clear();
    try {
      this.output.disconnect();
    } catch {
      /* already detached */
    }
  }

  private rampOut(): void {
    this.output.gain.setTargetAtTime(this.master * this.music, this.ctx.currentTime, 0.03);
  }

  private want(): Want | null {
    switch (this.scene) {
      case 'menu':
        return { cue: 'menu', level: 'front' };
      case 'map':
        // No map cue shipped → the menu theme carries the map too.
        return this.has('map') ? { cue: 'map', level: 'front' } : { cue: 'menu', level: 'front' };
      case 'run':
        return { cue: RIDE_FALLBACK[this.zone].find((z) => this.has(z)) ?? this.zone, level: 'ride' };
      case 'results':
        return this.stingDone || !this.has('results') ? { cue: 'menu', level: 'afterSting' } : { cue: 'results', level: 'sting' };
      default:
        return null;
    }
  }

  private setBed(on: boolean): void {
    if (on === this.bed) return;
    this.bed = on;
    this.onBed(on);
  }

  private apply(): void {
    if (this.disposed) return;
    const want = this.want();
    const cur = this.voice;
    const same = (w: Want | null): boolean => !!w && !!want && w.cue === want.cue && w.level === want.level;
    if (same(cur) || (!cur && same(this.pending))) return; // already there / on its way (a restart, a re-sent scene)
    const tok = ++this.token;
    this.fadeOut(cur);
    this.voice = null;
    this.pending = null;
    if (!want || !this.has(want.cue)) {
      this.setBed(true);
      return;
    }
    this.log.push(`${this.scene}:${want.cue}`);
    this.setBed(false);
    this.pending = want;
    void this.load(want.cue).then((buf) => {
      if (tok !== this.token || this.disposed) return;
      this.pending = null;
      if (!buf) {
        this.setBed(true); // the procedural bed takes the scene back
        return;
      }
      this.start(want, buf, tok);
    });
  }

  private start(want: Want, buf: AudioBuffer, tok: number): void {
    const file = this.cues[want.cue]!;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const target = dbToGain(MUSIC_LEVELS[want.level] + file.gainDb);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(target, t + FADE_IN_S[want.level]);
    src.connect(gain);
    gain.connect(this.duck);
    if (file.loop) {
      src.loop = true;
      src.loopStart = file.pre;
      src.loopEnd = file.pre + file.len;
      src.start(t, file.pre);
    } else {
      src.onended = () => {
        if (tok !== this.token || this.voice?.src !== src) return;
        // The sting has rung out: the menu theme comes up quietly under the results panel.
        this.stingDone = true;
        this.voice = null;
        this.apply();
      };
      src.start(t, 0);
    }
    this.voice = { ...want, src, gain };
    this.evict();
  }

  private fadeOut(v: Voice | null): void {
    if (!v) return;
    const t = this.ctx.currentTime;
    v.src.onended = null;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, FADE_OUT_TAU);
      v.src.stop(t + FADE_OUT_TAU * 6);
    } catch {
      /* never started / already stopped */
    }
    setTimeout(
      () => {
        try {
          v.gain.disconnect();
        } catch {
          /* gone */
        }
      },
      FADE_OUT_TAU * 6000 + 200,
    );
  }

  private fetchCue(cue: MusicCue): Promise<ArrayBuffer | null> {
    const file = this.cues[cue];
    if (!file) return Promise.resolve(null);
    let p = this.bytes.get(cue);
    if (!p) {
      p = this.fetchBytes(this.base + file.file).catch(() => {
        this.bytes.delete(cue); // a later scene may retry (a flaky link at boot)
        return null;
      });
      this.bytes.set(cue, p);
    }
    return p;
  }

  private load(cue: MusicCue): Promise<AudioBuffer | null> {
    let p = this.decoded.get(cue);
    if (!p) {
      // decodeAudioData detaches its argument: decode a copy, keep the compressed bytes for later.
      p = this.fetchCue(cue).then((b) =>
        b
          ? decode(this.ctx, b.slice(0)).catch(() => {
              this.decoded.delete(cue);
              return null;
            })
          : (this.decoded.delete(cue), null),
      );
      this.decoded.set(cue, p);
      this.evict();
    }
    return p;
  }

  /** Keep the playing cue and the most recent requests; drop the rest of the PCM. */
  private evict(): void {
    if (this.decoded.size <= MAX_DECODED) return;
    const keep = new Set<MusicCue>();
    if (this.voice) keep.add(this.voice.cue);
    const w = this.want();
    if (w) keep.add(w.cue);
    for (const k of [...this.decoded.keys()]) {
      if (this.decoded.size <= MAX_DECODED) break;
      if (!keep.has(k)) this.decoded.delete(k);
    }
  }

  /** Bytes only (cheap): what the player is likely to ask for next. */
  private prefetchNext(): void {
    const ride = RIDE_FALLBACK[this.zone].find((z) => this.has(z)) ?? this.zone;
    const next: MusicCue[] = this.scene === 'menu' ? ['map', ride] : this.scene === 'map' ? [ride] : this.scene === 'run' ? ['results'] : [];
    for (const c of next) if (this.has(c)) this.prefetch(c);
  }
}
