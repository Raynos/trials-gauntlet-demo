/* global window, document, performance, navigator, location, screen, getComputedStyle, setTimeout, clearTimeout, console */
/**
 * Installed debug WebView only. No imports, navigation, browser launch or build.
 * Compose the async bridge body as: this file +
 * `\nreturn await window.__trialsNativeCapabilitiesProbe({sections:["capabilities","tracks"]});`
 * For Android CDP, start the promise without awaiting it, then poll
 * window.__trialsNativeCapabilitiesResult (a complete matrix can exceed 60 seconds).
 * Use a task-owned simulator: real garage UI persists selections. Effective bike,
 * outfit and last-track choices are restored; absent defaults may become explicit.
 */
window.__trialsNativeCapabilitiesProbe = async function (options = {}) {
  const sections = options.sections ?? ['capabilities', 'touch', 'tracks', 'garage', 'notices'];
  const timeoutMs = options.timeoutMs ?? 20000;
  const expectedOutfits = options.outfits ?? ['street-mustard', 'street-openface', 'race-bluewhite', 'street-charcoal', 'race-charcoalyellow'];
  const expectedBikes = options.bikes ?? ['rookie', 'pro'];
  const report = { schema: 1, startedAt: new Date().toISOString(), sections, pass: false, failures: [], warnings: [], tracks: [], outfits: [], bikes: [], requests: [], exceptions: [], consoleErrors: [] };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (label, predicate) => {
    const end = performance.now() + timeoutMs;
    do { if (predicate()) return; await sleep(50); } while (performance.now() < end);
    throw new Error(`Timed out: ${label}`);
  };
  const bounded = async (label, promise) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}; underlying load was not cancelled`)), timeoutMs); })]); }
    finally { clearTimeout(timer); }
  };
  const failure = (section, message) => report.failures.push({ section, message: String(message) });
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const opacity = el => {
    let value = 1;
    for (let e = el; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      value *= Number(style.opacity);
    }
    return value;
  };
  const live = el => el && el.closest('.live') && opacity(el) >= 0.5;
  const storage = () => {
    const entries = {};
    try {
      for (const key of ['trials.bikeClass', 'trials.riderOutfit', 'trials.riderModel', 'trials.lastTrack', 'trials.onboarded', 'trials.quality', 'trials.heldTier']) entries[key] = window.localStorage.getItem(key);
    } catch (error) { entries.error = String(error); }
    return entries;
  };
  const h = window.__trials;
  let original;
  let changedGarage = false;
  let changedTrackChoice = false;
  let stage = 'boot';
  const fetchOriginal = window.fetch;
  const consoleErrorOriginal = console.error;
  const onError = event => report.exceptions.push({ stage, type: 'error', message: String(event.message ?? event.target?.src ?? event.target?.href ?? 'resource error') });
  const onRejection = event => report.exceptions.push({ stage, type: 'unhandledrejection', message: String(event.reason?.stack ?? event.reason) });
  const onLost = () => report.exceptions.push({ stage, type: 'webglcontextlost', message: 'Game WebGL context lost' });
  const observedFetch = async function (...args) {
    const row = { stage, url: String(args[0]?.url ?? args[0]), startedAtMs: performance.now() };
    report.requests.push(row);
    try {
      const response = await fetchOriginal.apply(this, args);
      row.status = response.status;
      row.ok = response.ok;
      return response;
    } catch (error) { row.error = String(error); throw error; }
    finally { row.durationMs = performance.now() - row.startedAtMs; }
  };
  const observedConsoleError = function (...args) {
    report.consoleErrors.push({ stage, message: args.map(x => String(x)).join(' ') });
    consoleErrorOriginal.apply(this, args);
  };
  let canvas;
  const renderSample = () => {
    const before = h.renderedFrames();
    h.render(true);
    const info = h.info();
    return { trackId: info.trackId, bike: info.bike, phase: h.phase(), framesBefore: before, framesAfter: h.renderedFrames(), frameAdvanced: h.renderedFrames() > before, render: info.render };
  };
  // Static garage views intentionally skip unchanged frames; retain that fact in
  // frameAdvanced instead of treating a cached valid frame as a missing model.
  const validRender = sample => sample.framesAfter > 0 && sample.render?.calls > 0 && sample.render?.tris > 0 && !canvas?.getContext('webgl2')?.isContextLost();
  const select = async (kind, id) => {
    const selector = kind === 'outfit' ? `.outfit-button[data-outfit="${id}"]` : `.bike-chip[data-bike="${id}"]`;
    const button = document.querySelector(selector);
    if (!button) throw new Error(`Missing ${kind} button: ${id}`);
    await wait(`${kind} ${id} is live`, () => { h.app.frame(); return live(button); });
    button.click();
    await wait(`${kind} ${id} selected`, () => {
      const info = h.info();
      if (kind === 'outfit' && document.querySelector('.outfit-current')?.textContent?.startsWith('Could not load')) throw new Error(document.querySelector('.outfit-current').textContent);
      return button.getAttribute('aria-pressed') === 'true' && button.getAttribute('aria-busy') !== 'true' && (kind === 'outfit' ? info.render?.riderOutfit === id : info.bike === id);
    });
    await sleep(100);
    const sample = renderSample();
    return { id, interaction: 'HTMLElement.click through real garage listener', selected: button.getAttribute('aria-pressed'), status: kind === 'outfit' ? document.querySelector('.outfit-current')?.textContent : null, ...sample };
  };
  try {
    await wait('normal app boot', () => h?.ready && h.app && !document.getElementById('loader'));
    if (h.info().harness) throw new Error('Use the normal installed game, not ?harness=1');
    if (['run', 'replay', 'reviewer'].includes(h.app.screen())) throw new Error('Start from a front screen; this probe must not interrupt a live run or replay');
    original = { info: h.info(), screen: h.app.screen(), snapshot: h.snapshot(), storage: storage() };
    canvas = document.querySelector('canvas');
    window.fetch = observedFetch;
    console.error = observedConsoleError;
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    canvas?.addEventListener('webglcontextlost', onLost);
    report.boot = { origin: location.origin, url: location.href, nativePlatform: window.Capacitor?.getPlatform?.() ?? null, info: original.info, serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller) };

    if (sections.includes('capabilities')) {
      stage = 'capabilities';
      const gl = canvas?.getContext('webgl2');
      const capabilities = { webgl2: Boolean(gl), webglVersion: gl?.getParameter(gl.VERSION), shadingLanguage: gl?.getParameter(gl.SHADING_LANGUAGE_VERSION), maxTextureSize: gl?.getParameter(gl.MAX_TEXTURE_SIZE), contextLost: gl?.isContextLost(), crossOriginIsolated: window.crossOriginIsolated, secureContext: window.isSecureContext, audioContext: Boolean(window.AudioContext ?? window.webkitAudioContext), audioWorkletNode: typeof window.AudioWorkletNode === 'function', audioWorklet: false };
      let audio;
      try {
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        if (AudioContext) { audio = new AudioContext(); capabilities.audioWorklet = Boolean(audio.audioWorklet); capabilities.audioState = audio.state; }
      } catch (error) { capabilities.audioError = String(error); }
      finally { if (audio) await audio.close(); }
      report.capabilities = capabilities;
      if (!capabilities.webgl2 || capabilities.contextLost) failure(stage, 'A live game WebGL2 context is required');
      if (!capabilities.audioContext || !capabilities.audioWorklet) failure(stage, 'AudioContext/AudioWorklet capability unavailable');
      if (options.requireCrossOriginIsolated && !capabilities.crossOriginIsolated) failure(stage, 'Requested cross-origin isolation unavailable');
    }

    if (sections.includes('touch')) {
      stage = 'touch';
      const last = original.storage['trials.lastTrack'];
      const track = h.listTracks().includes(last) ? last : original.info.trackId;
      changedTrackChoice = true;
      h.app.play(track);
      await bounded('touch track assets', h.loadTrack(track));
      h.skipCountdown();
      await sleep(700);
      h.app.frame();
      const inset = document.createElement('div');
      inset.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.append(inset);
      const css = getComputedStyle(inset);
      const safe = { top: parseFloat(css.paddingTop), right: parseFloat(css.paddingRight), bottom: parseFloat(css.paddingBottom), left: parseFloat(css.paddingLeft) };
      inset.remove();
      const vv = window.visualViewport;
      const geometry = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, orientation: screen.orientation?.type, maxTouchPoints: navigator.maxTouchPoints, coarsePointer: window.matchMedia('(pointer:coarse)').matches, pointerEvent: typeof window.PointerEvent === 'function', safeArea: safe, visualViewport: vv ? { width: vv.width, height: vv.height, scale: vv.scale, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop } : null, app: rect(document.querySelector('#app')), canvas: { bounds: rect(canvas), width: canvas?.width, height: canvas?.height }, layerClass: document.querySelector('.touch-layer')?.className, controls: [], onboardingVisible: /GOT IT/i.test(document.body.innerText) };
      for (const selector of ['.tz-back', '.tz-fwd', '.tz-brake', '.tz-throttle', '.tz-pause', '.tz-restart']) {
        const el = document.querySelector(selector);
        const r = rect(el);
        const x = r ? r.x + r.width / 2 : -1;
        const y = r ? r.y + r.height / 2 : -1;
        const hit = document.elementFromPoint(x, y);
        const key = el?.querySelector('.tz-key');
        const keyRect = rect(key);
        const insideSafe = b => b && b.x >= safe.left - 1 && b.y >= safe.top - 1 && b.right <= window.innerWidth - safe.right + 1 && b.bottom <= window.innerHeight - safe.bottom + 1;
        geometry.controls.push({ selector, bounds: r, visualKeyBounds: keyRect, opacity: el ? opacity(el) : 0, pointerEvents: el ? getComputedStyle(el).pointerEvents : null, hitAtCenter: Boolean(el && (hit === el || el.contains(hit))), hitElement: hit?.className ?? null, visualInsideSafeArea: insideSafe(keyRect ?? r) });
      }
      report.touch = geometry;
      if (geometry.controls.some(c => !c.bounds || c.bounds.width <= 0 || c.bounds.height <= 0)) failure(stage, 'Missing or zero-size touch controls');
      if (geometry.coarsePointer && geometry.controls.some(c => c.opacity < 0.5 || !c.hitAtCenter)) failure(stage, 'Touch controls are hidden or obstructed at their centers; inspect onboarding/overlay state');
      if (geometry.controls.some(c => !c.visualInsideSafeArea)) failure(stage, 'A touch affordance extends outside the reported safe area');
      h.app.quit();
    }

    if (sections.includes('tracks')) {
      stage = 'tracks';
      h.app.goto('tracks');
      const all = h.listTracks();
      const ids = options.tracks ?? all;
      report.trackCoverage = { registered: all, requested: ids, scope: options.tracks ? 'explicit subset' : 'every registered track, including fixtures and labs' };
      for (const id of ids) {
        stage = `track:${id}`;
        const start = performance.now();
        const accepted = await bounded(stage, h.loadTrack(id));
        const sample = renderSample();
        const row = { id, accepted, durationMs: performance.now() - start, ...sample };
        row.pass = accepted === true && sample.trackId === id && sample.frameAdvanced && validRender(sample);
        report.tracks.push(row);
        if (!row.pass) failure(stage, 'Track did not load and draw a nonempty frame');
        await sleep(25);
      }
    }

    if (sections.includes('garage')) {
      stage = 'garage';
      h.app.goto('garage');
      report.garageCoverage = { availableOutfits: [...document.querySelectorAll('.outfit-button')].map(e => e.dataset.outfit), requestedOutfits: expectedOutfits, availableBikes: [...document.querySelectorAll('.bike-chip')].map(e => e.dataset.bike), requestedBikes: expectedBikes };
      changedGarage = true;
      for (const id of expectedOutfits) {
        stage = `outfit:${id}`;
        try {
          const row = await select('outfit', id);
          row.pass = validRender(row) && row.render?.riderOutfit === id && !row.render?.heroDoc?.includes('rider-proc');
          report.outfits.push(row);
          if (!row.pass) failure(stage, 'Requested authored outfit did not produce a rendered frame');
        } catch (error) { report.outfits.push({ id, pass: false, error: String(error) }); failure(stage, error); }
      }
      for (const id of expectedBikes) {
        stage = `bike:${id}`;
        try {
          const row = await select('bike', id);
          row.pass = validRender(row) && row.bike === id && !row.render?.heroDoc?.includes('bike-proc');
          report.bikes.push(row);
          if (!row.pass) failure(stage, 'Requested bike did not produce an authored rendered frame');
        } catch (error) { report.bikes.push({ id, pass: false, error: String(error) }); failure(stage, error); }
      }
    }

    if (sections.includes('notices')) {
      stage = 'notices';
      h.app.goto('credits');
      const details = document.querySelector('.native-notices');
      if (!details) {
        report.notices = { present: false, pass: false };
        if (options.requireNotices !== false) failure(stage, 'Native licence expander is absent');
      } else {
        const summary = details.querySelector('summary');
        const pre = details.querySelector('pre');
        await wait('licence summary visible', () => opacity(summary) >= 0.5);
        const wasOpen = details.open;
        if (!wasOpen) summary.click();
        await wait('licence file loaded', () => pre.textContent && !pre.textContent.startsWith('Loading'));
        const text = pre.textContent;
        const tokens = options.expectedNoticeTokens ?? ['Three.js', 'Capacitor'];
        const missingTokens = tokens.filter(token => !text.toLowerCase().includes(token.toLowerCase()));
        const style = getComputedStyle(pre);
        report.notices = { present: true, expanded: details.open, characters: text.length, missingTokens, summaryBounds: rect(summary), textBounds: rect(pre), whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, fontSize: style.fontSize, horizontalOverflow: pre.scrollWidth > pre.clientWidth + 1, interaction: 'summary.click, real toggle listener and fetch', pass: details.open && text.length > 200 && !text.startsWith('Could not load') && missingTokens.length === 0 && pre.scrollWidth <= pre.clientWidth + 1 };
        if (!wasOpen) summary.click();
        if (!report.notices.pass) failure(stage, 'Licence text absent, incomplete, failed, or horizontally clipped');
      }
    }
  } catch (error) {
    failure(stage, error?.stack ?? error);
  } finally {
    stage = 'restore';
    if (original) {
      try {
        if (changedGarage) {
          h.app.goto('garage');
          if (original.info.render?.riderOutfit) await select('outfit', original.info.render.riderOutfit);
          else failure(stage, 'Original rider was procedural; no UI hook can restore that model choice');
          await select('bike', original.info.bike);
        }
        if (changedTrackChoice && original.storage['trials.lastTrack'] && h.listTracks().includes(original.storage['trials.lastTrack'])) {
          h.app.play(original.storage['trials.lastTrack']);
          h.app.quit();
        }
        await bounded('restore original track', h.loadTrack(original.info.trackId, original.info.seed));
        h.setBike(original.info.bike);
        h.restore(original.snapshot);
        h.app.goto(original.screen);
        const after = storage();
        const changedKeys = Object.keys(original.storage).filter(k => original.storage[k] !== after[k]).map(key => ({ key, before: original.storage[key], after: after[key] }));
        const info = h.info();
        report.restoration = { screen: h.app.screen(), track: info.trackId, bike: info.bike, riderOutfit: info.render?.riderOutfit, effectiveRestored: h.app.screen() === original.screen && info.trackId === original.info.trackId && info.bike === original.info.bike && info.render?.riderOutfit === original.info.render?.riderOutfit, changedMirrorKeys: changedKeys, exactNativeSaveRestoration: 'not asserted: UI saves native state; browser mirror is diagnostic only' };
        if (!report.restoration.effectiveRestored) failure(stage, 'Original screen/track/bike/outfit did not restore');
        if (changedKeys.length) report.warnings.push('Some saved keys changed; absent defaults can become explicit choices. See restoration.changedMirrorKeys.');
      } catch (error) { failure(stage, error?.stack ?? error); }
    }
    if (window.fetch === observedFetch) window.fetch = fetchOriginal;
    if (console.error === observedConsoleError) console.error = consoleErrorOriginal;
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    canvas?.removeEventListener('webglcontextlost', onLost);
  }
  report.networkFailures = report.requests.filter(row => row.error || row.ok === false);
  for (const row of report.networkFailures) failure(row.stage, `Resource fetch failed: ${row.url} (${row.status ?? row.error})`);
  for (const row of report.exceptions) failure(row.stage, `${row.type}: ${row.message}`);
  for (const row of report.consoleErrors) failure(row.stage, `console.error: ${row.message}`);
  report.limitations = ['Track coverage is initial scene load/render smoke, not traversal or a complete texture/asset inventory.', 'Successful requests, GL draw calls and selection state do not prove correct visual appearance. Judge played clips separately.', 'Audio capability is API availability; audible output and worklet processing were not exercised.', 'Touch geometry and programmatic clicks do not prove physical touch, multitouch or system gesture behavior.', 'Cached resources and failures swallowed without console/fetch/error signals may not appear in this report.'];
  report.finishedAt = new Date().toISOString();
  report.pass = report.failures.length === 0;
  window.__trialsNativeCapabilitiesResult = report;
  return report;
};
