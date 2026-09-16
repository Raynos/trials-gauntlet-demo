/** Headless evidence only: real timed browser frames, no simulated iPhone claim. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(key,fallback)=>{const i=process.argv.indexOf('--'+key);return i<0?fallback:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:4178');
const seconds=Number(arg('seconds','30'));
const comparison=process.argv.includes('--comparison');
const recordVideo=!process.argv.includes('--no-video');
const reviewCamera=arg('camera','face');
const reviewClip=arg('clip',null);
if(!Number.isFinite(seconds)||seconds<=0) throw new Error('--seconds must be positive');
const stamp=arg('name',new Date().toISOString().replace(/[:.]/g,'-'));
const out=path.join(root,'captures',stamp);fs.mkdirSync(out,{recursive:true});
const engines=arg('engine','both')==='both'?['webkit','chromium']:[arg('engine','both')];
const results=[];
for(const engine of engines){
  if(!['webkit','chromium'].includes(engine)) throw new Error('Unsupported engine');
  const row={engine,headless:true,host:{platform:os.platform(),release:os.release(),arch:os.arch()},actualIPhone:false,recordVideo,errors:[],status:'started'};
  results.push(row);
  let browser,context;
  try{
    browser=await ({webkit,chromium}[engine]).launch({headless:true});
    row.browserVersion=browser.version();
    context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,...(recordVideo?{recordVideo:{dir:out,size:{width:1920,height:1080}}}:{})});
    const page=await context.newPage();
    const assetResponses=[];
    // WebKit evicts large GLBs from its inspector response cache. Hash the
    // upstream bytes and forward that exact payload to the browser, unchanged.
    await page.route('**/*.glb',async route=>{
      const response=await route.fetch();
      const bytes=await response.body();
      assetResponses.push(Promise.resolve({url:route.request().url(),status:response.status(),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),proof:'upstream response bytes forwarded unchanged through request interception'}));
      await route.fulfill({response,body:bytes});
    });
    page.on('pageerror',e=>row.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error') row.errors.push(m.text());});
    const loaded=Date.now();
    await page.goto(base+'/?capture=1',{waitUntil:'networkidle',timeout:45000});
    await page.waitForFunction(()=>window.__heroGarage?.ready||window.__heroGarage?.error,{},{timeout:45000});
    row.loadToReadyMs=Date.now()-loaded;
    row.assetResponses=await Promise.all(assetResponses);
    row.initial=await page.evaluate(()=>window.__heroGarage.getDiagnostics());
    row.motionControls=await page.evaluate(()=>({playDisabled:document.querySelector('#play')?.disabled,timelineDisabled:document.querySelector('#timeline')?.disabled,note:document.querySelector('#motion-note')?.textContent,clipButtons:document.querySelectorAll('[data-clip]').length}));
    row.motionControls.honestAbsentClips=row.initial.assets?.some(a=>a.clips.length)?null:row.motionControls.playDisabled&&row.motionControls.timelineDisabled&&row.motionControls.clipButtons===0;
    const fatal=await page.evaluate(()=>window.__heroGarage.error);
    if(fatal)throw new Error(fatal);
    if(reviewClip)await page.evaluate(name=>window.__heroGarage.setClip(name),reviewClip);
    if(comparison)await page.evaluate(()=>window.__heroGarage.setComparison(true));
    row.comparison=comparison;
    row.environment=await page.evaluate(()=>{
      const c=document.querySelector('canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');
      const ext=gl?.getExtension('WEBGL_debug_renderer_info');
      return {userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],drawingBuffer:[c.width,c.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR),webglVersion:gl?.getParameter(gl.VERSION),contextLost:gl?.isContextLost(),jsHeap:performance.memory?{used:performance.memory.usedJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null};
    });
    // Warm shader/material paths with actual renders before recording frame deltas.
    await page.evaluate(()=>{const g=window.__heroGarage;g.setCamera('face');g.setLighting('neutral');g.setTime(0);g.setOrbit(0);});
    await page.waitForTimeout(2000);row.shaderWarmupMs=2000;
    row.frames=[];
    for(const camera of ['face','reference','full','bike']){
      await page.evaluate(camera=>{const g=window.__heroGarage;g.setCamera(camera);g.setLighting('neutral');g.setTime(0);g.setOrbit(0);},camera);
      const filename=`${engine}-${camera}.png`;await page.screenshot({path:path.join(out,filename)});row.frames.push(filename);
    }
    await page.evaluate(()=>{const g=window.__heroGarage;g.setCamera('face');g.setLighting('neutral');g.setTime(1.25);g.setOrbit(0.4);});
    const a=await page.locator('canvas').first().screenshot();
    await page.evaluate(()=>{const g=window.__heroGarage;g.setTime(9);g.setOrbit(2);g.setTime(1.25);g.setOrbit(0.4);});
    const b=await page.locator('canvas').first().screenshot();
    const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
    row.deterministicCanvas={a:hash(a),b:hash(b),byteIdentical:a.equals(b),scope:'same engine, camera, orbit and animation time; not game physics replay'};
    // Real wall-clock orbit, interpolated time, relighting midway. Every evidence frame is rendered.
    row.trace=await page.evaluate(async ({duration,reviewCamera})=>{
      const g=window.__heroGarage;g.setCamera(reviewCamera);g.setLighting('neutral');
      const frames=[];let prior=null,start=null,relit=false;
      await new Promise(resolve=>{
        function frame(now){
          if(start===null)start=now;
          const elapsed=now-start;
          if(prior!==null)frames.push({elapsedMs:elapsed,deltaMs:now-prior});prior=now;
          if(elapsed>=duration*500)relit=true;
          const renderStart=performance.now();
          g.setFrame({time:elapsed/1000,orbit:elapsed/(duration*1000)*Math.PI*2,lighting:relit?'garage':'neutral'});
          if(frames.length)frames.at(-1).renderSubmitMs=performance.now()-renderStart;
          if(elapsed>=duration*1000)resolve();else requestAnimationFrame(frame);
        }requestAnimationFrame(frame);
      });
      const d=frames.map(x=>x.deltaMs).sort((a,b)=>a-b);
      const submit=frames.map(f=>f.renderSubmitMs).filter(Number.isFinite).sort((a,b)=>a-b);
      return {renderSubmitP95Ms:submit[Math.floor(submit.length*.95)],renderSubmitScope:'Synchronous CPU scene update and WebGL submission only; not GPU completion',durationSeconds:duration,measuredDurationMs:frames.at(-1)?.elapsedMs,frames,p50Ms:d[Math.floor(d.length*.5)],p95Ms:d[Math.floor(d.length*.95)],maxMs:d.at(-1),meanMs:d.reduce((a,b)=>a+b,0)/d.length,relit};
    },{duration:seconds,reviewCamera});
    row.desktopBudget={targetP95Ms:16.7,full30SecondTrace:seconds>=30,met:seconds>=30&&row.trace.p95Ms<=16.7,scope:`Headless desktop wall-clock rAF with one batched setFrame render; video recording ${recordVideo?'enabled':'disabled'}; not GPU timer queries or physical device performance`};
    await page.screenshot({path:path.join(out,`${engine}-orbit-end.png`)});
    row.final=await page.evaluate(()=>window.__heroGarage.getDiagnostics());
    // Mobile geometry/touch is a smoke check only; physical iPhone remains untested.
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const mp=await mobile.newPage();await mp.goto(base+'/?capture=1',{waitUntil:'networkidle'});
    await mp.waitForFunction(()=>window.__heroGarage?.ready||window.__heroGarage?.error);
    row.mobileSmoke={physicalDevice:false,initial:await mp.evaluate(()=>({error:window.__heroGarage.error,diagnostics:window.__heroGarage.getDiagnostics(),touch:navigator.maxTouchPoints,overflow:document.documentElement.scrollWidth>innerWidth}))};
    await mp.locator('[data-light="neutral"]').tap();
    await mp.locator('[data-camera="reference"]').tap();
    row.mobileSmoke.taps=await mp.evaluate(()=>({camera:window.__heroGarage.getDiagnostics().camera,lighting:window.__heroGarage.getDiagnostics().lighting}));
    row.mobileSmoke.taps.passed=row.mobileSmoke.taps.camera==='reference'&&row.mobileSmoke.taps.lighting==='neutral';
    await mp.locator('[data-camera="face"]').tap();
    await mp.screenshot({path:path.join(out,`${engine}-touch-portrait.png`)});
    await mp.setViewportSize({width:844,height:390});await mp.waitForTimeout(250);
    row.mobileSmoke.landscape=await mp.evaluate(()=>({diagnostics:window.__heroGarage.getDiagnostics(),overflow:document.documentElement.scrollWidth>innerWidth}));
    await mp.screenshot({path:path.join(out,`${engine}-touch-landscape.png`)});await mobile.close();
    const missing=await context.newPage();
    await missing.route('**/*.glb',route=>route.fulfill({status:404,body:'Deliberate missing asset probe'}));
    await missing.goto(base+'/?capture=1',{waitUntil:'networkidle'});
    await missing.waitForFunction(()=>window.__heroGarage?.error,{},{timeout:10000});
    row.missingAsset={error:await missing.evaluate(()=>window.__heroGarage.error),text:await missing.locator('body').innerText()};await missing.close();
    row.status=row.errors.length?'rendered-with-errors':'rendered';
    const video=page.video();await context.close();context=null;
    if(video){const videoPath=path.join(out,`${engine}-orbit-relight.webm`);await video.saveAs(videoPath);row.video=path.relative(root,videoPath);}else row.video=null;
  }catch(e){row.status='failed';row.failure=String(e);}
  finally{await context?.close();await browser?.close();}
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports',`${stamp}.json`),JSON.stringify({createdAt:new Date().toISOString(),base,results,artVerdict:'Parent review required; harness never judges likeness.',iPhoneValidation:'Not performed. Desktop WebKit and touch emulation cannot satisfy actual iPhone/Safari gate.'},null,2)+'\n');
  console.log(JSON.stringify({engine:row.engine,status:row.status,failure:row.failure,errors:row.errors,gpu:row.environment?.gpu,deterministicCanvas:row.deterministicCanvas?.byteIdentical,trace:row.trace?{seconds:row.trace.measuredDurationMs/1000,frames:row.trace.frames.length,p95Ms:row.trace.p95Ms}:undefined,video:row.video,report:`reports/${stamp}.json`},null,2));
}
if(results.some(r=>r.status!=='rendered'||!r.deterministicCanvas?.byteIdentical||r.motionControls?.honestAbsentClips===false))process.exitCode=1;
