import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
await page.goto('http://localhost:4180/hero-delta/viewer');
await page.waitForFunction(() => (window as Window & { __ready?: boolean }).__ready === true, undefined, { timeout: 60000 });
const N = 72; // 360° in 72 frames = 3 s at 24 fps
for (const m of ['v010-rider', 'v021-rider-street', 'v010-bike', 'v021-bike']) {
  const s = await page.evaluate<{ size: [number, number, number]; center: [number, number, number] }>(`window.__load('/hero-delta/models/${m}.glb')`);
  const [sx, sy, sz] = s.size; const [cx, cy, cz] = s.center; const r = Math.max(sx, sy, sz);
  mkdirSync(`../hero-delta/frames/${m}`, { recursive: true });
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const d = 2.2 * r; const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d, y = cy + 0.45 * r;
    await page.evaluate(`window.__shot(${x},${y},${z},${cx},${cy},${cz},30)`);
    await page.screenshot({ path: `../hero-delta/frames/${m}/${String(i).padStart(3, '0')}.png` });
  }
  console.info('done', m);
}
await browser.close();
