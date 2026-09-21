import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('pageerror', e => console.error('ERR', String(e)));
page.on('console', m => { if (m.type() === 'error') console.error('CERR', m.text()); });
await page.goto('http://localhost:4180/hero-delta/viewer');
await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, undefined, { timeout: 60000 });
const models = ['v010-bike', 'v021-bike', 'v010-rider', 'v021-rider-street', 'v021-rider-openface', 'v021-rider-race'];
const stats: Record<string, unknown> = {};
for (const m of models) {
  const s = await page.evaluate<{ size: [number, number, number]; center: [number, number, number] }>(`window.__load('/hero-delta/models/${m}.glb')`);
  stats[m] = s;
  const [sx, sy, sz] = s.size; const [cx, cy, cz] = s.center;
  const r = Math.max(sx, sy, sz);
  // side view (from +Z... models face +X per game convention? shoot from the side that shows length)
  const views: Record<string, number[]> = {
    side: [cx, cy + 0.1 * r, cz + 2.6 * r, cx, cy, cz, 30],
    front34: [cx + 1.8 * r, cy + 0.6 * r, cz + 1.8 * r, cx, cy, cz, 30],
    close: [cx + 0.9 * r, cy + 0.55 * r, cz + 0.9 * r, cx, cy + 0.3 * r, cz, 18],
  };
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate(`window.__shot(${v.join(',')})`);
    await page.screenshot({ path: `../hero-delta/${m}-${name}.png` });
  }
}
console.info(JSON.stringify(stats, null, 1));
await browser.close();
