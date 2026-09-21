#!/usr/bin/env node
/** Actual save-path ENOSPC in a <=256KiB task-app-namespace tmpfs. Task emulator only.
 * No global partition fill, security-policy change, or committed-save relocation.
 * The only save-path mutation is a temporary symlink removed BEFORE Retry.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {android,connectWebview,delay} from './native-android-probe.mjs';
const options={serial:'emulator-5554',apk:'android/app/build/outputs/apk/debug/app-debug.apk',output:'.native-build/enospc-round8/report.json'};
for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i].replace(/^--/,'');if(!(k in options)||!process.argv[i+1])throw Error('Unknown/missing option');options[k]=process.argv[i+1]}
const adb=android(options.serial),id='com.trialsgauntlet.game',token=randomUUID().slice(0,8),dir=`native-enospc-${token}`,link=`native-enospc-probe-${token}`,temp='trials-save-pending.json',target=`${dir}/pending.json`,cap=262144;
const sdk=process.env.ANDROID_HOME??path.join(os.homedir(),'Library/Android/sdk'),adbPath=path.join(sdk,'platform-tools/adb'),q=s=>"'"+String(s).replaceAll("'","'\\''")+"'";
const remote=args=>execFileSync(adbPath,['-s',options.serial,'shell',args.map(q).join(' ')],{encoding:'utf8',timeout:30000}).trim();
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={schema:1,at:new Date().toISOString(),pass:false,apkSha256:hash(fs.readFileSync(options.apk)),capBytes:cap,cases:[],fixtureDirectory:dir,limitations:['Task-owned API36 headless Debug emulator. Mounted tmpfs is limited to256KiB in the app mount namespace; no host or global partition exhaustion.','Root is used only to provision/inspect/remove the isolated filesystem. Real app UID performs plugin writes and normal Settings save/retry.','This verifies ENOSPC at the real native pending-save path, not behavior under a completely full Android user-data partition.']};
let client,appPid,keeperPid,keeper,mountPath,rootPath,mounted=false,directoryCreated=false,probeLinked=false,pendingLinked=false;
const ns=(...args)=>remote(['su','0','nsenter','-t',keeperPid??appPid,'-m','--',...args]);
const app=(...args)=>adb('shell','run-as',id,...args);
const write=()=>{fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,JSON.stringify(report,null,2)+'\n')};
const check=(name,pass,evidence)=>{report.cases.push({name,pass:!!pass,evidence});write();if(!pass)throw Error(name)};
const snapshots=()=>['a','b'].map(slot=>{const text=app('cat',`files/trials-save-${slot}.json`);return {slot,sha256:hash(text),text,...JSON.parse(text)}}).sort((a,b)=>b.generation-a.generation);
const sameSlots=(a,b)=>a.every(x=>b.find(y=>y.slot===x.slot)?.sha256===x.sha256);
const fsinfo=p=>{const [type,size,blocks,available]=ns('stat','-f','-c','%T:%S:%b:%a',p).split(':');return {type,blockSize:+size,blocks:+blocks,availableBlocks:+available,capacityBytes:+size*+blocks,availableBytes:+size*+available,device:ns('stat','-c','%d',p)}};
const launch=async()=>{client?.close();client=null;adb('shell','am','force-stop',id);adb('shell','am','start','-W','-n',`${id}/.MainActivity`);appPid=adb('shell','pidof',id);client=await connectWebview(options.serial);await client.waitFor('window.__trials?.ready&&!document.getElementById("loader")')};
const pluginWrite=(file,data)=>client.evaluate(`(async()=>{try{return {result:await Capacitor.Plugins.Filesystem.writeFile({path:${JSON.stringify(file)},directory:'LIBRARY',encoding:'utf8',data:${JSON.stringify(data)}})}}catch(e){return {error:{code:e.code,message:e.message}}}})()`);
const removeOwnedLink=(file,expected)=>{const actual=app('readlink',`files/${file}`);if(actual!==expected)throw Error(`Refuse removing changed fixture link ${file}`);app('rm',`files/${file}`)};
const releaseMount=()=>{if(mounted){ns('umount',mountPath);mounted=false}if(directoryCreated){app('rmdir',`files/${dir}`);directoryCreated=false}};
try{
 if(adb('shell','getprop','ro.kernel.qemu')!=='1')throw Error('Only task emulator supported');
 adb('install','-r','-d',path.resolve(options.apk));adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');await launch();
 const identity=app('id'),uid=Number(identity.match(/uid=(\d+)/)?.[1]),gid=Number(identity.match(/gid=(\d+)/)?.[1]);if(!uid||!gid)throw Error('Non-root app identity required');
 rootPath=remote(['su','0','nsenter','-t',appPid,'-m','--','readlink','-f',`/data/user/0/${id}/files`]);if(rootPath!==`/data/data/${id}/files`)throw Error('Unexpected canonical app files path');mountPath=`${rootPath}/${dir}`;
 report.environment={identity,appUid:uid,appGid:gid,appPid,rootPath,originalDirectoryMode:app('stat','-c','%a','files'),originalSlotModes:['a','b'].map(s=>app('stat','-c','%a',`files/trials-save-${s}.json`)),selinux:adb('shell','getenforce'),appNamespace:remote(['su','0','readlink',`/proc/${appPid}/ns/mnt`]),initNamespace:remote(['su','0','readlink','/proc/1/ns/mnt'])};
 if(report.environment.appNamespace===report.environment.initNamespace)throw Error('App namespace must be isolated');
 const mountInfo=remote(['su','0','cat',`/proc/${appPid}/mountinfo`]);report.coveringMounts=mountInfo.split('\n').filter(line=>{const p=line.split(' ')[4];return p==='/'||rootPath===p||rootPath.startsWith(p+'/')});
 if(report.coveringMounts.some(line=>/ shared:\d/.test(line)))throw Error('Shared ancestor mount could propagate fixture outside app namespace');
 await client.evaluate('window.__trials.app.goto("settings")');await client.waitFor('!!document.querySelector(".settings-screen.live")');
 await client.evaluate(`(()=>{for(let i=0;i<10;i++)document.querySelector('.settings-screen [aria-label="quieter"]').click();for(let i=0;i<3;i++)document.querySelector('.settings-screen [aria-label="louder"]').click()})()`);await delay(1500);report.before=snapshots();
 check('Baseline preference reaches committed native snapshot',report.before[0].entries['trials.volume']==='0.3',{generation:report.before[0].generation,volume:'0.3'});
 const existing=app('ls','files').split(/\s+/);if([dir,link,temp].some(p=>existing.includes(p)))throw Error('Fixture or pending path already exists; preserve it');
 keeper=spawn(adbPath,['-s',options.serial,'shell',['su','0','nsenter','-t',appPid,'-m','--','sh','-c','echo $$; exec sleep 600'].map(q).join(' ')],{stdio:['ignore','pipe','pipe']});
 keeperPid=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Namespace keeper did not start')),5000);keeper.stdout.once('data',data=>{clearTimeout(timer);const pid=data.toString().trim();if(/^\d+$/.test(pid))resolve(pid);else reject(Error('Invalid namespace keeper PID'))});keeper.once('error',reject)});
 report.namespaceKeeperPid=keeperPid;
 app('mkdir',`files/${dir}`);directoryCreated=true;
 ns('mount','-t','tmpfs','-o',`size=${cap},mode=0700,uid=${uid},gid=${gid},nosuid,nodev,noexec`,'native-save-enospc',mountPath);mounted=true;
 const label=app('ls','-Zd','files').split(/\s+/)[0];ns('chcon',label,mountPath);report.mountedContext=ns('ls','-Zd',mountPath);
 report.parentFs=fsinfo(rootPath);report.emptyFs=fsinfo(mountPath);
 check('Mounted capacity is distinct tmpfs capped at256KiB',report.emptyFs.type==='tmpfs'&&report.emptyFs.capacityBytes===cap&&report.emptyFs.availableBytes>0&&report.emptyFs.device!==report.parentFs.device,{parent:report.parentFs,fixture:report.emptyFs});
 report.directTargetWrite=await pluginWrite(target,'existing bounded target');
 check('Real app plugin can create target on bounded filesystem',!report.directTargetWrite.error,report.directTargetWrite);
 app('ln','-s',target,`files/${link}`);probeLinked=true;
 report.preFillWrite=await pluginWrite(link,'native app uid can write this isolated target');
 report.preFillRead=await client.evaluate(`Capacitor.Plugins.Filesystem.readFile({path:${JSON.stringify(link)},directory:'LIBRARY',encoding:'utf8'})`);
 check('Real app plugin writes through in-files symlink before filling',!report.preFillWrite.error&&report.preFillRead.data==='native app uid can write this isolated target',{write:report.preFillWrite,read:report.preFillRead});
 const truncate=await pluginWrite(link,'');if(truncate.error)throw Error(JSON.stringify(truncate));removeOwnedLink(link,target);probeLinked=false;
 if(ns('stat','-c','%s',`${mountPath}/pending.json`)!=='0')throw Error('Pending target must be empty before bounded fill');
 const guard=fsinfo(mountPath);if(guard.type!=='tmpfs'||guard.capacityBytes!==cap||guard.device===report.parentFs.device)throw Error('Filesystem guard changed before fill');
 try{report.fillOutput=ns('dd','if=/dev/zero',`of=${mountPath}/fill`,'bs=4096','count=65')}catch(e){report.fillOutput=String(e.stderr??e.message)}
 report.fullFs=fsinfo(mountPath);
 check('Only bounded tmpfs is full and reports ENOSPC',report.fullFs.type==='tmpfs'&&report.fullFs.capacityBytes===cap&&report.fullFs.availableBytes===0&&/No space left|ENOSPC/i.test(report.fillOutput),{filesystem:report.fullFs,fillOutput:report.fillOutput});
 app('ln','-s',target,`files/${temp}`);pendingLinked=true;
 report.savePathResolved=ns('readlink','-f',`${rootPath}/${temp}`);
 if(report.savePathResolved!==`${mountPath}/pending.json`)throw Error('Pending save escaped bounded private directory');
 report.savePathDiagnostic=await pluginWrite(temp,'diagnostic');
 check('Real native pending-save path reports ENOSPC',/ENOSPC|No space left/i.test(report.savePathDiagnostic.error?.message??''),report.savePathDiagnostic);
 await client.evaluate('document.querySelector(\'.settings-screen [aria-label="louder"]\').click()');await client.waitFor('!document.querySelector(".native-save-notice").hidden');
 report.failure=await client.evaluate(`({volume:localStorage.getItem('trials.volume'),warningVisible:!document.querySelector('.native-save-notice').hidden,text:document.querySelector('.native-save-notice span').textContent,retry:document.querySelector('.native-save-notice button').textContent,ready:window.__trials.ready})`);
 report.duringFailure=snapshots();
 check('Normal Settings save warns while committed snapshots stay unchanged',report.failure.volume==='0.4'&&report.failure.warningVisible&&sameSlots(report.before,report.duringFailure),report.failure);
 removeOwnedLink(temp,target);pendingLinked=false;report.pendingLinkRemovedBeforeRetry=true;
 await client.evaluate('document.querySelector(".native-save-notice button").click()');await client.waitFor('document.querySelector(".native-save-notice").hidden');
 report.afterRetry=snapshots();
 check('Retry commits to original filesystem preserving other entries',report.afterRetry[0].generation>report.before[0].generation&&report.afterRetry[0].entries['trials.volume']==='0.4'&&Object.entries(report.before[0].entries).every(([k,v])=>k==='trials.volume'||report.afterRetry[0].entries[k]===v),{beforeGeneration:report.before[0].generation,afterGeneration:report.afterRetry[0].generation});
 releaseMount();remote(['su','0','kill',keeperPid]);keeperPid=null;
 await launch();report.coldLaunch=await client.evaluate(`(async()=>({volume:localStorage.getItem('trials.volume'),ready:window.__trials.ready,warningVisible:!document.querySelector('.native-save-notice').hidden,online:navigator.onLine,current:(await Capacitor.Plugins.CapacitorUpdater.current()).bundle}))()`);
 check('Retried preference survives offline cold launch after unmount',report.coldLaunch.volume==='0.4'&&report.coldLaunch.ready&&!report.coldLaunch.warningVisible&&!report.coldLaunch.online&&report.coldLaunch.current.id==='builtin',report.coldLaunch);
 report.pass=true;
}catch(error){report.error=String(error.stack??error)}finally{
 report.cleanupErrors=[];
 try{if(pendingLinked){removeOwnedLink(temp,target);pendingLinked=false}if(probeLinked){removeOwnedLink(link,target);probeLinked=false}}catch(e){report.cleanupErrors.push(String(e))}
 try{releaseMount()}catch(e){report.cleanupErrors.push(String(e))}
 try{if(keeperPid)remote(['su','0','kill',keeperPid])}catch(e){report.cleanupErrors.push(String(e))}
 client?.close();
 report.cleanup={mounted,pendingLinked,probeLinked,directoryCreated,directoryMode:app('stat','-c','%a','files'),slotModes:['a','b'].map(s=>app('stat','-c','%a',`files/trials-save-${s}.json`)),selinux:adb('shell','getenforce')};
 if(report.cleanupErrors.length||mounted||pendingLinked||directoryCreated)report.pass=false;
 report.finishedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({name,pass})=>({name,pass})),error:report.error,cleanupErrors:report.cleanupErrors,output:options.output},null,2));if(!report.pass)process.exitCode=1;
