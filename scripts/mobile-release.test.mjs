import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageRelease } from './mobile-release.mjs';
import { nativeBuildContract } from './mobile-config.mjs';

test('release packager produces a signed immutable ZIP without source maps or private key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-release-test-'));
  try {
    const source = path.join(root, 'build'), out = path.join(root, 'release');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.html'), '<html>game</html>');
    fs.writeFileSync(path.join(source, 'load-manifest.json'), '{}');
    fs.writeFileSync(path.join(source, 'secret.map'), 'not shipped');
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const contract = nativeBuildContract({
      VITE_MOBILE_MANIFEST_IOS: 'https://updates.example/ios/manifest.json',
      VITE_MOBILE_MANIFEST_ANDROID: 'https://updates.example/android/manifest.json',
      VITE_MOBILE_PUBLIC_KEY: JSON.stringify(keys.publicKey.export({ format: 'jwk' })),
    });
    fs.writeFileSync(path.join(source, 'native-build.json'), JSON.stringify(contract));
    const privatePath = path.join(root, 'signing.pem');
    fs.writeFileSync(privatePath, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    const args = { platform: 'ios', 'native-min': '0.3.2', 'native-max': '0.3.2', runtime: 'native-v1', 'bundle-id': '0.3.2-web.1', sequence: '1', 'save-schema': '1', 'expires-at': '2099-01-01T00:00:00Z', 'public-base': 'https://updates.example/ios', dist: source, out, 'private-key': privatePath };
    const result = packageRelease(args);
    const envelope = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    const payload = Buffer.from(envelope.payload, 'base64url');
    assert.equal(verify('sha256', payload, { key: keys.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(envelope.signature, 'base64url')), true);
    assert.deepEqual(JSON.parse(payload), result.manifest);
    assert.equal(createHash('sha256').update(fs.readFileSync(result.zipPath)).digest('hex'), result.manifest.sha256);
    assert.equal(result.manifest.url, `https://updates.example/ios/${result.manifest.sha256}.zip`);
    const entries = spawnSync('unzip', ['-Z1', result.zipPath], { encoding: 'utf8' });
    assert.equal(entries.status, 0);
    assert.match(entries.stdout, /index\.html/);
    assert.doesNotMatch(entries.stdout, /\.map|signing\.pem/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'public-key.jwk.json'), 'utf8')).d, undefined);
    assert.throws(() => packageRelease({ ...args, 'public-base': 'https://updates.example/wrong' }), /channel differs/);
    assert.throws(() => packageRelease({ ...args, runtime: 'native-v2' }), /runtime\/save schema/);
    const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPath = path.join(root, 'other.pem');
    fs.writeFileSync(otherPath, otherKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    assert.throws(() => packageRelease({ ...args, 'private-key': otherPath }), /Signing key differs/);
    fs.writeFileSync(path.join(source, 'native-build.json'), JSON.stringify({ ...contract, channels: null }));
    assert.throws(() => packageRelease(args), /channel differs/);
    fs.writeFileSync(path.join(source, 'native-build.json'), JSON.stringify(contract));
    fs.writeFileSync(path.join(source, 'sw.js'), 'web');
    assert.throws(() => packageRelease(args), /native build/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
