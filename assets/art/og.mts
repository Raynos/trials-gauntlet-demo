#!/usr/bin/env -S npx tsx
/**
 * Open Graph card (1200x630) -> public/art/og.jpg.
 *
 *   npx tsx assets/art/og.mts [--keyart assets/art/raw/keyart-industrial.png] [--out public/art/og.jpg]
 *
 * Rendered in headless Chromium so the wordmark is the game's own CSS (src/ui/styles.ts `.wordmark`:
 * Barlow Condensed 900 italic, amber gradient, bevel) over the key art, not a PIL approximation.
 * Fonts come from public/fonts/ (woff2 -- PIL cannot load them; the browser can).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { flagStr, parseArgs } from '../../harness/lib/args';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { flags } = parseArgs();
const keyart = path.resolve(flagStr(flags, 'keyart', path.join(here, 'raw/keyart-industrial.png')));
const out = path.resolve(flagStr(flags, 'out', path.join(repo, 'public/art/og.jpg')));
const fontsDir = path.join(repo, 'public/fonts');
const b64 = (f: string): string => fs.readFileSync(f).toString('base64');
const font = (f: string): string => `url(data:font/woff2;base64,${b64(path.join(fontsDir, f))}) format('woff2')`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: 'Barlow Condensed'; font-weight: 900; font-style: italic; src: ${font('BarlowCondensed-BlackItalic.woff2')}; }
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: ${font('BarlowCondensed-Bold.woff2')}; }
@font-face { font-family: 'Barlow Condensed'; font-weight: 500; src: ${font('BarlowCondensed-Medium.woff2')}; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #07080a; }
.card { position: relative; width: 1200px; height: 630px; overflow: hidden; font-family: 'Barlow Condensed', sans-serif; color: #f3f5f8; }
.art { position: absolute; inset: 0; background: url(data:image/png;base64,${b64(keyart)}) center 30% / cover no-repeat; transform: scaleX(-1); }
.scrim { position: absolute; inset: 0; background:
  linear-gradient(90deg, rgba(7,8,10,.92) 0%, rgba(7,8,10,.72) 34%, rgba(7,8,10,.12) 62%, rgba(7,8,10,0) 100%),
  linear-gradient(0deg, rgba(7,8,10,.85) 0%, rgba(7,8,10,0) 40%); }
.grain { position: absolute; inset: 0; opacity: .12; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 3px); mix-blend-mode: overlay; }
.block { position: absolute; left: 72px; top: 118px; }
.kicker { font-weight: 700; font-size: 22px; letter-spacing: .34em; text-transform: uppercase; color: #ffb020; margin: 0 0 14px 6px; text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.8); }
.wordmark { font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -.01em; line-height: .86; font-size: 172px;
  background: linear-gradient(180deg, #ffd98a 0%, #ffb020 42%, #ff8a1f 70%, #c9641a 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 5px 0 #6b3a05) drop-shadow(0 12px 9px rgba(0,0,0,.6)) drop-shadow(0 0 60px rgba(255,150,30,.28)); }
.sub { margin: 26px 0 0 8px; font-weight: 500; font-size: 30px; letter-spacing: .12em; text-transform: uppercase; color: rgba(243,245,248,.78); }
.sub b { color: #f3f5f8; font-weight: 700; }
.stamp { position: absolute; left: 80px; bottom: 44px; font-weight: 900; font-style: italic; font-size: 26px; letter-spacing: .02em; text-transform: uppercase; color: rgba(243,245,248,.55); }
.stamp b { color: #ffb020; }
.rule { position: absolute; left: 0; bottom: 0; width: 100%; height: 10px; background: repeating-linear-gradient(90deg, #ffb020 0 40px, #07080a 40px 80px); opacity: .9; }
</style><body><div class="card"><div class="art"></div><div class="scrim"></div><div class="grain"></div>
<div class="block"><div class="kicker">Physics trials · plays in the browser</div>
<div class="wordmark">Trials<br>Gauntlet</div>
<div class="sub"><b>15 tracks</b> · <b>5 biomes</b> · restart in one frame</div></div>
<div class="stamp">Free · <b>no install</b></div><div class="rule"></div></div></body>`;

const tmpHtml = path.join(here, 'raw', '.og.html');
fs.mkdirSync(path.dirname(tmpHtml), { recursive: true });
fs.writeFileSync(tmpHtml, html);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('file://' + tmpHtml);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
const png = path.join(here, 'raw', 'og.png');
await page.screenshot({ path: png, type: 'png' });
await browser.close();
fs.rmSync(tmpHtml, { force: true });
execFileSync('magick', [png, '-strip', '-quality', '82', '-sampling-factor', '4:2:0', '-interlace', 'JPEG', out]);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
