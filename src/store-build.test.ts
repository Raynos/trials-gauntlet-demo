/**
 * The store build flag (docs/plans/STORE_RELEASE.md P0.3): `VITE_STORE=1 vite build` compiles every dev surface
 * out of the bundle, and the web build keeps each one. Both builds run here (≈ 2 s each) into temp dirs, and
 * every feature is checked by a marker that is present in the web build — so an absence in the store build
 * is a removal, never a marker that simply went stale.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = process.cwd();
const vite = path.join(root, 'node_modules', '.bin', 'vite');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-build-'));

interface Built {
  dir: string;
  files: string[];
  /** Every text file of the build (JS, HTML, JSON, CSS, webmanifest), concatenated. */
  text: string;
}

function build(name: string, env: Record<string, string>): Built {
  const dir = path.join(tmp, name);
  execFileSync(vite, ['build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' });
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(path.relative(dir, p));
    }
  };
  walk(dir);
  const text = files
    .filter((f) => /\.(js|html|json|css|webmanifest)$/.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  return { dir, files, text };
}

let web: Built;
let store: Built;

beforeAll(() => {
  const { VITE_STORE: _s, VITE_STORE_DEBUG: _d, ...clean } = process.env;
  web = build('web', clean as Record<string, string>);
  store = build('store', { VITE_STORE: '1' });
}, 120_000);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Feature → markers: literal strings from the feature's own code, each present in the web build. */
const FEATURES: Record<string, (string | RegExp)[]> = {
  'review inbox + /api/inbox calls': ['/api/inbox', /\.\/inbox-[\w-]+\.js/],
  'telemetry (the run log and its export)': ['Keeps attempts, faults and crash spots on this device only', 'Export run log'],
  'on-device bench': ['bench/b1-bot-3.json', 'bench-copy'],
  'Labs tracks': ['Container Step', 'Timber Launch', 'Physics Test', 'Flat 200'],
  'model dev switch (procedural / modelled)': ['Applies on the next track load'],
  '?-param dev modes (the page never reads its query string)': ['location.search', 'touchdebug', 'harness=1'],
  'service worker': ['./sw.js'],
  'update pill + version probe': ['version.json'],
  'window.__trials automation hook': [/window\.__trials\s*=/],
  'level reviewer tile': [/id:\s*"review",\s*label:\s*"Review"/],
};

const has = (text: string, m: string | RegExp): boolean => (typeof m === 'string' ? text.includes(m) : m.test(text));

describe('store build (VITE_STORE=1) compiles out every dev surface', () => {
  for (const [feature, markers] of Object.entries(FEATURES)) {
    it(`${feature}: in the web build, absent from the store build`, () => {
      for (const m of markers) expect(has(web.text, m), `web build lost marker ${String(m)} — update the marker`).toBe(true);
      for (const m of markers) expect(has(store.text, m), `store build still contains ${String(m)}`).toBe(false);
    });
  }

  it('ships no service worker, version probe, bench golden or inbox chunk file', () => {
    for (const f of ['sw.js', 'version.json', 'bench/b1-bot-3.json']) {
      expect(web.files).toContain(f);
      expect(store.files).not.toContain(f);
    }
    expect(web.files.some((f) => /^assets\/inbox-/.test(f))).toBe(true);
    expect(store.files.some((f) => /^assets\/inbox-/.test(f))).toBe(false);
  });

  it('no build deploys a source map (moved to <outDir>-maps) or points at one', () => {
    for (const b of [web, store]) {
      expect(b.files.filter((f) => f.endsWith('.map'))).toEqual([]);
      expect(b.text).not.toContain('sourceMappingURL');
      expect(fs.readdirSync(path.join(`${b.dir}-maps`, 'assets')).some((f) => f.endsWith('.js.map'))).toBe(true);
    }
  });

  it('neither build credits the source games, nor ships the art prompts', () => {
    for (const b of [web, store]) {
      expect(b.text).not.toMatch(/Trials Evolution|Trials Rising/);
      const art = JSON.parse(fs.readFileSync(path.join(b.dir, 'art', 'manifest.json'), 'utf8')) as { assets: Record<string, unknown>[] };
      expect(art.assets.length).toBeGreaterThan(100);
      expect(art.assets.filter((a) => 'prompt' in a || 'src' in a)).toEqual([]);
      expect(art.assets.map((a) => a['id'])).not.toContain('graffiti-nofear');
    }
  });
});
