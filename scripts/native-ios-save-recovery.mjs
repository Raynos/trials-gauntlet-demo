#!/usr/bin/env node
// Installed native save faults, with exact original-byte backups and finally restoration.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788',appId='com.trialsgauntlet.game';
const output=path.resolve(`.native-build/ios-save-recovery/${new Date().toISOString().replaceAll(':','-')}`);
const evidence='docs/evidence/native-mobile/ios-save-recovery-round8.json',slotNames=['trials-save-a.json','trials-save-b.json'];
const previousEvidence=fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):null;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const saveJSON=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const report={schema:1,startedAt:new Date().toISOString(),pass:false,device:{udid:device,name:'trials-iphone',model:'iPhone 16 Pro',runtime:'iOS Simulator 26.5'},steps:[],cases:{},
 scope:'Real committed/pending files and native cold startup. Original slot bytes backed up before faults, restored in finally; no uninstall, reset, mocks, or native plugin changes.',
 limits:['Unknown version2 is a synthetic future-format rejection fixture, not a schema2 migration implementation or migration qualification.', 'Debug probe reads game state and invokes routes; this is not native touch, visual or audio judgement.', 'Bundled local-origin simulator boot, not network-disabled iOS, physical hardware or store distribution.', 'A complete higher-generation pending snapshot models interruption after staging and before commit; no actual process kill during a write is claimed.']};
fs.mkdirSync(output,{recursive:true});
if(previousEvidence){saveJSON(path.join(output,'previous-attempt.json'),previousEvidence);report.previousAttempt={path:path.join(output,'previous-attempt.json'),error:previousEvidence.error,cleanup:previousEvidence.cleanup};}
const persist=()=>{saveJSON(evidence,report);saveJSON(path.join(output,'report.json'),report);};
let library,booted=false,activeChild,pendingOwned=false;
const originals=new Map(),fixtures=new Map();
const checksum=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');};
const encode=value=>JSON.stringify({...value,checksum:checksum(JSON.stringify({version:value.version,generation:value.generation,entries:value.entries}))});
function snapshots(){return slotNames.map(name=>{const bytes=fs.readFileSync(path.join(library,name));let value;try{value=JSON.parse(bytes);}catch{/* Corrupt fixture is deliberately unparsable. */}return{name,sha256:sha(bytes),bytes:bytes.length,version:value?.version??null,generation:value?.generation??null,volume:value?.entries?.['trials.volume']??null,checksum:value?.checksum??null,mode:(fs.statSync(path.join(library,name)).mode&0o7777).toString(8)};});}
function sameBytes(a,b){return a.length===b.length&&a.every((s,i)=>s.name===b[i].name&&s.sha256===b[i].sha256);}
function writeSlot(name,bytes){check(slotNames.includes(name)&&originals.has(name),'Refusing unknown save path');const file=path.join(library,name);check(!fs.lstatSync(file).isSymbolicLink(),'Refusing save symlink');fs.writeFileSync(file,bytes);}
function restoreOriginals(){for(const[name,s]of originals){writeSlot(name,s.bytes);fs.chmodSync(path.join(library,name),s.mode);}}
function restoreFixtures(){for(const[name,bytes]of fixtures)writeSlot(name,bytes);}
function stop(){try{sim('terminate',device,appId);}catch{/* Already stopped. */}}
const lib=`
const fsPlugin=Capacitor.Plugins.Filesystem,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorInfo=error=>({code:error?.code??null,message:error?.message??String(error),name:error?.name??null});
const snapshot=async()=>{
 const slots=[];for(const name of ['trials-save-a.json','trials-save-b.json']){
  const raw=(await fsPlugin.readFile({directory:'LIBRARY',path:name,encoding:'utf8'})).data;
  let s;try{s=JSON.parse(raw);}catch{}let valid=false;
  if(s){const payload=JSON.stringify({version:s.version,generation:s.generation,entries:s.entries});let n=2166136261;for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);valid=s.version===1&&(n>>>0).toString(16).padStart(8,'0')===s.checksum;}
  slots.push({name,valid,version:s?.version??null,generation:s?.generation??null,volume:s?.entries?.['trials.volume']??null,checksum:s?.checksum??null,characters:raw.length});
 }
 const app=window.__trials?.app,priorScreen=app?.screen()??null;let settingsVolumeText=null,gameVolume=null;
 if(app){app.goto('settings');await sleep(50);settingsVolumeText=document.querySelector('.settings-screen [aria-label="quieter"]')?.closest('.setting')?.querySelector('.val')?.textContent??null;gameVolume=settingsVolumeText===null?null:Number.parseFloat(settingsVolumeText)/100;app.goto(priorScreen);}
 return {origin:location.origin,slots,durable:slots.filter(s=>s.valid).sort((a,b)=>b.generation-a.generation)[0]??null,mirrorVolume:localStorage.getItem('trials.volume'),gameVolume,settingsVolumeText,ready:!!window.__trials?.ready,screen:app?.screen()??null,hasGame:!!app,loaderFailed:!!document.querySelector('#loader.failed'),failureText:document.querySelector('#loader .err')?.textContent??null};
};
`;
async function launch(name,body,{failedBoot=false}={}){
 const token=randomUUID(),file=path.join(output,`${name}.js`),log=path.join(output,`${name}.log`);
 fs.writeFileSync(file,`${lib}\ntry{const value=await(async()=>{${body}})();return {probeAt:Date.now(),token:${JSON.stringify(token)},...value};}catch(error){return {probeAt:Date.now(),token:${JSON.stringify(token)},error:errorInfo(error)};}`);
 const stream=fs.createWriteStream(log);activeChild=spawn(process.execPath,['scripts/native-ios-probe.mjs'],{env:{...process.env,TRIALS_SIMULATOR:device,TRIALS_PROBE_NO_INSTALL:'1',TRIALS_PROBE_FILE:file,TRIALS_PROBE_TIMEOUT_MS:'240000',SIMCTL_CHILD_TRIALS_PROBE_ALLOW_FAILED_BOOT:failedBoot?'1':'0'},stdio:['ignore','pipe','pipe']});
 const child=activeChild;child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 const started=Date.now(),timer=setInterval(()=>console.log(`${name}: waiting ${Math.round((Date.now()-started)/1000)}s`),20000);
 const done=new Promise((resolve,reject)=>{
  child.on('error',error=>{clearInterval(timer);stream.end();reject(error);});
  child.on('close',code=>{clearInterval(timer);stream.end(()=>{
   try{const result=read('.native-build/evidence/ios-probe.json');check(result.token===token,'No fresh matching native report');saveJSON(path.join(output,`${name}.json`),result);report.steps.push({name,log,path:path.join(output,`${name}.json`),report:result,exitCode:code});persist();check(code===0&&!result.error,`${name}: ${JSON.stringify(result.error??{exitCode:code})}`);resolve(result);}catch(error){reject(error);}
  });});
 });
 // Prevent a rejected child from becoming unhandled while host-side handshake is awaiting a phase.
 done.catch(()=>undefined);return {done,child};
}
async function probe(name,{failedBoot=false,body='await sleep(800);return {state:await snapshot()};'}={}){const launched=await launch(name,body,{failedBoot});return launched.done;}
try{
 const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);check(target?.state==='Shutdown','Task primary simulator must be shutdown');
 const app=path.join(output,'App.app');fs.cpSync(process.env.TRIALS_SAVE_RECOVERY_APP??'.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',app,{recursive:true});
 const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 report.artifact={version:info.CFBundleShortVersionString,build:info.CFBundleVersion,id:info.CFBundleIdentifier,indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),contract:read(path.join(app,'public/native-build.json')),debugLibrarySha256:sha(fs.readFileSync(path.join(app,'App.debug.dylib'))),path:app};check(info.CFBundleIdentifier===appId,'Wrong native app identity');persist();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,app);
 const container=fs.realpathSync(sim('get_app_container',device,appId,'data'));check(container.includes(`/Devices/${device}/data/Containers/Data/Application/`),'Unexpected task container');library=path.join(container,'Library');report.container=container;
 for(const name of slotNames){const file=path.join(library,name);check(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink(),'Existing committed slots required');const bytes=fs.readFileSync(file),mode=fs.statSync(file).mode&0o7777;originals.set(name,{bytes,mode});fs.writeFileSync(path.join(output,name+'.original'),bytes);}
 report.originalSlots=snapshots();persist();
 const pending=path.join(library,'trials-save-pending.json');let pendingExists=false;try{fs.lstatSync(pending);pendingExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}check(!pendingExists,'Refusing to replace an existing pending-save path');persist();
 const baseline=await probe('seed-and-uncommitted-mirror',{body:`
 const setVolume=async(value)=>{window.__trials.app.goto('settings');await sleep(400);for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<value*10;i++)document.querySelector('.settings-screen [aria-label="louder"]').click();window.__trials.app.goto('menu');for(let i=0;i<150;i++){if((await snapshot()).durable?.volume===String(value)){await sleep(500);return;}await sleep(100);}throw new Error('Settings seed did not persist');};
 await setVolume(0.2);await setVolume(0.6);const before=await snapshot();localStorage.setItem('trials.volume','0.9');return {state:before,uncommittedMirrorVolume:localStorage.getItem('trials.volume')};
 `});
 stop();report.seededSlots=snapshots();for(const name of slotNames){const bytes=fs.readFileSync(path.join(library,name));fixtures.set(name,bytes);fs.writeFileSync(path.join(output,name+'.seeded'),bytes);}
 const ordered=[...report.seededSlots].sort((a,b)=>b.generation-a.generation),latest=ordered[0],backup=ordered[1];check(latest.generation>backup.generation&&latest.volume!==backup.volume,'Seeded committed generations/volume values must differ');persist();
 check(baseline.state.ready&&baseline.state.gameVolume===Number(latest.volume),'Baseline did not load newest committed game volume');check(baseline.uncommittedMirrorVolume==='0.9'&&latest.volume!=='0.9'&&backup.volume!=='0.9','Uncommitted mirror sentinel must differ');stop();check(sameBytes(report.seededSlots,snapshots()),'Mirror sentinel changed committed files');
 const wrongChecksum=JSON.parse(fixtures.get(latest.name));wrongChecksum.checksum=wrongChecksum.checksum==='00000000'?'ffffffff':'00000000';writeSlot(latest.name,JSON.stringify(wrongChecksum));
 const single={injected:snapshots(),uncommittedMirrorVolume:'0.9',expectedBackup:backup};report.cases.latestCorrupt=single;persist();
 const recovered=await probe('latest-corrupt-recovers-backup');single.result=recovered.state;single.after=snapshots();
 check(recovered.state.ready&&!recovered.state.loaderFailed&&recovered.state.durable?.name===backup.name&&recovered.state.mirrorVolume===backup.volume&&recovered.state.gameVolume===Number(backup.volume),'Latest corruption did not choose committed backup over uncommitted mirror');check(sameBytes(single.injected,single.after),'Backup recovery overwrote committed slot bytes');single.pass=true;persist();stop();restoreFixtures();
 writeSlot(latest.name,JSON.stringify(wrongChecksum));writeSlot(backup.name,'{"version":1,"generation":');const both={injected:snapshots()};report.cases.bothCorrupt=both;persist();
 const blocked=await probe('both-corrupt-blocks-boot',{failedBoot:true});both.result=blocked.state;both.after=snapshots();
 check(blocked.state.loaderFailed&&!blocked.state.hasGame&&/could not be read safely/.test(blocked.state.failureText),'Both corrupt saves did not block startup safely');check(sameBytes(both.injected,both.after),'Both-corrupt boot overwrote files');both.pass=true;persist();stop();restoreFixtures();
 const future=JSON.parse(fixtures.get(backup.name));future.version=2;writeSlot(backup.name,encode(future));const newer={injected:snapshots(),futureSlot:backup.name,otherValidSlot:latest.name};report.cases.unknownVersion=newer;persist();
 const versionBlocked=await probe('unknown-version-blocks-downgrade',{failedBoot:true});newer.result=versionBlocked.state;newer.after=snapshots();
 check(versionBlocked.state.loaderFailed&&!versionBlocked.state.hasGame&&/newer app version/.test(versionBlocked.state.failureText),'Unknown version did not prevent downgrade despite another valid slot');check(sameBytes(newer.injected,newer.after),'Unknown-version boot changed bytes');newer.pass=true;persist();stop();restoreFixtures();
 const staged=JSON.parse(fixtures.get(latest.name));staged.generation+=1000;staged.entries['trials.volume']='0.9';const pendingBytes=encode(staged);fs.writeFileSync(pending,pendingBytes,{flag:'wx'});pendingOwned=true;
 const interrupted={before:snapshots(),pending:{sha256:sha(pendingBytes),bytes:Buffer.byteLength(pendingBytes),generation:staged.generation,volume:'0.9'}};report.cases.interruptedPending=interrupted;persist();
 const ignored=await probe('interrupted-pending-not-adopted');interrupted.result=ignored.state;interrupted.after=snapshots();interrupted.pendingAfterSha256=sha(fs.readFileSync(pending));
 check(ignored.state.ready&&!ignored.state.loaderFailed&&ignored.state.gameVolume===Number(latest.volume)&&ignored.state.mirrorVolume===latest.volume&&ignored.state.durable?.generation===latest.generation,'Uncommitted pending snapshot was adopted');check(sameBytes(interrupted.before,interrupted.after)&&interrupted.pendingAfterSha256===interrupted.pending.sha256,'Pending-file startup changed committed or staged bytes');interrupted.pass=true;persist();stop();fs.unlinkSync(pending);pendingOwned=false;restoreOriginals();
 const originalLatest=[...report.originalSlots].sort((a,b)=>b.generation-a.generation)[0];
 const restored=await probe('original-saves-restored-cold');report.restoredCold=restored.state;
 check(restored.state.ready&&!restored.state.loaderFailed&&restored.state.gameVolume===Number(originalLatest.volume)&&restored.state.mirrorVolume===originalLatest.volume&&sameBytes(report.originalSlots,snapshots()),'Original saves did not cold-recover unchanged');report.pass=true;persist();
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;persist();}
finally{
 if(activeChild?.exitCode===null)activeChild.kill('SIGTERM');if(booted)stop();report.cleanup={};
 if(pendingOwned){try{const pending=path.join(library,'trials-save-pending.json');check(fs.lstatSync(pending).isFile()&&!fs.lstatSync(pending).isSymbolicLink(),'Owned pending path changed');fs.unlinkSync(pending);pendingOwned=false;report.cleanup.pendingRemoved=true;}catch(error){report.cleanup.pendingError=error.message;report.pass=false;}}
 if(originals.size){try{restoreOriginals();report.cleanup.restoredSlots=snapshots();report.cleanup.exactOriginalBytes=sameBytes(report.originalSlots,report.cleanup.restoredSlots);check(report.cleanup.exactOriginalBytes,'Original bytes not restored');report.cleanup.pendingAbsent=!fs.existsSync(path.join(library,'trials-save-pending.json'));}catch(error){report.cleanup.restoreError=error.message;report.pass=false;}}
 if(booted){try{sim('shutdown',device);report.cleanup.simulatorShutdown=true;}catch(error){report.cleanup.shutdownError=error.message;report.pass=false;}}
 report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({pass:report.pass,error:report.error,cases:Object.fromEntries(Object.entries(report.cases).map(([name,value])=>[name,value.pass??false])),cleanup:report.cleanup,evidence},null,2));if(!report.pass)process.exitCode=1;
}
