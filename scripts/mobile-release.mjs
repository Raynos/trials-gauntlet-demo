#!/usr/bin/env node
/** Package an existing native build and sign its public release manifest; never uploads. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, createPrivateKey, createPublicKey, constants, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function signManifest(manifest, privateKey) {
  const payload = Buffer.from(JSON.stringify(manifest));
  const signature = sign('sha256', payload, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
  return { payload: payload.toString('base64url'), signature: signature.toString('base64url') };
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

export function packageRelease(args) {
  const platform = requireArg(args, 'platform');
  if (!['ios', 'android'].includes(platform)) throw new Error('--platform must be ios or android');
  const nativeMin = requireArg(args, 'native-min'), nativeMax = requireArg(args, 'native-max');
  if (![nativeMin, nativeMax].every(v => /^\d+\.\d+\.\d+$/.test(v))) throw new Error('Native versions must be major.minor.patch');
  const runtime = requireArg(args, 'runtime');
  const bundleId = requireArg(args, 'bundle-id');
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(bundleId) || bundleId === 'builtin') throw new Error('Invalid bundle ID');
  const sequence = Number(requireArg(args, 'sequence')), saveSchema = Number(requireArg(args, 'save-schema'));
  if (![sequence, saveSchema].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error('Sequence and save schema must be positive integers');
  const expiresAt = requireArg(args, 'expires-at');
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('Expiry must be a future ISO date');
  const publicBase = new URL(requireArg(args, 'public-base'));
  if (publicBase.protocol !== 'https:' || publicBase.username || publicBase.password || publicBase.search || publicBase.hash) throw new Error('Public base must be a plain HTTPS URL');
  const source = path.resolve(args.dist ?? 'dist-native');
  const out = path.resolve(requireArg(args, 'out'));
  if (out === source || out.startsWith(source + path.sep)) throw new Error('Output must be outside the build');
  if (!fs.existsSync(path.join(source, 'index.html')) || !fs.existsSync(path.join(source, 'load-manifest.json')) || fs.existsSync(path.join(source, 'sw.js'))) throw new Error('Expected a complete native build without a service worker');
  const privatePath = path.resolve(requireArg(args, 'private-key'));
  if (privatePath === source || privatePath.startsWith(source + path.sep) || privatePath === out || privatePath.startsWith(out + path.sep)) throw new Error('Private signing key must be outside build and release output');
  const privateKey = createPrivateKey(fs.readFileSync(privatePath));
  if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Use an RSA signing key of at least 2048 bits');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-mobile-release-'));
  try {
    const zipPath = path.join(temporary, 'bundle.zip');
    const zipped = spawnSync('zip', ['-qr', zipPath, '.', '-x', '*.map', '*.DS_Store'], { cwd: source, encoding: 'utf8' });
    if (zipped.status !== 0) throw new Error(`zip failed: ${zipped.stderr || zipped.error?.message || zipped.status}`);
    const archive = fs.readFileSync(zipPath);
    const sha256 = createHash('sha256').update(archive).digest('hex');
    const url = new URL(sha256 + '.zip', publicBase.href.replace(/\/?$/, '/')).href;
    const manifest = { schema: 1, platform, nativeMin, nativeMax, runtime, saveSchema, bundleId, sequence, expiresAt, url, sha256 };
    const envelope = signManifest(manifest, privateKey);
    fs.mkdirSync(out, { recursive: true });
    fs.copyFileSync(zipPath, path.join(out, sha256 + '.zip'));
    // One channel per platform/native contract; publishing this file is the final release action.
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(envelope, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'public-key.jwk.json'), JSON.stringify(createPublicKey(privateKey).export({ format: 'jwk' }), null, 2) + '\n');
    return { manifest, manifestPath: path.join(out, 'manifest.json'), zipPath: path.join(out, sha256 + '.zip') };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const name = process.argv[i];
      if (!name.startsWith('--') || !process.argv[i + 1]) throw new Error('Use --name value arguments');
      args[name.slice(2)] = process.argv[i + 1];
    }
    console.log(JSON.stringify(packageRelease(args), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
