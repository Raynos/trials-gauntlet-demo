import fs from 'node:fs';
import { preview } from 'vite';
import { launchBrowser } from '../../../../harness/lib/browser';
import { openGame, readHeap } from '../../../../harness/lib/hook';
import { synthesizeRecording } from '../../../../harness/lib/synth';
import { expandFrames } from '../../../../src/core/replay';
const out=process.argv[2]; if(!out||fs.existsSync(out)) throw Error('Fresh output required');
const server=await preview({root:process.cwd(),build:{outDir:'/tmp/trials-poses-round3/dist'},preview:{host:'127.0.0.1',port:0}});
const browser=await launchBrowser();
try{
 const page=browser.page;await openGame(page,server.resolvedUrls.local[0]!);
 await page.evaluate(()=>{const t=window.__trials!;t.loadTrack('flat-test');t.resize(640,360);for(let i=0;i<5;i++)t.render(true);});
 const cdp=await page.context().newCDPSession(page);
 const samples=[];
 const sample=async(seconds:number)=>{const raw=await readHeap(page);await cdp.send('HeapProfiler.collectGarbage');const retained=await readHeap(page);samples.push({seconds,raw,retained});};
 await sample(0);
 const frames=expandFrames(synthesizeRecording({trackId:'flat-test',seed:1,physicsHz:120,seconds:60,style:'wiggle'}));
 for(let minute=0;minute<5;minute++){
 for(let s=0;s<60;s++)await page.evaluate(ins=>{const t=window.__trials!;for(let i=0;i<ins.length;i+=2){t.setInput(ins[i]!);t.step(1);t.setInput(ins[i+1]!);t.step(1);t.render(false);}if(t.getState().finished){t.setInput({restart:true});t.step(1);t.setInput({restart:false});}},frames.slice(s*120,(s+1)*120));
 await sample((minute+1)*60);
 }
 await cdp.detach();fs.writeFileSync(out,JSON.stringify({renderer:browser.probe,samples},null,2)+'\n');console.log(JSON.stringify(samples));
}finally{await browser.close();await new Promise<void>(resolve=>server.httpServer.close(()=>resolve()));}
