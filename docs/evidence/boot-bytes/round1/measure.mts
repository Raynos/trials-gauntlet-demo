/**
 * Ask 59 items 2, 3, 5 — what a FIRST load actually costs, per device geometry.
 *
 *   npx tsx docs/evidence/boot-bytes/round1/measure.mts [--verbose]
 *
 * Wire bytes are counted in the SERVER, never in the page: the offline pack is fetched from inside the
 * service worker, whose requests belong to the worker target and never reach a page-level CDP session
 * (harness/e2e/offline.mts learnt this the hard way — a page-side counter reports a flattering 0).
 * Every run starts from a fresh persistent profile, so it is a first load with an empty Cache Storage.
 *
 * "Before" is measured, not modelled: after the page has finished, the script asks the SAME counting
 * server for the exact files the old build also pulled — both world-map tiers where this one takes one,
 * every art variant where this one takes the device's, and og.jpg — and adds those bytes. They are the
 * same responses off the same server, so `before = after + extras` is a real byte count, not an estimate.
 *
 * The DOWNLOAD denominator is computed from the build's own byte table (`src/boot/plan.generated.ts`)
 * under both rules, which is exactly what the loader shows: core + hero models + boot art + offline pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { OFFLINE_PACK_BYTES, PUBLIC_BYTES } from '../../../../src/boot/plan.generated';
import { BOOT_IDS } from '../../../../src/render/art/boot-set';
import { HERO_FILE_SET } from '../../../../src/boot/asset-totals';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs/evidence/boot-bytes/round1');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BOOT_CAP_MS = 300_000;

const GEOMETRIES = [
  { id: 'phone-932x430-dpr2', viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, tier: '2x' as const },
  { id: 'desktop-1280x720-dpr1', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, tier: '1x' as const },
];

const table = PUBLIC_BYTES as Readonly<Record<string, number>>;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/art/manifest.json'), 'utf8')) as { assets: { id: string; path: string; kind?: string; variant?: string; v?: string }[] };
const bootSet = new Set<string>(BOOT_IDS);

/** The old rule: every art asset outside the boot set (og.jpg and both variants of every pair) + both plate tiers. */
function offlinePackBefore(): number {
  let n = 0;
  for (const [key, bytes] of Object.entries(table)) {
    if (key.startsWith('art:')) {
      if (!bootSet.has(key.slice(4))) n += bytes;
    } else if (key.startsWith('art/worldmap/')) n += bytes;
  }
  return n;
}

/** core bytes: the inline loader's own compiled-in list, read back out of the built index.html. */
function coreBytes(): number {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const m = /var \w+=(\[\[".\/assets.*?\]\]);/.exec(html);
  if (!m) throw new Error('measure: could not read __BOOT_CORE__ out of dist/index.html');
  return (JSON.parse(m[1]!) as [string, number][]).reduce((n, [, b]) => n + b, 0);
}

const heroBytes = HERO_FILE_SET.reduce((n, f) => n + table[f]!, 0);
const bootArtBytes = BOOT_IDS.reduce((n, id) => n + table[`art:${id}`]!, 0);
const core = coreBytes();
const denominator = (tier: '1x' | '2x', when: 'before' | 'after'): number => core + heroBytes + bootArtBytes + (when === 'after' ? OFFLINE_PACK_BYTES[tier] : offlinePackBefore());

/** The URLs the old build fetched and this one does not, for a device on `tier`. */
function droppedUrls(tier: '1x' | '2x'): string[] {
  const out: string[] = [];
  for (const a of manifest.assets) {
    if (bootSet.has(a.id)) continue;
    const v = a.v ? `?v=${a.v}` : '';
    if (a.kind === 'social') out.push(a.path + v); // og.jpg
    else if (a.variant && a.variant !== tier) out.push(a.path + v); // the tier this device does not draw
  }
  const px = tier === '2x' ? 1024 : 1536;
  for (const f of fs.readdirSync(path.join(ROOT, 'public/art/worldmap')).sort()) if (f.includes(`-${px}.webp`)) out.push(`art/worldmap/${f}`);
  return out;
}

class CountingServer {
  bytes = 0;
  requests = 0;
  byUrl: Record<string, number> = {};
  private server: PreviewServer | null = null;
  reset(): void {
    this.bytes = 0;
    this.requests = 0;
    this.byUrl = {};
  }
  async start(): Promise<string> {
    this.server = await preview({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: DIST },
      preview: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'boot-bytes:count',
          configurePreviewServer: (server) => {
            server.middlewares.use((req, res, next) => {
              const url = (req.url ?? '').split('?')[0] ?? '';
              let n = 0;
              const write = res.write.bind(res);
              const end = res.end.bind(res);
              res.write = ((chunk: unknown, ...rest: unknown[]) => {
                if (chunk) n += Buffer.byteLength(chunk as Buffer | string);
                return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
              }) as typeof res.write;
              res.end = ((chunk: unknown, ...rest: unknown[]) => {
                if (chunk && typeof chunk !== 'function') n += Buffer.byteLength(chunk as Buffer | string);
                this.requests++;
                this.bytes += n;
                this.byUrl[url] = (this.byUrl[url] ?? 0) + n;
                return (end as (...a: unknown[]) => unknown)(chunk, ...rest) as ReturnType<typeof res.end>;
              }) as typeof res.end;
              next();
            });
          },
        },
      ],
    });
    const u = (this.server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
    if (!u) throw new Error('measure: vite preview gave no local url');
    return u;
  }
  async stop(): Promise<void> {
    const h = this.server?.httpServer;
    this.server = null;
    if (h) await new Promise<void>((r) => h.close(() => r()));
  }
}

async function run(): Promise<void> {
  const verbose = process.argv.includes('--verbose');
  const server = new CountingServer();
  const url = (await server.start()) + '/';
  const rows: Record<string, unknown>[] = [];
  try {
    for (const g of GEOMETRIES) {
      const profile = path.join(ROOT, 'harness/out/.boot-bytes-profile', g.id);
      fs.rmSync(profile, { recursive: true, force: true });
      fs.mkdirSync(profile, { recursive: true });
      server.reset();
      const ctx = await chromium.launchPersistentContext(profile, { headless: true, args: ARGS, viewport: g.viewport, deviceScaleFactor: g.deviceScaleFactor, isMobile: g.isMobile, hasTouch: g.hasTouch });
      const page = await ctx.newPage();
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'commit' });
      let leaveMs = -1;
      let last = { d: 0, s: 0, done: false };
      while (Date.now() - t0 < BOOT_CAP_MS) {
        const s = await page
          .evaluate(() => {
            const l = document.getElementById('loader');
            return l ? { d: Number(l.dataset['download']), s: Number(l.dataset['setup']), done: l.dataset['done'] === '1' } : null;
          })
          .catch(() => last);
        if (s === null) {
          leaveMs = Date.now() - t0;
          break;
        }
        last = s;
        await page.waitForTimeout(100);
      }
      // The pack is pulled by the worker; give it a beat past the loader leaving.
      await page.waitForTimeout(4000);
      const tier = await page.evaluate(() => ((window.devicePixelRatio > 1.5 || window.innerWidth > 1400) ? '2x' : '1x'));
      const after = server.bytes;
      const afterByUrl = { ...server.byUrl };

      // The files the old build also pulled, off the same server: measured, not modelled.
      server.reset();
      const dropped = droppedUrls(g.tier);
      const extras = await page.evaluate(async (list: string[]) => {
        let n = 0;
        for (const u of list) {
          const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'bootbytes=1', { cache: 'no-store' });
          n += (await r.arrayBuffer()).byteLength;
        }
        return n;
      }, dropped);
      const extraWire = server.bytes;
      await ctx.close();

      const row = {
        geometry: g.id,
        viewport: `${g.viewport.width}x${g.viewport.height}`,
        dpr: g.deviceScaleFactor,
        tierPickedInPage: tier,
        bootMs: leaveMs,
        loaderDownload: last.d,
        wireBytesAfter: after,
        droppedFiles: dropped.length,
        droppedBytes: extraWire,
        droppedBodyBytes: extras,
        wireBytesBefore: after + extraWire,
        savedBytes: extraWire,
        denominatorBefore: denominator(g.tier, 'before'),
        denominatorAfter: denominator(g.tier, 'after'),
        ...(verbose ? { byUrl: afterByUrl, dropped } : {}),
      };
      if (tier !== g.tier) throw new Error(`measure: ${g.id} picked ${tier}, expected ${g.tier}`);
      rows.push(row);
      console.log(
        `${g.id.padEnd(24)} wire ${(row.wireBytesBefore / 1e6).toFixed(2)} MB → ${(row.wireBytesAfter / 1e6).toFixed(2)} MB  (−${(row.savedBytes / 1e6).toFixed(2)} MB, ${row.droppedFiles} files)   DOWNLOAD ${(row.denominatorBefore / 1e6).toFixed(2)} MB → ${(row.denominatorAfter / 1e6).toFixed(2)} MB   boot ${row.bootMs} ms`,
      );
    }
  } finally {
    await server.stop();
  }
  const out = { at: new Date().toISOString(), build: fs.existsSync(path.join(DIST, 'sw.js')) ? /const BUILD = '([^']+)'/.exec(fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8'))?.[1] : null, rows };
  fs.writeFileSync(path.join(OUT, 'boot-bytes.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\nwrote ${path.relative(ROOT, path.join(OUT, 'boot-bytes.json'))}`);
}

void run();
