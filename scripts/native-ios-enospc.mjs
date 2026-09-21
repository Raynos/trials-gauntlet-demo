#!/usr/bin/env node
/** Real ENOSPC in one fixed-size HFS+ test volume; never fills host/system storage.
 * Only the pending-save path is redirected. Committed slots stay in place.
 * Mount/device/capacity guards precede filling; owned links and mount are removed finally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='4AF4B80E-8F16-4883-B556-054C7AE08C10',appId='com.trialsgauntlet.game';
const output=path.resolve(`.native-build/ios-enospc/${new Date().toISOString().replaceAll(':','-')}`);
const evidence='docs/evidence/native-mobile/ios-enospc-round7.json',slotNames=['trials-save-a.json','trials-save-b.json'];
const previousEvidence=fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):null;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const saveJSON=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={schema:1,startedAt:new Date().toISOString(),pass:false,device:{udid:device,name:'iPhone 17e',model:'iPhone 17e',runtime:'iOS Simulator 26.5'},steps:[],
 scope:'Real ENOSPC on an isolated, fixed-size HFS+ test volume inside task17e app sandbox. Only the pending-save path is redirected; committed slots are never moved. Native plugin is unmodified.',
 limits:['Not global device-storage-pressure, APFS/full-device, physical-device or store-distributed qualification.', 'Plugin OS-PLUG-FILE-0013 is a generic operation failure. Independent real kernel syscall on the verified full volume records ENOSPC/errno=-28 separately.', 'Settings/Retry handlers use the Debug probe, not native OS touch input.', 'The task app remains on its bundled normal channel; this is not network-disabled iOS.']};
fs.mkdirSync(output,{recursive:true});
if(previousEvidence){saveJSON(path.join(output,'previous-attempt.json'),previousEvidence);report.previousAttempt={path:path.join(output,'previous-attempt.json'),pass:previousEvidence.pass,error:previousEvidence.error,cleanup:previousEvidence.cleanup,finding:previousEvidence.feasibilityFinding??null};}
const persist=()=>{saveJSON(evidence,report);saveJSON(path.join(output,'report.json'),report);};
let library,documents,booted=false,activeChild,mountpoint,mountDevice;
const ownedLinks=new Map();
function ownedLink(file,target){check(!fs.existsSync(file)&&!fs.existsSync(path.dirname(file)+'/'+path.basename(file)),'Link path must be absent');try{fs.lstatSync(file);throw new Error('Link path already exists');}catch(error){if(error.code!=='ENOENT')throw error;}check(path.dirname(file)===library&&target.startsWith(mountpoint+path.sep),'Refusing link outside task paths');fs.symlinkSync(target,file);ownedLinks.set(file,target);}
function unlinkOwned(file){if(!ownedLinks.has(file))return;check(fs.lstatSync(file).isSymbolicLink()&&fs.readlinkSync(file)===ownedLinks.get(file),'Owned symlink changed unexpectedly');fs.unlinkSync(file);ownedLinks.delete(file);}
function volumeGuard(){const stat=fs.statSync(mountpoint),libStat=fs.statSync(library),v=fs.statfsSync(mountpoint);const capacity=v.blocks*v.bsize;check(stat.dev!==libStat.dev,'Mountpoint still resolves to host filesystem');check(capacity>0&&capacity<=16*1024*1024,'Test volume capacity outside fixed bound');check(stat.dev===mountDevice,'Mount device identity changed');return {device:stat.dev,hostDevice:libStat.dev,capacity,available:v.bavail*v.bsize,blockSize:v.bsize};}
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
 const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);check(target?.state==='Shutdown','Task17e simulator must be shutdown');
 const app=path.join(output,'App.app');fs.cpSync(process.env.TRIALS_ENOSPC_APP??'.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',app,{recursive:true});
 const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 report.artifact={version:info.CFBundleShortVersionString,build:info.CFBundleVersion,id:info.CFBundleIdentifier,indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),contract:read(path.join(app,'public/native-build.json')),debugLibrarySha256:sha(fs.readFileSync(path.join(app,'App.debug.dylib'))),path:app};check(report.artifact.id===appId,'Wrong app identity');persist();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,app);
 const container=fs.realpathSync(sim('get_app_container',device,appId,'data'));check(container.includes(`/Devices/${device}/data/Containers/Data/Application/`),'Unexpected task container');
 library=path.join(container,'Library');documents=path.join(container,'Documents');report.container=container;
 const nonce=randomUUID();mountpoint=path.join(library,'enospc-volume-'+nonce);fs.mkdirSync(mountpoint);
 const image=path.join(output,'bounded-8MiB.dmg');report.volume={image,mountpoint,requestedBytes:8*1024*1024,hardWriteCap:16*1024*1024};persist();
 execFileSync('hdiutil',['create','-size','8m','-fs','HFS+','-volname','TrialsENOSPC','-type','UDIF','-nospotlight',image],{encoding:'utf8',timeout:60000});
 const attach=execFileSync('hdiutil',['attach',image,'-mountpoint',mountpoint,'-nobrowse','-noautoopen','-plist'],{encoding:'utf8',timeout:60000});fs.writeFileSync(path.join(output,'attach.plist'),attach);
 mountDevice=fs.statSync(mountpoint).dev;report.volume.before=volumeGuard();persist();
 const sideName='enospc-side-'+nonce+'.txt',sidePath=path.join(library,sideName),sideTarget=path.join(mountpoint,'native-side.txt');
 fs.writeFileSync(sideTarget,'');ownedLink(sidePath,sideTarget);
 const follow=await launch('verify-native-symlink',`await fsPlugin.writeFile({directory:'LIBRARY',path:${JSON.stringify(sideName)},encoding:'utf8',data:'native symlink proof'});return {origin:location.origin,ready:window.__trials.ready};`);await follow.done;
 check(fs.lstatSync(sidePath).isSymbolicLink()&&fs.readFileSync(sideTarget,'utf8')==='native symlink proof','Native plugin does not follow symlink; stopping bounded test');
 report.volume.nativeSymlinkVerified=true;fs.truncateSync(sideTarget,0);persist();
 const pending=path.join(library,'trials-save-pending.json'),pendingTarget=path.join(mountpoint,'pending.json');
 fs.writeFileSync(pendingTarget,'');
 const statusName='enospc-status-'+nonce+'.json',commandName='enospc-command-'+nonce+'.json',statusFile=path.join(documents,statusName),commandFile=path.join(documents,commandName);
 const runtime=await launch('runtime',`
 const status=async(phase,data={})=>fsPlugin.writeFile({directory:'DOCUMENTS',path:${JSON.stringify(statusName)},encoding:'utf8',data:JSON.stringify({phase,...data})});
 const command=async(wanted)=>{for(let i=0;i<900;i++){try{const value=JSON.parse((await fsPlugin.readFile({directory:'DOCUMENTS',path:${JSON.stringify(commandName)},encoding:'utf8'})).data);if(value.action===wanted)return;}catch{}await sleep(100);}throw new Error('Host command timeout '+wanted);};
 await setVolume(0.2);await wait(async()=>(await snapshot()).durable?.volume==='0.2','Seed save did not commit');await sleep(500);const seeded=await snapshot();await status('seeded',{seeded});
 await command('full');await setVolume(0.6);
 let nativeError;try{await fsPlugin.writeFile({directory:'LIBRARY',path:${JSON.stringify(sideName)},encoding:'utf8',data:'actual native disk-full side probe'});}catch(error){nativeError=errorInfo(error);}
 await wait(()=>!!document.querySelector('.native-save-notice:not([hidden])'),'Disk-full save warning did not appear');const denied=await snapshot();await status('denied',{nativeError:nativeError??null,denied});
 await command('retry');document.querySelector('.native-save-notice button').click();await wait(async()=>{const s=await snapshot();return !s.noticeVisible&&s.durable?.volume==='0.6';},'Retry did not save and clear warning');const retried=await snapshot();return {seeded,denied,retried,nativeError:nativeError??null};
 `);
 await waitStatus(statusFile,'seeded',runtime.child);const oldSlots=snapshots();report.fault={before:oldSlots};persist();
 volumeGuard();ownedLink(pending,pendingTarget);
 const filler=path.join(mountpoint,'bounded-fill.bin'),fd=fs.openSync(filler,'wx'),block=Buffer.alloc(4096,0xa5);let written=0,fillError;
 try{for(;written<16*1024*1024;){volumeGuard();try{written+=fs.writeSync(fd,block);}catch(error){fillError={code:error.code,errno:error.errno,syscall:error.syscall,message:error.message};break;}}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 report.volume.fillerBytes=written;report.volume.fillError=fillError;report.volume.full=volumeGuard();check(fillError?.code==='ENOSPC','Bounded fill did not reach kernel ENOSPC');
 report.fault.kernelError=kernelFailure(()=>fs.writeFileSync(sidePath,'actual kernel disk-full side probe'));check(report.fault.kernelError.code==='ENOSPC','Native side path did not produce kernel ENOSPC');persist();
 saveJSON(commandFile,{action:'full'});const denied=await waitStatus(statusFile,'denied',runtime.child);report.fault.native=denied;report.fault.during=snapshots();
 check(denied.nativeError?.code==='OS-PLUG-FILE-0013','Expected actual native plugin disk-full failure');check(/space|full/i.test(denied.nativeError.message),'Native error did not identify storage exhaustion');
 check(sameBytes(oldSlots,report.fault.during),'Committed slots changed under disk-full fault');check(denied.denied.noticeVisible&&denied.denied.mirrorVolume==='0.6'&&denied.denied.durable.volume==='0.2','Disk-full warning/pending/committed state incorrect');
 unlinkOwned(pending);report.fault.pendingLinkRemovedBeforeRetry=!fs.existsSync(pending);saveJSON(commandFile,{action:'retry'});const result=await runtime.done;
 report.fault.after=snapshots();report.fault.pass=result.retried.durable.volume==='0.6'&&!result.retried.noticeVisible;check(report.fault.pass,'Retry failed');persist();
 const cold=await launch('after-retry-cold',`await sleep(1000);return {origin:location.origin,after:await snapshot()};`);const recovered=await cold.done;
 check(recovered.after.ready&&recovered.after.screen==='menu'&&recovered.after.durable.volume==='0.6'&&recovered.after.mirrorVolume==='0.6'&&!recovered.after.noticeVisible,'Recovered value did not survive forcequit/cold boot');report.coldBootPass=true;report.pass=true;persist();
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;persist();}
finally{
 if(activeChild?.exitCode===null)activeChild.kill('SIGTERM');
 report.cleanup={links:[]};for(const file of ownedLinks.keys()){try{unlinkOwned(file);report.cleanup.links.push({path:file,removed:true});}catch(error){report.cleanup.links.push({path:file,error:error.message});report.pass=false;}}
 if(booted){try{sim('terminate',device,appId);}catch{/* Already stopped. */}}
 if(mountpoint&&mountDevice){try{volumeGuard();execFileSync('hdiutil',['detach',mountpoint],{encoding:'utf8',timeout:60000});report.cleanup.detached=true;}catch(error){report.cleanup.detachError=error.message;report.pass=false;}}
 if(mountpoint&&fs.existsSync(mountpoint)&&(!mountDevice||report.cleanup.detached)){try{fs.rmdirSync(mountpoint);report.cleanup.mountpointRemoved=true;}catch(error){report.cleanup.mountpointError=error.message;report.pass=false;}}
 if(booted){try{sim('shutdown',device);report.cleanup.simulatorShutdown=true;}catch(error){report.cleanup.shutdownError=error.message;report.pass=false;}}
 report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({pass:report.pass,error:report.error,kernel:report.fault?.kernelError,native:report.fault?.native?.nativeError,cleanup:report.cleanup,evidence},null,2));if(!report.pass)process.exitCode=1;
}
