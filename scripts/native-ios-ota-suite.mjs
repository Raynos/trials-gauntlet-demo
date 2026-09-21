#!/usr/bin/env node
/** Installed Debug-app OTA qualification. Local HTTPS fixtures only; never builds, installs or resets saves.
 * Usage: node scripts/native-ios-ota-suite.mjs --fixtures .native-build/ota-fixtures-round4
 * Options: --config FILE --output DIR --device UDID --server-log FILE --resume --dry-run
 * The task-owned simulator/app and trusted temporary CA must already be prepared by the caller.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { selectFixture, setNetworkFixture, CASES } from './native-ota-fixtures.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
};
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
const preferences = { 'trials.sound': '0', 'trials.volume': '0.3' };
const stages = ['baseline', 'stageA', 'activateA', 'interruptB', 'retryBWhileRiding', 'activateB', 'stageIntentionalRollback', 'activateIntentionalRollback', 'expired', 'incompatible', 'wrongSignature', 'corruptZip', 'seedOrphan', 'cleanupOrphan', 'stageBrokenStartup', 'watchdogRecovery', 'recoveryColdLaunch'];

export function loadSuite(options) {
  const configPath = path.resolve(options.config ?? '.native-build/ota-test-config.json');
  const fixtureRoot = path.resolve(options.fixtures ?? '.native-build/ota-fixtures-round4');
  const config = read(configPath);
  const channel = new URL(config.iosManifest);
  check(channel.protocol === 'https:' && ['localhost', '127.0.0.1'].includes(channel.hostname) && !channel.username && !channel.password, 'Only localhost iOS HTTPS fixtures are allowed');
  const fixtureBytes = fs.readFileSync(path.join(fixtureRoot, 'checks.json'));
  const fixtureReport = JSON.parse(fixtureBytes);
  const fixtures = Object.fromEntries(fixtureReport.fixtures.filter(row => row.platform === 'ios').map(row => [row.name, row]));
  for (const name of CASES) {
    const row = fixtures[name];
    check(row && row.manifest, `Missing iOS fixture: ${name}`);
    check(new URL(row.manifest.url).origin === channel.origin, `Fixture is not on the local channel: ${name}`);
    check(row.manifest.sequence === fixtureReport.sequenceBase + CASES.indexOf(name) + 1, `Unexpected sequence: ${name}`);
    check(row.signatureValid === (name !== 'wrongSignature') && row.archiveHashValid === (name !== 'corruptZip') && row.expired === (name === 'expired') && row.nativeCompatible === (name !== 'incompatible'), `Invalid fixture preparation: ${name}`);
    if (name !== 'expired') check(Date.parse(row.manifest.expiresAt) > Date.now(), `Fixture expired: ${name}; build a fresh suite`);
  }
  return { configPath, fixtureRoot, config, fixtures, fixtureReport, fixtureSha256: sha(fixtureBytes) };
}

// This body is executed by the existing Debug bridge only after ordinary game readiness.
// It reads public updater metadata and allowlisted preferences, never review credentials.
const probeLibrary = `
const h = window.__trials;
const updater = Capacitor.Plugins.CapacitorUpdater;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const prefKeys = ['trials.sound', 'trials.volume'];
const pickPrefs = entries => Object.fromEntries(prefKeys.map(key => [key, entries[key] ?? null]));
const decodePending = raw => {
  if (!raw) return null;
  const pending = JSON.parse(raw);
  const encoded = pending.envelope.payload.replace(/-/g, '+').replace(/_/g, '/');
  const manifest = JSON.parse(atob(encoded));
  return {id: pending.id, sequence: manifest.sequence, version: manifest.bundleId, checksum: manifest.sha256};
};
const snapshot = async () => {
  const entries = Object.fromEntries(Object.entries(localStorage));
  const pendingKey = updateNamespace + '.pending';
  const sequenceKey = updateNamespace + '.sequence';
  const slots = [];
  for (const name of ['trials-save-a.json', 'trials-save-b.json']) {
    try {
      const result = await Capacitor.Plugins.Filesystem.readFile({path:name,directory:'LIBRARY',encoding:'utf8'});
      const s = JSON.parse(result.data);
      let checksum = 2166136261;
      const payload = JSON.stringify({version:s.version,generation:s.generation,entries:s.entries});
      for (let i = 0; i < payload.length; i++) checksum = Math.imul(checksum ^ payload.charCodeAt(i),16777619);
      const valid = s.version === 1 && Number.isSafeInteger(s.generation) && (checksum >>> 0).toString(16).padStart(8,'0') === s.checksum;
      slots.push({name, valid, generation:s.generation, preferences:pickPrefs(s.entries),
        sequence:Number(s.entries[sequenceKey] ?? 0), pending:decodePending(s.entries[pendingKey])});
    } catch (error) { slots.push({name, valid:false, error:String(error)}); }
  }
  const durable = slots.filter(s => s.valid).sort((a,b) => b.generation-a.generation)[0] ?? null;
  return {current:(await updater.current()).bundle, bundles:(await updater.list()).bundles,
    marker:window.__nativeOtaFixture ?? null, screen:h.app.screen(), paused:h.app.paused(), tick:h.frame(),
    preferences:pickPrefs(entries), pending:decodePending(entries[pendingKey]), sequence:Number(entries[sequenceKey] ?? 0), durable, slots};
};
const waitPending = async (sequence, timeout=90000) => {
  const end = performance.now() + timeout;
  const samples = [];
  while (performance.now() < end) {
    const raw = localStorage.getItem(updateNamespace + '.pending');
    samples.push({at:performance.now(),screen:h.app.screen(),tick:h.frame(),marker:window.__nativeOtaFixture??null});
    if (decodePending(raw)?.sequence === sequence) {
      await pause(700);
      return {samples, after:await snapshot()};
    }
    await pause(500);
  }
  return {samples, after:await snapshot(), timeout:true};
};
const ride = async () => {
  h.app.play('flat-test');
  await pause(1200);
  document.querySelector('.onboard button')?.click();
  // First-run tutorial uses its ordinary button handler. These are controller probes, not native touch proof.
  for (const button of document.querySelectorAll('button')) if (/got it/i.test(button.textContent)) button.click();
  h.skipCountdown();
  await pause(500);
  expect(h.app.screen() === 'run', 'Could not establish in-progress ride');
};
`;

function runChild(command, args, { log, env, timeout = 240000 }) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(log);
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.once('error', error => { clearTimeout(timer); stream.end(); reject(error); });
    child.once('close', code => { clearTimeout(timer); stream.end(() => resolve({ code, timedOut })); });
  });
}

async function checkServer(config) {
  await new Promise((resolve, reject) => {
    const request = https.get(config.iosManifest, { ca: fs.readFileSync(config.certPath), timeout: 5000 }, response => {
      response.resume();
      response.once('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`Local fixture server HTTP ${response.statusCode}`)));
    });
    request.once('timeout', () => request.destroy(new Error('Local fixture server timed out')));
    request.once('error', reject);
  });
}

export async function runSuite(options = {}) {
  const suite = loadSuite(options);
  const { config, configPath, fixtureRoot, fixtures } = suite;
  const output = path.resolve(options.output ?? '.native-build/ios-ota-round4');
  const progressFile = path.join(output, 'progress.json');
  const device = options.device ?? process.env.TRIALS_SIMULATOR ?? 'F3058DD5-DCB6-4D86-93CC-6E56A785B788';
  const serverLog = path.resolve(options['server-log'] ?? '.native-build/ota-server-round4.log');
  const fingerprint = sha(JSON.stringify({ fixtures:suite.fixtureSha256, channel:config.iosManifest, device }));
  if (options['dry-run']) return { dryRun:true, device, channel:config.iosManifest, fixtureSha256:suite.fixtureSha256, stages, output };
  check(fs.existsSync(serverLog), 'Provide the running local fixture server log with --server-log');
  fs.mkdirSync(output, { recursive: true });
  let progress;
  if (fs.existsSync(progressFile)) {
    check(options.resume, 'Output already contains progress; use --resume or a fresh --output');
    progress = read(progressFile);
    check(progress.fingerprint === fingerprint, 'Cannot resume against different fixtures/channel/device');
    check(!progress.pass, 'Suite already passed; retain evidence and use fresh fixtures for a new run');
  } else {
    progress = { schema:1, startedAt:new Date().toISOString(), fingerprint, device, channel:config.iosManifest,
      fixtureSha256:suite.fixtureSha256, sourceRevision:suite.fixtureReport.sourceRevision, steps:[], pass:false,
      scope:'Installed Debug controller and native updater probes. No browser, game build, app install, save reset, production channel, or OS-touch automation.',
      limits:['Task-owned iOS Simulator only; no physical device or store approval claim.', 'Gameplay hooks and Settings DOM handlers establish test conditions; native touch qualification is a separate suite.', 'Negative rejection observation is bounded to 30 seconds after normal readiness and paired with actual local server requests.', 'Successful native bundle retention is controlled by the plugin; orphan case checks only abandoned pending cleanup.'] };
  }
  save(progressFile, progress);
  const fixture = name => fixtures[name].manifest;
  const select = name => selectFixture({ config:configPath, out:fixtureRoot, platform:'ios', case:name });
  const network = (mode, more = {}) => setNetworkFixture({ config:configPath, platform:'ios', mode, ...more });
  const complete = name => progress.steps.find(step => step.name === name && step.status === 'passed');
  const after = name => complete(name).report.after;
  const assertPrefs = state => {
    check(state.durable, 'No valid durable save slot');
    for (const [key,value] of Object.entries(preferences)) {
      check(state.preferences[key] === value, `WebView preference changed: ${key}`);
      check(state.durable.preferences[key] === value, `Durable preference changed: ${key}`);
    }
    check(state.sequence === state.durable.sequence, 'Durable updater sequence differs from mirror');
    check(JSON.stringify(state.pending) === JSON.stringify(state.durable.pending), 'Durable pending marker differs from mirror');
  };
  const sameCurrent = (state, expected) => {
    check(state.current.id === expected.current.id && state.current.version === expected.current.version && state.marker === expected.marker, 'Current bundle/content changed before cold launch');
  };
  const staged = (report, name, before) => {
    check(!report.timeout, `${name} did not stage within 90s`);
    sameCurrent(report.after, before);
    check(report.after.pending?.sequence === fixture(name).sequence && report.after.pending?.version === fixture(name).bundleId, 'Wrong pending release');
    check(report.after.sequence === fixture(name).sequence, 'High-water sequence not advanced');
    assertPrefs(report.after);
  };
  const activated = (state, name) => {
    check(state.current.version === fixture(name).bundleId && state.current.status === 'success' && state.marker === fixtures[name].marker, `Expected healthy active ${name}`);
    check(state.pending === null, 'Activated pending marker was not consumed');
    assertPrefs(state);
  };
  const serverEvents = offset => fs.readFileSync(serverLog, 'utf8').slice(offset).split('\n').flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const requestSeen = (events, pathname) => events.some(event => event.method === 'GET' && event.path === pathname);
  async function step(name, prepare, body, validate, timeout = 150000) {
    if (complete(name)) { console.log(`[${name}] retained passed evidence`); return; }
    const record = { name, status:'running', startedAt:new Date().toISOString() };
    progress.steps.push(record); save(progressFile, progress);
    const started = Date.now(), token = randomUUID();
    const log = path.join(output, `${name}-${token}.log`);
    const probeFile = path.join(output, `${name}-${token}.js`);
    let heartbeat;
    try {
      await prepare();
      await checkServer(config);
      const offset = fs.readFileSync(serverLog, 'utf8').length;
      record.probeFile = probeFile; record.log = log;
      const namespace = `trials.nativeUpdates.ios.${suite.fixtureReport.nativeVersion}.${fixtures.validA.manifest.runtime}`;
      fs.writeFileSync(probeFile, `const updateNamespace=${JSON.stringify(namespace)};\n${probeLibrary}\ntry {\nconst result = await (async () => {\n${body()}\n})();\nreturn {probeAt:Date.now(), token:${JSON.stringify(token)}, ...result};\n} catch (error) { return {probeAt:Date.now(), token:${JSON.stringify(token)}, error:String(error), after:await snapshot()}; }\n`);
      console.log(`[${name}] launching installed app; timeout ${timeout / 1000}s`);
      heartbeat = setInterval(() => console.log(`[${name}] waiting ${Math.round((Date.now()-started)/1000)}s`), 20000);
      const result = await runChild(process.execPath, ['scripts/native-ios-probe.mjs'], {
        log, timeout:timeout+30000,
        env:{...process.env, TRIALS_SIMULATOR:device, TRIALS_PROBE_NO_INSTALL:'1', TRIALS_PROBE_FILE:probeFile, TRIALS_PROBE_TIMEOUT_MS:String(timeout)},
      });
      record.elapsedMs = Date.now()-started;
      record.process = result;
      record.serverEvents = serverEvents(offset);
      const reported = read('.native-build/evidence/ios-probe.json');
      record.report = reported;
      check(reported.token === token && reported.probeAt >= started, 'Probe returned no matching fresh report');
      check(result.code === 0 && !result.timedOut && !reported.error, reported.error ?? 'Native probe process failed');
      await validate(reported, record);
      record.status = 'passed'; record.finishedAt = new Date().toISOString();
      save(path.join(output, `${name}.json`), record);
      save(progressFile, progress);
      console.log(`[${name}] PASS (${Math.round(record.elapsedMs/1000)}s)`);
    } catch (error) {
      record.status = 'failed'; record.error = error.message; record.finishedAt = new Date().toISOString();
      save(path.join(output, `${name}.json`), record); save(progressFile, progress);
      throw new Error(`${name}: ${error.message}`);
    } finally { clearInterval(heartbeat); }
  }
  const observe = () => 'await pause(1200); return {after:await snapshot()};';
  const stageBody = name => () => `return await waitPending(${fixture(name).sequence});`;
  try {
    network('normal');
    await step('baseline', () => select('expired'), () => `
      h.app.goto('settings'); await pause(500);
      const rows=[...document.querySelectorAll('.settings-screen .setting')];
      const sound=rows.find(row => row.querySelector('.lab')?.firstChild?.textContent?.trim()==='Sound');
      expect(sound, 'Sound setting missing'); sound.querySelector('[data-v="off"]').click();
      for(let i=0;i<10;i++) document.querySelector('.settings-screen [aria-label="quieter"]').click();
      for(let i=0;i<3;i++) document.querySelector('.settings-screen [aria-label="louder"]').click();
      h.app.goto('menu'); await pause(3000); return {after:await snapshot()};
    `, report => {
      check(report.after.sequence < fixture('validA').sequence && !report.after.pending, 'Fixtures must begin above installed sequence with no pending release');
      assertPrefs(report.after);
    });
    await step('stageA', () => select('validA'), stageBody('validA'), report => staged(report,'validA',after('baseline')));
    await step('activateA', () => select('validA'), observe, report => activated(report.after,'validA'));
    await step('interruptB', () => { network('interrupt'); select('validB'); }, () => `
      await ride(); const before=await snapshot(); await pause(30000); return {before,after:await snapshot()};
    `, (report,record) => {
      sameCurrent(report.after,after('activateA')); assertPrefs(report.after);
      check(!report.after.pending && report.after.sequence===fixture('validA').sequence,'Interrupted transfer advanced durable release state');
      check(record.serverEvents.some(e=>e.fault==='interrupt' && e.path===new URL(fixture('validB').url).pathname),'No interrupted ZIP transfer observed by local server');
    });
    await step('retryBWhileRiding', () => { network('delay', {'delay-ms':'15000'}); select('validB'); }, () => `
      await ride(); const before=await snapshot(); const result=await waitPending(${fixture('validB').sequence}); return {before,...result};
    `, (report,record) => {
      staged(report,'validB',after('activateA'));
      check(record.serverEvents.some(e=>e.fault==='delay' && e.path===new URL(fixture('validB').url).pathname),'No delayed retry transfer observed');
      check(report.samples.length>2 && report.samples.every(s=>s.screen==='run' && s.marker==='validA'),'Ride/content did not remain active throughout staging');
      check(new Set(report.samples.map(s=>s.tick)).size>1,'No game tick progression during download');
    });
    await step('activateB', () => { network('normal'); select('validB'); }, observe, report => activated(report.after,'validB'));
    await step('stageIntentionalRollback', () => select('intentionalRollback'), stageBody('intentionalRollback'), report => staged(report,'intentionalRollback',after('activateB')));
    await step('activateIntentionalRollback', () => select('intentionalRollback'), observe, report => activated(report.after,'intentionalRollback'));
    for (const name of ['expired','incompatible','wrongSignature','corruptZip']) {
      await step(name, () => select(name), () => 'await pause(30000); return {after:await snapshot()};', (report,record) => {
        sameCurrent(report.after,after('activateIntentionalRollback')); assertPrefs(report.after);
        check(!report.after.pending && report.after.sequence===fixture('intentionalRollback').sequence,'Rejected fixture changed durable update state');
        check(requestSeen(record.serverEvents,new URL(config.iosManifest).pathname),'No controller manifest request observed');
        const downloaded=requestSeen(record.serverEvents,new URL(fixture(name).url).pathname);
        check(downloaded===(name==='corruptZip'),name==='corruptZip'?'Corrupt ZIP was never requested':'Invalid manifest triggered ZIP download');
        check(!report.after.bundles.some(b=>b.version===fixture(name).bundleId && ['pending','success'].includes(b.status)),'Rejected fixture became usable native bundle');
      });
    }
    await step('seedOrphan', () => { select('intentionalRollback'); selectFixture({config:configPath,out:fixtureRoot,platform:'ios',case:'orphan','archive-only':'true'}); }, () => `
      const before=await snapshot();
      const downloaded=await updater.download(${JSON.stringify({url:fixture('orphan').url,version:fixture('orphan').bundleId,checksum:fixture('orphan').sha256})});
      return {before,downloaded,after:await snapshot()};
    `, report => {
      check(report.downloaded.status==='pending' && report.after.bundles.some(b=>b.id===report.downloaded.id),'Orphan was not seeded pending');
      sameCurrent(report.after,after('activateIntentionalRollback')); assertPrefs(report.after);
      check(!report.after.pending && report.after.sequence===fixture('intentionalRollback').sequence,'Orphan seed changed application pending/high-water state');
    });
    await step('cleanupOrphan', () => select('intentionalRollback'), () => 'await pause(3000); return {after:await snapshot()};', report => {
      sameCurrent(report.after,after('seedOrphan')); assertPrefs(report.after);
      check(!report.after.bundles.some(b=>b.id===complete('seedOrphan').report.downloaded.id),'Abandoned pending bundle survived normal launch cleanup');
      for(const b of after('seedOrphan').bundles.filter(b=>b.status==='success')) check(report.after.bundles.some(c=>c.id===b.id),'Orphan cleanup removed successful native bundle');
    });
    await step('stageBrokenStartup', () => select('brokenStartup'), stageBody('brokenStartup'), report => staged(report,'brokenStartup',after('activateIntentionalRollback')));
    await step('watchdogRecovery', () => select('brokenStartup'), observe, (report,record) => {
      check(record.elapsedMs>=110000,'Healthy game returned too early to establish 120s watchdog rollback');
      activated(report.after,'intentionalRollback');
      check(report.after.sequence===fixture('brokenStartup').sequence,'Rejected startup sequence was not retained');
      check(!report.after.bundles.some(b=>b.version===fixture('brokenStartup').bundleId && ['pending','success'].includes(b.status)),'Broken startup remains usable');
    }, 210000);
    await step('recoveryColdLaunch', () => select('brokenStartup'), observe, (report,record) => {
      activated(report.after,'intentionalRollback');
      check(report.after.sequence===fixture('brokenStartup').sequence && record.elapsedMs<90000,'Later launch retried broken startup or lost high-water state');
    });
    progress.pass=stages.every(name=>Boolean(complete(name)));
    progress.finishedAt=new Date().toISOString();
    save(progressFile,progress);
    console.log(`Suite ${progress.pass?'PASS':'INCOMPLETE'}: ${progressFile}`);
    return progress;
  } finally { network('normal'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options={};
  try {
    for(let i=2;i<process.argv.length;i++) {
      const arg=process.argv[i];
      if(arg==='--help') { console.log('node scripts/native-ios-ota-suite.mjs [--fixtures DIR] [--config FILE] [--output DIR] [--device UDID] [--server-log FILE] [--resume] [--dry-run]'); process.exit(0); }
      check(arg.startsWith('--'),'Use --name value options');
      const key=arg.slice(2);
      check(['fixtures','config','output','device','server-log','resume','dry-run'].includes(key),`Unknown option: ${arg}`);
      if(['resume','dry-run'].includes(key)) options[key]=true;
      else { check(process.argv[i+1] && !process.argv[i+1].startsWith('--'),`Missing value: ${arg}`); options[key]=process.argv[++i]; }
    }
    const report=await runSuite(options);
    if(options['dry-run']) console.log(JSON.stringify(report,null,2));
    else if(!report.pass) process.exitCode=1;
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
