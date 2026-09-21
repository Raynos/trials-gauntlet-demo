#!/usr/bin/env node
/** Installed OTA ZIP-write ENOSPC on a bounded task-app tmpfs, followed by
 * identical-publication retry and durable failed-start quarantine. Requires a
 * running task API36 emulator and the local signed fixture server. No builds,
 * shared partitions, save relocation, or direct updater activation calls.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { android, connectWebview, delay } from './native-android-probe.mjs';
import { selectFixture, setNetworkFixture } from './native-ota-fixtures.mjs';

const options = { serial: 'emulator-5554', apk: '.native-build/qa-round10/app-debug-trusted.apk', fixtures: '.native-build/ota-fixtures-round10', config: '.native-build/ota-test-config.json', 'server-log': '.native-build/ota-server-round10.log', output: '.native-build/android-ota-round10/report.json', 'reuse-case': 'brokenStartupRetry', resume: 'false' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw Error('Unknown/missing option');
  options[key] = process.argv[i + 1];
}
const adb = android(options.serial), appId = 'com.trialsgauntlet.game';
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
const adbPath = path.join(sdk, 'platform-tools/adb');
const q = s => "'" + String(s).replaceAll("'", "'\\''") + "'";
const remote = args => execFileSync(adbPath, ['-s', options.serial, 'shell', args.map(q).join(' ')], { encoding: 'utf8', timeout: 30000 }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const app = (...args) => adb('shell', 'run-as', appId, ...args);
const fixtureReport = JSON.parse(fs.readFileSync(path.join(options.fixtures, 'checks.json')));
const row = name => {
  const result = fixtureReport.fixtures.find(x => x.platform === 'android' && x.name === name);
  if (!result) throw Error(`Missing Android fixture ${name}`);
  return result;
};
const select = name => selectFixture({ config: options.config, out: options.fixtures, platform: 'android', case: name });
const network = (mode, extra = {}) => setNetworkFixture({ config: options.config, platform: 'android', mode, ...extra });
const token = randomUUID().slice(0, 8), dir = `native-ota-enospc-${token}`, target = `${dir}/download.tmp`, cap = 262144;
const report = { schema: 1, at: new Date().toISOString(), pass: false, apkSha256: hash(fs.readFileSync(options.apk)), sourceRevision: fixtureReport.sourceRevision, sequenceBase: fixtureReport.sequenceBase, capBytes: cap, cases: [], limitations: ['Task-owned API36 emulator and locally signed HTTPS fixtures; production hosting, physical devices and App Store distribution are not qualified.', 'This exhausts only a256KiB app-namespace tmpfs at the real OTA temporary ZIP path. Saves and active/fallback bundles remain on the original filesystem.', 'Android native ENOSPC is classified as a WorkManager retry, not necessarily terminal bundle error. Installed recovery and durable failed-start quarantine are separate assertions.', 'No direct native set/next/notifyAppReady calls; the real cold-launch controller stages and activates releases.'] };
const outputDir = path.dirname(options.output);
fs.mkdirSync(outputDir, { recursive: true });
const write = () => fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n');
const check = (name, pass, evidence) => { report.cases.push({ name, pass: !!pass, evidence }); write(); if (!pass) throw Error(name); };
const wait = async (label, predicate, timeout = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { try { if (await predicate()) return Date.now() - start; } catch { /* Reload may replace execution context. */ } await delay(250); }
  throw Error(`Timed out: ${label}`);
};
let client, appPid, keeperPid, keeper, logcat, tracer, tracerPid, mounted = false, directoryCreated = false, tempLinked = false, mountPath, rootPath, temp, hold;
const ns = (...args) => remote(['su', '0', 'nsenter', '-t', keeperPid ?? appPid, '-m', '--', ...args]);
const fsinfo = p => {
  const [type, blockSize, blocks, availableBlocks] = ns('stat', '-f', '-c', '%T:%S:%b:%a', p).split(':');
  return { type, capacityBytes: +blockSize * +blocks, availableBytes: +blockSize * +availableBlocks, device: ns('stat', '-c', '%d', p) };
};
const saves = () => ['a', 'b'].flatMap(slot => {
  try { const text = app('cat', `files/trials-save-${slot}.json`); return [{ slot, sha256: hash(text), ...JSON.parse(text) }]; } catch { return []; }
}).sort((a, b) => b.generation - a.generation);
const nonUpdate = value => Object.fromEntries(Object.entries(value?.entries ?? {}).filter(([key]) => !key.startsWith('trials.nativeUpdates.')));
const snapshot = () => client.evaluate(`(async()=>{const p=Capacitor.Plugins.CapacitorUpdater,u=Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('trials.nativeUpdates.'))),raw=Object.entries(u).find(([k])=>k.endsWith('.pending'))?.[1];let pending=null;if(raw){const x=JSON.parse(raw),m=JSON.parse(atob(x.envelope.payload.replace(/-/g,'+').replace(/_/g,'/')));pending={id:x.id,bundleId:m.bundleId,sequence:m.sequence}}return {current:(await p.current()).bundle,bundles:(await p.list()).bundles,rawBundles:(await p.list({raw:true})).bundles,marker:window.__nativeOtaFixture??null,ready:!!window.__trials?.ready&&!document.getElementById('loader'),pending,sequence:Object.entries(u).find(([k])=>k.endsWith('.sequence'))?.[1]??null,activations:Object.entries(u).find(([k])=>k.endsWith('.activations'))?.[1]??null,volume:localStorage.getItem('trials.volume'),events:window.__otaLowSpaceEvents??[]}})()`);
const launch = async () => {
  client?.close(); client = null;
  adb('shell', 'am', 'force-stop', appId); adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
  appPid = adb('shell', 'pidof', appId); client = await connectWebview(options.serial);
  await wait('healthy game boot', () => client.evaluate('window.__trials?.ready&&!document.getElementById("loader")'));
  await client.evaluate(`(async()=>{window.__otaLowSpaceEvents=[];for(const e of ['downloadFailed','downloadComplete','updateFailed'])await Capacitor.Plugins.CapacitorUpdater.addListener(e,data=>window.__otaLowSpaceEvents.push({event:e,data,at:Date.now()}));return true})()`);
};
const staged = name => wait(`${name} staged`, async () => {
  const observed = await snapshot();
  const durablePending = Object.entries(saves()[0]?.entries ?? {}).find(([key]) => key.startsWith('trials.nativeUpdates.') && key.endsWith('.pending'))?.[1];
  return observed.pending?.bundleId === row(name).manifest.bundleId && durablePending && JSON.parse(durablePending).id === observed.pending.id;
}, 120000);
const pluginWrite = (file, data) => client.evaluate(`(async()=>{try{return {result:await Capacitor.Plugins.Filesystem.writeFile({path:${JSON.stringify(file)},directory:'LIBRARY',encoding:'utf8',data:${JSON.stringify(data)}})}}catch(e){return {error:{code:e.code,message:e.message}}}})()`);
const settings = async () => { await client.evaluate('window.__trials.app.goto("settings")'); await client.waitFor('!!document.querySelector(".settings-screen.live")'); };
const cleanupLink = () => {
  if (!tempLinked) return;
  let actual;
  try { actual = app('readlink', `files/${temp}`); } catch { /* Native cleanup can already have removed the link. */ }
  if (actual && actual !== target) throw Error('Refuse removing changed OTA fixture link');
  if (actual) app('rm', `files/${temp}`);
  tempLinked = false;
};
const releaseMount = () => {
  cleanupLink();
  if (mounted) { ns('umount', mountPath); mounted = false; }
  if (directoryCreated) { app('rmdir', `files/${dir}`); directoryCreated = false; }
  if (keeperPid) { remote(['su', '0', 'kill', keeperPid]); keeperPid = null; }
};
const traffic = offset => fs.readFileSync(options['server-log']).subarray(offset).toString().split('\n').flatMap(line => { try { const x = JSON.parse(line); return x.path?.startsWith('/android/') ? [x] : []; } catch { return []; } });
try {
  if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1' || adb('emu', 'avd', 'name').split('\n')[0].trim() !== 'trials_gauntlet_api36') throw Error('Only designated task API36 emulator supported');
  report.originalNetwork = { airplane: adb('shell', 'settings', 'get', 'global', 'airplane_mode_on'), wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on') };
  report.originalSaves = saves();
  report.originalHighWater = Object.entries(report.originalSaves[0]?.entries ?? {}).filter(([key]) => key.startsWith('trials.nativeUpdates.') && key.endsWith('.sequence'));
  if (report.originalHighWater.some(([, value]) => !Number.isSafeInteger(Number(value)) || (Number(value) >= fixtureReport.sequenceBase && !(options.resume === 'true' && Number(value) === row('validA').manifest.sequence)))) throw Error('Fresh fixtures must exceed existing high-water; explicit resume permits only healthy A sequence');
  write();
  adb('install', '-r', '-d', path.resolve(options.apk));
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'); adb('shell', 'svc', 'wifi', 'enable');
  network('normal'); select('validA'); await launch();
  if (options.resume !== 'true') { await staged('validA'); await launch(); }
  else if ((await snapshot()).current.version !== row('validA').manifest.bundleId) throw Error('Explicit resume requires already active healthy A');
  await wait('A ready acknowledgement committed', async () => { const s = await snapshot(); return s.current.status === 'success' && (!s.activations || s.activations === '[]'); });
  report.baseline = await snapshot();
  check('Healthy A activates and clears its acknowledged activation journal', report.baseline.marker === 'validA' && report.baseline.current.status === 'success' && !report.baseline.pending && (!report.baseline.activations || report.baseline.activations === '[]'), report.baseline);
  await settings();
  await client.evaluate(`(()=>{for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<3;i++)document.querySelector('.settings-screen [aria-label="louder"]').click()})()`);
  await wait('volume durably0.3', () => saves()[0]?.entries['trials.volume'] === '0.3');
  report.before = saves();

  // Mount before beginning the request, but only inside this private directory.
  const identity = app('id'), uid = Number(identity.match(/uid=(\d+)/)?.[1]), gid = Number(identity.match(/gid=(\d+)/)?.[1]);
  if (!uid || !gid) throw Error('Non-root app identity required');
  rootPath = ns('readlink', '-f', `/data/user/0/${appId}/files`);
  if (rootPath !== `/data/data/${appId}/files`) throw Error('Unexpected canonical app files path');
  mountPath = `${rootPath}/${dir}`;
  report.environment = { identity, rootPath, selinux: adb('shell', 'getenforce'), appNamespace: remote(['su', '0', 'readlink', `/proc/${appPid}/ns/mnt`]), initNamespace: remote(['su', '0', 'readlink', '/proc/1/ns/mnt']) };
  if (report.environment.appNamespace === report.environment.initNamespace) throw Error('App namespace must be isolated');
  report.coveringMounts = remote(['su', '0', 'cat', `/proc/${appPid}/mountinfo`]).split('\n').filter(line => { const p = line.split(' ')[4]; return p === '/' || rootPath === p || rootPath.startsWith(p + '/'); });
  if (report.coveringMounts.some(line => / shared:\d/.test(line))) throw Error('Shared ancestor could propagate mount');
  keeper = spawn(adbPath, ['-s', options.serial, 'shell', ['su', '0', 'nsenter', '-t', appPid, '-m', '--', 'sh', '-c', 'echo $$; exec sleep 600'].map(q).join(' ')], { stdio: ['ignore', 'pipe', 'pipe'] });
  keeperPid = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Namespace keeper timeout')), 5000); keeper.stdout.once('data', data => { clearTimeout(timer); const pid = data.toString().trim(); if (/^\d+$/.test(pid)) resolve(pid); else reject(Error('Invalid keeper PID')); }); keeper.once('error', reject); });
  app('mkdir', `files/${dir}`); directoryCreated = true;
  ns('mount', '-t', 'tmpfs', '-o', `size=${cap},mode=0700,uid=${uid},gid=${gid},nosuid,nodev,noexec`, 'native-ota-enospc', mountPath); mounted = true;
  ns('chcon', app('ls', '-Zd', 'files').split(/\s+/)[0], mountPath);
  report.parentFs = fsinfo(rootPath); report.emptyFs = fsinfo(mountPath);
  check('Private OTA target is distinct tmpfs capped at256KiB', report.emptyFs.type === 'tmpfs' && report.emptyFs.capacityBytes === cap && report.emptyFs.availableBytes > 0 && report.emptyFs.device !== report.parentFs.device, { parent: report.parentFs, fixture: report.emptyFs });
  report.preflight = await pluginWrite(target, 'real app can write');
  check('Real app UID can write isolated target before filling', !report.preflight.error, report.preflight);
  const truncate = await pluginWrite(target, ''); if (truncate.error) throw Error(JSON.stringify(truncate));
  const guard = fsinfo(mountPath); if (guard.type !== 'tmpfs' || guard.capacityBytes !== cap || guard.device === report.parentFs.device) throw Error('Filesystem guard changed');
  try { report.fillOutput = ns('dd', 'if=/dev/zero', `of=${mountPath}/fill`, 'bs=4096', 'count=65'); } catch (error) { report.fillOutput = String(error.stderr ?? error.message); }
  report.fullFs = fsinfo(mountPath);
  check('Bounded filesystem is full with kernel ENOSPC', report.fullFs.availableBytes === 0 && /ENOSPC|No space left/i.test(report.fillOutput), { filesystem: report.fullFs, diagnostic: report.fillOutput });

  // The native controller runs at cold launch. Keep this process/mount namespace
  // by reloading its WebView, a document cold boot without force-stopping Android.
  const publication = select('validB');
  hold = network('hold', { path: new URL(publication.url).pathname });
  const beforeFiles = app('ls', 'files').split(/\s+/), beforeBundles = report.baseline.rawBundles.map(x => x.id);
  const logPath = path.join(outputDir, 'native-logcat.txt'), fd = fs.openSync(logPath, 'w');
  logcat = spawn(adbPath, ['-s', options.serial, 'logcat', '-v', 'epoch', '--pid', appPid, '-T', '1'], { stdio: ['ignore', fd, fd] }); fs.closeSync(fd);
  await client.send('Page.reload', { ignoreCache: true });
  await wait('held validB archive GET', () => { if (!fs.existsSync(hold.statusPath)) return false; const s = JSON.parse(fs.readFileSync(hold.statusPath)); return s.status === 'held' && s.holdId === hold.holdId && s.platform === 'android' && s.path === new URL(publication.url).pathname; }, 45000);
  report.hold = JSON.parse(fs.readFileSync(hold.statusPath));
  await wait('new native downloading bundle', async () => (await snapshot()).rawBundles.some(x => x.version === publication.bundleId && x.status === 'downloading' && !beforeBundles.includes(x.id)));
  const downloading = (await snapshot()).rawBundles.filter(x => x.version === publication.bundleId && x.status === 'downloading' && !beforeBundles.includes(x.id));
  if (downloading.length !== 1 || !/^[A-Za-z0-9]+$/.test(downloading[0].id)) throw Error('Ambiguous downloading bundle');
  temp = `temp_${downloading[0].id}.tmp`;
  if (beforeFiles.includes(temp)) throw Error('Temp path predates fixture');
  if (app('ls', 'files').split(/\s+/).includes(temp)) { if (app('stat', '-c', '%s', `files/${temp}`) !== '0') throw Error('Refuse redirecting nonempty temp'); app('rm', `files/${temp}`); }
  app('ln', '-s', target, `files/${temp}`); tempLinked = true;
  report.redirect = { nativeId: downloading[0].id, path: temp, target, resolved: ns('readlink', '-f', `${rootPath}/${temp}`) };
  if (report.redirect.resolved !== `${mountPath}/download.tmp`) throw Error('Temp path escaped bounded target');
  const diagnostic = await pluginWrite(temp, 'ENOSPC diagnostic');
  check('Real app ZIP target reports ENOSPC before server release', /ENOSPC|No space left/i.test(diagnostic.error?.message ?? ''), diagnostic);
  // Trace only after the independent diagnostic: the next write to this exact
  // target is DownloadService consuming the held ZIP. Strings are suppressed.
  const tracePath = path.join(outputDir, 'updater-write.strace'), traceFd = fs.openSync(tracePath, 'w');
  const traceCommand = `echo $$; exec strace -f -yy -s 0 -e trace=openat,write,writev,pwrite64,close -p ${appPid}`;
  tracer = spawn(adbPath, ['-s', options.serial, 'shell', ['su', '0', 'timeout', '30', 'sh', '-c', traceCommand].map(q).join(' ')], { stdio: ['ignore', 'pipe', traceFd] }); fs.closeSync(traceFd);
  tracerPid = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Trace PID timeout')), 5000); tracer.stdout.once('data', data => { clearTimeout(timer); const pid = data.toString().trim(); if (/^\d+$/.test(pid)) resolve(pid); else reject(Error('Invalid trace PID')); }); tracer.once('error', reject); });
  await wait('bounded syscall trace attached', () => /attached/.test(fs.readFileSync(tracePath, 'utf8')), 5000);
  network('release', { 'hold-id': hold.holdId });
  await wait('native DownloadService ZIP write ENOSPC', () => fs.readFileSync(tracePath, 'utf8').split('\n').some(line => line.includes(`${mountPath}/download.tmp`) && /write\(/.test(line) && /= -1 ENOSPC/.test(line)), 20000);
  report.nativeEnospc = fs.readFileSync(tracePath, 'utf8').split('\n').filter(line => line.includes(`${mountPath}/download.tmp`) && /ENOSPC|openat/.test(line));
  report.trace = { path: tracePath, pid: tracerPid, maxSeconds: 30, stringBytes: 0, scope: 'existing task app PID and threads only, attached after diagnostic and before held archive release' };
  remote(['su', '0', 'kill', '-INT', tracerPid]); tracerPid = null;
  report.failedDownload = await snapshot(); report.afterFailure = saves();
  check('Native ZIP ENOSPC leaves healthy bundle, saves and high-water unchanged', report.failedDownload.current.id === report.baseline.current.id && !report.failedDownload.pending && report.failedDownload.sequence === report.baseline.sequence && report.before.every(a => report.afterFailure.find(b => b.slot === a.slot)?.sha256 === a.sha256), { snapshot: report.failedDownload, log: report.nativeEnospc });
  await settings(); await client.evaluate('document.querySelector(\'.settings-screen [aria-label="louder"]\').click()');
  await wait('ordinary save succeeds while OTA target full', () => saves()[0]?.entries['trials.volume'] === '0.4');
  report.saveDuringFailure = saves()[0];
  check('Gameplay settings remain durable while only OTA storage is full', report.saveDuringFailure.entries['trials.volume'] === '0.4' && Object.entries(nonUpdate(report.before[0])).every(([key, value]) => key === 'trials.volume' || report.saveDuringFailure.entries[key] === value), { generation: report.saveDuringFailure.generation, volume: '0.4' });
  releaseMount(); logcat.kill(); logcat = null; network('normal');
  report.samePublication = { before: publication, retry: select('validB') };
  await launch(); await staged('validB'); report.retried = await snapshot();
  check('Identical signed publication stages after removing ENOSPC', JSON.stringify(report.samePublication.before) === JSON.stringify(report.samePublication.retry) && report.retried.pending?.bundleId === publication.bundleId && report.retried.current.id === report.baseline.current.id, report.retried);
  await launch();
  await wait('B ready acknowledgement committed', async () => { const s = await snapshot(); return s.current.status === 'success' && (!s.activations || s.activations === '[]'); });
  report.activeB = await snapshot();
  check('Retried B activates at next launch with saved preference', report.activeB.marker === 'validB' && report.activeB.current.status === 'success' && report.activeB.volume === '0.4' && !report.activeB.pending && (!report.activeB.activations || report.activeB.activations === '[]'), report.activeB);

  select('brokenStartup'); await launch(); await staged('brokenStartup');
  client.close(); client = null; adb('shell', 'am', 'force-stop', appId); adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`); client = await connectWebview(options.serial);
  await wait('broken startup active without acknowledgement', () => client.evaluate('window.__nativeOtaFixture==="brokenStartup"&&!window.__trials?.ready'));
  const failedAt = Date.now(); report.watchdog = { configuredMs: 120000, failedAt: new Date(failedAt).toISOString(), durableActivationSave: saves()[0] }; write();
  await wait('native watchdog restores healthy B', () => client.evaluate('window.__nativeOtaFixture==="validB"&&window.__trials?.ready&&!document.getElementById("loader")'), 180000);
  report.watchdog.recoveryMs = Date.now() - failedAt; report.recovered = await snapshot();
  check('Native watchdog rolls back while failed version remains durably quarantined', report.watchdog.recoveryMs >= 110000 && report.recovered.current.id === report.activeB.current.id && report.recovered.current.status === 'success' && report.recovered.activations?.includes(row('brokenStartup').manifest.bundleId) && report.recovered.volume === '0.4', { watchdog: report.watchdog, snapshot: report.recovered });
  const reused = row(options['reuse-case']);
  if (reused.manifest.bundleId !== row('brokenStartup').manifest.bundleId || reused.manifest.sequence <= row('brokenStartup').manifest.sequence) throw Error('Reuse fixture must advertise same failed version at higher sequence');
  select(options['reuse-case']); const cursor = fs.statSync(options['server-log']).size;
  await launch(); await wait('higher-sequence manifest GET', () => traffic(cursor).some(x => x.method === 'GET' && x.path.endsWith('/manifest.json'))); await delay(6000);
  report.reuse = { fixture: reused.manifest, snapshot: await snapshot(), requests: traffic(cursor) };
  check('Higher-sequence reuse of failed startup is blocked before archive GET', !report.reuse.requests.some(x => x.method === 'GET' && x.path.endsWith('.zip')) && report.reuse.snapshot.current.id === report.activeB.current.id && !report.reuse.snapshot.pending && report.reuse.snapshot.sequence === String(row('brokenStartup').manifest.sequence) && report.reuse.snapshot.activations?.includes(reused.manifest.bundleId), report.reuse);
  report.finalSave = saves()[0];
  check('OTA failure and rollback preserve all non-update gameplay entries', JSON.stringify(nonUpdate(report.finalSave)) === JSON.stringify(nonUpdate(report.saveDuringFailure)), { before: nonUpdate(report.saveDuringFailure), after: nonUpdate(report.finalSave) });
  report.pass = true;
} catch (error) { report.error = String(error.stack ?? error); }
finally {
  report.cleanupErrors = [];
  try { network('normal'); } catch (error) { report.cleanupErrors.push(String(error)); }
  try { if (tracerPid) { remote(['su', '0', 'kill', '-INT', tracerPid]); tracerPid = null; } } catch (error) { report.cleanupErrors.push(String(error)); }
  try { releaseMount(); } catch (error) { report.cleanupErrors.push(String(error)); }
  try { logcat?.kill(); client?.close(); } catch (error) { report.cleanupErrors.push(String(error)); }
  try {
    if (report.originalNetwork) { adb('shell', 'cmd', 'connectivity', 'airplane-mode', report.originalNetwork.airplane === '1' ? 'enable' : 'disable'); adb('shell', 'svc', 'wifi', report.originalNetwork.wifi === '1' ? 'enable' : 'disable'); }
    report.cleanup = { mounted, directoryCreated, tempLinked, keeperPid, tracerPid, traceExitCode: tracer?.exitCode, selinux: adb('shell', 'getenforce'), remainingFixture: app('ls', 'files').split(/\s+/).includes(dir) };
  } catch (error) { report.cleanupErrors.push(String(error)); }
  if (report.cleanupErrors.length || mounted || directoryCreated || tempLinked || keeperPid) report.pass = false;
  report.finishedAt = new Date().toISOString(); write();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(({ name, pass }) => ({ name, pass })), error: report.error, cleanupErrors: report.cleanupErrors, output: options.output }, null, 2));
if (!report.pass) process.exitCode = 1;
