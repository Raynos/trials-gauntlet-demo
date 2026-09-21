#!/usr/bin/env node
/** Bounded qualification of the task-owned API24 AVD; no production edits or browser launch. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { android, connectWebview, delay } from './native-android-probe.mjs';

const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
const serial = 'emulator-5556', avd = 'trials_gauntlet_api24';
const options = { apk: '.native-build/graphics-round6/delivery.apk', output: '.native-build/android-api24-probe.json', expect: 'game', sha256: '2a0008fac4aa0b2afc8a22e5642b28d3ff0a29988b675c6edca62db8b8ea145c' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error('Use --apk, --output, --expect game|unavailable, --sha256');
  options[key] = process.argv[i + 1];
}
if (!['game', 'unavailable'].includes(options.expect)) throw new Error('Invalid expected outcome');
const { apk, output } = options;
const emulatorLog = '.native-build/android-api24-emulator-round7.log';
const logcatPath = '.native-build/android-api24-logcat-round7.log';
const videoPath = '.native-build/android-api24-launch-round7.mp4';
const adbPath = path.join(sdk, 'platform-tools/adb');
const adb = android(serial);
const report = {
  schema: 1, at: new Date().toISOString(), pass: false, scope: 'Installed API24 stock-image boot and WebView capability probe, not a complete gameplay qualification.',
  device: { avd, serial, packageId: 'system-images;android-24;google_apis;arm64-v8a', revision: 29, headless: true, gpu: 'swiftshader' },
  expected: options.expect,
  apk, apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
  artifacts: { installLog: '.native-build/android-api24-install-round7.log', avdLog: '.native-build/android-api24-avd-round7.log', emulatorLog, logcatPath },
  stages: [], limitations: ['No updated WebView was installed; results describe the stock system image.', 'Software-emulated GPU results are not physical-device performance or visual-quality evidence.'],
};
let emulator, client, recording;
const write = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const stage = (name, data) => { report.stages.push({ name, at: new Date().toISOString(), ...data }); write(); console.log(name); };
const properties = names => Object.fromEntries(names.map(name => [name, adb('shell', 'getprop', name)]));
try {
  if (report.apkSha256 !== options.sha256) throw new Error('APK hash differs from the explicitly selected artifact');
  if (execFileSync(adbPath, ['devices'], { encoding: 'utf8' }).includes(serial)) throw new Error('Reserved emulator serial already occupied; refusing to attach');
  const imageProperties = fs.readFileSync(path.join(sdk, 'system-images/android-24/google_apis/arm64-v8a/source.properties'), 'utf8');
  if (!imageProperties.includes('Pkg.Revision=29')) throw new Error('Expected exact image revision 29');
  report.imageProperties = imageProperties;
  const fd = fs.openSync(emulatorLog, 'w');
  emulator = spawn(path.join(sdk, 'emulator/emulator'), ['-avd', avd, '-port', '5556', '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader', '-memory', '2048', '-cores', '2'], { stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  stage('emulator-started', { pid: emulator.pid });
  let booted = false;
  for (let i = 0; i < 180; i++) {
    if (emulator.exitCode !== null) throw new Error(`Emulator exited before Android boot: ${emulator.exitCode}`);
    try { booted = adb('shell', 'getprop', 'sys.boot_completed') === '1'; } catch { /* ADB is unavailable during early boot. */ }
    if (booted) break;
    await delay(1000);
  }
  if (!booted) throw new Error('Android boot timed out after 180 seconds');
  report.properties = properties(['ro.build.version.sdk', 'ro.build.version.release', 'ro.product.cpu.abi', 'ro.product.cpu.abilist', 'ro.kernel.qemu', 'ro.build.fingerprint']);
  report.webviewProvider = adb('shell', 'dumpsys', 'webviewupdate');
  report.webviewPackages = {};
  for (const name of ['com.google.android.webview', 'com.android.webview', 'com.android.chrome']) {
    const dump = adb('shell', 'dumpsys', 'package', name);
    report.webviewPackages[name] = dump.split('\n').filter(line => /versionName=|versionCode=/.test(line)).map(line => line.trim());
  }
  stage('android-booted', { properties: report.properties });
  if (report.properties['ro.build.version.sdk'] !== '24' || report.properties['ro.product.cpu.abi'] !== 'arm64-v8a') throw new Error('Unexpected Android runtime');
  report.installResult = adb('install', '-r', path.resolve(apk));
  stage('apk-installed', { result: report.installResult });
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
  adb('logcat', '-c');
  recording = spawn(adbPath, ['-s', serial, 'shell', 'screenrecord', '--time-limit', '45', '--bit-rate', '2000000', '/sdcard/api24-launch.mp4'], { stdio: 'ignore' });
  report.launch = adb('shell', 'am', 'start', '-W', '-n', 'com.trialsgauntlet.game/.MainActivity');
  stage('app-launched', { launch: report.launch });
  client = await connectWebview(serial);
  await client.waitFor('!!document.body && location.origin === "https://localhost" && document.readyState === "complete"');
  // All probe expressions use ES5 so the harness can describe an obsolete JS engine.
  report.browser = await client.evaluate('(function(){var canvas=document.createElement("canvas"),gl=canvas.getContext("webgl2"),features={};var samples={optionalChaining:"return ({a:1})?.a",nullishCoalescing:"return null ?? 1",classFields:"class A { x=1 }; return new A().x",classStaticBlock:"class A { static { this.x=1 } }; return A.x"};Object.keys(samples).forEach(function(name){try{features[name]=new Function(samples[name])()===1}catch(e){features[name]=String(e)}});return {userAgent:navigator.userAgent,origin:location.origin,href:location.href,webgl2:!!gl,glVersion:gl?gl.getParameter(gl.VERSION):null,glRenderer:gl?gl.getParameter(gl.RENDERER):null,features:features,ready:!!(window.__trials&&window.__trials.ready),body:document.body.innerText.slice(0,5000)}})()');
  stage('webview-capabilities', report.browser);
  await client.send('Page.enable');
  const captureErrors = 'window.__legacyErrors=[];window.addEventListener("error",function(e){window.__legacyErrors.push({type:"error",message:e.message||"resource error",filename:e.filename||"",line:e.lineno||0})},true);window.addEventListener("unhandledrejection",function(e){window.__legacyErrors.push({type:"rejection",message:String(e.reason)})});';
  try {
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: captureErrors });
    report.instrumentation = 'Page.addScriptToEvaluateOnNewDocument';
  } catch {
    await client.send('Page.addScriptToEvaluateOnLoad', { scriptSource: captureErrors });
    report.instrumentation = 'Legacy CDP Page.addScriptToEvaluateOnLoad';
  }
  await client.send('Page.reload', { ignoreCache: true });
  await delay(1200);
  for (let i = 0; i < 60; i++) {
    try { if (await client.evaluate(options.expect === 'unavailable' ? '!!document.body && location.pathname === "/native-unavailable.html"' : '!!(window.__trials&&window.__trials.ready)&&!document.getElementById("loader")')) break; } catch { /* Navigation in progress. */ }
    await delay(500);
  }
  report.boot = await client.evaluate('(function(){var t=window.__trials;return {ready:!!(t&&t.ready),loaderPresent:!!document.getElementById("loader"),screen:t&&t.app?t.app.screen():null,origin:location.origin,body:document.body.innerText.slice(0,5000),errors:window.__legacyErrors||[]}})()');
  stage('instrumented-boot', report.boot);
  if (options.expect === 'unavailable') {
    report.unavailable = await client.evaluate('(function(){var main=document.querySelector("main"),r=main.getBoundingClientRect(),body=document.body,html=document.documentElement;return {path:location.pathname,title:document.title,text:body.innerText,gameAbsent:!window.__trials,loaderAbsent:!document.getElementById("loader"),scriptElements:document.scripts.length,viewport:{width:innerWidth,height:innerHeight},content:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},scroll:{width:Math.max(body.scrollWidth,html.scrollWidth),height:Math.max(body.scrollHeight,html.scrollHeight)},horizontalClipping:r.left<0||r.right>innerWidth,allContentAboveFold:r.top>=0&&r.bottom<=innerHeight}})()');
    const screenshot = options.output.replace(/\.json$/, '.png');
    fs.writeFileSync(screenshot, execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p']));
    report.artifacts.nativeScreenshot = screenshot;
    report.pass = report.unavailable.path === '/native-unavailable.html' && report.unavailable.gameAbsent && report.unavailable.loaderAbsent && !report.unavailable.horizontalClipping && report.unavailable.text.includes("The game couldn't start") && report.unavailable.text.includes('Android System WebView') && report.boot.errors.length === 0;
    report.gameplayQualified = false;
    stage('static-unavailable-page', report.unavailable);
  }
  if (report.boot.ready && !report.boot.loaderPresent) {
    await client.evaluate('window.__trials.app.play("flat-test")');
    await delay(2000);
    report.track = await client.evaluate('(function(){var t=window.__trials;return {screen:t.app.screen(),phase:t.phase(),render:t.info().render,errors:window.__legacyErrors||[]}})()');
    stage('track-opened', report.track);
  }
  if (options.expect === 'game') report.pass = report.boot.ready && !report.boot.loaderPresent && report.browser.webgl2 && report.boot.errors.length === 0;
} catch (error) {
  report.error = String(error.stack ?? error);
  report.failureStage = report.stages.at(-1)?.name ?? 'preflight';
} finally {
  try {
    const logcat = adb('logcat', '-d', '-v', 'threadtime');
    fs.writeFileSync(logcatPath, logcat);
    report.relevantLogcat = logcat.split('\n').filter(line => /Capacitor|chromium|WebView|SyntaxError|FATAL EXCEPTION|AndroidRuntime/.test(line)).slice(-200);
  } catch (error) { report.logcatError = String(error); }
  client?.close();
  if (recording) {
    try {
      for (const pid of adb('shell', 'pidof', 'screenrecord').split(/\s+/).filter(value => /^\d+$/.test(value))) adb('shell', 'kill', '-2', pid);
    } catch { /* Already finished. */ }
    await delay(1000);
    try {
      adb('pull', '/sdcard/api24-launch.mp4', videoPath);
      const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', videoPath], { encoding: 'utf8' }));
      report.video = { path: videoPath, valid: Number(info.format?.duration) > 0, duration: Number(info.format?.duration) || null };
      if (report.video.valid) report.artifacts.launchVideo = videoPath;
      else report.limitations.push('API24 screenrecord produced no valid video duration; no clip evidence is claimed.');
    } catch (error) { report.videoError = String(error); }
  }
  if (emulator) {
    try { adb('emu', 'kill'); } catch { /* Process may already have exited. */ }
    for (let i = 0; i < 20 && emulator.exitCode === null; i++) await delay(250);
    if (emulator.exitCode === null) emulator.kill('SIGTERM');
    await delay(500);
    report.cleanup = { ownedEmulatorStopped: emulator.exitCode !== null || emulator.signalCode !== null, exitCode: emulator.exitCode, signal: emulator.signalCode, avdPreserved: true };
  }
  report.finishedAt = new Date().toISOString();
  write();
}
console.log(JSON.stringify({ pass: report.pass, failureStage: report.failureStage, error: report.error, output, cleanup: report.cleanup }, null, 2));
if (!report.pass) process.exitCode = 1;
