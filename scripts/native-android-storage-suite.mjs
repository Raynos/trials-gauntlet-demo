#!/usr/bin/env node
/** Actual native write-failure/retry on a disposable task emulator. Preserves committed saves.
 * Installs the supplied normal debug APK without clearing app data. Creates an empty
 * directory at files/trials-save-pending.json, then removes ONLY that test directory.
 * This is an EISDIR write failure, not disk exhaustion or permission-denial proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { android, connectWebview, delay } from './native-android-probe.mjs';
const options = { serial: 'emulator-5554', apk: 'android/app/build/outputs/apk/debug/app-debug.apk', output: '.native-build/android-storage-round5.json' };
for (let i = 2; i < process.argv.length; i += 2) { const key = process.argv[i].replace(/^--/, ''); if (!(key in options) || !process.argv[i + 1]) throw Error('Unknown/missing option'); options[key] = process.argv[i + 1]; }
const adb = android(options.serial), appId = 'com.trialsgauntlet.game', temporary = 'files/trials-save-pending.json';
const report = { schema: 1, at: new Date().toISOString(), pass: false, apkSha256: createHash('sha256').update(fs.readFileSync(options.apk)).digest('hex'), cases: [], fault: 'Empty directory at files/trials-save-pending.json blocks an actual native write (EISDIR).', limitations: ['Task-owned API36 headless emulator Debug build; Settings and retry DOM handlers, not OS touches.', 'EISDIR is not full-disk or permission-denial qualification. Selected committed save entries are preserved.'] };
let client, obstructed = false;
const write = () => { fs.mkdirSync(path.dirname(options.output), { recursive: true }); fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n'); };
const check = (name, pass, evidence) => { report.cases.push({ name, pass: !!pass, evidence }); write(); if (!pass) throw Error(name); };
const snapshots = () => ['a', 'b'].flatMap(slot => { try { return [{ slot, ...JSON.parse(adb('shell', 'run-as', appId, 'cat', `files/trials-save-${slot}.json`)) }]; } catch { return []; } }).sort((a, b) => b.generation - a.generation);
const launch = async () => { client?.close(); adb('shell', 'am', 'force-stop', appId); adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`); client = await connectWebview(options.serial); await client.waitFor('window.__trials?.ready && !document.getElementById("loader")'); };
try {
  if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw Error('Task emulator required');
  adb('install', '-r', '-d', path.resolve(options.apk));
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'); adb('shell', 'svc', 'wifi', 'disable');
  await launch(); await client.waitFor('!!document.querySelector(".native-save-notice")');
  await client.evaluate('window.__trials.app.goto("settings")'); await client.waitFor('!!document.querySelector(".settings-screen.live")');
  await client.evaluate(`(()=>{for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<4;i++)document.querySelector('.settings-screen [aria-label="louder"]').click()})()`);
  await delay(1500);
  report.before = snapshots();
  check('Selected Settings volume is committed before obstruction', report.before[0]?.entries['trials.volume'] === '0.4', { generation: report.before[0]?.generation, volume: report.before[0]?.entries['trials.volume'] });
  if (adb('shell', 'run-as', appId, 'ls', 'files').split(/\s+/).includes('trials-save-pending.json')) throw Error('Pending path exists; preserve it instead of overwriting');
  adb('shell', 'run-as', appId, 'mkdir', temporary); obstructed = true;
  await client.evaluate('document.querySelector(\'.settings-screen [aria-label="louder"]\').click()');
  await client.waitFor('!document.querySelector(".native-save-notice").hidden');
  report.failure = await client.evaluate(`({volume:localStorage.getItem('trials.volume'),ready:window.__trials.ready,warningVisible:!document.querySelector('.native-save-notice').hidden,text:document.querySelector('.native-save-notice span').textContent,retry:document.querySelector('.native-save-notice button').textContent})`);
  report.failureGeometry = await client.evaluate(`(()=>{const notice=document.querySelector('.native-save-notice'),button=notice.querySelector('button'),box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}},b=box(button),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},notice:box(notice),button:b,buttonCenterHit:hit===button||button.contains(hit),computedVisibility:getComputedStyle(notice).visibility}})()`);
  const screenshot=options.output.replace(/\.json$/, '-warning.png');
  const sdk=process.env.ANDROID_HOME??path.join(os.homedir(),'Library/Android/sdk');
  fs.writeFileSync(screenshot,execFileSync(path.join(sdk,'platform-tools/adb'),['-s',options.serial,'exec-out','screencap','-p'],{timeout:30000}));
  report.warningScreenshot=screenshot;
  adb('shell','uiautomator','dump','/sdcard/native-storage-layout.xml');
  report.nativeLayoutXml=adb('shell','cat','/sdcard/native-storage-layout.xml');
  adb('shell','rm','/sdcard/native-storage-layout.xml');
  report.duringFailure = snapshots();
  report.nativeFailureLogs = adb('shell', 'logcat', '-d', '--pid', adb('shell', 'pidof', appId), '-t', '1000').split('\n').filter(line => /EISDIR|Is a directory|Unable to write|Error writing/.test(line)).slice(-12);
  check('Actual native write failure displays actionable retry notice', report.failure.warningVisible && report.failure.volume === '0.5' && report.failure.retry === 'Retry save', report.failure);
  check('Write failure preserves both committed snapshots byte for byte', JSON.stringify(report.before) === JSON.stringify(report.duringFailure), { generationsBefore: report.before.map(s => s.generation), generationsAfter: report.duringFailure.map(s => s.generation) });
  adb('shell', 'run-as', appId, 'rmdir', temporary); obstructed = false;
  await client.evaluate('document.querySelector(".native-save-notice button").click()');
  await client.waitFor('document.querySelector(".native-save-notice").hidden');
  report.afterRetry = snapshots();
  const preserved = Object.entries(report.before[0].entries).filter(([key]) => key !== 'trials.volume').every(([key, value]) => report.afterRetry[0].entries[key] === value);
  check('Retry commits new volume and preserves other selected state', report.afterRetry[0]?.generation > report.before[0].generation && report.afterRetry[0]?.entries['trials.volume'] === '0.5' && preserved, { beforeGeneration: report.before[0].generation, afterGeneration: report.afterRetry[0]?.generation, otherEntriesPreserved: preserved });
  await launch();
  report.coldLaunch = await client.evaluate(`(async()=>({volume:localStorage.getItem('trials.volume'),ready:window.__trials.ready,warningVisible:!document.querySelector('.native-save-notice').hidden,online:navigator.onLine,platform:Capacitor.getPlatform(),current:(await Capacitor.Plugins.CapacitorUpdater.current()).bundle}))()`);
  check('Retried save survives offline cold launch without warning', report.coldLaunch.volume === '0.5' && report.coldLaunch.ready && !report.coldLaunch.warningVisible && !report.coldLaunch.online && report.coldLaunch.current.id === 'builtin', report.coldLaunch);
  report.pass = true;
} catch (error) { report.error = String(error.stack ?? error); }
finally {
  if (obstructed) { try { adb('shell', 'run-as', appId, 'rmdir', temporary); } catch (error) { report.cleanupError = String(error); report.pass = false; } }
  client?.close(); report.finishedAt = new Date().toISOString(); write();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(({ name, pass }) => ({ name, pass })), error: report.error, output: options.output }, null, 2)); if (!report.pass) process.exitCode = 1;
