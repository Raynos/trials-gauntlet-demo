/**
 * Shared pieces of the native gate (harness/native/README.md): the store debug bundle's gate manifest, command
 * helpers, the result shape every platform returns, and the bar-3 comparison.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/paths';

export const WEB_DIR = path.join(REPO_ROOT, 'store', 'build', 'web');
export const APP_ID = 'com.jakeverbaten.rockhop';
export const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'store-release', 'native');
export const OUT = path.join(REPO_ROOT, 'harness', 'out', 'native');

export interface GateManifest {
  clear: string[];
  crash: string;
  sources: string[];
}

/** What `src/platform/gate.ts` is armed with (the shell injects it as `window.__rockhopGate`). */
export interface GateArm {
  clear: string[];
  crash: string;
  paced: number;
  track: string;
  restartReps: number;
}

export interface ClearRow {
  file: string;
  trackId: string;
  bike: string;
  ticks: number;
  finishTime: number | null;
  finishTimeHex: string | null;
  hash: string;
  cleared: boolean;
  wallMs: number;
}

/** Every message the in-app runner posted, by name (`boot`, `clear`, `result`, `done`, `error`). */
export type GateMessages = Record<string, Record<string, unknown> & { name: string }>;

export interface PlatformRun {
  platform: 'web' | 'ios' | 'android';
  device: string;
  ok: boolean;
  messages: GateMessages;
  clip: string | null;
  wallS: number;
  notes: string[];
}

export function readManifest(): GateManifest {
  const f = path.join(WEB_DIR, 'gate', 'manifest.json');
  if (!fs.existsSync(f)) throw new Error(`no ${path.relative(REPO_ROOT, f)}: run \`node scripts/store-build.mjs debug\` first`);
  return JSON.parse(fs.readFileSync(f, 'utf8')) as GateManifest;
}

export function buildMode(): string {
  const f = path.join(REPO_ROOT, 'store', 'build', 'MODE');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'none';
}

export function armFor(m: GateManifest, over: Partial<GateArm> = {}): GateArm {
  return { clear: m.clear, crash: m.crash, paced: 0, track: 'flat-test', restartReps: 20, ...over };
}

export function sh(cmd: string, args: string[], opts: { env?: Record<string, string>; cwd?: string; allowFail?: boolean; input?: string } = {}): string {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? REPO_ROOT, env: { ...process.env, ...opts.env }, encoding: 'utf8', input: opts.input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${r.stderr}`);
  return r.stdout ?? '';
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function until<T>(what: string, get: () => T | null | undefined | false | Promise<T | null | undefined | false>, timeoutMs: number, everyMs = 1000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await get();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${what}`);
    await sleep(everyMs);
  }
}

/** Rotate a portrait capture of a landscape app upright (the simulator records the panel, not the UI). */
export function uprightVideo(src: string, dst: string, transpose: 1 | 2): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `transpose=${transpose},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', dst]);
}

export function contactSheet(video: string, out: string, n = 8): void {
  const probe = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).trim();
  const dur = Number(probe) || 1;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', `fps=${(n / dur).toFixed(4)},scale=480:-2,tile=4x${Math.ceil(n / 4)}`, '-frames:v', '1', out]);
}

export interface Bar3Row {
  recording: string;
  trackId: string;
  bike: string;
  byPlatform: Record<string, { finishTime: number | null; finishTimeHex: string | null; hash: string; ticks: number } | null>;
  identical: boolean;
}

/** Bar 3: the same recording's finish time (the float's 8 bytes) and state hash on every platform that ran. */
export function compareBar3(runs: PlatformRun[]): Bar3Row[] {
  const rows = new Map<string, Bar3Row>();
  for (const run of runs) {
    const clear = (run.messages['result']?.['clear'] ?? run.messages['clear']?.['rows'] ?? []) as ClearRow[];
    const paced = run.messages['result']?.['paced'] as ClearRow | null | undefined;
    for (const r of [...clear, ...(paced ? [paced] : [])]) {
      const row = rows.get(r.file) ?? { recording: r.file, trackId: r.trackId, bike: r.bike, byPlatform: {}, identical: false };
      row.byPlatform[run.platform] = { finishTime: r.finishTime, finishTimeHex: r.finishTimeHex, hash: r.hash, ticks: r.ticks };
      rows.set(r.file, row);
    }
  }
  for (const row of rows.values()) {
    const vals = Object.values(row.byPlatform).filter((v) => v !== null);
    row.identical = vals.length >= 2 && vals.every((v) => v.finishTimeHex !== null && v.finishTimeHex === vals[0]!.finishTimeHex && v.hash === vals[0]!.hash);
  }
  return [...rows.values()];
}

/** A platform's out dir, emptied of the last run's messages (a stale error.json must never read as this run's). */
export function freshOutDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) fs.rmSync(path.join(dir, f), { force: true });
  return dir;
}

/** The messages a platform run left in its out dir (`gate.ts --from-out`: re-report without re-running). */
export function messagesFromOut(dir: string): GateMessages {
  const out: GateMessages = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as GateMessages[string];
    if (m && typeof m.name === 'string') out[m.name] = m;
  }
  return out;
}

export function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}
