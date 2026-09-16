import { describe, expect, it } from 'vitest';
import { AUDIO_PAIRS, DEFAULT_LOWPASS_HZ, audioPairFilter, audioTag, bareId, beatOfAudioTag, gainDbFor, lowpassChain, sidesFor } from './audio';
import { tagOfPairId } from './critic-prompt';
import { unmask } from './log';
import { coinLeft, makePairId } from './pair';

describe('audio pair ids and tags', () => {
  it('tags carry the beat and the reference clip id, and round-trip through the pair id regex', () => {
    for (const p of AUDIO_PAIRS) {
      const tag = audioTag(p.beat, p.ref);
      expect(tag).toMatch(/^audio-[a-z0-9-]+-\d{2}$/);
      expect(beatOfAudioTag(tag)).toBe(p.beat);
      const id = makePairId(tag, new Date(2026, 8, 15, 2, 30, 0));
      expect(id.startsWith(`${tag}-20260915-023000-`)).toBe(true);
      expect(tagOfPairId(id)).toBe(tag);
      expect(bareId(`apair-${id}`)).toBe(id);
      expect(bareId(`pair-${id}`)).toBe(id);
    }
    expect(beatOfAudioTag('wheelie-launch')).toBeNull();
    expect(beatOfAudioTag('audio-nope-01')).toBeNull();
  });
});

describe('the sealed side coin', () => {
  it('is deterministic per seed', () => {
    for (const seed of [1, 2, 1000, 1005, 0x7fffffff]) expect(coinLeft(seed)).toBe(coinLeft(seed));
  });
  it('lands on both sides across the six consecutive seeds of a run', () => {
    let ours = 0;
    let ref = 0;
    for (let base = 0; base < 64; base += 8) {
      for (let k = 0; k < AUDIO_PAIRS.length; k++) {
        if (coinLeft(base + k) === 'ours') ours++;
        else ref++;
      }
    }
    expect(ours).toBeGreaterThan(0);
    expect(ref).toBeGreaterThan(0);
    expect(Math.abs(ours - ref) / (ours + ref)).toBeLessThan(0.4);
  });
  it('balanced sides: exactly three ours / three ref per six-pair run, seeded, and not always the same order', () => {
    const orders = new Set<string>();
    for (let seed = 1000; seed < 1064; seed++) {
      const s = sidesFor(seed, 6);
      expect(s.filter((x) => x === 'ours').length).toBe(3);
      expect(sidesFor(seed, 6)).toEqual(s);
      orders.add(s.join(','));
    }
    expect(orders.size).toBeGreaterThan(8);
    expect(sidesFor(7, 5).filter((x) => x === 'ours').length).toBe(3);
  });
  it('unmasks A/B against the sealed side', () => {
    expect(unmask('A', 'ours')).toBe('ours');
    expect(unmask('B', 'ours')).toBe('ref');
    expect(unmask('A', 'ref')).toBe('ref');
    expect(unmask('B', 'ref')).toBe('ours');
    expect(unmask('tie', 'ref')).toBe('tie');
    expect(unmask('invalid', 'ours')).toBe('invalid');
  });
});

describe('loudness match', () => {
  it('is one linear gain to the target, capped by the peak', () => {
    expect(gainDbFor({ integratedLufs: -29, truePeakDb: -7 })).toBeCloseTo(6, 6);
    expect(gainDbFor({ integratedLufs: -29, truePeakDb: -3 })).toBeCloseTo(2, 6);
    expect(gainDbFor({ integratedLufs: -17, truePeakDb: -0.6 })).toBeCloseTo(-6, 6);
    expect(gainDbFor({ integratedLufs: -Infinity, truePeakDb: -Infinity })).toBe(0);
  });
});

describe('the black picture filter', () => {
  it('switches the label bar from A to B across the gap and draws a full clock', () => {
    const f = audioPairFilter(640, 360, 6.5, 1);
    expect(f).toContain('color=c=black:s=640x384:r=30:d=14.000');
    expect(f).toContain("enable='lt(t\\,6.5000)'");
    expect(f).toContain("enable='gte(t\\,7.5000)'");
    expect(f).toContain('apad=pad_dur=1.000');
    expect(f).toContain('concat=n=2:v=0:a=1');
    expect((f.match(/color=0xffd166/g) ?? []).length).toBe(16);
  });
});

describe('lowpass (round 12)', () => {
  it('is a 14 kHz low-pass by default and nothing at 0', () => {
    expect(DEFAULT_LOWPASS_HZ).toBe(14000);
    expect(lowpassChain(DEFAULT_LOWPASS_HZ)).toBe('lowpass=f=14000,');
    expect(lowpassChain(0)).toBe('');
  });
});
