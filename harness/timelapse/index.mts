/**
 * Build timelapse driver: for every first-parent commit not yet in
 * `harness/out/timelapse/commits.json`, build it from a `git archive` export,
 * capture stills + a 4 s clip, record the result, then re-render the videos.
 * Re-run after future rounds; only new commits are built and captured.
 *
 *   npx tsx harness/timelapse/index.mts [--since <sha>] [--milestones a,b,c]
 *        [--retry-failed] [--force] [--no-render] [--render-only] [--clips milestones|all]
 *        [--track b1-first-ride] [--limit N]
 *
 *   --since <sha>     only consider commits after <sha> (`<sha>..HEAD`)
 *   --retry-failed    re-capture commits whose last capture failed/partial
 *   --force           rebuild + recapture everything in range
 *   --clips           `all` (default) records a 4 s clip for every commit;
 *                     `milestones` clips only the milestone set (stills for the rest)
 *   --limit N         stop after N new commits (budgeting)
 *
 * Captures run strictly sequentially (this machine is often loaded by other
 * headless Chromium runs).
 */
import path from 'node:path';
import { buildCommit } from './build-commit.mjs';
import { captureCommit } from './capture-commit.mjs';
import { BUILDS_DIR, CAPTURES_DIR, listCommits, log, readLedger, resolveSha, upsertRecord, writeLedger, type CommitRecord } from './lib.mjs';
import { DEFAULT_MILESTONES, render } from './render.mjs';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string): boolean => args.includes(`--${name}`);

const since = flag('since');
const milestones = flag('milestones')?.split(',').map((s) => s.trim()).filter(Boolean);
const retryFailed = has('retry-failed');
const force = has('force');
const noRender = has('no-render');
const renderOnly = has('render-only');
const clipsMode = (flag('clips') ?? 'all') as 'all' | 'milestones';
const track = flag('track') ?? 'b1-first-ride';
const limit = flag('limit') ? Number(flag('limit')) : Infinity;

async function main(): Promise<void> {
  const t0 = performance.now();
  if (!renderOnly) {
    const ledger = readLedger();
    const history = await listCommits();
    const sinceSha = since ? await resolveSha(since) : null;
    const sinceIndex = sinceSha ? history.findIndex((c) => c.sha === sinceSha) : -1;
    if (since && sinceIndex < 0) throw new Error(`--since ${since} is not on the first-parent history`);
    const range = history.slice(sinceIndex + 1);
    const milestoneSet = new Set((milestones ?? DEFAULT_MILESTONES).map((s) => s.slice(0, 7)));
    const headSha = history[history.length - 1]!.sha;

    const todo = range.filter((c) => {
      const rec = ledger.commits.find((r) => r.sha === c.sha);
      if (force || !rec) return true;
      if (rec.build.status === 'skipped') return false;
      if (rec.build.status === 'failed') return retryFailed;
      if (!rec.capture) return true;
      if (rec.capture.status === 'ok') return false;
      return retryFailed;
    });
    log(`timelapse: ${history.length} commits in history, ${range.length} in range, ${todo.length} to build/capture (clips: ${clipsMode})`);

    let done = 0;
    for (const c of todo) {
      if (done >= limit) {
        log(`timelapse: --limit ${limit} reached`);
        break;
      }
      done++;
      // Refresh index/subject from history every run so the ledger tracks rewrites.
      const rec: CommitRecord = { ...c, build: { status: 'failed', reason: 'not started' } };
      log(`--- [${c.index}/${history.length}] ${c.short} ${c.subject.slice(0, 80)}`);
      try {
        const b = await buildCommit(c.sha, BUILDS_DIR, force);
        rec.build = { status: b.status, reason: b.reason, dist: b.dist, wallMs: b.wallMs };
      } catch (err) {
        rec.build = { status: 'failed', reason: err instanceof Error ? err.message.split('\n')[0] : String(err) };
        log(`build ${c.short}: threw ${rec.build.reason}`);
      }
      if (rec.build.status === 'ok' && rec.build.dist) {
        const wantClip = clipsMode === 'all' || milestoneSet.has(c.short) || c.sha === headSha;
        try {
          const cap = await captureCommit(c.sha, rec.build.dist, CAPTURES_DIR, {
            track,
            // Stills need 4 s of simulation either way; without a clip we still
            // step the same ticks but keep only three frames. Simplest: capture
            // the clip at a lower cost only when wanted.
            seconds: 4,
            fps: wantClip ? 30 : 30,
            keepFrames: false,
          });
          rec.capture = {
            status: cap.status,
            reason: cap.reason,
            track: cap.track,
            stills: cap.stills,
            clip: wantClip ? cap.clip : undefined,
            clipFrames: cap.clipFrames,
            wallMs: cap.wallMs,
            notes: cap.notes.slice(0, 20),
          };
        } catch (err) {
          const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
          rec.capture = { status: 'failed', reason };
          log(`capture ${c.short}: threw ${reason}`);
        }
      } else if (rec.build.status === 'skipped') {
        rec.capture = { status: 'skipped', reason: rec.build.reason };
      }
      upsertRecord(ledger, rec);
      writeLedger(ledger);
    }
    // Keep index/subject/date current for commits already in the ledger.
    for (const c of history) {
      const rec = ledger.commits.find((r) => r.sha === c.sha);
      if (rec) Object.assign(rec, { index: c.index, subject: c.subject, date: c.date, short: c.short });
    }
    writeLedger(ledger);
    log(`timelapse: build/capture phase done in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
  }

  if (!noRender) {
    const rep = await render({ milestones });
    console.log(JSON.stringify(rep, null, 2));
  }
  log(`timelapse: done in ${((performance.now() - t0) / 60000).toFixed(1)} min`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
