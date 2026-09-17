import type { HeroHarnessWindow } from '../hero-browser';
/** Real garage failure/retry across the production renderer and persisted preference. Headless only. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../lib/server';
import { AVAILABLE_RIDER_PRESETS, type RiderOutfit } from '../../src/core/riderPresets';
import { bikeUrl, lodUrl, riderUrl } from '../../src/render/hero/urls';

/**
 * Ask 43 (Astra's family, src/render/hero/urls.ts): the outfit IS the file — no `KHR_materials_variants`, so the live
 * material name is the file's own. Street files carry the body under `rider_body` (plus hair / brow / beard shells);
 * a Race file carries one material named after its outfit. The proof that the RIGHT file is installed is the request
 * log below: every outfit's full + LOD file and both bike classes' files must have been fetched by the time they show.
 */
function liveMaterialOf(outfit: RiderOutfit, materials: string[]): string | undefined {
  return materials.find(m => m === 'rider_body' || m.startsWith(outfit));
}
const basename = (url: string): string => url.slice(url.lastIndexOf('/') + 1);

const server = await startServer({ freeze: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const output = 'harness/out/blender/openface-r12/integration';
const errors: string[] = [];
const fetchedModels = new Set<string>();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  // Byte-snapshot URLs are `models/<hash>/<name>-<hash>.glb`; log them by their logical basename.
  page.on('request', request => { const m = /\/models\/[0-9a-f]+\/(.+?)-[0-9a-f]{16}\.glb$/.exec(request.url()); if (m) fetchedModels.add(`${m[1]}.glb`); });
  // Ask 43 round 3 boot contract: a selection fetches only the FIRST-DRAWN document of the outfit's pair (the authored
  // file on this desktop-high context); its twin is prefetched after the swap and parsed off-track, later. So the
  // injected outage hits ONE request (not two), the retry fetches the drawn file and then the twin — and the twin's
  // arrival, whenever it comes, must never fail again (the outage is over by then). The assertion is by file, not by count.
  let failOpenface = true, failedRequests = 0;
  const succeeded = new Set<string>();
  await page.route('**/models/**/rider-street-openface*.glb', async route => {
    if (failOpenface) { failedRequests++; await route.fulfill({ status: 503, body: 'Temporary test outage' }); }
    else { succeeded.add(basename(route.request().url()).replace(/-[0-9a-f]{16}\.glb$/, '.glb')); await route.continue(); }
  });
  await page.goto(`${server.url}?sw=0&outfit=street`, { waitUntil: 'domcontentloaded' });
  // The loader removes itself after its completion crossfade; do not wait for a transient node.
  await page.waitForFunction(() => window.__trials?.app && (!document.querySelector('#loader') || document.querySelector('#loader')?.getAttribute('data-done') === '1'), undefined, { timeout: 90_000 });
  console.log('outfits: production boot ready');
  await page.evaluate(() => window.__trials!.app!.goto('garage'));
  await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  const race = page.locator('button[data-outfit="street-openface"]'), street = page.locator('button[data-outfit="street-mustard"]');
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent?.includes('Select it to retry'));
  console.log('outfits: injected outage observed');
  if (await street.getAttribute('aria-pressed') !== 'true') throw new Error('Outage unselected the available street outfit');
  const failed = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, status: document.querySelector('.outfit-current')!.textContent }));
  if (failed.saved === 'street-openface' || failed.rendered !== 'street-mustard' || failedRequests < 1) throw new Error(`Failed outfit was committed (or nothing was fetched): ${JSON.stringify({ failed, failedRequests })}`);
  const failedAtOutage = failedRequests;
  failOpenface = false;
  await race.click();
  await page.waitForFunction(() => document.querySelector('.outfit-current')?.textContent === 'Charcoal · open-face selected');
  console.log('outfits: retry selected openface');
  const retry = await page.evaluate(() => ({ saved: localStorage.getItem('trials.riderOutfit'),
    rendered: (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit, heroDoc: (window as unknown as HeroHarnessWindow).__render.debugInfo().heroDoc }));
  // The twin lands after the swap (off-track parse): wait for both files of the pair to have been served before judging.
  const pair = [basename(riderUrl('street-openface')), basename(lodUrl(riderUrl('street-openface')))];
  const twinDeadline = Date.now() + 30_000;
  while (!pair.every(f => succeeded.has(f)) && Date.now() < twinDeadline) await page.waitForTimeout(250);
  if (retry.saved !== 'street-openface' || retry.rendered !== 'street-openface' || !pair.every(f => succeeded.has(f)) || failedRequests !== failedAtOutage) throw new Error(`Retry did not fetch and install the pair without a re-failure: ${JSON.stringify({ retry, failedRequests, failedAtOutage, succeeded: [...succeeded], pair })}`);
  await page.locator('button[data-bike="pro"]').click();
  if (await race.getAttribute('aria-pressed') !== 'true') throw new Error('Bike class changed clothing');
  await page.evaluate(async () => { const r = (window as unknown as HeroHarnessWindow).__render; r.setRiderLod(true); r.setQuality('low'); await r.whenReady(); });
  const low = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo());
  // Round 2 `lodChoice`: the garage keeps the AUTHORED rider on every tier (the close-up showcase); only the bike follows the tier's LOD.
  if (low.riderOutfit !== 'street-openface' || low.heroDoc !== 'bike-lod rider') throw new Error(`Low quality in the garage is not the LOD bike + authored rider: ${JSON.stringify(low.heroDoc)}`);
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
        const liveMaterial = liveMaterialOf(preset.id, observation.materials);
        const files = { rider: basename(riderUrl(preset.id)), riderLod: basename(lodUrl(riderUrl(preset.id))), bike: basename(bikeUrl(bike)), bikeLod: basename(lodUrl(bikeUrl(bike))) };
        const missing = Object.values(files).filter(f => !fetchedModels.has(f));
        if (observation.saved !== preset.id || observation.rendered !== preset.id || observation.variant !== null /* the shipped family has no material variants: the livery is the file */
          || !liveMaterial || missing.length
          || observation.heroDoc !== (lod ? 'bike-lod rider' : 'bike rider')) {
          throw new Error(`Outfit/LOD mismatch: ${JSON.stringify({ preset: preset.id, bike, lod, liveMaterial, missing, observation })}`);
        }
        paletteChecks.push({ preset: preset.id, bike, lod, liveMaterial, files, ...observation });
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/garage.png` });
  await writeFile(`${output}/report.json`, JSON.stringify({ command: 'pnpm exec tsx harness/e2e/outfits.mts', mode: server.mode, failed, retry, low: { riderOutfit: low.riderOutfit, heroDoc: low.heroDoc }, paletteChecks, heroFamily: 'ASTRA_HERO (one file per outfit, one per bike class; no material variants)', modelFiles: [...fetchedModels].sort(), failedRequests, successfulRequests: [...succeeded].sort(), errors, evidenceScope: 'Headless production garage interaction, live material names and the per-outfit / per-class model requests; screenshot is UI evidence, not played riding acceptance.' }, null, 2) + '\n');
  console.log(`PASS: outage/retry, five presets × two bike classes × full/LOD, live material names, every outfit's and class's own files fetched (${fetchedModels.size} model files). ${output}/report.json`);
} finally { await browser.close(); await server.close(); }
