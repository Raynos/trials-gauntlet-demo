/** Headless production main/pause-menu model and outfit switching, including reload. */
import { webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../lib/server';
import type { HeroHarnessWindow } from '../hero-browser';
import { AVAILABLE_RIDER_PRESETS } from '../../src/core/riderPresets';
const server = await startServer({ freeze: true });
const browser = await webkit.launch({ headless: true });
const out = 'harness/out/blender/img2-menu-release-v3';
await mkdir(out, { recursive: true });
const errors: string[] = [], missing: string[] = [];
const checks: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: `${out}/video`, size: { width: 1280, height: 720 } } });
  const video = page.video()!;
  await page.addInitScript(() => localStorage.setItem('trials.onboarded', '1'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  const ready = () => page.waitForFunction(() => !!window.__trials?.app && (!document.querySelector('#loader') || document.querySelector('#loader')?.getAttribute('data-done') === '1'), undefined, { timeout: 90_000 });
  const expectModel = (model: string) => page.waitForFunction(model => (window as unknown as HeroHarnessWindow).__render.debugInfo().heroDoc.includes(model), model, { timeout: 60_000 });
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.locator('.menu-customize [data-model="img2"]').click();
  await expectModel('rider-img2-experimental');
  await page.screenshot({ path: `${out}/main-img2.png` });
  checks.push('main selects experimental rider');
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  await expectModel('rider-img2-experimental');
  checks.push('experimental selection survives reload');
  for (const p of AVAILABLE_RIDER_PRESETS) {
    await page.locator(`.menu-customize [data-outfit="${p.id}"]`).click();
    await page.waitForFunction(id => (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit === id && localStorage.getItem('trials.riderModel') === 'gltf', p.id);
    checks.push(`main outfit ${p.id}`);
  }
  await page.evaluate(() => window.__trials!.app!.play('b1-first-ride'));
  await page.waitForFunction(() => window.__trials?.app?.screen() === 'run');
  await page.waitForFunction(() => window.__trials?.phase() === 'riding', undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__trials!.app!.togglePause());
  await page.locator('.pause-overlay.show').waitFor();
  if (!await page.evaluate(() => getComputedStyle(document.querySelector('.banners')!).visibility === 'hidden')) throw new Error('HUD banners cover pause controls');
  const tick = await page.evaluate(() => window.__trials!.getState().tick);
  await page.locator('.pause-overlay [data-which="rider"] [data-v="img2"]').click();
  await expectModel('rider-img2-experimental');
  await page.screenshot({ path: `${out}/pause-img2.png` });
  for (const p of AVAILABLE_RIDER_PRESETS) {
    await page.locator(`.pause-overlay [data-outfit="${p.id}"]`).click();
    await page.waitForFunction(id => (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit === id, p.id);
    checks.push(`pause outfit ${p.id}`);
  }
  if (await page.evaluate(() => window.__trials!.getState().tick) !== tick) throw new Error('Cosmetic switch advanced paused physics');
  await page.locator('.pause-overlay [data-which="rider"] [data-v="img2"]').click(); await expectModel('rider-img2-experimental');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('.pause-overlay [data-outfit="street-mustard"]').click();
  await page.waitForFunction(() => (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit === 'street-mustard');
  await page.screenshot({ path: `${out}/pause-mobile.png` });
  const scroll = await page.evaluate(() => ({ window: window.scrollY, ui: document.querySelector('#ui')!.scrollTop, body: document.body.scrollTop }));
  if (Object.values(scroll).some(n => n !== 0)) throw new Error(`Viewport scrolled: ${JSON.stringify(scroll)}`);
  checks.push('mobile pause outfit selectable; paused physics unchanged');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.pause-overlay [data-which="rider"] [data-v="img2"]').click(); await expectModel('rider-img2-experimental');
  await page.evaluate(() => window.__trials!.app!.togglePause());
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(t => window.__trials!.getState().tick > t + 240, tick, { timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: `${out}/riding-img2.png` });
  const debug = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo());
  if (errors.length || missing.length) throw new Error(JSON.stringify({ errors, missing }));
  await page.close(); await video.saveAs(`${out}/played-menu-and-rider.webm`);
  await writeFile(`${out}/report.json`, JSON.stringify({ pass: true, checks, errors, missing, debug }, null, 2));
  console.log(JSON.stringify({ pass: true, checks, errors, missing }));
} catch (e) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(e), errors, missing, checks }, null, 2));
  throw e;
} finally { await browser.close(); await server.close(); }
