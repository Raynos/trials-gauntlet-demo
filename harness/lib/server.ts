/**
 * Serves the game for the harness. Default: `vite preview` over `dist/`
 * (auto-building when missing or `--build`). `--dev` uses the Vite dev server
 * instead for fast iteration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { DIST_DIR, REPO_ROOT } from './paths';

export interface GameServer {
  url: string;
  mode: 'preview' | 'dev';
  close(): Promise<void>;
}

export interface ServerOptions {
  dev?: boolean;
  forceBuild?: boolean;
  /**
   * Serve a frozen copy of dist/ so a rebuild by another builder mid-run
   * (one shared checkout) cannot change the page under a long gate.
   */
  freeze?: boolean;
}

/** Newest mtime under src/ vs dist/index.html: true when dist predates a source edit. */
export function distIsStale(): { stale: boolean; distMtime: number; srcMtime: number } {
  const indexPath = path.join(DIST_DIR, 'index.html');
  const distMtime = fs.existsSync(indexPath) ? fs.statSync(indexPath).mtimeMs : 0;
  let srcMtime = 0;
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else srcMtime = Math.max(srcMtime, fs.statSync(p).mtimeMs);
    }
  };
  const src = path.join(REPO_ROOT, 'src');
  if (fs.existsSync(src)) walk(src);
  return { stale: distMtime < srcMtime, distMtime, srcMtime };
}

export async function startServer(options: ServerOptions = {}): Promise<GameServer> {
  const common = { root: REPO_ROOT, configFile: path.join(REPO_ROOT, 'vite.config.ts'), logLevel: 'warn' as const };
  if (options.dev) {
    const server: ViteDevServer = await createServer({ ...common, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error('vite dev: no local url');
    return { url, mode: 'dev', close: () => server.close() };
  }
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (options.forceBuild || !fs.existsSync(indexPath)) {
    await build({ ...common, logLevel: 'error' });
  }
  let outDir = DIST_DIR;
  if (options.freeze) {
    outDir = path.join(REPO_ROOT, 'harness', 'out', '.dist-frozen', String(process.pid));
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.cpSync(DIST_DIR, outDir, { recursive: true });
  }
  const server: PreviewServer = await preview({ ...common, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview: no local url');
  return {
    url,
    mode: 'preview',
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.httpServer.close((err) => {
          if (options.freeze) fs.rmSync(outDir, { recursive: true, force: true });
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
