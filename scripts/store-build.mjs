#!/usr/bin/env node
// Builds the store bundle into the Capacitor webDir and syncs both shells (docs/plans/STORE_RELEASE.md Phase 5).
//
//   node scripts/store-build.mjs release [--ios] [--android] [--from-tree]
//   node scripts/store-build.mjs debug   [--ios] [--android] [--gate a.json,b.json] [--crash c.json] [--from-tree]
//
// The bundle is built from a clean export of the committed HEAD (`git archive` of what the build reads, into
// /tmp/rockhop-build-<sha>, node_modules linked), never from the working tree: the one shared checkout carries other
// builders' uncommitted edits (physics, UI), and a store build or a gate/screenshot run must be a commit. The source
// is written to store/build/SOURCE and every evidence run names it. `--from-tree` builds the working tree instead
// (local iteration only; SOURCE says so).
//
// release  VITE_STORE=1 → store/build/web, refused if the automation hook survived; then `cap sync`.
//          --android also runs `gradlew bundleRelease` (signed with the upload key when ~/.config/rockhop/
//          keystore.properties exists); --ios builds the Release configuration for the simulator as a compile check
//          (the App Store archive needs the Apple account: store/RELEASE-RECIPE.md).
// debug    VITE_STORE=1 VITE_STORE_DEBUG=1 (the automation hook + the in-app gate runner) plus the native gate's
//          recordings under gate/; --ios / --android build the simulator .app / debug .apk the harness installs.
//
// Never builds into dist/: that is the web build's output and other builders rebuild it at any time.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0];
if (mode !== 'release' && mode !== 'debug') {
  console.error('usage: node scripts/store-build.mjs <release|debug> [--ios] [--android] [--gate a.json,b.json] [--crash c.json]');
  process.exit(2);
}
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const WEB_DIR = join(repo, 'store', 'build', 'web');
const run = (cmd, a, env = {}, cwd = repo) => execFileSync(cmd, a, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

// 0. The source: HEAD, exported clean (only what the build and the gate read), unless --from-tree.
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const fromTree = flag('from-tree');
let src = repo;
if (!fromTree) {
  src = `/tmp/rockhop-build-${sha}`;
  if (!existsSync(join(src, '.complete'))) {
    rmSync(src, { recursive: true, force: true });
    mkdirSync(src, { recursive: true });
    const tar = execFileSync('git', ['archive', '--format=tar', sha, '--', 'src', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'harness/inputs'], { cwd: repo, maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', src], { input: tar, maxBuffer: 1 << 30 });
    symlinkSync(join(repo, 'node_modules'), join(src, 'node_modules'), 'dir');
    writeFileSync(join(src, '.complete'), `${sha}\n`);
  }
}
const source = fromTree ? `working tree on ${sha} (uncommitted edits included)` : sha;
console.info(`store-build: ${mode} bundle from ${fromTree ? 'the WORKING TREE' : `HEAD ${sha.slice(0, 10)} (clean export ${src})`}`);

// 1. The bundle. Outside a git checkout vite.config.ts stamps the build from VERCEL_GIT_COMMIT_SHA.
const env = { VITE_STORE: '1', VERCEL_GIT_COMMIT_SHA: sha, ...(mode === 'debug' ? { VITE_STORE_DEBUG: '1' } : { VITE_STORE_DEBUG: '' }) };
run(join(repo, 'node_modules', '.bin', 'vite'), ['build', '--outDir', WEB_DIR, '--emptyOutDir', '--logLevel', 'warn'], env, src);

// 2. A release must be a release: no automation hook, no gate runner, no source maps next to the page.
const texts = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) texts.push([p, readFileSync(p, 'utf8')]);
  }
};
walk(WEB_DIR);
const hookIn = texts.filter(([, t]) => /window\.__(?:trials|rockhop)\s*=|__rockhopGate/.test(t)).map(([p]) => relative(repo, p));
if (mode === 'release' && hookIn.length) throw new Error(`store-build: release bundle still carries the automation hook / gate: ${hookIn.join(', ')}`);
if (mode === 'debug' && !hookIn.length) throw new Error('store-build: debug bundle has no automation hook (VITE_STORE_DEBUG did not reach the build)');
if (texts.some(([p]) => p.endsWith('.map'))) throw new Error('store-build: a source map landed in the webDir');

// 3. Debug: the gate's recordings, served from the app bundle itself (no network in the app). Every golden
//    (`bot-3*.json`) and crash recording under harness/inputs goes in (~0.5 MB, debug builds only), so the
//    screenshot pipeline (harness/native/screens.ts) can ride any track; `clear`/`crash` name the gate's own set.
if (mode === 'debug') {
  const clear = (opt('gate') ?? 'harness/inputs/flat-test/bot-3.json,harness/inputs/b1-first-ride/bot-3.json').split(',').filter(Boolean);
  const crash = opt('crash') ?? 'harness/inputs/flat-test/crash.json';
  const gateDir = join(WEB_DIR, 'gate');
  mkdirSync(gateDir, { recursive: true });
  const name = (f) => `${basename(dirname(f))}.${basename(f)}`;
  const inputs = join(src, 'harness', 'inputs');
  const all = readdirSync(inputs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(inputs, d.name)).filter((f) => /^(bot-3(-pro)?|crash)\.json$/.test(f)).map((f) => `harness/inputs/${d.name}/${f}`));
  for (const f of new Set([...all, ...clear, crash])) {
    if (!existsSync(join(src, f))) throw new Error(`store-build: gate recording ${f} missing at ${fromTree ? 'the working tree' : sha}`);
    cpSync(join(src, f), join(gateDir, name(f)));
  }
  writeFileSync(join(gateDir, 'manifest.json'), `${JSON.stringify({ clear: clear.map((f) => `gate/${name(f)}`), crash: `gate/${name(crash)}`, sources: [...clear, crash], all: all.map((f) => `gate/${name(f)}`) }, null, 1)}\n`);
}
writeFileSync(join(repo, 'store', 'build', 'MODE'), `${mode}\n`);
writeFileSync(join(repo, 'store', 'build', 'SOURCE'), `${source}\n`);

// 4. Both shells.
run(join(repo, 'node_modules', '.bin', 'cap'), ['sync']);

// 5. Native builds on request.
const JAVA_HOME = process.env.JAVA_HOME ?? '/Users/raynos/Library/Java/JavaVirtualMachines/jdk-21.0.12.1+1/Contents/Home';
const ANDROID_HOME = process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'Library', 'Android', 'sdk');
if (flag('android')) {
  run('./gradlew', [mode === 'release' ? 'bundleRelease' : 'assembleDebug', '--no-daemon', '-q'], { JAVA_HOME, ANDROID_HOME }, join(repo, 'android'));
  console.info(`store-build: ${mode === 'release' ? 'android/app/build/outputs/bundle/release/app-release.aab' : 'android/app/build/outputs/apk/debug/app-debug.apk'}`);
}
if (flag('ios')) {
  const dd = join(repo, 'store', 'build', 'ios-derived');
  run('xcodebuild', ['-project', 'App.xcodeproj', '-scheme', 'App', '-configuration', mode === 'release' ? 'Release' : 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', dd, 'build', 'CODE_SIGNING_ALLOWED=NO', '-quiet'], {}, join(repo, 'ios', 'App'));
  console.info(`store-build: ${relative(repo, join(dd, 'Build', 'Products', `${mode === 'release' ? 'Release' : 'Debug'}-iphonesimulator`, 'App.app'))}`);
}
console.info(`store-build: ${mode} bundle in ${relative(repo, WEB_DIR)}, shells synced`);
