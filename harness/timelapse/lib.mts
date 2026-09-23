/**
 * Shared helpers for the build timelapse: paths, subprocess, a tiny static
 * server for a built `dist/`, and the commit ledger (`commits.json`).
 *
 * Everything here works from `git archive <sha>` exports in a scratch
 * directory; the repo working tree is never read or written apart from
 * `harness/out/timelapse/**` (gitignored).
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const execFileP = promisify(execFile);

export const TIMELAPSE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS_DIR = path.resolve(TIMELAPSE_DIR, '..');
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..');
export const OUT_DIR = path.join(HARNESS_DIR, 'out', 'timelapse');
export const BUILDS_DIR = path.join(OUT_DIR, 'builds');
export const CAPTURES_DIR = path.join(OUT_DIR, 'captures');
export const LEDGER_FILE = path.join(OUT_DIR, 'commits.json');
export const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH ?? path.join(path.dirname(FFMPEG), 'ffprobe');
export const PYTHON = process.env.TIMELAPSE_PYTHON ?? 'python3';

/** Scratch root for exports: TIMELAPSE_SCRATCH, else the OS tmp dir. */
export const SCRATCH_DIR = process.env.TIMELAPSE_SCRATCH ?? path.join(os.tmpdir(), 'rockhop-timelapse');

export interface CommitInfo {
  sha: string;
  short: string;
  /** ISO 8601 author date. */
  date: string;
  subject: string;
  index: number;
}

export interface CommitRecord extends CommitInfo {
  build: { status: 'ok' | 'skipped' | 'failed'; reason?: string | undefined; dist?: string | undefined; wallMs?: number | undefined };
  capture?: {
    status: 'ok' | 'partial' | 'failed' | 'skipped';
    reason?: string | undefined;
    track?: string | undefined;
    stills?: Record<string, string> | undefined;
    clip?: string | undefined;
    clipFrames?: number | undefined;
    wallMs?: number | undefined;
    notes?: string[] | undefined;
  };
}

export interface Ledger {
  version: 1;
  updatedAt: string;
  commits: CommitRecord[];
}

export function readLedger(): Ledger {
  if (!fs.existsSync(LEDGER_FILE)) return { version: 1, updatedAt: new Date().toISOString(), commits: [] };
  return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) as Ledger;
}

export function writeLedger(ledger: Ledger): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  ledger.updatedAt = new Date().toISOString();
  ledger.commits.sort((a, b) => a.index - b.index);
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2) + '\n');
}

export function upsertRecord(ledger: Ledger, rec: CommitRecord): void {
  const i = ledger.commits.findIndex((c) => c.sha === rec.sha);
  if (i >= 0) ledger.commits[i] = rec;
  else ledger.commits.push(rec);
}

/** `git log --reverse` on the first-parent line; index is 1-based position in history. */
export async function listCommits(range?: string): Promise<CommitInfo[]> {
  const args = ['log', '--reverse', '--first-parent', '--format=%H%x1f%h%x1f%aI%x1f%s'];
  args.push(range ?? 'HEAD');
  const { stdout } = await execFileP('git', args, { cwd: REPO_ROOT, maxBuffer: 64 << 20 });
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const [sha, short, date, subject] = line.split('\x1f');
      return { sha: sha!, short: short!, date: date!, subject: subject ?? '', index: i + 1 };
    });
}

export async function resolveSha(ref: string): Promise<string> {
  const { stdout } = await execFileP('git', ['rev-parse', ref], { cwd: REPO_ROOT });
  return stdout.trim();
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Spawn with captured output; never throws on a non-zero exit. */
export function run(
  bin: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: Buffer | string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: [opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          stderr += `\n[timeout after ${opts.timeoutMs} ms]`;
        }, opts.timeoutMs)
      : null;
    child.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (opts.input !== undefined) {
      child.stdin!.end(opts.input);
    }
  });
}

export async function ffmpeg(args: string[], timeoutMs = 600_000): Promise<void> {
  const r = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeoutMs });
  if (r.code !== 0) throw new Error(`ffmpeg exited ${r.code}: ${r.stderr.slice(-2000)}`);
}

export async function probeDuration(file: string): Promise<number> {
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return r.code === 0 ? Number(r.stdout.trim()) : NaN;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ktx2': 'image/ktx2',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Minimal static server for a built dist: same COOP/COEP headers the game's
 * vite config sets (cross-origin isolation), no caching.
 */
export function serveDist(dist: string): Promise<StaticServer> {
  const root = path.resolve(dist);
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-store',
        'Content-Length': fs.statSync(file).size,
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('no address'));
      resolve({
        url: `http://127.0.0.1:${addr.port}/`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

export function fmtDate(iso: string): string {
  // "2026-09-14 01:16" (author-local time, offset dropped)
  return iso.slice(0, 16).replace('T', ' ');
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

export function log(msg: string): void {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`);
}
