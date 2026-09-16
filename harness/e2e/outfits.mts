import type { HeroHarnessWindow } from '../hero-browser';
/** Real garage failure/retry across the production renderer and persisted preference. Headless only. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../lib/server';

const server = await startServer({ freeze: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const output = 'harness/out/blender/outfit-retry';
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  let failRace = true, failedRequests = 0, successfulRequests = 0;
  await page.route('**/models/**/rider-race*.glb', async route => {
    if (failRace) { failedRequests++; await route.fulfill({ status: 503, body: 'Temporary test outage' }); }
    else { successfulRequests++; await route.continue(); }
  });
  await page.goto(`${server.url}?sw=0&outfit=street`, { waitUntil: 'domcontentloaded' });
  // The loader removes itself after its completion crossfade; do not wait for a transient node.
  await page.waitForFunction(() => window.__trials?.app && (!document.querySelector('#loader') || document.querySelector('#loader')?.getAttribute('data-done') === '1'), undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__trials!.app!.goto('garage'));
  await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  const race = page.locator('button[data-outfit="race"]'), street = page.locator('button[data-outfit="street"]');
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent?.includes('Select it to retry'));
  if (await street.getAttribute('aria-pressed') !== 'true') throw new Error('Outage unselected the available street outfit');
  const failed = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, status: document.querySelector('.outfit-current')!.textContent }));
  if (failed.saved === 'race' || failed.rendered !== 'street') throw new Error(`Failed outfit was committed: ${JSON.stringify(failed)}`);
  failRace = false;
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent === 'Race kit selected');
  const retry = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, heroDoc: (window as unknown as HeroHarnessWindow).__render.debugInfo().heroDoc }));
  if (retry.saved !== 'race' || retry.rendered !== 'race' || failedRequests !== 2 || successfulRequests !== 2) throw new Error(`Retry did not fetch and install both files: ${JSON.stringify({ retry, failedRequests, successfulRequests })}`);
  await page.locator('button[data-bike="pro"]').click();
  if (await race.getAttribute('aria-pressed') !== 'true') throw new Error('Bike class changed clothing');
  await page.evaluate(async () => { const r = (window as unknown as HeroHarnessWindow).__render; r.setRiderLod(true); r.setQuality('low'); await r.whenReady(); });
  const low = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo());
  if (low.riderOutfit !== 'race' || !low.heroDoc.split(' ').includes('rider-lod')) throw new Error(`Low quality lost the selected outfit: ${JSON.stringify(low.heroDoc)}`);
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/garage.png` });
  await writeFile(`${output}/report.json`, JSON.stringify({ failed, retry, low: { riderOutfit: low.riderOutfit, heroDoc: low.heroDoc }, failedRequests, successfulRequests, errors }, null, 2) + '\n');
  console.log(`PASS: outage retained Street; retry fetched both Race files, persisted selection, retained it on Pro and LOD. ${output}/report.json`);
} finally { await browser.close(); await server.close(); }
