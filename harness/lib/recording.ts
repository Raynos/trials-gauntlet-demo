import fs from 'node:fs';
import path from 'node:path';
import { decodeAny, encodeBinary, encodeJSON, frameCount, type InputRecording } from '../../src/core/replay';

/**
 * `decodeJSON`/`decodeBinary` (src/core/replay.ts) drop `header.bike` (round 7 finding: `validateHeader`
 * copies `note` but not `bike`, and the binary layout has no field for it). The harness keeps the
 * class by re-reading it from the raw JSON header; a `.bin`/`.trin` recording is rookie by construction.
 */
export function loadRecording(file: string): InputRecording {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`recording not found: ${abs}`);
  const bytes = fs.readFileSync(abs);
  const rec = decodeAny(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  if (!rec.header.bike && bytes.length && bytes[0] === 0x7b /* '{' */) {
    try {
      const raw = JSON.parse(bytes.toString('utf8')) as { header?: { bike?: unknown } };
      const b = raw.header?.bike;
      if (b === 'rookie' || b === 'pro') rec.header.bike = b;
    } catch {
      /* not JSON after all */
    }
  }
  return rec;
}

export function saveRecording(file: string, rec: InputRecording): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  if (file.endsWith('.bin') || file.endsWith('.trin')) fs.writeFileSync(file, encodeBinary(rec));
  else fs.writeFileSync(file, encodeJSON(rec) + '\n');
}

export function describeRecording(rec: InputRecording): string {
  const frames = frameCount(rec);
  const secs = frames / rec.header.physicsHz;
  return `${rec.header.trackId} seed=${rec.header.seed} hz=${rec.header.physicsHz} frames=${frames} (${secs.toFixed(2)}s) runs=${rec.runs.length}`;
}
