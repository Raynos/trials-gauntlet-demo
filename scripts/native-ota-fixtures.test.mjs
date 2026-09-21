import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import https from 'node:https';
import { buildFixtures, inspectFixture, selectFixture, setNetworkFixture, republishFixture, CASES } from './native-ota-fixtures.mjs';
import { nativeBuildContract } from './mobile-config.mjs';

test('local fixture suite preserves the build and independently checks each intended failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-ota-fixtures-test-'));
  try {
    const source = path.join(root, 'build'), out = path.join(root, 'fixtures');
    fs.mkdirSync(source);
    const html = '<!doctype html><html><head></head><body><script>window.gameBooted=true</script></body></html>';
    fs.writeFileSync(path.join(source, 'index.html'), html);
    fs.writeFileSync(path.join(source, 'load-manifest.json'), '{}');
    const existing = process.env.NATIVE_OTA_TEST_CONFIG && JSON.parse(fs.readFileSync(process.env.NATIVE_OTA_TEST_CONFIG));
    const { privateKey, publicKey } = existing ? { privateKey: createPrivateKey(fs.readFileSync(existing.privateKeyPath)), publicKey: createPublicKey({ key: existing.publicJwk, format: 'jwk' }) } : generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = { privateKeyPath: path.join(root, 'private.pem'), publicJwk: publicKey.export({ format: 'jwk' }), webRoot: path.join(root, 'public'), iosManifest: 'https://localhost:8443/ios/manifest.json', androidManifest: 'https://10.0.2.2:8443/android/manifest.json' };
    fs.writeFileSync(config.privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    const configPath = path.join(root, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const contract = nativeBuildContract({ VITE_MOBILE_MANIFEST_IOS: config.iosManifest, VITE_MOBILE_MANIFEST_ANDROID: config.androidManifest, VITE_MOBILE_PUBLIC_KEY: JSON.stringify(config.publicJwk) });
    fs.writeFileSync(path.join(source, 'native-build.json'), JSON.stringify(contract));
    const args = { config: configPath, dist: source, out, 'sequence-base': '100', 'native-version': '1.0.0' };
    const report = buildFixtures(args);
    assert.equal(report.fixtures.length, CASES.length * 2);
    assert.equal(fs.readFileSync(path.join(source, 'index.html'), 'utf8'), html);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source, 'native-build.json'))), contract);
    for (const row of report.fixtures) {
      const directory = path.join(out, row.directory);
      assert.deepEqual(inspectFixture(directory, config.publicJwk, '1.0.0'), { signatureValid: row.signatureValid, archiveHashValid: row.archiveHashValid, expired: row.expired, nativeCompatible: row.nativeCompatible, archiveBytes: row.archiveBytes, manifest: row.manifest });
      assert.equal(row.signatureValid, row.name !== 'wrongSignature');
      assert.equal(row.archiveHashValid, row.name !== 'corruptZip');
      assert.equal(row.expired, row.name === 'expired');
      assert.equal(row.nativeCompatible, row.name !== 'incompatible');
      assert.equal(row.manifest.sequence, 101 + CASES.indexOf(row.name));
      if (row.name === 'corruptZip') continue;
      const zip = path.join(directory, `${row.manifest.sha256}.zip`);
      const extracted = spawnSync('unzip', ['-p', zip, 'index.html'], { encoding: 'utf8' });
      assert.equal(extracted.status, 0);
      assert.ok(extracted.stdout.includes(`window.__nativeOtaFixture=${JSON.stringify(row.marker)}`));
      assert.equal(extracted.stdout.includes('window.gameBooted=true'), row.name !== 'brokenStartup');
      const contents = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
      assert.doesNotMatch(contents.stdout, /private\.pem|config\.json/);
    }
    const selected = selectFixture({ config: configPath, out, platform: 'ios', case: 'validB' });
    assert.equal(selected.sequence, 102);
    assert.deepEqual(fs.readFileSync(path.join(config.webRoot, 'ios', 'manifest.json')), fs.readFileSync(path.join(out, 'ios', 'validB', 'manifest.json')));
    const orphan = selectFixture({ config: configPath, out, platform: 'ios', case: 'orphan', 'archive-only': 'true' });
    assert.equal(orphan.archiveOnly, true);
    assert.ok(fs.existsSync(path.join(config.webRoot, 'ios', `${orphan.checksum}.zip`)));
    assert.deepEqual(fs.readFileSync(path.join(config.webRoot, 'ios', 'manifest.json')), fs.readFileSync(path.join(out, 'ios', 'validB', 'manifest.json')));
    const rollback = report.fixtures.find(r => r.platform === 'ios' && r.name === 'intentionalRollback');
    assert.equal(rollback.marker, 'validA');
    assert.ok(rollback.manifest.sequence > selected.sequence);
    const broken = report.fixtures.find(r => r.platform === 'ios' && r.name === 'brokenStartup');
    const retry = republishFixture({ config: configPath, out, platform: 'ios', case: 'brokenStartup', sequence: '200' });
    assert.equal(retry.name, 'brokenStartupRetry');
    assert.equal(retry.manifest.bundleId, broken.manifest.bundleId);
    assert.equal(retry.manifest.sha256, broken.manifest.sha256);
    assert.equal(retry.manifest.sequence, 200);
    assert.ok(retry.signatureValid && retry.archiveHashValid);
    assert.deepEqual(fs.readFileSync(path.join(out, retry.directory, `${retry.manifest.sha256}.zip`)), fs.readFileSync(path.join(out, broken.directory, `${broken.manifest.sha256}.zip`)));
    assert.equal(selectFixture({ config: configPath, out, platform: 'ios', case: 'brokenStartupRetry' }).sequence, 200);
    assert.throws(() => republishFixture({ config: configPath, out, platform: 'ios', case: 'brokenStartup', name: 'lower', sequence: '199' }), /exceed/);
    assert.throws(() => republishFixture({ config: configPath, out, platform: 'ios', case: 'brokenStartup', name: '../escape', sequence: '201' }), /simple/);
    assert.throws(() => republishFixture({ config: configPath, out, platform: 'ios', case: 'corruptZip', name: 'bad', sequence: '201' }), /valid unexpired/);
    assert.throws(() => buildFixtures(args), /already exists/);
    assert.throws(() => selectFixture({ config: configPath, out, platform: 'ios', case: 'typo' }), /Unknown/);
    fs.writeFileSync(configPath, JSON.stringify({ ...config, iosManifest: 'https://example.com/ios/manifest.json' }));
    assert.throws(() => selectFixture({ config: configPath, out, platform: 'ios', case: 'validA' }), /local simulator/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('HTTPS fixture server interrupts ZIPs, delays ZIPs and keeps manifests/control files isolated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-ota-network-test-'));
  let server;
  try {
    const existing = process.env.NATIVE_OTA_TEST_CONFIG && JSON.parse(fs.readFileSync(process.env.NATIVE_OTA_TEST_CONFIG));
    const certPath = existing?.certPath ?? path.join(root, 'cert.pem'), tlsKeyPath = existing?.tlsKeyPath ?? path.join(root, 'key.pem');
    if (!existing) {
      const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', tlsKeyPath, '-out', certPath], { encoding: 'utf8' });
      assert.equal(generated.status, 0, generated.stderr);
    }
    const webRoot = path.join(root, 'public');
    fs.mkdirSync(path.join(webRoot, 'ios'), { recursive: true });
    fs.writeFileSync(path.join(webRoot, 'ios', 'fixture.zip'), Buffer.alloc(100_000, 0x41));
    const zipPath = `/ios/${'a'.repeat(64)}.zip`;
    fs.copyFileSync(path.join(webRoot, 'ios', 'fixture.zip'), path.join(webRoot, '.' + zipPath));
    fs.writeFileSync(path.join(webRoot, 'ios', 'manifest.json'), '{}');
    const config = path.join(root, 'config.json');
    fs.writeFileSync(config, JSON.stringify({ certPath, tlsKeyPath, webRoot, port: 0, iosManifest: 'https://localhost/ios/manifest.json', androidManifest: 'https://10.0.2.2/android/manifest.json' }));
    server = spawn(process.execPath, ['scripts/native-ota-test.mjs', 'serve', config], { stdio: ['ignore', 'pipe', 'pipe'] });
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 3000);
      server.stdout.on('data', bytes => {
        const match = String(bytes).match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
    });
    let latestRequest;
    const request = pathname => new Promise((resolve, reject) => {
      // Only this loopback test skips TLS validation; installed-app probes trust their temporary CA.
      const req = https.get({ host: '127.0.0.1', port, path: pathname, rejectUnauthorized: false }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, bytes: Buffer.concat(chunks).length }));
        res.on('error', reject);
      });
      req.setTimeout(2000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      latestRequest = req;
    });
    setNetworkFixture({ config, platform: 'ios', mode: 'interrupt', 'after-bytes': '1024' });
    await assert.rejects(request('/ios/fixture.zip'));
    assert.deepEqual(await request('/ios/manifest.json'), { status: 200, bytes: 2 });
    assert.equal((await request('/.fixture-network-ios.json')).status, 404);
    setNetworkFixture({ config, platform: 'android', mode: 'normal' });
    await assert.rejects(request('/ios/fixture.zip'));
    setNetworkFixture({ config, platform: 'ios', mode: 'delay', 'delay-ms': '80' });
    const start = Date.now();
    assert.deepEqual(await request('/ios/fixture.zip'), { status: 200, bytes: 100_000 });
    assert.ok(Date.now() - start >= 70);
    setNetworkFixture({ config, platform: 'ios', mode: 'normal' });
    assert.deepEqual(await request('/ios/fixture.zip'), { status: 200, bytes: 100_000 });
    assert.throws(() => setNetworkFixture({ config, platform: 'ios', mode: 'delay', 'delay-ms': '999999' }), /at most/);
    const waitStatus = async (hold, state) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        let status;
        try { status = JSON.parse(fs.readFileSync(hold.statusPath)); } catch { /* Await acknowledgement. */ }
        if (status?.holdId === hold.holdId && status.status === state) return status;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Missing hold state ${state}`);
    };
    assert.throws(() => setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: '/android/' + 'a'.repeat(64) + '.zip' }), /selected platform/);
    assert.throws(() => setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath, 'timeout-ms': '60001' }), /60000/);
    let hold = setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath });
    let received = false;
    const heldRequest = request(zipPath).then(result => { received = true; return result; });
    await waitStatus(hold, 'held');
    assert.equal(received, false);
    assert.equal(latestRequest.res, null, 'hold has sent no response headers');
    assert.equal((await request('/.fixture-hold-ios.json')).status, 404);
    assert.equal((await request(zipPath)).status, 409, 'duplicate request cannot consume the gate');
    assert.throws(() => setNetworkFixture({ config, platform: 'ios', mode: 'release', 'hold-id': 'wrong' }), /active hold/);
    setNetworkFixture({ config, platform: 'ios', mode: 'release', 'hold-id': hold.holdId });
    assert.deepEqual(await heldRequest, { status: 200, bytes: 100_000 });
    await waitStatus(hold, 'released');
    hold = setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath, 'timeout-ms': '100' });
    const timedOut = assert.rejects(request(zipPath));
    await waitStatus(hold, 'held');
    await timedOut;
    await waitStatus(hold, 'timeout');
    hold = setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath });
    const disconnected = assert.rejects(request(zipPath));
    const abandoned = latestRequest;
    await waitStatus(hold, 'held');
    abandoned.destroy(new Error('Test client disconnected'));
    await disconnected;
    await waitStatus(hold, 'disconnected');
    hold = setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath });
    const cancelled = assert.rejects(request(zipPath));
    await waitStatus(hold, 'held');
    setNetworkFixture({ config, platform: 'ios', mode: 'normal' });
    await cancelled;
    await waitStatus(hold, 'cancelled');
    hold = setNetworkFixture({ config, platform: 'ios', mode: 'hold', path: zipPath });
    const shutdown = assert.rejects(request(zipPath));
    await waitStatus(hold, 'held');
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await stopped;
    server = undefined;
    await shutdown;
    await waitStatus(hold, 'server-stopped');
  } finally {
    if (server) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
