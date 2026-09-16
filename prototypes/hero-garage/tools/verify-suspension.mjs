import { webkit } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await webkit.launch({headless:true});
const errors=[];
try {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.argv[2]??'http://127.0.0.1:4182/?capture=1');
  await page.waitForFunction(()=>window.__heroGarage?.ready||window.__heroGarage?.error);
  const result=await page.evaluate(()=>{
    const g=window.__heroGarage;
    if(g.error)throw new Error(g.error);
    const clips=g.getDiagnostics().assets.flatMap(a=>a.clips);
    return clips.map(clip=>{
      g.setClip(clip.name);
      const samples=[];
      for(let frame=0;frame<=Math.round(clip.duration*30);frame++) {
        g.setTime(Math.min(frame/30,clip.duration-1e-7));
        samples.push({frame,...g.getDiagnostics().suspension});
      }
      g.setTime(0);
      return {clip:clip.name,samples,neutral:g.getDiagnostics().suspension};
    });
  });
  const report={scope:'Headless WebKit exported-scene kinematic suspension sweep; not physics, art acceptance or iPhone validation',errors,clips:result};
  await fs.writeFile('reports/suspension-browser-round18.json',JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(errors,[]);
  assert.equal(result.length,6);
  for(const row of result){
    for(const s of row.samples){
      for(const k of ['stroke','chassisPitch','armLengthError','frontAxleError','rearAxleError'])assert(Number.isFinite(s[k]),`${row.clip}: ${k}`);
      for(const k of ['armLengthError','frontAxleError','rearAxleError'])assert(s[k]<1e-6,`${row.clip}: ${k}=${s[k]}`);
      assert(s.stroke>=0&&s.stroke<=.025);
    }
    assert.equal(row.neutral.stroke,0);
    const peak=Math.max(...row.samples.map(s=>s.stroke));
    assert.equal(peak,['compression','landing_absorption'].includes(row.clip)?.025:0);
  }
  console.log(JSON.stringify({pass:true,clips:result.length,samples:result.reduce((n,c)=>n+c.samples.length,0),errors}));
} finally {await browser.close();}
