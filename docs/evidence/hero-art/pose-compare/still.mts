/**
 * Ask 51: headless stills of the game garage at 1280×720 (Chromium / SwiftShader, built `dist/`), the same camera twice:
 * `garage-physics.png` = the rider on the physics + IK driver (`setStage(false)` forced through the render debug hook:
 * what cb9ab93 shipped) and `garage-sit-cruise.png` = the authored clip (this round). Then a contact sheet next to the
 * prototype still. Run from the repo root: npx tsx docs/evidence/hero-art/pose-compare/still.mts [--out=DIR] [--outfit=street-mustard]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer } from '../../../../harness/lib/server';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const here = path.dirname(new URL(import.meta.url).pathname);
const out = args.get('out') ?? here;
const outfit = args.get('outfit') ?? 'street-mustard';
fs.mkdirSync(out, { recursive: true });

const server = await startServer({});
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${server.url}/?sw=0&outfit=${outfit}`);
  await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
  await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 30000 });
  await page.click('.menu-screen.live .menu-item[data-id=garage]');
  await page.waitForSelector('.garage-screen.live', { timeout: 30000 });
  await page.evaluate(`(async () => { window.__trials.setQuality('high'); await window.__render.whenReady(); })()`);
  await page.waitForTimeout(1500);
  const shot = async (name: string, stage: boolean) => {
    const dbg = await page.evaluate(`(() => {
      const r = window.__render.debug.rider; r.setStage(${stage});
      // Off the stage the driver HOLDS the clip pose while the frame is frozen (the exit blend runs on simulated time);
      // the "before" still wants the bare physics pose, so the evidence script drops that blend by hand.
      if (!${stage}) r.stageBlend.active = false;
      window.__render.invalidate();
      return null; })()`);
    void dbg;
    await page.waitForTimeout(4000); // SwiftShader draws at ~3 fps: several frames so the invalidated redraw lands
    const d = await page.evaluate(`(() => { const r = window.__render.debug.rider; const d = r.debug; return { stageClip: d.stageClip, physicalPose: d.physicalPose, gripErr: d.gripErr, soleErr: d.soleErr, wristErr: d.wristErr, heroDoc: window.__render.debugInfo().heroDoc }; })()`);
    console.log(name, JSON.stringify(d));
    await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
  };
  await shot('garage-sit-cruise', true);
  await shot('garage-physics', false);
  await shot('garage-sit-cruise', true);
} finally {
  await browser.close();
  await server.close();
}
// Side-by-side: prototype | game physics driver | game sit_cruise, each scaled to 640 px wide.
const proto = path.join(here, 'prototype-garage-sit-cruise.png');
try {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', proto, '-i', path.join(out, 'garage-physics.png'), '-i', path.join(out, 'garage-sit-cruise.png'),
    '-filter_complex', '[0:v]scale=640:-2,crop=640:360[a];[1:v]scale=640:-2[b];[2:v]scale=640:-2[c];[a][b][c]hstack=inputs=3', path.join(out, 'side-by-side.png')]);
  console.log('wrote', path.join(out, 'side-by-side.png'));
} catch (e) {
  console.error('ffmpeg hstack failed', (e as Error).message);
}
