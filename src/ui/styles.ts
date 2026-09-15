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
#ui, #ui * { box-sizing: border-box; }
#ui {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  font-family: var(--font); color: var(--ink); font-weight: 500;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none;
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
}
#ui button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
#ui button:focus { outline: none; }
/* Title backdrop drift: the renderer's menu camera is static, so the canvas itself drifts (12 s ease, mirrored). */
#app.drift canvas { animation: drift 12s var(--ease) infinite alternate; transform-origin: 45% 58%; }
/* The idle camera parks the bike at x≈45 %; the drift also carries it right of the wordmark (≈62 %). */
@keyframes drift { from { transform: scale(1.06) translate(13%, .6%); } to { transform: scale(1.14) translate(11%, -.8%); } }
@keyframes drift-phone { from { transform: scale(1.08) translate(20%, .6%); } to { transform: scale(1.16) translate(18%, -.8%); } }
#app.dim canvas { filter: saturate(.85) brightness(.9); transition: filter var(--t3) var(--ease); }
`;

export const FRONT_CSS = /* css */ `
/* ---- shared front-end pieces ---------------------------------------- */
/* Hidden screens are OUT of hit-testing and the accessibility tree, not merely transparent: visibility: hidden
   (delayed until the fade-out ends) on top of pointer-events: none, so no tap, scroll, focus or click can reach a
   screen that is not the current one. */
.screen { position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity var(--t2) var(--ease), visibility 0s; }
.screen:not(.show) *, .overlay:not(.show) *, .onboard:not(.show) *, .results:not(.show) *, .replay:not(.show) * { pointer-events: none !important; }
.overlay:not(.show), .onboard:not(.show), .results:not(.show), .replay:not(.show) { visibility: hidden; transition: opacity var(--t2) var(--ease), visibility 0s linear var(--t2); }
.screen.show .rise { animation: rise var(--t2) var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.scrim { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 35%, rgba(6,7,9,.92)); }
.scrim.side { background: linear-gradient(90deg, rgba(6,7,9,.94) 0%, rgba(6,7,9,.82) 34%, rgba(6,7,9,.35) 62%, rgba(6,7,9,.2) 100%), linear-gradient(180deg, rgba(6,7,9,.35), transparent 30%, transparent 70%, rgba(6,7,9,.9)); }
/* Key art is mirrored so its hero (authored left of centre) lands right of the wordmark; the mask (local coords, pre-flip) clears the wordmark side. */
.keyart { position: absolute; inset: 0; pointer-events: none; background-size: cover; background-position: 50% 40%; opacity: 0; transition: opacity var(--t3) var(--ease); transform: scaleX(-1); -webkit-mask-image: linear-gradient(90deg, #000 55%, transparent 90%); mask-image: linear-gradient(90deg, #000 55%, transparent 90%); }
.keyart.loaded { opacity: .55; }
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

/* ---- title ------------------------------------------------------------ */
.title-screen .wordmark { position: absolute; left: calc(calc(6 * var(--vw)) + var(--sal)); bottom: calc(22% + var(--sab)); font-size: clamp(4rem, calc(11.5 * var(--vw)), 9.5rem); }
.title-screen .press { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal) + .3rem); bottom: calc(13% + var(--sab)); font-size: 1rem; letter-spacing: .38em; text-transform: uppercase; color: var(--ink); font-weight: 700; animation: pulse 1.6s ease-in-out infinite; text-shadow: var(--outline); }
.title-screen .press i { display: inline-block; width: .55em; height: .55em; margin-right: .9em; border-radius: 50%; background: var(--amber); box-shadow: 0 0 10px var(--amber); vertical-align: 5%; }
@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
.title-screen .build { position: absolute; right: calc(var(--s5) + var(--sar)); bottom: calc(var(--s4) + var(--sab)); font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink); opacity: .4; }
.title-screen.leave .wordmark, .title-screen.leave .press { transition: transform var(--t2) var(--ease), opacity var(--t2) var(--ease); transform: translateY(-12px); opacity: 0; }

/* ---- main menu -------------------------------------------------------- */
.menu-screen .wordmark { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal)); top: calc(9% + var(--sat)); font-size: clamp(2.2rem, calc(5.6 * var(--vw)), 4.2rem); }
.menu-list { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal)); top: calc(9% + var(--sat) + clamp(5rem, calc(12 * var(--vw)), 9rem)); display: flex; flex-direction: column; gap: var(--s1); width: min(24rem, calc(60 * var(--vw))); }
.menu-item { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 44px; padding: var(--s2) var(--s5) var(--s2) var(--s5); border: 0; background: transparent; text-align: left; cursor: pointer; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.4rem; line-height: 1; text-transform: uppercase; letter-spacing: .005em; color: var(--ink-dim); transition: color var(--t1) var(--ease), transform var(--t2) var(--ease), opacity var(--t2) var(--ease); }
.menu-item small { font-family: var(--font); font-style: normal; font-weight: 500; font-size: .9rem; letter-spacing: .06em; text-transform: none; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.menu-item.on { color: var(--ink); transform: translateX(var(--s3)); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.menu-item.on small { color: var(--ink-dim); }
.menu-item.on::before { content: ""; position: absolute; left: calc(-1 * var(--s3)); top: 12%; bottom: 12%; width: 4px; border-radius: 2px; background: var(--amber); box-shadow: 0 0 12px var(--amber); }
.menu-item[disabled] { opacity: .35; cursor: default; }
.mini-seg { display: inline-flex; gap: 0; border: 1px solid var(--line-2); border-radius: var(--r1); overflow: hidden; margin-top: 3px; }
.mini-seg b { font-weight: 700; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; padding: 3px 10px; color: var(--ink-mute); }
.mini-seg b.on { background: var(--amber); color: var(--amber-ink); }
.menu-bar { position: absolute; left: 0; width: 0; height: 44px; border-radius: var(--r2); background: linear-gradient(90deg, rgba(255,176,32,.22), rgba(255,176,32,.02) 70%, transparent); pointer-events: none; transition: transform var(--t1) var(--ease), width var(--t1) var(--ease), height var(--t1) var(--ease), opacity var(--t2); opacity: 0; }
.menu-bar.on { opacity: 1; }
.menu-screen .show .menu-item { animation: rise var(--t2) var(--ease) both; }
.menu-screen .menu-item:nth-child(2) { animation-delay: 40ms; } .menu-screen .menu-item:nth-child(3) { animation-delay: 80ms; } .menu-screen .menu-item:nth-child(4) { animation-delay: 120ms; } .menu-screen .menu-item:nth-child(5) { animation-delay: 160ms; }
.menu-foot { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal) + var(--s5)); bottom: calc(10% + var(--sab)); font-size: .9rem; letter-spacing: .08em; color: var(--ink-mute); }
.menu-side { display: none; }
.menu-side h3 { margin: 0; font-size: .72rem; letter-spacing: .3em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
.menu-side .big { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 1.7rem; line-height: 1; }
.menu-side .row2 { display: flex; justify-content: space-between; gap: var(--s3); font-size: .9rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.menu-side .medals { display: flex; gap: var(--s2); margin-top: var(--s1); }
.menu-side .medals span { display: inline-flex; align-items: center; gap: .35em; font-size: .85rem; font-weight: 700; }
.menu-side .medals i { width: .8em; height: .8em; border-radius: 50%; background: currentColor; box-shadow: inset 0 -2px 0 rgba(0,0,0,.35); }

/* ---- track select ----------------------------------------------------- */
.tracks-screen { background: linear-gradient(90deg, rgba(6,7,9,.88) 0%, rgba(6,7,9,.6) 40%, rgba(6,7,9,.35) 100%); }
.tracks-head { position: absolute; left: calc(calc(5 * var(--vw)) + var(--sal)); right: calc(calc(5 * var(--vw)) + var(--sar)); top: calc(var(--s5) + var(--sat)); display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); }
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
.card .top em.ghost { font-style: normal; color: var(--ink); background: rgba(255,255,255,.14); border-radius: 3px; padding: 1px 6px; margin-right: 2.1rem; letter-spacing: .1em; }
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
.overlay { position: absolute; inset: 0; z-index: 1; display: grid; grid-template-rows: auto 1fr auto auto; grid-template-columns: 100%; row-gap: var(--s3); background: rgba(6,7,9,.5); opacity: 0; pointer-events: none; transition: opacity var(--t2) var(--ease); padding: calc(var(--s6) + var(--sat)) calc(calc(7 * var(--vw)) + var(--sar)) calc(var(--s5) + var(--sab)) calc(calc(7 * var(--vw)) + var(--sal)); }
.overlay.show { opacity: 1; pointer-events: auto; }
.overlay.leaving { opacity: 0; pointer-events: none; transition: opacity var(--t1) var(--ease); }
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
/* Visuals chip row (pause only): VISUALS · RIDER [seg] · BIKE [seg]; live preview behind the scrim. */
.visuals { display: inline-flex; align-items: center; gap: var(--s3); padding: 6px 12px; background: var(--slab); border: 1px solid var(--line-2); border-radius: var(--r2); min-height: 44px; flex: 0 0 auto; }
.visuals .vtitle { font-weight: 700; font-size: .66rem; letter-spacing: .3em; text-transform: uppercase; color: var(--amber); }
.visuals .vlab { font-weight: 700; font-size: .66rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-dim); }
.visuals .vsep { width: 1px; height: 20px; background: var(--line); }
.visuals .mini-seg { margin: 0; cursor: pointer; border-color: var(--line-2); transition: box-shadow var(--t1); }
.visuals .mini-seg b { min-width: 44px; padding: 8px 10px; text-align: center; font-size: .66rem; }
.visuals .mini-seg.focus { box-shadow: 0 0 0 2px var(--ink); }
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
.overlay.show .visuals, .overlay.show .ov-foot { animation: fadein var(--t2) var(--ease) 120ms both; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
.overlay.leaving .tile, .overlay.leaving .visuals, .overlay.leaving .ov-foot { animation: none; }
@supports (backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px)) { html:not(.short) .pause-overlay.show { -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); } }

/* ---- replay viewer (docs/design/game.md §16): kicker top-left, transport bar in the lower band ---- */
.replay { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity var(--t2) var(--ease); z-index: 5; }
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

/* ---- art plates behind a screen (garage / credits): cover, masked clear where the live scene should show ---- */
.plate-bg { position: absolute; inset: 0; pointer-events: none; background-size: cover; background-position: 50% 50%; opacity: 0; transition: opacity var(--t3) var(--ease); }
.plate-bg.loaded { opacity: .55; }
.garage-plate { -webkit-mask-image: linear-gradient(90deg, #000 40%, transparent 62%); mask-image: linear-gradient(90deg, #000 40%, transparent 62%); }
.credits-screen .plate-bg.loaded { opacity: .35; }
.bc-art { position: relative; width: calc(100% + 2 * var(--s4)); margin: calc(-1 * var(--s4)) calc(-1 * var(--s4)) 0; aspect-ratio: 3 / 2; max-height: 34%; background-size: cover; background-position: 50% 45%; opacity: 0; transition: opacity var(--t3) var(--ease); -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent 100%); mask-image: linear-gradient(180deg, #000 60%, transparent 100%); }
.bc-art.loaded { opacity: 1; }
.bc-art:not(.loaded) { display: none; }
html.short .bc-art { display: none; }
/* ---- garage (two bike cards left, the live 3D bike is the preview on the right) ---- */
.garage-screen { background: linear-gradient(90deg, rgba(6,7,9,.94) 0%, rgba(6,7,9,.86) 38%, rgba(6,7,9,.25) 62%, rgba(6,7,9,.1) 100%); }
#app.garage canvas { transform: scale(1.25) translate(28%, -2%); transform-origin: 45% 58%; transition: transform var(--t3) var(--ease); }
.garage-head { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal)); top: calc(var(--s5) + var(--sat)); display: flex; flex-direction: column; gap: var(--s1); }
.garage-head h1 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.2rem; line-height: .9; text-transform: uppercase; letter-spacing: .01em; }
.garage-head h1 small { display: block; font-family: var(--font); font-style: normal; font-weight: 700; font-size: .72rem; letter-spacing: .34em; color: var(--amber); margin-bottom: .35em; }
.garage-sub { font-size: .82rem; letter-spacing: .08em; color: var(--ink-mute); }
.garage-tip { font-size: .74rem; letter-spacing: .04em; color: var(--ink-mute); margin-top: 2px; font-variant-numeric: tabular-nums; }
.garage-cards { position: absolute; left: calc(calc(7 * var(--vw)) + var(--sal)); top: calc(var(--s5) + var(--sat) + 5.6rem); bottom: calc(var(--s6) + var(--sab)); width: min(40rem, calc(50 * var(--vw))); display: flex; gap: var(--s4); align-items: flex-start; }
.bike-card { position: relative; flex: 1 1 0; min-width: 0; max-height: 100%; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s4) var(--s4) var(--s3); border-radius: var(--r3); border: 1px solid var(--line-2); background: linear-gradient(180deg, rgba(16,19,25,.96), rgba(9,11,15,.92)); box-shadow: var(--plate); color: var(--ink); text-align: left; cursor: pointer; overflow: hidden; transition: transform var(--t2) var(--ease), box-shadow var(--t2) var(--ease), border-color var(--t1); }
.bike-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--tint); opacity: .55; transition: opacity var(--t1); }
.bike-card::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(80% 60% at 100% 0%, color-mix(in srgb, var(--tint) 22%, transparent), transparent 70%); opacity: 0; transition: opacity var(--t2); }
.bike-card.on { transform: scale(1.03); border-color: var(--tint); box-shadow: 0 0 0 2px var(--tint), 0 14px 30px rgba(0,0,0,.6); }
.bike-card.on::before, .bike-card.on::after { opacity: 1; }
.bc-top { display: flex; justify-content: space-between; align-items: center; font-size: .68rem; letter-spacing: .3em; text-transform: uppercase; color: var(--ink-dim); font-weight: 700; }
.bc-sel { visibility: hidden; color: var(--amber-ink); background: var(--amber); border-radius: 3px; padding: 2px 8px; letter-spacing: .14em; }
.bike-card.selected .bc-sel { visibility: visible; }
.bc-name { font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.6rem; line-height: .9; text-transform: uppercase; color: var(--tint); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.bc-line { font-size: .92rem; line-height: 1.35; color: var(--ink-dim); min-height: 2.7em; }
.bc-stats { display: flex; flex-direction: column; gap: 6px; margin-top: var(--s2); }
.bc-stats .stat { display: grid; grid-template-columns: 4.2em 1fr 4.6em; align-items: center; gap: var(--s2); font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-dim); font-weight: 700; }
.bc-stats .stat i { display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; }
.bc-stats .stat b { display: block; height: 100%; width: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--tint) 70%, #000), var(--tint)); transition: width var(--t3) var(--ease); }
.bc-stats .stat em { font-style: normal; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: .04em; }
.bc-note { font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); padding-top: var(--s2); border-top: 1px solid var(--line-2); }
.bike-card.on .bc-note { color: var(--ink-dim); }
.card .top em.bike { font-style: normal; color: #0b1a2e; background: var(--blue); border-radius: 3px; padding: 1px 6px; margin-right: 2.1rem; letter-spacing: .1em; font-weight: 700; }
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
.fpsmeter { position: absolute; right: calc(.5rem + var(--sar)); top: calc(.15rem + var(--sat)); z-index: 7; pointer-events: none; font: 600 10px/1.4 var(--mono); letter-spacing: .04em; color: rgba(255,255,255,.55); text-shadow: 0 1px 2px rgba(0,0,0,.8); }
.fpsmeter.bad { color: #ff7a5c; }
.hud.touch ~ .fpsmeter, .touch-layer.on.visible ~ .fpsmeter { top: calc(4.2rem + var(--sat)); }
.toast { position: absolute; left: 50%; bottom: calc(var(--s5) + var(--sab)); transform: translate(-50%, 140%); z-index: 30; display: flex; align-items: center; gap: var(--s3); padding: var(--s2) var(--s2) var(--s2) var(--s4); background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r2); box-shadow: var(--plate), 0 18px 40px rgba(0,0,0,.6); opacity: 0; pointer-events: none; transition: transform var(--t3) var(--ease), opacity var(--t3) var(--ease); white-space: nowrap; }
.toast.show { transform: translate(-50%, 0); opacity: 1; pointer-events: auto; }
.toast-dot { width: .6rem; height: .6rem; border-radius: 50%; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: pulse 1.6s ease-in-out infinite; }
.toast-text { display: flex; flex-direction: column; line-height: 1.15; }
.toast-text b { font-weight: 700; letter-spacing: .04em; }
.toast-text small { font-size: .74rem; color: var(--ink-mute); }

/* ---- onboarding card (first launch, over the first countdown, game paused) ---- */
.onboard { position: absolute; inset: 0; z-index: 25; display: flex; align-items: center; justify-content: center; background: rgba(6,7,9,.55); opacity: 0; pointer-events: none; transition: opacity var(--t2) var(--ease); padding: var(--s4); }
.onboard.show { opacity: 1; pointer-events: auto; }
.ob-card { width: min(34rem, 100%); display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); background: var(--slab-3); border: 1px solid var(--line); border-radius: var(--r3); box-shadow: var(--plate), 0 24px 60px rgba(0,0,0,.6); }
.ob-card h2 { margin: 0; font-family: var(--display); font-style: italic; font-weight: 900; font-size: 2.4rem; line-height: .9; text-transform: uppercase; }
.ob-lines { display: flex; flex-direction: column; gap: var(--s2); font-size: .98rem; color: var(--ink-dim); line-height: 1.35; }
.ob-lines b { color: var(--ink); }
.ob-lines kbd { font-family: var(--font); font-weight: 700; color: var(--ink); background: rgba(255,255,255,.1); border: 1px solid var(--line); border-bottom-width: 2px; padding: .02em .45em; border-radius: var(--r1); font-size: .9em; min-width: 1.6em; display: inline-block; text-align: center; }
.ob-hop { font-size: .82rem; color: var(--ink-mute); border-top: 1px solid var(--line-2); padding-top: var(--s3); }
.ob-tip { font-size: .74rem; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.ob-card .btn { align-self: flex-end; min-height: 48px; }
html.short .garage-cards { top: calc(var(--s3) + var(--sat) + 3.4rem); bottom: calc(var(--s4) + var(--sab)); width: min(32rem, calc(54 * var(--vw))); gap: var(--s2); }
html.short #app.garage canvas { transform: scale(1.3) translate(30%, -4%); }
html.short .garage-head { top: calc(var(--s3) + var(--sat)); }
html.short .garage-head h1 { font-size: 1.6rem; }
html.short .garage-sub { display: none; }
html.short .garage-tip { display: none; }
html.short .bike-card { padding: var(--s3) var(--s3) var(--s2); gap: var(--s1); }
html.short .bc-name { font-size: 1.8rem; }
html.short .bc-line { font-size: .78rem; min-height: 0; }
html.short .bc-note { display: none; }
html.short .bc-stats { gap: 3px; }
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
.hud .results.show { pointer-events: auto; }
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

/* ---- kinetic banners ------------------------------------------------ */
.banners { position: absolute; left: 0; right: 0; top: 30%; height: 0; display: flex; justify-content: center; pointer-events: none; }
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
.results { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr auto auto; grid-template-columns: 100%; row-gap: var(--s3); padding: calc(var(--s6) + var(--sat)) calc(calc(7 * var(--vw)) + var(--sar)) calc(var(--s5) + var(--sab)) calc(calc(7 * var(--vw)) + var(--sal)); background: rgba(6,7,9,0); opacity: 0; pointer-events: none; transition: opacity var(--t2) var(--ease), background var(--t3) var(--ease); }
.results.show { opacity: 1; pointer-events: auto; }
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

/* ---- touch layer ------------------------------------------------------ */
.touch-layer { position: absolute; inset: 0; pointer-events: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.touch-layer * { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; pointer-events: none; }
.touch-debug { position: absolute; left: 50%; top: calc(5.2rem + var(--sat)); transform: translateX(-50%); margin: 0; padding: .4rem .6rem; background: rgba(0,0,0,.8); color: #9f9; font: 12px/1.35 var(--mono); border-radius: .3rem; pointer-events: none; white-space: pre; z-index: 5; }
.touch-layer.on { pointer-events: auto; }
.tz { position: absolute; display: flex; align-items: flex-end; justify-content: center; padding-bottom: calc(1.4rem + var(--sab)); font-family: var(--font); font-weight: 800; letter-spacing: .2em; font-size: .85rem; color: rgba(255,255,255,.55); opacity: 0; transition: opacity .25s, background .08s; border: 0 solid rgba(255,255,255,.12); }
.touch-layer.on.visible .tz { opacity: .35; }
.touch-layer.on.visible .tz.held { opacity: .8; background: rgba(255,255,255,.07); }
.touch-layer.on.visible.settled .tz { opacity: .3; transition: opacity var(--t3) var(--ease), background .08s; }
.touch-layer.on.visible.settled .tz.held { opacity: .55; }
.tz-back { left: 0; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-fwd { left: 25%; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-brake { left: 50%; top: 0; bottom: 0; width: 25%; border-right-width: 1px; }
.tz-throttle { left: 75%; top: 0; bottom: 0; width: 25%; }
.tz-brake span { color: rgba(255,90,90,.85); } .tz-throttle span { color: rgba(90,255,140,.85); }
.tz-btn { top: calc(.7rem + var(--sat)); width: 56px; height: 44px; align-items: center; padding: 0; border-radius: .5rem; background: var(--slab); border: 1px solid var(--line); font-size: 1.2rem; letter-spacing: 0; opacity: 0; }
.tz-restart { width: auto; padding: 0 .7rem; }
.tz-restart span { display: inline-flex; align-items: center; gap: .4em; }
.tz-restart small { font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
.touch-layer.on.visible .tz-btn { opacity: .9; }
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
html.short .title-screen .wordmark { font-size: clamp(3rem, calc(9.5 * var(--vw)), 5.2rem); bottom: calc(24% + var(--sab)); }
html.short .title-screen .press { bottom: calc(11% + var(--sab)); font-size: .85rem; }
html.short .menu-screen .wordmark { font-size: clamp(1.8rem, calc(4.6 * var(--vw)), 2.6rem); top: calc(7% + var(--sat)); }
html.short .menu-list { top: calc(7% + var(--sat) + 3.6rem); gap: 0; width: min(20rem, calc(48 * var(--vw))); }
html.short .menu-item { font-size: 1.6rem; padding-top: var(--s1); padding-bottom: var(--s1); gap: 0; }
html.short .menu-item small { font-size: .78rem; }
html.short .menu-side { bottom: calc(14% + var(--sab)); padding: var(--s3) var(--s4); }
html.short .menu-side .big { font-size: 1.3rem; }
html.short .tracks-head { top: calc(var(--s3) + var(--sat)); }
html.short .tracks-head h1 { font-size: 1.8rem; }
html.short .tiers { top: calc(var(--s3) + var(--sat) + 3.2rem); bottom: calc(var(--s5) + var(--sab)); }
html.short .tier-row { padding: var(--s1) 0 var(--s1); }
html.short .card { width: clamp(10.5rem, calc(19 * var(--vw)), 13rem); }
html.short .card .name { font-size: 1.15rem; }
html.short .settings-wrap { padding-top: calc(var(--s3) + var(--sat)); padding-bottom: calc(var(--s4) + var(--sab)); gap: var(--s2); grid-template-columns: minmax(16rem, 30rem); }
html.short .settings-foot .controls-line { display: none; }
html.short .menu-foot { bottom: calc(8% + var(--sab)); font-size: .8rem; }
html.short .settings-wrap h1 { font-size: 1.8rem; }
html.short .setting { min-height: 46px; padding: var(--s1) var(--s3); }
html.short .setting .lab { font-size: 1.05rem; }
html.short .setting .lab small { display: none; }
html.short #app.drift canvas { animation-name: drift-phone; }
html.short .legend { bottom: calc(var(--s2) + var(--sab)); font-size: .72rem; }
html.short .corner-brand { bottom: calc(var(--s2) + var(--sab)); }
html.short .overlay, html.short .results { padding: calc(var(--s4) + var(--sat)) calc(var(--s5) + var(--sar)) calc(var(--s3) + var(--sab)) calc(var(--s5) + var(--sal)); row-gap: var(--s2); }
html.short .ov-name { font-size: 2.2rem; }
html.short .tile { width: 160px; height: 92px; gap: 8px; font-size: 1.05rem; }
html.short .tile svg { width: 22px; height: 22px; }
html.short .tiles { gap: var(--s3); }
html.short .visuals { min-height: 40px; padding: 4px 10px; gap: var(--s2); }
html.short .visuals .mini-seg b { padding: 6px 8px; }
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
  #app.drift canvas { animation: none; }
  .overlay.show .tile, .overlay.show .visuals, .overlay.show .ov-foot { animation: fadein var(--t2) var(--ease) both; }
  .results .time, .results .faults, .results .medals, .results .pb, .results .tiles, .results .ov-foot { transform: none; }
  .title-screen .press { animation: none; opacity: 1; }
}
`;

export const UI_CSS = TOKENS_CSS + FRONT_CSS + HUD_CSS;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'ui-css';
  el.textContent = UI_CSS;
  document.head.appendChild(el);
}
