#!/usr/bin/env node
/** Actual EACCES tests on task emulator private saves. Restores original modes in finally.
 * No root, SELinux changes, mocked plugins, filled partitions, or fabricated save data.
 * Preferences change through Settings. Native plugin diagnostic calls use a separate
 * disposable file for writes and actual committed slots for denied reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {android,connectWebview,delay} from './native-android-probe.mjs';
const options={serial:'emulator-5554',apk:'android/app/build/outputs/apk/debug/app-debug.apk',output:'.native-build/permissions-round7/report.json'};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].replace(/^--/,'');if(!(key in options)||!process.argv[i+1])throw Error('Unknown/missing option');options[key]=process.argv[i+1]}
const adb=android(options.serial),id='com.trialsgauntlet.game',slots=['files/trials-save-a.json','files/trials-save-b.json'],probe='files/native-permissions-probe';
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={schema:1,at:new Date().toISOString(),pass:false,apkSha256:hash(fs.readFileSync(options.apk)),cases:[],originalModes:{},limitations:['Headless task-owned API36 Debug emulator; no physical-device permission behavior claim.','App UID permissions are altered only on its private files directory and two save slots, then restored. EACCES is not low-storage/ENOSPC qualification.','Settings and Retry use real DOM handlers. Direct native plugin calls record actual diagnostic errors without replacing plugin behavior.']};
let client;
const write=()=>{fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,JSON.stringify(report,null,2)+'\n')};
const check=(name,pass,evidence)=>{report.cases.push({name,pass:!!pass,evidence});write();if(!pass)throw Error(name)};
const snapshot=()=>slots.map(file=>{const text=adb('shell','run-as',id,'cat',file);return {file,text,sha256:hash(text),...JSON.parse(text)}}).sort((a,b)=>b.generation-a.generation);
const slotMetadata=()=>slots.map(file=>({file,stat:adb('shell','run-as',id,'stat','-c','%a:%s:%Y:%i',file)}));
const mode=file=>adb('shell','run-as',id,'stat','-c','%a',file);
const chmod=(file,value)=>adb('shell','run-as',id,'chmod',value,file);
const launch=async(ready=true)=>{client?.close();client=null;adb('shell','am','force-stop',id);adb('shell','am','start','-W','-n',`${id}/.MainActivity`);client=await connectWebview(options.serial);await client.waitFor('!!window.Capacitor?.Plugins?.Filesystem');if(ready)await client.waitFor('window.__trials?.ready&&!document.getElementById("loader")')};
const view=()=>client.evaluate(`({ready:!!window.__trials?.ready,screen:window.__trials?.app?.screen(),volume:localStorage.getItem('trials.volume'),online:navigator.onLine,warningVisible:!!document.querySelector('.native-save-notice')&&!document.querySelector('.native-save-notice').hidden,warning:document.querySelector('.native-save-notice span')?.textContent,loader:document.getElementById('loader')?.innerText??null,loaderError:document.querySelector('#loader .err span')?.textContent??null})`);
try{
 if(adb('shell','getprop','ro.kernel.qemu')!=='1')throw Error('Task emulator required');
 report.identity={shell:adb('shell','id'),app:adb('shell','run-as',id,'id'),selinux:adb('shell','getenforce'),appCapabilities:adb('shell','run-as',id,'cat','/proc/self/status').split('\n').filter(l=>/^(Uid|Gid|CapEff|CapPrm):/.test(l))};
 check('Permission tests operate as non-root app UID',Number(report.identity.app.match(/uid=(\d+)/)?.[1])>0&&report.identity.appCapabilities.includes('CapEff:\t0000000000000000'),report.identity);
 adb('install','-r','-d',path.resolve(options.apk));adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');
 await launch();await client.evaluate('window.__trials.app.goto("settings")');await client.waitFor('!!document.querySelector(".settings-screen.live")');
 await client.evaluate(`(()=>{for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<5;i++)document.querySelector('.settings-screen [aria-label="louder"]').click()})()`);await delay(1500);
 report.before=snapshot();check('Baseline Settings volume is durable',report.before[0].entries['trials.volume']==='0.5',{generation:report.before[0].generation,volume:report.before[0].entries['trials.volume']});
 for(const file of ['files',...slots])report.originalModes[file]=mode(file);write();
 if(adb('shell','run-as',id,'ls','files').split(/\s+/).some(name=>['trials-save-pending.json','native-permissions-probe'].includes(name)))throw Error('Temporary or diagnostic path exists; preserve it');
 chmod('files','500');report.writeDeniedDirectoryMode=mode('files');
 report.writeDiagnostic=await client.evaluate(`(async()=>{try{await Capacitor.Plugins.Filesystem.writeFile({path:'native-permissions-probe',directory:'LIBRARY',encoding:'utf8',data:'diagnostic'});return {unexpectedSuccess:true}}catch(e){return {message:e.message,code:e.code}}})()`);
 check('Native Filesystem write reports actual EACCES',!report.writeDiagnostic.unexpectedSuccess&&/EACCES|Permission denied/i.test(report.writeDiagnostic.message),report.writeDiagnostic);
 await client.evaluate('document.querySelector(\'.settings-screen [aria-label="louder"]\').click()');await client.waitFor('!document.querySelector(".native-save-notice").hidden');
 report.writeFailure=await view();report.duringWriteFailure=snapshot();
 check('Runtime write denial shows warning and preserves both committed saves',report.writeFailure.volume==='0.6'&&report.writeFailure.warningVisible&&report.before.every(a=>report.duringWriteFailure.find(b=>b.file===a.file).sha256===a.sha256),report.writeFailure);
 chmod('files',report.originalModes.files);
 await client.evaluate('document.querySelector(".native-save-notice button").click()');await client.waitFor('document.querySelector(".native-save-notice").hidden');
 report.afterRetry=snapshot();
 check('Restoring permission and Retry commits only the intended setting',report.afterRetry[0].generation>report.before[0].generation&&report.afterRetry[0].entries['trials.volume']==='0.6'&&Object.entries(report.before[0].entries).every(([k,v])=>k==='trials.volume'||report.afterRetry[0].entries[k]===v),{beforeGeneration:report.before[0].generation,afterGeneration:report.afterRetry[0].generation});
 await launch();report.afterWriteColdLaunch=await view();
 check('Retried write persists on offline cold launch',report.afterWriteColdLaunch.ready&&!report.afterWriteColdLaunch.online&&!report.afterWriteColdLaunch.warningVisible&&report.afterWriteColdLaunch.volume==='0.6',report.afterWriteColdLaunch);
 client.close();client=null;adb('shell','am','force-stop',id);report.beforeReadDenial=snapshot();
 for(const file of slots)chmod(file,'000');report.deniedReadMetadata=slotMetadata();
 await launch(false);await client.waitFor('!!document.querySelector("#loader .err span")?.textContent');
 report.readFailure=await view();
 report.readDiagnostics=await client.evaluate(`(async()=>{const results=[];for(const path of ['trials-save-a.json','trials-save-b.json']){try{await Capacitor.Plugins.Filesystem.readFile({path,directory:'LIBRARY',encoding:'utf8'});results.push({path,unexpectedSuccess:true})}catch(e){results.push({path,code:e.code,message:e.message})}}return results})()`);
 await delay(1000);report.afterDeniedReadMetadata=slotMetadata();
 check('Denied native reads stop startup without treating saves as missing',report.readDiagnostics.every(e=>!e.unexpectedSuccess&&e.code!=='OS-PLUG-FILE-0008'&&/EACCES|Permission denied/i.test(e.message))&&!report.readFailure.ready&&!!report.readFailure.loaderError&&JSON.stringify(report.deniedReadMetadata)===JSON.stringify(report.afterDeniedReadMetadata),{diagnostics:report.readDiagnostics,view:report.readFailure});
 for(const file of slots)chmod(file,report.originalModes[file]);
 report.afterReadPermissionsRestored=snapshot();
 check('Read-denied boot leaves original save bytes untouched',report.beforeReadDenial.every(a=>report.afterReadPermissionsRestored.find(b=>b.file===a.file).sha256===a.sha256),{before:report.beforeReadDenial.map(({file,sha256})=>({file,sha256})),after:report.afterReadPermissionsRestored.map(({file,sha256})=>({file,sha256}))});
 await launch();report.afterReadColdLaunch=await view();
 check('Restored read permissions recover existing saves offline',report.afterReadColdLaunch.ready&&!report.afterReadColdLaunch.online&&!report.afterReadColdLaunch.warningVisible&&report.afterReadColdLaunch.volume==='0.6',report.afterReadColdLaunch);
 report.pass=true;
}catch(error){report.error=String(error.stack??error)}finally{
 report.restoredModes={};
 for(const [file,value] of Object.entries(report.originalModes)){try{chmod(file,value);report.restoredModes[file]=mode(file)}catch(error){report.cleanupError=String(error);report.pass=false}}
 try{if(adb('shell','run-as',id,'ls','files').split(/\s+/).includes('native-permissions-probe'))adb('shell','run-as',id,'rm',probe)}catch(error){report.cleanupError=String(error);report.pass=false}
 client?.close();report.finishedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({name,pass})=>({name,pass})),error:report.error,output:options.output},null,2));if(!report.pass)process.exitCode=1;
