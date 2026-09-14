// Build a labelled frame strip from a capture dir (log.json + fNNNN.png).
//   node strip.mjs <captureDir> <out.jpg> <k1,k2,...> [--label "text"] [--size 300]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const FF = '/opt/homebrew/bin/ffmpeg';
const [dir, out, ks] = process.argv.slice(2);
const args = process.argv.slice(5);
const size = Number((args[args.indexOf('--size') + 1]) || 300) || 300;
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : '';
const log = JSON.parse(fs.readFileSync(path.join(dir, 'log.json'), 'utf8'));
const frames = ks.split(',').map(Number);
const W = 1280, H = 720;
const inputs = [];
const legend = [label];
const filters = [];
frames.forEach((k, i) => {
  const f = log[k];
  const cx = f.cam.bikeScreenX * W, cy = f.cam.bikeScreenY * H;
  // crop box scaled with the bike's on-screen height so every frame has the same metre scale
  const s = (f.cam.bikeHeightFrac / 0.2535);
  const box = Math.round(210 * s);
  const x = Math.round(cx - box * 0.5), y = Math.round(cy - box * 0.72);
  inputs.push('-i', path.join(dir, `f${String(k).padStart(4, '0')}.png`));
  legend.push(`col ${i + 1}: f${k} t=${f.t.toFixed(2)}s input ${f.leanIn.toFixed(2)} lean ${f.rider.lean.toFixed(2)} crouch ${f.rider.crouch.toFixed(2)} torsoPitch ${f.rider.torsoPitch.toFixed(2)} arm ${f.rider.armExtend.toFixed(2)} hop ${f.hop}`);
  filters.push(`[${i}:v]crop=${box}:${box}:${x}:${y},scale=${size}:${size}[v${i}]`);
});
filters.push(`${frames.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${frames.length}[row]`);
filters.push(`[row]copy[o]`);
fs.writeFileSync(out.replace(/\.jpg$/, '.txt'), legend.join('\n') + '\n');
execFileSync(FF, ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[o]', '-q:v', '3', out]);
console.info('wrote', out, frames.length, 'frames');
