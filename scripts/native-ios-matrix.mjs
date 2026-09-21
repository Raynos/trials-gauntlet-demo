#!/usr/bin/env node
/** Installed-app smoke matrix. Does not erase devices or claim physical-phone performance. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });
const devices = JSON.parse(sim('list', 'devices', 'available', '--json')).devices;
const names = ['trials-iphone', 'iPhone 17e', 'iPhone 17 Pro Max', 'iPad mini (A17 Pro)', 'iPad Pro 13-inch (M5)'];
const results = [];
mkdirSync('.native-build/evidence', { recursive: true });
const save = () => writeFileSync('.native-build/evidence/ios-matrix.json', JSON.stringify({ at: new Date().toISOString(), scope: process.env.TRIALS_PROBE_FILE ?? 'Installed normal-app menu, deterministic clear twice, crash and logical restart; no touch/visual/performance acceptance', results }, null, 2) + '\n');
save();
for (const name of names) {
  const entry = Object.entries(devices).flatMap(([runtime, rows]) => rows.map(device => ({ runtime, device }))).find(row => row.device.name === name);
  if (!entry || (entry.device.state === 'Booted' && name !== 'trials-iphone')) {
    results.push({ name, status: 'unavailable', reason: entry ? 'Already in use; left running' : 'Profile not installed' });
    process.exitCode = 1;
    save();
    continue;
  }
  const { runtime, device } = entry;
  let result;
  try {
    result = spawnSync(process.execPath, ['scripts/native-ios-probe.mjs'], {
      env: { ...process.env, TRIALS_SIMULATOR: device.udid, TRIALS_PROBE_NO_INSTALL: '0' },
      encoding: 'utf8', timeout: 240000, maxBuffer: 4 * 1024 * 1024,
    });
    const output = result.stdout ?? '';
    const jsonStart = output.indexOf('\n{');
    const probe = jsonStart >= 0 ? JSON.parse(output.slice(jsonStart + 1)) : null;
    const passed = result.status === 0 && probe && probe.pass !== false;
    results.push({ name, runtime, deviceId: device.udid, status: passed ? 'passed' : 'failed', probe, error: result.error?.message ?? (result.status === 0 ? null : result.stderr) });
    if (!passed) process.exitCode = 1;
    console.log(`${name}: ${results.at(-1).status}`);
  } catch (error) {
    results.push({ name, runtime, deviceId: device.udid, status: 'failed', error: String(error) });
    process.exitCode = 1;
  } finally {
    if (device.state !== 'Booted') {
      try { sim('shutdown', device.udid); } catch { /* retain failure result, never erase a device */ }
    }
  }
  save();
}
