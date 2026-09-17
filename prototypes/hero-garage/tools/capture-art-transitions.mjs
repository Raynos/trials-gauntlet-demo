/** Record the authored clip family chained at shared neutral endpoints. Review only. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';import{webkit}from'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1]},name=arg('name','delivery-transitions'),out=path.join(root,'captures',name);fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/assets/catalog.json'),'utf8'));for(const a of catalog.assets){const v=arg(a.kind,null);if(v)a.url=a.mobileUrl='/assets/'+v;}
const assets=catalog.assets.map(a=>({kind:a.kind,url:a.url,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public',a.url))).digest('hex')}));
const browser=await webkit.launch({headless:true}),context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:out,size:{width:1920,height:1080}}}),page=await context.newPage(),errors=[],samples=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/assets/catalog.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(catalog)}));await page.route('**/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:fs.readFileSync(path.join(root,'public',new URL(r.request().url()).pathname))}));
let canvasBounds;
try{
 await page.goto(arg('url','http://127.0.0.1:4179')+'/?capture=1&quality=desktop',{waitUntil:'networkidle',timeout:60000});await page.waitForFunction(()=>window.__heroGarage?.ready||window.__heroGarage?.error,{},{timeout:60000});const error=await page.evaluate(()=>window.__heroGarage.error);if(error)throw Error(error);
 canvasBounds=await page.locator('canvas').first().boundingBox();
 for(const lighting of ['neutral','garage']){
  const sample=await page.evaluate(async(lighting)=>{
   const g=window.__heroGarage;g.setCamera('full');g.setLighting(lighting);
   const clips=g.getDiagnostics().assets.find(a=>a.kind==='rider').clips;
   const order=['sit_cruise','compression','extension','forward_attack','hang_back','landing_absorption','sit_cruise'];
   const total=order.reduce((s,n)=>s+clips.find(c=>c.name===n).duration,0);let elapsed=0;const rows=[];
   for(const name of order){const clip=clips.find(c=>c.name===name);g.setClip(name);const start=performance.now();let frames=0;
    while(true){const t=Math.min(clip.duration,(performance.now()-start)/1000);g.setFrame({time:t,orbit:.35+2*Math.PI*(elapsed+t)/total,lighting});frames++;await new Promise(r=>requestAnimationFrame(r));if(t===clip.duration)break;}
    elapsed+=clip.duration;rows.push({name,frames,duration:clip.duration});
   }
   return{lighting,rows,diagnostics:g.getDiagnostics()};
  },lighting);samples.push(sample);
  await page.locator('canvas').first().screenshot({path:path.join(out,lighting+'-full.png')});
 }
}finally{const video=page.video();await context.close();if(video)fs.renameSync(await video.path(),path.join(out,'transitions.webm'));await browser.close();}
fs.writeFileSync(path.join(root,'reports',name+'.json'),JSON.stringify({assets,errors,canvasBounds,samples,scope:'Authored clips chained at their shared neutral endpoints; no crossfade or game state-machine integration. Real timed WebKit video, not actual iPhone.'},null,2)+'\n');if(errors.length)process.exitCode=1;
