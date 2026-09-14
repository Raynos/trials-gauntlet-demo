/**
 * All HUD / menu / touch-layer CSS, injected once. DOM text stays crisp at
 * any DPR; sizes are rem-based with `html { font-size: clamp(...) }` so the
 * same layout reads on a 5.4" phone in landscape and a 27" monitor.
 */
export const UI_CSS = /* css */ `
:root {
  --ink: #f3f5f8;
  --ink-dim: rgba(243,245,248,.62);
  --slab: rgba(9,11,15,.72);
  --slab-2: rgba(9,11,15,.88);
  --line: rgba(255,255,255,.14);
  --amber: #ffb020;
  --green: #4ae37f;
  --red: #ff3d3d;
  --blue: #5aa9ff;
  --plat: #d7e8ff; --gold: #ffcf4a; --silver: #cfd6df; --bronze: #d29a5a;
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
  --font: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
html { font-size: clamp(13px, 1.25vw + 4px, 18px); }
#ui, #ui * { box-sizing: border-box; }
#ui {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  font-family: var(--font); color: var(--ink);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
}
#ui button { font: inherit; color: inherit; }

/* ---- top band ------------------------------------------------------- */
.hud { position: absolute; inset: 0; opacity: 1; transition: opacity .25s ease; }
.hud.hidden { opacity: 0; }
.hud-top {
  position: absolute; left: 0; right: 0; top: 0;
  padding: calc(.9rem + var(--sat)) calc(1.1rem + var(--sar)) 0 calc(1.1rem + var(--sal));
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 1rem;
}
.hud-left { display: flex; flex-direction: column; align-items: flex-start; gap: .3rem; min-width: 0; }
.hud-track { font-weight: 700; font-size: 1rem; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; padding: .3rem .7rem; background: var(--slab); border: 1px solid var(--line); border-radius: .4rem; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hud-track b { color: var(--amber); font-weight: 800; text-transform: uppercase; font-size: .8em; letter-spacing: .12em; margin-right: .5em; }
.hud-device { font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink); opacity: 0; transition: opacity .3s; display: inline-flex; align-items: center; gap: .4em; padding: .2rem .6rem; background: var(--slab); border-radius: .4rem; }
.hud-device.show { opacity: 1; }
.hud-device i { width: .55em; height: .55em; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); }

.hud-center { display: flex; align-items: center; gap: .6rem; background: var(--slab); border: 1px solid var(--line); border-radius: .5rem; padding: .3rem .9rem .3rem 1rem; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hud-timer { font-size: 2.35rem; line-height: 1; font-weight: 800; font-style: italic; letter-spacing: .01em; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; text-shadow: 0 2px 0 rgba(0,0,0,.55); min-width: 7.2ch; text-align: center; }
.hud-timer.frozen { color: var(--green); }
.hud-timer .ms { font-size: .58em; font-weight: 700; opacity: .85; }
.hud-faults { display: inline-flex; align-items: baseline; gap: .3em; padding-left: .7rem; border-left: 1px solid var(--line); font-weight: 800; font-size: 1.55rem; line-height: 1; font-variant-numeric: tabular-nums; }
.hud-faults .x { color: var(--red); font-size: .8em; font-weight: 900; }
.hud-faults.flip .n { color: var(--amber); transform: scale(1.35); }
.hud-faults .n { display: inline-block; transform-origin: 50% 70%; transition: transform .12s ease-out, color .12s; }
.hud-delta { position: absolute; left: 50%; transform: translateX(-50%); top: calc(3.9rem + var(--sat)); font-size: .95rem; font-weight: 700; font-variant-numeric: tabular-nums; opacity: 0; transition: opacity .3s; }
.hud-delta.show { opacity: 1; }
.hud-delta.ahead { color: var(--green); } .hud-delta.behind { color: var(--red); }

.hud-right { display: flex; justify-content: flex-end; min-width: 0; }
.strip { position: relative; width: min(24vw, 22rem); height: 2rem; margin-top: .35rem; }
.strip .bar { position: absolute; left: 0; right: 0; top: .95rem; height: .5rem; background: rgba(0,0,0,.6); border: 1px solid var(--line); border-radius: .25rem; overflow: hidden; }
.strip .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, #ff8a1f, var(--amber)); }
.strip .mark { position: absolute; top: .55rem; width: 2px; height: 1.3rem; margin-left: -1px; background: rgba(255,255,255,.45); }
.strip .mark.done { background: var(--green); box-shadow: 0 0 5px var(--green); }
.strip .finish { position: absolute; right: -1px; top: .35rem; width: .7rem; height: 1.7rem; background:
  repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / .35rem .35rem; border-radius: 2px; }
.strip .pin { position: absolute; top: .05rem; width: .9rem; height: .9rem; margin-left: -.45rem; background: var(--amber); border: 2px solid #1a1206; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 1px 3px rgba(0,0,0,.6); }

/* ---- kinetic banners ------------------------------------------------ */
.banners { position: absolute; left: 0; right: 0; top: 30%; height: 0; display: flex; justify-content: center; pointer-events: none; }
.banner { position: absolute; top: 0; transform: translate(-50%, -50%); left: 50%; white-space: nowrap; font-weight: 900; font-style: italic; letter-spacing: .02em; text-transform: uppercase; will-change: transform, opacity; opacity: 0; }
.banner.count { font-size: 9rem; color: var(--amber); text-shadow: 0 .1em 0 rgba(0,0,0,.55), 0 0 .3em rgba(255,176,32,.4); }
.banner.go { font-size: 11rem; color: #fff; text-shadow: 0 .08em 0 rgba(0,0,0,.6); }
.banner.crash { font-size: 3rem; color: var(--red); background: var(--slab-2); padding: .25em .9em; border-radius: .12em; text-shadow: 0 2px 0 rgba(0,0,0,.6); letter-spacing: .06em; }
.banner.cp { font-size: 1.6rem; color: var(--green); letter-spacing: .3em; padding: .3em 1.4em; border-top: 2px solid var(--green); border-bottom: 2px solid var(--green); }
.banner.finish { font-size: 4.5rem; color: #fff; background: linear-gradient(90deg, transparent, rgba(0,0,0,.75) 20%, rgba(0,0,0,.75) 80%, transparent); padding: .15em 2em; letter-spacing: .08em; }
.banner.ready { font-size: 4rem; color: var(--amber); }

/* ---- hints ---------------------------------------------------------- */
.hints { position: absolute; left: 50%; bottom: calc(1rem + var(--sab)); transform: translateX(-50%); display: flex; gap: 1.2rem; padding: .45rem 1rem; background: var(--slab); border: 1px solid var(--line); border-radius: .5rem; font-size: .9rem; white-space: nowrap; opacity: 0; transition: opacity .3s; }
.hints.show { opacity: 1; }
.hints kbd { font-family: var(--font); font-weight: 800; background: rgba(255,255,255,.12); border: 1px solid var(--line); border-bottom-width: 2px; padding: .05em .45em; border-radius: .25em; margin-right: .35em; font-size: .9em; }

/* ---- results -------------------------------------------------------- */
.results { position: absolute; top: 50%; left: 62%; transform: translate(-50%, -50%) scale(.96); width: min(30rem, 92vw); max-height: calc(100% - 2rem); background: var(--slab-2); border: 1px solid var(--line); border-radius: .8rem; padding: 1.4rem 1.6rem 1.2rem; opacity: 0; pointer-events: none; transition: opacity .25s, transform .25s; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.results.show { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
.results h2 { margin: 0 0 .2rem; font-size: 1rem; letter-spacing: .3em; text-transform: uppercase; color: var(--ink-dim); font-weight: 700; }
.results .headline { display: flex; align-items: baseline; gap: 1.2rem; flex-wrap: wrap; }
.results .time { font-size: 3rem; font-weight: 900; font-style: italic; font-variant-numeric: tabular-nums; line-height: 1; }
.results .faults { font-size: 1.3rem; font-weight: 800; }
.results .faults span { color: var(--red); }
.results .pb { color: var(--green); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: .85rem; min-height: 1.2em; margin-top: .3rem; }
.results .medals { display: flex; gap: .7rem; margin: 1rem 0 1.1rem; }
.results .medal { flex: 1; text-align: center; padding: .55rem .2rem .45rem; border-radius: .5rem; border: 1px solid var(--line); opacity: .35; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: .75rem; }
.results .medal i { display: block; width: 1.6rem; height: 1.6rem; margin: 0 auto .35rem; border-radius: 50%; background: currentColor; box-shadow: inset 0 -3px 0 rgba(0,0,0,.35); }
.results .medal.platinum { color: var(--plat); } .results .medal.gold { color: var(--gold); } .results .medal.silver { color: var(--silver); } .results .medal.bronze { color: var(--bronze); }
.results .medal.earned { opacity: 1; border-color: currentColor; background: rgba(255,255,255,.06); box-shadow: 0 0 22px -6px currentColor; }
.results .medal small { display: block; color: var(--ink-dim); letter-spacing: 0; text-transform: none; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: .2rem; }
.results .actions { display: flex; gap: .6rem; }

/* ---- menus ---------------------------------------------------------- */
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(120% 100% at 30% 40%, rgba(8,10,14,.55), rgba(8,10,14,.92)); opacity: 0; pointer-events: none; transition: opacity .2s; padding: calc(1rem + var(--sat)) calc(1rem + var(--sar)) calc(1rem + var(--sab)) calc(1rem + var(--sal)); }
.overlay.show { opacity: 1; pointer-events: auto; }
.panel { width: min(46rem, 100%); max-height: 100%; overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.settings { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; justify-content: flex-end; }
.title { font-size: 3.4rem; font-weight: 900; font-style: italic; letter-spacing: -.01em; line-height: .95; margin: 0; text-transform: uppercase; }
.title small { display: block; font-size: .32em; letter-spacing: .42em; color: var(--amber); font-style: normal; font-weight: 800; margin-bottom: .3em; }
.sub { color: var(--ink-dim); margin: .4rem 0 .6rem; font-size: .95rem; max-width: 34rem; }
.tier { margin: 1rem 0 .4rem; font-size: .75rem; letter-spacing: .32em; text-transform: uppercase; color: var(--amber); font-weight: 800; }
.tracks { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: .5rem; }
.track { display: flex; flex-direction: column; gap: .25rem; text-align: left; padding: .7rem .85rem; background: rgba(255,255,255,.05); border: 1px solid var(--line); border-radius: .5rem; cursor: pointer; min-height: 44px; }
.track:hover, .track:focus-visible { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.35); outline: none; }
.track .name { font-weight: 800; font-size: 1.05rem; }
.track .best { display: flex; justify-content: space-between; font-size: .8rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.track .best b { font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.track .best b.gold { color: var(--gold); } .track .best b.platinum { color: var(--plat); } .track .best b.silver { color: var(--silver); } .track .best b.bronze { color: var(--bronze); }
.row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; margin-top: 1.2rem; }
.btn { min-height: 44px; min-width: 44px; padding: .55rem 1.2rem; border-radius: .5rem; border: 1px solid var(--line); background: rgba(255,255,255,.08); color: var(--ink); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; font-size: .95rem; }
.btn:hover, .btn:focus-visible { background: rgba(255,255,255,.16); outline: none; }
.btn.primary { background: var(--amber); color: #1a1206; border-color: transparent; }
.btn.primary:hover { background: #ffc24d; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: .5rem; overflow: hidden; }
.seg button { min-height: 44px; padding: 0 .9rem; background: transparent; border: 0; border-right: 1px solid var(--line); cursor: pointer; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: .8rem; color: var(--ink-dim); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: rgba(255,255,255,.14); color: var(--ink); }
.lbl { font-size: .75rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-dim); margin-right: .2rem; }
.pause-title { font-size: 2.2rem; font-weight: 900; font-style: italic; text-transform: uppercase; margin: 0 0 .6rem; }

/* ---- touch layer ------------------------------------------------------ */
.touch-layer { position: absolute; inset: 0; pointer-events: none; touch-action: none; -webkit-user-select: none; user-select: none; }
.touch-layer.on { pointer-events: auto; }
.tz { position: absolute; display: flex; align-items: flex-end; justify-content: center; padding-bottom: calc(1.4rem + var(--sab)); font-family: var(--font); font-weight: 800; letter-spacing: .2em; font-size: .85rem; color: rgba(255,255,255,.55); opacity: 0; transition: opacity .25s, background .08s; border: 0 solid rgba(255,255,255,.12); }
.touch-layer.visible .tz { opacity: .35; }
.touch-layer.visible .tz.held { opacity: .8; background: rgba(255,255,255,.07); }
.tz-back { left: 0; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-fwd { left: 25%; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-brake { left: 50%; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-throttle { left: 75%; top: 0; bottom: 0; width: 25%; }
.tz-brake span { color: rgba(255,90,90,.85); } .tz-throttle span { color: rgba(90,255,140,.85); }
.tz-btn { top: calc(.7rem + var(--sat)); width: 56px; height: 44px; align-items: center; padding: 0; border-radius: .5rem; background: var(--slab); border: 1px solid var(--line); font-size: 1.2rem; letter-spacing: 0; opacity: 0; }
.touch-layer.on.visible .tz-btn { opacity: .9; }
.tz-btn.held { background: rgba(255,255,255,.25); }
.tz-restart { right: calc(.8rem + var(--sar)); }
.tz-pause { left: calc(.8rem + var(--sal)); }
.hud.touch .hud-top { padding-left: calc(4.8rem + var(--sal)); padding-right: calc(4.8rem + var(--sar)); }
.hud.touch .hints { bottom: calc(3.6rem + var(--sab)); }

/* ---- landscape prompt ------------------------------------------------- */
.rotate { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; background: #0b0d10; color: var(--ink); text-align: center; padding: 2rem; font-size: 1.2rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; pointer-events: auto; }
.rotate i { display: block; width: 3rem; height: 5rem; border: 3px solid var(--amber); border-radius: .5rem; animation: rot 1.6s ease-in-out infinite; }
@keyframes rot { 0%, 20% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
@media (orientation: portrait) and (pointer: coarse) and (max-width: 900px) { .rotate.armed { display: flex; } }

/* Short landscape phones: compact header so the track grid is above the fold. */
@media (max-height: 500px) {
  .title { font-size: 2rem; }
  .title small { font-size: .4em; margin-bottom: .1em; }
  .sub { display: none; }
  .tier { margin: .6rem 0 .3rem; }
  .tracks { grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: .4rem; }
  .track { padding: .5rem .7rem; gap: .15rem; }
  .track .name { font-size: .95rem; }
  .overlay { padding-top: calc(.6rem + var(--sat)); padding-bottom: calc(.6rem + var(--sab)); }
}
@media (max-width: 720px) {
  .hud-timer { font-size: 1.9rem; }
  .hud-faults { font-size: 1.25rem; }
  .strip { width: 26vw; }
  .banner.count { font-size: 6.5rem; } .banner.go { font-size: 8rem; } .banner.finish { font-size: 3rem; }
  .results { left: 50%; }
}
`;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'ui-css';
  el.textContent = UI_CSS;
  document.head.appendChild(el);
}
