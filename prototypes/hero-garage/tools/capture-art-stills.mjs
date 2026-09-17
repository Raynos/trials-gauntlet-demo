/** Clean canvas evidence from actual catalog geometry, never composited art. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';import{webkit}from'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1]},name=arg('name','delivery-stills'),out=path.join(root,'captures',name);fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/assets/catalog.json'),'utf8'));for(const a of catalog.assets){const v=arg(a.kind,null);if(v)a.url=a.mobileUrl='/assets/'+v;}
const assets=catalog.assets.map(a=>({kind:a.kind,url:a.url,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public',a.url))).digest('hex')}));
const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:2240,height:1440},deviceScaleFactor:1}),errors=[],shots=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/assets/catalog.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(catalog)}));await page.route('**/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:fs.readFileSync(path.join(root,'public',new URL(r.request().url()).pathname))}));
try{
 await page.goto(arg('url','http://127.0.0.1:4179')+'/?capture=1&quality=desktop',{waitUntil:'networkidle',timeout:60000});await page.waitForFunction(()=>window.__heroGarage?.ready||window.__heroGarage?.error,{},{timeout:60000});const error=await page.evaluate(()=>window.__heroGarage.error);if(error)throw Error(error);
 for(const shot of [
  {name:'rider-bike-neutral',camera:'full',clip:'sit_cruise',orbit:.55,lighting:'neutral'},
  {name:'rider-bike-garage',camera:'full',clip:'forward_attack',orbit:.45,lighting:'garage'},
  {name:'rider-bike-rear',camera:'full',clip:'hang_back',orbit:-1.0,lighting:'neutral'},
  {name:'face-curls-beard',camera:'face',clip:'sit_cruise',orbit:1.0,lighting:'neutral'},
  {name:'hoodie-gloves',camera:'hands',clip:'sit_cruise',orbit:0,lighting:'neutral'},
  {name:'jeans-trainers',camera:'footwear',clip:'forward_attack',orbit:0,lighting:'neutral'},
  {name:'complete-bike',camera:'bike',clip:'sit_cruise',orbit:1.05,lighting:'neutral'},
 ]){
  await page.evaluate(s=>{const g=window.__heroGarage;g.setClip(s.clip);if(['hands','footwear'].includes(s.camera))g.setDetail(s.camera);else g.setCamera(s.camera);g.setFrame({time:g.getDiagnostics().duration*.5,orbit:s.orbit,lighting:s.lighting});},shot);
  await page.locator('canvas').first().screenshot({path:path.join(out,shot.name+'.png')});shots.push(shot);
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(root,'reports',name+'.json'),JSON.stringify({assets,errors,shots,scope:'Actual Three.js canvas captures; separate recorded clips establish motion review. No retouching/compositing.'},null,2)+'\n');if(errors.length)process.exitCode=1;
