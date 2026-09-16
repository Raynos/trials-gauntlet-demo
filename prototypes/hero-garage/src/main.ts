import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import { createBikeSuspension } from './bikeSuspension';
import { suspensionEnvelope } from './suspensionEnvelope';

type CameraName = 'face' | 'full' | 'bike' | 'reference';
type LightingName = 'neutral' | 'garage';
interface Asset { id: string; label: string; url: string; mobileUrl?: string; kind: 'head' | 'rider' | 'bike'; position?: [number,number,number]; rotation?: [number,number,number]; scale?: number }
interface Catalog { version: 1; stage: string; reference: {url: string; label: string}; assets: Asset[]; notes?: string[] }
interface Loaded { asset: Asset; root: THREE.Group; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] }
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header class="topbar"><div><div class="brand">HERO / GARAGE</div><div class="subhead">TARGET 01 · PRODUCTION STUDY</div></div><div class="stage" id="stage">Loading asset catalog</div></header>
<main><section class="viewport" aria-label="Interactive three dimensional asset viewer"><div class="caption"><h1 id="camera-label">Face study</h1><p id="asset-label">Independent Three.js review</p></div><div class="status" role="status" id="status">Loading the exported asset catalog…</div><div class="hint">Drag to orbit · Scroll or pinch to inspect</div></section><aside>
<div class="control-group"><p class="label">Comparison camera</p><div class="buttons" id="cameras"><button data-camera="face" aria-pressed="true">Face</button><button data-camera="full" aria-pressed="false">Rider + bike</button><button data-camera="bike" aria-pressed="false">Bike</button><button data-camera="reference" aria-pressed="false">Reference</button></div><button id="compare" aria-pressed="false" class="compare-toggle">Compare head at equal scale</button></div>
<div class="control-group"><p class="label">Light study</p><div class="buttons" id="lights"><button data-light="garage" aria-pressed="true">Garage</button><button data-light="neutral" aria-pressed="false">Neutral</button></div></div>
<div class="control-group"><p class="label">Authored motion</p><div class="buttons" id="clips"></div><p class="notes" id="motion-note">Checking exported animation clips.</p></div>
<figure class="reference hidden" id="reference"><p class="label">Design reference · concept</p><img id="reference-image" alt="Target 01 rider and bike design reference"/><figcaption id="reference-caption"></figcaption></figure>
<div class="notes" id="notes"></div><div class="footer"><a href="/identity.html">Open identity board ↗</a><br/>Provisional production work. Asset loading and renderer checks do not establish likeness or milestone acceptance. Mobile target: 30 fps; actual iPhone validation pending.</div>
</aside></main><div class="transport"><button id="play" disabled aria-label="Play authored animation">Play</button><input id="timeline" aria-label="Animation time" type="range" min="0" max="1" step="0.001" value="0" disabled/><span class="time" id="time">No motion loaded</span><div class="metrics" id="metrics">Renderer starting</div></div>`;
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const viewport = $<HTMLElement>('.viewport');
const runtimeSurface=document.createElement('div');runtimeSurface.className='runtime-surface';viewport.prepend(runtimeSurface);
const conceptPanel=document.createElement('div');conceptPanel.className='concept-panel';conceptPanel.innerHTML='<span class="pane-label">CONCEPT · ORIGINAL CROP</span><canvas aria-label="Enlarged unmodified crop of target 01 head"></canvas><span class="crop-note">Original pixels enlarged · no generated detail</span>';viewport.append(conceptPanel);
const runtimeLabel=document.createElement('span');runtimeLabel.className='pane-label runtime-label';runtimeLabel.textContent='RUNTIME · LIVE GLB';runtimeSurface.append(runtimeLabel);
const cropCanvas=conceptPanel.querySelector('canvas')!;
const cropImage=new Image();
let comparison=false;
const headFrame={min:[-.115,1.580,-.10],max:[.115,1.833,.19],sourceCrop:{x:694,y:128,width:111,height:118}};
const requestedQuality=new URLSearchParams(location.search).get('quality');
const quality: 'desktop'|'mobile'=requestedQuality==='desktop'||requestedQuality==='mobile'?requestedQuality:matchMedia('(pointer:coarse)').matches?'mobile':'desktop';
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality==='mobile' ? 1.5 : 2));
runtimeSurface.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#252e29');
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = false;
controls.minDistance = .05; controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * .94;
const hero = new THREE.Group(); scene.add(hero);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24,24), new THREE.MeshStandardMaterial({color:'#3b4238',roughness:.94}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(24,10),new THREE.MeshStandardMaterial({color:'#303b34',roughness:.92}));
wall.position.set(0,4,-4); wall.receiveShadow=true; scene.add(wall);
const hemi = new THREE.HemisphereLight('#f4f4ec','#4d5144',1); scene.add(hemi);
const key = new THREE.DirectionalLight('#fff1d7',3.1); key.position.set(3,5,4); key.castShadow=true;
key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-3; key.shadow.camera.right=3; key.shadow.camera.top=4; key.shadow.camera.bottom=-1; key.shadow.normalBias=.015; scene.add(key);
scene.add(key.target);
function fitAssetShadows(){
  const bounds=new THREE.Box3().setFromObject(hero);
  if(bounds.isEmpty())return;
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());
  const radius=Math.max(sphere.radius*1.25,.05);
  key.target.position.copy(sphere.center);
  key.target.updateMatrixWorld();
  const distance=key.position.distanceTo(sphere.center),shadowCamera=key.shadow.camera;
  shadowCamera.left=shadowCamera.bottom=-radius;
  shadowCamera.right=shadowCamera.top=radius;
  shadowCamera.near=Math.max(.01,distance-radius*2);
  shadowCamera.far=distance+radius*2;
  key.shadow.normalBias=radius*.001;
  key.shadow.bias=-.00005;
  shadowCamera.updateProjectionMatrix();
}
const fill = new THREE.DirectionalLight('#b9d5ea',1.2);fill.position.set(-4,3,1);scene.add(fill);
const rim = new THREE.DirectionalLight('#e8dab8',2);rim.position.set(1,4,-3);scene.add(rim);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room,.04);
scene.environment = environment.texture; scene.environmentIntensity=.45;
room.dispose(); pmrem.dispose();
const loaded: Loaded[]=[];
let suspension: ReturnType<typeof createBikeSuspension> | null = null;
let catalog: Catalog | null = null;
let ready=false, error:string|null=null, selectedCamera:CameraName='face', lighting:LightingName='garage';
let activeClip:string|null=null, duration=0, time=0, playing=false, orbitAngle=0;
let presetOffset = new THREE.Vector3(1,.2,3);
let loadMilliseconds=0;
let grounding: {coarseMinY:number;preciseMinY:number;assemblyOffsetY:number;finalMinY:number}|null=null;
const captureMode=new URLSearchParams(location.search).has('capture');
let frameTimes:number[]=[];
let renderSuppressed=false;
const targetFps=matchMedia('(pointer:coarse)').matches?30:60;
function setStatus(message:string,isError=false){$('#status').textContent=message;$('#status').classList.toggle('error',isError);}
function updateComparisonScale(){
  if(!comparison)return;
  if(catalog?.assets.some(asset=>asset.kind==='rider')){
    const width=Math.min(conceptPanel.clientWidth-24,(conceptPanel.clientHeight-90)*800/680);
    cropCanvas.style.width=`${width}px`;cropCanvas.style.height=`${width*680/800}px`;return;
  }
  const centerZ=(headFrame.min[2]+headFrame.max[2])/2;
  const low=new THREE.Vector3(0,headFrame.min[1],centerZ).project(camera);
  const high=new THREE.Vector3(0,headFrame.max[1],centerZ).project(camera);
  const pixels=Math.abs(high.y-low.y)*runtimeSurface.clientHeight/2;
  cropCanvas.style.height=`${pixels}px`;cropCanvas.style.width=`${pixels*111/118}px`;
}
function render(){if(renderSuppressed)return;renderer.render(scene,camera);updateComparisonScale();const info=renderer.info;$('#metrics').textContent=`${info.render.triangles.toLocaleString()} triangles · ${info.render.calls} draws · ${renderer.domElement.width} × ${renderer.domElement.height}`;}
function resize(){const w=runtimeSurface.clientWidth,h=runtimeSurface.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(ready)setCamera(selectedCamera);else render();}
function visibleBounds(name:CameraName){
  if((name==='face'||(name==='reference'&&comparison))&&loaded.some(item=>item.asset.kind==='head'))return new THREE.Box3(new THREE.Vector3(...headFrame.min),new THREE.Vector3(...headFrame.max));
  const roots=loaded.filter(item=>name==='bike'?item.asset.kind==='bike':name==='face'?item.asset.kind==='head':true);
  const box=new THREE.Box3(); for(const item of roots.length?roots:loaded)box.expandByObject(item.root);
  if(box.isEmpty())box.set(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1.8,.5));
  // For a full rider without a separate head, inspect the uppermost 22% of its bounds.
  if(name==='face'&&!loaded.some(item=>item.asset.kind==='head')){const height=box.max.y-box.min.y;box.min.y=box.max.y-height*.22;const c=box.getCenter(new THREE.Vector3());box.min.x=c.x-height*.13;box.max.x=c.x+height*.13;box.min.z=c.z-height*.13;box.max.z=c.z+height*.13;}
  return box;
}
function setCamera(name:CameraName){
  if(!['face','full','bike','reference'].includes(name))throw new Error(`Unknown camera: ${name}`);
  selectedCamera=name;orbitAngle=0;
  const box=visibleBounds(name), center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const verticalFov=THREE.MathUtils.degToRad(camera.fov),horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*camera.aspect);
  const distance=Math.max(size.y/(2*Math.tan(verticalFov/2)),Math.max(size.x,size.z)/(2*Math.tan(horizontalFov/2)))*1.35+size.z*.4;
  const direction = name==='reference'?new THREE.Vector3(-2.8,.08,1.7):name==='bike'?new THREE.Vector3(2.8,.8,3):new THREE.Vector3(.8,.15,3);
  presetOffset=direction.normalize().multiplyScalar(Math.max(distance,.25));
  controls.target.copy(center);camera.position.copy(center).add(presetOffset);controls.update();
  $('#camera-label').textContent={face:'Face study',full:'Full rider + bike',bike:'Bike study',reference:'Reference comparison'}[name];
  document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===name)));
  render();
}
function setComparison(value:boolean){
  comparison=value;viewport.classList.toggle('comparing',value);
  $('#compare').setAttribute('aria-pressed',String(value));
  if(value)selectedCamera='reference';
  resize();
}
function setOrbit(angle:number){if(!Number.isFinite(angle))throw new Error('Orbit angle must be finite');orbitAngle=angle;camera.position.copy(controls.target).add(presetOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle));controls.update();render();}
function setLighting(name:LightingName){
  if(name!=='neutral'&&name!=='garage')throw new Error(`Unknown light: ${name}`);
  lighting=name;const neutral=name==='neutral';scene.background=new THREE.Color(neutral?'#676e6a':'#252e29');
  hemi.intensity=neutral?1.8:1;key.color.set(neutral?'#ffffff':'#fff1d7');key.intensity=neutral?2.5:3.1;
  fill.color.set(neutral?'#ffffff':'#b9d5ea');fill.intensity=neutral?1.5:1.2;rim.intensity=neutral?.6:2;
  scene.environmentIntensity=neutral?.55:.45;
  document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.light===name)));render();
}
function updateTime(seconds:number){
  time=duration>0?((seconds%duration)+duration)%duration:Math.max(seconds,0);
  for(const item of loaded)item.mixer.setTime(time);
  suspension?.setAmount(suspensionEnvelope(activeClip,time));
  $<HTMLInputElement>('#timeline').value=String(time);
  $('#time').textContent=duration?`${time.toFixed(2)} / ${duration.toFixed(2)} s`:'No motion loaded';
}
function setPlaying(value:boolean){playing=value&&duration>0;$('#play').textContent=playing?'Pause':'Play';}
function setTime(seconds:number){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Time must be finite and non-negative');setPlaying(false);updateTime(seconds);render();}
function setClip(name:string){
  if(!loaded.some(item=>item.clips.some(clip=>clip.name===name)))throw new Error(`No exported clip: ${name}`);
  activeClip=name;duration=0;
  for(const item of loaded){item.mixer.stopAllAction();const clip=item.clips.find(c=>c.name===name);if(clip){item.mixer.clipAction(clip).reset().play();duration=Math.max(duration,clip.duration);}}
  $<HTMLInputElement>('#timeline').max=String(duration);$<HTMLInputElement>('#timeline').disabled=duration===0;$<HTMLButtonElement>('#play').disabled=duration===0;
  document.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name)));setTime(0);
}
function setFrame(frame:{time:number;orbit:number;lighting?:LightingName}){
  renderSuppressed=true;
  try{setTime(frame.time);setOrbit(frame.orbit);if(frame.lighting)setLighting(frame.lighting);}finally{renderSuppressed=false;}
  render();
}
function textureStorage(){
  const textures=new Map<THREE.Texture,Set<string>>();
  for(const item of loaded)item.root.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    for(const material of (Array.isArray(o.material)?o.material:[o.material])){
      for(const [slot,value] of Object.entries(material))if(value instanceof THREE.Texture){
        if(!textures.has(value))textures.set(value,new Set());textures.get(value)!.add(slot);
      }
    }
  });
  return {scope:'Active hero material textures only; compressed mip payload bytes, not driver residency. Excludes environment, shadows and inactive variants.',textures:[...textures].map(([t,slots])=>({name:t.name,slots:[...slots],format:t.format,colorSpace:t.colorSpace,compressed:t instanceof THREE.CompressedTexture,width:(t.image as {width?:number})?.width??null,height:(t.image as {height?:number})?.height??null,mips:t.mipmaps.length,compressedPayloadBytes:t instanceof THREE.CompressedTexture?t.mipmaps.reduce((sum,mip)=>sum+(mip.data?.byteLength??0),0):null}))};
}
function diagnostics(){
  const sizes=renderer.getDrawingBufferSize(new THREE.Vector2());const sorted=[...frameTimes].sort((a,b)=>a-b);
  return {ready,error,quality,textureStorage:textureStorage(),suspension:suspension?.getDiagnostics()??null,qualitySelection:requestedQuality==='desktop'||requestedQuality==='mobile'?'query':'pointer capability',grounding,shadow:{target:key.target.position.toArray(),normalBias:key.shadow.normalBias,bias:key.shadow.bias,near:key.shadow.camera.near,far:key.shadow.camera.far,width:key.shadow.camera.right-key.shadow.camera.left,mapSize:key.shadow.mapSize.toArray()},comparison: {enabled:comparison,mode:catalog?.assets.some(asset=>asset.kind==='rider')?'whole-scene':'head',headFrame,sourceCropUnmodified:true},stage:catalog?.stage??null,assets:loaded.map(item=>({id:item.asset.id,url:item.asset.url,kind:item.asset.kind,clips:item.clips.map(c=>({name:c.name,duration:c.duration}))})),camera:selectedCamera,lighting,time,duration,activeClip,playing,orbitAngle,cameraPosition:camera.position.toArray(),cameraTarget:controls.target.toArray(),render:{triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,width:sizes.x,height:sizes.y,dpr:renderer.getPixelRatio()},memory:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,note:'Object counts, not GPU byte residency'},loadMilliseconds,targetFps,frameSamples:frameTimes.length,p95FrameMilliseconds:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null,captureMode};
}
const api={get ready(){return ready;},get error(){return error;},setCamera,setComparison,setLighting,setTime,setOrbit,setFrame,setClip,setPlaying,getDiagnostics:diagnostics,get state(){return diagnostics();}};
Object.assign(window,{__garage:api,__heroGarage:api});
$('#cameras').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-camera]');if(button)setCamera(button.dataset.camera as CameraName);});
$('#lights').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-light]');if(button)setLighting(button.dataset.light as LightingName);});
$('#clips').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-clip]');if(button)setClip(button.dataset.clip!);});
$('#compare').addEventListener('click',()=>setComparison(!comparison));
$('#play').addEventListener('click',()=>setPlaying(!playing));
$('#timeline').addEventListener('input',event=>setTime(Number((event.target as HTMLInputElement).value)));
controls.addEventListener('change',()=>render());
new ResizeObserver(resize).observe(runtimeSurface);resize();setCamera('face');
let previousRender=performance.now();
renderer.setAnimationLoop(()=>{
  const now=performance.now(),delta=(now-previousRender)/1000;
  if(captureMode||delta<(1/targetFps)-.001)return;
  previousRender=now;
  if(ready){frameTimes.push(delta*1000);if(frameTimes.length>1800)frameTimes.shift();}
  if(playing)updateTime(time+delta);
  render();
});
async function boot(){
  const started=performance.now();
  try{
    const response=await fetch('/assets/catalog.json',{cache:'no-store'});if(!response.ok)throw new Error(`Asset catalog unavailable (HTTP ${response.status}). Export and register a real GLB in /assets/catalog.json.`);
    catalog=await response.json() as Catalog;
    if(catalog.version!==1||!Array.isArray(catalog.assets))throw new Error('Unsupported asset catalog. Expected version 1 and an assets array.');
    $('#stage').textContent=catalog.stage;$('#notes').textContent=(catalog.notes??[]).join('\n\n');
    const wholeScene=catalog.assets.some(asset=>asset.kind==='rider');
    if(wholeScene){$('#compare').textContent='Compare rider + bike';cropCanvas.setAttribute('aria-label','Unmodified crop of target 01 full rider and bike');}
    if(catalog.reference?.url){
      cropImage.onload=()=>{const whole=catalog!.assets.some(asset=>asset.kind==='rider');const crop=whole?{x:465,y:115,width:800,height:680}:headFrame.sourceCrop;cropCanvas.width=crop.width*4;cropCanvas.height=crop.height*4;const ctx=cropCanvas.getContext('2d')!;ctx.imageSmoothingEnabled=true;ctx.drawImage(cropImage,crop.x,crop.y,crop.width,crop.height,0,0,cropCanvas.width,cropCanvas.height);updateComparisonScale();};cropImage.src=catalog.reference.url;
      const img=$<HTMLImageElement>('#reference-image');img.src=catalog.reference.url;img.onerror=()=>{$('#reference-caption').textContent='Reference image unavailable. Check the catalog reference URL.';};$('#reference-caption').textContent=catalog.reference.label;$('#reference').classList.remove('hidden');}
    if(!catalog.assets.length)throw new Error('No exported hero asset is registered yet. This garage is ready for the first head GLB; character production remains open.');
    const ktx2=new KTX2Loader().setTranscoderPath('/decoders/basis/').detectSupport(renderer);
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
    for(const asset of catalog.assets){
      if(!asset.url||!asset.id)throw new Error('Every catalog asset requires an id and URL.');
      setStatus(`Loading ${asset.label}…`);
      const selectedAsset={...asset,url:quality==='mobile'&&asset.mobileUrl?asset.mobileUrl:asset.url};
      const gltf=await loader.loadAsync(selectedAsset.url);
      const root=gltf.scene;if(asset.position)root.position.fromArray(asset.position);if(asset.rotation)root.rotation.set(...asset.rotation);if(asset.scale!==undefined)root.scale.setScalar(asset.scale);
      root.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;if(asset.kind==='bike'&&object.name.endsWith('_blur'))object.visible=false;}});
      hero.add(root);loaded.push({asset:selectedAsset,root,mixer:new THREE.AnimationMixer(root),clips:gltf.animations});
    }
    // Set the assembled bike's lowest geometry on the floor without changing rider/bike alignment.
    const bikeRoot=loaded.find(item=>item.asset.kind==='bike')?.root;
    if(bikeRoot){const coarseMinY=new THREE.Box3().setFromObject(bikeRoot).min.y;const preciseMinY=new THREE.Box3().setFromObject(bikeRoot,true).min.y;hero.position.y-=preciseMinY;hero.updateMatrixWorld(true);grounding={coarseMinY,preciseMinY,assemblyOffsetY:hero.position.y,finalMinY:new THREE.Box3().setFromObject(bikeRoot,true).min.y};}
    const riderRoot=loaded.find(item=>item.asset.kind==='rider')?.root;
    if(bikeRoot&&riderRoot)suspension=createBikeSuspension(bikeRoot,riderRoot);
    fitAssetShadows();
    const motionOrder=['sit_cruise','forward_attack','hang_back','compression','extension','landing_absorption'];
    const clipNames=[...new Set(loaded.flatMap(item=>item.clips.map(c=>c.name)))].sort((a,b)=>{const rank=(name:string)=>motionOrder.includes(name)?motionOrder.indexOf(name):motionOrder.length;return rank(a)-rank(b)||a.localeCompare(b);});
    for(const name of clipNames){const button=document.createElement('button');button.dataset.clip=name;button.textContent=({sit_cruise:'Seated neutral',forward_attack:'Forward rise',hang_back:'Rearward shift',compression:'Compression',extension:'Extension',landing_absorption:'Landing absorption'} as Record<string,string>)[name]??name.replaceAll('_',' ');button.setAttribute('aria-pressed','false');$('#clips').append(button);}
    $('#motion-note').textContent=clipNames.length?'Authored rider clips; compression and landing include a kinematic suspension preview.':'No authored motion in this export. Orbit inspects geometry; motion acceptance remains open.';
    if(clipNames.length)setClip(clipNames.includes('sit_cruise')?'sit_cruise':clipNames[0]);
    $('#asset-label').textContent=loaded.map(item=>item.asset.label).join(' + ');
    $<HTMLButtonElement>('[data-camera="bike"]').disabled=!loaded.some(item=>item.asset.kind==='bike');
    setStatus('');loadMilliseconds=performance.now()-started;ready=true;setCamera(loaded.some(item=>item.asset.kind==='rider')?'full':'face');render();
  }catch(cause){error=cause instanceof Error?cause.message:String(cause);loadMilliseconds=performance.now()-started;setStatus(error,true);$('#stage').textContent=catalog?.stage??'Asset unavailable';$('#motion-note').textContent='No playable motion available.';render();}
}
void boot();
