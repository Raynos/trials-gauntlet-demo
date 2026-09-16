/**
 * Build one commit of the game from a `git archive` export (never the working
 * tree) and cache its `dist/` under `harness/out/timelapse/builds/<sha>/dist`.
 *
 *   npx tsx harness/timelapse/build-commit.mts <sha> [<outdir>] [--force]
 *
 * Exit 0 with `{status:'ok'|'skipped'}` on stdout's last line; exit 1 on a
 * build failure (stderr tail in `build.json`). Commits without `package.json`
 * or `src/` are skipped (the first two commits of this repo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { BUILDS_DIR, REPO_ROOT, SCRATCH_DIR, execFileP, log, resolveSha, run } from './lib.mjs';

export interface BuildResult {
  status: 'ok' | 'skipped' | 'failed';
  sha: string;
  dist?: string;
  reason?: string;
  wallMs: number;
  cached?: boolean;
}

/** Top-level tree entries worth exporting for a build (docs/reference/harness are not). */
const EXPORT_EXCLUDE = new Set(['reference', 'docs', 'harness', '.gitignore', 'AGENTS.md', 'CLAUDE.md', 'README.md']);

async function treeEntries(sha: string): Promise<string[]> {
  const { stdout } = await execFileP('git', ['ls-tree', '--name-only', sha], { cwd: REPO_ROOT });
  return stdout.trim().split('\n').filter(Boolean);
}

export async function buildCommit(ref: string, outdir = BUILDS_DIR, force = false): Promise<BuildResult> {
  const t0 = performance.now();
  const sha = await resolveSha(ref);
  const short = sha.slice(0, 7);
  const target = path.join(outdir, sha);
  const dist = path.join(target, 'dist');
  const buildJson = path.join(target, 'build.json');
  if (!force && fs.existsSync(path.join(dist, 'index.html'))) {
    log(`build ${short}: cached`);
    return { status: 'ok', sha, dist, wallMs: 0, cached: true };
  }
  fs.mkdirSync(target, { recursive: true });

  const entries = await treeEntries(sha);
  if (!entries.includes('package.json') || !entries.includes('src')) {
    const reason = `no ${!entries.includes('package.json') ? 'package.json' : 'src/'} at this commit`;
    log(`build ${short}: skipped (${reason})`);
    const res: BuildResult = { status: 'skipped', sha, reason, wallMs: performance.now() - t0 };
    fs.writeFileSync(buildJson, JSON.stringify(res, null, 2));
    return res;
  }

  const exportDir = path.join(SCRATCH_DIR, 'exports', short);
  fs.mkdirSync(exportDir, { recursive: true });
  const paths = entries.filter((e) => !EXPORT_EXCLUDE.has(e));
  log(`build ${short}: export ${paths.length} top-level paths -> ${exportDir}`);
  const archive = await execFileP('git', ['archive', '--format=tar', sha, '--', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    maxBuffer: 1024 << 20,
  });
  const untar = await run('tar', ['-x', '-C', exportDir], { input: archive.stdout as Buffer });
  if (untar.code !== 0) throw new Error(`tar failed: ${untar.stderr}`);
  // vite.config reads `git rev-parse --short HEAD` for the title-screen build
  // stamp; an export has no .git, so the stamp says `dev`. Give it a `.git`
  // pointer at the real repo so the stamp shows this commit's sha is NOT
  // possible without checking out — leave `dev`; the caption carries the sha.

  // A `git archive` export has no .git: since 0f14d3d `vite.config.ts` refuses a production build with no sha to
  // stamp unless `VERCEL_GIT_COMMIT_SHA` names it (the loader / menu badge). Hand it the commit being built.
  const env = { CI: 'true', NODE_ENV: 'production', VERCEL_GIT_COMMIT_SHA: sha };
  log(`build ${short}: pnpm install --offline --frozen-lockfile`);
  let install = await run('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts=false'], {
    cwd: exportDir,
    env,
    timeoutMs: 600_000,
  });
  if (install.code !== 0) {
    log(`build ${short}: offline install failed, retrying with --prefer-offline`);
    install = await run('pnpm', ['install', '--prefer-offline', '--frozen-lockfile'], { cwd: exportDir, env, timeoutMs: 900_000 });
  }
  if (install.code !== 0) {
    const reason = `pnpm install failed: ${install.stderr.slice(-800) || install.stdout.slice(-800)}`;
    log(`build ${short}: FAILED (${reason.slice(0, 200)})`);
    const res: BuildResult = { status: 'failed', sha, reason, wallMs: performance.now() - t0 };
    fs.writeFileSync(buildJson, JSON.stringify(res, null, 2));
    return res;
  }

  log(`build ${short}: pnpm build`);
  const build = await run('pnpm', ['build'], { cwd: exportDir, env, timeoutMs: 900_000 });
  const exportDist = path.join(exportDir, 'dist');
  if (build.code !== 0 || !fs.existsSync(path.join(exportDist, 'index.html'))) {
    const reason = `vite build failed (exit ${build.code}): ${build.stderr.slice(-1200) || build.stdout.slice(-1200)}`;
    log(`build ${short}: FAILED (${reason.slice(0, 200)})`);
    const res: BuildResult = { status: 'failed', sha, reason, wallMs: performance.now() - t0 };
    fs.writeFileSync(buildJson, JSON.stringify(res, null, 2));
    fs.writeFileSync(path.join(target, 'build.log'), `${build.stdout}\n${build.stderr}`);
    return res;
  }

  // Replace any previous dist atomically-ish: move old aside (never rm -r).
  if (fs.existsSync(dist)) fs.renameSync(dist, path.join(target, `dist.old-${Date.now()}`));
  fs.cpSync(exportDist, dist, { recursive: true });
  fs.writeFileSync(path.join(target, 'build.log'), `${build.stdout}\n${build.stderr}`);
  const res: BuildResult = { status: 'ok', sha, dist, wallMs: performance.now() - t0 };
  fs.writeFileSync(buildJson, JSON.stringify(res, null, 2));
  log(`build ${short}: ok in ${(res.wallMs / 1000).toFixed(0)} s`);

  // Reclaim scratch: the export (with node_modules) goes to the trash, not rm -r.
  await run('/usr/bin/trash', [exportDir]).catch(() => undefined);
  return res;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (!positional[0]) {
    console.error('usage: build-commit.mts <sha> [<outdir>] [--force]');
    process.exit(2);
  }
  const res = await buildCommit(positional[0], positional[1] ?? BUILDS_DIR, force);
  console.log(JSON.stringify(res));
  process.exit(res.status === 'failed' ? 1 : 0);
}
