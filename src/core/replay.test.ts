import { describe, expect, it } from 'vitest';
import {
  InputRecorder,
  decodeAny,
  decodeBinary,
  decodeJSON,
  encodeBinary,
  encodeJSON,
  expandFrames,
  frameCount,
  packFrame,
  quantizeInput,
  unpackFrame,
  type InputRecording,
} from './replay';

function sample(): InputRecording {
  const rec = new InputRecorder({ version: 1, trackId: 'flat-test', seed: 0xdeadbeef, physicsHz: 120, note: 'unit' });
  for (let i = 0; i < 500; i++) {
    rec.push(quantizeInput({ throttle: i < 200 ? 1 : 0.5, brake: i > 400 ? 1 : 0, lean: Math.sin(i / 50), hop: i === 250 }));
  }
  return rec.toRecording();
}

describe('quantizeInput', () => {
  it('is idempotent (replay feeds physics the same bytes as live)', () => {
    for (let i = 0; i < 1000; i++) {
      const raw = { throttle: Math.random(), brake: Math.random(), lean: Math.random() * 2 - 1, hop: i % 2 === 0 };
      const q1 = quantizeInput(raw);
      const q2 = quantizeInput(q1);
      expect(q2).toEqual(q1);
      const [t, b, l, f] = packFrame(q1);
      expect(unpackFrame(t, b, l, f)).toEqual(q1);
    }
  });

  it('never emits -0 (JSON and Int8 would silently drop the sign)', () => {
    const q = quantizeInput({ lean: -0.001, throttle: -0, brake: -0 });
    expect(Object.is(q.lean, -0)).toBe(false);
    expect(Object.is(q.throttle, -0)).toBe(false);
    expect(Object.is(q.brake, -0)).toBe(false);
  });

  it('clamps and defaults', () => {
    expect(quantizeInput({ throttle: 7, brake: -1, lean: 3 })).toEqual({ throttle: 1, brake: 0, lean: 1, hop: false, restart: false });
    expect(quantizeInput({})).toEqual({ throttle: 0, brake: 0, lean: 0, hop: false, restart: false });
  });
});

describe('recording encodings', () => {
  it('JSON roundtrips', () => {
    const rec = sample();
    const back = decodeJSON(encodeJSON(rec));
    expect(back).toEqual(rec);
    expect(frameCount(back)).toBe(500);
  });

  it('binary roundtrips and is compact', () => {
    const rec = sample();
    const bytes = encodeBinary(rec);
    const back = decodeBinary(bytes);
    expect(back.header.trackId).toBe('flat-test');
    expect(back.header.seed).toBe(0xdeadbeef);
    expect(back.header.physicsHz).toBe(120);
    expect(expandFrames(back)).toEqual(expandFrames(rec));
    expect(bytes.length).toBeLessThan(500 * 6);
  });

  it('decodeAny sniffs both', () => {
    const rec = sample();
    expect(expandFrames(decodeAny(encodeBinary(rec)))).toEqual(expandFrames(rec));
    expect(expandFrames(decodeAny(encodeJSON(rec)))).toEqual(expandFrames(rec));
    expect(expandFrames(decodeAny(new TextEncoder().encode(encodeJSON(rec))))).toEqual(expandFrames(rec));
  });

  it('carries header.bike through both encodings (harness r7: Pro replays were running on Rookie)', () => {
    const base = sample();
    for (const bike of ['rookie', 'pro'] as const) {
      const rec: InputRecording = { ...base, header: { ...base.header, bike } };
      expect(decodeJSON(encodeJSON(rec)).header.bike).toBe(bike);
      expect(decodeBinary(encodeBinary(rec)).header.bike).toBe(bike);
      expect(decodeAny(encodeBinary(rec)).header.bike).toBe(bike);
    }
    // Pre-garage recordings carry no class in either encoding and stay that way (callers default to rookie).
    expect(decodeJSON(encodeJSON(base)).header.bike).toBeUndefined();
    expect(decodeBinary(encodeBinary(base)).header.bike).toBeUndefined();
  });

  it('carries header.physics through both encodings; unstamped stays unstamped (= v1 to callers)', () => {
    const base = sample();
    for (const physics of ['v1', 'v2'] as const) {
      const rec: InputRecording = { ...base, header: { ...base.header, physics } };
      expect(decodeJSON(encodeJSON(rec)).header.physics).toBe(physics);
      expect(decodeBinary(encodeBinary(rec)).header.physics).toBe(physics);
      // A stamped binary without an explicit bike carries the default class byte so the layout stays positional.
      expect(decodeBinary(encodeBinary(rec)).header.bike).toBe('rookie');
      const pro: InputRecording = { ...base, header: { ...base.header, physics, bike: 'pro' } };
      expect(decodeBinary(encodeBinary(pro)).header).toMatchObject({ physics, bike: 'pro' });
    }
    expect(decodeJSON(encodeJSON(base)).header.physics).toBeUndefined();
    expect(decodeBinary(encodeBinary(base)).header.physics).toBeUndefined();
    const bikeOnly: InputRecording = { ...base, header: { ...base.header, bike: 'pro' } };
    expect(decodeBinary(encodeBinary(bikeOnly)).header).toMatchObject({ bike: 'pro' });
    expect(decodeBinary(encodeBinary(bikeOnly)).header.physics).toBeUndefined();
  });

  it('splits runs longer than u16 in binary', () => {
    const rec = new InputRecorder({ version: 1, trackId: 't', seed: 1, physicsHz: 120 });
    const f = quantizeInput({ throttle: 1 });
    for (let i = 0; i < 70000; i++) rec.push(f);
    const r = rec.toRecording();
    expect(frameCount(decodeBinary(encodeBinary(r)))).toBe(70000);
  });

  it('rejects garbage', () => {
    expect(() => decodeJSON('{"magic":"nope"}')).toThrow();
    expect(() => decodeBinary(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
