#!/usr/bin/env node
/** Installed iOS OTA transfer retry and durable failed-start quarantine. Local HTTPS only.
 * Caller builds/installs QA, trusts its temporary CA, and selects expired before launch.
 * This runner never builds, installs, mounts storage, resets saves or changes native metadata.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { loadSuite } from './native-ios-ota-suite.mjs';
import { selectFixture, setNetworkFixture } from './native-ota-fixtures.mjs';

const options = {};
for (let i=2;i<process.argv.length;i+=2) {
  const key=process.argv[i]?.slice(2);
  if (!['fixtures','config','output','server-log','evidence'].includes(key) || !process.argv[i+1]) throw new Error('Use --fixtures DIR --config FILE --output DIR --server-log FILE [--evidence FILE]');
  options[key]=process.argv[i+1];
}
const suite=loadSuite(options), {config,configPath,fixtureRoot,fixtures}=suite;
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788', appId='com.trialsgauntlet.game';
const output=path.resolve(options.output??'.native-build/ios-ota-round10');
const evidence=options.evidence??'docs/evidence/native-mobile/ios-ota-round10.json';
const serverLog=path.resolve(options['server-log']??'.native-build/ota-server-round10.log');
const namespace=`trials.nativeUpdates.ios.${suite.fixtureReport.nativeVersion}.${fixtures.validA.manifest.runtime}`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
check(!fs.existsSync(path.join(output,'progress.json')),'Use a fresh output directory; stages are deliberately not resumed after partially applied updates');
check(fs.existsSync(serverLog),'Missing running TLS server log');
const higher=fixtures.brokenStartupRetry;
check(higher&&higher.signatureValid&&higher.archiveHashValid,'Missing verified higher-sequence signed brokenStartupRetry');
check(higher.manifest.sequence>fixtures.brokenStartup.manifest.sequence&&higher.manifest.bundleId===fixtures.brokenStartup.manifest.bundleId&&higher.manifest.sha256===fixtures.brokenStartup.manifest.sha256,'Republished failure must change only publication metadata and retain exact bundle version/hash');
const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);
check(target?.state==='Booted','Caller must prepare the task-owned simulator before running');
const container=sim('get_app_container',device,appId,'data');
const installed=sim('get_app_container',device,appId,'app');
const contract=read(path.join(installed,'public/native-build.json'));
check(contract.channels?.ios===config.iosManifest,'Installed QA contract/channel mismatch');
fs.mkdirSync(output,{recursive:true});
const report={schema:1,startedAt:new Date().toISOString(),device:{udid:device,name:target.name,runtime:'iOS Simulator 26.5'},
  sourceRevision:suite.fixtureReport.sourceRevision,fixtureSha256:suite.fixtureSha256,
  installed:{contract,indexSha256:sha(fs.readFileSync(path.join(installed,'public/index.html'))),executableSha256:sha(fs.readFileSync(path.join(installed,'App'))),debugLibrarySha256:sha(fs.readFileSync(path.join(installed,'App.debug.dylib'))),nativeConfigSha256:sha(fs.readFileSync(path.join(installed,'capacitor.config.json')))},
  channel:config.iosManifest,namespace,steps:[],pass:false,
  scope:'Real installed controller, native plugin and durable game saves; locally signed fixture publications only.',
  limitations:['Simulator only; no physical phone, store distribution or motion-quality claim.','Game hooks and ordinary Settings DOM handlers establish progress/preferences; OS touch qualification is separate.','Interrupted network transfer is not ENOSPC; no low-space staging or extraction claim.','Higher-sequence rejection is observed for 30 seconds, correlated with a manifest GET and absence of ZIP GET.','Watchdog failure remains foreground; backgrounding an unacknowledged startup for longer than120 seconds is unqualified.']};
const persist=()=>{write(path.join(output,'progress.json'),report);write(evidence,report);};
const selected=name=>selectFixture({config:configPath,out:fixtureRoot,platform:'ios',case:name});
const network=mode=>setNetworkFixture({config:configPath,platform:'ios',mode});
const fixture=name=>fixtures[name].manifest;
const library=`
const h=window.__trials, updater=Capacitor.Plugins.CapacitorUpdater;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const expect=(ok,message)=>{if(!ok)throw new Error(message);};
const namespace=${JSON.stringify(namespace)};
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const keep=key=>['trials.sound','trials.volume','trials.ghost','trials.bikeClass','trials.riderOutfit','trials.riderModel'].includes(key)||key.startsWith('trials.best.')||key.startsWith('trials.lastrun.');
const content=async entries=>{
 const values=Object.fromEntries(Object.entries(entries).filter(([key])=>keep(key)).sort(([a],[b])=>a.localeCompare(b)));
 return {sha256:await digest(JSON.stringify(values)),keys:Object.keys(values),sound:values['trials.sound'],volume:values['trials.volume']};
};
const meta=entries=>{
 const raw=entries[namespace+'.pending'];let pending=null;
 if(raw){const p=JSON.parse(raw),m=JSON.parse(atob(p.envelope.payload.replace(/-/g,'+').replace(/_/g,'/')));pending={id:p.id,sequence:m.sequence,version:m.bundleId,checksum:m.sha256};}
 return {pending,sequence:Number(entries[namespace+'.sequence']??0),activations:JSON.parse(entries[namespace+'.activations']??'[]')};
};
const snapshot=async()=>{
 const entries=Object.fromEntries(Object.entries(localStorage)),slots=[];
 for(const name of ['trials-save-a.json','trials-save-b.json']){
  try {const raw=(await Capacitor.Plugins.Filesystem.readFile({directory:'LIBRARY',path:name,encoding:'utf8'})).data,s=JSON.parse(raw);
   const payload=JSON.stringify({version:s.version,generation:s.generation,entries:s.entries});let n=2166136261;
   for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);
   slots.push({name,generation:s.generation,valid:s.version===1&&(n>>>0).toString(16).padStart(8,'0')===s.checksum,rawSha256:await digest(raw),content:await content(s.entries),...meta(s.entries)});
  }catch(error){slots.push({name,valid:false,error:String(error)});}
 }
 return {current:(await updater.current()).bundle,bundles:(await updater.list()).bundles,marker:window.__nativeOtaFixture??null,
  ready:h.ready,screen:h.app.screen(),tick:h.frame(),origin:location.origin,hasServiceWorker:Boolean(navigator.serviceWorker?.controller),
  content:await content(entries),...meta(entries),slots,durable:slots.filter(s=>s.valid).sort((a,b)=>b.generation-a.generation)[0]??null};
};
const waitPending=async sequence=>{for(let i=0;i<180;i++){const s=await snapshot();if(s.pending?.sequence===sequence){await pause(800);return {after:await snapshot()};}await pause(500);}throw new Error('Pending marker did not appear');};
`;
function diskMeta(){
  return ['a','b'].flatMap(slot=>{
    try {
      const bytes=fs.readFileSync(path.join(container,`Library/trials-save-${slot}.json`));
      const value=JSON.parse(bytes),payload=JSON.stringify({version:value.version,generation:value.generation,entries:value.entries});let n=2166136261;
      for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);
      if(value.version!==1||(n>>>0).toString(16).padStart(8,'0')!==value.checksum)return [];
      return [{slot,generation:value.generation,at:Date.now(),sequence:Number(value.entries[namespace+'.sequence']??0),activations:JSON.parse(value.entries[namespace+'.activations']??'[]'),rawSha256:sha(bytes)}];
    }catch{return [];}
  }).sort((a,b)=>b.generation-a.generation)[0]??null;
}
async function serverReady(){
 await new Promise((resolve,reject)=>{const request=https.get(config.iosManifest,{ca:fs.readFileSync(config.certPath),timeout:5000},response=>{response.resume();response.on('end',()=>response.statusCode===200?resolve():reject(new Error('Fixture server non-200')));});request.on('timeout',()=>request.destroy(new Error('Fixture server timeout')));request.on('error',reject);});
}
function runProbe(file,log,timeout){
 return new Promise((resolve,reject)=>{
  const stream=fs.createWriteStream(log),child=spawn(process.execPath,['scripts/native-ios-probe.mjs'],{env:{...process.env,TRIALS_SIMULATOR:device,TRIALS_PROBE_NO_INSTALL:'1',TRIALS_PROBE_FILE:file,TRIALS_PROBE_TIMEOUT_MS:String(timeout)},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
  const timer=setTimeout(()=>child.kill('SIGTERM'),timeout+30000);
  child.once('error',error=>{clearTimeout(timer);stream.end();reject(error);});
  child.once('close',code=>{clearTimeout(timer);stream.end(()=>resolve(code));});
 });
}
const completed=name=>report.steps.find(s=>s.name===name&&s.pass)?.result.after;
function intact(state){
 check(state.ready&&!state.hasServiceWorker&&state.origin==='capacitor://localhost','Healthy local native game required');
 check(state.durable&&state.content.sha256===state.durable.content.sha256,'Gameplay mirror is not durably saved');
 for(const key of ['sequence','pending','activations'])check(JSON.stringify(state[key])===JSON.stringify(state.durable[key]),`Durable ${key} mismatch`);
 check(state.content.sound==='0'&&state.content.volume==='0.3','Saved test preferences changed');
 const baseline=completed('baseline');if(baseline)check(state.content.sha256===baseline.content.sha256,'Progress or selected settings changed through OTA');
}
function sameCurrent(state,prior){check(state.current.id===prior.current.id&&state.current.version===prior.current.version&&state.marker===prior.marker,'Bundle changed before cold launch');}
async function step(name,prepare,body,validate,timeout=150000){
 const row={name,startedAt:new Date().toISOString(),pass:false};report.steps.push(row);persist();
 const token=randomUUID(),file=path.join(output,name+'.js'),log=path.join(output,name+'.log');
 let sampleTimer,heartbeat;
 try{
  prepare();await serverReady();
  const offset=fs.readFileSync(serverLog,'utf8').length,start=Date.now();
  fs.writeFileSync(file,`${library}\ntry{const result=await(async()=>{${body}})();return {token:${JSON.stringify(token)},probeAt:Date.now(),...result};}catch(error){return {token:${JSON.stringify(token)},probeAt:Date.now(),error:String(error),after:await snapshot()};}`);
  row.durableTimeline=[];const seen=new Set();
  const sample=()=>{const value=diskMeta();if(value&&!seen.has(value.rawSha256)){seen.add(value.rawSha256);row.durableTimeline.push(value);}};
  sample();sampleTimer=setInterval(sample,25);
  console.log(name+': installed launch');heartbeat=setInterval(()=>console.log(name+': waiting '+Math.round((Date.now()-start)/1000)+'s'),20000);
  row.exitCode=await runProbe(file,log,timeout);row.elapsedMs=Date.now()-start;sample();
  row.serverEvents=fs.readFileSync(serverLog,'utf8').slice(offset).split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const result=read('.native-build/evidence/ios-probe.json');row.result=result;row.log=log;
  check(row.exitCode===0&&result.token===token&&result.probeAt>=start&&!result.error,result.error??'Probe failed or stale');
  validate(result,row);row.pass=true;row.finishedAt=new Date().toISOString();persist();console.log(name+': PASS');
 }catch(error){row.error=error.message;persist();throw error;}finally{clearInterval(sampleTimer);clearInterval(heartbeat);}
}
const observe='await pause(1800);return {after:await snapshot()};';
function staged(result,name,previous){const state=result.after;sameCurrent(state,previous);intact(state);check(state.pending?.sequence===fixture(name).sequence&&state.pending?.version===fixture(name).bundleId&&state.sequence===fixture(name).sequence,'Wrong pending publication');check(state.activations.length===0,'Staging prematurely quarantined a transfer');}
function active(state,name){intact(state);check(state.current.status==='success'&&state.current.version===fixture(name).bundleId&&state.marker===fixtures[name].marker&&!state.pending,'Expected acknowledged healthy active '+name);}
try{
 network('normal');
 const recording=fs.readFileSync('harness/inputs/b1-first-ride/bot-3-pro.json','utf8');
 report.recording={path:'harness/inputs/b1-first-ride/bot-3-pro.json',sha256:sha(recording)};
 await step('baseline',()=>selected('expired'),`
  h.app.play('b1-first-ride');await pause(1500);for(const button of document.querySelectorAll('button'))if(/got it/i.test(button.textContent))button.click();
  h.runRecording(${JSON.stringify(recording)});const clear={phase:h.phase(),time:h.finishTime(),hash:h.hashState(),faults:h.faults()};expect(clear.phase==='finished'&&clear.time!==null,'Recorded input did not clear');h.step(180);await pause(1200);h.app.quit();
  h.app.goto('settings');await pause(500);const sound=[...document.querySelectorAll('.settings-screen .setting')].find(r=>r.querySelector('.lab')?.firstChild?.textContent?.trim()==='Sound');expect(sound,'Sound setting missing');sound.querySelector('[data-v="off"]').click();
  for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<3;i++)document.querySelector('.settings-screen [aria-label="louder"]').click();h.app.goto('menu');await pause(2500);return {clear,after:await snapshot()};
 `,result=>{intact(result.after);check(result.after.sequence<fixture('validA').sequence&&!result.after.pending&&result.after.activations.length===0,'QA sequence must exceed clean initial updater state');check(result.after.content.keys.some(k=>k.startsWith('trials.best.'))&&result.after.content.keys.some(k=>k.startsWith('trials.lastrun.')),'No saved PB/last-run progress');});
 await step('stageA',()=>selected('validA'),`return await waitPending(${fixture('validA').sequence});`,r=>staged(r,'validA',completed('baseline')));
 await step('activateA',()=>selected('validA'),observe,(r,row)=>{active(r.after,'validA');check(r.after.activations.length===0,'Healthy readiness did not clear journal');check(row.durableTimeline.some(s=>s.activations.some(a=>a.version===fixture('validA').bundleId)),'No durable preactivation journal observed before healthy clearing');});
 await step('interruptB',()=>{network('interrupt');selected('validB');},'await pause(30000);return {after:await snapshot()};',(r,row)=>{sameCurrent(r.after,completed('activateA'));intact(r.after);check(!r.after.pending&&r.after.sequence===fixture('validA').sequence&&r.after.activations.length===0,'Transfer failure changed pending/sequence/journal');check(row.serverEvents.some(e=>e.fault==='interrupt'&&e.path===new URL(fixture('validB').url).pathname),'No real interrupted ZIP request');});
 await step('retrySamePublicationB',()=>{network('normal');selected('validB');},`return await waitPending(${fixture('validB').sequence});`,r=>staged(r,'validB',completed('activateA')));
 await step('activateB',()=>selected('validB'),observe,(r,row)=>{active(r.after,'validB');check(r.after.activations.length===0&&row.durableTimeline.some(s=>s.activations.some(a=>a.version===fixture('validB').bundleId)),'Healthy B activation journal lifecycle not observed');});
 await step('stageBrokenStartup',()=>selected('brokenStartup'),`return await waitPending(${fixture('brokenStartup').sequence});`,r=>staged(r,'brokenStartup',completed('activateB')));
 await step('watchdogRecovery',()=>selected('brokenStartup'),observe,(r,row)=>{
  active(r.after,'validB');check(row.elapsedMs>=110000,'Fallback returned before actual watchdog interval');
  const entry=r.after.activations.find(a=>a.version===fixture('brokenStartup').bundleId);check(entry?.id===completed('stageBrokenStartup').pending.id,'Failed activation ledger lost exact bundle identity');
  check(r.after.sequence===fixture('brokenStartup').sequence,'Watchdog lost high-water sequence');
  check(!r.after.bundles.some(b=>b.version===fixture('brokenStartup').bundleId&&['success','pending'].includes(b.status)),'Failed bundle still usable');
  check(!r.after.bundles.some(b=>b.id===entry.id),'Failed native bundle metadata was not auto-deleted');
 },210000);
 await step('rejectHigherSequenceSameVersion',()=>selected('brokenStartupRetry'),'await pause(30000);return {after:await snapshot()};',(r,row)=>{
  active(r.after,'validB');check(r.after.sequence===fixture('brokenStartup').sequence&&JSON.stringify(r.after.activations)===JSON.stringify(completed('watchdogRecovery').activations),'Republished bad version modified sequence or quarantine');
  check(row.serverEvents.some(e=>e.method==='GET'&&e.path===new URL(config.iosManifest).pathname),'Controller did not fetch higher-sequence manifest');
  check(!row.serverEvents.some(e=>e.method==='GET'&&e.path===new URL(higher.manifest.url).pathname),'Quarantined same-version archive was downloaded again');
 });
 report.pass=true;report.finishedAt=new Date().toISOString();persist();
}catch(error){report.error=error.message;persist();console.error(error.message);process.exitCode=1;}finally{network('normal');}
