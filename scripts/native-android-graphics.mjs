#!/usr/bin/env node
/** Task-owned installed WebView: real WEBGL_lose_context and offline gameplay gate.
 * No synthetic loss events, native updater changes, save writes, or PWA reload.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { android, connectWebview, delay } from './native-android-probe.mjs';
const options={serial:'emulator-5554',apk:'android/app/build/outputs/apk/debug/app-debug.apk',output:'.native-build/graphics-round6/report.json'};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].replace(/^--/,'');if(!(key in options)||!process.argv[i+1])throw Error('Unknown/missing option');options[key]=process.argv[i+1]}
const adb=android(options.serial),appId='com.trialsgauntlet.game',sdk=process.env.ANDROID_HOME??path.join(os.homedir(),'Library/Android/sdk'),adbPath=path.join(sdk,'platform-tools/adb');
const report={schema:1,at:new Date().toISOString(),pass:false,apkSha256:createHash('sha256').update(fs.readFileSync(options.apk)).digest('hex'),package:execFileSync(path.join(sdk,'build-tools/36.0.0/aapt'),['dump','badging',options.apk],{encoding:'utf8'}).split('\n')[0],cases:[],contexts:[]};
let client,video;
const write=()=>{fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,JSON.stringify(report,null,2)+'\n')};
const check=(name,pass,evidence)=>{report.cases.push({name,pass:!!pass,evidence});write()};
const state=()=>client.evaluate(`(()=>{const t=window.__trials,g=window.__graphicsGL;return {phase:t.phase(),tick:t.getState().tick,paused:t.app.paused(),input:t.getState().input,heldControls:[...document.querySelectorAll('.touch-layer .held')].map(e=>e.className),lost:g.isContextLost(),origin:location.origin,href:location.href,screen:t.app.screen(),render:t.info().render,frames:t.renderedFrames(),events:window.__graphicsEvents}})()`);
const sample=()=>client.evaluate(`(()=>{const t=window.__trials,g=window.__graphicsGL,framesBefore=t.renderedFrames();window.dispatchEvent(new Event('resize'));t.render(true);const pixels=[];for(let y=1;y<=4;y++)for(let x=1;x<=6;x++){const p=new Uint8Array(4);g.readPixels(Math.floor(g.drawingBufferWidth*x/7),Math.floor(g.drawingBufferHeight*y/5),1,1,g.RGBA,g.UNSIGNED_BYTE,p);pixels.push([...p])}return {redrawMethod:'same-dimension window resize invalidates static-frame cache before synchronous render/readPixels',framesBefore,lost:g.isContextLost(),glError:g.getError(),pixels,nonBlack:pixels.some(p=>p[0]+p[1]+p[2]>15),distinctRgb:new Set(pixels.map(p=>p.slice(0,3).join(','))).size,render:t.info().render,frames:t.renderedFrames()}})()`);
const menuSample=()=>client.evaluate(`(async()=>{const menu=document.querySelector('.menu-screen'),art=document.querySelector('.menu-keyart'),background=getComputedStyle(art).backgroundImage,start=background.indexOf('url('),src=start<0?null:background.slice(start+4,background.indexOf(')',start)).replaceAll('"','').replaceAll("'",'');let decoded=false;if(src){const image=new Image();image.src=src;await image.decode();decoded=image.naturalWidth>0}return {screen:window.__trials.app.screen(),menuLive:menu.classList.contains('live'),artDecoded:decoded,artUrl:src,rendererEntering:window.__trials.info().render.entering}})()`);
const play=async()=>{await client.evaluate('window.__trials.app.play("flat-test")');await client.waitFor('window.__trials.app.screen()==="run"');await delay(900);if(await client.evaluate('document.querySelector(".onboard")?.classList.contains("show")')){await client.waitFor('!!document.querySelector(".onboard.live button")');await client.evaluate('document.querySelector(".onboard button").click()')}await client.waitFor('!window.__trials.info().entryHold');await client.evaluate('window.__trials.skipCountdown()');await client.waitFor('window.__trials.phase()==="riding"')};
try{
 if(adb('shell','getprop','ro.kernel.qemu')!=='1')throw Error('Task emulator required');
 const cfg=JSON.parse(execFileSync('unzip',['-p',options.apk,'assets/capacitor.config.json'],{encoding:'utf8'}));if(cfg.server?.url||cfg.plugins.CapacitorUpdater.autoUpdate!=='off')throw Error('Normal bundled APK required');
 adb('install','-r','-d',path.resolve(options.apk));adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');adb('shell','am','force-stop',appId);adb('shell','input','keyevent','KEYCODE_HOME');
 video=spawn(adbPath,['-s',options.serial,'shell','screenrecord','--time-limit','30','--bit-rate','3000000','/sdcard/native-graphics-launch.mp4'],{stdio:'ignore'});await delay(500);
 report.launch=adb('shell','am','start','-W','-n',`${appId}/.MainActivity`);client=await connectWebview(options.serial);await client.waitFor('window.__trials?.ready && !document.getElementById("loader")');
 report.boot=await client.evaluate(`(async()=>({readyAtMs:window.__trials.info().readyAtMs,platform:Capacitor.getPlatform(),origin:location.origin,online:navigator.onLine,screen:window.__trials.app.screen(),current:(await Capacitor.Plugins.CapacitorUpdater.current()).bundle,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}))()`);
 report.display={size:adb('shell','wm','size'),density:adb('shell','wm','density')};adb('shell','uiautomator','dump','/sdcard/native-graphics-layout.xml');const layout=adb('shell','cat','/sdcard/native-graphics-layout.xml'),bounds=layout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!bounds)throw Error('Native WebView bounds absent');report.nativeWebViewBounds={left:+bounds[1],top:+bounds[2],right:+bounds[3],bottom:+bounds[4]};adb('shell','rm','/sdcard/native-graphics-layout.xml');check('Offline cold launch opens native bundled menu',report.boot.platform==='android'&&!report.boot.online&&report.boot.current.id==='builtin'&&report.boot.screen==='menu',report.boot);
 await client.evaluate(`(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2');window.__graphicsGL=g;window.__graphicsExtension=g.getExtension('WEBGL_lose_context');window.__graphicsEvents=[];window.__graphicsErrors=[];const error=console.error;console.error=(...args)=>{window.__graphicsErrors.push({type:'console.error',message:args.map(String).join(' ')});error(...args)};window.addEventListener('error',e=>window.__graphicsErrors.push({type:'error',message:e.message??e.target?.src??e.target?.href??'resource error'}),true);window.addEventListener('unhandledrejection',e=>window.__graphicsErrors.push({type:'rejection',message:String(e.reason)}));for(const type of ['webglcontextlost','webglcontextrestored'])c.addEventListener(type,e=>window.__graphicsEvents.push({type,at:performance.now(),defaultPrevented:e.defaultPrevented}));return !!window.__graphicsExtension})()`);
 for(const stage of ['menu','ride']){
  if(stage==='ride')await play();
  const row={stage,before:await state(),beforeSample:stage==='menu'?await menuSample():await sample()};
  let heldGesture;
  if(stage==='ride'){
   const point=await client.evaluate(`(()=>{const r=document.querySelector('.tz-throttle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight}})()`),b=report.nativeWebViewBounds;
   const x=Math.round(b.left+point.x*(b.right-b.left)/point.width),y=Math.round(b.top+point.y*(b.bottom-b.top)/point.height);
   row.heldGesture={source:'adb input touchscreen swipe',x,y,durationMs:4000};
   const child=spawn(adbPath,['-s',options.serial,'shell','input','touchscreen','swipe',String(x),String(y),String(x),String(y),'4000'],{stdio:'ignore'});
   heldGesture=new Promise((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error('OS throttle gesture failed')));child.on('error',reject)});
   await client.waitFor('window.__trials.getState().input.throttle>0');row.heldBeforeLoss=await state();
  }
  await client.evaluate('window.__graphicsExtension.loseContext()');await client.waitFor('window.__graphicsGL.isContextLost()');await delay(200);row.lost=await state();await delay(1000);row.lostLater=await state();
  check(`${stage}: actual WebGL loss event recognized`,row.lost.lost&&row.lost.events.some(e=>e.type==='webglcontextlost'),row.lost);
  if(stage==='ride')check('Ride context loss pauses physics and clears input',row.lost.paused&&row.lostLater.tick===row.lost.tick&&row.lostLater.heldControls.length===0,{lost:row.lost,later:row.lostLater});
  await client.evaluate('window.__graphicsExtension.restoreContext()');await client.waitFor('!window.__graphicsGL.isContextLost() && window.__graphicsEvents.filter(e=>e.type==="webglcontextrestored").length>='+String(stage==='menu'?0:1));
  const recoveryStart=Date.now();await client.waitFor('!window.__trials.info().render.entering');row.recoveryReadyWaitMs=Date.now()-recoveryStart;row.restored=await state();if(stage==='ride'){row.pausedScreenshot=options.output.replace(/\.json$/,'-restored-paused.png');fs.writeFileSync(row.pausedScreenshot,execFileSync(adbPath,['-s',options.serial,'exec-out','screencap','-p'],{timeout:30000}))}row.restoredSample=stage==='menu'?await menuSample():await sample();
  check(`${stage}: restored content remains available without navigation`,!row.restored.lost&&row.restored.origin==='https://localhost'&&row.restored.href===row.before.href&&(stage==='menu'?row.restoredSample.menuLive&&row.restoredSample.artDecoded&&!row.restoredSample.rendererEntering:row.restoredSample.nonBlack&&row.restoredSample.distinctRgb>1&&row.restoredSample.glError===0&&row.restoredSample.frames>row.restoredSample.framesBefore),row.restoredSample);
  if(stage==='ride'){
   await heldGesture;const beforeResume=await state();await delay(500);const still=await state();
   check('Restored ride waits for explicit resume',beforeResume.paused&&still.tick===beforeResume.tick,{beforeResume,still});
   row.explicitResumeCalled=still.paused;if(row.explicitResumeCalled)await client.evaluate('window.__trials.app.togglePause()');
   const resumed=await state();await delay(500);row.afterResume=await state();check('Ride advances after explicit resume',row.explicitResumeCalled&&!row.afterResume.paused&&row.afterResume.tick>resumed.tick&&!row.afterResume.input.throttle&&!row.afterResume.input.brake&&!row.afterResume.input.lean,row.afterResume);
  }
  report.contexts.push(row);write();
 }
 report.graphicsErrors=await client.evaluate('window.__graphicsErrors');check('Context recovery has no resource or runtime errors',report.graphicsErrors.length===0,report.graphicsErrors);
 await play();const golden=fs.readFileSync('harness/inputs/flat-test/bot-3.json','utf8');report.clears=[];
 for(let i=0;i<2;i++)report.clears.push(await client.evaluate(`(()=>{const t=window.__trials;t.runRecording(${JSON.stringify(golden)});t.render(true);return {phase:t.phase(),time:t.finishTime(),hash:t.hashState(),faults:t.faults()}})()`));
 check('Two recorded clears have identical finish time and hash',report.clears[0].time!==null&&JSON.stringify(report.clears[0])===JSON.stringify(report.clears[1]),report.clears);
 report.crashRestart=await client.evaluate(`(async()=>{const t=window.__trials;await t.loadTrack('flat-test',3277865877);t.skipCountdown();t.setInput({throttle:1,brake:0,lean:-1,hop:false,restart:false});let n=0;while(t.phase()!=='crashed'&&n<1200){t.step(1);n++}const crash={phase:t.phase(),faults:t.faults(),tick:t.getState().tick,stepped:n};const start=performance.now();t.restart();t.setInput({throttle:0,brake:0,lean:0,hop:false,restart:false});t.step(1);t.render(true);return {crash,restart:{phase:t.phase(),tick:t.getState().tick,wallMs:performance.now()-start}}})()`);
 check('Terminal crash restarts to riding in one simulation tick',report.crashRestart.crash.phase==='crashed'&&report.crashRestart.restart.phase==='riding'&&report.crashRestart.restart.tick===1,report.crashRestart);
}catch(error){report.error=String(error.stack??error)}finally{
 client?.close();
 if(video){if(video.exitCode===null){try{adb('shell','pkill','-INT','screenrecord')}catch{/* recording may already be finished */}await delay(1000)}try{const file=options.output.replace(/\.json$/,'-launch.mp4');adb('pull','/sdcard/native-graphics-launch.mp4',file);report.launchVideo=file;adb('shell','rm','/sdcard/native-graphics-launch.mp4')}catch(error){report.videoError=String(error)}}
 report.finishedAt=new Date().toISOString();report.pass=!report.error&&report.cases.every(c=>c.pass);report.limitations=['Headless API36 emulator with software GPU; no physical-device performance, visual quality, or audible-output claim.','Non-black sampled framebuffer pixels plus render/runtime evidence establish drawing, not visual correctness. Parent judges recorded clip.','Clear/crash/restart gate uses recorded input and bounded simulation hooks; wall time includes emulator overhead.'];write();
}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({name,pass})=>({name,pass})),error:report.error,output:options.output},null,2));if(!report.pass)process.exitCode=1;
