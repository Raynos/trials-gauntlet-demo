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
  const server: PreviewServer = await preview({ ...common, preview: { host: '127.0.0.1', port: 0 } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview: no local url');
  return {
    url,
    mode: 'preview',
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
