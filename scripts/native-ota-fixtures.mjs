#!/usr/bin/env node
/** Local-only signed OTA scenarios. Never edits the input build or publishes remotely. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, constants, generateKeyPairSync, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { packageRelease, signManifest } from './mobile-release.mjs';

export const CASES = ['validA', 'validB', 'intentionalRollback', 'expired', 'incompatible', 'wrongSignature', 'corruptZip', 'brokenStartup', 'orphan'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function localConfig(file) {
  const config = read(file);
  for (const platform of ['ios', 'android']) {
    const url = new URL(config[`${platform}Manifest`]);
    if (url.protocol !== 'https:' || !['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname) || url.username || url.password) throw new Error('Fixtures require local simulator/emulator HTTPS channels');
  }
  return config;
}

export function inspectFixture(directory, publicJwk, nativeVersion, now = Date.now()) {
  const envelope = read(path.join(directory, 'manifest.json'));
  const payload = Buffer.from(envelope.payload, 'base64url');
  const manifest = JSON.parse(payload);
  const archivePath = path.join(directory, `${manifest.sha256}.zip`);
  const archive = fs.readFileSync(archivePath);
  return {
    signatureValid: verify('sha256', payload, { key: createPublicKey({ key: publicJwk, format: 'jwk' }), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(envelope.signature, 'base64url')),
    archiveHashValid: digest(archive) === manifest.sha256,
    expired: Date.parse(manifest.expiresAt) <= now,
    nativeCompatible: manifest.nativeMin === nativeVersion && manifest.nativeMax === nativeVersion,
    archiveBytes: archive.length, manifest,
  };
}

export function buildFixtures(args) {
  const configPath = path.resolve(args.config ?? '.native-build/ota-test-config.json');
  const config = localConfig(configPath);
  const source = path.resolve(args.dist ?? 'dist-native');
  const out = path.resolve(args.out ?? '.native-build/ota-fixtures');
  if (out === source || out.startsWith(source + path.sep) || source.startsWith(out + path.sep)) throw new Error('Fixture output and input build must be separate');
  const privatePath = path.resolve(config.privateKeyPath);
  if (privatePath.startsWith(source + path.sep)) throw new Error('Private signing key must be outside the input build');
  if (fs.existsSync(out)) throw new Error('Fixture output already exists; choose a fresh --out');
  const nativeVersion = args['native-version'] ?? '1.0.0';
  const sequenceBase = Number(args['sequence-base']);
  if (!Number.isSafeInteger(sequenceBase) || sequenceBase < 0 || !Number.isSafeInteger(sequenceBase + CASES.length)) throw new Error('Supply a nonnegative --sequence-base above the installed high-water sequence');
  const contract = read(path.join(source, 'native-build.json'));
  const platforms = args.platform ? [args.platform] : ['ios', 'android'];
  if (platforms.some(p => !['ios', 'android'].includes(p))) throw new Error('Platform must be ios or android');
  const privateKey = createPrivateKey(fs.readFileSync(config.privateKeyPath));
  // Deliberately wrong signer exists only in memory and is never persisted.
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const sourceIndex = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  if (!/<head(?:\s[^>]*)?>/i.test(sourceIndex)) throw new Error('Native index must contain a head element');
  fs.mkdirSync(out, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(out, '.fixture-source-'));
  const rows = [];
  try {
    fs.cpSync(source, temporary, { recursive: true });
    for (const [offset, name] of CASES.entries()) {
      const marker = name === 'intentionalRollback' ? 'validA' : name;
      const markerScript = `<script>window.__nativeOtaFixture=${JSON.stringify(marker)};document.documentElement.dataset.otaFixture=${JSON.stringify(marker)};console.info('OTA fixture: '+window.__nativeOtaFixture);</script>`;
      // No game boot or notifyAppReady: the native watchdog must restore the last healthy bundle.
      const index = name === 'brokenStartup' ? `<!doctype html><html><head>${markerScript}</head><body>Intentional OTA startup failure</body></html>` : sourceIndex.replace(/<head(?:\s[^>]*)?>/i, match => match + markerScript);
      fs.writeFileSync(path.join(temporary, 'index.html'), index);
      for (const platform of platforms) {
        const directory = path.join(out, platform, name);
        const result = packageRelease({
          platform, 'native-min': nativeVersion, 'native-max': nativeVersion,
          runtime: contract.runtime, 'save-schema': String(contract.saveSchema),
          'bundle-id': `1.0.${sequenceBase + offset + 1}-fixture-${name.toLowerCase()}`,
          sequence: String(sequenceBase + offset + 1), 'expires-at': expiresAt,
          'public-base': new URL('.', config[`${platform}Manifest`]).href,
          dist: temporary, out: directory, 'private-key': config.privateKeyPath,
        });
        let manifest = result.manifest;
        if (name === 'expired') manifest = { ...manifest, expiresAt: new Date(Date.now() - 60_000).toISOString() };
        if (name === 'incompatible') manifest = { ...manifest, nativeMin: '999.0.0', nativeMax: '999.0.0' };
        if (['expired', 'incompatible', 'wrongSignature'].includes(name)) write(result.manifestPath, signManifest(manifest, name === 'wrongSignature' ? wrongKey : privateKey));
        if (name === 'corruptZip') {
          const bytes = fs.readFileSync(result.zipPath);
          bytes[Math.floor(bytes.length / 2)] ^= 0xff;
          fs.writeFileSync(result.zipPath, bytes);
        }
        const checks = inspectFixture(directory, config.publicJwk, nativeVersion);
        if (checks.signatureValid !== (name !== 'wrongSignature') || checks.archiveHashValid !== (name !== 'corruptZip') || checks.expired !== (name === 'expired') || checks.nativeCompatible !== (name !== 'incompatible')) throw new Error(`Unexpected fixture validity: ${platform}/${name}`);
        rows.push({ platform, name, marker, directory: path.relative(out, directory), ...checks });
      }
    }
    const report = { schema: 1, createdAt: new Date().toISOString(), configPath, nativeVersion, sequenceBase, sourceRevision: contract.sourceRevision, inputIndexSha256: digest(Buffer.from(sourceIndex)), fixtures: rows };
    write(path.join(out, 'checks.json'), report);
    return report;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function selectFixture(args) {
  const config = localConfig(path.resolve(args.config ?? '.native-build/ota-test-config.json'));
  const root = path.resolve(args.out ?? '.native-build/ota-fixtures');
  const report = read(path.join(root, 'checks.json'));
  const row = report.fixtures.find(r => r.platform === args.platform && r.name === args.case);
  if (!row) throw new Error('Unknown platform/case; build fixtures first');
  const source = path.join(root, row.directory);
  const manifestUrl = new URL(config[`${row.platform}Manifest`]);
  const destination = path.resolve(config.webRoot, '.' + new URL('.', manifestUrl).pathname);
  if (!destination.startsWith(path.resolve(config.webRoot) + path.sep)) throw new Error('Channel must be inside the local server root');
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(source, `${row.manifest.sha256}.zip`), path.join(destination, `${row.manifest.sha256}.zip`));
  const archiveOnly = args['archive-only'] === 'true';
  if (!archiveOnly) {
    const staged = path.join(destination, 'manifest.json.tmp');
    fs.copyFileSync(path.join(source, 'manifest.json'), staged);
    fs.renameSync(staged, path.join(destination, 'manifest.json'));
  }
  return { platform: row.platform, case: row.name, archiveOnly, manifestUrl: manifestUrl.href, sequence: row.manifest.sequence, bundleId: row.manifest.bundleId, marker: row.marker, url: row.manifest.url, checksum: row.manifest.sha256 };
}

export function setNetworkFixture(args) {
  const config = localConfig(path.resolve(args.config ?? '.native-build/ota-test-config.json'));
  if (!['normal', 'interrupt', 'delay'].includes(args.mode)) throw new Error('Network mode must be normal, interrupt or delay');
  if (!['ios', 'android'].includes(args.platform)) throw new Error('Choose --platform ios or android');
  const afterBytes = Number(args['after-bytes'] ?? 32768), delayMs = Number(args['delay-ms'] ?? 15000);
  if (!Number.isSafeInteger(afterBytes) || afterBytes < 1 || !Number.isSafeInteger(delayMs) || delayMs < 1 || delayMs > 60000) throw new Error('Use positive byte count and delay of at most 60000 ms');
  const fault = { mode: args.mode, pathPrefix: new URL('.', config[`${args.platform}Manifest`]).pathname, afterBytes, delayMs };
  fs.mkdirSync(config.webRoot, { recursive: true });
  const staged = path.join(config.webRoot, `.fixture-network-${args.platform}.tmp`);
  write(staged, fault);
  fs.renameSync(staged, path.join(config.webRoot, `.fixture-network-${args.platform}.json`));
  return fault;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    const args = {};
    for (let i = 3; i < process.argv.length; i += 2) {
      if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Use --name value arguments');
      args[process.argv[i].slice(2)] = process.argv[i + 1];
    }
    if (!['build', 'select', 'network'].includes(mode)) throw new Error('Usage: native-ota-fixtures.mjs build|select|network [--name value]');
    console.log(JSON.stringify(mode === 'build' ? buildFixtures(args) : mode === 'select' ? selectFixture(args) : setNetworkFixture(args), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
