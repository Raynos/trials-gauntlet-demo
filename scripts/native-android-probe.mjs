#!/usr/bin/env node
/** Headless emulator WebView harness; never launches or attaches a user browser. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function android(serial = 'emulator-5554') {
  if (!/^emulator-\d+$/.test(serial)) throw new Error('This probe only operates on a headless emulator.');
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  return (...args) => execFileSync(path.join(sdk, 'platform-tools/adb'), ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 }).trim();
}

export async function connectWebview(serial = 'emulator-5554') {
  const adb = android(serial);
  const pid = adb('shell', 'pidof', 'com.trialsgauntlet.game');
  if (!/^\d+$/.test(pid)) throw new Error('Launch the installed debug app first.');
  const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
  let pages;
  for (let i = 0; i < 100; i++) {
    try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.some(p => p.type === 'page')) break; } catch { /* WebView is starting. */ }
    await delay(100);
  }
  const page = pages?.find(p => p.type === 'page');
  if (!page) { adb('forward', '--remove', `tcp:${port}`); throw new Error('No debug WebView page found.'); }
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const response = JSON.parse(event.data);
    const task = pending.get(response.id);
    if (!task) return;
    pending.delete(response.id); clearTimeout(task.timer);
    if (response.error) task.reject(new Error(JSON.stringify(response.error))); else task.resolve(response.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 300; i++) { try { if (await evaluate(expression)) return; } catch { /* Navigation replaces context. */ } await delay(100); }
    throw new Error(`WebView condition timed out: ${expression}`);
  };
  return { adb, send, evaluate, waitFor, close() { socket.close(); adb('forward', '--remove', `tcp:${port}`); } };
}

export async function probe({ serial = 'emulator-5554', output = '.native-build/android-qualification-final.json' } = {}) {
  const adb = android(serial);
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  adb('shell', 'am', 'force-stop', 'com.trialsgauntlet.game');
  const launch = adb('shell', 'am', 'start', '-W', '-n', 'com.trialsgauntlet.game/.MainActivity');
  const client = await connectWebview(serial);
  const { evaluate, waitFor, send } = client;
  const report = { at: new Date().toISOString(), environment: 'headless Android emulator; airplane mode', launch };
  try {
    await waitFor('window.__trials?.ready === true && !document.getElementById("loader")');
    report.boot = await evaluate(`({online:navigator.onLine,origin:location.origin,platform:window.Capacitor.getPlatform(),readyAtMs:window.__trials.info().readyAtMs})`);
    await evaluate("window.__trials.app.play('flat-test')");
    if (await evaluate('document.body.innerText.includes("GOT IT")')) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await evaluate('window.__trials.skipCountdown()');
    const golden = fs.readFileSync('harness/inputs/flat-test/bot-3.json', 'utf8');
    const crash = fs.readFileSync('harness/inputs/flat-test/crash.json', 'utf8');
    report.runs = [];
    for (let i = 0; i < 2; i++) report.runs.push(await evaluate(`(()=>{const t=window.__trials;t.runRecording(${JSON.stringify(golden)});t.render(true);return {finishTime:t.finishTime(),hash:t.hashState(),faults:t.faults()}})()`));
    report.crash = await evaluate(`(()=>{const t=window.__trials;t.runRecording(${JSON.stringify(crash)});t.render(true);return {phase:t.phase(),faults:t.faults()}})()`);
    report.restart = await evaluate(`(()=>{const t=window.__trials;const begin=performance.now();t.restart();t.setInput({throttle:1,brake:0,lean:0,hop:false,restart:false});t.step(1);t.render(true);return {wallMs:performance.now()-begin,phase:t.phase(),tick:t.getState().tick}})()`);
    await send('Page.navigate', { url: 'https://localhost/?track=flat-test' });
    await waitFor('!location.search.includes("harness") && window.__trials?.ready === true && !!window.__trials.app && !document.getElementById("loader")');
    if (await evaluate('document.body.innerText.includes("GOT IT")')) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await evaluate('window.__trials.skipCountdown()');
    await delay(250);
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await waitFor('document.hidden && window.__trials.app.paused()');
    report.background = await evaluate('({paused:window.__trials.app.paused(),tick:window.__trials.getState().tick,input:window.__trials.getState().input})');
    adb('shell', 'am', 'start', '-W', '-n', 'com.trialsgauntlet.game/.MainActivity');
    report.foreground = await evaluate('({paused:window.__trials.app.paused(),tick:window.__trials.getState().tick})');
    report.pass = report.boot.online === false && report.runs[0].finishTime !== null && report.runs[0].finishTime === report.runs[1].finishTime && report.runs[0].hash === report.runs[1].hash && report.crash.faults > 0 && report.restart.phase === 'riding' && report.background.paused && report.foreground.paused && report.background.tick === report.foreground.tick;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally { client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await probe({ serial: process.argv[2], output: process.argv[3] });
    console.log(JSON.stringify(report, null, 2));
    if (!report.pass) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
