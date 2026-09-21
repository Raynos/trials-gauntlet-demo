#!/usr/bin/env node
/** Real WKWebView WEBGL_lose_context qualification plus installed-app ship gate.
 * Operates only the shutdown task-owned trials-iphone simulator; never a user browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const device='F3058DD5-DCB6-4D86-93CC-6E56A785B788',appId='com.trialsgauntlet.game';
const stamp=new Date().toISOString().replaceAll(':','-');
const output=path.resolve(`.native-build/ios-graphics/${stamp}`),evidence='docs/evidence/native-mobile/ios-graphics-round6.json';
const sim=(...args)=>execFileSync('xcrun',['simctl',...args],{encoding:'utf8',timeout:60000}).trim();
const sha=value=>createHash('sha256').update(value).digest('hex');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const report={schema:1,startedAt:new Date().toISOString(),pass:false,device:{udid:device,name:'trials-iphone',model:'iPhone 16 Pro',runtime:'iOS Simulator 26.5'},
 limitations:['Actual WebGL context loss/restoration through WEBGL_lose_context in installed Debug WKWebView; not physical GPU failure or process termination.', 'Held input uses synthetic keyboard controller events, not native OS touch injection.', 'Cold boot uses bundled local assets with disabled update channels; iOS Simulator host networking remains enabled.', 'Readback and draw diagnostics establish restored graphics operation, not visual quality or audio.', 'Recorded inputs and game hooks establish deterministic clear, terminal crash and logical restart; no stranger/native-touch gameplay claim.']};
if(fs.existsSync(evidence)){const previous=read(evidence);report.previousAttempts=[...(previous.previousAttempts??[]),{pass:previous.pass,artifact:previous.artifact,probePath:previous.probe?.path,video:previous.video,caseResults:previous.probe?.cases.map(c=>({mode:c.mode,graphicsPass:c.graphicsPass,interruptionPass:c.interruptionPass,error:c.error}))}];}
fs.mkdirSync(output,{recursive:true});
const save=()=>{write(evidence,report);write(path.join(output,'report.json'),report);};
let booted=false,video,videoTimer,videoDone;
try{
 const target=Object.values(JSON.parse(sim('list','devices','available','--json')).devices).flat().find(d=>d.udid===device);
 check(target?.state==='Shutdown','Task simulator must be shutdown; refusing to interrupt an active session');
 const app=path.join(output,'App.app');fs.cpSync(process.env.TRIALS_GRAPHICS_APP??'.native-build/ios/Build/Products/Debug-iphonesimulator/App.app',app,{recursive:true});
 const plist=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 const files=fs.readdirSync(app,{recursive:true}).map(name=>path.join(app,name)).filter(file=>fs.statSync(file).isFile()).sort();
 report.artifact={path:app,version:plist.CFBundleShortVersionString,build:plist.CFBundleVersion,id:plist.CFBundleIdentifier,indexSha256:sha(fs.readFileSync(path.join(app,'public/index.html'))),bundleTreeSha256:sha(files.map(file=>`${sha(fs.readFileSync(file))}  ${path.relative(app,file)}\n`).join('')),treeHashMethod:'SHA-256 of SHA256(file), two spaces, relative path, newline for all sorted regular bundle files.',contract:read(path.join(app,'public/native-build.json')),checkout:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
 check(report.artifact.id===appId&&report.artifact.contract.channels===null,'Expected normal local disabled-channel artifact');save();
 sim('boot',device);booted=true;sim('bootstatus',device,'-b');sim('install',device,app);
 const clip=path.join(output,'cold-launch.mp4'),videoLog=fs.openSync(path.join(output,'video.log'),'w');
 video=spawn('xcrun',['simctl','io',device,'recordVideo','--codec=h264',clip],{stdio:['ignore',videoLog,videoLog]});
 videoDone=new Promise(resolve=>video.once('close',resolve));
 videoTimer=setTimeout(()=>video.kill('SIGINT'),20000);
 report.video={path:clip,scope:'20-second installed native cold launch recording; parent plays and judges it.'};
 const golden=fs.readFileSync('harness/inputs/b1-first-ride/bot-3.json','utf8'),token=randomUUID();
 report.recording={path:'harness/inputs/b1-first-ride/bot-3.json',sha256:sha(golden)};
 const script=`
const h=window.__trials, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const r={probeAt:Date.now(),token:${JSON.stringify(token)},cases:[],errors:[]};
const originalError=console.error;
console.error=(...args)=>{r.errors.push({type:'console',message:args.map(String).join(' ')});originalError(...args);};
addEventListener('error',event=>r.errors.push({type:'error',message:event.message}));
addEventListener('unhandledrejection',event=>r.errors.push({type:'rejection',message:String(event.reason)}));
const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2')??canvas?.getContext('webgl');
const ext=gl?.getExtension('WEBGL_lose_context');
const expect=(ok,message)=>{if(!ok)throw new Error(message);};
const wait=async(fn,message,timeout=20000)=>{const end=performance.now()+timeout;while(performance.now()<end){if(fn())return;await sleep(100);}throw new Error(message);};
const state=()=>({at:performance.now(),screen:h.app.screen(),paused:h.app.paused(),tick:h.frame(),phase:h.phase(),input:{...h.getState().input},lost:gl.isContextLost(),renderedFrames:h.renderedFrames(),render:h.info().render});
const event=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(type+' event timed out')),10000);canvas.addEventListener(type,e=>{clearTimeout(timer);resolve({at:performance.now(),trusted:e.isTrusted,type:e.type,defaultPrevented:e.defaultPrevented});},{once:true});});
const pixels=()=>{let renderAttempts=0,actualDraw=false;for(;renderAttempts<32;renderAttempts++){const skips=h.info().render?.skippedFrames;h.render(true);if(h.info().render?.skippedFrames===skips){actualDraw=true;break;}}const p=new Uint8Array(36);let i=0;for(const x of [.25,.5,.75])for(const y of [.25,.5,.75]){gl.readPixels(Math.floor(gl.drawingBufferWidth*x),Math.floor(gl.drawingBufferHeight*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p.subarray(i,i+4));i+=4;}return {renderAttempts:renderAttempts+1,actualDraw,samples:[...p],nonzero:p.some(v=>v!==0),error:gl.getError(),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,info:h.info().render};};
try{
 expect(ext,'WEBGL_lose_context unavailable');
 r.boot={native:await Capacitor.Plugins.App.getInfo(),origin:location.origin,search:location.search,hasSW:Boolean(navigator.serviceWorker?.controller),screen:h.app.screen(),ready:h.ready,online:navigator.onLine};
 await sleep(2500);
 for(const mode of ['menu','ride']){
  const c={mode};r.cases.push(c);
  try{
   h.app.goto('menu');
   if(mode==='ride'){
    h.app.play('flat-test');await sleep(1200);
    for(const b of document.querySelectorAll('button'))if(/got it/i.test(b.textContent))b.click();
    h.skipCountdown();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true,cancelable:true}));
    h.app.frame();await sleep(100);
   }
   c.before=state();
   const lost=event('webglcontextlost');ext.loseContext();c.lostEvent=await lost;c.immediate=state();
   await sleep(1000);c.during=state();c.lostError=gl.getError();
   const restored=event('webglcontextrestored');ext.restoreContext();c.restoredEvent=await restored;
   await wait(()=>!gl.isContextLost()&&!h.info().render?.entering,'Renderer restore/entry did not settle');
   c.afterRestore=state();
   // Retain the original held key through manual Resume: only the application's reset may clear it.
   if(mode==='menu'){h.app.goto('garage');await sleep(1200);}
   else{c.resumeAttempts=0;while(h.app.paused()&&c.resumeAttempts<10){h.app.togglePause();c.resumeAttempts++;await sleep(250);}}
   await sleep(800);c.afterManualResume=state();c.pixels=pixels();
   c.graphicsPass=c.lostEvent.trusted&&c.restoredEvent.trusted&&c.immediate.lost&&!c.afterRestore.lost&&c.pixels.actualDraw&&c.pixels.error===0&&c.pixels.nonzero&&c.pixels.info.calls>0;
   c.interruptionPass=mode==='menu'?c.during.screen==='menu':c.before.input.throttle>0&&c.immediate.paused&&c.during.paused&&c.during.tick===c.immediate.tick&&c.afterRestore.paused&&!c.afterManualResume.paused&&c.afterManualResume.tick>c.afterRestore.tick&&c.afterManualResume.input.throttle===0&&c.afterManualResume.input.brake===0&&c.afterManualResume.input.lean===0;
   c.pass=c.graphicsPass&&c.interruptionPass;
  }catch(error){c.error=String(error);c.pass=false;try{if(gl.isContextLost())ext.restoreContext();}catch{/* Evidence retains error. */}}
  finally{window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true}));}
 }
 await wait(()=>!gl.isContextLost()&&!h.info().render?.entering,'Graphics unavailable for ship gate');
 h.app.quit();await h.loadTrack('b1-first-ride');
 const recording=${JSON.stringify(golden)};
 h.runRecording(recording);const first={time:h.finishTime(),hash:h.hashState(),phase:h.phase(),faults:h.faults()};
 h.runRecording(recording);const second={time:h.finishTime(),hash:h.hashState(),phase:h.phase(),faults:h.faults()};
 await h.loadTrack('flat-test',3277865877);h.skipCountdown();h.setInput({throttle:1,brake:0,lean:-1,hop:false,restart:false});
 let attemptedTicks=0;while(h.phase()!=='crashed'&&attemptedTicks<2000){h.step(1);attemptedTicks++;}
 const crashed={phase:h.phase(),faults:h.faults(),tick:h.frame(),attemptedTicks};
 const began=performance.now();h.restart();h.skipCountdown();h.step(1);const restart={elapsedMs:performance.now()-began,phase:h.phase(),tick:h.frame()};
 r.shipGate={first,second,crashed,restart,pass:first.time!==null&&first.time===second.time&&first.hash===second.hash&&crashed.phase==='crashed'&&crashed.faults>0&&restart.phase==='riding'&&restart.tick===1&&restart.elapsedMs<100};
 h.app.quit();r.final=state();
 r.externalResources=performance.getEntriesByType('resource').map(e=>e.name).filter(url=>!url.startsWith(location.origin)&&!url.startsWith('data:')&&!url.startsWith('blob:'));
 r.pass=r.cases.every(c=>c.pass)&&r.shipGate.pass&&r.errors.length===0&&r.externalResources.length===0&&r.boot.origin==='capacitor://localhost'&&!r.boot.hasSW&&!r.boot.search;
}catch(error){r.error=String(error);r.pass=false;}
finally{console.error=originalError;}
r.probeAt=Date.now();return r;
`;
 const probeFile=path.join(output,'probe.js'),log=path.join(output,'probe.log');fs.writeFileSync(probeFile,script);
 const code=await new Promise((resolve,reject)=>{
  const stream=fs.createWriteStream(log),child=spawn(process.execPath,['scripts/native-ios-probe.mjs'],{env:{...process.env,TRIALS_SIMULATOR:device,TRIALS_PROBE_NO_INSTALL:'1',TRIALS_PROBE_FILE:probeFile,TRIALS_PROBE_TIMEOUT_MS:'240000'},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});const start=Date.now(),timer=setInterval(()=>console.log('Installed graphics probe: '+Math.round((Date.now()-start)/1000)+'s'),20000);
  child.on('error',error=>{clearInterval(timer);stream.end();reject(error);});child.on('close',code=>{clearInterval(timer);stream.end(()=>resolve(code));});
 });
 const result=read('.native-build/evidence/ios-probe.json');check(result.token===token,'No fresh matching graphics report');
 write(path.join(output,'probe.json'),result);report.probe={...result,path:path.join(output,'probe.json'),sha256:sha(fs.readFileSync(path.join(output,'probe.json'))),probeScriptSha256:sha(fs.readFileSync(probeFile)),log,exitCode:code};report.pass=result.pass&&code===0;save();
}catch(error){report.error=error.message;process.exitCode=1;save();}
finally{
 clearTimeout(videoTimer);if(video&&video.exitCode===null)video.kill('SIGINT');if(videoDone)await videoDone;
 if(report.video&&fs.existsSync(report.video.path))report.video.sha256=sha(fs.readFileSync(report.video.path));
 if(booted){try{sim('terminate',device,appId);}catch{/* Already stopped. */}try{sim('shutdown',device);report.simulatorShutdown=true;}catch(error){report.shutdownError=error.message;}}
 report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({pass:report.pass,error:report.error,cases:report.probe?.cases.map(c=>({mode:c.mode,graphicsPass:c.graphicsPass,interruptionPass:c.interruptionPass,error:c.error})),shipGate:report.probe?.shipGate,evidence,video:report.video?.path},null,2));if(!report.pass)process.exitCode=1;
}
