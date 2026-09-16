/**
 * Pixel diff of PNG pairs: `pnpm exec tsx harness/bench/pngdiff.ts a.png b.png [c.png d.png ...]`
 * Prints pixels differing, pixels beyond 8/255, the max delta and the bbox of those pixels: a cut's
 * still against the previous cut's (`det/<label>/`). Decoded in headless Chromium (no PNG dependency).
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
const pairs = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (let i = 0; i + 1 < pairs.length; i += 2) {
  const a = fs.readFileSync(pairs[i]!).toString('base64'), b = fs.readFileSync(pairs[i + 1]!).toString('base64');
  const r = await page.evaluate(`(async function (a, b) {
    var load = function (s) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.src = 'data:image/png;base64,' + s; }); };
    var ims = await Promise.all([load(a), load(b)]); var ia = ims[0], ib = ims[1];
    var c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; var ctx = c.getContext('2d');
    ctx.drawImage(ia, 0, 0); var da = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.drawImage(ib, 0, 0); var db = ctx.getImageData(0, 0, c.width, c.height).data;
    var px = 0, maxd = 0, big = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (var k = 0; k < da.length; k += 4) { var d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2])); if (d) { px++; if (d > maxd) maxd = d; if (d > 8) { big++; var pi = k >> 2, x = pi % c.width, y = (pi / c.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } }
    return { w: c.width, h: c.height, pixelsDiffering: px, over8: big, maxDelta: maxd, pct: +((px / (c.width * c.height)) * 100).toFixed(3), bbox: [x0, y0, x1, y1] };
  })(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  console.log(pairs[i]!.split('/').slice(-2).join('/'), 'vs', pairs[i + 1]!.split('/').slice(-1)[0], JSON.stringify(r));
}
await browser.close();
