#!/usr/bin/env node
/** Native filesystem write-failure/retry probe on a disposable task-owned iOS Simulator. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const options = {};
for (let i=2; i<process.argv.length; i+=2) {
  const name=process.argv[i], value=process.argv[i+1];
  if (!['--device','--app','--output'].includes(name) || !value) throw Error(`Unknown/missing option: ${name}`);
  options[name.slice(2)]=value;
}
const device=options.device ?? '4AF4B80E-8F16-4883-B556-054C7AE08C10';
const app=path.resolve(options.app ?? '.native-build/ios/Build/Products/Debug-iphonesimulator/App.app');
const output=options.output ?? '.native-build/ios-storage-round5.json';
const id='com.trialsgauntlet.game', token=randomUUID();
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const wait=async(fn,label)=>{for(let i=0;i<180;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,500));}throw Error(`Timed out: ${label}`);};
const assert=(condition,label)=>{if(!condition)throw Error(label);};
const state=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);
assert(state,'Unknown available simulator');
const started=state.state!=='Booted';
let root, temporary, failureFile, continueFile;
const result={schema:1,at:new Date().toISOString(),device,pass:false,appIndexSha256:createHash('sha256').update(fs.readFileSync(path.join(app,'public/index.html'))).digest('hex'),fault:'A directory occupies Library/trials-save-pending.json, causing an actual native filesystem write failure. This is EISDIR, not disk exhaustion or a permission-denial simulation.',limits:['Simulator Debug build; DOM Settings/retry handlers, not OS touch or physical-device proof.','Verifies runtime failure/retry and selected preference preservation. True low-storage and denied-access OS cases remain open.']};
const snapshots=()=>['a','b'].flatMap(slot=>{const file=path.join(root,'Library',`trials-save-${slot}.json`);return fs.existsSync(file)?[{slot,...JSON.parse(fs.readFileSync(file))}]:[];}).sort((a,b)=>b.generation-a.generation);
const stop=()=>{try{sim('terminate',device,id);}catch{/* App may not be running. */}};
const launch=async(body)=>{
  stop();
  const report=path.join(root,'Documents/native-probe.json');
  fs.rmSync(report,{force:true});
  execFileSync('xcrun',['simctl','launch',device,id],{env:{...process.env,SIMCTL_CHILD_TRIALS_PROBE_JS:`const token=${JSON.stringify(token)};${body}`},stdio:'ignore'});
  return report;
};
try {
  if(started)sim('boot',device);
  sim('bootstatus',device,'-b');
  sim('install',device,app);
  root=sim('get_app_container',device,id,'data');
  const lib=path.join(root,'Library');
  temporary=path.join(lib,'trials-save-pending.json');
  failureFile=path.join(lib,`native-save-failure-${token}.json`);
  continueFile=path.join(lib,`native-save-continue-${token}.json`);
  assert(!fs.existsSync(temporary),'Pending save path already exists; preserve it and use a clean task app');
  const seed=await launch(`const h=window.__trials;h.app.goto('settings');for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();await new Promise(r=>setTimeout(r,1500));return {token,volume:localStorage.getItem('trials.volume')};`);
  const seeded=await wait(()=>fs.existsSync(seed)&&JSON.parse(fs.readFileSync(seed)),'seed report');
  assert(seeded.token===token&&seeded.volume==='0','Seed did not set zero volume');
  result.before=snapshots();
  assert(result.before[0].entries['trials.volume']==='0','Seed did not reach native storage');
  stop();
  fs.mkdirSync(temporary);
  const report=await launch(`
    const h=window.__trials,files=Capacitor.Plugins.Filesystem,pause=ms=>new Promise(r=>setTimeout(r,ms));
    h.app.goto('settings');document.querySelector('.settings-screen [aria-label="louder"]').click();await pause(1500);
    const notice=document.querySelector('.native-save-notice');
    const rect=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
    const beforeRetry={token,volume:localStorage.getItem('trials.volume'),warningVisible:!!notice&&!notice.hidden,text:notice?.querySelector('span')?.textContent,retry:notice?.querySelector('button')?.textContent,viewport:{width:innerWidth,height:innerHeight},noticeRect:rect(notice),buttonRect:rect(notice?.querySelector('button'))};
    await files.writeFile({path:${JSON.stringify(path.basename(failureFile))},directory:'LIBRARY',encoding:'utf8',data:JSON.stringify(beforeRetry)});
    let released=false;for(let i=0;i<300;i++){try{await files.readFile({path:${JSON.stringify(path.basename(continueFile))},directory:'LIBRARY',encoding:'utf8'});released=true;break;}catch{}await pause(200);}
    if(!released)throw Error('Host did not release native write obstruction');
    if(!notice||notice.hidden)throw Error('Missing native save failure warning');
    notice.querySelector('button').click();
    for(let i=0;i<100&&!notice.hidden;i++)await pause(100);
    return {token,beforeRetry,warningCleared:notice.hidden,volume:localStorage.getItem('trials.volume'),ready:h.ready};
  `);
  result.failure=await wait(()=>fs.existsSync(failureFile)&&JSON.parse(fs.readFileSync(failureFile)),'failure signal');
  result.duringFailure=snapshots();
  assert(result.failure.token===token,'Stale failure signal');
  assert(JSON.stringify(result.before)===JSON.stringify(result.duringFailure),'Failed write modified committed snapshots');
  const button=result.failure.buttonRect, bounds=result.failure.noticeRect, viewport=result.failure.viewport;
  assert(button&&button.width>=44&&button.height>=44&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'Save warning or retry button is outside usable viewport');
  result.warningScreenshot=output.replace(/\.json$/, '')+'-failure.png';
  fs.mkdirSync(path.dirname(result.warningScreenshot),{recursive:true});
  sim('io',device,'screenshot',result.warningScreenshot);
  fs.rmdirSync(temporary);
  fs.writeFileSync(continueFile,'{}');
  result.retry=await wait(()=>fs.existsSync(report)&&JSON.parse(fs.readFileSync(report)),'retry report');
  assert(result.retry.token===token&&!result.retry.error&&result.retry.warningCleared&&result.retry.volume==='0.1','Save retry failed or warning cleared incorrectly');
  result.afterRetry=snapshots();
  assert(result.afterRetry[0].entries['trials.volume']==='0.1'&&result.afterRetry[0].generation>result.before[0].generation,'Retry did not commit new volume');
  const cold=await launch(`return {token,volume:localStorage.getItem('trials.volume'),ready:window.__trials.ready,warningVisible:!document.querySelector('.native-save-notice')?.hidden};`);
  result.coldLaunch=await wait(()=>fs.existsSync(cold)&&JSON.parse(fs.readFileSync(cold)),'cold launch');
  assert(result.coldLaunch.token===token&&result.coldLaunch.volume==='0.1'&&result.coldLaunch.ready&&!result.coldLaunch.warningVisible,'Retried save did not survive cold launch');
  result.pass=true;
} catch(error) { result.error=String(error.stack??error); process.exitCode=1; }
finally {
  if(temporary&&fs.existsSync(temporary)&&fs.statSync(temporary).isDirectory())fs.rmdirSync(temporary);
  for(const file of [failureFile,continueFile])if(file)fs.rmSync(file,{force:true});
  if(started){stop();sim('shutdown',device);}
  result.finishedAt=new Date().toISOString();
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({pass:result.pass,error:result.error,output}));
}
