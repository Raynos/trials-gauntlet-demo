/**
 * Cold-boot gate: serve the build, open headless Chromium with WebGL2, wait
 * for `window.__trials`, report boot ms / heap / renderer string.
 *
 *   pnpm harness:boot [--dev] [--build] [--json] [--runs N]
 */
import path from 'node:path';
import { flagBool, flagNum, parseArgs } from './lib/args';
import { launchBrowser } from './lib/browser';
import { HookClient, openGame } from './lib/hook';
import { ensureOut, mb, printKV, writeJson } from './lib/report';
import { startServer } from './lib/server';

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const runs = Math.max(1, flagNum(flags, 'runs', 1));
  const server = await startServer({ dev: flagBool(flags, 'dev'), forceBuild: flagBool(flags, 'build') });
  const launched = await launchBrowser({ logConsole: flagBool(flags, 'verbose') });
  try {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const page = i === 0 ? launched.page : await launched.context.newPage();
      const timing = await openGame(page, server.url);
      const hook = new HookClient(page);
      const info = await hook.info();
      // Prove the game renders: one frame, then read renderer.info.
      const renderMs = await hook.render();
      const stats = await hook.stats();
      const state = await hook.getState();
      // Restart latency: drive a short run, then time restart → first synced frame.
      const restart = await page.evaluate(() => {
        const t = window.__trials!;
        t.setInput({ throttle: 1 });
        t.step(240);
        t.render(true); // warm: first synced frame pays SwiftShader pipeline setup
        const t0 = performance.now();
        t.restart();
        const t1 = performance.now();
        t.render(true);
        const t2 = performance.now();
        return { restartMs: t1 - t0, restartToFrameMs: t2 - t0, tickAfter: t.frame() };
      });
      results.push({ timing, info, renderMs, stats, tick: state.tick, restart });
      if (i > 0) await page.close();
    }
    const first = results[0]!;
    const bootMsAll = results.map((r) => r.timing.bootMs);
    const report = {
      server: { url: server.url, mode: server.mode },
      chromium: { flagSet: launched.flagSet, version: launched.browser.version() },
      webgl: launched.probe,
      game: first.info,
      boot: {
        bootMs: Math.round(first.timing.bootMs),
        bootMsMin: Math.round(Math.min(...bootMsAll)),
        bootMsMax: Math.round(Math.max(...bootMsAll)),
        domContentLoadedMs: Math.round(first.timing.domContentLoadedMs),
        loadEventMs: Math.round(first.timing.loadEventMs),
        jsHeapUsed: first.timing.jsHeapUsed,
        jsHeapTotal: first.timing.jsHeapTotal,
      },
      firstFrame: { renderMs: first.renderMs, stats: first.stats },
      restart: first.restart,
      runs: results.length,
    };
    const outFile = path.join(ensureOut('boot'), 'boot.json');
    writeJson(outFile, report);
    if (flagBool(flags, 'json')) {
      console.log(JSON.stringify(report));
    } else {
      printKV('server', { url: server.url, mode: server.mode });
      printKV('chromium', { version: report.chromium.version, flagSet: launched.flagSet });
      printKV('webgl', {
        context: launched.probe.kind,
        renderer: launched.probe.renderer,
        vendor: launched.probe.vendor,
        version: launched.probe.version,
        maxTextureSize: launched.probe.maxTextureSize,
      });
      printKV('game', { version: first.info.version, physicsHz: first.info.physicsHz, track: first.info.trackId, seed: first.info.seed });
      printKV('boot', {
        'cold boot ms (nav → __trials.ready)': report.boot.bootMs,
        ...(runs > 1 ? { 'min/max ms': `${report.boot.bootMsMin} / ${report.boot.bootMsMax}` } : {}),
        'DOMContentLoaded ms': report.boot.domContentLoadedMs,
        'load event ms': report.boot.loadEventMs,
        'JS heap used': mb(report.boot.jsHeapUsed),
        'JS heap total': mb(report.boot.jsHeapTotal),
      });
      printKV('first frame', {
        'render ms': first.renderMs.toFixed(2),
        'draw calls': first.stats.calls,
        triangles: first.stats.triangles,
        'renderer (three)': first.stats.renderer,
        context: first.stats.contextKind,
      });
      printKV('restart', {
        'restart() ms': first.restart.restartMs.toFixed(2),
        'restart → synced frame ms': first.restart.restartToFrameMs.toFixed(2),
        'tick after restart': first.restart.tickAfter,
      });
      console.log(`report: ${outFile}`);
    }
    if (first.restart.tickAfter !== 0) process.exitCode = 1;
    if (!launched.probe.ok || launched.probe.kind !== 'webgl2') process.exitCode = 1;
  } finally {
    await launched.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
