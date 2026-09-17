// Probe (ask 29): what a garage bike-chip hover does to the renderer. Run: tsx harness/out/probe-hover.mts
import { chromium } from 'playwright';
import { startServer } from '../lib/server';
const server = await startServer({ freeze: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => localStorage.setItem('trials.onboarded', '1'));
  page.on('console', (m) => { if (/probe/.test(m.text())) console.log(m.text()); });
  await page.goto(`${server.url}?sw=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__trials?.app && (!document.querySelector('#loader') || document.querySelector('#loader')?.getAttribute('data-done') === '1'), undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__trials!.app!.goto('garage'));
  await page.waitForSelector('.garage-screen.live', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(`(async function () {
    var r = window.__render;
    var counts = { setTrack: 0, setGarageStage: 0, setBikeClass: 0, clearWorld: 0 };
    Object.keys(counts).forEach(function (k) { var o = r[k]; if (typeof o === 'function') r[k] = function () { counts[k]++; return o.apply(this, arguments); }; });
    var proto = Object.getPrototypeOf(r); var cw = proto.clearWorld; if (cw) proto.clearWorld = function () { counts.clearWorld++; return cw.apply(this, arguments); };
    function snap() { var i = r.debugInfo(); var bg = r.debug.scene.background; return { on: i.garage.on, hidden: i.garage.hidden, bg: bg && bg.isColor ? '#' + bg.getHexString() : String(bg && bg.constructor && bg.constructor.name) }; }
    var before = snap();
    var el = document.querySelector('.garage-screen button[data-bike="pro"]');
    el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    var frames = [];
    for (var i = 0; i < 6; i++) { await new Promise(function (res) { requestAnimationFrame(res); }); frames.push(snap()); }
    return { before: before, frames: frames, counts: counts };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  await server.close();
}
