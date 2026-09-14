/**
 * Input recording / replay format.
 *
 * A recording is a header plus one InputFrame per physics tick. Frames are
 * quantized (u8 throttle/brake, i8 lean, flag byte) *before* they are applied
 * to physics, so the live run and the replay drive physics with identical
 * bytes. Runs of identical frames are RLE-compressed.
 *
 * Two encodings share one in-memory model:
 *   - JSON  (human readable, `{ header, runs: [[count, t, b, l, flags], ...] }`)
 *   - binary (magic "TRIN", little-endian; see encodeBinary)
 */
import type { InputFrame } from './types';

export const RECORDING_VERSION = 1;
const MAGIC = 'TRIN';

export interface RecordingHeader {
  version: number;
  trackId: string;
  seed: number;
  physicsHz: number;
  /** Optional free-form note (who/what produced it). */
  note?: string;
}

/** [count, throttle u8, brake u8, lean i8, flags u8] */
export type InputRun = [number, number, number, number, number];

export interface InputRecording {
  header: RecordingHeader;
  runs: InputRun[];
}

export const FLAG_HOP = 1;
export const FLAG_RESTART = 2;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Round to an integer and normalize -0 to 0 (JSON and Int8 both lose the sign). */
const qint = (v: number): number => Math.round(v) | 0;

/** Quantize an input to the exact values the recording can hold. */
export function quantizeInput(f: Partial<InputFrame>): InputFrame {
  const t = qint(clamp(Number(f.throttle) || 0, 0, 1) * 255);
  const b = qint(clamp(Number(f.brake) || 0, 0, 1) * 255);
  const l = qint(clamp(Number(f.lean) || 0, -1, 1) * 127);
  return {
    throttle: t / 255,
    brake: b / 255,
    lean: l / 127,
    hop: Boolean(f.hop),
    restart: Boolean(f.restart),
  };
}

export function packFrame(f: InputFrame): [number, number, number, number] {
  const t = qint(clamp(f.throttle, 0, 1) * 255);
  const b = qint(clamp(f.brake, 0, 1) * 255);
  const l = qint(clamp(f.lean, -1, 1) * 127);
  const flags = (f.hop ? FLAG_HOP : 0) | (f.restart ? FLAG_RESTART : 0);
  return [t, b, l, flags];
}

export function unpackFrame(t: number, b: number, l: number, flags: number): InputFrame {
  return {
    throttle: t / 255,
    brake: b / 255,
    lean: l / 127,
    hop: (flags & FLAG_HOP) !== 0,
    restart: (flags & FLAG_RESTART) !== 0,
  };
}

/** Incremental recorder: push one frame per tick. */
export class InputRecorder {
  private runs: InputRun[] = [];
  private frames = 0;

  constructor(readonly header: RecordingHeader) {}

  push(frame: InputFrame): void {
    const [t, b, l, flags] = packFrame(frame);
    const last = this.runs[this.runs.length - 1];
    if (last && last[1] === t && last[2] === b && last[3] === l && last[4] === flags && last[0] < 0xffff) {
      last[0]++;
    } else {
      this.runs.push([1, t, b, l, flags]);
    }
    this.frames++;
  }

  get frameCount(): number {
    return this.frames;
  }

  toRecording(): InputRecording {
    return { header: { ...this.header }, runs: this.runs.map((r) => [...r] as InputRun) };
  }
}

/** Iterate frames of a recording in tick order. */
export function* iterateFrames(rec: InputRecording): Generator<InputFrame, void, void> {
  for (const [count, t, b, l, flags] of rec.runs) {
    const f = unpackFrame(t, b, l, flags);
    for (let i = 0; i < count; i++) yield f;
  }
}

export function frameCount(rec: InputRecording): number {
  let n = 0;
  for (const r of rec.runs) n += r[0];
  return n;
}

/** Expand into a dense frame array (fine for < ~1e6 ticks). */
export function expandFrames(rec: InputRecording): InputFrame[] {
  const out: InputFrame[] = [];
  for (const f of iterateFrames(rec)) out.push(f);
  return out;
}

// ---------------------------------------------------------------------------
// JSON encoding
// ---------------------------------------------------------------------------

export function encodeJSON(rec: InputRecording): string {
  return JSON.stringify({ magic: MAGIC, header: rec.header, runs: rec.runs });
}

export function decodeJSON(text: string): InputRecording {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object') throw new Error('recording: not an object');
  const obj = raw as { magic?: unknown; header?: unknown; runs?: unknown };
  if (obj.magic !== MAGIC) throw new Error('recording: bad magic');
  const header = validateHeader(obj.header);
  if (!Array.isArray(obj.runs)) throw new Error('recording: runs missing');
  const runs: InputRun[] = obj.runs.map((r: unknown, i: number) => {
    if (!Array.isArray(r) || r.length !== 5 || !r.every((n) => Number.isInteger(n))) {
      throw new Error(`recording: bad run at ${i}`);
    }
    return [r[0], r[1], r[2], r[3], r[4]] as InputRun;
  });
  return { header, runs };
}

function validateHeader(h: unknown): RecordingHeader {
  if (!h || typeof h !== 'object') throw new Error('recording: header missing');
  const o = h as Record<string, unknown>;
  if (o.version !== RECORDING_VERSION) throw new Error(`recording: unsupported version ${String(o.version)}`);
  if (typeof o.trackId !== 'string') throw new Error('recording: trackId missing');
  if (typeof o.seed !== 'number') throw new Error('recording: seed missing');
  if (typeof o.physicsHz !== 'number') throw new Error('recording: physicsHz missing');
  const header: RecordingHeader = {
    version: o.version,
    trackId: o.trackId,
    seed: o.seed >>> 0,
    physicsHz: o.physicsHz,
  };
  if (typeof o.note === 'string') header.note = o.note;
  return header;
}

// ---------------------------------------------------------------------------
// Binary encoding
// ---------------------------------------------------------------------------
//
//  offset  size  field
//  0       4     magic "TRIN"
//  4       1     version (u8)
//  5       4     seed (u32 LE)
//  9       2     physicsHz (u16 LE)
//  11      2     trackId byte length (u16 LE)
//  13      n     trackId (utf-8)
//  ..      4     run count (u32 LE)
//  ..      6*k   runs: count u16, throttle u8, brake u8, lean i8, flags u8

export function encodeBinary(rec: InputRecording): Uint8Array {
  const trackBytes = new TextEncoder().encode(rec.header.trackId);
  // Split runs longer than 0xffff so they fit u16 counts.
  const runs: InputRun[] = [];
  for (const [count, t, b, l, flags] of rec.runs) {
    let remaining = count;
    while (remaining > 0) {
      const c = Math.min(remaining, 0xffff);
      runs.push([c, t, b, l, flags]);
      remaining -= c;
    }
  }
  const size = 13 + trackBytes.length + 4 + runs.length * 6;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8.set([0x54, 0x52, 0x49, 0x4e], 0); // TRIN
  dv.setUint8(4, rec.header.version);
  dv.setUint32(5, rec.header.seed >>> 0, true);
  dv.setUint16(9, rec.header.physicsHz, true);
  dv.setUint16(11, trackBytes.length, true);
  u8.set(trackBytes, 13);
  let o = 13 + trackBytes.length;
  dv.setUint32(o, runs.length, true);
  o += 4;
  for (const [count, t, b, l, flags] of runs) {
    dv.setUint16(o, count, true);
    dv.setUint8(o + 2, t);
    dv.setUint8(o + 3, b);
    dv.setInt8(o + 4, l);
    dv.setUint8(o + 5, flags);
    o += 6;
  }
  return u8;
}

export function decodeBinary(bytes: Uint8Array): InputRecording {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 17 || String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== MAGIC) {
    throw new Error('recording: bad binary magic');
  }
  const version = dv.getUint8(4);
  if (version !== RECORDING_VERSION) throw new Error(`recording: unsupported version ${version}`);
  const seed = dv.getUint32(5, true);
  const physicsHz = dv.getUint16(9, true);
  const trackLen = dv.getUint16(11, true);
  const trackId = new TextDecoder().decode(bytes.subarray(13, 13 + trackLen));
  let o = 13 + trackLen;
  const runCount = dv.getUint32(o, true);
  o += 4;
  if (o + runCount * 6 > bytes.length) throw new Error('recording: truncated');
  const runs: InputRun[] = [];
  for (let i = 0; i < runCount; i++) {
    runs.push([dv.getUint16(o, true), dv.getUint8(o + 2), dv.getUint8(o + 3), dv.getInt8(o + 4), dv.getUint8(o + 5)]);
    o += 6;
  }
  return { header: { version, trackId, seed, physicsHz }, runs };
}

/** Detect encoding by sniffing the first bytes. */
export function decodeAny(data: Uint8Array | string): InputRecording {
  if (typeof data === 'string') return decodeJSON(data);
  if (data.length >= 4 && data[0] === 0x54 && data[1] === 0x52 && data[2] === 0x49 && data[3] === 0x4e) {
    return decodeBinary(data);
  }
  return decodeJSON(new TextDecoder().decode(data));
}
