/**
 * Headless production rider-model and outfit switching — garage round: the Classic / Blender / Img2 chips and
 * the five outfit tags live in the GARAGE only; the main menu and the pause overlay carry none (asserted here).
 * Covers: pick Img2 in the garage → the renderer swaps the hero; the choice survives a reload; every outfit
 * tag commits `trials.riderModel = gltf` + the outfit; a run paused mid-track has no cosmetic rows and the
 * paused physics never advances while the garage's choices are applied; the played frames after resume.
 */
import { webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../lib/server';
import type { HeroHarnessWindow } from '../hero-browser';
import { AVAILABLE_RIDER_PRESETS } from '../../src/core/riderPresets';
const server = await startServer({ freeze: true });
const browser = await webkit.launch({ headless: true });
const out = 'harness/out/blender/img2-garage-release-v4';
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
  const toGarage = async () => {
    await page.evaluate(() => window.__trials!.app!.goto('garage'));
    await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  };
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'domcontentloaded' });
  await ready();
  // The main menu carries no cosmetic rows any more.
  if (await page.locator('.menu-screen [data-model], .menu-screen [data-outfit], .menu-customize').count() !== 0) throw new Error('main menu still carries rider-model / outfit rows');
  checks.push('main menu has no rider-model / outfit rows');
  await toGarage();
  const stageOn = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo().garage.on && (window as unknown as HeroHarnessWindow).__render.debugInfo().occluder.override === 'orbit');
  if (!stageOn) throw new Error('garage stage / orbit camera not up on the garage screen');
  checks.push('garage stage + orbit camera up');
  await page.locator('.garage-screen [data-model="img2"]').click();
  await expectModel('rider-img2-experimental');
  await page.screenshot({ path: `${out}/garage-img2.png` });
  checks.push('garage selects experimental rider');
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  await expectModel('rider-img2-experimental');
  checks.push('experimental selection survives reload');
  await toGarage();
  for (const p of AVAILABLE_RIDER_PRESETS) {
    await page.locator(`.garage-screen [data-outfit="${p.id}"]`).click();
    await page.waitForFunction(id => (window as unknown as HeroHarnessWindow).__render.debugInfo().riderOutfit === id && localStorage.getItem('trials.riderModel') === 'gltf', p.id, { timeout: 60_000 });
    checks.push(`garage outfit ${p.id}`);
  }
  // The reflection twin follows the hero through the swaps (it exists only while the stage is up).
  const withReflection = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo().garage.reflection);
  if (!withReflection) throw new Error('mirrored hero missing after outfit swaps');
  checks.push('mirrored hero rebuilt through outfit swaps');
  await page.evaluate(() => window.__trials!.app!.play('b1-first-ride'));
  await page.waitForFunction(() => window.__trials?.app?.screen() === 'run');
  const offStage = await page.evaluate(() => { const d = (window as unknown as HeroHarnessWindow).__render.debugInfo(); return !d.garage.on && d.occluder.override === null && !d.garage.reflection; });
  if (!offStage) throw new Error('garage stage / orbit camera still up on a run');
  checks.push('stage and orbit released on play');
  await page.waitForFunction(() => window.__trials?.phase() === 'riding', undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__trials!.app!.togglePause());
  await page.locator('.pause-overlay.show').waitFor();
  if (!await page.evaluate(() => getComputedStyle(document.querySelector('.banners')!).visibility === 'hidden')) throw new Error('HUD banners cover pause controls');
  if (await page.locator('.pause-overlay [data-which], .pause-overlay [data-outfit], .pause-overlay .visuals, .pause-outfits').count() !== 0) throw new Error('pause overlay still carries rider-model / outfit rows');
  checks.push('pause overlay has no rider-model / outfit rows');
  const tick = await page.evaluate(() => window.__trials!.getState().tick);
  await page.screenshot({ path: `${out}/pause.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: `${out}/pause-mobile.png` });
  const scroll = await page.evaluate(() => ({ window: window.scrollY, ui: document.querySelector('#ui')!.scrollTop, body: document.body.scrollTop }));
  if (Object.values(scroll).some(n => n !== 0)) throw new Error(`Viewport scrolled: ${JSON.stringify(scroll)}`);
  if (await page.evaluate(() => window.__trials!.getState().tick) !== tick) throw new Error('Pause advanced physics');
  checks.push('mobile pause: no scroll, paused physics unchanged');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.__trials!.app!.togglePause());
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(t => window.__trials!.getState().tick > t + 240, tick, { timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: `${out}/riding.png` });
  const debug = await page.evaluate(() => (window as unknown as HeroHarnessWindow).__render.debugInfo());
  if (errors.length || missing.length) throw new Error(JSON.stringify({ errors, missing }));
  await page.close(); await video.saveAs(`${out}/played-garage-and-rider.webm`);
  await writeFile(`${out}/report.json`, JSON.stringify({ pass: true, checks, errors, missing, debug }, null, 2));
  console.log(JSON.stringify({ pass: true, checks, errors, missing }));
} catch (e) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ error: String(e), errors, missing, checks }, null, 2));
  throw e;
} finally { await browser.close(); await server.close(); }
