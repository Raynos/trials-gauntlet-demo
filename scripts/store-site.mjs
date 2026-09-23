#!/usr/bin/env node
// Builds the Rockhop website — landing, privacy policy, support — into store/build/site, ready to deploy to the
// `rockhop` Vercel project (https://rockhop.vercel.app; store/RELEASE-RECIPE.md). Both stores need the privacy and
// support URLs even though the app collects nothing (docs/plans/STORE_RELEASE.md Phase 6).
//
//   node scripts/store-site.mjs [--email support@example.com] [--preview]
//
// The support address is the one thing the pages cannot know: --email, else $ROCKHOP_SUPPORT_EMAIL, else the first
// line of ~/.config/rockhop/support-email. Without one the build refuses (a live privacy policy with no contact is a
// store rejection), unless --preview, which marks the gap on the page.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const src = join(repo, 'store', 'site');
const out = join(repo, 'store', 'build', 'site');
const home = process.env.HOME ?? '';
const emailFile = join(home, '.config', 'rockhop', 'support-email');

let email = opt('email') ?? process.env.ROCKHOP_SUPPORT_EMAIL ?? (existsSync(emailFile) ? readFileSync(emailFile, 'utf8').split('\n')[0].trim() : '');
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`store-site: "${email}" is not an email address`);
if (!email) {
  if (!args.includes('--preview')) throw new Error(`store-site: no support email (--email, ROCKHOP_SUPPORT_EMAIL or ${emailFile}); --preview builds with a visible placeholder`);
  email = 'support-address-pending@invalid';
}

// "Last updated": the last commit that touched the privacy policy (today for an uncommitted edit).
let updated = new Date().toISOString().slice(0, 10);
try {
  const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'store/site/legal/privacy.html'], { cwd: repo, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'store/site/legal/privacy.html'], { cwd: repo, encoding: 'utf8' }).trim();
  if (d && !dirty) updated = d;
} catch {
  /* no git: today */
}

// Keep `.vercel/` (the link to the `rockhop` project) across rebuilds; everything else is regenerated.
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f !== '.vercel') rmSync(join(out, f), { recursive: true, force: true });
cpSync(src, out, { recursive: true });
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(out).filter((p) => p.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8').replaceAll('{{SUPPORT_EMAIL}}', email).replaceAll('{{UPDATED}}', updated);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error(`store-site: unfilled token in ${f}`);
  writeFileSync(f, html);
}

// Brand fonts (SIL OFL: the licence travels with the font) and the icon.
mkdirSync(join(out, 'fonts'), { recursive: true });
for (const f of ['ArchivoBlack-Rockhop.woff2', 'Archivo-Rockhop.woff2', 'ArchivoBlack-OFL.txt', 'Archivo-OFL.txt']) {
  const p = join(repo, 'public', 'fonts', f);
  if (existsSync(p)) copyFileSync(p, join(out, 'fonts', f));
}
execFileSync('magick', [join(repo, 'store', 'play', 'icon-512.png'), '-resize', '192x192', join(out, 'icon-192.png')]);

writeFileSync(
  join(out, 'vercel.json'),
  `${JSON.stringify(
    {
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: null,
      buildCommand: null,
      cleanUrls: false,
      headers: [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; frame-ancestors 'none'" }] }],
    },
    null,
    2,
  )}\n`,
);
console.info(`store-site: ${out} (support ${email}, privacy updated ${updated})`);
