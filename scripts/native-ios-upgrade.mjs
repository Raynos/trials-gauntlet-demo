#!/usr/bin/env node
/** Headless installed-app binary upgrade persistence. No uninstall, save reset, cap sync or shared build.
 * node scripts/native-ios-upgrade.mjs [--skip-build]
 * Uses only the shutdown task-owned trials-iphone simulator. All full probe payloads stay ignored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788', appId='com.trialsgauntlet.game';
const root=path.resolve('.native-build/ios-upgrade');
const baseline=path.join(root,'Baseline.app');
const upgraded=path.join(root,'Build/Products/Debug-iphonesimulator/App.app');
const output=path.join(root,`qualification-${new Date().toISOString().replaceAll(':','-')}`);
const evidence='docs/evidence/native-mobile/ios-upgrade-round5.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const run=(command,args,log,env=process.env)=>new Promise((resolve,reject)=>{
  const stream=fs.createWriteStream(log),child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
  const start=Date.now(),timer=setInterval(()=>console.log(`${path.basename(log)}: ${Math.round((Date.now()-start)/1000)}s`),20000);
  child.on('error',error=>{clearInterval(timer);stream.end();reject(error);});
  child.on('close',code=>{clearInterval(timer);stream.end(()=>code===0?resolve():reject(new Error(`${command} exited ${code}; see ${log}`)));});
});
const bundle=app=>{
  const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
  return {path:app,id:info.CFBundleIdentifier,version:info.CFBundleShortVersionString,build:info.CFBundleVersion,
    executableSha256:sha(fs.readFileSync(path.join(app,info.CFBundleExecutable))),indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),contract:read(path.join(app,'public/native-build.json'))};
};
const library=`
const h=window.__trials;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const keep=key=>['trials.sound','trials.volume','trials.ghost','trials.bikeClass','trials.riderOutfit','trials.riderModel','trials.lastTrack'].includes(key)||key.startsWith('trials.best.')||key.startsWith('trials.lastrun.');
const select=entries=>Object.fromEntries(Object.entries(entries).filter(([key])=>keep(key)).sort(([a],[b])=>a.localeCompare(b)));
const snapshot=async()=>{
 const slots=[];
 for(const name of ['trials-save-a.json','trials-save-b.json']){
  try{
   const raw=(await Capacitor.Plugins.Filesystem.readFile({directory:'LIBRARY',path:name,encoding:'utf8'})).data;
   const s=JSON.parse(raw),payload=JSON.stringify({version:s.version,generation:s.generation,entries:s.entries});let n=2166136261;
   for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);
   slots.push({name,generation:s.generation,valid:s.version===1&&(n>>>0).toString(16).padStart(8,'0')===s.checksum,entries:select(s.entries)});
  }catch(error){slots.push({name,valid:false,error:String(error)});}
 }
 return {app:await Capacitor.Plugins.App.getInfo(),entries:select(Object.fromEntries(Object.entries(localStorage))),slots,
  durable:slots.filter(s=>s.valid).sort((a,b)=>b.generation-a.generation)[0]??null,
  updater:(await Capacitor.Plugins.CapacitorUpdater.current()).bundle,
  screen:h.app.screen(),ready:h.ready,origin:location.origin,online:navigator.onLine,
  externalResources:performance.getEntriesByType('resource').map(r=>r.name).filter(url=>!url.startsWith(location.origin)&&!url.startsWith('data:')&&!url.startsWith('blob:'))};
};
const wait=async(fn,message)=>{for(let i=0;i<300;i++){if(fn())return;await sleep(100);}throw new Error(message);};
const gameReads=async()=>{
 h.app.goto('garage');await sleep(600);
 const garage={bike:document.querySelector('.garage-screen [data-bike][aria-pressed="true"]')?.dataset.bike,outfit:document.querySelector('.garage-screen [data-outfit][aria-pressed="true"]')?.dataset.outfit};
 h.app.goto('settings');await sleep(300);
 const rows=[...document.querySelectorAll('.settings-screen .setting')];
 const selected=label=>rows.find(row=>row.querySelector('.lab')?.firstChild?.textContent?.trim()===label)?.querySelector('.seg .on')?.dataset.v;
 const settings={sound:selected('Sound'),ghost:selected('Ghost'),volume:document.querySelector('.settings-screen .slider .val')?.textContent};
 h.app.goto('menu');return {garage,settings};
};
`;
const report={schema:1,startedAt:new Date().toISOString(),checkout:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),device:{udid:device,name:'trials-iphone',model:'iPhone 16 Pro',runtime:'iOS Simulator 26.5'},steps:[],pass:false,
 scope:'Installed unsigned Debug binary 1.0.0 (1) to 1.0.1 (2), same app ID and existing container; no uninstall/reset.',
 limitations:['Simulator only; no physical-device or store-signed upgrade claim.','Bundled cold boot with disabled update channels and no external resource requests; simulator host network remains enabled, so this is not a network-disabled offline test.','Game hooks drive recorded input through the live game/result/storage path; Settings and Garage DOM handlers seed choices. Native OS touch qualification is separate.','No storage corruption or schema migration injected.','Playable ghost/replay state does not establish visual quality or audible output.']};
report.priorAttempts=fs.readdirSync(root).filter(name=>name.startsWith('qualification-')).flatMap(name=>{try{const prior=read(path.join(root,name,'progress.json'));return [{output:path.join(root,name),pass:prior.pass,error:prior.error??null,simulatorShutdown:prior.simulatorShutdown??false}];}catch{return [];}});
fs.mkdirSync(output,{recursive:true});
function persist(){write(path.join(output,'progress.json'),report);write(evidence,report);}
async function probe(name,body){
 const token=randomUUID(),file=path.join(output,`${name}.js`),log=path.join(output,`${name}.log`);
 fs.writeFileSync(file,`${library}\ntry {const result=await(async()=>{${body}})();return {probeAt:Date.now(),token:${JSON.stringify(token)},...result};}catch(error){return {probeAt:Date.now(),token:${JSON.stringify(token)},error:String(error),diagnostic:{screen:h.app.screen(),garageClass:document.querySelector('.garage-screen')?.className,outfitStatus:document.querySelector('.outfit-current')?.textContent,bike:localStorage.getItem('trials.bikeClass'),outfit:localStorage.getItem('trials.riderOutfit')}};}`);
 console.log(`${name}: launch installed app`);
 await run(process.execPath,['scripts/native-ios-probe.mjs'],log,{...process.env,TRIALS_SIMULATOR:device,TRIALS_PROBE_NO_INSTALL:'1',TRIALS_PROBE_FILE:file});
 const result=read('.native-build/evidence/ios-probe.json');check(result.token===token&&!result.error,'Missing fresh probe or reported failure');
 const dataFile=path.join(output,`${name}.json`);write(dataFile,result);
 report.steps.push({name,passed:true,probeAt:result.probeAt,path:dataFile,sha256:sha(fs.readFileSync(dataFile)),log});persist();return result;
}
function durable(state){check(state.durable,'No valid native save');check(JSON.stringify(state.entries)===JSON.stringify(state.durable.entries),'Native durable values differ from game mirror');}
function equalEntries(a,b){check(JSON.stringify(a)===JSON.stringify(b),'Persisted progress/preferences changed across binary installation');}
let booted=false,installedUpgrade=false;
try{
 const devices=JSON.parse(sim('list','devices','available','--json')).devices;
 const target=Object.values(devices).flat().find(d=>d.udid===device);
 check(target?.state==='Shutdown','Task simulator must be shutdown; refusing to interrupt another session');
 if(!process.argv.includes('--skip-build')){
  fs.cpSync('.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',baseline,{recursive:true});
  await run('xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',root,'-clonedSourcePackagesDirPath','.native-build/ios/SourcePackages','-packageAuthorizationProvider','netrc','CODE_SIGNING_ALLOWED=NO','MARKETING_VERSION=1.0.1','CURRENT_PROJECT_VERSION=2','build'],path.join(output,'build.log'));
 }
 report.baseline=bundle(baseline);report.upgraded=bundle(upgraded);
 check(report.baseline.version==='1.0.0'&&report.baseline.build==='1','Baseline is not 1.0.0 (1)');
 check(report.upgraded.version==='1.0.1'&&report.upgraded.build==='2','Upgrade Info.plist is not 1.0.1 (2)');
 check(report.baseline.id===appId&&report.upgraded.id===appId,'App identity changed');
 check(report.baseline.indexSha256===report.upgraded.indexSha256,'Web payload differs; this test qualifies native binary upgrade only');
 check(report.baseline.contract.channels===null&&report.upgraded.contract.channels===null,'Normal disabled-channel build required');persist();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,baseline);
 const beforeContainer=sim('get_app_container',device,appId,'data');report.beforeContainer=beforeContainer;
 const recording=fs.readFileSync('harness/inputs/b1-first-ride/bot-3-pro.json','utf8');
 report.input={path:'harness/inputs/b1-first-ride/bot-3-pro.json',sha256:sha(recording)};
 const seeded=await probe('seed',`
  const before=await snapshot();
  h.app.play('b1-first-ride');await sleep(1500);
  for(const button of document.querySelectorAll('button'))if(/got it/i.test(button.textContent))button.click();
  h.runRecording(${JSON.stringify(recording)});
  const clear={time:h.finishTime(),hash:h.hashState(),faults:h.faults(),phase:h.phase()};
  assert(clear.time!==null&&clear.phase==='finished','Seed recording did not clear');h.step(180);await sleep(1200);h.app.quit();
  h.app.goto('settings');await sleep(500);
  const rows=[...document.querySelectorAll('.settings-screen .setting')];
  for(const [label,value]of [['Sound','off'],['Ghost','on']]){const row=rows.find(r=>r.querySelector('.lab')?.firstChild?.textContent?.trim()===label);assert(row,'Missing setting '+label);row.querySelector('[data-v="'+value+'"]').click();}
  for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();
  for(let i=0;i<4;i++)document.querySelector('.settings-screen [aria-label="louder"]').click();
  h.app.goto('garage');await wait(()=>document.querySelector('.garage-screen')?.classList.contains('live'),'Garage did not become live');await sleep(200);
  document.querySelector('.garage-screen [data-bike="pro"]').click();
  document.querySelector('.garage-screen [data-outfit="street-charcoal"]').click();
  await wait(()=>localStorage.getItem('trials.riderOutfit')==='street-charcoal','Outfit handler did not persist');
  const reads=await gameReads();
  await sleep(1200);return {before,clear,reads,after:await snapshot()};
 `);
 durable(seeded.after);
 const pbKey='trials.best.b1-first-ride@pro',lastKey='trials.lastrun.b1-first-ride';
 const pb=JSON.parse(seeded.after.entries[pbKey]??'null'),last=JSON.parse(seeded.after.entries[lastKey]??'null');
 check(pb?.recording&&last?.recording&&pb.time>0&&last.time===seeded.clear.time,'Game result path did not persist PB and last-run recording');
 check(seeded.reads.garage.bike==='pro'&&seeded.reads.garage.outfit==='street-charcoal'&&seeded.reads.settings.volume==='40%','Seeded choices not reflected by game UI');
 report.seed={selectedEntriesSha256:sha(JSON.stringify(seeded.after.entries)),clear:seeded.clear,pb:{time:pb.time,faults:pb.faults,medal:pb.medal,recordingSha256:sha(pb.recording)},last:{time:last.time,recordingSha256:sha(last.recording)},entryCount:Object.keys(seeded.after.entries).length,reads:seeded.reads};persist();
 sim('terminate',device,appId);sim('install',device,upgraded);installedUpgrade=true;
 const afterContainer=sim('get_app_container',device,appId,'data');report.afterContainer=afterContainer;report.dataContainerRelocated=afterContainer!==beforeContainer;persist();
 const verifyBody=`
  await sleep(1200);const boot=await snapshot(),reads=await gameReads();
  h.app.play('b1-first-ride');await sleep(1200);h.skipCountdown();h.step(1);
  const ghost={present:h.ghost()!==null,bike:h.info().bike,track:h.info().trackId};
  const stored=JSON.parse(localStorage.getItem('trials.lastrun.b1-first-ride'));
  assert(h.replay.open(stored.recording),'Stored replay refused');
  const length=h.replay.info().length;h.replay.seek(length);const first={time:h.finishTime(),hash:h.hashState(),phase:h.phase()};
  h.replay.seek(0);h.replay.seek(length);const second={time:h.finishTime(),hash:h.hashState(),phase:h.phase()};
  h.replay.close();h.app.play('b1-first-ride');await sleep(1000);h.skipCountdown();
  const start=performance.now();h.restart();h.skipCountdown();h.step(1);const restart={elapsedMs:performance.now()-start,phase:h.phase(),tick:h.frame()};
  h.app.quit();await sleep(800);return {boot,reads,ghost,first,second,restart,after:await snapshot()};
 `;
 const verified=await probe('upgraded',verifyBody);durable(verified.boot);equalEntries(seeded.after.entries,verified.boot.entries);
 check(verified.boot.app.version==='1.0.1'&&verified.boot.app.build==='2','Installed running native version differs');
 check(verified.boot.updater.id==='builtin'&&verified.boot.externalResources.length===0,'Upgrade did not cold boot entirely from bundled content');
 check(verified.ghost.present&&verified.ghost.bike==='pro','Game did not load persisted PB ghost and selected bike');
 check(verified.first.time===last.time&&verified.first.time===verified.second.time&&verified.first.hash===verified.second.hash,'Persisted recording replay changed');
 check(verified.restart.phase==='riding','Restart did not return to riding');
 equalEntries(seeded.reads,verified.reads);report.upgrade={selectedEntriesSha256:sha(JSON.stringify(verified.boot.entries)),native:verified.boot.app,dataContainerRelocated:afterContainer!==beforeContainer,entriesByteEqual:true,ghost:verified.ghost,replay:{first:verified.first,second:verified.second,equal:true},restart:verified.restart,externalResources:verified.boot.externalResources};persist();
 sim('terminate',device,appId);sim('install',device,baseline);installedUpgrade=false;
 const restored=await probe('restored',`await sleep(1200);return {boot:await snapshot(),reads:await gameReads()};`);
 durable(restored.boot);equalEntries(verified.after.entries,restored.boot.entries);equalEntries(seeded.reads,restored.reads);
 check(restored.boot.app.version==='1.0.0'&&restored.boot.app.build==='1','Normal binary restoration failed');
 report.restored={selectedEntriesSha256:sha(JSON.stringify(restored.boot.entries)),native:restored.boot.app,entriesByteEqual:true,dataContainer:sim('get_app_container',device,appId,'data')};
 report.pass=true;report.finishedAt=new Date().toISOString();persist();console.log(`PASS ${evidence}`);
}catch(error){report.error=error.message;report.finishedAt=new Date().toISOString();persist();console.error(error.message);process.exitCode=1;}
finally{
 if(booted){
  if(installedUpgrade){try{sim('terminate',device,appId);}catch{/* Already stopped. */}try{sim('install',device,baseline);report.restoredAfterFailure=true;}catch(error){report.restoreError=error.message;}}
  try{sim('shutdown',device);report.simulatorShutdown=true;}catch(error){report.shutdownError=error.message;}
  persist();
 }
}
