/**
 * The Broadcast menu as a trailer plate: headless cold boot of the built page (`?sw=0`), wait for the menu to be
 * live and the key art decoded, then screenshot at 1280x720 CSS px x DPR 1.5 (= 1920x1080) twice, 1.2 s apart
 * (the ticker moves between them). The edit Ken-Burns the plate for the menu beat.
 *   npx tsx harness/trailer/menu-plate.ts [--out harness/out/trailer/beats-v2/menu]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { flagStr, parseArgs } from '../lib/args';
import { startServer } from '../lib/server';

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const out = path.resolve(flagStr(flags, 'out', 'harness/out/trailer/beats-v2/menu'));
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer({ dev: false });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    const t0 = performance.now();
    await page.goto(`${server.url}/?sw=0`);
    await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 180000 });
    await page.waitForFunction(() => !!document.querySelector('.menu-screen.live'), null, { timeout: 60000 });
    await page.waitForFunction(() => !!document.querySelector('.menu-keyart.loaded'), null, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    for (const i of [0, 1]) {
      const file = path.join(out, `menu-${i}.png`);
      await page.screenshot({ path: file, type: 'png' });
      console.log(`${file} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
      await page.waitForTimeout(1200);
    }
    const stamp = await page.evaluate(`(() => { const el = document.querySelector('.menu-build'); return el ? el.textContent : ''; })()`);
    console.log(`menu build stamp: ${String(stamp)}`);
    await ctx.close();
  } finally {
    await browser.close();
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
