#!/usr/bin/env node
/** Installed-app cold boot, exact repeated clear, terminal crash, and logical restart gate.
 * Operates only the shutdown task-owned trials-iphone simulator; never a user browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788',appId='com.trialsgauntlet.game';
const stamp=new Date().toISOString().replaceAll(':','-');
const output=path.resolve(`.native-build/ios-ship/${stamp}`),evidence='docs/evidence/native-mobile/ios-ship-round9.json';
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const sha=value=>createHash('sha256').update(value).digest('hex');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const report={schema:1,startedAt:new Date().toISOString(),pass:false,device:{udid:device,name:'trials-iphone',model:'iPhone 16 Pro',runtime:'iOS Simulator 26.5'},
 limitations:['Recorded inputs and existing game hooks prove deterministic clear, terminal crash and logical restart; not native-touch or stranger gameplay.', 'Cold boot uses bundled local assets with disabled update channels; iOS Simulator host networking remains enabled.', 'Retained clip is unjudged motion evidence. No visual, audio, device thermal or physical-hardware conclusion.', 'This gate does not repeat the separate WebGL context-loss suite.']};
if(fs.existsSync(evidence)){const previous=read(evidence);report.previousAttempt={pass:previous.pass,artifact:previous.artifact,probePath:previous.probe?.path,error:previous.error};}
fs.mkdirSync(output,{recursive:true});
const save=()=>{write(evidence,report);write(path.join(output,'report.json'),report);};
let booted=false,video,videoTimer,videoDone;
try{
 const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);
 check(target?.state==='Shutdown','Task simulator must be shutdown; refusing to interrupt an active session');
 const app=path.join(output,'App.app');fs.cpSync(process.env.TRIALS_SHIP_APP??'.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',app,{recursive:true});
 const plist=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 const files=fs.readdirSync(app,{recursive:true}).map(name=>path.join(app,name)).filter(file=>fs.statSync(file).isFile()).sort();
 report.artifact={path:app,version:plist.CFBundleShortVersionString,build:plist.CFBundleVersion,id:plist.CFBundleIdentifier,indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),bundleTreeSha256:sha(files.map(file=>`${sha(fs.readFileSync(file))}  ${path.relative(app,file)}\n`).join('')),treeHashMethod:'SHA-256 of SHA256(file), two spaces, relative path, newline for all sorted regular bundle files.',contract:read(path.join(app,'public/native-build.json')),checkout:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
 report.artifact.capacitorConfigSha256=sha(fs.readFileSync(path.join(app,'capacitor.config.json')));report.artifact.nativeBuildSha256=sha(fs.readFileSync(path.join(app,'public/native-build.json')));
 check(report.artifact.id===appId&&report.artifact.contract.channels===null,'Expected normal local disabled-channel artifact');save();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,app);
 const clip=path.join(output,'cold-launch.mp4'),videoLog=fs.openSync(path.join(output,'video.log'),'w');
 video=spawn('xcrun',['simctl','io',device,'recordVideo','--codec=h264',clip],{stdio:['ignore',videoLog,videoLog]});
 videoDone=new Promise(resolve=>video.once('close',resolve));
 videoTimer=setTimeout(()=>video.kill('SIGINT'),20000);
 report.video={path:clip,scope:'Installed native cold launch recording, capped at 20 seconds and stopped when the probe finishes; retained without motion judgement.'};
 const golden=fs.readFileSync('harness/inputs/b1-first-ride/bot-3.json','utf8'),token=randomUUID();
 report.recording={path:'harness/inputs/b1-first-ride/bot-3.json',sha256:sha(golden)};
 const script=`
const h=window.__trials, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const r={probeAt:Date.now(),token:${JSON.stringify(token)},errors:[]};
const originalError=console.error;
console.error=(...args)=>{r.errors.push({type:'console',message:args.map(String).join(' ')});originalError(...args);};
addEventListener('error',event=>r.errors.push({type:'error',message:event.message}));
addEventListener('unhandledrejection',event=>r.errors.push({type:'rejection',message:String(event.reason)}));
try{
 r.boot={native:await Capacitor.Plugins.App.getInfo(),origin:location.origin,search:location.search,hasSW:Boolean(navigator.serviceWorker?.controller),screen:h.app.screen(),ready:h.ready,online:navigator.onLine};
 await sleep(2500);
 h.app.quit();await h.loadTrack('b1-first-ride');
 const recording=${JSON.stringify(golden)};
 h.runRecording(recording);const first={time:h.finishTime(),hash:h.hashState(),phase:h.phase(),faults:h.faults()};
 h.runRecording(recording);const second={time:h.finishTime(),hash:h.hashState(),phase:h.phase(),faults:h.faults()};
 await h.loadTrack('flat-test',3277865877);h.skipCountdown();h.setInput({throttle:1,brake:0,lean:-1,hop:false,restart:false});
 let attemptedTicks=0;while(h.phase()!=='crashed'&&attemptedTicks<2000){h.step(1);attemptedTicks++;}
 const crashed={phase:h.phase(),faults:h.faults(),tick:h.frame(),attemptedTicks};
 const began=performance.now();h.restart();h.skipCountdown();h.step(1);const restart={elapsedMs:performance.now()-began,phase:h.phase(),tick:h.frame()};
 r.shipGate={first,second,crashed,restart,pass:first.phase==='finished'&&second.phase==='finished'&&first.faults===0&&second.faults===0&&first.time!==null&&first.time===second.time&&first.hash===second.hash&&crashed.phase==='crashed'&&crashed.faults>0&&restart.phase==='riding'&&restart.tick===1&&restart.elapsedMs<100};
 h.app.quit();r.final={screen:h.app.screen(),paused:h.app.paused(),phase:h.phase(),tick:h.frame()};
 r.externalResources=performance.getEntriesByType('resource').map(e=>e.name).filter(url=>!url.startsWith(location.origin)&&!url.startsWith('data:')&&!url.startsWith('blob:'));
 r.pass=r.boot.ready&&r.boot.screen==='menu'&&r.shipGate.pass&&r.errors.length===0&&r.externalResources.length===0&&r.boot.origin==='capacitor://localhost'&&!r.boot.hasSW&&!r.boot.search;
}catch(error){r.error=String(error);r.pass=false;}
finally{console.error=originalError;}
r.probeAt=Date.now();return r;
`;
 const probeFile=path.join(output,'probe.js'),log=path.join(output,'probe.log');fs.writeFileSync(probeFile,script);
 const code=await new Promise((resolve,reject)=>{
  const stream=fs.createWriteStream(log),child=spawn(process.execPath,['scripts/native-ios-probe.mjs'],{env:{...process.env,TRIALS_SIMULATOR:device,TRIALS_PROBE_NO_INSTALL:'1',TRIALS_PROBE_FILE:probeFile,TRIALS_PROBE_TIMEOUT_MS:'240000'},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});const start=Date.now(),timer=setInterval(()=>console.log('Installed iOS ship gate: '+Math.round((Date.now()-start)/1000)+'s'),20000);
  child.on('error',error=>{clearInterval(timer);stream.end();reject(error);});child.on('close',code=>{clearInterval(timer);stream.end(()=>resolve(code));});
 });
 const result=read('.native-build/evidence/ios-probe.json');check(result.token===token,'No fresh matching ship report');
 write(path.join(output,'probe.json'),result);report.probe={...result,path:path.join(output,'probe.json'),sha256:sha(fs.readFileSync(path.join(output,'probe.json'))),probeScriptSha256:sha(fs.readFileSync(probeFile)),log,exitCode:code};report.pass=result.pass&&code===0;save();
}catch(error){report.error=error.message;process.exitCode=1;save();}
finally{
 clearTimeout(videoTimer);if(video&&video.exitCode===null)video.kill('SIGINT');if(videoDone)await videoDone;
 if(report.video&&fs.existsSync(report.video.path))report.video.sha256=sha(fs.readFileSync(report.video.path));
 if(booted){try{sim('terminate',device,appId);}catch{/* Already stopped. */}try{sim('shutdown',device);report.simulatorShutdown=true;}catch(error){report.shutdownError=error.message;report.pass=false;}}
 report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({pass:report.pass,error:report.error,shipGate:report.probe?.shipGate,evidence,video:report.video?.path},null,2));if(!report.pass)process.exitCode=1;
}
