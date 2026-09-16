import type { HeroHarnessWindow } from '../hero-browser';
/** Real garage failure/retry across the production renderer and persisted preference. Headless only. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../lib/server';
import { AVAILABLE_RIDER_PRESETS } from '../../src/core/riderPresets';

const server = await startServer({ freeze: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const output = 'harness/out/blender/outfit-retry';
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  let failRace = true, failedRequests = 0, successfulRequests = 0;
  await page.route('**/models/**/rider-race*.glb', async route => {
    if (failRace) { failedRequests++; await route.fulfill({ status: 503, body: 'Temporary test outage' }); }
    else { successfulRequests++; await route.continue(); }
  });
  await page.goto(`${server.url}?sw=0&outfit=street`, { waitUntil: 'domcontentloaded' });
  // The loader removes itself after its completion crossfade; do not wait for a transient node.
  await page.waitForFunction(() => window.__trials?.app && (!document.querySelector('#loader') || document.querySelector('#loader')?.getAttribute('data-done') === '1'), undefined, { timeout: 90_000 });
  console.log('outfits: production boot ready');
  await page.evaluate(() => window.__trials!.app!.goto('garage'));
  await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  const race = page.locator('button[data-outfit="race-bluewhite"]'), street = page.locator('button[data-outfit="street-mustard"]');
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent?.includes('Select it to retry'));
  console.log('outfits: injected outage observed');
  if (await street.getAttribute('aria-pressed') !== 'true') throw new Error('Outage unselected the available street outfit');
  const failed = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, status: document.querySelector('.outfit-current')!.textContent }));
  if (failed.saved === 'race-bluewhite' || failed.rendered !== 'street-mustard') throw new Error(`Failed outfit was committed: ${JSON.stringify(failed)}`);
  failRace = false;
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent === 'Blue & white · Race selected');
  console.log('outfits: retry selected Race');
  const retry = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, heroDoc: (window as unknown as HeroHarnessWindow).__render.debugInfo().heroDoc }));
  if (retry.saved !== 'race-bluewhite' || retry.rendered !== 'race-bluewhite' || failedRequests !== 2 || successfulRequests !== 2) throw new Error(`Retry did not fetch and install both files: ${JSON.stringify({ retry, failedRequests, successfulRequests })}`);
  await page.locator('button[data-bike="pro"]').click();
  if (await race.getAttribute('aria-pressed') !== 'true') throw new Error('Bike class changed clothing');
  await page.evaluate(async () => { const r = (window as unknown as HeroHarnessWindow).__render; r.setRiderLod(true); r.setQuality('low'); await r.whenReady(); });
  const low = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo());
  if (low.riderOutfit !== 'race-bluewhite' || !low.heroDoc.split(' ').includes('rider-lod')) throw new Error(`Low quality lost the selected outfit: ${JSON.stringify(low.heroDoc)}`);
  const unavailable = page.locator('button[data-design="street-openface"]');
  if (!await unavailable.isDisabled()) throw new Error('Unbuilt openface design is selectable');
  const paletteChecks = [];
  for (const preset of AVAILABLE_RIDER_PRESETS) {
    console.log(`outfits: checking ${preset.id}`);
    await page.locator(`button[data-outfit="${preset.id}"]`).click();
    await page.waitForFunction(id => localStorage.getItem('trials.riderOutfit') === id, preset.id);
    for (const bike of ['rookie', 'pro'] as const) {
      await page.locator(`button[data-bike="${bike}"]`).click();
      for (const lod of [false, true]) {
        const observation = await page.evaluate(async ({ lod }) => {
          const r = (window as unknown as HeroHarnessWindow).__render;
          r.setRiderLod(lod);
          r.setQuality(lod ? 'low' : 'high');
          await r.whenReady();
          const materials: string[] = [];
          r.debug.bike.frame.traverse(object => {
            const mesh = object as import('three').SkinnedMesh;
            if (!mesh.isSkinnedMesh) return;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.push(material.name);
          });
          const debug = r.debugInfo();
          return { saved: localStorage.getItem('trials.riderOutfit'), rendered: debug.riderOutfit, variant: debug.riderMaterialVariant, heroDoc: debug.heroDoc, materials: [...new Set(materials)] };
        }, { lod });
        if (observation.saved !== preset.id || observation.rendered !== preset.id || observation.variant !== preset.variant
          || observation.materials.length !== 1 || observation.materials[0] !== preset.variant
          || observation.heroDoc.split(' ').includes('rider-lod') !== lod) {
          throw new Error(`Palette/LOD mismatch: ${JSON.stringify({ preset: preset.id, bike, lod, observation })}`);
        }
        paletteChecks.push({ preset: preset.id, bike, lod, ...observation });
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/garage.png` });
  await writeFile(`${output}/report.json`, JSON.stringify({ command: 'pnpm exec tsx harness/e2e/outfits.mts', mode: server.mode, failed, retry, low: { riderOutfit: low.riderOutfit, heroDoc: low.heroDoc }, paletteChecks, unavailableOpenface: true, failedRequests, successfulRequests, errors, evidenceScope: 'Headless production garage interaction and live material observations; screenshot is UI evidence, not played riding acceptance.' }, null, 2) + '\n');
  console.log(`PASS: outage/retry, four presets × two bike classes × full/LOD, exact live material names, unavailable openface. ${output}/report.json`);
} finally { await browser.close(); await server.close(); }
