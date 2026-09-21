#!/usr/bin/env node
/** Local-only HTTPS fixture server. All private test keys live outside the checkout. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
const configPath = path.resolve(process.argv[3] ?? '.native-build/ota-test-config.json');
if (mode === 'setup') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trials-native-ota-'));
  fs.chmodSync(directory, 0o700);
  const privateKeyPath = path.join(directory, 'signing-private.pem');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const certPath = path.join(directory, 'test-ca.pem');
  const tlsKeyPath = path.join(directory, 'tls-private.pem');
  const opensslConfig = path.join(directory, 'openssl.cnf');
  fs.writeFileSync(opensslConfig, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=Trials temporary OTA QA\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nsubjectAltName=DNS:localhost,IP:10.0.2.2,IP:127.0.0.1\n');
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', tlsKeyPath, '-out', certPath, '-config', opensslConfig], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  fs.chmodSync(tlsKeyPath, 0o600);
  const webRoot = path.resolve('.native-build/ota-test-public');
  fs.mkdirSync(webRoot, { recursive: true });
  const config = { directory, privateKeyPath, certPath, tlsKeyPath, webRoot, port: 8443, publicJwk: createPublicKey(privateKey).export({ format: 'jwk' }), iosManifest: 'https://localhost:8443/ios/manifest.json', androidManifest: 'https://10.0.2.2:8443/android/manifest.json' };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ configPath, certPath, webRoot, port: config.port, iosManifest: config.iosManifest, androidManifest: config.androidManifest }, null, 2));
} else if (mode === 'serve') {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const pending = new Map();
  const completed = new Set();
  const server = https.createServer({ cert: fs.readFileSync(config.certPath), key: fs.readFileSync(config.tlsKeyPath) }, (req, res) => {
    const origin = req.headers.origin;
    if (origin === 'https://localhost' || origin === 'capacitor://localhost') res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); res.end(); return; }
    let requested;
    try { requested = decodeURIComponent(new URL(req.url, 'https://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid path'); return; }
    const file = path.resolve(config.webRoot, '.' + requested);
    if (requested.split('/').some(part => part.startsWith('.')) || !file.startsWith(config.webRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('No test release'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/zip');
    res.setHeader('Content-Length', fs.statSync(file).size);
    console.log(JSON.stringify({ at: new Date().toISOString(), method: req.method, path: requested }));
    if (req.method === 'HEAD') { res.end(); return; }
    let fault, faultPlatform;
    for (const platform of ['ios', 'android']) {
      try {
        const candidate = JSON.parse(fs.readFileSync(path.join(config.webRoot, `.fixture-network-${platform}.json`), 'utf8'));
        const prefix = new URL('.', config[`${platform}Manifest`]).pathname;
        if (candidate.pathPrefix === prefix && requested.startsWith(prefix)) { fault = candidate; faultPlatform = platform; break; }
      } catch { /* Normal transfer without a fault control file. */ }
    }
    const applies = file.endsWith('.zip') && fault && requested.startsWith(fault.pathPrefix);
    if (applies && ['hold', 'release'].includes(fault.mode) && requested === fault.path) {
      const timeoutMs = Number(fault.timeoutMs);
      if (!/^[a-f0-9]{64}\.zip$/.test(requested.slice(fault.pathPrefix.length)) || !/^[a-f0-9-]{36}$/.test(fault.holdId ?? '') || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) { res.removeHeader('Content-Length'); res.writeHead(400); res.end('Invalid hold'); return; }
      if (fault.mode !== 'hold' || pending.has(fault.holdId) || completed.has(fault.holdId)) { res.removeHeader('Content-Length'); res.writeHead(409); res.end('Hold already consumed'); return; }
      // No response headers/body are sent before this filesystem acknowledgement.
      // The native downloader is now past its disk-space preflight and awaiting getResponseCode.
      const statusPath = path.join(config.webRoot, `.fixture-hold-${faultPlatform}.json`);
      const status = state => {
        const staged = statusPath + '.tmp';
        fs.writeFileSync(staged, JSON.stringify({ status: state, holdId: fault.holdId, platform: faultPlatform, path: requested, at: new Date().toISOString() }) + '\n');
        fs.renameSync(staged, statusPath);
      };
      let finished = false;
      const settle = state => {
        if (finished) return;
        finished = true;
        clearInterval(poll);
        clearTimeout(deadline);
        pending.delete(fault.holdId);
        completed.add(fault.holdId);
        status(state);
        if (state === 'released') {
          const stream = fs.createReadStream(file);
          stream.on('error', () => res.destroy());
          res.on('close', () => stream.destroy());
          stream.pipe(res);
        } else res.destroy();
      };
      const poll = setInterval(() => {
        let current;
        try { current = JSON.parse(fs.readFileSync(path.join(config.webRoot, `.fixture-network-${faultPlatform}.json`), 'utf8')); }
        catch { settle('cancelled'); return; }
        if (current.holdId !== fault.holdId || current.path !== requested || !['hold', 'release'].includes(current.mode)) settle('cancelled');
        else if (current.mode === 'release') settle('released');
      }, 25);
      const deadline = setTimeout(() => settle('timeout'), timeoutMs);
      pending.set(fault.holdId, settle);
      res.on('close', () => settle('disconnected'));
      status('held');
      console.log(JSON.stringify({ fault: 'hold', path: requested, holdId: fault.holdId, timeoutMs }));
    } else if (applies && fault.mode === 'interrupt') {
      const count = Math.max(1, Math.min(Number(fault.afterBytes) || 32768, fs.statSync(file).size - 1));
      console.log(JSON.stringify({ fault: 'interrupt', path: requested, afterBytes: count }));
      const stream = fs.createReadStream(file, { end: count - 1 });
      stream.pipe(res, { end: false });
      stream.on('end', () => res.destroy());
      res.on('close', () => stream.destroy());
    } else if (applies && fault.mode === 'delay') {
      const delayMs = Math.max(1, Math.min(Number(fault.delayMs) || 15000, 60000));
      console.log(JSON.stringify({ fault: 'delay', path: requested, delayMs }));
      const timer = setTimeout(() => { if (!res.destroyed) fs.createReadStream(file).pipe(res); }, delayMs);
      res.on('close', () => clearTimeout(timer));
    } else fs.createReadStream(file).pipe(res);
  });
  const shutdown = () => {
    for (const settle of pending.values()) settle('server-stopped');
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.listen(config.port, '127.0.0.1', () => console.log(`Local OTA fixture listening on port ${server.address().port}`));
} else {
  console.error('Usage: node scripts/native-ota-test.mjs setup|serve [ignored-config-path]');
  process.exitCode = 2;
}
