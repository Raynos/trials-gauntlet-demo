#!/usr/bin/env node
/**
 * Installed normal-controller OTA qualification on a task-owned Android emulator.
 * Installs a prebuilt QA APK and CLEARS its app data; never use valuable saves.
 * Requires a running task emulator and the local HTTPS fixture server. Does not
 * build, boot or stop them. See docs/evidence/native-mobile/ota-fixtures.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { android, connectWebview, delay } from './native-android-probe.mjs';
import { selectFixture, setNetworkFixture } from './native-ota-fixtures.mjs';

export async function otaSuite({ serial = 'emulator-5554', apk = '.native-build/app-ota-round4.apk', fixtures = '.native-build/ota-fixtures-round4', config = '.native-build/ota-test-config.json', serverLog = '.native-build/ota-server-round4.log', output = '.native-build/android-ota-round4.json', mode = 'full' } = {}) {
  if (!['full', 'retry-proof'].includes(mode)) throw new Error('Mode must be full or retry-proof');
  const adb = android(serial);
  const appId = 'com.trialsgauntlet.game';
  const fixtureReport = JSON.parse(fs.readFileSync(path.join(fixtures, 'checks.json')));
  const rows = fixtureReport.fixtures.filter(r => r.platform === 'android');
  const row = name => { const found = rows.find(r => r.name === name); if (!found) throw new Error(`Missing fixture ${name}`); return found; };
  const report = { schema: 1, at: new Date().toISOString(), mode, pass: false, apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), fixtureSourceRevision: fixtureReport.sourceRevision, sequenceBase: fixtureReport.sequenceBase, environment: 'task-owned headless Android emulator; local trusted HTTPS; real installed update controller', cases: [], failures: [] };
  let client;
  const write = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
  const check = (name, pass, evidence) => { report.cases.push({ name, pass: Boolean(pass), evidence }); if (!pass) report.failures.push(name); write(); };
  const wait = async (label, predicate, timeout = 45000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { try { if (await predicate()) return Date.now() - start; } catch { /* Native reload can replace execution context. */ } await delay(500); }
    throw new Error(`Timed out: ${label}`);
  };
  const select = name => selectFixture({ config, out: fixtures, platform: 'android', case: name });
  const network = (value, extra = {}) => setNetworkFixture({ config, platform: 'android', mode: value, ...extra });
  const cursor = () => fs.statSync(serverLog).size;
  const traffic = offset => fs.readFileSync(serverLog).subarray(offset).toString().split('\n').flatMap(line => { try { const x = JSON.parse(line); return x.path?.startsWith('/android/') ? [x] : []; } catch { return []; } });
  const launch = async () => {
    client?.close(); client = null;
    adb('shell', 'am', 'force-stop', appId);
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    client = await connectWebview(serial);
    await client.waitFor('window.Capacitor?.Plugins?.CapacitorUpdater');
    try { await client.evaluate(`(async()=>{window.__otaSuiteEvents=[];for(const event of ['downloadFailed','downloadComplete','updateFailed'])await Capacitor.Plugins.CapacitorUpdater.addListener(event,data=>window.__otaSuiteEvents.push({event,data,at:Date.now()}));return true})()`); } catch { /* Activation may replace this context; native metadata/logs remain authoritative. */ }
    await wait('normal game ready', () => client.evaluate('window.__trials?.ready && !!window.__trials.app && !document.getElementById("loader")'), 60000);
  };
  const snapshot = () => client.evaluate(`(async()=>{const p=Capacitor.Plugins.CapacitorUpdater,u=Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('trials.nativeUpdates.'))),raw=Object.entries(u).find(([k])=>k.endsWith('.pending'))?.[1];let pending=null;if(raw){const a=JSON.parse(raw),m=JSON.parse(atob(a.envelope.payload.replace(/-/g,'+').replace(/_/g,'/')));pending={id:a.id,bundleId:m.bundleId,sequence:m.sequence}}return {at:Date.now(),current:(await p.current()).bundle,bundles:(await p.list()).bundles,rawBundles:(await p.list({raw:true})).bundles,marker:window.__nativeOtaFixture??null,ready:!!window.__trials?.ready&&!document.getElementById('loader'),screen:window.__trials?.app?.screen(),phase:window.__trials?.phase(),tick:window.__trials?.frame(),pending,sequence:Object.entries(u).find(([k])=>k.endsWith('.sequence'))?.[1]??null,events:window.__otaSuiteEvents??[],prefs:Object.fromEntries(['trials.bikeClass','trials.riderOutfit','trials.onboarded','trials.lastTrack'].map(k=>[k,localStorage.getItem(k)]))}})()`);
  const staged = name => wait(`${name} durably staged`, async () => (await snapshot()).pending?.bundleId === row(name).manifest.bundleId, 90000);
  const nativeSave = () => {
    const values = [];
    for (const slot of ['trials-save-a.json', 'trials-save-b.json']) { try { values.push(JSON.parse(adb('shell', 'run-as', appId, 'cat', `files/${slot}`))); } catch { /* Missing alternate slot is valid. */ } }
    return values.sort((a, b) => b.generation - a.generation)[0] ?? null;
  };
  const play = async () => {
    await client.evaluate('window.__trials.app.play("flat-test")');
    await wait('onboarding or run', () => client.evaluate('window.__trials.app.screen()==="run"'));
    if (await client.evaluate('document.querySelector(".onboard")?.classList.contains("show")')) {
      await wait('onboarding button live', () => client.evaluate('!!document.querySelector(".onboard.live button")'));
      await client.evaluate('document.querySelector(".onboard button").click()');
    }
    await wait('natural countdown completes', () => client.evaluate('window.__trials.phase()==="riding"'));
  };
  const samePreferences = s => JSON.stringify(s.prefs) === JSON.stringify(report.preferenceFixture);
  write();
  try {
    if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('Only task-owned emulator data may be reset');
    adb('install', '-r', path.resolve(apk));
    adb('shell', 'pm', 'clear', appId);
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
    adb('shell', 'svc', 'wifi', 'enable');
    await delay(1000);
    network('normal'); select('validA');
    const startA = cursor();
    await launch();
    if (mode === 'full') {
      await client.evaluate('window.__trials.app.goto("garage")');
      await wait('garage live', () => client.evaluate('!!document.querySelector(".garage-screen.live") || !!document.querySelector(".garage.live") || !!document.querySelector(".bike-chip[data-bike=pro]")?.closest(".live")'));
      await client.evaluate('document.querySelector(".bike-chip[data-bike=pro]").click(); document.querySelector(".outfit-button[data-outfit=race-bluewhite]").click()');
      await wait('saved blue rider selection', () => client.evaluate('window.__trials.info().render.riderOutfit==="race-bluewhite" && window.__trials.info().bike==="pro"'));
      await play();
      report.preferenceFixture = (await snapshot()).prefs;
      const durable = nativeSave();
      check('Preference fixture is saved by real game callbacks', report.preferenceFixture['trials.bikeClass'] === 'pro' && report.preferenceFixture['trials.riderOutfit'] === 'race-bluewhite' && Object.entries(report.preferenceFixture).every(([k, v]) => durable?.entries[k] === v), { prefs: report.preferenceFixture, durableGeneration: durable?.generation });
    }
    await staged('validA');
    const stagedA = await snapshot();
    const save = nativeSave();
    check('A stages without replacing builtin in the active launch', stagedA.current.id === 'builtin' && stagedA.marker === null && stagedA.pending?.bundleId === row('validA').manifest.bundleId && Object.entries(save?.entries ?? {}).some(([key, value]) => key.endsWith('.pending') && JSON.parse(value).id === stagedA.pending.id), { snapshot: stagedA, durableGeneration: save?.generation, requests: traffic(startA) });
    await launch();
    const activeA = await snapshot();
    check('A activates and acknowledges ready on next launch', activeA.marker === 'validA' && activeA.current.version === row('validA').manifest.bundleId && activeA.current.status === 'success' && !activeA.pending, activeA);
    if (!report.cases.at(-1).pass) throw new Error('Healthy A prerequisite failed');

    network('interrupt', { 'after-bytes': '32768' }); select('validB');
    const interruptCursor = cursor();
    await launch();
    await wait('server interrupts B transfer', async () => traffic(interruptCursor).some(x => x.fault === 'interrupt' && x.path.endsWith(`/${row('validB').manifest.sha256}.zip`)), 45000);
    await delay(1000); // Capture native state without assuming WorkManager retries are terminal errors.
    const interrupted = await snapshot();
    check('Interrupted B retains healthy A and does not stage', interrupted.marker === 'validA' && interrupted.current.status === 'success' && !interrupted.pending && interrupted.sequence === String(row('validA').manifest.sequence), { snapshot: interrupted, requests: traffic(interruptCursor) });
    network('normal');
    const retryCursor = cursor();
    await launch();
    let retryStaged = true;
    try { await staged('validB'); } catch { retryStaged = false; }
    const retried = await snapshot();
    check('A later healthy launch retries interrupted B successfully', retryStaged && retried.pending?.bundleId === row('validB').manifest.bundleId && retried.marker === 'validA', { snapshot: retried, requests: traffic(retryCursor) });
    if (!retryStaged || mode === 'retry-proof') return report;
    await launch();
    const activeB = await snapshot();
    check('B activates only on the next launch and keeps native preferences', activeB.marker === 'validB' && activeB.current.version === row('validB').manifest.bundleId && activeB.current.status === 'success' && samePreferences(activeB), activeB);
    if (!report.cases.at(-1).pass) throw new Error('Healthy B prerequisite failed');

    // Delay an intentional content rollback with a fresh higher sequence. The
    // normal controller remains in charge of checking, downloading and staging.
    network('delay', { 'delay-ms': '15000' }); select('intentionalRollback');
    const delayedCursor = cursor();
    await launch();
    await play();
    const duringDelay = await snapshot();
    await delay(750);
    const duringDelayLater = await snapshot();
    await staged('intentionalRollback');
    const stagedRollback = await snapshot();
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await client.waitFor('document.hidden && window.__trials.app.paused()');
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    await client.waitFor('!document.hidden');
    const foregroundStaged = await snapshot();
    check('Delayed download leaves a live B ride and does not activate on foreground', duringDelay.marker === 'validB' && duringDelayLater.marker === 'validB' && duringDelayLater.tick > duringDelay.tick && stagedRollback.current.version === row('validB').manifest.bundleId && foregroundStaged.current.version === row('validB').manifest.bundleId && foregroundStaged.pending?.bundleId === row('intentionalRollback').manifest.bundleId && samePreferences(foregroundStaged), { duringDelay, duringDelayLater, stagedRollback, foregroundStaged, requests: traffic(delayedCursor) });
    network('normal');
    await launch();
    const intentionalRollback = await snapshot();
    check('Higher signed sequence intentionally rolls content B back to healthy A', intentionalRollback.marker === 'validA' && intentionalRollback.current.version === row('intentionalRollback').manifest.bundleId && intentionalRollback.sequence === String(row('intentionalRollback').manifest.sequence) && intentionalRollback.current.status === 'success' && samePreferences(intentionalRollback), intentionalRollback);
    if (!report.cases.at(-1).pass) throw new Error('Intentional rollback prerequisite failed');

    for (const name of ['expired', 'incompatible', 'wrongSignature']) {
      select(name);
      const start = cursor();
      await launch();
      await wait(`${name} manifest requested`, async () => traffic(start).some(x => x.method === 'GET' && x.path.endsWith('/manifest.json')));
      await delay(6000);
      const observed = await snapshot();
      const requests = traffic(start);
      check(`${name} rejected before any archive GET`, requests.some(x => x.method === 'GET' && x.path.endsWith('/manifest.json')) && !requests.some(x => x.method === 'GET' && x.path.endsWith('.zip')) && !observed.pending && observed.sequence === String(row('intentionalRollback').manifest.sequence) && observed.current.id === intentionalRollback.current.id && samePreferences(observed), { observationAfterManifestMs: 6000, snapshot: observed, requests });
    }
    select('corruptZip');
    const corruptCursor = cursor();
    await launch();
    await wait('corrupt archive fails native download/checksum', async () => { const s = await snapshot(); return s.events.some(e => e.event === 'downloadFailed' && e.data.version === row('corruptZip').manifest.bundleId) || s.rawBundles.some(b => b.version === row('corruptZip').manifest.bundleId && b.status === 'error'); }, 90000);
    const corrupt = await snapshot();
    check('Corrupted archive rejected without activating or advancing sequence', !corrupt.pending && corrupt.current.id === intentionalRollback.current.id && corrupt.sequence === String(row('intentionalRollback').manifest.sequence) && samePreferences(corrupt), { snapshot: corrupt, requests: traffic(corruptCursor) });

    // This is the only direct download: create a genuine abandoned native
    // pending bundle with no application pending pointer for cleanup coverage.
    select('intentionalRollback');
    await launch();
    const orphan = selectFixture({ config, out: fixtures, platform: 'android', case: 'orphan', 'archive-only': 'true' });
    const orphanDownload = await client.evaluate(`Capacitor.Plugins.CapacitorUpdater.download(${JSON.stringify({ url: orphan.url, checksum: orphan.checksum, version: orphan.bundleId })})`);
    const beforeCleanup = await snapshot();
    check('Orphan fixture exists as pending without an app pending pointer', orphanDownload.status === 'pending' && !beforeCleanup.pending && beforeCleanup.bundles.some(b => b.id === orphanDownload.id && b.status === 'pending'), { downloaded: orphanDownload, snapshot: beforeCleanup });
    await launch();
    await wait('orphan cleanup removes abandoned directory', async () => !(await snapshot()).bundles.some(b => b.id === orphanDownload.id));
    const afterCleanup = await snapshot();
    check('Healthy boot removes orphan and keeps active bundle plus preferences', afterCleanup.current.id === intentionalRollback.current.id && afterCleanup.current.status === 'success' && !afterCleanup.pending && samePreferences(afterCleanup), { orphanId: orphanDownload.id, snapshot: afterCleanup });

    select('brokenStartup');
    const brokenCursor = cursor();
    await launch();
    await staged('brokenStartup');
    const stagedBroken = await snapshot();
    check('Broken startup fixture stages while healthy A remains active', stagedBroken.current.id === intentionalRollback.current.id && stagedBroken.pending?.bundleId === row('brokenStartup').manifest.bundleId && samePreferences(stagedBroken), stagedBroken);
    client.close(); client = null;
    adb('shell', 'am', 'force-stop', appId);
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    client = await connectWebview(serial);
    await wait('broken startup marker is actually active', () => client.evaluate('window.__nativeOtaFixture==="brokenStartup" && !window.__trials?.ready'), 60000);
    const failedReadyAt = Date.now();
    report.watchdog = { failedReadyAt: new Date(failedReadyAt).toISOString(), configuredTimeoutMs: 120000 };
    write();
    await wait('native watchdog returns to previous healthy A', () => client.evaluate('window.__nativeOtaFixture==="validA" && window.__trials?.ready && !document.getElementById("loader")'), 180000);
    const restored = await snapshot();
    report.watchdog.observedRecoveryMs = Date.now() - failedReadyAt;
    check('Failed-ready watchdog restores the previous healthy bundle and saves', report.watchdog.observedRecoveryMs >= 110000 && restored.current.id === intentionalRollback.current.id && restored.current.status === 'success' && !restored.pending && restored.sequence === String(row('brokenStartup').manifest.sequence) && samePreferences(restored), { watchdog: report.watchdog, snapshot: restored, requests: traffic(brokenCursor) });
    const laterCursor = cursor();
    await launch();
    await delay(3000);
    const later = await snapshot();
    check('Later cold launch does not re-download or reactivate failed startup', later.current.id === intentionalRollback.current.id && later.current.status === 'success' && !later.pending && later.sequence === String(row('brokenStartup').manifest.sequence) && samePreferences(later) && !traffic(laterCursor).some(x => x.method === 'GET' && x.path.endsWith('.zip')), { snapshot: later, requests: traffic(laterCursor) });
    const finalSave = nativeSave();
    check('Native filesystem snapshot retains the original preference fixture', Object.entries(report.preferenceFixture).every(([key, value]) => finalSave?.entries[key] === value), { generation: finalSave?.generation, prefs: Object.fromEntries(Object.keys(report.preferenceFixture).map(key => [key, finalSave?.entries[key]])) });
  } catch (error) { report.error = String(error?.stack ?? error); report.failures.push(report.error); }
  finally {
    network('normal');
    try { client?.close(); } catch { /* App may have reloaded/exited. */ }
    report.finishedAt = new Date().toISOString();
    report.pass = report.failures.length === 0;
    report.limitations = ['Local HTTPS fixture server and a task-owned emulator; production hosting, signing account and physical-device behavior were not tested.', 'Game UI callbacks create preferences and launch rides; native updater set/next/notifyReady are never called by the harness.', 'The orphan fixture alone uses native download directly; all advertised releases use the production signed-manifest controller.', 'No-request assertions cover the recorded launch observation window. Visual quality and audible output are not inferred.'];
    write();
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const name = process.argv[i], value = process.argv[i + 1];
      const key = ({ '--serial': 'serial', '--apk': 'apk', '--fixtures': 'fixtures', '--config': 'config', '--server-log': 'serverLog', '--output': 'output', '--mode': 'mode' })[name];
      if (!key || !value) throw new Error(`Unknown/missing argument ${name}`);
      options[key] = value;
    }
    const r = await otaSuite(options);
    console.log(JSON.stringify({ pass: r.pass, cases: r.cases.map(x => ({ name: x.name, pass: x.pass })), failures: r.failures, output: options.output ?? '.native-build/android-ota-round4.json' }, null, 2));
    if (!r.pass) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
