#!/usr/bin/env node
// Headless installed-app probe. Debug bridge executes supplied JS; Release builds omit it.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const device = process.env.TRIALS_SIMULATOR ?? 'F3058DD5-DCB6-4D86-93CC-6E56A785B788';
const appId = 'com.trialsgauntlet.game';
const app = path.resolve('.native-build/ios/Build/Products/Debug-iphonesimulator/App.app');
const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
const devices = JSON.parse(sim('list', 'devices', 'available', '--json')).devices;
const target = Object.values(devices).flat().find(d => d.udid === device);
if (!target) throw new Error('TRIALS_SIMULATOR must identify an available simulator.');
if (target.state !== 'Booted') sim('boot', device);
sim('bootstatus', device, '-b');
if (process.env.TRIALS_PROBE_NO_INSTALL !== '1') sim('install', device, app);
try { sim('terminate', device, appId); } catch { /* first launch */ }
const recording = readFileSync('harness/inputs/b1-first-ride/bot-3.json', 'utf8');
const crash = readFileSync('harness/inputs/flat-test/crash.json', 'utf8');
const script = process.env.TRIALS_PROBE_FILE ? readFileSync(process.env.TRIALS_PROBE_FILE, 'utf8') : `
const h = window.__trials;
const boot = {origin: location.origin, ready: h.ready, screen: h.app.screen(), hasSW: Boolean(navigator.serviceWorker?.controller), resources: performance.getEntriesByType('resource').map(x => x.name)};
const recording = ${JSON.stringify(recording)};
await h.loadTrack('b1-first-ride');
h.runRecording(recording);
const first = {time: h.finishTime(), hash: h.hashState(), phase: h.phase()};
h.runRecording(recording);
const second = {time: h.finishTime(), hash: h.hashState(), phase: h.phase()};
h.runRecording(${JSON.stringify(crash)});
const crashed = {phase: h.phase(), faults: h.faults()};
const before = performance.now();
h.restart();
const restartMs = performance.now()-before;
const restarted = {phase: h.phase(), frame: h.frame(), restartMs};
h.render();
return {probeAt: Date.now(), boot, first, second, crashed, restarted, replayEqual: first.time !== null && first.time === second.time && first.hash === second.hash};
`;
const container = sim('get_app_container', device, appId, 'data');
const report = path.join(container, 'Documents/native-probe.json');
const before = existsSync(report) ? readFileSync(report, 'utf8') : null;
execFileSync('xcrun', ['simctl', 'launch', device, appId], {
  env: {...process.env, SIMCTL_CHILD_TRIALS_PROBE_JS: script}, stdio: 'inherit',
});
const end = Date.now() + 150000;
while (Date.now() < end) {
  if (existsSync(report)) {
    const text = readFileSync(report, 'utf8');
    if (text !== before) {
      const result = JSON.parse(text);
      mkdirSync('.native-build/evidence', {recursive: true});
      writeFileSync('.native-build/evidence/ios-probe.json', text);
      console.log(text);
      if (result.error || (!process.env.TRIALS_PROBE_FILE && (!result.replayEqual || !result.crashed?.faults))) process.exitCode = 1;
      break;
    }
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!existsSync(report) || readFileSync(report, 'utf8') === before) throw new Error('Native probe did not return a fresh report.');
