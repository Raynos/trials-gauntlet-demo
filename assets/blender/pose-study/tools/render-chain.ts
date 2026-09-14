/**
 * Side-view stick renders of pose.ts's chain for the frames of a capture log, so the v2 chain can
 * be compared with the v1 in-game frames and the reference strips before the render adopts it.
 *   tsx render-chain.ts <captureDir> <outDir> <k1,k2,...> [--size 360]
 * Writes <outDir>/f<k>.png (same framing as strip.mjs: axle at 50 % x, 72 % y).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { riderChain, DEFAULT_OPTS, type Chain } from '../../../../src/render/rider/pose';

const [dir, outDir, ks] = process.argv.slice(2);
const size = Number(process.argv[process.argv.indexOf('--size') + 1]) || 360;
const log = JSON.parse(fs.readFileSync(path.join(dir!, 'log.json'), 'utf8'));
fs.mkdirSync(outDir!, { recursive: true });

// The in-game crop box (strip.mjs) is 210 px at 720 p where the bike+rider height (bikeHeightFrac
// 0.2535 = 182 px) is ~2.2 m: 1 m = 83 px in the crop, scaled to `size`.
const PPM = (83 * size) / 210;

type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; col: string }
  | { t: 'line'; a: readonly [number, number]; b: readonly [number, number]; w: number; col: string }
  | { t: 'circle'; a: readonly [number, number]; r: number; col: string; stroke?: number };

function draw(c: Chain, angle: number): Op[] {
  const cx = size * 0.5;
  const cy = size * 0.72;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const P = (x: number, y: number) => [cx + (x * ca - y * sa) * PPM, cy - (x * sa + y * ca) * PPM] as const;
  const ops: Op[] = [{ t: 'rect', x: 0, y: 0, w: size, h: size, col: '#cfd3d8' }];
  const g = cy + 0.34 * PPM * ca;
  ops.push({ t: 'rect', x: 0, y: g, w: size, h: size, col: '#7a6b5a' });
  const rear = P(-0.65, 0);
  const front = P(0.65, 0);
  ops.push({ t: 'circle', a: rear, r: 0.3 * PPM, col: '#222', stroke: 0.08 * PPM });
  ops.push({ t: 'circle', a: front, r: 0.3 * PPM, col: '#222', stroke: 0.08 * PPM });
  const w = 0.06 * PPM;
  const L = (a: readonly [number, number], b: readonly [number, number], wl: number, col: string): Op => ({ t: 'line', a, b, w: wl, col });
  ops.push(L(rear, P(-0.22, 0.1), w, '#2b4fb3'), L(P(-0.22, 0.1), P(-0.14, 0.02), w, '#2b4fb3'), L(P(-0.14, 0.02), P(0.43, 0.5), w, '#2b4fb3'));
  ops.push(L(P(0.43, 0.5), front, w, '#888'), L(P(0.43, 0.5), P(0.35, 0.68), w, '#2b4fb3'), L(P(0.35, 0.68), P(0.31, 0.77), w * 0.6, '#222'));
  ops.push(L(P(0.31, 0.77), P(0.27, 0.78), w * 0.6, '#222'));
  ops.push(L(P(-0.5, 0.52), P(0.1, 0.62), w * 1.6, '#1a2f77')); // seat / tank line
  ops.push(L(P(-0.14, 0.02), P(-0.2, 0.02), w, '#111')); // peg
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, wm: number, col: string): Op => L(P(a.x, a.y), P(b.x, b.y), wm * PPM, col);
  const R = 1;
  const Lf = 0;
  // far side first (lighter)
  ops.push(seg(c.shoulder[R], c.elbow[R], 0.11, '#c9b36a'), seg(c.elbow[R], c.hand[R], 0.09, '#c9b36a'));
  ops.push(seg(c.hipSide[R], c.knee[R], 0.15, '#6a7aa8'), seg(c.knee[R], c.ankle[R], 0.12, '#6a7aa8'));
  ops.push(seg(c.hips, c.shoulders, 0.26, '#f2c200'));
  ops.push(seg(c.hips, { x: c.hips.x - Math.cos(c.torsoAngle) * 0.14, y: c.hips.y - Math.sin(c.torsoAngle) * 0.14 }, 0.22, '#1f3a8a'));
  ops.push(seg(c.hipSide[Lf], c.knee[Lf], 0.15, '#22307a'), seg(c.knee[Lf], c.ankle[Lf], 0.12, '#22307a'));
  ops.push(seg(c.shoulder[Lf], c.elbow[Lf], 0.11, '#f2c200'), seg(c.elbow[Lf], c.hand[Lf], 0.09, '#f2c200'));
  ops.push(seg(c.shoulders, c.head, 0.08, '#f2c200'));
  ops.push({ t: 'circle', a: P(c.head.x, c.head.y), r: 0.13 * PPM, col: '#1f3a8a' });
  for (const j of [c.hips, c.shoulders, c.knee[Lf], c.elbow[Lf]]) ops.push({ t: 'circle', a: P(j.x, j.y), r: 3, col: '#fff' });
  return ops;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<canvas id=c width=${size} height=${size} style="display:block"></canvas>`);
  for (const k of ks!.split(',').map(Number)) {
    const f = log[k];
    const chain = riderChain(f.rider, DEFAULT_OPTS);
    await page.evaluate((ops: Op[]) => {
      const ctx = (document.getElementById('c') as HTMLCanvasElement).getContext('2d')!;
      ctx.lineCap = 'round';
      for (const o of ops) {
        if (o.t === 'rect') {
          ctx.fillStyle = o.col;
          ctx.fillRect(o.x, o.y, o.w, o.h);
        } else if (o.t === 'line') {
          ctx.lineWidth = o.w;
          ctx.strokeStyle = o.col;
          ctx.beginPath();
          ctx.moveTo(o.a[0], o.a[1]);
          ctx.lineTo(o.b[0], o.b[1]);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(o.a[0], o.a[1], o.r, 0, Math.PI * 2);
          if (o.stroke) {
            ctx.lineWidth = o.stroke;
            ctx.strokeStyle = o.col;
            ctx.stroke();
          } else {
            ctx.fillStyle = o.col;
            ctx.fill();
          }
        }
      }
    }, draw(chain, f.angle));
    await page.screenshot({ path: path.join(outDir!, `f${String(k).padStart(4, '0')}.png`) });
    console.info(
      `f${k} lean ${f.rider.lean.toFixed(2)} crouch ${f.rider.crouch.toFixed(2)} -> hop ${chain.params.crouch.toFixed(2)} torso ${(chain.torsoAngle * 57.3).toFixed(0)} elbow ${(chain.elbowAngle[0] * 57.3).toFixed(0)} knee ${(chain.kneeAngle[0] * 57.3).toFixed(0)} hips (${chain.hips.x.toFixed(2)},${chain.hips.y.toFixed(2)})`,
    );
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
