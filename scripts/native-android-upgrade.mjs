#!/usr/bin/env node
/** Binary-upgrade save qualification. Clears ONLY task emulator data before baseline.
 * Requires prebuilt same-signature 1.0.0(1)/1.0.1(2) APKs. Never builds or boots an AVD.
 * No save fabrication: UI handlers select preferences; recorded inputs earn a PB.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {android,connectWebview,delay} from './native-android-probe.mjs';
const options={baseline:'.native-build/upgrade-round5/baseline.apk',upgraded:'.native-build/upgrade-round5/upgraded.apk',output:'.native-build/upgrade-round5/report.json',serial:'emulator-5554'};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].replace(/^--/,'');if(!(key in options)||!process.argv[i+1])throw Error('Unknown/missing option');options[key]=process.argv[i+1]}
const adb=android(options.serial),appId='com.trialsgauntlet.game',track='b1-first-ride';
const sdk=process.env.ANDROID_HOME??path.join(os.homedir(),'Library/Android/sdk');
const sha=value=>createHash('sha256').update(value).digest('hex');
const metadata=apk=>execFileSync(path.join(sdk,'build-tools/36.0.0/aapt'),['dump','badging',apk],{encoding:'utf8'}).split('\n')[0];
const report={schema:1,at:new Date().toISOString(),pass:false,cases:[],artifacts:Object.fromEntries(['baseline','upgraded'].map(k=>[k,{path:options[k],sha256:sha(fs.readFileSync(options[k])),package:metadata(options[k])}]))};
let client;
const write=()=>{fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,JSON.stringify(report,null,2)+'\n')};
const check=(name,pass,evidence)=>{report.cases.push({name,pass:!!pass,evidence});write();if(!pass)throw Error(name)};
const nativeSave=()=>['a','b'].flatMap(slot=>{try{return [JSON.parse(adb('shell','run-as',appId,'cat',`files/trials-save-${slot}.json`))]}catch{return []}}).sort((a,b)=>b.generation-a.generation)[0];
const selected=entries=>Object.fromEntries(Object.entries(entries).filter(([k])=>/^trials\.(best\.|lastrun\.|bikeClass$|riderOutfit$|quality$|fps$|ghost$|sound$|volume$|onboarded$|lastTrack$)/.test(k)));
const launch=async()=>{client?.close();adb('shell','am','force-stop',appId);adb('shell','am','start','-W','-n',`${appId}/.MainActivity`);client=await connectWebview(options.serial);await client.waitFor('window.__trials?.ready && !document.getElementById("loader")')};
const play=async()=>{await client.evaluate(`window.__trials.app.play(${JSON.stringify(track)})`);await client.waitFor('window.__trials.app.screen()==="run"');await delay(800);if(await client.evaluate('document.querySelector(".onboard")?.classList.contains("show")')){await client.waitFor('!!document.querySelector(".onboard.live button")');await client.evaluate('document.querySelector(".onboard button").click()')}await client.evaluate('window.__trials.skipCountdown()')};
const boot=()=>client.evaluate(`(async()=>({platform:Capacitor.getPlatform(),online:navigator.onLine,origin:location.origin,current:(await Capacitor.Plugins.CapacitorUpdater.current()).bundle,marker:window.__nativeOtaFixture??null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},screen:window.__trials.app.screen()}))()`);
const preferenceUI=async()=>{
 await client.evaluate('window.__trials.app.goto("garage")');await delay(700);
 const garage=await client.evaluate(`({bike:document.querySelector('.bike-chip.on')?.getAttribute('data-bike')??null,outfit:window.__trials.info().render.riderOutfit,text:document.querySelector('.garage-screen')?.innerText??''})`);
 await client.evaluate('window.__trials.app.goto("settings")');await delay(700);
 const settings=await client.evaluate(`Object.fromEntries([...document.querySelectorAll('.settings-screen .setting')].map(el=>[el.querySelector('.lab')?.childNodes[0]?.textContent,[...el.querySelectorAll('button.on')].map(b=>b.dataset.v).join(',')||el.querySelector('.val')?.textContent||null]))`);
 return {garage,settings};
};
try{
 if(adb('shell','getprop','ro.kernel.qemu')!=='1')throw Error('Task emulator required');
 check('APK versions identify a real binary upgrade',report.artifacts.baseline.package.includes("versionCode='1' versionName='1.0.0'")&&report.artifacts.upgraded.package.includes("versionCode='2' versionName='1.0.1'"),report.artifacts);
 for(const apk of [options.baseline,options.upgraded]){const cfg=JSON.parse(execFileSync('unzip',['-p',apk,'assets/capacitor.config.json'],{encoding:'utf8'}));if(cfg.server?.url||cfg.plugins.CapacitorUpdater.autoUpdate!=='off'||['updateUrl','statsUrl','channelUrl'].some(k=>cfg.plugins.CapacitorUpdater[k]!==''))throw Error('Expected normal disabled-channel APK')}
 adb('install','-r','-d',path.resolve(options.baseline));adb('shell','pm','clear',appId);
 adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');
 report.display={size:adb('shell','wm','size'),density:adb('shell','wm','density')};
 await launch();report.baselineBoot=await boot();
 await client.evaluate('window.__trials.app.goto("garage")');await client.waitFor('!!document.querySelector(".garage-screen.live")');
 await client.evaluate(`document.querySelector('.bike-chip[data-bike="pro"]').click();document.querySelector('.outfit-button[data-outfit="race-bluewhite"]').click()`);
 await client.waitFor('localStorage.getItem("trials.bikeClass")==="pro" && localStorage.getItem("trials.riderOutfit")==="race-bluewhite"');
 await client.evaluate('window.__trials.app.goto("settings")');await delay(700);
 await client.evaluate(`(()=>{const rows=[...document.querySelectorAll('.settings-screen .setting')];for(const [label,value] of [['Quality','low'],['Frame rate','30'],['Sound','off'],['Ghost','on']]){const row=rows.find(el=>el.querySelector('.lab')?.childNodes[0]?.textContent===label);if(!row)throw Error(label);row.querySelector('button[data-v="'+value+'"]').click()}const volume=rows.find(el=>el.querySelector('.lab')?.childNodes[0]?.textContent==='Volume');for(let i=0;i<10;i++)volume.querySelector('[data-d="-1"]').click();for(let i=0;i<4;i++)volume.querySelector('[data-d="1"]').click()})()`);
 await play();
 const recording=fs.readFileSync(`harness/inputs/${track}/bot-3-pro.json`,'utf8');
 report.baselineClear=await client.evaluate(`(()=>{const t=window.__trials;t.runRecording(${JSON.stringify(recording)});const clear={finished:t.cleared(),time:t.finishTime(),faults:t.faults(),hash:t.hashState()};t.step(100);t.render(true);return clear})()`);
 await client.waitFor(`!!localStorage.getItem('trials.best.${track}@pro')`);await delay(700);
 report.baselineUI=await preferenceUI();
 await delay(700);const before=nativeSave();report.beforeSnapshot={generation:before.generation,entries:selected(before.entries)};
 const pb=JSON.parse(before.entries[`trials.best.${track}@pro`]);report.pb={time:pb.time,faults:pb.faults,medal:pb.medal,recordingBytes:pb.recording?.length,recordingSha256:sha(pb.recording??'')};
 check('Real recorded ride earns durable PB medal and ghost',report.baselineClear.finished&&pb.time===report.baselineClear.time&&pb.recording?.length>0&&before.entries[`trials.best.${track}@pro#board`],report.pb);
 check('Garage and settings fixture is durable',before.entries['trials.bikeClass']==='pro'&&before.entries['trials.riderOutfit']==='race-bluewhite'&&before.entries['trials.quality']==='low'&&before.entries['trials.fps']==='30'&&before.entries['trials.sound']==='0'&&before.entries['trials.volume']==='0.4',report.baselineUI);
 client.close();client=null;adb('shell','am','force-stop',appId);
 report.upgradeInstall=adb('install','-r',path.resolve(options.upgraded));
 const afterInstall=nativeSave();report.afterInstall={generation:afterInstall.generation,selectedEntriesSha256:sha(JSON.stringify(selected(afterInstall.entries)))};
 check('install -r preserves native snapshot before first upgraded boot',JSON.stringify(selected(before.entries))===JSON.stringify(selected(afterInstall.entries)),{beforeGeneration:before.generation,afterGeneration:afterInstall.generation});
 await launch();report.upgradedBoot=await boot();
 report.installedVersion=adb('shell','dumpsys','package',appId).split('\n').filter(l=>/versionCode=|versionName=/.test(l)).map(l=>l.trim());
 report.restoredUI=await preferenceUI();
 const restoredEntries=await client.evaluate(`Object.fromEntries(Object.entries(localStorage).filter(([k])=>${JSON.stringify(Object.keys(report.beforeSnapshot.entries))}.includes(k)))`);
 check('Offline upgraded boot restores every selected save entry',report.upgradedBoot.platform==='android'&&!report.upgradedBoot.online&&report.upgradedBoot.current.id==='builtin'&&Object.entries(report.beforeSnapshot.entries).every(([k,v])=>restoredEntries[k]===v),{boot:report.upgradedBoot,entryCount:Object.keys(restoredEntries).length});
 check('Normal handlers read restored garage and settings',report.restoredUI.garage.outfit==='race-bluewhite'&&JSON.stringify(report.restoredUI.settings)===JSON.stringify(report.baselineUI.settings),report.restoredUI);
 await play();await client.evaluate('window.__trials.step(10);window.__trials.render(true)');
 report.restoredRide=await client.evaluate('({bike:window.__trials.info().bike,outfit:window.__trials.info().render.riderOutfit,ghost:window.__trials.ghost()})');
 check('Restored PB recording creates a live ghost on selected bike',report.restoredRide.bike==='pro'&&report.restoredRide.outfit==='race-bluewhite'&&report.restoredRide.ghost!==null,report.restoredRide);
 report.replay=await client.evaluate(`(()=>{const t=window.__trials,rec=JSON.parse(localStorage.getItem('trials.best.${track}@pro')).recording;const opened=t.replay.open(rec);t.replay.seek(Math.ceil(${pb.time}*120));t.render(true);return {opened,info:t.replay.info(),time:t.finishTime(),phase:t.phase()}})()`);
 check('Stored PB replay reaches identical finish time after upgrade',report.replay.opened&&report.replay.time===pb.time,report.replay);
 await client.evaluate('window.__trials.replay.close()');await play();
 report.upgradedClear=await client.evaluate(`(()=>{const t=window.__trials;t.runRecording(${JSON.stringify(recording)});return {finished:t.cleared(),time:t.finishTime(),faults:t.faults(),hash:t.hashState()}})()`);
 check('Recorded inputs remain deterministic across binary upgrade',JSON.stringify(report.baselineClear)===JSON.stringify(report.upgradedClear),report.upgradedClear);
 report.restart=await client.evaluate('(()=>{const t=window.__trials;t.restart();t.skipCountdown();t.step(1);return {phase:t.phase(),tick:t.getState().tick}})()');
 check('Upgraded app restarts to riding on the next simulation tick',report.restart.phase==='riding'&&report.restart.tick===1,report.restart);
 report.pass=true;
}catch(error){report.error=String(error.stack??error)}finally{
 client?.close();report.finishedAt=new Date().toISOString();write();
}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({name,pass})=>({name,pass})),error:report.error,output:options.output},null,2));if(!report.pass)process.exitCode=1;
