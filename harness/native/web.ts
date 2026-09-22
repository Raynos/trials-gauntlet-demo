/**
 * The native gate's web leg: the same store debug bundle (store/build/web) in headless Chromium, the same in-app
 * runner (src/platform/gate.ts), armed the way the shells arm it — so bar 3 compares like with like.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { launchBrowser } from '../lib/browser';
import { armFor, freshOutDir, OUT, readManifest, until, WEB_DIR, type GateArm, type GateMessages, type PlatformRun } from './lib';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.ktx2': 'image/ktx2' };

/** A plain static server over the webDir (what the shells' asset handlers do: files, no rewrites). */
export function serveWebDir(): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    let file = path.join(WEB_DIR, decodeURIComponent(u.pathname));
    if (!file.startsWith(WEB_DIR)) return void res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** The document-start script the shells inject (ios RockhopViewController.swift / android MainActivity.java), for Chromium. */
function armScript(arm: GateArm & { platform: 'web' }): void {
  let made = 0;
  for (const k of ['AudioContext', 'webkitAudioContext'] as const) {
    const w = window as unknown as Record<string, unknown>;
    const C = w[k];
    if (typeof C !== 'function') continue;
    w[k] = new Proxy(C as new (...a: unknown[]) => object, {
      construct(t, a) {
        made += 1;
        return Reflect.construct(t, a) as object;
      },
    });
  }
  const g = window as unknown as Record<string, unknown>;
  g['__rockhopAudioContexts'] = () => made;
  g['__rockhopGate'] = arm;
  g['__rockhopGatePost'] = (m: unknown) => (g['__rockhopGateSink'] as (s: string) => void)(JSON.stringify(m));
}

export async function runWeb(opts: { paced?: boolean; width?: number; height?: number } = {}): Promise<PlatformRun> {
  const t0 = Date.now();
  const manifest = readManifest();
  const arm = { ...armFor(manifest, { paced: opts.paced === false ? -1 : 0 }), platform: 'web' as const };
  const server = await serveWebDir();
  const launched = await launchBrowser({ width: opts.width ?? 1280, height: opts.height ?? 720 });
  const messages: GateMessages = {};
  const notes: string[] = [`renderer ${launched.probe.renderer}`];
  const outDir = freshOutDir(path.join(OUT, 'web'));
  try {
    const page = launched.page;
    page.on('pageerror', (e) => notes.push(`pageerror: ${e.message}`));
    await page.exposeFunction('__rockhopGateSink', (s: string) => {
      const m = JSON.parse(s) as GateMessages[string];
      messages[m.name] = m;
      fs.writeFileSync(path.join(outDir, `${m.name}.json`), `${JSON.stringify(m, null, 1)}\n`);
    });
    await page.addInitScript(armScript, arm);
    await page.goto(server.url);
    await until('web gate done', () => messages['done'] ?? messages['error'], 20 * 60_000, 500);
  } finally {
    await launched.close();
    await server.close();
  }
  return { platform: 'web', device: `headless Chromium (${launched.flagSet})`, ok: !messages['error'] && !!messages['result'], messages, clip: null, wallS: Math.round((Date.now() - t0) / 1000), notes };
}
