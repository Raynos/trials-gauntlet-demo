/**
 * Design tokens + every screen's CSS (title, menu, track select, settings,
 * pause, results, HUD, touch layer), injected once. DOM text stays crisp at
 * any DPR; sizes are rem-based with `html { font-size: clamp(...) }` so the
 * same layout reads on a 5.4" phone in landscape and a 27" monitor.
 *
 * Tokens (docs/design/game.md §10): colour `--amber/--ink/--slab…`, spacing
 * `--s1…--s6` = 4/8/12/16/24/40, radii `--r1…--r3` = 6/10/16, motion
 * `--t1/--t2/--t3` = 120/240/400 ms with one easing `--ease`.
 */
export const TOKENS_CSS = /* css */ `
@font-face { font-family: "Trials Display"; font-style: italic; font-weight: 900; font-display: swap; src: url(fonts/BarlowCondensed-BlackItalic.woff2) format("woff2"); }
@font-face { font-family: "Trials UI"; font-style: normal; font-weight: 500; font-display: swap; src: url(fonts/BarlowCondensed-Medium.woff2) format("woff2"); }
@font-face { font-family: "Trials UI"; font-style: normal; font-weight: 700; font-display: swap; src: url(fonts/BarlowCondensed-Bold.woff2) format("woff2"); }
:root {
  /* colour */
  --ink: #f3f5f8;
  --ink-dim: rgba(243,245,248,.62);
  --ink-mute: rgba(243,245,248,.38);
  --bg: #07080a;
  --slab: rgba(9,11,15,.84);
  --slab-2: rgba(9,11,15,.92);
  --slab-3: rgba(16,19,25,.96);
  --line: rgba(255,255,255,.18);
  --line-2: rgba(255,255,255,.08);
  --amber: #ffb020;
  --amber-2: #ff8a1f;
  --amber-ink: #1a1206;
  --green: #4ae37f;
  --red: #ff3d3d;
  --blue: #5aa9ff;
  --plat: #d7e8ff; --gold: #ffcf4a; --silver: #cfd6df; --bronze: #d29a5a;
  /* spacing 4/8/12/16/24/40 */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 40px;
  /* radii */
  --r1: 6px; --r2: 10px; --r3: 16px;
  /* motion: one easing, three durations */
  --ease: cubic-bezier(.2,.8,.2,1);
  --t1: 120ms; --t2: 240ms; --t3: 400ms;
  /* faces */
  --display: "Trials Display", "Barlow Condensed", "Arial Narrow", Impact, "Helvetica Neue", Arial, system-ui, sans-serif;
  --font: "Trials UI", "Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  /* Guaranteed-contrast text: 1 px dark outline in 8 directions + soft drop. Reads over pure white at DPR 1–3. */
  --outline: 0 0 1px #000, 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 6px rgba(0,0,0,.9);
  --outline-heavy: 0 0 2px #000, 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 .08em .25em rgba(0,0,0,.85);
  --plate: 0 0 0 1px rgba(0,0,0,.6), 0 2px 12px rgba(0,0,0,.45);
  /* amber bevel for the wordmark */
  --bevel: 0 1px 0 #ffd27a, 0 -1px 0 #9a5a00, 0 .04em .02em rgba(0,0,0,.55), 0 .09em .06em rgba(0,0,0,.45), 0 0 .35em rgba(255,176,32,.35), 0 0 1.2em rgba(255,138,31,.25);
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
  /* Viewport units go through these tokens (one place to redefine them). */
  --vw: 1vw; --vh: 1vh;
}
html { font-size: clamp(13px, calc(1.25 * var(--vw)) + 4px, 18px); }
/* The viewport cannot become a focus-driven scroll container; panels own scrolling. */
html, body { overflow: clip; }
#ui, #ui * { box-sizing: border-box; }
#ui {
  position: absolute; inset: 0; pointer-events: none; overflow: clip;
  font-family: var(--font); color: var(--ink); font-weight: 500;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none;
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
}
#ui button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
#ui button:focus { outline: none; }
/* No CSS transform, filter or animation ever touches the WebGL canvas: on iOS each one costs a full-canvas
   compositor copy per frame (PERF.md §0 — the garage read 24–30 fps at a 30 cap with nothing moving).
   The menu covers the canvas with its key art and the game stops rendering under it. */
#app.covered canvas { visibility: hidden; }
#app.dim::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: rgba(6,7,9,.16); }
`;

export const FRONT_CSS = /* css */ `
/* ---- shared front-end pieces ---------------------------------------- */
/* THE INVARIANT (docs/tasks/touch-navigation-invariant.md, src/ui/live.ts): nothing is hit-testable unless it is
   drawn at >= .5 opacity and has been for >= 150 ms. .show decides what is DRAWN (the fade); .live, which only
   live.ts toggles after the reveal has been observed drawn, decides what TAKES POINTERS. Every surface that owns
   tappables — screens, the pause overlay, the onboarding card, the results frame, the replay bar, the toast — is
   pointer-events: none (itself and, !important, every descendant) until .live. Hidden surfaces are also OUT of
   hit-testing and the accessibility tree: visibility: hidden (delayed until the fade-out ends). Opacity alone is
   never a visibility state. */
.screen, .overlay, .onboard, .results, .replay, .toast { pointer-events: none; }
.screen:not(.live) *, .overlay:not(.live) *, .onboard:not(.live) *, .results:not(.live) *, .replay:not(.live) *, .toast:not(.live) * { pointer-events: none !important; }
.screen.live, .overlay.live, .onboard.live, .results.live, .replay.live, .toast.live { pointer-events: auto; }
.screen { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease), visibility 0s; }
.overlay:not(.show), .onboard:not(.show), .results:not(.show), .replay:not(.show) { visibility: hidden; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show .rise { animation: rise var(--t2) var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.scrim { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 35%, rgba(6,7,9,.92)); }
.scrim.side { background: linear-gradient(90deg, rgba(6,7,9,.94) 0%, rgba(6,7,9,.82) 34%, rgba(6,7,9,.35) 62%, rgba(6,7,9,.2) 100%), linear-gradient(180deg, rgba(6,7,9,.35), transparent 30%, transparent 70%, rgba(6,7,9,.9)); }
/* Key art is mirrored so its hero (authored left of centre) lands right of the wordmark; the mask (local coords, pre-flip) clears the wordmark side. */
.grain { position: absolute; inset: 0; pointer-events: none; opacity: .05; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
.wordmark { font-family: var(--display); font-style: italic; font-weight: 900; text-transform: uppercase; letter-spacing: -.01em; line-height: .86; color: var(--amber); text-shadow: var(--bevel); background: linear-gradient(180deg, #ffd98a 0%, #ffb020 42%, #ff8a1f 70%, #c9641a 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 .03em 0 #6b3a05) drop-shadow(0 .07em .05em rgba(0,0,0,.6)) drop-shadow(0 0 .5em rgba(255,150,30,.28)); }
.wordmark small { display: block; font-size: .28em; letter-spacing: .48em; line-height: 1; margin: 0 0 .28em .08em; color: var(--ink); background: none; -webkit-text-fill-color: var(--ink); text-shadow: var(--outline); font-weight: 900; }
.kicker { font-size: .78rem; letter-spacing: .34em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
.backbtn { position: absolute; right: calc(var(--s5) + var(--sar)); top: calc(var(--s4) + var(--sat)); z-index: 4; display: inline-flex; align-items: center; gap: .35em; min-height: 44px; padding: 0 1.1rem 0 .8rem; border: 1px solid var(--line); border-radius: 999px; background: var(--slab); color: var(--ink); font: 700 .82rem/1 var(--font); letter-spacing: .12em; text-transform: uppercase; pointer-events: auto; cursor: pointer; }
.backbtn span { font-size: 1.3em; line-height: 1; margin-top: -.1em; }
.backbtn:active { background: rgba(255,255,255,.18); }
.legend { position: absolute; right: calc(var(--s5) + var(--sar)); bottom: calc(var(--s4) + var(--sab)); display: flex; gap: var(--s4); font-size: .82rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); white-space: nowrap; }
.legend kbd { font-family: var(--font); font-weight: 700; color: var(--ink); background: rgba(255,255,255,.1); border: 1px solid var(--line); border-bottom-width: 2px; padding: .05em .45em; border-radius: var(--r1); margin-right: .4em; font-size: .9em; min-width: 1.6em; display: inline-block; text-align: center; }
.legend .pad { display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; border-radius: 50%; border: 2px solid var(--ink-dim); color: var(--ink); font-weight: 700; margin-right: .4em; font-size: .85em; }
.legend .pad.a { border-color: var(--green); } .legend .pad.b { border-color: var(--red); }
.corner-brand { position: absolute; left: calc(var(--s5) + var(--sal)); bottom: calc(var(--s4) + var(--sab)); font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.1rem; letter-spacing: .02em; text-transform: uppercase; color: var(--ink-dim); }
.corner-brand b { color: var(--amber); }

@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

/* ---- main menu: round 3 B2 "Strip" (assets/design/menu/round3/SPEC.md § B2, ask #42) ---- */
/* Boot lands here (no title step). The Lobby split turned sideways: the Nalati jump as a wide strip across the top, the
   big two-line title over its sky, one charcoal band of four huge tiles along the bottom (the thumb arc from either
   corner: GARAGE under the left thumb, PLAY under the right). Nothing on the screen states progress, a track, a time or
   a bike class: it is the title menu. The band is: --tile-h of tiles, a 44 px CREDITS row under GARAGE, the home inset. */
.menu-screen { --tile-h: clamp(72px, calc(22 * var(--vh)), 132px); --credits-h: 44px; --band-h: calc(var(--s3) + var(--tile-h) + var(--credits-h) + var(--sab)); }
.menu-keyart { position: absolute; left: 0; right: 0; top: 0; bottom: var(--band-h); pointer-events: none; background-size: cover; background-position: 50% 50%; transform-origin: 50% 35%; opacity: 0; transition: opacity var(--t3) var(--ease); }
.menu-keyart.loaded { opacity: 1; animation: kenburns 28s var(--ease) infinite alternate; }
@keyframes kenburns { from { transform: scale(1); } to { transform: scale(1.05); } }
/* A light hand: the sky reads at the left for the title, the meadow darkens a touch toward the band. */
.menu-keyart::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(6,7,9,.28), transparent 45%), linear-gradient(180deg, transparent 70%, rgba(6,7,9,.35)); }
/* The head: the title large in two lines of the display face (near-white, outlined for the clouds) over the strip's
   sky, then the badge plate — the same slanted plate as before, smaller — and the build stamp under it. */
.menu-head { position: absolute; left: calc(var(--s5) + var(--sal)); top: calc(var(--s3) + var(--sat)); display: flex; flex-direction: column; align-items: flex-start; gap: var(--s2); pointer-events: none; }
.menu-title { display: flex; flex-direction: column; font-family: var(--display); font-style: italic; font-weight: 900; font-size: clamp(2.4rem, calc(16 * var(--vh)), 7.5rem); line-height: .82; text-transform: uppercase; letter-spacing: -.01em; color: var(--ink); text-shadow: var(--outline-heavy); }
.menu-title span:last-child { padding-left: .06em; }
.menu-badge { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s1); pointer-events: none; }
.menu-plate { background: rgba(9,11,15,.92); box-shadow: inset 5px 0 0 var(--amber), 0 6px 20px rgba(0,0,0,.45); clip-path: polygon(0 0, 100% 0, calc(100% - .7em) 100%, 0 100%); padding: .3em 1.5em .25em 1em; font-size: clamp(.95rem, calc(2 * var(--vw)), 1.45rem); }
.menu-plate .wordmark { font-size: 1em; line-height: .9; white-space: nowrap; filter: drop-shadow(0 .03em 0 #6b3a05) drop-shadow(0 .05em .04em rgba(0,0,0,.5)); }
.menu-build { font-size: .62rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink); opacity: .55; text-shadow: var(--outline); padding-left: .4rem; font-variant-numeric: tabular-nums; }
/* The band: charcoal, one amber top edge, the tile row; CREDITS lives in the row below the tiles (a full 44 px target). */
.menu-band { position: absolute; left: 0; right: 0; bottom: 0; height: var(--band-h); padding: var(--s3) calc(var(--s4) + var(--sar)) 0 calc(var(--s4) + var(--sal)); background: linear-gradient(180deg, #14171d, #0c0e12); border-top: 2px solid var(--amber); box-shadow: 0 -14px 34px rgba(0,0,0,.4); }
.menu-list.tiles { position: relative; display: flex; flex-direction: row; align-items: stretch; gap: var(--s3); width: 100%; max-width: 1400px; margin: 0 auto; height: var(--tile-h); }
.menu-list.tiles .menu-bar { display: none; }
#ui .menu-item { position: relative; flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1em; min-height: 44px; min-width: 88px; padding: 0 var(--s3); border: 1px solid rgba(255,255,255,.08); border-radius: var(--r2); background: rgba(255,255,255,.05); cursor: pointer; font-family: var(--display); font-style: italic; font-weight: 900; font-size: clamp(1.5rem, calc(4.4 * var(--vw)), 3rem); line-height: .9; text-transform: uppercase; letter-spacing: .005em; color: var(--ink-dim); transition: color var(--t1) var(--ease), background var(--t1) var(--ease), border-color var(--t1) var(--ease), box-shadow var(--t1) var(--ease); }
#ui .menu-item small { display: none; }
#ui .menu-item .ico { display: block; width: clamp(22px, calc(8 * var(--vh)), 36px); height: clamp(22px, calc(8 * var(--vh)), 36px); color: var(--ink); opacity: .9; }
#ui .menu-item .ico svg { display: block; width: 100%; height: 100%; }
#ui .menu-item.on { color: var(--ink); background: rgba(255,255,255,.1); border-color: var(--amber); box-shadow: 0 0 0 1px var(--amber), 0 0 18px rgba(255,176,32,.3); }
#ui .menu-item[data-id="play"] { order: 5; flex-grow: 1.6; flex-direction: row; gap: .18em; background: linear-gradient(180deg, #ffbf3d, #f2a12c); border-color: rgba(0,0,0,.35); color: var(--amber-ink); font-size: clamp(2rem, calc(6.4 * var(--vw)), 4.2rem); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 6px 18px rgba(0,0,0,.35); }
#ui .menu-item[data-id="play"]::after { content: "\\25B8"; font-size: .7em; margin-top: .04em; }
#ui .menu-item[data-id="play"].on { background: linear-gradient(180deg, #ffd166, #ffb020); color: #0c0e12; border-color: #ffe6a8; box-shadow: inset 0 1px 0 rgba(255,255,255,.5), 0 0 0 1px #ffe6a8, 0 0 26px rgba(255,176,32,.5); }
#ui .menu-item.minor { position: absolute; left: 0; top: 100%; flex: none; order: 0; height: var(--credits-h); min-width: 88px; padding: 0 var(--s2); justify-content: center; align-items: flex-start; border: 0; border-radius: 0; background: transparent; box-shadow: none; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .72rem; letter-spacing: .3em; color: var(--ink-mute); }
#ui .menu-item.minor.on { color: var(--ink); background: transparent; box-shadow: none; }
#ui .menu-item[disabled] { opacity: .35; cursor: default; }
.mini-seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: var(--r1); overflow: hidden; }
.mini-seg b { padding: 4px 8px; font-weight: 700; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-mute); }
.mini-seg b.on { background: var(--amber); color: var(--amber-ink); }
/* The focus bar (other FocusLists): an eased amber underline / column marker. */
.menu-bar { position: absolute; left: 0; bottom: 0; width: 0; height: 4px; border-radius: 2px; background: var(--amber); box-shadow: 0 0 12px var(--amber); pointer-events: none; transition: transform var(--t1) var(--ease), width var(--t1) var(--ease), opacity var(--t2); opacity: 0; }
.menu-bar.on { opacity: 1; }
.menu-screen.show .menu-item { animation: rise var(--t2) var(--ease) both; }
.menu-screen .menu-item:nth-child(3) { animation-delay: 40ms; } .menu-screen .menu-item:nth-child(4) { animation-delay: 80ms; } .menu-screen .menu-item:nth-child(5) { animation-delay: 120ms; }

/* ---- track select ----------------------------------------------------- */
.tracks-screen { background: linear-gradient(90deg, rgba(6,7,9,.88) 0%, rgba(6,7,9,.6) 40%, rgba(6,7,9,.35) 100%); }
.tracks-head { position: absolute; left: calc(calc(5 * var(--vw)) + var(--sal)); right: calc(calc(5 * var(--vw)) + var(--sar) + 8.5rem); /* the MENU pill lives in the last 8.5rem */ top: calc(var(--s5) + var(--sat)); display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); }
.tracks-head h1 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.2rem; line-height: .9; text-transform: uppercase; letter-spacing: .01em; }
.tracks-head h1 small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .72rem; letter-spacing: .34em; color: var(--amber); margin-bottom: .35em; }
.tracks-totals { display: flex; gap: var(--s4); font-size: .9rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; align-items: center; }
.tracks-totals i { display: inline-block; width: .75em; height: .75em; border-radius: 50%; background: currentColor; margin-right: .35em; vertical-align: -.05em; box-shadow: inset 0 -2px 0 rgba(0,0,0,.35); }
.tiers { position: absolute; left: 0; right: 0; top: calc(var(--s5) + var(--sat) + 4.6rem); bottom: calc(var(--s6) + var(--sab)); overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y; padding: 0 0 var(--s5); scrollbar-width: none; }
.tiers::-webkit-scrollbar { display: none; }
.tier-row { position: relative; padding: var(--s3) 0 var(--s2); }
.tier-row.locked { opacity: .62; }
.tier-row.locked .card { filter: grayscale(.75) brightness(.85); }
.tier-head { display: flex; align-items: baseline; gap: var(--s3); padding: 0 calc(calc(5 * var(--vw)) + var(--sal)); margin-bottom: var(--s2); }
.tier-head b { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.35rem; text-transform: uppercase; letter-spacing: .02em; }
.tier-head span { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-dim); }
.tier-head .lock { margin-left: auto; font-size: .75rem; letter-spacing: .14em; text-transform: uppercase; color: var(--amber); display: inline-flex; align-items: center; gap: .5em; }
.tier-head .lock::before { content: ""; width: 1em; height: 1em; background: currentColor; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E") center / contain no-repeat; }
.carousel { display: flex; gap: var(--s3); padding: var(--s1) calc(calc(5 * var(--vw)) + var(--sal)) var(--s2) calc(calc(5 * var(--vw)) + var(--sal)); overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y; }
.carousel::-webkit-scrollbar { display: none; }
.card { position: relative; flex: 0 0 auto; width: clamp(12rem, calc(17 * var(--vw)), 15rem); aspect-ratio: 16 / 10; border-radius: var(--r2); overflow: hidden; border: 1px solid var(--line-2); background: var(--slab-3); color: var(--ink); text-align: left; padding: 0; cursor: pointer; scroll-snap-align: start; transform: translateZ(0); transition: transform var(--t2) var(--ease), box-shadow var(--t2) var(--ease), border-color var(--t1); box-shadow: 0 6px 18px rgba(0,0,0,.45); }
.card .art { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform var(--t3) var(--ease), opacity var(--t3) var(--ease); opacity: 0; }
.card .art.loaded { opacity: 1; }
.card .tint { position: absolute; inset: 0; background: var(--tint, linear-gradient(160deg, #3a2a14, #14100a)); }
.card .tint::after { content: attr(data-badge); position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) rotate(-8deg); font-family: var(--display); font-style: italic; font-weight: 900; font-size: 3.2rem; color: rgba(255,255,255,.08); letter-spacing: .02em; text-transform: uppercase; }
.card .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.18) 0%, transparent 35%, rgba(4,5,7,.55) 60%, rgba(4,5,7,.94) 100%); }
.card .top { position: absolute; left: var(--s3); right: var(--s3); top: var(--s2); display: flex; justify-content: space-between; align-items: center; font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-dim); text-shadow: var(--outline); }
.card .top em.ghost { font-style: normal; color: var(--ink); background: rgba(255,255,255,.14); border-radius: 3px; padding: 1px 6px; margin-right: 2.1rem; letter-spacing: .1em; white-space: nowrap; }
.card .medal { position: absolute; right: var(--s2); top: var(--s2); width: 1.7rem; height: 1.7rem; border-radius: 50%; background-size: cover; background-position: center; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
.card .medal.none { background: rgba(255,255,255,.06); border: 1px dashed var(--line); box-shadow: none; }
.card .medal.plain { background: currentColor; box-shadow: inset 0 -3px 0 rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.6); }
.card .medal.platinum { color: var(--plat); } .card .medal.gold { color: var(--gold); } .card .medal.silver { color: var(--silver); } .card .medal.bronze { color: var(--bronze); }
.card .body { position: absolute; left: var(--s3); right: var(--s3); bottom: var(--s2); display: flex; flex-direction: column; gap: 2px; }
.card .name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.35rem; line-height: 1; text-transform: uppercase; text-shadow: var(--outline); }
.card .tech { font-size: .78rem; color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: var(--outline); }
.card .times { display: flex; justify-content: space-between; font-size: .78rem; font-variant-numeric: tabular-nums; color: var(--ink-dim); text-shadow: var(--outline); margin-top: 2px; }
.card .times b { color: var(--ink); font-weight: 700; }
.card .times b.ahead { color: var(--green); }
.card.on { transform: scale(1.06); border-color: var(--amber); box-shadow: 0 0 0 2px var(--amber), 0 14px 30px rgba(0,0,0,.6), 0 0 26px -4px rgba(255,176,32,.5); z-index: 2; }
.card.on .art { transform: scale(1.06); }
.card.locked { cursor: default; }
.card.locked .body, .card.locked .top { opacity: .55; }
.card.go { animation: cardgo var(--t3) var(--ease) both; z-index: 3; }
@keyframes cardgo { 0% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1.14) translateY(calc(-14 * var(--vh))); opacity: 0; } }
.tracks-screen.leave { transition: opacity var(--t3) var(--ease); opacity: 0; }
.detail { position: absolute; right: calc(calc(5 * var(--vw)) + var(--sar)); top: calc(var(--s5) + var(--sat)); text-align: right; max-width: calc(40 * var(--vw)); }

/* ---- settings ---------------------------------------------------------- */
.settings-screen { background: linear-gradient(90deg, rgba(6,7,9,.94) 0%, rgba(6,7,9,.86) 55%, rgba(6,7,9,.6) 100%); }
.settings-wrap { position: absolute; inset: 0; padding: calc(var(--s5) + var(--sat)) calc(calc(5 * var(--vw)) + var(--sar)) calc(var(--s6) + var(--sab)) calc(calc(7 * var(--vw)) + var(--sal)); display: grid; grid-template-rows: auto 1fr auto; grid-template-columns: minmax(18rem, 34rem); gap: var(--s4); }
.settings-foot { display: flex; flex-direction: column; gap: var(--s1); font-size: .78rem; color: var(--ink-mute); line-height: 1.5; max-width: 40rem; }
.settings-foot b { color: var(--ink-dim); font-weight: 700; }
.settings-foot .sep { margin: 0 .5em; }
.settings-foot .build { opacity: .7; letter-spacing: .08em; text-transform: uppercase; font-size: .7rem; }
.settings-wrap h1 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.2rem; line-height: .9; text-transform: uppercase; align-self: start; letter-spacing: .01em; }
.settings-wrap h1 small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .72rem; letter-spacing: .34em; color: var(--amber); margin-bottom: .35em; }
.settings-list { display: flex; flex-direction: column; gap: var(--s1); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none; padding-right: var(--s2); }
.settings-list::-webkit-scrollbar { display: none; }
.setting { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--s3); min-height: 52px; padding: var(--s2) var(--s4); border-radius: var(--r2); border: 1px solid transparent; transition: background var(--t1) var(--ease), border-color var(--t1); }
.setting.on { background: rgba(255,255,255,.06); border-color: var(--line-2); }
.setting.on .lab { color: var(--amber); }
.setting .lab { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.3rem; text-transform: uppercase; letter-spacing: .01em; }
.setting .lab { min-width: 0; }
.setting .lab small { display: block; font-family: var(--font); font-style: normal; font-weight: 500; font-size: .78rem; text-transform: none; letter-spacing: .02em; color: var(--ink-mute); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r1); overflow: hidden; background: rgba(0,0,0,.35); }
.seg button { min-height: 44px; min-width: 44px; padding: 0 var(--s3); background: transparent; border: 0; border-right: 1px solid var(--line-2); cursor: pointer; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: .82rem; color: var(--ink-dim); transition: background var(--t1), color var(--t1); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--amber); color: var(--amber-ink); }
.seg button:focus-visible, .seg button.focus { box-shadow: inset 0 0 0 2px var(--ink); }
.slider { display: inline-flex; align-items: center; gap: var(--s2); }
.slider button { min-width: 44px; min-height: 44px; border-radius: var(--r1); border: 1px solid var(--line); background: rgba(0,0,0,.35); cursor: pointer; font-weight: 700; font-size: 1.1rem; }
.slider button:focus-visible, .slider button.focus { box-shadow: inset 0 0 0 2px var(--ink); }
.slider .bar { position: relative; width: clamp(5rem, calc(9 * var(--vw)), 9rem); height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; }
.slider .bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 70%; background: linear-gradient(90deg, var(--amber-2), var(--amber)); transition: width var(--t1) var(--ease); }
.slider .val { min-width: 2.6em; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; font-size: .9rem; }
.btn { min-height: 44px; min-width: 44px; padding: var(--s2) var(--s5); border-radius: var(--r1); border: 1px solid var(--line); background: rgba(255,255,255,.08); color: var(--ink); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; font-size: .9rem; transition: background var(--t1), transform var(--t1) var(--ease), box-shadow var(--t1); }
.btn:hover, .btn:focus-visible, .btn.focus { background: rgba(255,255,255,.16); box-shadow: inset 0 0 0 2px var(--ink); }
.btn.primary { background: var(--amber); color: var(--amber-ink); border-color: transparent; }
.btn.primary:hover, .btn.primary:focus-visible, .btn.primary.focus { background: #ffc24d; box-shadow: inset 0 0 0 2px var(--amber-ink); }
.btn.danger { color: var(--red); border-color: rgba(255,61,61,.4); }
.btn.danger.armed { background: var(--red); color: #fff; }
.controls-ref { display: flex; flex-direction: column; gap: var(--s4); overflow-y: auto; scrollbar-width: none; touch-action: pan-y; min-width: 0; }
.controls-ref::-webkit-scrollbar { display: none; }
.controls-ref h3 { margin: 0; font-size: .72rem; letter-spacing: .3em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
.devices { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--s3); }
.device { padding: var(--s3) var(--s4); background: var(--slab); border: 1px solid var(--line-2); border-radius: var(--r2); display: flex; flex-direction: column; gap: var(--s2); }
.device h4 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.1rem; text-transform: uppercase; }
.device svg { width: 100%; height: auto; display: block; }
.device dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px var(--s3); font-size: .8rem; }
.device dt { color: var(--ink-dim); } .device dd { margin: 0; font-weight: 700; }
.about { font-size: .85rem; color: var(--ink-dim); line-height: 1.4; max-width: 34rem; }
.about b { color: var(--ink); }

/* ---- credits ---------------------------------------------------------- */
.credits-screen { background: linear-gradient(90deg, rgba(6,7,9,.94) 0%, rgba(6,7,9,.7) 60%, rgba(6,7,9,.45) 100%); }
.credits-wrap { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal)); top: calc(var(--s5) + var(--sat)); bottom: calc(var(--s6) + var(--sab)); width: min(40rem, calc(80 * var(--vw))); overflow-y: auto; scrollbar-width: none; touch-action: pan-y; display: flex; flex-direction: column; gap: var(--s4); }
.credits-wrap h1 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.6rem; line-height: .9; text-transform: uppercase; }
.credits-wrap dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: var(--s1) var(--s5); font-size: .95rem; }
.credits-wrap dt { color: var(--amber); letter-spacing: .2em; text-transform: uppercase; font-size: .72rem; font-weight: 700; padding-top: .3em; }
.credits-wrap dd { margin: 0; color: var(--ink-dim); }
.credits-wrap dd b { color: var(--ink); }

/* ---- overlay frame: pause + results (assets/design/pause/SPEC.md, direction A "low action bar") ----
   Full-frame grid, flat scrim (no left-weighted gradient), safe-area padding; title block top-left,
   Visuals chips top-right, free band, tile row centred on the viewport in the lower third, corners. */
.overlay { position: absolute; inset: 0; z-index: 1; display: grid; grid-template-rows: auto 1fr auto auto; grid-template-columns: 100%; row-gap: var(--s3); background: rgba(6,7,9,.5); opacity: 0; transition: opacity var(--t2) var(--ease); padding: calc(var(--s6) + var(--sat)) calc(calc(7 * var(--vw)) + var(--sar)) calc(var(--s5) + var(--sab)) calc(calc(7 * var(--vw)) + var(--sal)); }
.overlay.show { opacity: 1; }
.overlay.leaving { opacity: 0; transition: opacity var(--t1) var(--ease); }
.ov-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s4); min-width: 0; }
.ov-title { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.ov-kicker { font-size: .72rem; letter-spacing: .34em; text-transform: uppercase; color: var(--amber); font-weight: 700; text-shadow: var(--outline); }
.ov-kicker.red { color: var(--red); } .ov-kicker.green { color: var(--green); }
.ov-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 3rem; line-height: .9; text-transform: uppercase; letter-spacing: .01em; color: var(--ink); text-shadow: var(--outline); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(40rem, calc(60 * var(--vw))); }
.ov-stats { display: flex; align-items: baseline; gap: 0; font-size: .82rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; letter-spacing: .06em; text-transform: uppercase; text-shadow: var(--outline); white-space: nowrap; }
.ov-stats b { color: var(--ink); font-weight: 700; }
.ov-stats i { font-style: normal; margin: 0 .6em; opacity: .6; }
.ov-free { min-height: 0; }
.ov-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s4); min-height: 44px; }
.ov-foot .legend { position: static; margin-left: auto; }
.ov-foot .legend.hide { visibility: hidden; }
.ov-reload { position: relative; min-height: 44px; min-width: 44px; padding: 0 var(--s2); margin-left: calc(-1 * var(--s2)); border: 0; background: transparent; cursor: pointer; font-weight: 700; font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute); text-shadow: var(--outline); transition: color var(--t1); border-radius: var(--r1); }
.ov-reload.focus, .ov-reload:hover { color: var(--ink); }
.ov-reload.armed { color: var(--amber); }
.overlay.focus-reload .ov-reload { box-shadow: inset 0 0 0 1px var(--line); }
.pause-overlay .ov-head { flex-wrap: wrap; }
.pause-overlay button:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
html.short .pause-overlay { gap: var(--s1); }
/* Action tiles: 240×128 desktop / 160×92 phone; exactly one is amber (the focused one). */
.tiles { display: flex; justify-content: center; gap: var(--s4); width: 100%; }
.tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 240px; height: 128px; min-height: 44px; padding: 0 var(--s3); border-radius: var(--r2); border: 1px solid var(--line); background: var(--slab-3); box-shadow: var(--plate); color: var(--ink); cursor: pointer; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.25rem; letter-spacing: .02em; text-transform: uppercase; line-height: 1; white-space: nowrap; transition: background var(--t1), color var(--t1), border-color var(--t1), box-shadow var(--t1), transform var(--t1) var(--ease); }
.tile svg { width: 28px; height: 28px; color: var(--ink-dim); transition: color var(--t1); }
.tile.on { background: var(--amber); color: var(--amber-ink); border-color: transparent; box-shadow: 0 0 24px -8px var(--amber), var(--plate); }
.tile.on svg { color: var(--amber-ink); }
.tile.on:focus-visible, .overlay.focus-tiles .tile.on { box-shadow: inset 0 0 0 2px var(--amber-ink), 0 0 24px -8px var(--amber); }
.tile.pressed, .tile:active { transform: scale(.97); }
.tile[disabled] { color: var(--ink-mute); border-color: transparent; background: rgba(9,11,15,.5); box-shadow: none; cursor: default; }
.tile[disabled] svg { color: var(--ink-mute); }
.overlay.show .tile { animation: rise var(--t2) var(--ease) both; }
.overlay.show .tile:nth-child(2) { animation-delay: 40ms; } .overlay.show .tile:nth-child(3) { animation-delay: 80ms; }
.overlay.show .ov-foot { animation: fadein var(--t2) var(--ease) 120ms both; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
.overlay.leaving .tile, .overlay.leaving .ov-foot { animation: none; }
@supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) { html:not(.short) .pause-overlay.show { -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); } }

/* ---- replay viewer (docs/design/game.md §16): kicker top-left, transport bar in the lower band ---- */
.replay { position: absolute; inset: 0; opacity: 0; transition: opacity var(--t2) var(--ease); z-index: 5; }
.replay.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease), visibility 0s; }
.replay .rp-head { position: absolute; left: calc(var(--s5) + var(--sal)); top: calc(var(--s5) + var(--sat)); display: flex; flex-direction: column; gap: 2px; }
.replay .ov-kicker { color: var(--amber); }
.replay .ov-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.6rem; line-height: 1; text-transform: uppercase; }
.replay .ov-stats { color: var(--ink-dim); font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; }
.rp-bar { position: absolute; left: 50%; bottom: calc(var(--s5) + var(--sab)); transform: translateX(-50%); display: flex; align-items: center; gap: var(--s2); width: min(1080px, calc(100vw - 2 * var(--s5) - var(--sal) - var(--sar))); padding: var(--s2) var(--s3); border-radius: var(--r2); background: rgba(9,11,15,.82); border: 1px solid var(--line); box-shadow: var(--plate); pointer-events: auto; }
.rp-bar button { -webkit-appearance: none; appearance: none; border: 1px solid var(--line); background: var(--slab-3); color: var(--ink); border-radius: var(--r1); min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-family: var(--font); font-weight: 700; font-size: .85rem; letter-spacing: .06em; text-transform: uppercase; padding: 0 var(--s2); transition: background var(--t1), color var(--t1), border-color var(--t1); }
.rp-bar button svg { width: 22px; height: 22px; }
.rp-bar button.on, .rp-bar .rp-play.on { background: var(--amber); color: var(--amber-ink); border-color: transparent; }
.rp-bar .rp-time { font-family: var(--font); font-weight: 700; font-variant-numeric: tabular-nums; font-size: .95rem; color: var(--ink); min-width: 4.6em; text-align: right; }
.rp-bar .rp-time.end { text-align: left; color: var(--ink-dim); }
.rp-scrub { position: relative; flex: 1 1 auto; height: 44px; cursor: pointer; touch-action: none; }
.rp-scrub .rp-track { position: absolute; left: 0; right: 0; top: 50%; height: 6px; margin-top: -3px; border-radius: 3px; background: var(--slab-3); border: 1px solid var(--line); }
.rp-scrub .rp-fill { position: absolute; left: 0; top: 50%; height: 6px; margin-top: -3px; border-radius: 3px; background: var(--amber); width: 0; }
.rp-scrub .rp-knob { position: absolute; top: 50%; left: 0; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(9,11,15,.85), 0 0 18px -4px var(--amber); }
.rp-seg { display: inline-flex; gap: 2px; }
.rp-seg button { min-width: 44px; }
.rp-bar .rp-exit span { margin-left: 6px; }
.replay .rp-legend { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--s5) + var(--sab) + 72px); white-space: nowrap; }
.hud.replay-on .hud-track, .hud.replay-on .hud-device, .hud.replay-on .hints { opacity: 0; }
.hud.review-on { visibility: hidden; }
.replay.touch .rp-legend { display: none; }
html.short .rp-bar { bottom: calc(var(--s3) + var(--sab)); padding: var(--s1) var(--s2); gap: var(--s1); }
html.short .rp-bar button { min-height: 44px; min-width: 44px; font-size: .75rem; }
html.short .rp-bar .rp-time { font-size: .8rem; min-width: 4.2em; }
html.short .rp-bar .rp-exit span { display: none; }
html.short .replay .rp-head { top: calc(var(--s3) + var(--sat)); }
html.short .replay .rp-legend { display: none; }
html.short .replay .ov-name { font-size: 1.2rem; }
html.narrow .rp-seg.cams button { padding: 0 6px; min-width: 40px; }

/* ---- physics lab HUD (MEGA_PLAN P0 §3): bottom-left, monospace, live trace ---- */
.labhud[hidden] { display: none; }
.labhud { position: absolute; right: calc(.8rem + var(--sar)); bottom: calc(.8rem + var(--sab)); z-index: 6; pointer-events: none; display: flex; flex-direction: column; gap: 4px; padding: .4rem .55rem; background: rgba(0,0,0,.72); border: 1px solid var(--line-2); border-radius: var(--r1); }
.labhud .lab-text { margin: 0; font: 11px/1.45 var(--mono); color: #cfe; white-space: pre; text-shadow: none; }
.labhud .lab-trace { display: block; width: 360px; height: 112px; background: rgba(255,255,255,.03); border-radius: 4px; }
.labhud .lab-gauges { display: block; width: 360px; height: 186px; }
.labhud .lab-hop { color: var(--amber); }
.labhud .lab-hop[hidden] { display: none; }
html.short .labhud .lab-gauges { width: 300px; height: 125px; }
html.short .labhud { bottom: calc(.5rem + var(--sab)); padding: .3rem .45rem; }
html.short .labhud .lab-text { font-size: 10px; line-height: 1.35; }
html.short .labhud .lab-trace { width: 300px; height: 84px; }
.replay ~ .labhud, .hud.results-on ~ .labhud { opacity: .9; }

/* ---- ?trace=1 input bars under the HUD timer ---- */
.trace { position: absolute; left: 50%; top: calc(4.9rem + var(--sat)); transform: translateX(-50%); width: 200px; display: none; flex-direction: column; gap: 3px; z-index: 6; pointer-events: none; }
.trace.show { display: flex; }
.trace .tr-row { display: grid; grid-template-columns: 2.4em 1fr; align-items: center; gap: 6px; font: 700 10px/1 var(--font); letter-spacing: .12em; color: var(--ink-dim); }
.trace .tr-bar { position: relative; height: 8px; border-radius: 4px; background: rgba(9,11,15,.7); border: 1px solid var(--line); overflow: hidden; }
.trace .tr-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--amber); }
.trace .tr-bar i.b { background: #ff5b4a; }
.trace .tr-bar.lean i { background: #7fd1ff; }
.trace .tr-bar.lean i.back { background: #b8ff7f; }
.trace .tr-bar.lean s { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.5); }
.hud.touch ~ .trace { top: calc(4.9rem + var(--sat)); }
html.short .trace { top: calc(4.2rem + var(--sat)); width: 160px; }

/* ---- track card: the PB ghost tag doubles as "Watch PB" ---- */
.card .top em.watch { cursor: pointer; pointer-events: auto; }
.tier-row.lab-row .tier-head b { color: #7fd1ff; }
.card.lab-card { --tint: #1e3a4a; }
.card .top em.watch:hover { color: var(--amber-ink); background: var(--amber); }

/* ---- art plates behind a screen (credits): cover, masked clear where the live scene should show ---- */
.plate-bg { position: absolute; inset: 0; pointer-events: none; background-size: cover; background-position: 50% 50%; opacity: 0; transition: opacity var(--t3) var(--ease); }
.plate-bg.loaded { opacity: .55; }
.credits-screen .plate-bg.loaded { opacity: .35; }
/* ---- garage: the model explorer (garage round) — layout B "tool wall" on set E "shutter door" (assets/design/garage/SPEC.md) ---- */
/* The screen itself is clear: the renderer's garage set is the backdrop. Framing is the renderer's orbit camera, never a CSS transform on the canvas.
   Rail of tags down the left edge (rider · outfit · bike, bike lowest), the metadata panel on the right, badge top-left, ‹ MENU top-right, the hero between. */
.garage-screen { --rail-w: 244px; --panel-w: 178px; background: none; }
.garage-stage { position: absolute; inset: 0; cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; }
.garage-stage.grabbing { cursor: grabbing; }
/* Badge plate top-left: wordmark + GARAGE on the slanted plate, the build stamp under it (menu B's badge, one line). */
.garage-badge { position: absolute; left: calc(var(--s4) + var(--sal)); top: calc(var(--s3) + var(--sat)); display: flex; flex-direction: column; align-items: flex-start; gap: 3px; pointer-events: none; }
.garage-plate { display: flex; align-items: baseline; gap: .6em; background: rgba(9,11,15,.92); box-shadow: inset 4px 0 0 var(--amber), 0 6px 20px rgba(0,0,0,.45); clip-path: polygon(0 0, 100% 0, calc(100% - .6em) 100%, 0 100%); padding: .28em 1.3em .22em .9em; font-size: 1.15rem; }
.garage-plate .wordmark { font-size: 1em; line-height: .9; white-space: nowrap; filter: drop-shadow(0 .03em 0 #6b3a05); }
.garage-title { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.1em; line-height: .9; text-transform: uppercase; color: var(--ink); letter-spacing: .01em; }
.garage-build { font-size: .6rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink); opacity: .55; text-shadow: var(--outline); padding-left: .3rem; font-variant-numeric: tabular-nums; }
/* Gesture hint under the hero (fades after the first drag). */
.garage-hint { position: absolute; left: calc(var(--rail-w) + var(--sal) + (100% - var(--rail-w) - var(--panel-w) - var(--sal) - var(--sar)) / 2); bottom: calc(var(--s3) + var(--sab)); transform: translateX(-50%); display: inline-flex; align-items: center; gap: .5em; padding: 6px 12px; font-size: .66rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-dim); background: rgba(9,11,15,.66); clip-path: polygon(.5em 0, 100% 0, calc(100% - .5em) 100%, 0 100%); pointer-events: none; white-space: nowrap; transition: opacity var(--t3) var(--ease); }
.garage-hint i { width: 1.1em; height: 1.1em; border: 2px solid currentColor; border-radius: 50%; border-right-color: transparent; opacity: .8; }
.garage-hint.used { opacity: 0; }
/* The rail: groups stacked from the bottom edge, a stencilled spine label beside each 2-column grid of tags. */
.garage-rail { position: absolute; left: calc(var(--s4) + var(--sal)); top: calc(var(--s3) + var(--sat) + 64px); bottom: calc(var(--s2) + var(--sab)); width: var(--rail-w); display: flex; flex-direction: column; justify-content: flex-end; gap: var(--s2); }
.rail-group { display: grid; grid-template-columns: 14px 1fr; gap: var(--s1); align-items: end; }
.rail-head { writing-mode: vertical-rl; transform: rotate(180deg); align-self: end; max-height: 100%; overflow: hidden; font-size: .6rem; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: var(--amber); text-shadow: var(--outline); line-height: 14px; }
.rail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s1); }
#ui .chip { position: relative; display: flex; align-items: center; gap: .45em; min-height: 44px; min-width: 44px; padding: 0 .8em 0 .7em; border: 1px solid var(--line-2); background: rgba(12,14,18,.9); color: var(--ink-dim); font: 700 .8rem/1 var(--font); letter-spacing: .08em; text-transform: uppercase; text-align: left; white-space: nowrap; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.45); clip-path: polygon(0 0, 100% 0, 100% calc(100% - .5em), calc(100% - .5em) 100%, 0 100%); transition: background var(--t1), color var(--t1); }
#ui .chip > b, #ui .chip > em { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#ui .chip .txt { display: contents; }
#ui .chip b { font-weight: 700; }
#ui .chip em { font-style: normal; font-size: .6rem; letter-spacing: .16em; color: var(--ink-mute); }
/* Outfit tags read in mixed case (mockup B): the five labels fit two per row without truncation. */
#ui .chip.outfit-button { text-transform: none; letter-spacing: .01em; font-size: .8rem; padding-top: 4px; padding-bottom: 4px; }
#ui .chip.outfit-button > b { white-space: normal; line-height: 1.02; }
#ui .chip.outfit-button em { text-transform: none; letter-spacing: .02em; font-size: .68rem; }
#ui .chip b + em { margin-left: 0; }
#ui .chip.selected { background: var(--amber); color: var(--amber-ink); border-color: var(--amber); }
#ui .chip.selected em { color: rgba(26,18,6,.72); }
#ui .chip.on:not(.selected) { color: var(--ink); background: rgba(255,255,255,.12); }
#ui .chip.on, .garage-screen button:focus-visible, .garage-screen .backbtn.on { outline: 2px solid var(--ink); outline-offset: 2px; }
#ui .chip[aria-busy="true"] { opacity: .6; }
#ui .chip:disabled { opacity: .55; cursor: not-allowed; }
/* Two-line tags: the label stacks over its detail. */
#ui .chip { flex-wrap: wrap; row-gap: 1px; column-gap: .45em; padding-top: 5px; padding-bottom: 5px; }
#ui .chip > b { flex: 1 1 100%; }
#ui .chip > em { flex: 1 1 100%; }
#ui .chip > .swatch, #ui .chip > .chip-tint, #ui .chip > .chip-art { flex: 0 0 auto; }
#ui .chip > .swatch + b, #ui .chip > .chip-art + b { flex: 1 1 calc(100% - 2.2em); }
#ui .chip > .swatch ~ em, #ui .chip > .chip-art ~ em { margin-left: 2.2em; }
.swatch { width: 1.6em; height: 1.6em; border: 1px solid rgba(0,0,0,.5); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
.bike-chip { --tint: var(--amber); }
.bike-chip .chip-tint { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--tint); opacity: .9; }
.bike-chip.selected .chip-tint { background: var(--amber-ink); opacity: .35; }
.bike-chip .chip-art { width: 2.1em; height: 1.4em; margin-left: 2px; background-size: cover; background-position: 50% 45%; opacity: 0; transition: opacity var(--t3); border-radius: 2px; }
.bike-chip .chip-art.loaded { opacity: 1; }
.bike-chip .chip-art:not(.loaded) { display: none; }
/* The panel: the chosen bike's sheet — class, bars, character, note — then the outfit / rider lines and the load status. */
.garage-panel { position: absolute; right: calc(var(--s4) + var(--sar)); top: calc(var(--s4) + var(--sat) + 52px); width: var(--panel-w); display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) var(--s3) var(--s2); background: rgba(9,11,15,.88); border: 1px solid var(--line-2); border-top: 2px solid var(--amber); box-shadow: 0 8px 24px rgba(0,0,0,.5); pointer-events: none; }
.gp-sheet { display: flex; flex-direction: column; gap: 6px; }
.gp-name { display: flex; align-items: baseline; gap: .5em; }
.gp-name b { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.5rem; line-height: .9; text-transform: uppercase; color: var(--tint, var(--amber)); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.gp-name small { font-size: .62rem; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: var(--ink-dim); }
.gp-stats { display: flex; flex-direction: column; gap: 4px; }
.gp-stats .stat { display: grid; grid-template-columns: 3.6em 1fr 3.9em; align-items: center; gap: 6px; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-dim); font-weight: 700; }
.gp-stats .stat i { display: block; height: 5px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; }
.gp-stats .stat b { display: block; height: 100%; width: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--amber) 70%, #000), var(--amber)); transition: width var(--t3) var(--ease); }
.gp-stats .stat em { font-style: normal; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: .04em; }
.gp-line { font-size: .72rem; line-height: 1.3; color: var(--ink-dim); }
.gp-note { font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); padding-top: 4px; border-top: 1px solid var(--line-2); }
.gp-kv { display: flex; justify-content: space-between; gap: var(--s2); font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.gp-kv b { color: var(--ink); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.outfit-current { color: var(--amber); font-size: .66rem; letter-spacing: .04em; line-height: 1.3; }
.garage-screen .legend { top: calc(var(--s4) + var(--sat) + 56px); right: calc(var(--s4) + var(--sar) + var(--panel-w) + var(--s3)); bottom: auto; font-size: .66rem; gap: var(--s3); }
.garage-screen .legend.hide { display: none; }
.card .top em.bike { font-style: normal; color: #0b1a2e; background: var(--blue); border-radius: 3px; padding: 1px 6px; margin-right: 2.1rem; letter-spacing: .1em; font-weight: 700; white-space: nowrap; }
.card .top em.ghost + em.bike { margin-left: -1.9rem; }
.card .lockline { position: absolute; left: var(--s3); right: var(--s3); top: 36%; transform: translateY(-50%); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; color: var(--amber); font-weight: 700; text-shadow: var(--outline); display: flex; align-items: center; gap: .45em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .lockline::before { content: ""; flex: 0 0 auto; width: 1em; height: 1em; background: currentColor; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E") center / contain no-repeat; }
.ov-stats b.bike-pro { color: var(--blue); }
.tile span small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .68rem; letter-spacing: .14em; margin-top: 4px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.setting .btns { display: inline-flex; gap: var(--s2); }
.setting .btns .btn[hidden] { display: none; }

/* ---- perf overlay (?perf=1): top-left under the pause button, never over the bike ---- */
.perf[hidden] { display: none; }
.perf { position: absolute; left: calc(.8rem + var(--sal)); top: calc(4.4rem + var(--sat)); margin: 0; padding: .35rem .55rem; z-index: 6; pointer-events: none; font: 11px/1.4 var(--mono); color: #cfe; background: rgba(0,0,0,.72); border: 1px solid var(--line-2); border-radius: var(--r1); white-space: pre; text-shadow: none; }

/* ---- update toast (service worker has a newer build) ---- */
/* ?bench=1 (src/game/bench.ts): START card, one status line under the meter while it runs, the report panel at the end. */
.bench { position: absolute; inset: 0; pointer-events: none; z-index: 40; }
.bench-card, .bench-report { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); box-shadow: 0 18px 50px rgba(0,0,0,.55); color: var(--ink); }
.bench-card { width: min(34rem, calc(100vw - 2rem)); padding: var(--s4) var(--s5); display: flex; flex-direction: column; gap: var(--s2); }
.bench-card h2 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.5rem; line-height: 1; text-transform: uppercase; }
.bench-card ol { margin: 0; padding-left: 1.4em; columns: 2; font: 600 .8rem/1.5 var(--mono); color: var(--ink-dim); }
.bench-card ol small { color: var(--ink-mute); }
.bench-card p { margin: 0; font-size: .82rem; color: var(--ink-dim); }
.bench-card .btn { align-self: flex-start; }
.bench-card[hidden], .bench-report[hidden], .bench-status[hidden] { display: none; }
.bench-status { position: absolute; right: calc(.5rem + var(--sar)); top: calc(1.6rem + var(--sat)); font: 600 10px/1.4 var(--mono); letter-spacing: .04em; color: var(--amber); text-shadow: 0 1px 2px rgba(0,0,0,.8); }
.hud.touch ~ .bench .bench-status, .touch-layer.on.visible ~ .bench .bench-status { top: calc(5.6rem + var(--sat)); }
.bench-report { width: min(60rem, calc(100vw - 1.5rem)); max-height: calc(100vh - 1.5rem); padding: var(--s3) var(--s4); display: flex; flex-direction: column; gap: var(--s2); overflow: hidden; }
.bench-dev { font: 10px/1.4 var(--mono); color: var(--ink-dim); }
.bench-tablewrap { overflow: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line-2); border-radius: var(--r1); }
.bench-report table { border-collapse: collapse; font: 10px/1.3 var(--mono); white-space: nowrap; }
.bench-report th, .bench-report td { padding: .25em .55em; text-align: right; border-bottom: 1px solid var(--line-2); }
.bench-report th:first-child, .bench-report td:first-child { text-align: left; }
.bench-report th { color: var(--amber); font-weight: 700; position: sticky; top: 0; background: var(--slab-3); }
.bench-btns { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
.bench-btns .btn { font-size: .78rem; padding: var(--s2) var(--s4); }
.bench-note { font: 11px/1.3 var(--mono); color: var(--ink-dim); }
.bench-report textarea { width: 100%; min-height: 6rem; font: 10px/1.3 var(--mono); background: rgba(0,0,0,.5); color: var(--ink); border: 1px solid var(--line); border-radius: var(--r1); }
.fpsmeter { position: absolute; right: calc(.5rem + var(--sar)); top: calc(.15rem + var(--sat)); z-index: 7; pointer-events: none; font: 600 10px/1.4 var(--mono); letter-spacing: .04em; color: rgba(255,255,255,.55); text-shadow: 0 1px 2px rgba(0,0,0,.8); }
.fpsmeter.bad { color: #ff7a5c; }
.hud.touch ~ .fpsmeter, .touch-layer.on.visible ~ .fpsmeter { top: calc(4.2rem + var(--sat)); }
/* Results on a phone: the meter leaves the top-right corner to the leaderboard (§18) and sits in the empty legend corner. */
.hud.touch.results-on ~ .fpsmeter { top: auto; bottom: calc(.2rem + var(--sab)); }
.toast { position: absolute; left: 50%; bottom: calc(var(--s5) + var(--sab)); transform: translate(-50%, 140%); z-index: 30; display: flex; align-items: center; gap: var(--s3); padding: var(--s2) var(--s2) var(--s2) var(--s4); background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); box-shadow: var(--plate), 0 18px 40px rgba(0,0,0,.6); opacity: 0; transition: transform var(--t3) var(--ease), opacity var(--t3) var(--ease); white-space: nowrap; }
.toast.show { transform: translate(-50%, 0); opacity: 1; }
.toast-dot { width: .6rem; height: .6rem; border-radius: 50%; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: pulse 1.6s ease-in-out infinite; }
.toast-text { display: flex; flex-direction: column; line-height: 1.15; }
.toast-text b { font-weight: 700; letter-spacing: .04em; }
.toast-text small { font-size: .74rem; color: var(--ink-mute); }

/* ---- onboarding card (first launch, over the first countdown, game paused) ---- */
.onboard { position: absolute; inset: 0; z-index: 25; display: flex; align-items: center; justify-content: center; background: rgba(6,7,9,.55); opacity: 0; transition: opacity var(--t2) var(--ease); padding: var(--s4); }
.onboard.show { opacity: 1; }
.ob-card { width: min(34rem, 100%); display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r3); box-shadow: var(--plate), 0 24px 60px rgba(0,0,0,.6); }
.ob-card h2 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.4rem; line-height: .9; text-transform: uppercase; }
.ob-lines { display: flex; flex-direction: column; gap: var(--s2); font-size: .98rem; color: var(--ink-dim); line-height: 1.35; }
.ob-lines b { color: var(--ink); }
.ob-lines kbd { font-family: var(--font); font-weight: 700; color: var(--ink); background: rgba(255,255,255,.1); border: 1px solid var(--line); border-bottom-width: 2px; padding: .02em .45em; border-radius: var(--r1); font-size: .9em; min-width: 1.6em; display: inline-block; text-align: center; }
.ob-hop { font-size: .82rem; color: var(--ink-mute); border-top: 1px solid var(--line-2); padding-top: var(--s3); }
.ob-tip { font-size: .74rem; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.ob-card .btn { align-self: flex-end; min-height: 48px; }
html.short .garage-screen { --rail-w: 236px; --panel-w: 172px; }
html.short .garage-plate { font-size: 1rem; }
html.short .garage-rail { top: calc(var(--s3) + var(--sat) + 58px); gap: 6px; }
html.short .rail-group, html.short .rail-grid { gap: 3px; }
html.short #ui .chip { font-size: .74rem; padding-left: .55em; padding-right: .5em; }
html.short #ui .chip.outfit-button { font-size: .78rem; }
html.short .garage-panel { top: calc(var(--s4) + var(--sat) + 50px); gap: 6px; padding: var(--s2) var(--s2) 6px; }
html.short .gp-name b { font-size: 1.3rem; }
html.short .gp-line { display: none; }
html.short .garage-hint { font-size: .6rem; padding: 5px 10px; }
html.short .ob-card { padding: var(--s4); gap: var(--s2); }
html.short .ob-card h2 { font-size: 1.6rem; }
html.short .ob-lines { font-size: .82rem; gap: var(--s1); }
html.short .ob-hop { display: none; }
html.short .ob-tip { display: none; }
html.short .tile span small { display: none; }
html.short .perf { top: calc(3.6rem + var(--sat)); font-size: 10px; }

/* ---- countdown scene handoff --------------------------------------------- */
.iris { position: absolute; inset: 0; pointer-events: none; background: var(--bg); opacity: 0; transition: opacity var(--t2) var(--ease); }
.iris.on { opacity: 1; }
`;

export const HUD_CSS = /* css */ `
/* ---- top band ------------------------------------------------------- */
.hud { position: absolute; inset: 0; opacity: 1; transition: opacity var(--t2) var(--ease); z-index: 2; pointer-events: none; }
.hud .results.live { pointer-events: auto; }
.hud.hidden { opacity: 0; }
.hud-top {
  position: absolute; left: 0; right: 0; top: 0;
  padding: calc(.9rem + var(--sat)) calc(1.1rem + var(--sar)) 0 calc(1.1rem + var(--sal));
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 1rem;
}
.hud-left { display: flex; flex-direction: column; align-items: flex-start; gap: .3rem; min-width: 0; }
.hud-track { font-weight: 700; font-size: 1rem; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; padding: .3rem .7rem; background: var(--slab); border: 1px solid var(--line); border-radius: .4rem; box-shadow: var(--plate); text-shadow: var(--outline); }
.hud-track b { color: var(--amber); font-weight: 800; text-transform: uppercase; font-size: .8em; letter-spacing: .12em; margin-right: .5em; }
.hud-device { font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink); opacity: 0; transition: opacity .3s; display: inline-flex; align-items: center; gap: .4em; padding: .2rem .6rem; background: var(--slab); border-radius: .4rem; box-shadow: var(--plate); text-shadow: var(--outline); }
.hud-device.show { opacity: 1; }
.hud-device i { width: .55em; height: .55em; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); }

.hud-center { position: relative; display: flex; align-items: center; gap: .6rem; background: var(--slab); border: 1px solid var(--line); border-radius: .5rem; padding: .3rem .9rem .3rem 1rem; box-shadow: var(--plate); }
.hud-timer { font-size: 2.35rem; line-height: 1; font-weight: 800; font-style: italic; letter-spacing: .01em; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; text-shadow: var(--outline); min-width: 7.2ch; text-align: center; }
.hud-timer.frozen { color: var(--green); }
.hud-timer .ms { font-size: .58em; font-weight: 700; opacity: .85; }
.hud-faults { display: inline-flex; align-items: baseline; gap: .3em; padding-left: .7rem; border-left: 1px solid var(--line); font-weight: 800; font-size: 1.55rem; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: var(--outline); }
.hud-faults .x { color: var(--red); font-size: .8em; font-weight: 900; }
.hud-faults.flip .n { color: var(--amber); transform: scale(1.35); }
.hud-faults .n { display: inline-block; transform-origin: 50% 70%; transition: transform .12s ease-out, color .12s; }
/* Finish: strip and track plate fade, the frozen green timer is the one thing left (delta lives in the results panel). */
.hud .strip, .hud .hud-track { transition: opacity var(--t3) var(--ease); }
.hud.finished .strip, .hud.finished .hud-track, .hud.finished .hud-device { opacity: .28; }
.hud.finished .hud-split { opacity: 0 !important; }

.hud-split { position: absolute; left: calc(100% + .7rem); top: 50%; margin-top: -.75em; font-size: 1.5rem; font-weight: 900; font-style: italic; font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0; transform-origin: 0 50%; text-shadow: var(--outline-heavy); pointer-events: none; }
.hud-split.ahead { color: var(--green); } .hud-split.behind { color: var(--red); }
.flash { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
.flash.cp { box-shadow: inset 0 0 10vmin 1vmin rgba(74,227,127,.4); }
.flash.finish { background: #fff; }
.hud-right { display: flex; justify-content: flex-end; min-width: 0; }
.strip { position: relative; width: min(calc(24 * var(--vw)), 22rem); height: 2rem; margin-top: .35rem; }
.strip .bar { position: absolute; left: 0; right: 0; top: .95rem; height: .5rem; background: rgba(0,0,0,.75); border: 1px solid var(--line); border-radius: .25rem; overflow: hidden; box-shadow: var(--plate); }
.strip .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, #ff8a1f, var(--amber)); }
.strip .mark { position: absolute; top: .55rem; width: 2px; height: 1.3rem; margin-left: -1px; background: rgba(255,255,255,.6); box-shadow: 0 0 0 1px rgba(0,0,0,.6); }
.strip .mark.done { background: var(--green); box-shadow: 0 0 5px var(--green); }
.strip .finish { position: absolute; right: -1px; top: .35rem; width: .7rem; height: 1.7rem; background:
  repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / .35rem .35rem; border-radius: 2px; }
.strip .pin.ghost { background: rgba(255,255,255,.55); border-color: rgba(0,0,0,.5); opacity: 0; top: .15rem; width: .75rem; height: .75rem; margin-left: -.37rem; }
.strip .pin { position: absolute; top: .05rem; width: .9rem; height: .9rem; margin-left: -.45rem; background: var(--amber); border: 2px solid #1a1206; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 1px 3px rgba(0,0,0,.6); }

/* Countdown/GO must not cover pause-menu customization controls. */
.under-overlay .banners { visibility: hidden; }

/* ---- kinetic banners ------------------------------------------------ */
.banners { position: absolute; left: 0; right: 0; top: 30%; height: 0; display: flex; justify-content: center; pointer-events: none; }
.banners .entry { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font: 700 1.1rem/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--amber); background: var(--slab-2); padding: .55em 1.2em; border-radius: .2em; opacity: 0; transition: opacity .15s; text-shadow: none; }
.banners .entry.show { opacity: 1; }
.banner { position: absolute; top: 0; transform: translate(-50%, -50%); left: 50%; white-space: nowrap; font-weight: 900; font-style: italic; letter-spacing: .02em; text-transform: uppercase; will-change: transform, opacity; opacity: 0; text-shadow: var(--outline-heavy); }
.banner.count { font-size: 9rem; color: var(--amber); -webkit-text-stroke: .02em rgba(0,0,0,.9); paint-order: stroke fill; }
.banner.go { font-size: 11rem; color: #fff; -webkit-text-stroke: .02em rgba(0,0,0,.9); paint-order: stroke fill; }
.banner.crash { font-size: 3rem; color: var(--red); background: var(--slab-2); padding: .25em .9em; border-radius: .12em; text-shadow: 0 2px 0 rgba(0,0,0,.6); letter-spacing: .06em; }
.banner.cp { font-size: 1.6rem; color: var(--green); letter-spacing: .3em; padding: .3em 1.4em; border-top: 2px solid var(--green); border-bottom: 2px solid var(--green); background: linear-gradient(90deg, transparent, rgba(0,0,0,.7) 15%, rgba(0,0,0,.7) 85%, transparent); }
.banner.finish { font-size: 4.5rem; color: #fff; background: linear-gradient(90deg, transparent, rgba(0,0,0,.75) 20%, rgba(0,0,0,.75) 80%, transparent); padding: .15em 2em; letter-spacing: .08em; }
.banner.ready { font-size: 4rem; color: var(--amber); }

/* ---- hints ---------------------------------------------------------- */
.hints { position: absolute; left: 50%; bottom: calc(1rem + var(--sab)); transform: translateX(-50%); display: flex; gap: 1.2rem; padding: .45rem 1rem; background: var(--slab); border: 1px solid var(--line); border-radius: .5rem; font-size: .9rem; white-space: nowrap; opacity: 0; transition: opacity .3s; box-shadow: var(--plate); text-shadow: var(--outline); max-width: calc(calc(100 * var(--vw)) - 2rem); overflow: hidden; }
.hints.show { opacity: 1; }
.hints kbd { font-family: var(--font); font-weight: 800; background: rgba(255,255,255,.12); border: 1px solid var(--line); border-bottom-width: 2px; padding: .05em .45em; border-radius: .25em; margin-right: .35em; font-size: .9em; }

/* ---- results: the same frame as pause (title block, headline centred in the free band, tiles) ---- */
.results { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr auto auto; grid-template-columns: 100%; row-gap: var(--s3); padding: calc(var(--s6) + var(--sat)) calc(calc(7 * var(--vw)) + var(--sar)) calc(var(--s5) + var(--sab)) calc(calc(7 * var(--vw)) + var(--sal)); background: rgba(6,7,9,0); opacity: 0; transition: opacity var(--t2) var(--ease), background var(--t3) var(--ease); }
.results.show { opacity: 1; }
/* The tiles are the results' tappables: .live lands on the frame only once THEY are drawn (stage-3 + the reveal watch on .tiles, hud.ts). */
.results.stage-3, .results.stage-4, .results.stage-5 { background: rgba(6,7,9,.35); }
.results .headline { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s2); text-align: center; min-height: 0; }
.results .headline .row { display: flex; align-items: baseline; gap: var(--s4); }
.results .time { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 6.6rem; font-variant-numeric: tabular-nums; line-height: 1; color: var(--ink); text-shadow: var(--outline-heavy); }
.results .time .ms { font-size: .58em; }
.results .faults { font-size: 1.4rem; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: .04em; text-shadow: var(--outline); }
.results .faults span { color: var(--red); font-weight: 900; }
.results .pb { font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: .95rem; min-height: 1.2em; color: var(--ink-dim); text-shadow: var(--outline); }
.results .pb.green { color: var(--green); }
.results .pb em { font-style: normal; color: var(--red); }
.results .medals { display: flex; gap: var(--s3); margin-top: var(--s2); }
/* Local leaderboard (game.md § leaderboard): top-right of the title band, revealed with the medals. */
.results .board { flex: 0 0 auto; min-width: 11rem; padding: var(--s2) var(--s3); background: var(--slab-2); border: 1px solid var(--line-2); border-radius: var(--r1); font-variant-numeric: tabular-nums; text-shadow: none; opacity: 0; transform: translateY(var(--s2)); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.results .board[hidden] { display: none; }
.results.stage-3 .board, .results.stage-4 .board, .results.stage-5 .board { opacity: 1; transform: none; }
.results .board-head { font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: var(--s1); }
.results .board-head em { font-style: normal; color: var(--green); }
.results .board ol { list-style: none; margin: 0; padding: 0; display: grid; row-gap: 2px; }
.results .board li { display: grid; grid-template-columns: 1.1em 1em 1fr auto; align-items: center; column-gap: .45em; font-size: .86rem; color: var(--ink); padding: .1em .35em; border-radius: 3px; }
.results .board li.you { background: rgba(120,255,160,.14); box-shadow: inset 0 0 0 1px rgba(120,255,160,.45); }
.results .board li .n { color: var(--ink-dim); font-size: .72rem; font-weight: 700; }
.results .board li b { font-weight: 700; }
.results .board li small { color: var(--ink-dim); font-size: .72rem; }
.results .board .dot { display: block; width: .7em; height: .7em; border-radius: 50%; background: currentColor; box-shadow: inset 0 -1px 0 rgba(0,0,0,.4); }
.results .board .dot.platinum { color: var(--plat); } .results .board .dot.gold { color: var(--gold); } .results .board .dot.silver { color: var(--silver); } .results .board .dot.bronze { color: var(--bronze); }
/* Track card: the class in effect's top 5 as medal-coloured chips. */
.card .board { display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden; margin-top: 2px; font-variant-numeric: tabular-nums; }
.card .board span { font-size: .58rem; font-weight: 700; line-height: 1; padding: 2px 3px; border-radius: 3px; background: rgba(0,0,0,.45); color: var(--ink); border-left: 3px solid currentColor; white-space: nowrap; }
.card .board span.platinum { color: var(--plat); } .card .board span.gold { color: var(--gold); } .card .board span.silver { color: var(--silver); } .card .board span.bronze { color: var(--bronze); }
.card .board span b { color: var(--ink); font-weight: 700; }
.results .medal { display: flex; flex-direction: column; align-items: center; gap: var(--s1); text-align: center; opacity: .35; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: .7rem; text-shadow: var(--outline); transition: opacity var(--t2); }
.results .medal i { display: block; width: 56px; height: 56px; border-radius: 50%; background: currentColor; box-shadow: inset 0 -4px 0 rgba(0,0,0,.35); background-size: cover; background-position: center; }
.results .medal i.img { background-color: transparent; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.results .medal b { color: var(--ink); font-weight: 700; }
.results .medal.platinum { color: var(--plat); } .results .medal.gold { color: var(--gold); } .results .medal.silver { color: var(--silver); } .results .medal.bronze { color: var(--bronze); }
.results .medal.earned { opacity: 1; }
.results .medal.earned i { box-shadow: 0 0 22px -6px currentColor, 0 0 0 1px currentColor, inset 0 -4px 0 rgba(0,0,0,.35); }
.results .medal.earned i.img { box-shadow: 0 0 22px -6px currentColor, 0 0 0 1px currentColor; }
.results .medal small { display: block; color: var(--ink-dim); letter-spacing: 0; text-transform: none; font-weight: 500; font-variant-numeric: tabular-nums; font-size: .68rem; white-space: nowrap; }
/* Staged reveal (sim-clocked): title block 0 · time .15 · faults .35 · medals + tiles + scrim .6 · PB line + earned pop .9. */
.results .time, .results .faults, .results .medals, .results .pb, .results .tiles, .results .ov-foot { opacity: 0; transform: translateY(var(--s2)); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.results .tiles .tile { animation: none; }
.results.stage-1 .time,
.results.stage-2 .time, .results.stage-2 .faults,
.results.stage-3 .time, .results.stage-3 .faults, .results.stage-3 .medals, .results.stage-3 .tiles, .results.stage-3 .ov-foot,
.results.stage-4 .time, .results.stage-4 .faults, .results.stage-4 .medals, .results.stage-4 .tiles, .results.stage-4 .ov-foot, .results.stage-4 .pb,
.results.stage-5 .time, .results.stage-5 .faults, .results.stage-5 .medals, .results.stage-5 .tiles, .results.stage-5 .ov-foot, .results.stage-5 .pb { opacity: 1; transform: none; }
.results .medal.earned i { transition: transform var(--t3) var(--ease), box-shadow var(--t3); transform: scale(.85); }
.results.stage-4 .medal.earned i, .results.stage-5 .medal.earned i { transform: scale(1.08); }
.results.stage-3 .medal.earned { opacity: .35; }
/* HUD while an overlay is up: the top band, hints and touch buttons hide; kinetic banners stay. */
.hud .hud-top, .hud .hints { transition: opacity var(--t2) var(--ease); }
.hud.under-overlay .hud-top, .hud.under-overlay .hints, .hud.results-on .hud-top, .hud.results-on .hints { opacity: 0; pointer-events: none; }
.touch-layer.under-overlay, .touch-layer.under-overlay * { pointer-events: none !important; }
.touch-layer.under-overlay .tz, .touch-layer.under-overlay .tz-btn { opacity: 0 !important; }

/* ---- touch layer: G "strip with keys" (assets/design/controls/SPEC.md § Round 2, game.md §3) ---------------------- */
/* Tokens: strip 3.33rem (52 px at 932×430, 48 px at 844×390) + the home-indicator inset; key = strip − 2 × 6 px. Key colours
   as r,g,b triplets so the wash can take an alpha: the two LEAN keys share ONE neutral (cool steel, #d7e3ef), BRAKE red #ff5a5a,
   GAS green #5aff8c. */
.touch-layer { position: absolute; inset: 0; pointer-events: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; --strip-h: 3.33rem; --key-h: calc(var(--strip-h) - .77rem); --k-lean: 215,227,239; --k-brake: 255,90,90; --k-gas: 90,255,140; }
.touch-layer * { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; pointer-events: none; }
.touch-debug { position: absolute; left: 50%; top: calc(5.2rem + var(--sat)); transform: translateX(-50%); margin: 0; padding: .4rem .6rem; background: rgba(0,0,0,.8); color: #9f9; font: 12px/1.35 var(--mono); border-radius: .3rem; pointer-events: none; white-space: pre; z-index: 5; }
.touch-layer.on { pointer-events: auto; }
/* The strip: one continuous band on the bottom edge, 40 % idle → 30 % settled, drawn by the layer root's pseudo-elements —
   not an element, not a hit rect, so no .live of its own (the layer root takes the pointers and the quarter columns are the
   hit areas, zoneAt). ::after is the amber seam at 50 %: the two-thumbs split a finger never crosses. Touch-only: it is drawn
   only while the layer is .visible (touch is the active device); keyboard / pad keep the HUD hints. */
.touch-layer::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--strip-h) + var(--sab)); background: #0a0c10; border-top: 1px solid rgba(255,255,255,.22); opacity: 0; transition: opacity .25s; pointer-events: none; }
.touch-layer::after { content: ''; position: absolute; left: calc(50% - 1px); width: 2px; bottom: 0; height: calc(var(--strip-h) + var(--sab)); background: var(--amber); opacity: 0; transition: opacity .25s; pointer-events: none; }
.touch-layer.on.visible::before { opacity: .4; }
.touch-layer.on.visible::after { opacity: .7; }
.touch-layer.on.visible.settled::before { opacity: .3; transition: opacity var(--t3) var(--ease); }
.touch-layer.on.visible.settled::after { opacity: .5; transition: opacity var(--t3) var(--ease); }
.touch-layer.under-overlay::before, .touch-layer.under-overlay::after { opacity: 0 !important; }
.tz { position: absolute; display: flex; align-items: center; justify-content: center; font-family: var(--font); font-weight: 800; letter-spacing: .2em; font-size: .85rem; color: rgba(255,255,255,.55); opacity: 0; transition: opacity .25s, background .08s; }
/* Quarter columns = the hit areas (unchanged), each carrying its key's colour; .held (paint(), from the pointer map every
   frame — no timers) paints the column wash: 8 % of the key colour at the strip, gone by 55 % of the height (under the wheel
   line), so the state reads peripherally without looking down. The column itself is drawn at 1 (the key carries the look);
   under an overlay the .tz rule above zeroes it. */
.tz-zone { top: 0; bottom: 0; width: 25%; --k: var(--k-lean); }
.tz-back { left: 0; } .tz-fwd { left: 25%; } .tz-brake { left: 50%; --k: var(--k-brake); } .tz-throttle { left: 75%; --k: var(--k-gas); }
.touch-layer.on.visible .tz-zone { opacity: 1; }
.touch-layer.on.visible .tz-zone.held { background: linear-gradient(to top, rgba(var(--k), .08), rgba(var(--k), 0) 55%); }
/* Key caps: 75 % of the quarter wide, inset 6 px from the strip's top edge and 6 px above the home indicator, radius 8,
   bevelled (top highlight, darker bottom); glyph 22 px, label .72rem tracking .2em. */
.tz-key { position: absolute; left: 12.5%; right: 12.5%; bottom: calc(var(--sab) + .385rem); height: var(--key-h); display: flex; align-items: center; justify-content: center; gap: .3rem; border-radius: 8px; color: rgb(var(--k)); background: rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -2px 0 rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.35); font-size: .72rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 1px 0 rgba(0,0,0,.6); transform-origin: 50% 100%; transition: background-color 80ms var(--ease), color 80ms var(--ease), transform 80ms var(--ease), box-shadow 80ms var(--ease), text-shadow 80ms; }
.tz-key b, .tz-key i { display: inline-flex; align-items: center; gap: .05rem; }
.tz-key svg { display: block; width: 22px; height: 22px; }
.tz-key span { padding: 0 .1em; }
/* Held: solid in its colour (neutral / neutral / red / green), black glyph, pressed to .96, glowing; the bevel flattens.
   Onset is immediate (40 ms), the release fades over 80 ms. The settled state never dims this. */
.tz-zone.held .tz-key { background: rgb(var(--k)); color: #0b0d11; text-shadow: none; transform: scale(.96); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 0 1px rgba(var(--k), .9), 0 0 22px -2px rgba(var(--k), .85); transition-duration: 40ms; }
.tz-btn { top: calc(.7rem + var(--sat)); width: 56px; height: 44px; align-items: center; padding: 0; border-radius: .5rem; background: var(--slab); border: 1px solid var(--line); font-size: 1.2rem; letter-spacing: 0; opacity: 0; }
.tz-restart { width: auto; padding: 0 .7rem; }
.tz-restart span { display: inline-flex; align-items: center; gap: .4em; }
.tz-restart small { font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
/* Buttons stay drawn at .9 after the zones settle (the .settled .tz rule above is 0,5,0 and used to beat this 0,4,0 rule → .3, under the invariant's .5 with a live 56×44 hit rect). */
.touch-layer.on.visible .tz-btn, .touch-layer.on.visible.settled .tz-btn { opacity: .9; }
.tz-btn.held { background: rgba(255,255,255,.25); }
.tz-restart { right: calc(.8rem + var(--sar)); }
.tz-pause { left: calc(.8rem + var(--sal)); }
.hud.touch .hud-top { padding-left: calc(4.8rem + var(--sal)); padding-right: calc(4.8rem + var(--sar)); }
.hud.touch .hints { bottom: calc(3.6rem + var(--sab)); }

/* ---- landscape prompt (rotate-to-play) ------------------------------- */
.rotate { position: absolute; inset: 0; z-index: 28; /* above .onboard (25) and every run overlay; below .toast (30) so an update stays reachable */ display: none; align-items: center; justify-content: center; flex-direction: column; gap: var(--s5); background: radial-gradient(120% 90% at 50% 30%, #1a1409 0%, var(--bg) 70%); color: var(--ink); text-align: center; padding: calc(var(--s6) + var(--sat)) var(--s5) calc(var(--s6) + var(--sab)); pointer-events: auto; }
.rotate .wordmark { font-size: clamp(3rem, 16vw, 5rem); text-align: center; }
.rotate .msg { font-size: 1rem; font-weight: 700; letter-spacing: .34em; text-transform: uppercase; color: var(--ink-dim); }
.rotate i { display: block; width: 3rem; height: 5.2rem; border: 3px solid var(--amber); border-radius: var(--r2); box-shadow: 0 0 24px -6px var(--amber); animation: rot 1.6s var(--ease) infinite; }
.rotate .btn.reload { min-height: 56px; padding: 0 var(--s6); font-size: 1rem; margin-top: var(--s3); }
.rotate .build { position: absolute; bottom: calc(var(--s4) + var(--sab)); left: 0; right: 0; font-size: .7rem; letter-spacing: .16em; text-transform: uppercase; opacity: .4; }
@keyframes rot { 0%, 20% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
@media (orientation: portrait) and (pointer: coarse) and (max-width: 900px) { .rotate.armed { display: flex; } }

/* Short landscape phones (844×390): tighter type, single-row menus above the fold. html.short = logical height ≤ 500 px (orientation.ts). */
html.short .menu-title { font-size: clamp(2.2rem, calc(15 * var(--vh)), 4rem); }
html.short #ui .menu-item { font-size: clamp(1.4rem, calc(4 * var(--vw)), 2.4rem); }
html.short #ui .menu-item[data-id="play"] { font-size: clamp(1.8rem, calc(5.6 * var(--vw)), 3.2rem); }
html.short #ui .menu-item.minor { font-size: .72rem; }
html.short .tracks-head { top: calc(var(--s3) + var(--sat)); }
html.short .tracks-head h1 { font-size: 1.8rem; }
html.short .tiers { top: calc(var(--s3) + var(--sat) + 3.2rem); bottom: calc(var(--s5) + var(--sab)); }
html.short .tier-row { padding: var(--s1) 0 var(--s1); }
html.short .card { width: clamp(10.5rem, calc(19 * var(--vw)), 13rem); }
html.short .card .name { font-size: 1.15rem; }
html.short .settings-wrap { padding-top: calc(var(--s3) + var(--sat)); padding-bottom: calc(var(--s4) + var(--sab)); gap: var(--s2); grid-template-columns: minmax(16rem, 30rem); }
html.short .settings-foot .controls-line { display: none; }
html.short .settings-wrap h1 { font-size: 1.8rem; }
html.short .setting { min-height: 46px; padding: var(--s1) var(--s3); }
html.short .setting .lab { font-size: 1.05rem; }
html.short .setting .lab small { display: none; }
html.short .legend { bottom: calc(var(--s2) + var(--sab)); font-size: .72rem; }
html.short .corner-brand { bottom: calc(var(--s2) + var(--sab)); }
html.short .overlay, html.short .results { padding: calc(var(--s4) + var(--sat)) calc(var(--s5) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s5) + var(--sal)); row-gap: var(--s2); }
html.short .ov-name { font-size: 2.2rem; }
html.short .tile { width: 160px; height: 92px; gap: 8px; font-size: 1.05rem; }
html.short .tile svg { width: 22px; height: 22px; }
html.short .tiles { gap: var(--s3); }
html.short .ov-foot { min-height: 36px; }
html.short .results .time { font-size: 4.4rem; }
html.short .results .faults { font-size: 1.05rem; }
html.short .results .pb { font-size: .82rem; }
html.short .results .medal i { width: 40px; height: 40px; }
html.short .results .medal { font-size: .62rem; }
html.short .results .medal small { display: none; }
html.short .results .medals { gap: var(--s2); margin-top: var(--s1); }
html.short .results .headline { gap: var(--s1); }
/* Narrow: logical width ≤ 720 px. */
html.narrow .hud-timer { font-size: 1.9rem; }
html.narrow .hud-faults { font-size: 1.25rem; }
html.narrow .strip { width: calc(26 * var(--vw)); }
html.narrow .banner.count { font-size: 6.5rem; }
html.narrow .banner.go { font-size: 8rem; }
html.narrow .banner.finish { font-size: 3rem; }
html.narrow .settings-wrap { grid-template-columns: 1fr; }
@media (prefers-reduced-motion: reduce) {
  .overlay.show .tile, .overlay.show .ov-foot { animation: fadein var(--t2) var(--ease) both; }
  .results .time, .results .faults, .results .medals, .results .pb, .results .tiles, .results .ov-foot { transform: none; }
  .menu-keyart.loaded { animation: none; }
}
`;


export const REVIEW_CSS = /* css */ `
/* ---- Level reviewer (docs/design/game.md §21) ---- */
.review-pick-screen { background: linear-gradient(90deg, rgba(6,7,9,.95) 0%, rgba(6,7,9,.88) 55%, rgba(6,7,9,.62) 100%); display: flex; flex-direction: column; padding: calc(var(--s4) + var(--sat)) calc(var(--s5) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s5) + var(--sal)); }
.rvp-head { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; padding-right: 8rem; }
.rvp-head .ov-kicker { color: var(--amber); }
.rvp-head .ov-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.6rem; line-height: 1; text-transform: uppercase; }
.rvp-head .ov-stats { color: var(--ink-dim); font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }
.rvp-rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; margin-top: var(--s3); display: flex; flex-direction: column; gap: var(--s1); padding-right: var(--s2); }
#ui .rvp-row { -webkit-appearance: none; appearance: none; flex: 0 0 auto; display: grid; grid-template-columns: 6.2rem 1fr auto; grid-template-rows: auto auto; column-gap: var(--s3); align-items: center; min-height: 48px; padding: var(--s2) var(--s3); border: 1px solid var(--line-2); border-radius: var(--r1); background: rgba(255,255,255,.04); color: var(--ink); text-align: left; cursor: pointer; font-family: var(--font); }
#ui .rvp-row.on { border-color: var(--amber); background: rgba(255,176,32,.1); }
#ui .rvp-row .tier { grid-row: 1 / span 2; font-size: .68rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--amber); }
#ui .rvp-row .name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.15rem; line-height: 1; text-transform: uppercase; }
#ui .rvp-row .id { grid-column: 2; font-size: .68rem; letter-spacing: .1em; color: var(--ink-mute); }
#ui .rvp-row .noted { grid-column: 3; grid-row: 1 / span 2; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
#ui .rvp-row .noted.some { color: var(--green); }
/* The overlay: nothing takes a pointer until live.ts has seen it drawn; the stage is inert while riding (the strip owns the finger). */
.review-ui { position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none; z-index: 5; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.review-ui.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease), visibility 0s; }
.review-ui:not(.live) * { pointer-events: none !important; }
.review-ui.live .rv-stage, .review-ui.live button, .review-ui.live textarea { pointer-events: auto; }
.review-ui.riding .rv-stage { pointer-events: none !important; }
.rv-stage { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.rv-stage:active { cursor: grabbing; }
.rv-top { position: absolute; left: calc(var(--s4) + var(--sal)); right: calc(var(--s4) + var(--sar)); top: calc(var(--s3) + var(--sat)); display: flex; align-items: flex-start; gap: var(--s3); pointer-events: none; }
.rv-head { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 0; }
.rv-head .ov-kicker { color: var(--amber); }
.rv-head .ov-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.3rem; line-height: 1; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-head .ov-stats { color: var(--ink-dim); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-strip { display: flex; gap: var(--s1); padding: var(--s1); border-radius: var(--r2); background: rgba(9,11,15,.82); border: 1px solid var(--line); box-shadow: var(--plate); }
#ui .rv-seg { -webkit-appearance: none; appearance: none; width: 44px; height: 44px; border: 1px solid transparent; border-radius: var(--r1); background: transparent; color: var(--ink-dim); font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.2rem; cursor: pointer; position: relative; }
#ui .rv-seg.noted::after { content: ""; position: absolute; right: 5px; top: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
#ui .rv-seg.on { background: var(--amber); color: var(--amber-ink); }
#ui .rv-seg.on.noted::after { background: var(--amber-ink); }
#ui .rv-exit { -webkit-appearance: none; appearance: none; flex: 0 0 auto; display: inline-flex; align-items: center; gap: .35em; min-height: 44px; padding: 0 1.1rem 0 .8rem; border: 1px solid var(--line); border-radius: 999px; background: var(--slab); color: var(--ink); font: 700 .82rem/1 var(--font); letter-spacing: .12em; text-transform: uppercase; cursor: pointer; }
#ui .rv-exit span { font-size: 1.3em; line-height: 1; margin-top: -.1em; }
/* Notes card bottom-left: never wider than 40 % of the view, so the track centre stays clear. */
.rv-card { position: absolute; left: calc(var(--s4) + var(--sal)); bottom: calc(var(--s3) + var(--sab)); width: min(340px, calc(40 * var(--vw))); max-height: calc(100% - 96px - var(--sat) - var(--sab)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3); border-radius: var(--r2); background: rgba(9,11,15,.86); border: 1px solid var(--line); box-shadow: var(--plate); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.review-ui.notes-off .rv-card, .review-ui.riding .rv-card { opacity: 0; transform: translateY(12px); }
.review-ui.notes-off .rv-card *, .review-ui.riding .rv-card * { pointer-events: none !important; }
.rv-seg-title { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.05rem; line-height: 1; text-transform: uppercase; display: flex; align-items: baseline; gap: .5em; }
.rv-seg-title b { color: var(--amber); }
.rv-seg-title span { margin-left: auto; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .7rem; letter-spacing: .1em; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.rv-kinds { display: flex; flex-wrap: wrap; gap: 4px; }
.rv-kinds span { font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-dim); background: rgba(255,255,255,.06); border-radius: 3px; padding: 2px 6px; }
.rv-kinds span b { color: var(--ink); margin-left: .3em; }
.rv-kinds span.none { background: transparent; color: var(--ink-mute); }
.rv-rate { display: flex; gap: 2px; }
#ui .rv-star { -webkit-appearance: none; appearance: none; width: 44px; height: 44px; border: 0; background: transparent; color: var(--ink-mute); font-size: 1.5rem; line-height: 1; cursor: pointer; }
#ui .rv-star.on { color: var(--amber); text-shadow: 0 0 10px rgba(255,176,32,.5); }
.rv-tags { display: flex; flex-wrap: wrap; gap: 4px; }
#ui .rv-tag { -webkit-appearance: none; appearance: none; min-height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink-dim); font: 700 .7rem/1 var(--font); letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
#ui .rv-tag.on { background: var(--amber); border-color: transparent; color: var(--amber-ink); }
#ui .rv-comment { -webkit-appearance: none; appearance: none; width: 100%; box-sizing: border-box; resize: none; border: 1px solid var(--line); border-radius: var(--r1); background: rgba(255,255,255,.06); color: var(--ink); font: 500 .9rem/1.3 var(--font); padding: var(--s2); -webkit-user-select: text; user-select: text; }
#ui .rv-comment:focus { outline: none; border-color: var(--amber); }
.rv-actions { display: flex; gap: var(--s2); }
#ui .rv-actions button, #ui .rv-bar button { -webkit-appearance: none; appearance: none; border: 1px solid var(--line); background: var(--slab-3); color: var(--ink); border-radius: var(--r1); min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-family: var(--font); font-weight: 700; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; padding: 0 var(--s3); transition: background var(--t1), color var(--t1); }
#ui .rv-actions button.flash { background: var(--green); color: #062; border-color: transparent; }
#ui .rv-actions .rv-copy { flex: 1 1 auto; }
.rv-bar { position: absolute; right: calc(var(--s4) + var(--sar)); bottom: calc(var(--s3) + var(--sab)); display: flex; gap: var(--s2); padding: var(--s1); border-radius: var(--r2); background: rgba(9,11,15,.82); border: 1px solid var(--line); box-shadow: var(--plate); }
#ui .rv-bar button.on { background: var(--amber); color: var(--amber-ink); border-color: transparent; }
#ui .rv-bar .rv-zoom { font-size: 1.3rem; padding: 0; }
.review-ui.riding .rv-bar .rv-notes, .review-ui.riding .rv-bar .rv-fly, .review-ui.riding .rv-bar .rv-zoom { display: none; }
/* Short phones (390 high): the card shrinks to the essentials. */
html.short .rv-card { width: min(300px, calc(38 * var(--vw))); gap: var(--s1); padding: var(--s2); }
html.short .rv-kinds { max-height: 2.6em; overflow: hidden; }
html.short #ui .rv-comment { font-size: .85rem; }
`;


/* ---- review inbox (src/ui/inbox.ts): the HUD "✎ Note" control + the note sheet ---- */
export const INBOX_CSS = /* css */ `
/* Right edge under the top band (below the restart button / progress strip and the touch fps meter at 4.2rem), clear of the timer and the bottom touch strip; ≥ 44 pt. */
.hud-note { position: absolute; right: calc(.8rem + var(--sar)); top: calc(5.3rem + var(--sat)); z-index: 3; display: inline-flex; align-items: center; gap: .35em; min-width: 44px; min-height: 44px; padding: 0 .75rem; border: 1px solid var(--line); border-radius: 999px; background: var(--slab); color: var(--ink); font: 700 .78rem/1 var(--font); letter-spacing: .12em; text-transform: uppercase; box-shadow: var(--plate); cursor: pointer; pointer-events: none; opacity: .85; transition: opacity var(--t2) var(--ease); -webkit-tap-highlight-color: transparent; }
.hud-note span { font-size: 1.05rem; line-height: 1; }
.hud-note.live { pointer-events: auto; }
.hud-note:hover, .hud-note:focus-visible { opacity: 1; border-color: var(--amber); }
.hud.results-on .hud-note, .hud.replay-on .hud-note, .hud.review-on .hud-note { opacity: 0; pointer-events: none; }
.inbox { position: absolute; inset: 0; z-index: 29; /* above .rotate (28), below .toast (30) */ display: flex; align-items: center; justify-content: center; padding: calc(var(--s3) + var(--sat)) calc(var(--s4) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s4) + var(--sal)); background: rgba(6,7,9,.6); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.inbox.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease); }
.inbox.live { pointer-events: auto; }
.inbox:not(.live) * { pointer-events: none !important; }
.inbox-card { width: min(100%, 44rem); max-height: 100%; display: flex; flex-direction: column; background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); box-shadow: var(--plate), 0 18px 40px rgba(0,0,0,.6); overflow: hidden; }
.inbox-head { display: flex; align-items: center; justify-content: space-between; padding: var(--s2) var(--s2) var(--s2) var(--s4); font-size: .9rem; letter-spacing: .12em; text-transform: uppercase; color: var(--amber); border-bottom: 1px solid var(--line); }
.inbox-close { min-width: 44px; min-height: 44px; border: 0; background: transparent; color: var(--ink); font-size: 1rem; cursor: pointer; }
.inbox-body { display: grid; grid-template-columns: 9rem 1fr; grid-auto-rows: min-content; gap: var(--s2) var(--s3); padding: var(--s3) var(--s4); overflow: auto; -webkit-overflow-scrolling: touch; min-height: 0; }
.inbox-shot { grid-row: 1 / span 2; width: 9rem; max-width: 100%; border-radius: var(--r1); border: 1px solid var(--line); background: #000; align-self: start; }
.inbox-shot[hidden] { display: none; }
.inbox-text { grid-column: 2; width: 100%; min-height: 4.6rem; resize: vertical; padding: var(--s2) var(--s3); border: 1px solid var(--line); border-radius: var(--r1); background: rgba(255,255,255,.06); color: var(--ink); font: 400 1rem/1.35 var(--font); letter-spacing: .01em; -webkit-user-select: text; user-select: text; }
.inbox-text:focus { outline: 2px solid var(--amber); outline-offset: -1px; }
.inbox-chips { grid-column: 2; display: flex; flex-wrap: wrap; gap: .3rem; }
.inbox-chips .chip { display: inline-flex; align-items: baseline; gap: .35em; padding: .2rem .5rem; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.05); font: 600 .72rem/1.2 var(--mono); color: var(--ink); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inbox-chips .chip i { font-style: normal; color: var(--ink-mute); text-transform: uppercase; letter-spacing: .1em; font-size: .62rem; }
.inbox-pw { grid-column: 1 / -1; display: flex; flex-direction: column; gap: .3rem; }
.inbox-pw[hidden] { display: none; }
.inbox-pw label { display: flex; align-items: center; gap: var(--s3); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .78rem; color: var(--ink-dim); }
.inbox-pw input { flex: 1; min-height: 44px; padding: 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r1); background: rgba(255,255,255,.06); color: var(--ink); font: 400 1rem/1 var(--mono); -webkit-user-select: text; user-select: text; }
.inbox-pw small { color: var(--ink-mute); font-size: .74rem; }
.inbox-status { grid-column: 1 / -1; min-height: 1.1em; font-size: .8rem; color: var(--ink-mute); }
.inbox-status.bad { color: #ff7a6a; }
.inbox-status.good { color: #8fe38f; }
.inbox-foot { display: flex; justify-content: flex-end; gap: var(--s2); padding: var(--s2) var(--s4) calc(var(--s2)); border-top: 1px solid var(--line); }
.inbox-toast { position: absolute; z-index: 30; left: 50%; bottom: calc(var(--s5) + var(--sab)); transform: translate(-50%, 140%); padding: var(--s2) var(--s4); background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); font-weight: 700; letter-spacing: .06em; white-space: nowrap; opacity: 0; transition: transform var(--t3) var(--ease), opacity var(--t3) var(--ease); pointer-events: none; }
.inbox-toast.show { transform: translate(-50%, 0); opacity: 1; }
.inbox-toast.good { border-color: #4caf50; }
.inbox-toast.bad { border-color: #ff7a6a; }
html.short .inbox-body { grid-template-columns: 6.5rem 1fr; padding: var(--s2) var(--s3); }
html.short .inbox-shot { width: 6.5rem; }
html.short .inbox-text { min-height: 3.2rem; }
html.short .inbox-chips .chip { font-size: .64rem; }
`;

export const UI_CSS = TOKENS_CSS + FRONT_CSS + HUD_CSS + REVIEW_CSS + INBOX_CSS;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'ui-css';
  el.textContent = UI_CSS;
  document.head.appendChild(el);
}

/* ---- track select — one continuous world map (assets/design/tracks/round4/SPEC.md § C "Ascent", ask #38) --------
 * Owned by src/ui/trackMap.ts / TrackSelectScreen; injected by `injectTrackMapStyles()` as its own <style>.
 * The old `.tiers` / `.carousel` / `.card` rules above are kept untouched (other screens' cards reuse them).
 * The map is a 2-D camera: one scene root (`.tscene`, WORLD px wide) moved with translate/scale; nothing scrolls.
 * Pins and the gate counter-scale by `--inv` (1 / zoom) so they keep their 44 px at any zoom; past `.far` they fold
 * to dots and stop taking pointers (nothing hit-testable under 44 px). */
export const TRACK_MAP_CSS = /* css */ `
.tracks-screen { background: linear-gradient(180deg, rgba(6,7,9,.86) 0%, rgba(6,7,9,.8) 100%); --tm-top: calc(var(--s5) + var(--sat) + 2.7rem); --tm-x: calc(calc(5 * var(--vw)) + var(--sal)); --tm-xr: calc(calc(5 * var(--vw)) + var(--sar)); --alt-w: 6.2rem; --card-w: min(17rem, 36vw); }
.tracks-screen .legend { left: calc(var(--tm-x) + var(--card-w) + var(--s3)); right: auto; bottom: calc(var(--s3) + var(--sab)); font-size: .64rem; text-shadow: var(--outline); z-index: 3; pointer-events: none; }
.tmap { position: absolute; left: 0; right: 0; top: var(--tm-top); bottom: 0; overflow: hidden; touch-action: none; overscroll-behavior: contain; cursor: grab; -webkit-user-select: none; user-select: none; }
.tmap.grabbing { cursor: grabbing; }
.tscene { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; --inv: 1; }
/* Regions: one plate each at its world offset; the summit in front (z rises with the index) so each cut face reads as a terrace over the one below. */
.tregion { position: absolute; width: 600px; height: 400px; pointer-events: none; }
.ttile { position: absolute; inset: 0; --lamp: var(--amber); }
.ttile .glow { position: absolute; left: 10%; right: 10%; top: 30%; bottom: 0; border-radius: 50%; background: radial-gradient(closest-side, var(--lamp), transparent 70%); opacity: .16; filter: blur(12px); pointer-events: none; }
.ttile .tart { position: absolute; inset: 0; background: center bottom / contain no-repeat; opacity: 0; transition: opacity var(--t3) var(--ease); }
.ttile .tart.loaded { opacity: 1; }
/* Fallback slab until the plate decodes (or when it never does): a biome-tinted isometric diamond with a front face. */
.ttile .slab { position: absolute; left: 3%; right: 3%; top: 8%; bottom: 6%; background: var(--tint, #333); clip-path: polygon(50% 0, 100% 44%, 100% 62%, 50% 100%, 0 62%, 0 44%); opacity: .85; filter: saturate(.7) brightness(.8); }
.ttile .slab::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 100%; background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 60%, rgba(0,0,0,.6)); }
.ttile .tart.loaded + .slab { display: none; }
/* The seam under a plate: the cliff band from this plate's front-left surface edge (18,183)→(300,335) down to the terrace below's back-right edge (18,333)→(300,484) — one iso step + CLIFF lower — in the biome's tint, strata-striped and darkening toward the foot; the plate's own cut face (art) covers its top 41 px. The quay (Industrial over the apron) is a straight wall under both front edges. */
/* The massif under the stack (one polygon from the apron to the summit, world px): dark stone with faint strata, so the far view is one mountain. */
.tmass { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; background: linear-gradient(180deg, #2b2e36 0%, #17191e 45%, #0a0b0e 100%), #101216; }
.tmass::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(118deg, rgba(255,255,255,.035) 0 3px, rgba(0,0,0,0) 3px 14px, rgba(0,0,0,.2) 14px 19px, rgba(0,0,0,0) 19px 31px); }
.tseam { position: absolute; width: 600px; height: 600px; pointer-events: none; z-index: 1; --cut: polygon(18px 183px, 300px 335px, 300px 484px, 18px 333px); }
.tseam.quay { --cut: polygon(18px 183px, 300px 335px, 582px 183px, 582px 600px, 300px 600px, 18px 600px); }
.tseam::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--tint, #333) 55%, #000) 30%, color-mix(in srgb, var(--tint, #333) 30%, #000) 60%, #06070a 100%); clip-path: var(--cut); filter: saturate(.55); }
.tseam::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(118deg, rgba(255,255,255,.06) 0 2px, rgba(0,0,0,0) 2px 9px, rgba(0,0,0,.18) 9px 14px, rgba(0,0,0,0) 14px 23px), linear-gradient(180deg, rgba(0,0,0,.35) 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,.6) 100%); clip-path: var(--cut); }
.tseam.quay::after { background: repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,0) 2px 40px), repeating-linear-gradient(180deg, rgba(0,0,0,.25) 0 2px, rgba(0,0,0,0) 2px 26px), linear-gradient(180deg, rgba(0,0,0,.2), rgba(0,0,0,.7)); }
.troute, .tpins { position: absolute; inset: 0; pointer-events: none; }
.troute { z-index: 8; }
.tpins { z-index: 9; }
.troute .route { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.troute .route .dim { fill: none; stroke: rgba(255,176,32,.4); stroke-dasharray: 6 6; vector-effect: non-scaling-stroke; stroke-width: 3px; }
.troute .route .lit { fill: none; stroke: var(--amber); vector-effect: non-scaling-stroke; stroke-width: 3px; stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(255,176,32,.9)) drop-shadow(0 0 10px rgba(255,138,31,.6)); }
/* Region name + count engraved on the plate's front-left cut face (skewed along the iso edge, 28.2° = 151 / 282), the altitude marks of SPEC § C. */
.ttile .title { position: absolute; left: 130px; top: 272px; transform-origin: 0 0; transform: skewY(28.2deg); font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.35rem; line-height: 1; text-transform: uppercase; letter-spacing: .04em; color: rgba(255,255,255,.62); text-shadow: 0 1px 0 rgba(255,255,255,.12), 0 -1px 0 rgba(0,0,0,.8), 0 2px 8px rgba(0,0,0,.8); pointer-events: none; white-space: nowrap; }
.ttile .title b { color: var(--ink); font-variant-numeric: tabular-nums; }
.ttile .title small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .58rem; letter-spacing: .22em; color: var(--ink-dim); margin-top: .25em; }
/* Trophy ledge on the front face: one pedestal per campaign track — a lit medal, an empty ring, or a padlock. */
.ttile .ledge { position: absolute; left: 330px; top: 318px; transform-origin: 0 0; transform: skewY(-28.2deg); display: flex; gap: 6px; pointer-events: none; }
.ttile .ledge i { display: block; width: 14px; height: 14px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor, 0 2px 0 rgba(0,0,0,.6); }
.ttile .ledge i.open { background: transparent; border: 1.5px dashed rgba(255,176,32,.7); box-shadow: none; }
.ttile .ledge i.locked { background: rgba(255,255,255,.14); box-shadow: none; -webkit-mask: none; }
.ttile .ledge i.locked::after { content: ""; display: block; width: 100%; height: 100%; background: rgba(255,255,255,.6); -webkit-mask: var(--padlock) center / 70% no-repeat; mask: var(--padlock) center / 70% no-repeat; }
.ttile .ledge i.platinum { color: var(--plat); } .ttile .ledge i.gold { color: var(--gold); } .ttile .ledge i.silver { color: var(--silver); } .ttile .ledge i.bronze { color: var(--bronze); }
.tracks-screen { --padlock: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E"); }
/* Pins: a post with the code, the 44 px medal disc, a name plate and the Best / Target line; anchored at the disc's centre in world px, counter-scaled so the disc stays 44 px at any zoom. */
#ui .tpin { position: absolute; transform: translate(-50%, -36px) scale(var(--inv)); transform-origin: 50% 36px; display: flex; flex-direction: column; align-items: center; gap: 2px; width: max-content; max-width: 5.8rem; min-width: 44px; padding: 0 2px 4px; border: 0; background: transparent; color: var(--ink); cursor: pointer; z-index: 2; pointer-events: auto; transition: transform var(--t2) var(--ease); }
.tmap.grabbing .tpin, .tscene.far .tpin { transition: none; }
#ui .tpin .code { font-size: .6rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-dim); text-shadow: var(--outline); height: 12px; line-height: 12px; }
#ui .tpin .disc { position: relative; width: 44px; height: 44px; border-radius: 50%; background: var(--slab-2) center / 78% no-repeat; box-shadow: 0 0 0 2px rgba(255,255,255,.22), 0 6px 14px rgba(0,0,0,.7); }
#ui .tpin .disc::after { content: ""; position: absolute; left: 50%; top: 100%; width: 2px; height: 8px; margin-left: -1px; background: rgba(255,255,255,.35); }
#ui .tpin .disc.plain::before { content: ""; position: absolute; inset: 7px; border-radius: 50%; background: currentColor; box-shadow: inset 0 -3px 0 rgba(0,0,0,.35); }
#ui .tpin .disc.none::before { content: ""; position: absolute; inset: 7px; border-radius: 50%; border: 2px dashed rgba(255,255,255,.45); }
#ui .tpin .disc.locked::before { content: ""; position: absolute; inset: 9px; background: rgba(255,255,255,.7); -webkit-mask: var(--padlock) center / contain no-repeat; mask: var(--padlock) center / contain no-repeat; }
#ui .tpin .disc.platinum { color: var(--plat); } #ui .tpin .disc.gold { color: var(--gold); } #ui .tpin .disc.silver { color: var(--silver); } #ui .tpin .disc.bronze { color: var(--bronze); }
#ui .tpin .disc.gold, #ui .tpin .disc.silver, #ui .tpin .disc.bronze, #ui .tpin .disc.platinum { box-shadow: 0 0 0 2px rgba(255,255,255,.22), 0 0 14px -2px currentColor, 0 6px 14px rgba(0,0,0,.7); }
#ui .tpin .plate { margin-top: 8px; max-width: 100%; padding: 2px 6px; border-radius: 3px; background: var(--slab-2); border: 1px solid var(--line-2); font-family: var(--display); font-style: italic; font-weight: 900; font-size: .8rem; line-height: 1.05; text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
#ui .tpin .times { font-size: .6rem; letter-spacing: .06em; color: var(--ink-dim); font-variant-numeric: tabular-nums; text-shadow: var(--outline); white-space: nowrap; }
#ui .tpin .times b { color: var(--ink); font-weight: 700; } #ui .tpin .times b.ahead { color: var(--green); }
#ui .tpin .rule { font-size: .52rem; line-height: 1.15; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--amber); text-shadow: var(--outline); white-space: normal; text-align: center; max-width: 100%; }
#ui .tpin.proving { max-width: 5rem; }
#ui .tpin .flag { position: absolute; left: 50%; top: -14px; transform: translateX(-50%) rotate(-4deg); padding: 1px 5px; background: var(--amber); color: var(--amber-ink); font-size: .52rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; border-radius: 2px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
#ui .tpin .tag { position: absolute; left: calc(50% + 18px); top: 14px; padding: 1px 4px; border-radius: 3px; font-size: .5rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
#ui .tpin .tag.ghost { background: rgba(255,255,255,.16); color: var(--ink); }
#ui .tpin .tag.pro { background: var(--blue); color: #0b1a2e; top: 28px; }
#ui .tpin.locked { opacity: .6; cursor: default; }
/* Under the card / the altimeter / the MENU pill: drawn dim, takes no pointer (no tappable hides under another). */
#ui .tpin.shaded, #ui .gate.shaded { opacity: .25; pointer-events: none; }
#ui .tpin.locked .plate { filter: grayscale(1); }
#ui .tpin.on { z-index: 4; transform: translate(-50%, -40px) scale(var(--inv)); }
#ui .tpin.on .disc { box-shadow: 0 0 0 3px var(--amber), 0 0 22px -2px rgba(255,176,32,.85), 0 6px 14px rgba(0,0,0,.7); }
#ui .tpin.on .plate { border-color: var(--amber); color: var(--amber); }
#ui .tpin.on .code { color: var(--amber); }
#ui .tpin.go { animation: pingo var(--t3) var(--ease) both; z-index: 5; }
@keyframes pingo { 0% { transform: translate(-50%, -40px) scale(var(--inv)); opacity: 1; } 100% { transform: translate(-50%, calc(-40px - 14 * var(--vh))) scale(calc(1.12 * var(--inv))); opacity: 0; } }
/* Below ZOOM.plates (.mid): code + disc only — the name plates would collide at this scale; the card carries the name. */
#ui .tscene.mid .tpin .plate, #ui .tscene.mid .tpin .times, #ui .tscene.mid .tpin .rule, #ui .tscene.mid .tpin .tag { display: none; }
/* Zoomed out (.far): pins fold to a dot on a post — the plate, times, tags go; nothing here takes a pointer (a tap on the map flies in). */
#ui .tscene.far .tpin { pointer-events: none; }
#ui .tscene.far .tpin .plate, #ui .tscene.far .tpin .times, #ui .tscene.far .tpin .rule, #ui .tscene.far .tpin .tag, #ui .tscene.far .tpin .flag { display: none; }
/* The tier gate: a hazard-tape barrier across the trail at the seam — the tier and its rule on the tape, the next locked track under it (a tap flies to it). Counter-scaled like a pin. */
#ui .gate { position: absolute; transform: translate(-50%, -50%) scale(var(--inv)); transform-origin: 50% 50%; display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 44px; min-width: 44px; padding: 0 0 4px; border: 0; background: transparent; color: var(--ink); text-align: center; cursor: pointer; z-index: 3; pointer-events: auto; }
#ui .gate b { display: block; padding: 4px 10px; background: repeating-linear-gradient(-45deg, var(--amber) 0 10px, #15120a 10px 20px); color: #fff; font-size: .56rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; box-shadow: 0 3px 10px rgba(0,0,0,.7); text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000; border-top: 2px solid #15120a; border-bottom: 2px solid #15120a; }
#ui .gate span { display: block; padding: 2px 6px; background: var(--slab-2); border: 1px solid var(--line-2); border-left: 3px solid var(--amber); border-radius: 0 3px 3px 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: .72rem; text-transform: uppercase; line-height: 1.05; white-space: nowrap; }
#ui .gate small { display: inline-flex; align-items: center; gap: .35em; font-size: .5rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--amber); text-shadow: var(--outline); }
#ui .gate small::before { content: ""; width: 1em; height: 1em; background: currentColor; -webkit-mask: var(--padlock) center / contain no-repeat; mask: var(--padlock) center / contain no-repeat; }
#ui .gate::after { content: ""; position: absolute; left: -22px; right: -22px; top: 50%; height: 2px; background: repeating-linear-gradient(90deg, rgba(255,176,32,.9) 0 6px, transparent 6px 12px); z-index: -1; }
#ui .tscene.far .gate { pointer-events: none; }
#ui .tscene.far .gate span, #ui .tscene.far .gate small { display: none; }
/* The rising card (A3d): the focused pin's card, bottom-left in screen space; RIDE · ▶ GHOST · REVIEW live on it. */
.tcard { position: absolute; left: var(--tm-x); bottom: calc(var(--s3) + var(--sab)); width: var(--card-w); padding: var(--s3) var(--s4) var(--s3); border: 1px solid var(--line-2); border-top: 2px solid var(--amber); border-radius: var(--r2); background: var(--slab-2); box-shadow: 0 10px 30px rgba(0,0,0,.6); display: flex; flex-direction: column; gap: var(--s1); min-width: 0; z-index: 3; }
.tcard.rise { animation: tcrise var(--t2) var(--ease) both; }
@keyframes tcrise { from { transform: translateY(12px); opacity: .2; } to { transform: none; opacity: 1; } }
.tcard .tc-head { display: flex; align-items: center; gap: var(--s2); font-size: .64rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-dim); }
.tcard .tc-head b { color: var(--amber); }
.tcard .tc-head span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tcard .tc-head .tc-medal { flex: 0 0 auto; margin-left: auto; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: currentColor center / cover no-repeat; box-shadow: inset 0 -3px 0 rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.6); }
.tcard .tc-head .tc-medal.img { background-color: transparent; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
.tcard .tc-head .tc-medal.none { background: rgba(255,255,255,.06); border: 1px dashed var(--line); box-shadow: none; }
.tcard .tc-head .tc-medal.platinum { color: var(--plat); } .tcard .tc-head .tc-medal.gold { color: var(--gold); } .tcard .tc-head .tc-medal.silver { color: var(--silver); } .tcard .tc-head .tc-medal.bronze { color: var(--bronze); }
.tcard .tc-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: clamp(1.2rem, calc(5.2 * var(--vh)), 1.7rem); line-height: .95; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tcard .tc-tech { font-size: .72rem; color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tcard .tc-times { display: flex; gap: var(--s4); font-size: .74rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.tcard .tc-times b { color: var(--ink); font-weight: 700; } .tcard .tc-times b.ahead { color: var(--green); }
.tcard .tc-rule { display: inline-flex; align-items: center; gap: .45em; font-size: .62rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--amber); }
.tcard .tc-rule::before { content: ""; flex: 0 0 auto; width: 1em; height: 1em; background: currentColor; -webkit-mask: var(--padlock) center / contain no-repeat; mask: var(--padlock) center / contain no-repeat; }
.tcard .board { display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
.tcard .board span { font-size: .58rem; font-weight: 700; line-height: 1; padding: 2px 3px; border-radius: 3px; background: rgba(0,0,0,.45); color: var(--ink); border-left: 3px solid currentColor; white-space: nowrap; }
.tcard .board span.platinum { color: var(--plat); } .tcard .board span.gold { color: var(--gold); } .tcard .board span.silver { color: var(--silver); } .tcard .board span.bronze { color: var(--bronze); }
.tcard .board span b { color: var(--ink); font-weight: 700; }
.tcard .tc-actions { display: flex; gap: var(--s2); margin-top: var(--s1); }
#ui .tcard .tc-actions button { -webkit-appearance: none; appearance: none; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: .35em; min-height: 44px; min-width: 44px; padding: 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r1); background: rgba(255,255,255,.06); color: var(--ink); font: 700 .74rem/1 var(--font); letter-spacing: .1em; text-transform: uppercase; cursor: pointer; white-space: nowrap; }
#ui .tcard .tc-actions button.tc-ride { flex: 1 1 auto; background: var(--amber); color: var(--amber-ink); border-color: transparent; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.05rem; letter-spacing: .04em; }
#ui .tcard .tc-actions button.tc-ride:disabled { background: rgba(255,255,255,.1); color: var(--ink-dim); cursor: default; }
#ui .tcard .tc-actions button[hidden] { display: none; }
#ui .tcard .tc-actions button.on { outline: 2px solid var(--ink); outline-offset: 2px; }
/* The altimeter: the mountain's regions as rungs on the right edge, the summit at the top, the current one bracketed amber; a tap flies there. Inside the safe area, under the MENU pill, above the home indicator. */
.tmini { position: absolute; right: calc(var(--s4) + var(--sar)); top: calc(var(--s4) + var(--sat) + 44px + var(--s2)); bottom: calc(var(--s3) + var(--sab)); width: var(--alt-w); display: flex; flex-direction: column; gap: 3px; z-index: 3; }
.tmini::before { content: ""; position: absolute; left: -6px; top: 6px; bottom: 6px; width: 2px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.22) 50%, rgba(255,255,255,.04)); }
#ui .tm { -webkit-appearance: none; appearance: none; position: relative; flex: 1 1 0; min-width: 44px; min-height: 44px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 6px 0 8px; border: 1px solid var(--line-2); border-radius: var(--r1); background: var(--slab); color: var(--ink-dim); cursor: pointer; text-align: left; overflow: hidden; }
#ui .tm .tm-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#ui .tm .tm-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: .7rem; line-height: 1; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#ui .tm .tm-dots { display: flex; align-items: center; gap: 3px; font-size: .54rem; font-variant-numeric: tabular-nums; letter-spacing: .06em; white-space: nowrap; }
#ui .tm .tm-dots i { display: block; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
#ui .tm .tm-dots i.open { background: transparent; border: 1px dashed rgba(255,255,255,.5); }
#ui .tm .tm-dots i.locked { background: rgba(255,255,255,.55); -webkit-mask: var(--padlock) center / contain no-repeat; mask: var(--padlock) center / contain no-repeat; border-radius: 0; }
#ui .tm .tm-dots i.platinum { color: var(--plat); } #ui .tm .tm-dots i.gold { color: var(--gold); } #ui .tm .tm-dots i.silver { color: var(--silver); } #ui .tm .tm-dots i.bronze { color: var(--bronze); }
#ui .tm.locked { color: rgba(255,255,255,.4); }
#ui .tm.locked .tm-name::after { content: ""; display: inline-block; width: .8em; height: .8em; margin-left: .3em; vertical-align: -.05em; background: currentColor; -webkit-mask: var(--padlock) center / contain no-repeat; mask: var(--padlock) center / contain no-repeat; }
#ui .tm.on { color: var(--ink); border-color: var(--amber); box-shadow: inset 3px 0 0 var(--amber); }
.tracks-screen.leave .tmap, .tracks-screen.leave .tmini, .tracks-screen.leave .tcard { transition: opacity var(--t3) var(--ease); opacity: 0; }
html.short .tracks-screen { --tm-top: calc(var(--s4) + var(--sat) + 2.5rem); --card-w: min(15.5rem, 34vw); }
html.short .tracks-screen .legend { font-size: .6rem; }
html.short .tracks-head { top: calc(var(--s4) + var(--sat)); }
html.short .tcard { padding: var(--s2) var(--s3); gap: 2px; }
html.short .tcard .tc-tech { display: none; }
html.short .tmini { gap: 2px; }
html.short #ui .tm { padding: 0 4px 0 6px; }
`;

let trackMapInjected = false;
/** One extra <style> for the diorama track select (kept out of UI_CSS so this block stays a self-contained append). */
export function injectTrackMapStyles(): void {
  if (trackMapInjected || typeof document === 'undefined') return;
  trackMapInjected = true;
  const el = document.createElement('style');
  el.id = 'trackmap-css';
  el.textContent = TRACK_MAP_CSS;
  document.head.appendChild(el);
}
