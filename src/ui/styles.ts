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
/* Faces (docs/design/CONTRACT.md § brand): display = Archivo Black (the wordmark's face), labels = Archivo (variable,
   wght 500-900 x wdth 100-125), body + HUD = Barlow Condensed. All SIL OFL 1.1, self-hosted in public/fonts. */
@font-face { font-family: "Rockhop Display"; font-style: normal; font-weight: 400 900; font-display: swap; src: url(fonts/ArchivoBlack-Rockhop.woff2) format("woff2"); }
@font-face { font-family: "Rockhop Sans"; font-style: normal; font-weight: 500 900; font-stretch: 100% 125%; font-display: swap; src: url(fonts/Archivo-Rockhop.woff2) format("woff2"); }
@font-face { font-family: "Rockhop Condensed"; font-style: italic; font-weight: 900; font-display: swap; src: url(fonts/BarlowCondensed-BlackItalic.woff2) format("woff2"); }
@font-face { font-family: "Rockhop UI"; font-style: normal; font-weight: 500; font-display: swap; src: url(fonts/BarlowCondensed-Medium.woff2) format("woff2"); }
@font-face { font-family: "Rockhop UI"; font-style: normal; font-weight: 700; font-display: swap; src: url(fonts/BarlowCondensed-Bold.woff2) format("woff2"); }
:root {
  /* brand palette (the A-brand sheet; src/ui/brand.ts PALETTE; docs/design/CONTRACT.md § brand) */
  --cream: #EFE3C8;
  --teal: #0F5C63;
  --vermilion: #E4572E;
  --coal: #1D2326;
  --ochre: #C99A4B;
  --cream-2: #E4D4B2;
  --teal-2: #0A454B;
  --vermilion-2: #C4441F;
  /* colour: text is a warm off-white on the coal overlays */
  --ink: #F6EFDF;
  --ink-dim: rgba(246,239,223,.66);
  --ink-mute: rgba(246,239,223,.4);
  --bg: #111719;
  --slab: rgba(20,27,30,.86);
  --slab-2: rgba(20,27,30,.93);
  --slab-3: rgba(27,35,38,.97);
  --line: rgba(239,227,200,.2);
  --line-2: rgba(239,227,200,.09);
  /* The accent was amber on black; it is vermilion now. The --amber names stay so every rule keeps its meaning (the accent). */
  --amber: var(--vermilion);
  --amber-2: var(--vermilion-2);
  --amber-ink: #FFF4E2;
  --green: #4ae37f;
  --red: #ff4d3a;
  --blue: #5aa9ff;
  --plat: #2FD6C8; --gold: #F2C14E; --silver: #cfd6df; --bronze: #D08A55;
  /* spacing 4/8/12/16/24/40 */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 40px;
  /* radii */
  --r1: 6px; --r2: 10px; --r3: 16px;
  /* motion: one easing, three durations */
  --ease: cubic-bezier(.2,.8,.2,1);
  --t1: 120ms; --t2: 240ms; --t3: 400ms;
  /* faces */
  --display: "Rockhop Display", "Archivo Black", "Arial Black", Impact, "Helvetica Neue", Arial, system-ui, sans-serif;
  --sans: "Rockhop Sans", "Archivo", "Helvetica Neue", Arial, system-ui, sans-serif;
  --font: "Rockhop UI", "Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  /* Guaranteed-contrast text: 1 px dark outline in 8 directions + soft drop. Reads over pure white at DPR 1–3. */
  --outline: 0 0 1px #000, 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 6px rgba(0,0,0,.9);
  --outline-heavy: 0 0 2px #000, 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 .08em .25em rgba(0,0,0,.85);
  --plate: 0 0 0 1px rgba(0,0,0,.6), 0 2px 12px rgba(0,0,0,.45);
  /* The survey contour texture of the cream cards (teal hairlines, tiled). */
  --contour: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160' viewBox='0 0 240 160'%3E%3Cg fill='none' stroke='%230F5C63' stroke-opacity='.14' stroke-width='1'%3E%3Cpath d='M-10 30c40-18 70 14 110-2s60-30 100-10 40 20 50 14'/%3E%3Cpath d='M-10 52c36-14 74 18 116 2s58-26 96-8 40 18 48 12'/%3E%3Cpath d='M-10 76c44-10 70 20 112 6s64-22 98-6 34 16 50 10'/%3E%3Cpath d='M-10 102c40-8 76 16 114 4s62-18 100-4 30 12 46 8'/%3E%3Cpath d='M-10 128c42-6 72 12 116 2s64-14 96-2 32 10 48 6'/%3E%3Cpath d='M60 150c20-16 44-18 60-8s30 10 44-4'/%3E%3C/g%3E%3C/svg%3E");
  /* The same lines drawn dark: the survey patch on the results ticket. */
  --contour-dark: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160' viewBox='0 0 240 160'%3E%3Cg fill='none' stroke='%230F5C63' stroke-opacity='.34' stroke-width='1'%3E%3Cpath d='M-10 30c40-18 70 14 110-2s60-30 100-10 40 20 50 14'/%3E%3Cpath d='M-10 52c36-14 74 18 116 2s58-26 96-8 40 18 48 12'/%3E%3Cpath d='M-10 76c44-10 70 20 112 6s64-22 98-6 34 16 50 10'/%3E%3Cpath d='M-10 102c40-8 76 16 114 4s62-18 100-4 30 12 46 8'/%3E%3Cpath d='M-10 128c42-6 72 12 116 2s64-14 96-2 32 10 48 6'/%3E%3Cpath d='M60 150c20-16 44-18 60-8s30 10 44-4'/%3E%3C/g%3E%3C/svg%3E");
  --contour-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160' viewBox='0 0 240 160'%3E%3Cg fill='none' stroke='%23FFF4E2' stroke-opacity='.16' stroke-width='1.2'%3E%3Cpath d='M-10 30c40-18 70 14 110-2s60-30 100-10 40 20 50 14'/%3E%3Cpath d='M-10 52c36-14 74 18 116 2s58-26 96-8 40 18 48 12'/%3E%3Cpath d='M-10 76c44-10 70 20 112 6s64-22 98-6 34 16 50 10'/%3E%3Cpath d='M-10 102c40-8 76 16 114 4s62-18 100-4 30 12 46 8'/%3E%3Cpath d='M-10 128c42-6 72 12 116 2s64-14 96-2 32 10 48 6'/%3E%3Cpath d='M60 150c20-16 44-18 60-8s30 10 44-4'/%3E%3C/g%3E%3C/svg%3E");
  /* A-results' wreath behind the earned medal: two gold laurel branches. */
  --laurel: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cg fill='%23D9A94E' stroke='%238C5A10' stroke-width='.7'%3E%3Cellipse cx='65.6' cy='92.8' rx='2.6' ry='6.4' transform='rotate(30 65.6 92.8)'/%3E%3Cellipse cx='62.4' cy='84.2' rx='2.6' ry='6.4' transform='rotate(110 62.4 84.2)'/%3E%3Cellipse cx='76.8' cy='86.9' rx='2.4' ry='6.0' transform='rotate(14 76.8 86.9)'/%3E%3Cellipse cx='71.4' cy='79.4' rx='2.4' ry='6.0' transform='rotate(94 71.4 79.4)'/%3E%3Cellipse cx='85.9' cy='78.1' rx='2.2' ry='5.5' transform='rotate(-2 85.9 78.1)'/%3E%3Cellipse cx='78.7' cy='72.4' rx='2.2' ry='5.5' transform='rotate(78 78.7 72.4)'/%3E%3Cellipse cx='92.3' cy='67.1' rx='2.1' ry='5.1' transform='rotate(-18 92.3 67.1)'/%3E%3Cellipse cx='83.7' cy='63.6' rx='2.1' ry='5.1' transform='rotate(62 83.7 63.6)'/%3E%3Cellipse cx='95.4' cy='54.8' rx='1.9' ry='4.6' transform='rotate(-34 95.4 54.8)'/%3E%3Cellipse cx='86.2' cy='53.8' rx='1.9' ry='4.6' transform='rotate(46 86.2 53.8)'/%3E%3Cellipse cx='94.9' cy='42.1' rx='1.7' ry='4.2' transform='rotate(-50 94.9 42.1)'/%3E%3Cellipse cx='85.8' cy='43.7' rx='1.7' ry='4.2' transform='rotate(30 85.8 43.7)'/%3E%3Cellipse cx='91.0' cy='30.0' rx='1.5' ry='3.7' transform='rotate(-66 91.0 30.0)'/%3E%3Cellipse cx='82.7' cy='34.0' rx='1.5' ry='3.7' transform='rotate(14 82.7 34.0)'/%3E%3Cpath d='M57.1 90.4A41 41 0 0 0 86.9 32.0' fill='none' stroke-width='1.6'/%3E%3Cellipse cx='34.4' cy='92.8' rx='2.6' ry='6.4' transform='rotate(150 34.4 92.8)'/%3E%3Cellipse cx='37.6' cy='84.2' rx='2.6' ry='6.4' transform='rotate(70 37.6 84.2)'/%3E%3Cellipse cx='23.2' cy='86.9' rx='2.4' ry='6.0' transform='rotate(166 23.2 86.9)'/%3E%3Cellipse cx='28.6' cy='79.4' rx='2.4' ry='6.0' transform='rotate(86 28.6 79.4)'/%3E%3Cellipse cx='14.1' cy='78.1' rx='2.2' ry='5.5' transform='rotate(182 14.1 78.1)'/%3E%3Cellipse cx='21.3' cy='72.4' rx='2.2' ry='5.5' transform='rotate(102 21.3 72.4)'/%3E%3Cellipse cx='7.7' cy='67.1' rx='2.1' ry='5.1' transform='rotate(198 7.7 67.1)'/%3E%3Cellipse cx='16.3' cy='63.6' rx='2.1' ry='5.1' transform='rotate(118 16.3 63.6)'/%3E%3Cellipse cx='4.6' cy='54.8' rx='1.9' ry='4.6' transform='rotate(214 4.6 54.8)'/%3E%3Cellipse cx='13.8' cy='53.8' rx='1.9' ry='4.6' transform='rotate(134 13.8 53.8)'/%3E%3Cellipse cx='5.1' cy='42.1' rx='1.7' ry='4.2' transform='rotate(230 5.1 42.1)'/%3E%3Cellipse cx='14.2' cy='43.7' rx='1.7' ry='4.2' transform='rotate(150 14.2 43.7)'/%3E%3Cellipse cx='9.0' cy='30.0' rx='1.5' ry='3.7' transform='rotate(246 9.0 30.0)'/%3E%3Cellipse cx='17.3' cy='34.0' rx='1.5' ry='3.7' transform='rotate(166 17.3 34.0)'/%3E%3Cpath d='M42.9 90.4A41 41 0 0 1 13.1 32.0' fill='none' stroke-width='1.6'/%3E%3C/g%3E%3C/svg%3E");
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
.rh-wordmark { display: block; height: auto; overflow: visible; }
.rh-medal { display: block; width: 100%; height: 100%; }
`;

export const FRONT_CSS = /* css */ `
/* ---- shared front-end pieces ---------------------------------------- */
/* THE INVARIANT (docs/tasks/touch-navigation-invariant.md, src/ui/live.ts): nothing is hit-testable unless it is
   drawn at >= .5 opacity and has been for >= 150 ms. .show decides what is DRAWN (the fade); .live, which only
   live.ts toggles after the reveal has been observed drawn, decides what TAKES POINTERS. Every surface that owns
   tappables — screens, the pause overlay, the onboarding card, the results frame and the replay bar — is
   pointer-events: none (itself and, !important, every descendant) until .live. Hidden surfaces are also OUT of
   hit-testing and the accessibility tree: visibility: hidden (delayed until the fade-out ends). Opacity alone is
   never a visibility state. */
.screen, .overlay, .onboard, .results, .replay { pointer-events: none; }
.screen:not(.live) *, .overlay:not(.live) *, .onboard:not(.live) *, .results:not(.live) *, .replay:not(.live) * { pointer-events: none !important; }
.screen.live, .overlay.live, .onboard.live, .results.live, .replay.live { pointer-events: auto; }
.screen { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease), visibility 0s; }
.overlay:not(.show), .onboard:not(.show), .results:not(.show), .replay:not(.show) { visibility: hidden; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show .rise { animation: rise var(--t2) var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
/* Key art is mirrored so its hero (authored left of centre) lands right of the wordmark; the mask (local coords, pre-flip) clears the wordmark side. */
.grain { position: absolute; inset: 0; pointer-events: none; opacity: .05; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
/* A wordmark holder: the SVG (src/ui/brand.ts) in cream, sized by the holder's width. */
.wordmark { display: block; line-height: 0; color: var(--cream); filter: drop-shadow(0 2px 6px rgba(0,0,0,.45)); }
.wordmark .rh-wordmark { width: 100%; }
.kicker { font-size: .78rem; letter-spacing: .34em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
.backbtn { position: absolute; right: calc(var(--s5) + var(--sar)); top: calc(var(--s4) + var(--sat)); z-index: 4; display: inline-flex; align-items: center; gap: .35em; min-height: 44px; padding: 0 1.1rem 0 .8rem; border: 1px solid rgba(239,227,200,.34); border-radius: 999px; background: rgba(10,58,63,.9); color: var(--cream); font: 800 .76rem/1 var(--sans); letter-spacing: .16em; text-transform: uppercase; pointer-events: auto; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
.backbtn span { font-size: 1.3em; line-height: 1; margin-top: -.1em; }
.backbtn:active { background: var(--teal); }
.legend { position: absolute; right: calc(var(--s5) + var(--sar)); bottom: calc(var(--s4) + var(--sab)); display: flex; gap: var(--s4); font-size: .82rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); white-space: nowrap; }
.legend kbd { font-family: var(--font); font-weight: 700; color: var(--ink); background: rgba(255,255,255,.1); border: 1px solid var(--line); border-bottom-width: 2px; padding: .05em .45em; border-radius: var(--r1); margin-right: .4em; font-size: .9em; min-width: 1.6em; display: inline-block; text-align: center; }
.legend .pad { display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; border-radius: 50%; border: 2px solid var(--ink-dim); color: var(--ink); font-weight: 700; margin-right: .4em; font-size: .85em; }
.legend .pad.a { border-color: var(--green); } .legend .pad.b { border-color: var(--red); }

@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

/* ---- home screen (store release D18; mockups round2/M1 harbour + round1/A-menu quarry) ---------------------------
   The key art full bleed; the ROCKHOP wordmark top-left in cream with the version under it; one row of cards along the
   bottom — cream GARAGE / SETTINGS (icon · rule · word on contour paper), the big vermilion PLAY at the right — and
   CREDITS as an underlined link under GARAGE. Proportions from M1 at 1536 × 708: margins 5 % / 4 %, cards 12.7 % of the
   height (PLAY 16 %), GARAGE 24 % · SETTINGS 25 % · PLAY 38 % of the width. Nothing states progress (ask 42). */
.menu-screen { --card-h: clamp(52px, calc(12.7 * var(--vh)), 104px); --play-h: clamp(60px, calc(16 * var(--vh)), 128px); --foot-h: max(44px, calc(8 * var(--vh))); --mx: calc(5 * var(--vw)); background: var(--coal); }
.menu-keyart { position: absolute; inset: 0; pointer-events: none; background-size: cover; background-position: 58% 42%; transform-origin: 60% 40%; opacity: 0; transition: opacity var(--t3) var(--ease); }
.menu-keyart.loaded { opacity: 1; animation: kenburns 28s var(--ease) infinite alternate; }
@keyframes kenburns { from { transform: scale(1); } to { transform: scale(1.045); } }
/* A light hand: the sky darkens a touch behind the wordmark, the ground a touch under the cards. */
.menu-shade { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 70% at 0% 0%, rgba(10,22,25,.42), transparent 55%), linear-gradient(180deg, transparent 62%, rgba(10,16,18,.42)); }
.menu-head { position: absolute; left: calc(var(--mx) + var(--sal)); top: calc(max(10px, calc(5.5 * var(--vh))) + var(--sat)); display: flex; flex-direction: column; align-items: flex-start; gap: max(4px, calc(1 * var(--vh))); pointer-events: none; }
.menu-title { margin: 0; line-height: 0; color: var(--cream); filter: drop-shadow(0 2px 0 rgba(10,20,22,.35)) drop-shadow(0 6px 16px rgba(6,14,16,.45)); }
.menu-wordmark { width: min(calc(40 * var(--vw)), calc(15.5 * var(--vh) * 7.14), 640px); }
.menu-ver { padding-left: .15em; font: 800 clamp(.72rem, calc(2.4 * var(--vh)), 1.05rem)/1 var(--sans); letter-spacing: .02em; color: var(--cream); text-shadow: 0 1px 3px rgba(0,0,0,.6); font-variant-numeric: tabular-nums; }
.menu-ver span { margin-left: .9em; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; font-size: .7em; opacity: .7; }
.menu-band { position: absolute; left: calc(var(--mx) + var(--sal)); right: calc(4 * var(--vw) + var(--sar)); bottom: calc(var(--foot-h) + var(--sab)); height: var(--play-h); }
.menu-list.tiles { position: relative; display: flex; flex-direction: row; align-items: flex-end; gap: calc(1.6 * var(--vw)); width: 100%; height: 100%; }
.menu-list.tiles .menu-bar { display: none; }
#ui .menu-item { position: relative; flex: 24 1 0; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 0; height: var(--card-h); min-height: 44px; min-width: 88px; padding: 0 calc(1.2 * var(--vw)); border: 0; border-radius: 8px; cursor: pointer;
  background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F6ECD6, var(--cream) 55%, var(--cream-2)); color: var(--teal);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 8px 22px rgba(8,14,16,.38);
  font-family: var(--display); font-weight: 400; font-size: clamp(.95rem, calc(4.4 * var(--vh)), 1.9rem); line-height: 1; text-transform: uppercase; letter-spacing: .015em;
  transition: transform var(--t1) var(--ease), box-shadow var(--t1) var(--ease), filter var(--t1); }
#ui .menu-item small { display: none; }
#ui .menu-item .ico { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: calc(var(--card-h) * .46); height: calc(var(--card-h) * .46); margin-right: calc(var(--card-h) * .26); padding-right: calc(var(--card-h) * .26); box-sizing: content-box; border-right: 2px solid rgba(15,92,99,.35); color: var(--teal); }
#ui .menu-item .ico svg { display: block; width: 100%; height: 100%; }
#ui .menu-item[data-id="settings"] { flex-grow: 25; }
#ui .menu-item.on { transform: translateY(-3px); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 0 0 3px var(--cream), 0 0 0 5px rgba(15,92,99,.9), 0 12px 26px rgba(8,14,16,.45); }
#ui .menu-screen.touchdev .menu-item.on:not(.minor) { transform: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 8px 22px rgba(8,14,16,.38); }
#ui .menu-item:active { transform: translateY(1px) scale(.985); }
#ui .menu-item[data-id="play"] { order: 5; flex-grow: 38; height: var(--play-h); gap: .32em; color: var(--amber-ink); font-size: clamp(1.6rem, calc(8.6 * var(--vh)), 3.9rem); letter-spacing: .01em; overflow: hidden;
  background: var(--contour-light) 0 0 / 240px 160px, linear-gradient(180deg, #EE6A40, var(--vermilion) 48%, var(--vermilion-2)); text-shadow: 0 2px 0 rgba(120,30,8,.35);
  box-shadow: inset 0 1px 0 rgba(255,210,190,.55), inset 0 -4px 0 rgba(100,24,6,.3), 0 10px 26px rgba(80,20,6,.42); }
/* The play glyph, then a faint survey mountain in the bottom-right corner (A-menu). */
#ui .menu-item[data-id="play"]::after { content: ""; width: .5em; height: .56em; margin-left: .05em; background: currentColor; clip-path: polygon(0 0, 100% 50%, 0 100%); }
#ui .menu-item[data-id="play"]::before { content: ""; position: absolute; right: 3%; bottom: 0; width: 22%; height: 55%; background: rgba(90,20,4,.28); clip-path: polygon(0 100%, 34% 30%, 50% 55%, 70% 0, 100% 100%); pointer-events: none; }
#ui .menu-item[data-id="play"].on { transform: translateY(-3px); filter: brightness(1.06); box-shadow: inset 0 1px 0 rgba(255,210,190,.6), inset 0 -4px 0 rgba(100,24,6,.3), 0 0 0 3px var(--cream), 0 0 0 5px rgba(120,30,8,.8), 0 14px 30px rgba(80,20,6,.5); }
#ui .menu-screen.touchdev .menu-item[data-id="play"].on { transform: none; filter: none; box-shadow: inset 0 1px 0 rgba(255,210,190,.55), inset 0 -4px 0 rgba(100,24,6,.3), 0 10px 26px rgba(80,20,6,.42); }
/* CREDITS: a small underlined link under GARAGE, its 44 px target in the foot band. */
#ui .menu-item.minor { position: absolute; left: 0; top: 100%; flex: none; order: 0; height: var(--foot-h); min-height: 44px; min-width: 88px; padding: 0 var(--s2) 0 2px; justify-content: flex-start; align-items: center; border: 0; border-radius: 0; background: none; box-shadow: none; transform: none; font: 800 clamp(.62rem, calc(2.2 * var(--vh)), .9rem)/1 var(--sans); letter-spacing: .08em; color: var(--cream); text-shadow: 0 1px 3px rgba(0,0,0,.7); }
#ui .menu-item.minor::after { content: ""; position: absolute; left: 2px; right: var(--s2); top: calc(50% + .85em); height: 2px; background: currentColor; opacity: .85; }
#ui .menu-item.minor.on { transform: none; box-shadow: none; color: #fff; }
#ui .menu-item[disabled] { opacity: .35; cursor: default; }
.mini-seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: var(--r1); overflow: hidden; }
.mini-seg b { padding: 4px 8px; font-weight: 700; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-mute); }
.mini-seg b.on { background: var(--amber); color: var(--amber-ink); }
/* The focus bar (other FocusLists): an eased underline / column marker. */
.menu-bar { position: absolute; left: 0; bottom: 0; width: 0; height: 4px; border-radius: 2px; background: var(--amber); box-shadow: 0 0 12px var(--amber); pointer-events: none; transition: transform var(--t1) var(--ease), width var(--t1) var(--ease), opacity var(--t2); opacity: 0; }
.menu-bar.on { opacity: 1; }
/* Short phones (932 × 430, 844 × 390): the cards keep the 44 px floor, the icon sits smaller. */
html.short .menu-screen { --card-h: max(48px, calc(12.7 * var(--vh))); --play-h: max(56px, calc(15.5 * var(--vh))); }
html.short #ui .menu-item { font-size: clamp(.9rem, calc(4.6 * var(--vh)), 1.3rem); }
html.short #ui .menu-item[data-id="play"] { font-size: clamp(1.5rem, calc(8.8 * var(--vh)), 2.3rem); }
.menu-screen.show .menu-item { animation: rise var(--t2) var(--ease) both; }
.menu-screen .menu-item:nth-child(3) { animation-delay: 40ms; } .menu-screen .menu-item:nth-child(4) { animation-delay: 80ms; } .menu-screen .menu-item:nth-child(5) { animation-delay: 120ms; }

/* ---- settings: the field-kit card (store release polish; the home screen's cards, the results ticket's paper) -------
   A kicker with the survey marker and the SETTINGS headline in cream display over the dimmed scene; every row on one
   cream contour card (teal words, hairline rules between rows), the focused row flagged by the vermilion marker;
   choices are teal segments, levels vermilion bars, RESET a vermilion outline that fills when armed. */
.settings-screen { background: radial-gradient(130% 110% at 0% 0%, rgba(9,38,42,.92), rgba(8,20,22,.8) 55%, rgba(8,20,22,.5)); }
.settings-wrap { position: absolute; inset: 0; padding: calc(var(--s4) + var(--sat)) calc(calc(5 * var(--vw)) + var(--sar)) calc(var(--s3) + var(--sab)) calc(calc(5 * var(--vw)) + var(--sal)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(18rem, 38rem); gap: var(--s3); }
.settings-foot { display: flex; flex-direction: column; gap: 2px; font: 600 .72rem/1.45 var(--sans); color: rgba(239,227,200,.62); max-width: 40rem; }
.settings-foot b { color: var(--cream); font-weight: 800; }
.settings-foot .sep { margin: 0 .5em; }
.settings-foot .build { letter-spacing: .1em; text-transform: uppercase; font-size: .62rem; }
.rh-head { margin: 0; font: 400 2.2rem/.9 var(--display); text-transform: uppercase; letter-spacing: .01em; color: var(--cream); align-self: start; text-shadow: 0 2px 0 rgba(6,14,16,.35), 0 6px 16px rgba(4,10,12,.45); }
.rh-head small { display: flex; align-items: center; gap: .55em; margin-bottom: .5em; font: 800 .66rem/1 var(--sans); letter-spacing: .3em; color: rgba(239,227,200,.82); text-shadow: none; }
/* The survey marker (A-brand § 06): a vermilion triangle over its dot. */
.rh-pin { position: relative; flex: none; width: .95em; height: 1.25em; }
.rh-pin::before { content: ""; position: absolute; left: 0; top: 0; width: 100%; height: .85em; background: var(--vermilion); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.rh-pin::after { content: ""; position: absolute; left: 50%; bottom: 0; width: .3em; height: .3em; margin-left: -.15em; border-radius: 50%; background: currentColor; }
.rh-card { color: var(--coal); border-radius: 10px; background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F7EEDA, var(--cream) 55%, var(--cream-2)); box-shadow: inset 0 1px 0 rgba(255,255,255,.65), inset 0 -3px 0 rgba(15,92,99,.12), 0 16px 36px rgba(4,10,12,.5); }
.settings-list { display: flex; flex-direction: column; gap: 0; padding: var(--s1) var(--s2) 28px; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none; }
.settings-list::-webkit-scrollbar { display: none; }
.setting { position: relative; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--s3); min-height: 52px; padding: 6px var(--s3) 6px calc(var(--s4) + 10px); border-radius: 6px; transition: background var(--t1) var(--ease); }
.setting + .setting { box-shadow: 0 -1px 0 rgba(15,92,99,.16); }
.setting.on { background: rgba(15,92,99,.09); box-shadow: none; }
.setting.on + .setting { box-shadow: none; }
.setting.on::before { content: ""; position: absolute; left: 8px; top: 50%; width: 11px; height: 10px; margin-top: -6px; background: var(--vermilion); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.setting .lab { min-width: 0; font: 400 1.2rem/1 var(--display); text-transform: uppercase; letter-spacing: .01em; color: var(--teal); }
.setting .lab small { display: block; margin-top: 3px; font: 600 .74rem/1.2 var(--sans); letter-spacing: 0; text-transform: none; color: rgba(29,35,38,.62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg { display: inline-flex; border-radius: 8px; overflow: hidden; background: rgba(15,92,99,.07); box-shadow: inset 0 0 0 1.5px rgba(15,92,99,.34); }
.seg button { min-height: 44px; min-width: 44px; padding: 0 var(--s3); background: transparent; border: 0; border-right: 1px solid rgba(15,92,99,.2); cursor: pointer; font: 800 .76rem/1 var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--teal); transition: background var(--t1), color var(--t1); }
#ui .seg button { color: var(--teal); }
.seg button:last-child { border-right: 0; }
#ui .seg button.on { background: var(--teal); color: var(--cream); }
.seg button:focus-visible, .seg button.focus { box-shadow: inset 0 0 0 2px var(--vermilion); }
.slider { display: inline-flex; align-items: center; gap: var(--s2); }
#ui .slider button { min-width: 44px; min-height: 44px; border-radius: 8px; border: 0; background: rgba(15,92,99,.07); box-shadow: inset 0 0 0 1.5px rgba(15,92,99,.34); cursor: pointer; font: 800 1.15rem/1 var(--sans); color: var(--teal); }
.slider button:focus-visible, .slider button.focus { box-shadow: inset 0 0 0 2px var(--vermilion); }
.slider .bar { position: relative; width: clamp(5rem, calc(9 * var(--vw)), 9rem); height: 8px; border-radius: 4px; background: rgba(15,92,99,.16); overflow: hidden; }
.slider .bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 70%; border-radius: 4px; background: linear-gradient(90deg, var(--vermilion-2), var(--vermilion)); transition: width var(--t1) var(--ease); }
.slider .val { min-width: 2.8em; text-align: right; font: 800 .82rem/1 var(--sans); font-variant-numeric: tabular-nums; color: var(--coal); }
.btn { min-height: 44px; min-width: 44px; padding: var(--s2) var(--s5); border-radius: 8px; border: 1px solid var(--line); background: rgba(255,255,255,.08); color: var(--ink); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; font-size: .9rem; transition: background var(--t1), transform var(--t1) var(--ease), box-shadow var(--t1); }
.btn:hover, .btn:focus-visible, .btn.focus { background: rgba(255,255,255,.16); box-shadow: inset 0 0 0 2px var(--ink); }
.btn.primary { background: var(--vermilion); color: var(--amber-ink); border-color: transparent; box-shadow: inset 0 -3px 0 rgba(100,24,6,.3); }
.btn.primary:hover, .btn.primary:focus-visible, .btn.primary.focus { background: #EE6A40; box-shadow: inset 0 0 0 2px var(--amber-ink); }
#ui .settings-screen .btn { border: 0; background: rgba(15,92,99,.07); box-shadow: inset 0 0 0 1.5px rgba(15,92,99,.34); color: var(--teal); font: 800 .78rem/1 var(--sans); letter-spacing: .08em; padding: 0 var(--s4); }
#ui .settings-screen .btn.danger { color: var(--vermilion-2); background: transparent; box-shadow: inset 0 0 0 1.5px rgba(196,68,31,.6); }
#ui .settings-screen .btn.danger.armed, .btn.danger.armed { background: var(--vermilion); color: var(--amber-ink); box-shadow: inset 0 -3px 0 rgba(100,24,6,.3); }
.btn.danger { color: var(--vermilion); border-color: rgba(228,87,46,.5); }

/* ---- credits: the settings screen's head over the finish plate, the roll on one cream contour card ---------- */
.credits-screen { background: radial-gradient(130% 110% at 0% 0%, rgba(9,38,42,.9), rgba(8,20,22,.66) 55%, rgba(8,20,22,.3)); }
.credits-wrap { position: absolute; left: calc(calc(5 * var(--vw)) + var(--sal)); top: calc(var(--s4) + var(--sat)); bottom: calc(var(--s3) + var(--sab)); width: min(40rem, calc(62 * var(--vw))); display: flex; flex-direction: column; gap: var(--s3); min-height: 0; }
.credits-wrap dl { flex: 0 1 auto; min-height: 0; margin: 0; padding: var(--s3) var(--s4); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none; display: grid; grid-template-columns: auto 1fr; gap: 7px var(--s4); font: 500 .8rem/1.42 var(--sans); }
.credits-wrap dl::-webkit-scrollbar { display: none; }
.credits-wrap dt { padding-top: .3em; font: 800 .6rem/1.4 var(--sans); letter-spacing: .22em; text-transform: uppercase; color: var(--vermilion-2); }
.credits-wrap dd { margin: 0; color: rgba(29,35,38,.82); }
.credits-wrap dd b { color: var(--teal); font-weight: 800; }

/* ---- "Exit ROCKHOP?" (Android back on the home screen): a cream card over a dim; STAY is the safe default ---- */
.exit-confirm { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(10,16,18,.6); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.exit-confirm.show { opacity: 1; visibility: visible; transition: opacity var(--t2) var(--ease), visibility 0s; }
.exit-confirm.live { pointer-events: auto; }
.exit-confirm:not(.live) * { pointer-events: none !important; }
.xc-card { width: min(26rem, calc(100% - 2 * var(--s5))); padding: var(--s5) var(--s5) var(--s4); border-radius: 10px; color: var(--coal); background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #FBF4E4, var(--cream)); box-shadow: 0 18px 50px rgba(0,0,0,.5); }
.xc-card h2 { margin: 0 0 .3em; font: 400 1.8rem/1 var(--display); text-transform: uppercase; color: var(--teal); }
.xc-card p { margin: 0 0 var(--s4); font: 600 .95rem/1.35 var(--sans); color: rgba(29,35,38,.8); }
.xc-btns { display: flex; gap: var(--s3); justify-content: flex-end; }
#ui .xc-btns button { min-height: 48px; min-width: 7rem; padding: 0 var(--s4); border: 0; border-radius: 8px; cursor: pointer; font: 400 1.05rem/1 var(--display); text-transform: uppercase; }
#ui .xc-stay { color: var(--amber-ink); background: var(--vermilion); box-shadow: inset 0 -3px 0 rgba(100,24,6,.3); }
#ui .xc-exit { color: var(--teal); background: rgba(15,92,99,.12); box-shadow: inset 0 0 0 2px rgba(15,92,99,.45); }

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
.ov-name { font-family: var(--display); font-weight: 400; font-size: 3rem; line-height: .9; text-transform: uppercase; letter-spacing: .01em; color: var(--ink); text-shadow: var(--outline); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(40rem, calc(60 * var(--vw))); }
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
.pause-overlay { background: radial-gradient(120% 100% at 0% 0%, rgba(8,34,38,.72), rgba(6,16,18,.5) 60%, rgba(6,16,18,.34)); }
.pause-overlay .ov-head { flex-wrap: wrap; }
.pause-overlay .ov-title { gap: .45em; }
.pause-overlay .ov-kicker { align-self: flex-start; padding: .42em 1.3em .4em .7em; font: 800 .66rem/1 var(--sans); letter-spacing: .24em; color: var(--cream); background: var(--teal); text-shadow: none; clip-path: polygon(0 0, calc(100% - .8em) 0, 100% 50%, calc(100% - .8em) 100%, 0 100%); }
.pause-overlay .ov-kicker.red { color: var(--amber-ink); background: var(--vermilion); }
.pause-overlay .ov-name { color: var(--cream); text-shadow: 0 2px 0 rgba(6,14,16,.4), 0 6px 18px rgba(4,10,12,.5); }
.pause-overlay .ov-stats { font: 700 .8rem/1 var(--sans); letter-spacing: .1em; color: rgba(239,227,200,.72); text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.pause-overlay .ov-stats b { color: var(--cream); font-weight: 800; }
.pause-overlay .ov-reload { color: rgba(239,227,200,.7); font-family: var(--sans); font-weight: 800; }
.pause-overlay .ov-reload.armed { color: var(--vermilion); }
.pause-overlay button:focus-visible { outline: 2px solid var(--cream); outline-offset: -2px; }
html.short .pause-overlay { gap: var(--s1); }
/* Action cards: 240×128 desktop / 160×92 phone, the home screen's cream contour cards; exactly one is vermilion (the focused one). */
.tiles { display: flex; justify-content: center; gap: var(--s4); width: 100%; }
.tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 240px; height: 128px; min-height: 44px; padding: 0 var(--s3); border-radius: 10px; border: 0; background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F7EEDA, var(--cream) 55%, var(--cream-2)); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 10px 26px rgba(4,10,12,.45); color: var(--teal); cursor: pointer; font-family: var(--display); font-weight: 400; font-size: 1.3rem; letter-spacing: .015em; text-transform: uppercase; line-height: 1; white-space: nowrap; transition: background var(--t1), color var(--t1), box-shadow var(--t1), transform var(--t1) var(--ease); }
.tile svg { width: 28px; height: 28px; color: var(--teal); transition: color var(--t1); }
.tile.on { background: var(--contour-light) 0 0 / 240px 160px, linear-gradient(180deg, #EE6A40, var(--vermilion) 48%, var(--vermilion-2)); color: var(--amber-ink); box-shadow: inset 0 1px 0 rgba(255,210,190,.55), inset 0 -4px 0 rgba(100,24,6,.3), 0 10px 26px rgba(80,20,6,.42); text-shadow: 0 2px 0 rgba(120,30,8,.3); }
.tile.on svg { color: var(--amber-ink); }
.tile.on:focus-visible, .overlay.focus-tiles .tile.on { box-shadow: inset 0 1px 0 rgba(255,210,190,.6), 0 0 0 3px var(--cream), 0 0 0 5px rgba(120,30,8,.8), 0 14px 30px rgba(80,20,6,.5); }
.tile.pressed, .tile:active { transform: scale(.97); }
.tile[disabled] { color: rgba(15,92,99,.45); background: rgba(239,227,200,.55); box-shadow: none; cursor: default; }
#ui .pause-overlay .tile { color: var(--teal); font: 400 1.3rem/1 var(--display); letter-spacing: .015em; }
html.short #ui .pause-overlay .tile { font-size: 1.05rem; }
#ui .pause-overlay .tile.on { color: var(--amber-ink); }
#ui .pause-overlay .tile[disabled] { color: rgba(15,92,99,.45); }
.tile[disabled] svg { color: currentColor; }
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
.replay .ov-name { font-family: var(--display); font-weight: 400; font-size: 1.6rem; line-height: 1; text-transform: uppercase; }
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

/* ---- art plates behind a screen (credits): cover, masked clear where the live scene should show ---- */
.plate-bg { position: absolute; inset: 0; pointer-events: none; background-size: cover; background-position: 50% 50%; opacity: 0; transition: opacity var(--t3) var(--ease); }
.plate-bg.loaded { opacity: .55; }
.credits-screen .plate-bg.loaded { opacity: .6; }
.credits-screen .rh-head { text-shadow: 0 2px 0 rgba(6,14,16,.5), 0 4px 18px rgba(4,10,12,.8); }
.credits-screen .rh-head small { color: var(--cream); }
/* ---- garage: the model explorer (garage round) — layout B "tool wall" on set E "shutter door" (assets/design/garage/SPEC.md) ---- */
/* The screen itself is clear: the renderer's garage set is the backdrop. Framing is the renderer's orbit camera, never a CSS transform on the canvas.
   Rail of tags down the left edge (rider · outfit · bike, bike lowest), the metadata panel on the right, badge top-left, ‹ MENU top-right, the hero between. */
.garage-screen { --rail-w: 244px; --panel-w: max(178px, 12.5rem); background: none; }
.garage-stage { position: absolute; inset: 0; cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; }
.garage-stage.grabbing { cursor: grabbing; }
/* Header top-left: the cream ROCKHOP wordmark and GARAGE in cream display beside it (the home screen's head), the build stamp under it on dev builds. */
.garage-badge { position: absolute; left: calc(var(--s4) + var(--sal)); top: calc(var(--s3) + var(--sat)); display: flex; flex-direction: column; align-items: flex-start; gap: 3px; pointer-events: none; }
.garage-plate { display: flex; align-items: center; gap: .55em; font-size: 1.15rem; filter: drop-shadow(0 2px 0 rgba(6,14,16,.35)) drop-shadow(0 4px 12px rgba(4,10,12,.5)); }
.garage-plate .wordmark { width: 6.4em; filter: none; color: var(--cream); }
.garage-title { padding-left: .55em; border-left: 2px solid rgba(239,227,200,.55); font: 400 1.1em/.9 var(--display); text-transform: uppercase; color: var(--cream); letter-spacing: .01em; }
.garage-build { font: 600 .56rem/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; color: var(--cream); opacity: .6; text-shadow: 0 1px 2px #000; padding-left: .1rem; font-variant-numeric: tabular-nums; }
/* Gesture hint under the hero (fades after the first drag). */
.garage-hint { position: absolute; left: calc(var(--rail-w) + var(--sal) + (100% - var(--rail-w) - var(--panel-w) - var(--sal) - var(--sar)) / 2); bottom: calc(var(--s3) + var(--sab)); transform: translateX(-50%); display: inline-flex; align-items: center; gap: .5em; padding: 6px 14px; border-radius: 999px; font: 700 .62rem/1 var(--font); letter-spacing: .2em; text-transform: uppercase; color: var(--cream); background: rgba(10,40,44,.72); box-shadow: inset 0 0 0 1px rgba(239,227,200,.22); pointer-events: none; white-space: nowrap; transition: opacity var(--t3) var(--ease); }
.garage-hint i { width: 1.1em; height: 1.1em; border: 2px solid currentColor; border-radius: 50%; border-right-color: transparent; opacity: .8; }
.garage-hint.used { opacity: 0; }
/* The rail: groups stacked from the bottom edge, a stencilled spine label beside each 2-column grid of tags. */
.garage-rail { position: absolute; left: calc(var(--s4) + var(--sal)); top: calc(var(--s3) + var(--sat) + 64px); bottom: calc(var(--s2) + var(--sab)); width: var(--rail-w); display: flex; flex-direction: column; justify-content: flex-end; gap: var(--s2); }
.rail-group { display: grid; grid-template-columns: 14px 1fr; gap: var(--s1); align-items: end; }
.rail-head { writing-mode: vertical-rl; transform: rotate(180deg); align-self: end; max-height: 100%; overflow: hidden; font: 700 .58rem/14px var(--font); letter-spacing: .28em; text-transform: uppercase; color: var(--cream); text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.rail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s1); }
#ui .chip { position: relative; display: flex; align-items: center; gap: .45em; min-height: 44px; min-width: 44px; padding: 0 .8em 0 .7em; border: 0; border-radius: 7px; background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F7EEDA, var(--cream) 60%, var(--cream-2)); color: var(--teal); font: 700 .84rem/1 var(--font); letter-spacing: .06em; text-transform: uppercase; text-align: left; white-space: nowrap; cursor: pointer; box-shadow: inset 0 -2px 0 rgba(15,92,99,.14), 0 4px 12px rgba(0,0,0,.42); transition: background var(--t1), color var(--t1), box-shadow var(--t1); }
#ui .chip > b, #ui .chip > em { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#ui .chip .txt { display: contents; }
#ui .chip b { font-weight: 700; }
#ui .chip em { font-style: normal; font-size: .6rem; letter-spacing: .12em; color: rgba(29,35,38,.6); }
/* Outfit tags read in mixed case (mockup B): the five labels fit two per row without truncation. */
#ui .chip.outfit-button { text-transform: none; letter-spacing: .01em; font-size: .8rem; padding-top: 4px; padding-bottom: 4px; }
#ui .chip.outfit-button > b { white-space: normal; line-height: 1.02; }
#ui .chip.outfit-button em { text-transform: none; letter-spacing: .02em; font-size: .68rem; }
#ui .chip b + em { margin-left: 0; }
#ui .chip.selected { background: var(--contour-light) 0 0 / 240px 160px, linear-gradient(180deg, #17737B, var(--teal) 60%, var(--teal-2)); color: var(--cream); box-shadow: inset 0 0 0 1.5px rgba(239,227,200,.45), 0 4px 12px rgba(0,0,0,.42); }
/* The chosen tag carries the survey target: a vermilion dot in a cream ring, top-right. */
#ui .chip.selected::after { content: ""; position: absolute; right: 5px; top: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--vermilion); box-shadow: 0 0 0 1.5px var(--cream); }
#ui .chip.selected em { color: rgba(239,227,200,.78); }
#ui .chip.on:not(.selected) { color: var(--teal-2); background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #FFF8E8, #F6ECD6); }
#ui .chip.on, .garage-screen button:focus-visible, .garage-screen .backbtn.on { outline: 2px solid var(--cream); outline-offset: 2px; }
#ui .chip[aria-busy="true"] { opacity: .6; }
#ui .chip:disabled { opacity: .55; cursor: not-allowed; }
/* Two-line tags: the label stacks over its detail. */
#ui .chip { flex-wrap: wrap; row-gap: 1px; column-gap: .45em; padding-top: 5px; padding-bottom: 5px; }
#ui .chip > b { flex: 1 1 100%; }
#ui .chip > em { flex: 1 1 100%; }
#ui .chip > .swatch, #ui .chip > .chip-tint, #ui .chip > .chip-art { flex: 0 0 auto; }
#ui .chip > .swatch + b, #ui .chip > .chip-art + b { flex: 1 1 calc(100% - 2.2em); }
#ui .chip > .swatch ~ em, #ui .chip > .chip-art ~ em { margin-left: 2.2em; }
.swatch { width: 1.6em; height: 1.6em; border-radius: 4px; border: 1px solid rgba(29,35,38,.45); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }
.bike-chip { --tint: var(--vermilion); }
.bike-chip .chip-tint { position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 2px 2px 0; background: var(--tint); }
.bike-chip.selected .chip-tint { background: var(--cream); opacity: .6; }
.bike-chip .chip-art { width: 2.1em; height: 1.4em; margin-left: 2px; background-size: cover; background-position: 50% 45%; opacity: 0; transition: opacity var(--t3); border-radius: 2px; }
.bike-chip .chip-art.loaded { opacity: 1; }
.bike-chip .chip-art:not(.loaded) { display: none; }
/* The panel: the chosen bike's sheet — class, bars, character, note — then the outfit / rider lines and the load status. */
.garage-panel { position: absolute; right: calc(var(--s4) + var(--sar)); top: calc(var(--s4) + var(--sat) + 52px); width: var(--panel-w); display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) var(--s3) var(--s2); pointer-events: none; }
.gp-sheet { display: flex; flex-direction: column; gap: 6px; }
.gp-name { display: flex; align-items: baseline; gap: .5em; }
.gp-name::before { content: ""; align-self: center; flex: none; width: 10px; height: 9px; background: var(--vermilion); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.gp-name b { font: 400 1.5rem/.9 var(--display); text-transform: uppercase; color: var(--teal); }
.gp-name small { font: 700 .66rem/1 var(--font); letter-spacing: .24em; text-transform: uppercase; color: rgba(29,35,38,.6); }
.gp-stats { display: flex; flex-direction: column; gap: 4px; }
.gp-stats .stat { display: grid; grid-template-columns: 3.9em 1fr 4.2em; align-items: center; gap: 6px; font: 700 .66rem/1 var(--font); letter-spacing: .14em; text-transform: uppercase; color: rgba(29,35,38,.66); }
.gp-stats .stat i { display: block; height: 6px; border-radius: 3px; background: rgba(15,92,99,.16); overflow: hidden; }
.gp-stats .stat b { display: block; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, var(--vermilion-2), var(--vermilion)); transition: width var(--t3) var(--ease); }
.gp-stats .stat em { font-style: normal; text-align: right; color: var(--coal); font-variant-numeric: tabular-nums; letter-spacing: .04em; }
.gp-line { font: 500 .76rem/1.3 var(--font); color: rgba(29,35,38,.78); }
.gp-note { font: 700 .64rem/1.35 var(--font); letter-spacing: .1em; text-transform: uppercase; color: rgba(29,35,38,.6); padding-top: 5px; border-top: 1.5px dashed rgba(15,92,99,.3); }
.gp-kv { display: flex; justify-content: space-between; gap: var(--s2); font: 700 .68rem/1.2 var(--font); letter-spacing: .1em; text-transform: uppercase; color: rgba(29,35,38,.6); }
.gp-kv b { color: var(--coal); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.outfit-current { color: var(--teal); font: 700 .7rem/1.3 var(--font); letter-spacing: .02em; }
.garage-screen .legend { top: calc(var(--s4) + var(--sat) + 56px); right: calc(var(--s4) + var(--sar) + var(--panel-w) + var(--s3)); bottom: auto; font-size: .66rem; gap: var(--s3); }
.garage-screen .legend.hide { display: none; }
.ov-stats b.bike-pro { color: var(--blue); }
.tile span small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .68rem; letter-spacing: .14em; margin-top: 4px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.setting .btns { display: inline-flex; gap: var(--s2); }
.setting .btns .btn[hidden] { display: none; }

/* ---- perf overlay (?perf=1): top-left under the pause button, never over the bike ---- */
.perf[hidden] { display: none; }
.perf { position: absolute; left: calc(.8rem + var(--sal)); top: calc(4.4rem + var(--sat)); margin: 0; padding: .35rem .55rem; z-index: 6; pointer-events: none; font: 11px/1.4 var(--mono); color: #cfe; background: rgba(0,0,0,.72); border: 1px solid var(--line-2); border-radius: var(--r1); white-space: pre; text-shadow: none; }

/* ?bench=1 (src/game/bench.ts): START card, one status line under the meter while it runs, the report panel at the end. */
.bench { position: absolute; inset: 0; pointer-events: none; z-index: 40; }
.bench-card, .bench-report { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); box-shadow: 0 18px 50px rgba(0,0,0,.55); color: var(--ink); }
.bench-card { width: min(34rem, calc(100vw - 2rem)); padding: var(--s4) var(--s5); display: flex; flex-direction: column; gap: var(--s2); }
.bench-card h2 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 1.5rem; line-height: 1; text-transform: uppercase; }
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

/* ---- onboarding card (first launch, over the first countdown, game paused) ---- */
.onboard { position: absolute; inset: 0; z-index: 25; display: flex; align-items: center; justify-content: center; background: rgba(8,24,27,.6); opacity: 0; transition: opacity var(--t2) var(--ease); padding: var(--s4); }
.onboard.show { opacity: 1; }
/* The first-ride card: the exit card's cream contour paper, the kicker a teal tag, keys as teal keycaps. */
.ob-card { width: min(34rem, 100%); display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); color: var(--coal); border-radius: 10px; background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #FBF4E4, var(--cream)); box-shadow: inset 0 -3px 0 rgba(15,92,99,.12), 0 24px 60px rgba(0,0,0,.55); }
.ob-card .kicker { align-self: flex-start; padding: .42em 1.3em .4em .7em; font: 800 .66rem/1 var(--sans); letter-spacing: .24em; color: var(--cream); background: var(--teal); clip-path: polygon(0 0, calc(100% - .8em) 0, 100% 50%, calc(100% - .8em) 100%, 0 100%); }
.ob-card h2 { margin: 0; font: 400 2.4rem/.9 var(--display); text-transform: uppercase; color: var(--teal); }
.ob-lines { display: flex; flex-direction: column; gap: var(--s2); font: 500 .92rem/1.35 var(--sans); color: rgba(29,35,38,.8); }
.ob-lines b { color: var(--coal); font-weight: 800; }
.ob-lines kbd { font: 700 .9em/1.3 var(--font); color: var(--cream); background: var(--teal); border-bottom: 2px solid var(--teal-2); padding: 0 .45em; border-radius: 5px; min-width: 1.6em; display: inline-block; text-align: center; }
.ob-hop { font: 600 .8rem/1.35 var(--sans); color: rgba(29,35,38,.66); border-top: 1.5px dashed rgba(15,92,99,.3); padding-top: var(--s3); }
.ob-tip { font: 600 .72rem/1.3 var(--sans); color: rgba(29,35,38,.55); font-variant-numeric: tabular-nums; }
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
.hud-faults .x { align-self: center; color: var(--amber); font-size: .42em; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
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

/* ---- kinetic call-outs (A-brand § 06): READY · SET · ROCK in the display face; BAIL +1, MARKER n and CLEAN LINE on
   chevron plates (vermilion / teal, cream type). Positions and timing curves are the old banners'. ---- */
.banners { position: absolute; left: 0; right: 0; top: 30%; height: 0; display: flex; justify-content: center; pointer-events: none; }
.banners .entry { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font: 700 1.1rem/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--cream); background: var(--slab-2); padding: .55em 1.2em; border-radius: .2em; opacity: 0; transition: opacity .15s; text-shadow: none; }
.banners .entry.show { opacity: 1; }
.banner { position: absolute; top: 0; transform: translate(-50%, -50%); left: 50%; white-space: nowrap; font-family: var(--display); font-weight: 400; letter-spacing: .01em; text-transform: uppercase; will-change: transform, opacity; opacity: 0; text-shadow: 0 .04em 0 rgba(8,14,16,.55), 0 .1em .3em rgba(8,14,16,.45); }
.banner.count { font-size: 6.4rem; color: var(--cream); -webkit-text-stroke: .025em rgba(20,27,30,.95); paint-order: stroke fill; }
.banner.go { font-size: 8rem; color: var(--vermilion); -webkit-text-stroke: .025em rgba(20,27,30,.95); paint-order: stroke fill; }
.banner.crash, .banner.cp, .banner.finish { font-style: italic; color: var(--amber-ink); text-shadow: 0 2px 0 rgba(8,14,16,.28); clip-path: polygon(0 0, calc(100% - .55em) 0, 100% 50%, calc(100% - .55em) 100%, 0 100%, .35em 50%); }
.banner.crash { font-size: 1.9rem; padding: .3em 1.1em .3em .9em; background: linear-gradient(180deg, #EE6A40, var(--vermilion) 55%, var(--vermilion-2)); }
.banner.cp { font-size: 1.35rem; letter-spacing: .12em; padding: .32em 1.2em .32em 1em; background: linear-gradient(180deg, #13707A, var(--teal) 55%, var(--teal-2)); }
.banner.finish { font-size: 3.4rem; letter-spacing: .02em; padding: .16em 1em .16em .8em; background: linear-gradient(180deg, #13707A, var(--teal) 55%, var(--teal-2)); }
.banner.ready { font-size: 4rem; color: var(--amber); }

/* ---- hints ---------------------------------------------------------- */
.hints { position: absolute; left: 50%; bottom: calc(1rem + var(--sab)); transform: translateX(-50%); display: flex; gap: 1.2rem; padding: .45rem 1rem; background: var(--slab); border: 1px solid var(--line); border-radius: .5rem; font-size: .9rem; white-space: nowrap; opacity: 0; transition: opacity .3s; box-shadow: var(--plate); text-shadow: var(--outline); max-width: calc(calc(100 * var(--vw)) - 2rem); overflow: hidden; }
.hints.show { opacity: 1; }
.hints kbd { font-family: var(--font); font-weight: 800; background: rgba(255,255,255,.12); border: 1px solid var(--line); border-bottom-width: 2px; padding: .05em .45em; border-radius: .25em; margin-right: .35em; font-size: .9em; }

/* ---- results: the survey ticket (store release D19, mockup round1/A-results) ------------------------------------------
   The cream ticket on the left (a perforated left edge and two ticket bites, contour paper with a survey patch, the ROCKHOP mark top-right): zone · code, track name,
   CLEAN LINE, TIME (+ the PB line) and BAILS boxes, the local top 5, the four mountain medals. The finish scene stays live
   on the right. MAP · RETRY · REPLAY · NEXT TRACK (vermilion) along the bottom, the home screen's cards. Proportions from
   A-results at 1536 × 708: ticket x 4.5–56 %, y 6–74 %; buttons y 81–93 %. */
.results { position: absolute; inset: 0; --tk: clamp(9px, calc(2.05 * var(--vh) + .18 * var(--vw)), 15.5px); --card-h: clamp(48px, calc(12 * var(--vh)), 96px); background: linear-gradient(90deg, rgba(10,16,18,.28), rgba(10,16,18,0) 60%); opacity: 0; transition: opacity var(--t2) var(--ease); }
.results.show { opacity: 1; }
.ticket { position: absolute; left: calc(4.5 * var(--vw) + var(--sal)); top: calc(max(8px, calc(5.5 * var(--vh))) + var(--sat)); width: min(calc(52 * var(--vw)), calc(var(--tk) * 58)); font-size: var(--tk); padding: 1.25em 1.7em 1em 2.3em; color: var(--coal); filter: drop-shadow(0 .5em 1.1em rgba(8,14,16,.42)); transform: translateX(-1.5em); opacity: 0; transition: transform var(--t2) var(--ease), opacity var(--t2) var(--ease); }
.results.show .ticket { transform: none; opacity: 1; }
/* The paper: a pseudo so the deckled clip-path does not clip the drop shadow. */
.ticket { --bite: 64%; }
/* The paper: a pseudo so its mask does not clip the drop shadow. The mask is the paper minus a perforated left edge (a bite every
   1em) minus two half-round ticket bites at the medal rule. */
.ticket::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: .35em .6em .6em .35em; background: var(--contour) 0 0 / 240px 160px, radial-gradient(120% 90% at 80% 0%, #FBF4E4, var(--cream) 55%, var(--cream-2));
  -webkit-mask: radial-gradient(circle at 0 var(--bite), transparent 1em, #000 calc(1em + 1px)), radial-gradient(circle at 100% var(--bite), transparent 1em, #000 calc(1em + 1px)), radial-gradient(circle at 0 50%, transparent .34em, #000 calc(.34em + 1px)) 0 .2em / 1em 1em repeat-y, linear-gradient(#000, #000) .5em 0 / calc(100% - .5em) 100% no-repeat;
  -webkit-mask-composite: source-in, source-in, source-over;
  mask: radial-gradient(circle at 0 var(--bite), transparent 1em, #000 calc(1em + 1px)), radial-gradient(circle at 100% var(--bite), transparent 1em, #000 calc(1em + 1px)), radial-gradient(circle at 0 50%, transparent .34em, #000 calc(.34em + 1px)) 0 .2em / 1em 1em repeat-y, linear-gradient(#000, #000) .5em 0 / calc(100% - .5em) 100% no-repeat;
  mask-composite: intersect, intersect, add; }
/* The survey patch: the contour lines drawn close and dark under the route glyph (A-results' right half of the paper). */
.tk-topo { position: absolute; right: 0; top: 0; width: 58%; height: 70%; z-index: -1; pointer-events: none; background: var(--contour-dark) 30px 12px / 170px 113px; -webkit-mask-image: radial-gradient(closest-side at 62% 48%, #000 35%, transparent); mask-image: radial-gradient(closest-side at 62% 48%, #000 35%, transparent); }

.ticket * { text-shadow: none; }
.tk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1em; padding-bottom: .5em; border-bottom: 2px solid rgba(29,35,38,.75); width: 100%; }
.ticket .ov-title { display: flex; flex-direction: column; gap: .3em; min-width: 0; }
.ticket .ov-kicker { font: 700 .78em/1 var(--sans); letter-spacing: .24em; text-transform: uppercase; color: var(--coal); text-shadow: none; }
.ticket .ov-name { font: 800 1.35em/1 var(--sans); font-stretch: 112%; letter-spacing: .1em; text-transform: uppercase; color: var(--coal); text-shadow: none; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tk-mark { flex: 0 0 auto; width: 11.5em; color: var(--teal); margin-top: .1em; }
.tk-stamp { margin: .22em 0 .1em -.04em; font: 400 4.2em/1 var(--display); letter-spacing: -.005em; text-transform: uppercase; color: var(--teal); white-space: nowrap; }
.tk-body { position: relative; display: flex; align-items: stretch; gap: .8em; padding-bottom: .7em; border-bottom: 1.5px solid rgba(29,35,38,.35); }
.tk-box { display: flex; flex-direction: column; justify-content: center; gap: .15em; padding: .45em .8em .5em; border: 1.5px solid rgba(29,35,38,.28); border-radius: .35em; background: rgba(255,250,238,.35); }
.tk-box small { font: 700 .72em/1 var(--sans); letter-spacing: .2em; text-transform: uppercase; color: rgba(29,35,38,.78); }
.results .time { font: 800 2.55em/1 var(--sans); font-stretch: 104%; font-variant-numeric: tabular-nums; letter-spacing: -.01em; color: var(--coal); text-shadow: none; }
.results .time .ms { font-size: 1em; }
.results .faults b { font: 800 2.55em/1 var(--sans); font-variant-numeric: tabular-nums; color: var(--coal); }
/* A bailed run: the count in vermilion (A-brand's BAIL +1), the stamp reads CLEARED instead of CLEAN LINE. */
.results .faults.bailed b { color: var(--vermilion-2); }
.results .faults { min-width: 5.2em; }
.results .pb { font: 800 .95em/1.1 var(--sans); letter-spacing: .03em; text-transform: uppercase; color: var(--teal); min-height: 1.1em; text-shadow: none; white-space: nowrap; }
.results .pb.behind { color: rgba(29,35,38,.7); }
.results .pb em { font-style: normal; color: var(--vermilion-2); }
.tk-route { position: absolute; right: .2em; top: -3.8em; width: 4.4em; height: 8em; color: rgba(15,92,99,.62); pointer-events: none; }
/* Local leaderboard (game.md § leaderboard): the ticket's right column, revealed with the medals. */
.results .board { flex: 1 1 auto; align-self: stretch; min-width: 8em; max-width: 13em; margin-left: auto; margin-right: 4.6em; padding: .1em 0; font-variant-numeric: tabular-nums; opacity: 0; transform: translateY(.5em); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.results .board[hidden] { display: none; }
.results.stage-3 .board, .results.stage-4 .board, .results.stage-5 .board { opacity: 1; transform: none; }
.results .board-head { font: 700 .66em/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; color: rgba(29,35,38,.7); margin-bottom: .35em; }
.results .board-head em { font-style: normal; color: var(--teal); }
.results .board ol { list-style: none; margin: 0; padding: 0; display: grid; row-gap: .1em; }
.results .board li { display: grid; grid-template-columns: 1em .8em 1fr auto; align-items: center; column-gap: .4em; font: 700 .78em/1.25 var(--sans); color: var(--coal); padding: .05em .3em; border-radius: .2em; }
.results .board li.you { background: rgba(15,92,99,.14); box-shadow: inset 0 0 0 1px rgba(15,92,99,.45); }
.results .board li .n { color: rgba(29,35,38,.55); }
.results .board li small { color: rgba(29,35,38,.6); font-size: .9em; }
.results .board .dot { display: block; width: .72em; height: .72em; border-radius: 50%; background: currentColor; box-shadow: inset 0 -1px 0 rgba(0,0,0,.3); }
.results .board .dot.platinum { color: #1E2A2E; box-shadow: inset 0 0 0 1.5px var(--plat); } .results .board .dot.gold { color: #D9A531; } .results .board .dot.silver { color: #9AA3AD; } .results .board .dot.bronze { color: #B8693A; }
/* Track card: the class in effect's top 5 as medal-coloured chips. */
/* The four mountain medals, split by hairlines; the one earned lifts with a glint ring, the next one says what it takes. */
.results .medals { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: .7em; }
.results .medal { position: relative; display: flex; flex-direction: column; align-items: center; gap: .3em; padding: 0 .4em; text-align: center; font: 800 .74em/1 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--coal); }
.results .medal + .medal { border-left: 1.5px solid rgba(29,35,38,.2); }
.results .medal i { position: relative; z-index: 1; display: block; width: 5.2em; height: 5.2em; border-radius: 50%; background-size: cover; background-position: center; filter: saturate(.55) brightness(1.02); opacity: .74; transition: transform var(--t3) var(--ease), filter var(--t3), opacity var(--t3); }
.results .medal.bronze { --md: #B8693A; } .results .medal.silver { --md: #AEB6C0; } .results .medal.gold { --md: #E0AE36; } .results .medal.platinum { --md: #1E2A2E; }
.results .medal i:not(.img) { background: radial-gradient(circle at 36% 30%, rgba(255,255,255,.55), transparent 42%), var(--md); box-shadow: inset 0 0 0 .3em rgba(0,0,0,.18); }
.results .medal.got i { filter: none; opacity: 1; }
.results .medal b { position: relative; z-index: 1; font-weight: 800; color: var(--coal); }
.results .medal small { position: relative; z-index: 1; display: block; min-height: 1em; font: 700 .9em/1.1 var(--sans); letter-spacing: 0; text-transform: none; color: rgba(29,35,38,.75); white-space: nowrap; font-variant-numeric: tabular-nums; }
.results .medal.next small { color: var(--teal); }
.results .medal.earned::before { content: ""; position: absolute; left: 50%; top: -.95em; width: 7.1em; height: 7.1em; margin-left: -3.55em; background: var(--laurel) center / contain no-repeat; pointer-events: none; opacity: 0; transform: scale(.8); transition: opacity var(--t3) var(--ease), transform var(--t3) var(--ease); }
.results.stage-4 .medal.earned::before, .results.stage-5 .medal.earned::before { opacity: 1; transform: none; }
.results .medal.earned.platinum i::after { content: ""; position: absolute; inset: -.2em; border-radius: 50%; box-shadow: 0 0 1.1em .15em rgba(47,214,200,.55); }
.ticket .ov-stats { display: flex; justify-content: flex-end; gap: 0; margin-top: .55em; font: 700 .68em/1 var(--sans); letter-spacing: .12em; text-transform: uppercase; color: rgba(29,35,38,.62); text-shadow: none; white-space: nowrap; }
.ticket .ov-stats b { color: var(--coal); }
.ticket .ov-stats b.bike-pro { color: #2a5da8; }
.ticket .ov-stats i { font-style: normal; margin: 0 .55em; }
/* The action row: the home screen's cards. NEXT TRACK is the vermilion one; REPLAY is a square icon card. */
#ui .hud .results .tiles { position: absolute; left: calc(4.5 * var(--vw) + var(--sal)); right: calc(4 * var(--vw) + var(--sar)); bottom: calc(max(12px, calc(6.5 * var(--vh))) + var(--sab)); display: flex; gap: calc(1.6 * var(--vw)); justify-content: flex-start; width: auto; }
#ui .hud .results .tile { flex: 23 1 0; width: auto; height: var(--card-h); min-height: 44px; flex-direction: row; gap: .55em; padding: 0 1em; border: 0; border-radius: 8px; color: var(--teal); background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F6ECD6, var(--cream) 55%, var(--cream-2)); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 8px 22px rgba(8,14,16,.38); font: 400 clamp(.95rem, calc(4.3 * var(--vh)), 1.8rem)/1 var(--display); letter-spacing: .015em; }
#ui .hud .results .tile svg { width: 1.15em; height: 1.15em; color: var(--teal); }
#ui .hud .results .tile span { color: inherit; font: inherit; letter-spacing: inherit; }
#ui .hud .results .tile span small { display: block; margin-top: .3em; font: 700 .42em/1 var(--sans); letter-spacing: .14em; opacity: .85; }
#ui .hud .results .tile[data-id="replay"] { flex: 0 0 var(--card-h); padding: 0; }
#ui .hud .results .tile[data-id="replay"] span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
#ui .hud .results .tile[data-id="next"] { flex-grow: 38; color: var(--amber-ink); background: var(--contour-light) 0 0 / 240px 160px, linear-gradient(180deg, #EE6A40, var(--vermilion) 48%, var(--vermilion-2)); box-shadow: inset 0 1px 0 rgba(255,210,190,.55), inset 0 -4px 0 rgba(100,24,6,.3), 0 10px 26px rgba(80,20,6,.42); text-shadow: 0 2px 0 rgba(120,30,8,.3); }
#ui .hud .results .tile[data-id="next"] svg { color: var(--amber-ink); }
#ui .hud .results .tile.on { color: var(--teal); transform: translateY(-3px); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 0 0 3px var(--cream), 0 0 0 5px rgba(15,92,99,.9), 0 12px 26px rgba(8,14,16,.45); }
#ui .hud .results .tile.on svg { color: currentColor; }
#ui .hud .results .tile[data-id="next"].on { color: var(--amber-ink); box-shadow: inset 0 1px 0 rgba(255,210,190,.6), 0 0 0 3px var(--cream), 0 0 0 5px rgba(120,30,8,.8), 0 14px 30px rgba(80,20,6,.5); }
#ui .hud.touch .results .tile.on { transform: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.12), 0 8px 22px rgba(8,14,16,.38); }
#ui .hud.touch .results .tile[data-id="next"].on { box-shadow: inset 0 1px 0 rgba(255,210,190,.55), inset 0 -4px 0 rgba(100,24,6,.3), 0 10px 26px rgba(80,20,6,.42); }
#ui .hud .results .tile[disabled] { color: rgba(15,92,99,.45); background: rgba(239,227,200,.55); box-shadow: none; text-shadow: none; }
#ui .hud .results .tile[data-id="next"][disabled] { color: rgba(255,244,226,.7); background: rgba(196,68,31,.5); }
#ui .hud .results .tile[disabled] svg { color: currentColor; }
.results .ov-foot { position: absolute; right: calc(4 * var(--vw) + var(--sar)); top: calc(var(--s4) + var(--sat)); }
.results .ov-foot .legend { position: static; }
/* Staged reveal (sim-clocked): ticket 0 · time .15 · bails .35 · medals + tiles + scrim .6 · PB line + earned pop .9. */
.results .time, .results .faults, .results .medals, .results .pb, .results .tiles, .results .ov-foot, .results .tk-stamp { opacity: 0; transform: translateY(.4em); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.results .tk-stamp { transform: scale(1.12); transform-origin: 0 60%; }
.results .tiles .tile { animation: none; }
.results.stage-1 .time, .results.stage-1 .tk-stamp,
.results.stage-2 .time, .results.stage-2 .faults, .results.stage-2 .tk-stamp,
.results.stage-3 .time, .results.stage-3 .faults, .results.stage-3 .medals, .results.stage-3 .tiles, .results.stage-3 .ov-foot, .results.stage-3 .tk-stamp,
.results.stage-4 .time, .results.stage-4 .faults, .results.stage-4 .medals, .results.stage-4 .tiles, .results.stage-4 .ov-foot, .results.stage-4 .pb, .results.stage-4 .tk-stamp,
.results.stage-5 .time, .results.stage-5 .faults, .results.stage-5 .medals, .results.stage-5 .tiles, .results.stage-5 .ov-foot, .results.stage-5 .pb, .results.stage-5 .tk-stamp { opacity: 1; transform: none; }
.results .medal.earned i { transform: scale(.85); }
.results.stage-4 .medal.earned i, .results.stage-5 .medal.earned i { transform: scale(1.1); }
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
.touch-layer::after { content: ''; position: absolute; left: calc(50% - 1px); width: 2px; bottom: 0; height: calc(var(--strip-h) + var(--sab)); background: #ffb020; opacity: 0; transition: opacity .25s; pointer-events: none; }
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
.rotate { position: absolute; inset: 0; z-index: 28; /* above .onboard (25) and every run overlay */ display: none; align-items: center; justify-content: center; flex-direction: column; gap: var(--s5); background: radial-gradient(120% 90% at 50% 30%, #17737B 0%, var(--teal) 45%, #093B40 100%); color: var(--ink); text-align: center; padding: calc(var(--s6) + var(--sat)) var(--s5) calc(var(--s6) + var(--sab)); pointer-events: auto; }
.rotate .wordmark { width: min(78vw, 420px); }
.rotate .msg { font: 800 .9rem/1.2 var(--sans); letter-spacing: .3em; text-transform: uppercase; color: var(--cream); }
.rotate i { display: block; width: 3rem; height: 5.2rem; border: 3px solid var(--cream); border-radius: var(--r2); box-shadow: 0 0 24px -6px var(--cream); animation: rot 1.6s var(--ease) infinite; }
.rotate .btn.reload, #ui .rotate .btn.reload { min-height: 56px; padding: 0 var(--s6); margin-top: var(--s3); border-radius: 10px; font: 400 1.15rem/1 var(--display); letter-spacing: .02em; }
.rotate .build { position: absolute; bottom: calc(var(--s4) + var(--sab)); left: 0; right: 0; font-size: .7rem; letter-spacing: .16em; text-transform: uppercase; opacity: .4; }
@keyframes rot { 0%, 20% { transform: rotate(0); } 60%, 100% { transform: rotate(90deg); } }
@media (orientation: portrait) and (pointer: coarse) and (max-width: 900px) { .rotate.armed { display: flex; } }

/* Short landscape phones (844×390): tighter type, single-row menus above the fold. html.short = logical height ≤ 500 px (orientation.ts). */
html.short .settings-wrap { padding-top: calc(var(--s3) + var(--sat)); padding-bottom: calc(var(--s4) + var(--sab)); gap: var(--s2); grid-template-columns: minmax(16rem, 30rem); }
html.short .settings-foot .controls-line { display: none; }
html.short .settings-wrap .rh-head { font-size: 1.8rem; }
html.short .setting { min-height: 46px; padding: var(--s1) var(--s3) var(--s1) calc(var(--s4) + 8px); }
html.short .setting .lab { font-size: 1.05rem; }
html.short .setting .lab small { display: none; }
html.short .legend { bottom: calc(var(--s2) + var(--sab)); font-size: .72rem; }
html.short .overlay { padding: calc(var(--s4) + var(--sat)) calc(var(--s5) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s5) + var(--sal)); row-gap: var(--s2); }
html.short .ov-name { font-size: 2.2rem; }
html.short .tile { width: 160px; height: 92px; gap: 8px; font-size: 1.05rem; }
html.short .tile svg { width: 22px; height: 22px; }
html.short .tiles { gap: var(--s3); }
html.short .ov-foot { min-height: 36px; }
/* Narrow: logical width ≤ 720 px. */
html.narrow .hud-timer { font-size: 1.9rem; }
html.narrow .hud-faults { font-size: 1.25rem; }
html.narrow .strip { width: calc(26 * var(--vw)); }
html.narrow .banner.count { font-size: 4.6rem; }
html.narrow .banner.go { font-size: 5.8rem; }
html.narrow .banner.finish { font-size: 2.4rem; }
html.narrow .settings-wrap { grid-template-columns: 1fr; }
@media (prefers-reduced-motion: reduce) {
  .overlay.show .tile, .overlay.show .ov-foot { animation: fadein var(--t2) var(--ease) both; }
  .results .time, .results .faults, .results .medals, .results .pb, .results .tiles, .results .ov-foot, .results .tk-stamp, .ticket { transform: none; }
  .menu-keyart.loaded { animation: none; }
}
`;


export const REVIEW_CSS = /* css */ `
/* ---- Level reviewer (docs/design/game.md §21) ---- */
.review-pick-screen { background: linear-gradient(90deg, rgba(6,7,9,.95) 0%, rgba(6,7,9,.88) 55%, rgba(6,7,9,.62) 100%); display: flex; flex-direction: column; padding: calc(var(--s4) + var(--sat)) calc(var(--s5) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s5) + var(--sal)); }
.rvp-head { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; padding-right: 8rem; }
.rvp-head .ov-kicker { color: var(--amber); }
.rvp-head .ov-name { font-family: var(--display); font-weight: 400; font-size: 1.6rem; line-height: 1; text-transform: uppercase; }
.rvp-head .ov-stats { color: var(--ink-dim); font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }
.rvp-rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; margin-top: var(--s3); display: flex; flex-direction: column; gap: var(--s1); padding-right: var(--s2); }
#ui .rvp-row { -webkit-appearance: none; appearance: none; flex: 0 0 auto; display: grid; grid-template-columns: 6.2rem 1fr auto; grid-template-rows: auto auto; column-gap: var(--s3); align-items: center; min-height: 48px; padding: var(--s2) var(--s3); border: 1px solid var(--line-2); border-radius: var(--r1); background: rgba(255,255,255,.04); color: var(--ink); text-align: left; cursor: pointer; font-family: var(--font); }
#ui .rvp-row.on { border-color: var(--amber); background: rgba(255,176,32,.1); }
#ui .rvp-row .tier { grid-row: 1 / span 2; font-size: .68rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--amber); }
#ui .rvp-row .name { font-family: var(--display); font-weight: 400; font-size: 1.15rem; line-height: 1; text-transform: uppercase; }
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
.rv-head .ov-name { font-family: var(--display); font-weight: 400; font-size: 1.3rem; line-height: 1; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-head .ov-stats { color: var(--ink-dim); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-strip { display: flex; gap: var(--s1); padding: var(--s1); border-radius: var(--r2); background: rgba(9,11,15,.82); border: 1px solid var(--line); box-shadow: var(--plate); }
#ui .rv-seg { -webkit-appearance: none; appearance: none; width: 44px; height: 44px; border: 1px solid transparent; border-radius: var(--r1); background: transparent; color: var(--ink-dim); font-family: var(--display); font-weight: 400; font-size: 1.2rem; cursor: pointer; position: relative; }
#ui .rv-seg.noted::after { content: ""; position: absolute; right: 5px; top: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
#ui .rv-seg.on { background: var(--amber); color: var(--amber-ink); }
#ui .rv-seg.on.noted::after { background: var(--amber-ink); }
#ui .rv-exit { -webkit-appearance: none; appearance: none; flex: 0 0 auto; display: inline-flex; align-items: center; gap: .35em; min-height: 44px; padding: 0 1.1rem 0 .8rem; border: 1px solid var(--line); border-radius: 999px; background: var(--slab); color: var(--ink); font: 700 .82rem/1 var(--font); letter-spacing: .12em; text-transform: uppercase; cursor: pointer; }
#ui .rv-exit span { font-size: 1.3em; line-height: 1; margin-top: -.1em; }
/* Notes card bottom-left: never wider than 40 % of the view, so the track centre stays clear. */
.rv-card { position: absolute; left: calc(var(--s4) + var(--sal)); bottom: calc(var(--s3) + var(--sab)); width: min(340px, calc(40 * var(--vw))); max-height: calc(100% - 96px - var(--sat) - var(--sab)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3); border-radius: var(--r2); background: rgba(9,11,15,.86); border: 1px solid var(--line); box-shadow: var(--plate); transition: opacity var(--t2) var(--ease), transform var(--t2) var(--ease); }
.review-ui.notes-off .rv-card, .review-ui.riding .rv-card { opacity: 0; transform: translateY(12px); }
.review-ui.notes-off .rv-card *, .review-ui.riding .rv-card * { pointer-events: none !important; }
.rv-seg-title { font-family: var(--display); font-weight: 400; font-size: 1.05rem; line-height: 1; text-transform: uppercase; display: flex; align-items: baseline; gap: .5em; }
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
.inbox { position: absolute; inset: 0; z-index: 29; /* above .rotate (28) */ display: flex; align-items: center; justify-content: center; padding: calc(var(--s3) + var(--sat)) calc(var(--s4) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s4) + var(--sal)); background: rgba(6,7,9,.6); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
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
