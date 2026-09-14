/**
 * Render the timelapse videos from the ledger (`harness/out/timelapse/commits.json`):
 *
 *   progress-stills.mp4  one 2.0 s still per commit, 1.2 s each, 0.3 s crossfade,
 *                        caption bar + counter, intro/outro cards; 1280x720 @ 30 fps
 *   progress-clips.mp4   the 4 s clip of each MILESTONE commit, captioned, hard cuts
 *   progress.gif         the stills timelapse at 640 px / 12 fps, <= 15 MB
 *
 *   npx tsx harness/timelapse/render.mts [--milestones a,b,c] [--out harness/out/timelapse]
 */
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG, OUT_DIR, PYTHON, TIMELAPSE_DIR, ffmpeg, fmtDate, log, probeDuration, readLedger, run, truncate, type CommitRecord } from './lib.mjs';

const OVERLAY = path.join(TIMELAPSE_DIR, 'overlay.py');

/**
 * Default milestone set (short shas, first-parent history). Chosen from
 * `git log --format='%h %s'`: scaffold, first physics, first full render,
 * the render/physics rounds that changed how it looks or feels, the hall,
 * the hero asset, the glTF assets, biomes, the front end, and the latest
 * commit (always appended). `--milestones` overrides the list.
 */
export const DEFAULT_MILESTONES = [
  '7990f05', // Phase 0: scaffold, mock physics, first headless render
  '4eb0b12', // Physics: deterministic bike+rider sim, wheelie balance point
  'f65e091', // Render: full pipeline lands; industrial warehouse
  'a7f868c', // Render: real blacks, per-object colour, full-gear rider
  'd2279b9', // Render: the industrial world is constructed, not painted
  'ea32412', // Physics: 60 deg sustains, b1 clears naive
  'c380097', // Render: hall reads as a volume
  '16a31f2', // Physics: 1.4 g, suspension returns, ragdoll from the drawn chain
  '5c3c343', // Render: hero asset rebuilt, real trials-bike layout
  '2fd0a62', // Assets: Blender-built rider and bike as meshopt glTF
  'ffb6ddd', // Render: four biomes read as places
  'bbfc7a9', // Game: console-style front end
];

export interface RenderOptions {
  outDir?: string | undefined;
  milestones?: string[] | undefined;
  width?: number | undefined;
  height?: number | undefined;
  fps?: number | undefined;
  gifMaxBytes?: number | undefined;
}

export interface RenderReport {
  stills?: { file: string; seconds: number; bytes: number; commits: number };
  clips?: { file: string; seconds: number; bytes: number; commits: string[] };
  gif?: { file: string; seconds: number; bytes: number; fps: number; colors: number };
  skipped: { sha: string; short: string; reason: string }[];
}

function stillFor(c: CommitRecord): string | null {
  const s = c.capture?.stills;
  if (!s) return null;
  const f = s['2.0'] ?? s['4.0'] ?? s['0.5'] ?? Object.values(s)[0];
  return f && fs.existsSync(f) ? f : null;
}

async function py(args: string[]): Promise<string> {
  const r = await run(PYTHON, [OVERLAY, ...args], { timeoutMs: 1_800_000 });
  if (r.code !== 0) throw new Error(`overlay.py ${args[0]} failed: ${r.stderr.slice(-1500)}`);
  return r.stdout;
}

export async function render(o: RenderOptions = {}): Promise<RenderReport> {
  const outDir = o.outDir ?? OUT_DIR;
  const width = o.width ?? 1280;
  const height = o.height ?? 720;
  const fps = o.fps ?? 30;
  const work = path.join(outDir, 'render');
  fs.mkdirSync(work, { recursive: true });
  const ledger = readLedger();
  const all = ledger.commits;
  const report: RenderReport = { skipped: [] };
  if (all.length === 0) {
    log('render: ledger is empty, nothing to do');
    return report;
  }

  // ---- (a) stills -------------------------------------------------------
  const withStill = all.filter((c) => stillFor(c) !== null);
  for (const c of all) {
    if (!stillFor(c)) report.skipped.push({ sha: c.sha, short: c.short, reason: c.build.status === 'skipped' ? `build skipped: ${c.build.reason}` : c.build.status === 'failed' ? 'build failed' : c.capture?.reason ?? 'no still' });
  }
  const first = all[0]!;
  const last = all[all.length - 1]!;
  const manifest = {
    width,
    height,
    fps,
    total: all.length,
    holdSeconds: 1.2,
    crossfadeSeconds: 0.3,
    introSeconds: 2.5,
    outroSeconds: 3.0,
    lastHoldSeconds: 3.0,
    ffmpeg: FFMPEG,
    intro: {
      title: 'TRIALS GAUNTLET',
      lines: [`build timelapse · ${all.length} commits`, `${fmtDate(first.date)}  →  ${fmtDate(last.date)}`, `${withStill.length} builds captured on b1-first-ride, full gas from t=0`],
      footer: 'harness/timelapse · headless SwiftShader capture, 2.0 s into the run',
    },
    outro: {
      title: `${all.length} commits`,
      lines: [`${fmtDate(first.date)}  →  ${fmtDate(last.date)}`, `latest: ${last.short} · ${truncate(last.subject, 70)}`, report.skipped.length ? `${report.skipped.length} commit(s) not built/captured: ${report.skipped.map((s) => s.short).join(', ')}` : 'every commit built and captured'],
      footer: 'npx tsx harness/timelapse/index.mts',
    },
    commits: withStill.map((c) => ({
      index: c.index,
      sha: c.short,
      date: fmtDate(c.date),
      subject: truncate(c.subject, 90),
      still: stillFor(c),
    })),
  };
  const manifestFile = path.join(work, 'stills-manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const stillsMp4 = path.join(outDir, 'progress-stills.mp4');
  log(`render: progress-stills.mp4 from ${withStill.length} stills`);
  await py(['stills', '--manifest', manifestFile, '--out', stillsMp4]);
  report.stills = { file: stillsMp4, seconds: await probeDuration(stillsMp4), bytes: fs.statSync(stillsMp4).size, commits: withStill.length };
  log(`render: stills ${report.stills.seconds.toFixed(1)} s, ${(report.stills.bytes / 1e6).toFixed(1)} MB`);

  // ---- (b) milestone clips ---------------------------------------------
  const wantedShort = (o.milestones && o.milestones.length ? o.milestones : DEFAULT_MILESTONES).map((s) => s.trim()).filter(Boolean);
  const bySha = (s: string): CommitRecord | undefined => all.find((c) => c.sha.startsWith(s) || c.short === s);
  const picked: CommitRecord[] = [];
  for (const s of wantedShort) {
    const c = bySha(s);
    if (c && !picked.includes(c)) picked.push(c);
    else if (!c) log(`render: milestone ${s} not in ledger, skipped`);
  }
  if (!picked.includes(last)) picked.push(last);
  picked.sort((a, b) => a.index - b.index);
  const clipParts: string[] = [];
  const clipCommits: string[] = [];
  // Keep the total under 60 s: 4 s per clip + 2 s intro card.
  const maxClips = Math.floor((60 - 2) / 4);
  const chosen = picked.length > maxClips ? [...picked.slice(0, maxClips - 1), last] : picked;
  const introCard = path.join(work, 'clips-intro.png');
  await py(['card', '--out', introCard, '--width', String(width), '--height', String(height), '--title', 'TRIALS GAUNTLET', '--lines', `milestones · ${chosen.length} of ${all.length} commits`, `${fmtDate(first.date)}  →  ${fmtDate(last.date)}`, '--footer', '4 s per build, full gas from t=0, b1-first-ride']);
  const introMp4 = path.join(work, 'clips-intro.mp4');
  await ffmpeg(['-loop', '1', '-framerate', String(fps), '-t', '2', '-i', introCard, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', `scale=${width}:${height},format=yuv420p`, introMp4]);
  clipParts.push(introMp4);
  for (const c of chosen) {
    const clip = c.capture?.clip;
    if (!clip || !fs.existsSync(clip)) {
      log(`render: milestone ${c.short} has no clip (${c.capture?.reason ?? c.build.reason ?? 'unknown'}), using its still`);
    }
    const cap = path.join(work, `caption-${c.short}.png`);
    await py(['caption', '--out', cap, '--width', String(width), '--height', String(height), '--index', String(c.index), '--total', String(all.length), '--sha', c.short, '--date', fmtDate(c.date), '--subject', truncate(c.subject, 90)]);
    const part = path.join(work, `clip-${String(c.index).padStart(2, '0')}-${c.short}.mp4`);
    if (clip && fs.existsSync(clip)) {
      await ffmpeg(['-i', clip, '-i', cap, '-filter_complex', `[0:v]scale=${width}:${height},fps=${fps}[v];[v][1:v]overlay=0:0:format=auto,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', part]);
    } else {
      const still = stillFor(c);
      if (!still) continue;
      await ffmpeg(['-loop', '1', '-framerate', String(fps), '-t', '4', '-i', still, '-i', cap, '-filter_complex', `[0:v]scale=${width}:${height}[v];[v][1:v]overlay=0:0:format=auto,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', part]);
    }
    clipParts.push(part);
    clipCommits.push(c.short);
  }
  const concatList = path.join(work, 'clips-concat.txt');
  fs.writeFileSync(concatList, clipParts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const clipsMp4 = path.join(outDir, 'progress-clips.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concatList, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', clipsMp4]);
  report.clips = { file: clipsMp4, seconds: await probeDuration(clipsMp4), bytes: fs.statSync(clipsMp4).size, commits: clipCommits };
  log(`render: clips ${report.clips.seconds.toFixed(1)} s, ${(report.clips.bytes / 1e6).toFixed(1)} MB, ${clipCommits.length} milestones`);

  // ---- (c) gif -----------------------------------------------------------
  const gif = path.join(outDir, 'progress.gif');
  const maxBytes = o.gifMaxBytes ?? 15 * 1024 * 1024;
  const attempts: { fps: number; colors: number; width: number }[] = [
    { fps: 12, colors: 128, width: 640 },
    { fps: 12, colors: 96, width: 640 },
    { fps: 10, colors: 64, width: 640 },
    { fps: 8, colors: 64, width: 560 },
    { fps: 8, colors: 48, width: 480 },
  ];
  for (const a of attempts) {
    await ffmpeg([
      '-i', stillsMp4,
      '-filter_complex',
      `[0:v]fps=${a.fps},scale=${a.width}:-2:flags=lanczos,split[x][y];[x]palettegen=max_colors=${a.colors}:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0',
      gif,
    ]);
    const bytes = fs.statSync(gif).size;
    log(`render: gif ${a.width}px ${a.fps} fps ${a.colors} colours -> ${(bytes / 1e6).toFixed(1)} MB`);
    report.gif = { file: gif, seconds: await probeDuration(gif), bytes, fps: a.fps, colors: a.colors };
    if (bytes <= maxBytes) break;
  }

  fs.writeFileSync(path.join(outDir, 'render.json'), JSON.stringify({ renderedAt: new Date().toISOString(), milestones: clipCommits, ...report }, null, 2));
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const rep = await render({ outDir: flag('out'), milestones: flag('milestones')?.split(',') });
  console.log(JSON.stringify(rep, null, 2));
}
