/**
 * Pose study capture: drive flat-test at ~8 m/s, run a lean script, screenshot EVERY 60 fps
 * frame cropped around the bike, dump per-frame rider pose + hopPhase.
 *   tsx capture-poses.ts <outDir> [--dev]
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../../../harness/lib/browser';
import { HookClient, openGame } from '../../../../harness/lib/hook';
import { startServer } from '../../../../harness/lib/server';

const outDir = process.argv[2]!;
const dev = process.argv.includes('--dev');
const W = 1280, H = 720, HZ = 120, FPS = 60, TPF = HZ / FPS;

type Seg = { dur: number; lean: [number, number]; thr: number; tag: string };
// throttle 0.25 < hopThrottle 0.3 so the hop preload never triggers (pure lean study)
const LEAN: Seg[] = [
  { dur: 0.3, lean: [0, 0], thr: 0.25, tag: 'neutral' },
  { dur: 0.5, lean: [0, -1], thr: 0.25, tag: 'toBack' },
  { dur: 0.5, lean: [-1, -1], thr: 0.25, tag: 'holdBack' },
  { dur: 1.0, lean: [-1, 1], thr: 0.25, tag: 'toFwd' },
  { dur: 0.5, lean: [1, 1], thr: 0.25, tag: 'holdFwd' },
  { dur: 0.5, lean: [1, 0], thr: 0.25, tag: 'toNeutral' },
  { dur: 0.3, lean: [0, 0], thr: 0.25, tag: 'neutral' },
];
// hop preload: lean -0.6 + throttle 0.5 -> crouch ramps to 1 in 0.25 s, held to 1.5 s then recover
const CROUCH: Seg[] = [
  { dur: 0.3, lean: [0, 0], thr: 0.25, tag: 'neutral' },
  { dur: 0.1, lean: [0, -0.6], thr: 0.5, tag: 'toPre' },
  { dur: 1.0, lean: [-0.6, -0.6], thr: 0.5, tag: 'preload' },
  { dur: 0.05, lean: [-0.6, 0.6], thr: 0.5, tag: 'snap' },
  { dur: 0.8, lean: [0.0, 0.0], thr: 0.25, tag: 'recover' },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer({ dev });
  const launched = await launchBrowser({ width: W, height: H });
  try {
    const { page } = launched;
    await openGame(page, server.url);
    const hook = new HookClient(page);
    for (const [name, script] of [['lean', LEAN], ['crouch', CROUCH]] as const) {
      if (!(await hook.loadTrack('flat-test', 1))) throw new Error('no flat-test');
      await hook.resize(W, H);
      await hook.setQuality('high');
      await page.evaluate(() => window.__trials!.skipCountdown());
      // get up to speed: throttle 0.6 until ~8 m/s, then hold at 0.25 for 0.5 s
      await page.evaluate(([hz]) => {
        const t = window.__trials!;
        for (let i = 0; i < hz * 6; i++) {
          const s = t.getState();
          const v = Math.hypot(s.bike.vel.x, s.bike.vel.y);
          t.setInput({ throttle: v < 8 ? 0.6 : 0.25, brake: 0, lean: 0 });
          t.step(1);
          if (v >= 8 && i > hz * 2) break;
        }
        for (let i = 0; i < hz * 0.5; i++) { t.setInput({ throttle: 0.25, brake: 0, lean: 0 }); t.step(1); t.render(); }
      }, [HZ] as const);
      const dir = path.join(outDir, name);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const log: Record<string, unknown>[] = [];
      let k = 0;
      let tAcc = 0;
      for (const seg of script) {
        const n = Math.round(seg.dur * FPS);
        for (let i = 0; i < n; i++, k++) {
          const u = n > 1 ? i / (n - 1) : 1;
          const lean = seg.lean[0] + (seg.lean[1] - seg.lean[0]) * u;
          const res = await page.evaluate(([lean, thr, tpf]) => {
            const t = window.__trials!;
            for (let j = 0; j < tpf; j++) { t.setInput({ throttle: thr, brake: 0, lean }); t.step(1); }
            t.render();
            const s = t.getState();
            const c = t.camera();
            return { rider: s.rider, hop: s.hopPhase, speed: Math.hypot(s.bike.vel.x, s.bike.vel.y), angle: s.bike.angle, cam: c, input: s.input };
          }, [lean, seg.thr, TPF] as const);
          const file = path.join(dir, `f${String(k).padStart(4, '0')}.png`);
          await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
          log.push({ k, t: tAcc + i / FPS, tag: seg.tag, leanIn: lean, ...res });
        }
        tAcc += seg.dur;
      }
      fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log, null, 1));
      console.info(name, 'frames', k, 'bikeScreen', log[0].cam.bikeScreenX, log[0].cam.bikeScreenY, 'hFrac', log[0].cam.bikeHeightFrac);
    }
  } finally {
    await launched.close();
    await server.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
