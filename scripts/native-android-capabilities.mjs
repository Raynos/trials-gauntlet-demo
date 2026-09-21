#!/usr/bin/env node
/** Offline, bundled-asset capability matrix on a task-owned headless emulator. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { android, connectWebview, delay } from './native-android-probe.mjs';

export async function capabilities({
  serial = 'emulator-5554',
  apk = 'android/app/build/outputs/apk/debug/app-debug.apk',
  output = '.native-build/android-capabilities.json',
  sections = ['capabilities', 'tracks', 'garage', 'notices'],
  timeoutMs = 300000,
} = {}) {
  const adb = android(serial); // Rejects real-device serials.
  const apkPath = path.resolve(apk);
  const config = JSON.parse(execFileSync('unzip', ['-p', apkPath, 'assets/capacitor.config.json'], { encoding: 'utf8', timeout: 30000 }));
  if (config.appId !== 'com.trialsgauntlet.game' || config.server?.url || config.plugins?.CapacitorUpdater?.autoUpdate !== 'off') throw new Error('Expected the local bundled game APK with automatic updater disabled');
  for (const key of ['updateUrl', 'statsUrl', 'channelUrl']) {
    if (config.plugins?.CapacitorUpdater?.[key] !== '') throw new Error(`Expected disabled native updater ${key}`);
  }
  const report = {
    schema: 1, at: new Date().toISOString(), pass: false,
    environment: 'headless Android emulator; airplane mode; installed debug APK; bundled assets',
    serial, apk: path.relative(process.cwd(), apkPath),
    apkSha256: createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex'),
    requestedSections: sections,
  };
  let client;
  try {
    if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('Target is not an Android emulator');
    if (adb('shell', 'getprop', 'sys.boot_completed') !== '1') throw new Error('Wait for emulator boot before running');
    report.device = {
      model: adb('shell', 'getprop', 'ro.product.model'),
      sdk: adb('shell', 'getprop', 'ro.build.version.sdk'),
      abi: adb('shell', 'getprop', 'ro.product.cpu.abi'),
    };
    report.install = adb('install', '-r', apkPath);
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
    adb('shell', 'am', 'force-stop', 'com.trialsgauntlet.game');
    report.launch = adb('shell', 'am', 'start', '-W', '-n', 'com.trialsgauntlet.game/.MainActivity');
    client = await connectWebview(serial);
    await client.waitFor('window.__trials?.ready === true && !!window.__trials.app && !document.getElementById("loader")');
    report.boot = await client.evaluate(`(async () => ({
      origin: location.origin, url: location.href, online: navigator.onLine,
      platform: window.Capacitor?.getPlatform?.(), harness: window.__trials.info().harness,
      updater: await window.Capacitor.Plugins.CapacitorUpdater.current(),
      screen: window.__trials.app.screen()
    }))()`);
    if (report.boot.platform !== 'android' || report.boot.origin !== 'https://localhost' || report.boot.harness || report.boot.online !== false) throw new Error('Expected the normal native Android app offline at its bundled local origin');
    if (report.boot.updater?.bundle?.id !== 'builtin') throw new Error('Expected builtin bundle, not a previously staged OTA fixture');
    if (['run', 'replay', 'reviewer'].includes(report.boot.screen)) throw new Error('Expected a front screen; refusing to interrupt a live run or replay');
    const source = fs.readFileSync('scripts/native-capabilities-probe.js', 'utf8');
    // Do not await the full browser promise in one CDP request: a matrix can take
    // longer than connectWebview's 60-second request timeout.
    await client.evaluate(source + '\nwindow.__trialsNativeCapabilitiesResult = null; ' +
      `void window.__trialsNativeCapabilitiesProbe(${JSON.stringify({ sections })}).catch(error => { window.__trialsNativeCapabilitiesResult = {pass:false,error:String(error?.stack ?? error)}; });`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await client.evaluate('window.__trialsNativeCapabilitiesResult');
      if (result) { report.result = result; break; }
      await delay(1000);
    }
    if (!report.result) throw new Error('Capability matrix timed out; browser operation may still be running and coverage is incomplete');
    report.pass = report.result.pass === true;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    client?.close();
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const flag = process.argv[i];
      const value = process.argv[i + 1];
      if (!value) throw new Error(`Missing value for ${flag}`);
      if (flag === '--serial') options.serial = value;
      else if (flag === '--apk') options.apk = value;
      else if (flag === '--output') options.output = value;
      else if (flag === '--sections') options.sections = value.split(',');
      else if (flag === '--timeout-ms' && Number.isFinite(Number(value)) && Number(value) > 0) options.timeoutMs = Number(value);
      else throw new Error(`Unknown or invalid argument: ${flag}`);
    }
    const report = await capabilities(options);
    console.log(JSON.stringify({ pass: report.pass, output: options.output ?? '.native-build/android-capabilities.json', error: report.error, failures: report.result?.failures, tracks: report.result?.tracks?.length, outfits: report.result?.outfits?.length, bikes: report.result?.bikes?.length }, null, 2));
    if (!report.pass) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
