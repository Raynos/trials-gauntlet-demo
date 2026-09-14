import fs from 'node:fs';
import path from 'node:path';
import { decodeAny, encodeBinary, encodeJSON, frameCount, type InputRecording } from '../../src/core/replay';

export function loadRecording(file: string): InputRecording {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`recording not found: ${abs}`);
  const bytes = fs.readFileSync(abs);
  return decodeAny(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
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
