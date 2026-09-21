#!/usr/bin/env node
/** Actual Android OS input on a task-owned emulator. No DOM click/input synthesis. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { android, connectWebview, delay } from './native-android-probe.mjs';

const execute = promisify(execFile);
const appId = 'com.trialsgauntlet.game';
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
const adbPath = path.join(sdk, 'platform-tools/adb');

async function audioMonitor(adb) {
  const events = [];
  const pid = adb('shell', 'pidof', appId);
  const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const enabled = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 3000);
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) { clearTimeout(timer); resolve(!message.error); }
      if (message.method?.startsWith('WebAudio.context')) events.push({ at: Date.now(), method: message.method, ...message.params });
    };
    socket.send(JSON.stringify({ id: 1, method: 'WebAudio.enable' }));
  });
  return { events, enabled, close() { socket.close(); adb('forward', '--remove', `tcp:${port}`); } };
}

export async function touch({ serial = 'emulator-5554', apk = 'android/app/build/outputs/apk/debug/app-debug.apk', output = '.native-build/android-touch.json', fresh = false, recording = '.native-build/android-touch.mp4' } = {}) {
  const adb = android(serial); // Refuses real-device serials.
  const report = { schema: 1, at: new Date().toISOString(), pass: false, environment: 'task-owned headless Pixel 7 API 36 emulator; offline; OS adb input', apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'), freshTaskData: fresh, actions: [], checks: [], failures: [] };
  const check = (name, pass, evidence) => { const row = { name, pass: Boolean(pass), evidence }; report.checks.push(row); if (!pass) report.failures.push(name); };
  let client;
  let audio;
  let recordingProcess;
  let recordingPid;
  let bounds;
  let geometry;
  const state = () => client.evaluate(`(()=>{const h=window.__trials,s=h.getState();return {screen:h.app.screen(),paused:h.app.paused(),hidden:document.hidden,phase:h.phase(),tick:s.tick,input:s.input,heldControls:[...document.querySelectorAll('.touch-layer .held')].map(e=>e.className),pos:s.bike.pos,faults:h.faults(),track:h.info().trackId,bike:h.info().bike,outfit:h.info().render.riderOutfit}})()`);
  const wait = async (label, predicate, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; await delay(75); }
    throw new Error(`Timed out: ${label}`);
  };
  const point = async selector => {
    const result = await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();let opacity=1;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.visibility==='hidden'||s.display==='none')opacity=0;opacity*=Number(s.opacity)}const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y),delegated=!!e.closest('.touch-layer')&&hit===e.closest('.touch-layer');return {x,y,width:r.width,height:r.height,opacity,hit:!!hit&&(hit===e||e.contains(hit)||delegated),delegated,inert:!!e.closest('[inert]'),live:!!e.closest('.live'),viewport:{width:innerWidth,height:innerHeight}}})()`);
    if (!result || result.width <= 0 || result.height <= 0 || result.opacity < 0.5 || !result.hit || result.inert) throw new Error(`Target not drawn/hittable: ${selector}: ${JSON.stringify(result)}`);
    const x = Math.round(bounds.left + result.x * (bounds.right - bounds.left) / result.viewport.width);
    const y = Math.round(bounds.top + result.y * (bounds.bottom - bounds.top) / result.viewport.height);
    return { selector, css: result, os: { x, y } };
  };
  const tap = async (selector, instantaneous = false) => {
    await wait(`${selector} live`, async () => { try { const p = await point(selector); return p.css.live || selector.startsWith('.tz-'); } catch { return false; } });
    const target = await point(selector);
    report.actions.push({ type: instantaneous ? 'adb input tap' : 'adb stationary touch 100ms', ...target, at: Date.now() });
    if (instantaneous) adb('shell', 'input', 'touchscreen', 'tap', String(target.os.x), String(target.os.y));
    else adb('shell', 'input', 'touchscreen', 'swipe', String(target.os.x), String(target.os.y), String(target.os.x), String(target.os.y), '100');
  };
  const key = name => { report.actions.push({ type: 'adb keyevent', key: name, at: Date.now() }); adb('shell', 'input', 'keyevent', name); };
  const gesture = async (selector, durationMs = 1100) => {
    await wait(`${selector} live for OS swipe`, async () => { try { return (await point(selector)).css.live; } catch { return false; } });
    const target = await point(selector);
    // A small OS swipe stays within this real quarter-screen input zone.
    const endY = target.os.y + 12;
    report.actions.push({ type: 'adb input swipe', ...target, to: { x: target.os.x, y: endY }, durationMs, at: Date.now() });
    const promise = execute(adbPath, ['-s', serial, 'shell', 'input', 'touchscreen', 'swipe', String(target.os.x), String(target.os.y), String(target.os.x), String(endY), String(durationMs)], { timeout: durationMs + 10000 });
    return { promise };
  };
  const neutral = s => s.input.throttle === 0 && s.input.brake === 0 && s.input.lean === 0;
  const nativeSave = () => {
    const saves = [];
    for (const name of ['trials-save-a.json', 'trials-save-b.json']) {
      try { saves.push(JSON.parse(adb('shell', 'run-as', appId, 'cat', `files/${name}`))); } catch { /* Other slot need not exist. */ }
    }
    return saves.sort((a, b) => b.generation - a.generation)[0] ?? null;
  };
  try {
    if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('Task only permits an emulator');
    report.device = { sdk: adb('shell', 'getprop', 'ro.build.version.sdk'), abi: adb('shell', 'getprop', 'ro.product.cpu.abi'), size: adb('shell', 'wm', 'size'), density: adb('shell', 'wm', 'density') };
    adb('install', '-r', path.resolve(apk));
    if (fresh) adb('shell', 'pm', 'clear', appId); // Explicit --fresh: task-owned emulator data only.
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
    adb('shell', 'am', 'force-stop', appId);
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    client = await connectWebview(serial);
    await client.waitFor('window.__trials?.app && !document.getElementById("loader")');
    const boot = await client.evaluate('({platform:window.Capacitor.getPlatform(),origin:location.origin,online:navigator.onLine,harness:window.__trials.info().harness,screen:window.__trials.app.screen()})');
    if (boot.platform !== 'android' || boot.origin !== 'https://localhost' || boot.online || boot.harness || boot.screen !== 'menu') throw new Error(`Expected normal offline menu: ${JSON.stringify(boot)}`);
    report.boot = boot;
    adb('shell', 'uiautomator', 'dump', '/sdcard/trials-touch-window.xml');
    const xml = adb('shell', 'cat', '/sdcard/trials-touch-window.xml');
    const match = xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!match) throw new Error('Could not locate native WebView bounds for honest OS-to-CSS mapping');
    bounds = { left: +match[1], top: +match[2], right: +match[3], bottom: +match[4] };
    report.nativeWebViewBounds = bounds;
    audio = await audioMonitor(adb);
    fs.mkdirSync(path.dirname(recording), { recursive: true });
    recordingProcess = spawn(adbPath, ['-s', serial, 'shell', 'screenrecord', '--time-limit', '180', '--bit-rate', '2500000', '/sdcard/trials-native-touch.mp4'], { stdio: 'ignore' });
    recordingProcess.on('error', error => { report.recordingError = String(error); });
    await delay(250);
    try { recordingPid = adb('shell', 'pidof', 'screenrecord'); } catch { /* Optional video failure is recorded below. */ }

    await tap('.menu-screen .menu-item[data-id="play"]');
    await client.waitFor('window.__trials.app.screen()==="tracks"');
    await tap('.wm-ride');
    await client.waitFor('window.__trials.app.screen()==="run"');
    const onboard = await client.evaluate('document.querySelector(".onboard")?.classList.contains("show")');
    if (onboard) await tap('.onboard button');
    check('OS Play → track Ride → onboarding', !fresh || onboard, { onboardingShown: onboard, inputPath: 'adb touchscreen taps', state: await state() });
    await wait('natural countdown ends', async () => (await state()).phase === 'riding');
    // Only state-changing debug fixture: a flat surface for isolated input checks.
    report.fixture = { track: 'flat-test', injection: 'window.__trials.loadTrack only; no setInput/step/skipCountdown/UI clicks' };
    await client.evaluate('window.__trials.loadTrack("flat-test")');
    await wait('flat fixture natural countdown ends', async () => (await state()).phase === 'riding');
    await delay(250);
    geometry = await client.evaluate(`(()=>{const e=document.createElement('div');e.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';document.body.append(e);const s=getComputedStyle(e),safe={top:parseFloat(s.paddingTop),right:parseFloat(s.paddingRight),bottom:parseFloat(s.paddingBottom),left:parseFloat(s.paddingLeft)};e.remove();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,safeArea:safe,controls:['.tz-back','.tz-fwd','.tz-brake','.tz-throttle','.tz-pause','.tz-restart'].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),v=(el.querySelector('.tz-key')??el).getBoundingClientRect();return {selector,bounds:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},visual:{x:v.x,y:v.y,width:v.width,height:v.height,right:v.right,bottom:v.bottom}}})}})()`);
    check('Touch targets ≥44 CSS px and affordances within safe viewport', geometry.controls.every(c => c.bounds.width >= 43.99 && c.bounds.height >= 43.99 && c.visual.x >= geometry.safeArea.left - 1 && c.visual.y >= geometry.safeArea.top - 1 && c.visual.right <= geometry.width - geometry.safeArea.right + 1 && c.visual.bottom <= geometry.height - geometry.safeArea.bottom + 1), geometry);
    for (const [name, selector, field, sign] of [['throttle', '.tz-throttle', 'throttle', 1], ['lean back', '.tz-back', 'lean', -1], ['lean forward', '.tz-fwd', 'lean', 1], ['brake', '.tz-brake', 'brake', 1]]) {
      const motion = await gesture(selector);
      let active;
      try { await wait(`${name} reaches physics`, async () => { const s = await state(); if (Math.sign(s.input[field]) === sign) { active = s; return true; } return false; }, 1500); }
      catch (error) { report.failures.push(String(error)); }
      await motion.promise;
      await wait(`${name} releases`, async () => neutral(await state()));
      check(`OS swipe applies/releases ${name}`, Boolean(active), { during: active ?? null, after: await state() });
    }
    await wait('enough ticks for restart observation', async () => (await state()).tick > 60);
    const beforeRestart = await state();
    const restartStart = Date.now();
    await tap('.tz-restart', true);
    let fastRestart = true;
    try { await wait('restart resets physics tick', async () => (await state()).tick < beforeRestart.tick, 2000); }
    catch { fastRestart = false; }
    check('OS restart tap resets run', fastRestart, { before: beforeRestart, after: await state(), observedWallMs: Date.now() - restartStart, timingScope: 'includes adb and CDP overhead; not device restart latency' });
    if (!fastRestart) {
      // Keep the quick-tap failure. A human-duration press allows independent
      // lifecycle coverage to continue without injecting game state.
      const before = await state();
      const pressed = await gesture('.tz-restart', 100);
      await pressed.promise;
      await wait('100ms restart press resets physics tick', async () => (await state()).tick < before.tick);
      check('100ms OS restart press recovery', true, { before, after: await state() });
    }
    const quickTaps = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      await wait('riding before repeated quick restart', async () => (await state()).phase === 'riding');
      const before = await state();
      await tap('.tz-restart', true);
      let received = true;
      try { await wait('quick restart fault increments exactly once', async () => (await state()).faults > before.faults, 1500); }
      catch { received = false; }
      const after = await state();
      quickTaps.push({ attempt: attempt + 1, pass: received && after.faults === before.faults + 1, before, after });
    }
    check('Five instantaneous OS restart taps each apply once', quickTaps.every(x => x.pass), quickTaps);
    const heldRestart = await gesture('.tz-restart', 1200);
    await heldRestart.promise;
    const afterHeldRestart = await state();
    await wait('held full restart natural countdown completes', async () => (await state()).phase === 'riding');
    const afterHeldCountdown = await state();
    check('Held restart resets full run; release adds no extra restart', afterHeldRestart.phase === 'countdown' && afterHeldRestart.faults === 0 && afterHeldCountdown.faults === 0 && afterHeldCountdown.heldControls.length === 0, { afterHeldRestart, afterHeldCountdown });
    await tap('.tz-pause');
    await client.waitFor('window.__trials.app.paused()');
    const paused = await state();
    key('KEYCODE_BACK');
    await client.waitFor('!window.__trials.app.paused()');
    const resumed = await state();
    key('KEYCODE_BACK');
    await client.waitFor('window.__trials.app.paused()');
    check('Pause tap and Android Back run hierarchy', paused.paused && !resumed.paused && (await state()).paused, { paused, resumed, pausedAgain: await state() });
    key('KEYCODE_BACK');
    await client.waitFor('!window.__trials.app.paused()');
    const held = await gesture('.tz-throttle', 3000);
    await wait('held throttle before Home', async () => (await state()).input.throttle > 0);
    const beforeHome = await state();
    key('KEYCODE_HOME');
    await held.promise;
    await client.waitFor('document.hidden && window.__trials.app.paused()');
    const background = await state();
    await delay(350);
    const backgroundLater = await state();
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    await client.waitFor('!document.hidden');
    const foreground = await state();
    await tap('.pause-overlay .tile[data-id="resume"]');
    await client.waitFor('!window.__trials.app.paused()');
    await wait('resumed physics advances with released input', async () => { const s = await state(); return s.tick > foreground.tick && neutral(s); });
    const afterResume = await state();
    check('Home cancels held input; foreground remains paused', beforeHome.input.throttle > 0 && background.paused && background.heldControls.length === 0 && background.tick === backgroundLater.tick && foreground.paused && foreground.heldControls.length === 0 && foreground.tick === background.tick && neutral(afterResume), { beforeHome, background, backgroundLater, foreground, afterResume, inputScope: 'Paused PhysicsState.input is the last simulated input, not a pending-control read; release is checked by cleared held controls and neutral input after actual Resume tap' });
    report.audio = { protocolEnabled: audio.enabled, contextEvents: [...audio.events], scope: 'Real app AudioContext protocol events only; emulator uses -no-audio; no audible-output assertion' };
    await tap('.tz-pause');
    await client.waitFor('window.__trials.app.paused()');
    await tap('.pause-overlay .tile[data-id="quit"]');
    await client.waitFor('window.__trials.app.screen()==="menu"');
    await tap('.menu-screen .menu-item[data-id="garage"]');
    await client.waitFor('window.__trials.app.screen()==="garage"');
    await tap('.bike-chip[data-bike="pro"]');
    await client.waitFor('window.__trials.info().bike==="pro"');
    await tap('.outfit-button[data-outfit="race-bluewhite"]');
    await client.waitFor('window.__trials.info().render.riderOutfit==="race-bluewhite"');
    key('KEYCODE_BACK');
    await client.waitFor('window.__trials.app.screen()==="menu"');
    check('Android Back exits garage to menu', true, await state());
    await tap('.menu-screen .menu-item[data-id="settings"]');
    await client.waitFor('window.__trials.app.screen()==="settings"');
    key('KEYCODE_BACK');
    await client.waitFor('window.__trials.app.screen()==="menu"');
    check('Android Back exits settings to menu', true, await state());
    let save;
    await wait('native filesystem saves committed selections', async () => { save = nativeSave(); return save?.entries?.['trials.bikeClass'] === 'pro' && save?.entries?.['trials.riderOutfit'] === 'race-bluewhite' && save?.entries?.['trials.onboarded'] != null; });
    report.saved = { generation: save.generation, entries: Object.fromEntries(['trials.bikeClass', 'trials.riderOutfit', 'trials.onboarded', 'trials.lastTrack'].map(k => [k, save.entries[k]])) };
    key('KEYCODE_BACK');
    await client.waitFor('document.hidden');
    check('Android Back at menu minimizes app', true, await state());
    audio.close(); audio = null;
    client.close(); client = null;
    adb('shell', 'am', 'force-stop', appId);
    adb('shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`);
    client = await connectWebview(serial);
    await client.waitFor('window.__trials?.app && !document.getElementById("loader")');
    const restored = await client.evaluate(`({menuPhysicsBike:window.__trials.info().bike,outfit:window.__trials.info().render.riderOutfit,entries:Object.fromEntries(['trials.bikeClass','trials.riderOutfit','trials.onboarded','trials.lastTrack'].map(k=>[k,localStorage.getItem(k)]))})`);
    // The hidden menu backdrop physics uses its default bike. The persisted
    // Garage choice takes effect in App.play, so verify an actual OS-launched ride.
    await tap('.menu-screen .menu-item[data-id="play"]');
    await client.waitFor('window.__trials.app.screen()==="tracks"');
    await tap('.wm-ride');
    await client.waitFor('window.__trials.app.screen()==="run"');
    restored.ride = await state();
    restored.onboardingShown = await client.evaluate('document.querySelector(".onboard")?.classList.contains("show")');
    check('Force-kill preserves committed native preferences/onboarding', restored.ride.bike === 'pro' && restored.ride.outfit === 'race-bluewhite' && !restored.onboardingShown && JSON.stringify(restored.entries) === JSON.stringify(report.saved.entries), restored);
  } catch (error) { report.error = String(error?.stack ?? error); report.failures.push(report.error); }
  finally {
    try { client?.close(); } catch { /* Target may have exited. */ }
    try { if (audio) { report.audio ??= { protocolEnabled: audio.enabled, contextEvents: [...audio.events], scope: 'No audible-output assertion' }; audio.close(); } } catch { /* Target may have exited. */ }
    if (/^\d+$/.test(recordingPid ?? '')) {
      try { adb('shell', 'kill', '-2', recordingPid); } catch { /* Recorder may have reached its time limit. */ }
      await delay(700);
      try { adb('pull', '/sdcard/trials-native-touch.mp4', path.resolve(recording)); report.recording = { path: recording, scope: 'Actual OS input capture, maximum first 180 seconds; parent judges clip' }; } catch (error) { report.recordingError = String(error); }
    } else if (recordingProcess) report.recordingError ??= 'screenrecord process was not observed';
    report.finishedAt = new Date().toISOString();
    report.pass = report.failures.length === 0;
    report.limitations = ['Single headless emulator profile and single-pointer OS gestures; no physical multitouch/notch/system-gesture judgment.', 'No visual-quality or audible-output pass is inferred from hook values or protocol events.', 'Only flat-test loading uses a state-changing game hook; every navigation/control action uses adb OS input.', 'Native choices are intentionally changed on task-owned fixture data for force-kill durability checks.'];
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i++) {
      const flag = process.argv[i];
      if (flag === '--fresh') { options.fresh = true; continue; }
      const value = process.argv[++i];
      if (!value) throw new Error(`Missing value for ${flag}`);
      if (flag === '--serial') options.serial = value;
      else if (flag === '--apk') options.apk = value;
      else if (flag === '--output') options.output = value;
      else if (flag === '--recording') options.recording = value;
      else throw new Error(`Unknown argument ${flag}`);
    }
    const report = await touch(options);
    console.log(JSON.stringify({ pass: report.pass, checks: report.checks.map(c => ({ name: c.name, pass: c.pass })), failures: report.failures, output: options.output ?? '.native-build/android-touch.json' }, null, 2));
    if (!report.pass) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
