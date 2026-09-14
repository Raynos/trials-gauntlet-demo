import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './paths';

export function ensureOut(sub = ''): string {
  const dir = path.join(OUT_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/** Print a key/value block in a stable, grep-friendly format. */
export function printKV(title: string, rows: Record<string, string | number | boolean | null | undefined>): void {
  console.log(`== ${title}`);
  const w = Math.max(...Object.keys(rows).map((k) => k.length));
  for (const [k, v] of Object.entries(rows)) {
    if (v === undefined) continue;
    console.log(`  ${k.padEnd(w)}  ${v === null ? 'null' : String(v)}`);
  }
}

export function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
