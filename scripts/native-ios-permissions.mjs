#!/usr/bin/env node
/** Actual EACCES on the task-owned installed iOS app, never mocks or host-wide permissions.
 * Only app Library (temporary 0500) and its two save files (temporary 0000) are chmod'd.
 * Control/report traffic uses app Documents. Original modes are restored in finally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788',appId='com.trialsgauntlet.game';
const output=path.resolve(`.native-build/ios-permissions/${new Date().toISOString().replaceAll(':','-')}`);
const evidence='docs/evidence/native-mobile/ios-permissions-round7.json',slotNames=['trials-save-a.json','trials-save-b.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const saveJSON=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={schema:1,startedAt:new Date().toISOString(),pass:false,device:{udid:device,name:'trials-iphone',model:'iPhone 16 Pro',runtime:'iOS Simulator 26.5'},steps:[],
 scope:'Real Unix permission denial inside only the task-owned app container. Native Filesystem plugin remains unmodified; no uninstall or save reset.',
 limits:['iOS Simulator, same-user processes; not physical-device protection classes, entitlement denial or store-distributed binary.', 'Plugin error code OS-PLUG-FILE-0013 is a generic operation failure, not POSIX errno13. Independent host fs syscalls on the identical permission boundary record authoritative kernel EACCES/errno=-13 separately.', 'Settings/Retry handlers are invoked through Debug probe; this is not native OS touch evidence.', 'No disk-full, future-schema or arbitrary corruption case is inferred from permission tests.']};
fs.mkdirSync(output,{recursive:true});
const persist=()=>{saveJSON(evidence,report);saveJSON(path.join(output,'report.json'),report);};
const modes=new Map();let library,documents,booted=false,activeChild;
function protect(file,mode){check(file===library||slotNames.some(name=>file===path.join(library,name)),'Refusing chmod outside exact task save paths');check(!fs.lstatSync(file).isSymbolicLink(),'Refusing chmod of symlink');if(!modes.has(file))modes.set(file,fs.statSync(file).mode&0o7777);fs.chmodSync(file,mode);}
function restore(file){if(modes.has(file)){fs.chmodSync(file,modes.get(file));modes.delete(file);}}
function snapshots(){return slotNames.map(name=>{const bytes=fs.readFileSync(path.join(library,name));const slot=JSON.parse(bytes);return {name,sha256:sha(bytes),bytes:bytes.length,generation:slot.generation,checksum:slot.checksum,volume:slot.entries['trials.volume'],mode:(fs.statSync(path.join(library,name)).mode&0o7777).toString(8)};});}
function sameBytes(a,b){return a.every((slot,i)=>slot.name===b[i].name&&slot.sha256===b[i].sha256);}
function kernelFailure(action){try{action();return {unexpectedSuccess:true};}catch(error){return {code:error.code,errno:error.errno,syscall:error.syscall,path:error.path,message:error.message,uid:process.getuid()};}}
const lib=`
const fsPlugin=Capacitor.Plugins.Filesystem,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorInfo=error=>({code:error?.code??null,message:error?.message??String(error),name:error?.name??null});
const expect=(ok,message)=>{if(!ok)throw new Error(message);};
const snapshot=async()=>{
 const slots=[];for(const name of ['trials-save-a.json','trials-save-b.json']){
  const s=JSON.parse((await fsPlugin.readFile({directory:'LIBRARY',path:name,encoding:'utf8'})).data);
  const payload=JSON.stringify({version:s.version,generation:s.generation,entries:s.entries});let n=2166136261;
  for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);
  slots.push({name,generation:s.generation,valid:s.version===1&&(n>>>0).toString(16).padStart(8,'0')===s.checksum,volume:s.entries['trials.volume'],checksum:s.checksum});
 }
 return {slots,durable:slots.filter(s=>s.valid).sort((a,b)=>b.generation-a.generation)[0],mirrorVolume:localStorage.getItem('trials.volume'),noticeVisible:!!document.querySelector('.native-save-notice:not([hidden])'),noticeText:document.querySelector('.native-save-notice span')?.textContent,ready:!!window.__trials?.ready,screen:window.__trials?.app?.screen()??null};
};
const setVolume=async(value)=>{
 window.__trials.app.goto('settings');await sleep(400);
 for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();
 for(let i=0;i<value*10;i++)document.querySelector('.settings-screen [aria-label="louder"]').click();
 window.__trials.app.goto('menu');
};
const wait=async(test,message)=>{for(let i=0;i<150;i++){if(await test())return;await sleep(100);}throw new Error(message);};
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
async function waitStatus(file,phase,child){const until=Date.now()+90000;while(Date.now()<until){if(child.exitCode!==null)throw new Error(`Probe exited before phase ${phase}`);try{const status=read(file);if(status.phase===phase)return status;}catch{/* Waiting for atomic status. */}await sleep(200);}throw new Error(`Timed out waiting for Documents phase ${phase}`);}
try{
 const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);check(target?.state==='Shutdown','Task simulator must be shutdown');
 const app=path.join(output,'App.app');fs.cpSync('.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',app,{recursive:true});
 const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 report.artifact={version:info.CFBundleShortVersionString,build:info.CFBundleVersion,id:info.CFBundleIdentifier,indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),contract:read(path.join(app,'public/native-build.json')),debugLibrarySha256:sha(fs.readFileSync(path.join(app,'App.debug.dylib'))),path:app};check(report.artifact.id===appId,'Wrong native identity');persist();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,app);
 const container=fs.realpathSync(sim('get_app_container',device,appId,'data'));check(container.includes(`/Devices/${device}/data/Containers/Data/Application/`),'Unexpected app-container location');
 library=path.join(container,'Library');documents=path.join(container,'Documents');fs.mkdirSync(documents,{recursive:true});
 const statusName=`permissions-status-${randomUUID()}.json`,commandName=`permissions-command-${randomUUID()}.json`;
 const statusFile=path.join(documents,statusName),commandFile=path.join(documents,commandName);
 report.container=container;report.originalLibraryMode=(fs.statSync(library).mode&0o7777).toString(8);report.ownerUid=fs.statSync(library).uid;
 const runtime=await launch('runtime',`
 const status=async(phase,data={})=>fsPlugin.writeFile({directory:'DOCUMENTS',path:${JSON.stringify(statusName)},encoding:'utf8',data:JSON.stringify({phase,...data})});
 const command=async(wanted)=>{for(let i=0;i<900;i++){try{const value=JSON.parse((await fsPlugin.readFile({directory:'DOCUMENTS',path:${JSON.stringify(commandName)},encoding:'utf8'})).data);if(value.action===wanted)return;}catch{}await sleep(100);}throw new Error('Host command timeout '+wanted);};
 await setVolume(0.2);await wait(async()=>(await snapshot()).durable?.volume==='0.2','Seed save did not commit');await sleep(500);
 const seeded=await snapshot();await status('seeded',{seeded});
 await command('deny');await setVolume(0.6);
 let nativeError;try{await fsPlugin.writeFile({directory:'LIBRARY',path:${JSON.stringify('permissions-native-side-'+randomUUID()+'.txt')},encoding:'utf8',data:'permission probe'});}catch(error){nativeError=errorInfo(error);}
 await wait(()=>!!document.querySelector('.native-save-notice:not([hidden])'),'Runtime warning did not appear');
 const denied=await snapshot();await status('denied',{nativeError:nativeError??null,denied});
 await command('retry');document.querySelector('.native-save-notice button').click();
 await wait(async()=>{const s=await snapshot();return !s.noticeVisible&&s.durable?.volume==='0.6';},'Retry did not persist and clear warning');
 const retried=await snapshot();await status('retried',{retried});return {seeded,denied,retried,nativeError:nativeError??null};
 `);
 await waitStatus(statusFile,'seeded',runtime.child);const oldSlots=snapshots();report.writeFault={before:oldSlots};persist();
 protect(library,0o500);report.writeFault.deniedMode=(fs.statSync(library).mode&0o7777).toString(8);
 const side=path.join(library,`permissions-os-side-${randomUUID()}.txt`);
 report.writeFault.kernelError=kernelFailure(()=>fs.writeFileSync(side,'permission probe',{flag:'wx'}));
 check(report.writeFault.kernelError.code==='EACCES','Host syscall did not produce actual EACCES');
 saveJSON(commandFile,{action:'deny'});
 const denied=await waitStatus(statusFile,'denied',runtime.child);report.writeFault.native=denied;report.writeFault.during=snapshots();
 check(denied.nativeError?.code==='OS-PLUG-FILE-0013','Expected actual native plugin operation failure');check(sameBytes(oldSlots,report.writeFault.during),'Committed slots changed during write denial');
 check(denied.denied.noticeVisible&&denied.denied.mirrorVolume==='0.6'&&denied.denied.durable.volume==='0.2','Runtime failure state/notice incorrect');
 restore(library);saveJSON(commandFile,{action:'retry'});const runtimeResult=await runtime.done;
 report.writeFault.after=snapshots();report.writeFault.pass=runtimeResult.retried.durable.volume==='0.6'&&!runtimeResult.retried.noticeVisible;check(report.writeFault.pass,'Runtime save retry failed');persist();
 const cold=await launch('after-retry-cold',`await sleep(1000);return {after:await snapshot()};`);const coldResult=await cold.done;check(coldResult.after.durable.volume==='0.6'&&coldResult.after.mirrorVolume==='0.6'&&!coldResult.after.noticeVisible,'Retry did not survive force-quit/cold boot');
 sim('terminate',device,appId);
 report.readFault={before:snapshots(),originalModes:Object.fromEntries(slotNames.map(name=>[name,(fs.statSync(path.join(library,name)).mode&0o7777).toString(8)]))};
 for(const name of slotNames)protect(path.join(library,name),0);
 report.readFault.deniedModes=Object.fromEntries(slotNames.map(name=>[name,(fs.statSync(path.join(library,name)).mode&0o7777).toString(8)]));
 report.readFault.kernelErrors=slotNames.map(name=>kernelFailure(()=>fs.readFileSync(path.join(library,name))));check(report.readFault.kernelErrors.every(error=>error.code==='EACCES'),'Both reads must yield actual kernel EACCES');persist();
 const failed=await launch('read-denied-boot',`
 const nativeErrors=[];for(const name of ['trials-save-a.json','trials-save-b.json']){try{await fsPlugin.readFile({directory:'LIBRARY',path:name,encoding:'utf8'});nativeErrors.push({name,unexpectedSuccess:true});}catch(error){nativeErrors.push({name,...errorInfo(error)});}}
 return {loaderFailed:!!document.querySelector('#loader.failed'),failureText:document.querySelector('#loader .err')?.textContent,hasGame:!!window.__trials?.app,nativeErrors};
 `,{failedBoot:true});const failedResult=await failed.done;
 check(failedResult.loaderFailed&&!failedResult.hasGame&&failedResult.nativeErrors.every(error=>error.code==='OS-PLUG-FILE-0013'),'Unreadable saves did not fail startup safely with real native read errors');
 for(const name of slotNames)restore(path.join(library,name));report.readFault.afterRestoringModes=snapshots();check(sameBytes(report.readFault.before,report.readFault.afterRestoringModes),'Boot denial changed saved bytes');
 const recovery=await launch('read-recovered-boot',`await sleep(1000);return {loaderFailed:!!document.querySelector('#loader.failed'),after:await snapshot()};`);const recovered=await recovery.done;
 check(!recovered.loaderFailed&&recovered.after.ready&&recovered.after.screen==='menu'&&recovered.after.durable.volume==='0.6','Boot did not recover after restoring original permissions');
 report.readFault.pass=true;report.pass=true;persist();
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;persist();}
finally{
 report.modeRestoration=[];for(const[file,mode]of modes){try{fs.chmodSync(file,mode);report.modeRestoration.push({path:file,mode:mode.toString(8),restored:true});}catch(error){report.modeRestoration.push({path:file,restored:false,error:error.message});report.pass=false;}}
 if(library&&fs.existsSync(library))report.finalLibraryMode=(fs.statSync(library).mode&0o7777).toString(8);
 if(library)report.finalSlotModes=Object.fromEntries(slotNames.filter(name=>fs.existsSync(path.join(library,name))).map(name=>[name,(fs.statSync(path.join(library,name)).mode&0o7777).toString(8)]));
 if(activeChild?.exitCode===null)activeChild.kill('SIGTERM');
 if(booted){try{sim('terminate',device,appId);}catch{/* Already stopped. */}try{sim('shutdown',device);report.simulatorShutdown=true;}catch(error){report.shutdownError=error.message;report.pass=false;}}
 report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({pass:report.pass,error:report.error,write:report.writeFault?.pass,read:report.readFault?.pass,finalLibraryMode:report.finalLibraryMode,finalSlotModes:report.finalSlotModes,shutdown:report.simulatorShutdown,evidence},null,2));if(!report.pass)process.exitCode=1;
}
