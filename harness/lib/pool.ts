/**
 * Wall-clock helpers (round 12): a bounded worker pool, child `tsx` jobs, and the `--jobs` default.
 *
 * Every harness sweep used to be one process, one track at a time, on an 18-core box. The node sim is
 * deterministic per process (a recording replays to the same hash in any process), so track x seed cells
 * can run in child processes and be merged in the original order; browser verification is one Chromium
 * with N contexts (SwiftShader is a CPU rasterizer: one page ~ one core).
 *
 * `defaultJobs(n)` = min(n, cores - 2): the host is shared with other builders' runs, two cores stay free.
 * `--jobs N` overrides it everywhere (`--jobs 1` = the old serial path, in-process, no children).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { ParsedArgs } from './args';
import { flagNum } from './args';
import { REPO_ROOT } from './paths';

export const CORES = os.cpus().length;

/** min(n, cores - 2), at least 1; `--jobs N` (or `jobs`) overrides. */
export function defaultJobs(n: number, flags?: ParsedArgs['flags'], key = 'jobs'): number {
  const want = flags && flags[key] !== undefined ? flagNum(flags, key, 0) : Math.max(1, CORES - 2);
  return Math.max(1, Math.min(n, Math.floor(want) || 1));
}

/**
 * Browser work: SwiftShader rasterises on several threads per page, so one page is ~3 cores, not one —
 * min(n, (cores - 2) / 3) pages at once (5 on 18 cores). 16 pages booting the game together on this box
 * starved every boot past the 180 s loader timeout (round 12 measurement). `--jobs N` still overrides.
 */
export function defaultBrowserJobs(n: number, flags?: ParsedArgs['flags'], key = 'jobs'): number {
  const want = flags && flags[key] !== undefined ? flagNum(flags, key, 0) : Math.max(1, Math.floor((CORES - 2) / 3));
  return Math.max(1, Math.min(n, Math.floor(want) || 1));
}

/** `loadavg 12.3 11.9 10.2 / 18 cores` — printed next to every sweep line so a timing can be read against the box's load. */
export function loadLine(): string {
  return `loadavg ${os.loadavg().map((l) => l.toFixed(1)).join(' ')} / ${CORES} cores`;
}

/**
 * Run `fn` over `items` with at most `jobs` in flight; results come back in item order. The first
 * rejection is rethrown once every started job has settled (no orphaned children / pages).
 */
export async function mapPool<T, R>(items: readonly T[], jobs: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let firstError: unknown = null;
  const worker = async (): Promise<void> => {
    while (next < items.length && firstError === null) {
      const i = next++;
      try {
        out[i] = await fn(items[i]!, i);
      } catch (err) {
        firstError ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, () => worker()));
  if (firstError !== null) throw firstError;
  return out;
}

/** The stdout line a `--job` worker prints its result on (anything else is forwarded to our stderr). */
export const JOB_PREFIX = '@@job ';

/** Worker side: print the result for the parent and nothing else on that line. */
export function emitJobResult(result: unknown): void {
  process.stdout.write(`${JOB_PREFIX}${JSON.stringify(result)}\n`);
}

export interface SpawnJobOptions {
  /** Prefix for the child's forwarded stderr/stdout lines (default: the script's basename). */
  tag?: string;
  /** Kill the child after this many ms (default: none). */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Parent side: `tsx <script> <args>` as a child process; resolves with the JSON the child emitted via
 * `emitJobResult`. The child's other output is forwarded line by line to our stderr, prefixed, so a
 * sweep's per-run lines still show up (interleaved by completion, not by order).
 */
export function spawnJob<R>(script: string, args: string[], o: SpawnJobOptions = {}): Promise<R> {
  const abs = path.isAbsolute(script) ? script : path.join(REPO_ROOT, script);
  const tag = o.tag ?? path.basename(abs);
  return new Promise<R>((resolve, reject) => {
    const child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [abs, ...args], {
      cwd: REPO_ROOT,
      env: o.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let result: R | undefined;
    let sawResult = false;
    let tail = '';
    const forward = (chunk: Buffer, isOut: boolean): void => {
      tail += chunk.toString();
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      for (const line of lines) {
        if (isOut && line.startsWith(JOB_PREFIX)) {
          result = JSON.parse(line.slice(JOB_PREFIX.length)) as R;
          sawResult = true;
        } else if (line.length) process.stderr.write(`  [${tag}] ${line}\n`);
      }
    };
    child.stdout.on('data', (d: Buffer) => forward(d, true));
    child.stderr.on('data', (d: Buffer) => forward(d, false));
    const timer = o.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), o.timeoutMs) : null;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (tail.length) forward(Buffer.from('\n'), false);
      if (sawResult && code === 0) resolve(result as R);
      else reject(new Error(`${tag} ${args.slice(0, 3).join(' ')}: exit ${code ?? signal} ${sawResult ? '' : '(no result line)'}`));
    });
  });
}

/**
 * Persistent workers (round 12): `jobs` long-lived `tsx <script> --worker` children, each fed one JSON cell per
 * stdin line and answering `@@job {"i":<index>,"result":...}` (or `"error"`) on stdout. A fresh tsx process costs
 * ~1.5 s of CPU to compile src/ — more than a whole reflex run — so cells stream to workers that stay up.
 * Results come back in cell order; the children's other output is forwarded to our stderr, prefixed.
 */
export class WorkerPool<J, R> {
  private readonly children: ChildProcess[] = [];
  constructor(
    private readonly script: string,
    readonly jobs: number,
    private readonly o: { tag?: string; env?: NodeJS.ProcessEnv } = {},
  ) {}

  async run(cells: readonly J[], onDone: (r: R, cell: J, index: number) => void = () => undefined): Promise<R[]> {
    const n = Math.max(1, Math.min(this.jobs, cells.length));
    const abs = path.isAbsolute(this.script) ? this.script : path.join(REPO_ROOT, this.script);
    const tag = this.o.tag ?? path.basename(abs);
    const out = new Array<R>(cells.length);
    let next = 0;
    let done = 0;
    let firstError: unknown = null;
    return new Promise<R[]>((resolve, reject) => {
      const finish = (): void => {
        for (const c of this.children) c.stdin?.end();
        if (firstError !== null) reject(firstError);
        else resolve(out);
      };
      const spawnOne = (k: number): void => {
        const child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [abs, '--worker'], {
          cwd: REPO_ROOT,
          env: this.o.env ?? process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.children.push(child);
        let current = -1;
        const dispatch = (): void => {
          if (next >= cells.length || firstError !== null) {
            child.stdin?.end();
            return;
          }
          current = next++;
          child.stdin?.write(`${JSON.stringify({ i: current, job: cells[current] })}\n`);
        };
        readline.createInterface({ input: child.stdout! }).on('line', (line) => {
          if (!line.startsWith(JOB_PREFIX)) {
            if (line.length) process.stderr.write(`  [${tag} #${k}] ${line}\n`);
            return;
          }
          const msg = JSON.parse(line.slice(JOB_PREFIX.length)) as { i: number; result?: R; error?: string };
          if (msg.error !== undefined) firstError ??= new Error(`${tag} cell ${msg.i}: ${msg.error}`);
          else {
            out[msg.i] = msg.result as R;
            onDone(msg.result as R, cells[msg.i]!, msg.i);
          }
          done++;
          current = -1;
          if (done === cells.length || firstError !== null) finish();
          else dispatch();
        });
        readline.createInterface({ input: child.stderr! }).on('line', (line) => {
          if (line.length) process.stderr.write(`  [${tag} #${k}] ${line}\n`);
        });
        child.on('error', (err) => {
          firstError ??= err;
          finish();
        });
        child.on('close', (code, signal) => {
          if (current >= 0 && firstError === null) {
            firstError = new Error(`${tag} worker #${k} exited (${code ?? signal}) while running cell ${current}`);
            finish();
          }
        });
        dispatch();
      };
      for (let k = 0; k < n; k++) spawnOne(k);
    });
  }
}

/**
 * Worker side of `WorkerPool`: read cells from stdin, answer each on stdout, exit when stdin closes.
 * `handler` gets the cell and returns the JSON-able result; a throw becomes an `error` answer.
 */
export async function runWorkerLoop<J, R>(handler: (job: J) => Promise<R>): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const { i, job } = JSON.parse(line) as { i: number; job: J };
    try {
      const result = await handler(job);
      process.stdout.write(`${JOB_PREFIX}${JSON.stringify({ i, result })}\n`);
    } catch (err) {
      process.stdout.write(`${JOB_PREFIX}${JSON.stringify({ i, error: err instanceof Error ? (err.stack ?? err.message) : String(err) })}\n`);
    }
  }
}

/** `[a, b] x [1, 2]` -> every pair, first factor outermost (the serial loop order). */
export function grid<A, B>(as: readonly A[], bs: readonly B[]): Array<[A, B]> {
  const out: Array<[A, B]> = [];
  for (const a of as) for (const b of bs) out.push([a, b]);
  return out;
}
