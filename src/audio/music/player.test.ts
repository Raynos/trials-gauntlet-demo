/**
 * The recorded-music loader on a mocked AudioContext (tests are silent: no real context ever opens).
 * Covers: scene → cue mapping, zone fallback, lazy fetch + decode, the loop window, the sting hand-off,
 * the procedural bed hand-back on a failed fetch, the engine duck law, and the automation rule
 * (WebAudioSystem never constructs an AudioContext under navigator.webdriver).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer, MUSIC_LEVELS } from './player';
import type { CueFile, MusicCue } from './cues';
import { MUSIC_CUES } from './cues';
import { zoneOf } from './zone';
import { WebAudioSystem, engineDuckDb } from '../graph/webAudio';

class MockParam {
  value = 1;
  events: string[] = [];
  setValueAtTime(v: number, t: number): this {
    this.events.push(`set ${v.toFixed(3)}@${t}`);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push(`ramp ${v.toFixed(3)}@${t}`);
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    this.events.push(`target ${v.toFixed(3)}@${t}/${tau}`);
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class MockNode {
  outputs: unknown[] = [];
  connect(n: unknown): unknown {
    this.outputs.push(n);
    return n;
  }
  disconnect(): void {
    this.outputs = [];
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}

class MockSource extends MockNode {
  buffer: MockBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: [number, number] | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t: number, off: number): void {
    this.started = [t, off];
  }
  stop(t: number): void {
    this.stopped = t;
  }
}

class MockBuffer {
  constructor(readonly tag: string) {}
}

class MockFilter extends MockNode {
  type = '';
  frequency = new MockParam();
  Q = new MockParam();
  threshold = new MockParam();
  knee = new MockParam();
  ratio = new MockParam();
  attack = new MockParam();
  release = new MockParam();
  start(): void {}
}

class MockCtx {
  currentTime = 10;
  sampleRate = 48000;
  state = 'running';
  async resume(): Promise<void> {}
  createDynamicsCompressor(): MockFilter {
    return new MockFilter();
  }
  createBiquadFilter(): MockFilter {
    return new MockFilter();
  }
  createOscillator(): MockFilter {
    return new MockFilter();
  }
  createBuffer(_c: number, n: number): { getChannelData(): Float32Array } {
    const d = new Float32Array(n);
    return { getChannelData: () => d };
  }
  sources: MockSource[] = [];
  decodes: number[] = [];
  destination = new MockNode();
  createGain(): MockGain {
    return new MockGain();
  }
  createBufferSource(): MockSource {
    const s = new MockSource();
    this.sources.push(s);
    return s;
  }
  decodeAudioData(b: ArrayBuffer): Promise<MockBuffer> {
    this.decodes.push(b.byteLength);
    const tag = new TextDecoder().decode(new Uint8Array(b));
    if (tag === 'garbage') return Promise.reject(new Error('EncodingError'));
    return Promise.resolve(new MockBuffer(tag));
  }
}

const CUES: Partial<Record<MusicCue, CueFile>> = {
  menu: { file: 'menu-aaaa.m4a', loop: true, pre: 0.5, len: 64, gainDb: 0, bpm: 120, bytes: 4 },
  map: { file: 'map-bbbb.m4a', loop: true, pre: 0.5, len: 48, gainDb: -1, bpm: 96, bytes: 3 },
  coast: { file: 'coast-cccc.m4a', loop: true, pre: 0.5, len: 60, gainDb: 0, bpm: 128, bytes: 5 },
  alpine: { file: 'alpine-dddd.m4a', loop: true, pre: 0.5, len: 60, gainDb: 0, bpm: 118, bytes: 6 },
  results: { file: 'results-eeee.m4a', loop: false, pre: 0, len: 9, gainDb: 0, bpm: 120, bytes: 7 },
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function setup(cues = CUES, bodies: Record<string, string> = {}) {
  const ctx = new MockCtx();
  const fetched: string[] = [];
  const bed: boolean[] = [];
  const player = new MusicPlayer(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, {
    cues,
    fetchBytes: async (url) => {
      fetched.push(url);
      const name = url.replace('./audio/', '');
      if (bodies[name] === '404') throw new Error('404');
      return new TextEncoder().encode(bodies[name] ?? name).buffer as ArrayBuffer;
    },
    onBed: (on) => bed.push(on),
  });
  return { ctx, player, fetched, bed };
}

describe('MusicPlayer', () => {
  it('fetches nothing until a scene asks, then fetches + decodes lazily and loops the padded window', async () => {
    const { ctx, player, fetched, bed } = setup();
    expect(fetched).toEqual([]);
    player.setScene('menu', 'coast');
    expect(bed).toEqual([false]); // the bed yields at once: no procedural blip before the file
    await flush();
    expect(fetched[0]).toBe('./audio/menu-aaaa.m4a');
    const src = ctx.sources[0]!;
    expect(src.buffer?.tag).toBe('menu-aaaa.m4a');
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(0.5);
    expect(src.loopEnd).toBe(64.5);
    expect(src.started).toEqual([10, 0.5]);
    expect(player.playing).toBe('menu');
    // menu prefetches the map and the zone (bytes only — nothing else decoded)
    expect(fetched).toContain('./audio/map-bbbb.m4a');
    expect(fetched).toContain('./audio/coast-cccc.m4a');
    expect(ctx.decodes.length).toBe(1);
  });

  it('crossfades menu → map → the zone ride loop; a restart (same scene) never re-cues', async () => {
    const { ctx, player } = setup();
    player.setScene('menu', 'alpine');
    await flush();
    player.setScene('map');
    await flush();
    expect(ctx.sources[0]!.stopped).not.toBeNull();
    expect(player.playing).toBe('map');
    player.setScene('run');
    await flush();
    expect(player.playing).toBe('alpine');
    const n = ctx.sources.length;
    player.setScene('run'); // retry / checkpoint restart
    player.setZone('alpine');
    await flush();
    expect(ctx.sources.length).toBe(n);
    expect(player.log).toEqual(['menu:menu', 'map:map', 'run:alpine']);
  });

  it('a new zone while riding re-cues; a zone without its own loop rides its neighbour', async () => {
    const { player } = setup();
    player.setScene('run', 'coast');
    await flush();
    expect(player.playing).toBe('coast');
    player.setZone('snowline'); // no snowline file in this manifest → the alpine loop
    await flush();
    expect(player.playing).toBe('alpine');
    player.setZone('quarry'); // no quarry file → coast
    await flush();
    expect(player.playing).toBe('coast');
  });

  it('with no ride loop at all a run is silent (the procedural bed never plays in a run)', async () => {
    const { player, bed } = setup({ menu: CUES.menu! });
    player.setScene('run', 'snowline');
    await flush();
    expect(player.playing).toBeNull();
    expect(bed.at(-1)).toBe(true);
  });

  it('results: the sting plays once, then the menu theme comes up low under the panel', async () => {
    const { ctx, player } = setup();
    player.setScene('run', 'coast');
    await flush();
    player.setScene('results');
    await flush();
    const sting = ctx.sources.at(-1)!;
    expect(sting.buffer?.tag).toBe('results-eeee.m4a');
    expect(sting.loop).toBe(false);
    sting.onended?.();
    await flush();
    expect(player.playing).toBe('menu');
    expect(player.log.at(-1)).toBe('results:menu');
  });

  it('hands the scene back to the procedural bed when the fetch fails or the decode throws', async () => {
    const a = setup(CUES, { 'menu-aaaa.m4a': '404' });
    a.player.setScene('menu');
    await flush();
    expect(a.bed).toEqual([false, true]);
    expect(a.player.playing).toBeNull();
    const b = setup(CUES, { 'map-bbbb.m4a': 'garbage' });
    b.player.setScene('map');
    await flush();
    expect(b.bed).toEqual([false, true]);
  });

  it('with an empty manifest it is inert: the bed carries every scene', async () => {
    const { ctx, player, fetched, bed } = setup({});
    for (const s of ['menu', 'map', 'run', 'results'] as const) player.setScene(s);
    await flush();
    expect(fetched).toEqual([]);
    expect(ctx.sources.length).toBe(0);
    expect(bed).toEqual([true]);
  });

  it('levels: ride sits under the front end; the sting stands up', () => {
    expect(MUSIC_LEVELS.ride).toBeLessThan(MUSIC_LEVELS.front);
    expect(MUSIC_LEVELS.sting).toBeGreaterThan(MUSIC_LEVELS.ride);
  });

  it('keeps at most three cues decoded', async () => {
    const { player } = setup();
    for (const s of ['menu', 'map', 'run', 'results'] as const) {
      player.setScene(s, 'coast');
      await flush();
    }
    player.setZone('alpine');
    await flush();
    // decoded map is private: count through a probe — every scene played, so eviction must have run
    expect((player as unknown as { decoded: Map<string, unknown> }).decoded.size).toBeLessThanOrEqual(3);
  });
});

describe('engine duck law', () => {
  it('is 0 with the engine silent, 1 dB closed, 4 dB wide open', () => {
    expect(engineDuckDb(0, 1)).toBe(0);
    expect(engineDuckDb(1, 0)).toBeCloseTo(1);
    expect(engineDuckDb(1, 1)).toBeCloseTo(4);
  });
});

describe('zoneOf', () => {
  const t = (meta: Record<string, unknown>) => ({ def: { meta } }) as unknown as Parameters<typeof zoneOf>[0];
  it('zone wins, then the biome, then coast', () => {
    expect(zoneOf(t({ zone: 'snowline', biome: 'coast' }))).toBe('snowline');
    expect(zoneOf(t({ biome: 'alpine' }))).toBe('alpine');
    expect(zoneOf(t({ biome: 'quarry' }))).toBe('quarry');
    expect(zoneOf(t({ biome: 'snow' }))).toBe('snowline');
    expect(zoneOf(t({ biome: 'canyon' }))).toBe('quarry');
    expect(zoneOf(t({ biome: 'somethingNew' }))).toBe('coast');
    expect(zoneOf(null)).toBe('coast');
  });
});

describe('shipped manifest', () => {
  it('every cue file is an .m4a under public/audio with a loop window inside the file', () => {
    for (const [cue, f] of Object.entries(MUSIC_CUES)) {
      expect(f!.file, cue).toMatch(/^[a-z]+-[0-9a-f]{8}\.m4a$/);
      if (f!.loop) expect(f!.pre, cue).toBeGreaterThanOrEqual(0.1);
      expect(f!.len, cue).toBeGreaterThan(f!.loop ? 20 : 3);
    }
  });
});

describe('automation stays silent', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.navigator;
    delete g.AudioContext;
  });

  it('never constructs an AudioContext under navigator.webdriver, so no music loads', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true });
    const ctor = vi.fn();
    g.AudioContext = ctor;
    const sys = new WebAudioSystem();
    await sys.unlock();
    sys.setScene('menu');
    expect(ctor).not.toHaveBeenCalled();
    expect(sys.context).toBeNull();
    expect(sys.musicPlayer).toBeNull();
  });

  it('with an injected (mock) context the loader path still runs: scene → fetch → decode → loop', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true });
    const ctx = new MockCtx();
    const fetched: string[] = [];
    const sys = new WebAudioSystem({
      context: ctx as unknown as AudioContext,
      forceFallback: true,
      music: { cues: CUES, fetchBytes: async (u) => (fetched.push(u), new TextEncoder().encode(u).buffer as ArrayBuffer) },
    });
    sys.setScene('map');
    await sys.unlock();
    await flush();
    expect(sys.musicPlayer).not.toBeNull();
    expect(fetched[0]).toBe('./audio/map-bbbb.m4a');
    expect(sys.musicPlayer!.playing).toBe('map');
    sys.setMasterVolume(0.5);
    expect(sys.musicPlayer!.output.gain.value).toBeCloseTo(0.25);
    sys.setMusicVolume(0);
    expect(sys.musicPlayer!.output.gain.value).toBe(0);
    sys.dispose();
    expect(sys.musicPlayer).toBeNull();
  });
});
