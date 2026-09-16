/** Scheduling control only: no scene, no art or product-performance pass. */
import { webkit } from 'playwright';
import fs from 'node:fs';
const browser=await webkit.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const page=await context.newPage();
  await page.setContent('<body style="background:#676e6a">Empty-page animation timing control</body>');
  const trace=await page.evaluate(()=>new Promise(resolve=>{
    let start,prior;const frames=[];
    function frame(now){
      start??=now;if(prior!==undefined)frames.push(now-prior);prior=now;
      if(now-start<30000){requestAnimationFrame(frame);return;}
      const sorted=[...frames].sort((a,b)=>a-b);
      resolve({durationMs:now-start,frames,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],meanMs:frames.reduce((a,b)=>a+b,0)/frames.length});
    }requestAnimationFrame(frame);
  }));
  const report={scope:'Empty-page rAF scheduling control, no WebGL and no video. Cannot establish garage performance.',browser:browser.version(),headless:true,trace};
  fs.writeFileSync('reports/empty-page-timing-control.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,trace:{...trace,frames:trace.frames.length}}));
} finally {await browser.close();}
