// node shoot.mjs <out-dir> <label=path.glb> [<label=path.glb> ...]   (run from a dir where playwright resolves)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = '/Users/raynos/projects/game-demos/trials-gauntlet-demo';
const VIEWER = '/private/tmp/claude-501/-Users-raynos-projects-game-demos-trials-gauntlet-demo/058e8d84-1c67-4da2-aed9-3b0994fdd51d/scratchpad/bikeview/viewer.html';
const [out, ...specs] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/') file = VIEWER;
  else if (url.startsWith('/abs/')) file = url.slice(4);
  else file = path.join(ROOT, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PARTS = ['bodywork', 'frame', 'engine', 'fork_upper', 'fork_lower', 'swingarm', 'wheel_front', 'wheel_rear', 'exhaust', 'handlebar', 'shock_spring', 'pegs'];
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => globalThis.__ready, null, { timeout: 60000 });
  for (const spec of specs) {
    const [label, file] = spec.split('=');
    const n = await page.evaluate(`window.__load('/abs${path.resolve(file)}')`);
    const materials = await page.evaluate('window.__materials');
    const parts = {};
    for (const view of ['front34', 'tank', 'rear34']) {
      await page.evaluate(`window.__view('${view}')`);
      await page.screenshot({ path: path.join(out, `${label}-${view}.png`) });
    }
    for (const part of PARTS) parts[part] = await page.evaluate(`window.__partMean('${part}', 'front34')`);
    report[label] = { materials: n, materialList: materials, parts };
    console.log(label, n, 'materials');
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const labels = Object.keys(report);
if (labels.length >= 2) {
  const [a, b] = labels;
  console.log('part'.padEnd(14), a.padEnd(24), b.padEnd(24), 'dE(rgb)');
  for (const part of PARTS) {
    const pa = report[a].parts[part], pb = report[b].parts[part];
    if (!pa?.pixels || !pb?.pixels) { console.log(part.padEnd(14), 'missing'); continue; }
    const f = p => `${p.r.toFixed(3)} ${p.g.toFixed(3)} ${p.b.toFixed(3)}`;
    const d = Math.hypot(pa.r - pb.r, pa.g - pb.g, pa.b - pb.b);
    console.log(part.padEnd(14), f(pa).padEnd(24), f(pb).padEnd(24), d.toFixed(3));
  }
}
