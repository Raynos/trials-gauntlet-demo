/**
 * World map styles (project/archive/WORLD_MAP.md, ask 54) — owned by src/ui/worldMapScreen.ts, injected once as its own
 * <style id="worldmap-css">. Tokens come from styles.ts (the brand palette, `--slab`, `--font` / `--sans` / `--display`, medal colours, safe-area
 * insets). The scene is one transform root; markers, names and the card counter-scale with `--inv` (1 / zoom) so a
 * diamond is a true 44 px hit target at every zoom (the box is 46 px: a 44 px box reads 43.99 after the scale's round trip).
 */

export const WORLD_MAP_CSS = `
.worldmap-screen { background: #05070c; overflow: hidden; font-family: var(--font); }
.worldmap-screen.leave { transition: opacity var(--t3) var(--ease); opacity: 0; }
.worldmap-screen .wm-view { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; background: #06121f; }
.worldmap-screen .wm-view.grabbing { cursor: grabbing; }
.worldmap-screen .wm-scene { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; transform-origin: 0 0; will-change: transform; --inv: 1; --invh: 1; }
/* Terrain: the world plate under everything (a tinted sea while it decodes), the five region plates fading in above the tier zoom, feathered at their edges. */
.wm-world { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; background: radial-gradient(ellipse at 40% 45%, #2a3d55 0%, #0d1a2b 55%, #060c15 100%); background-size: cover; }
.wm-world.loaded { background-size: 100% 100%; }
.wm-tier { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; opacity: 0; pointer-events: none; }
.wm-region { position: absolute; background-size: 100% 100%; opacity: 0; transition: opacity .5s var(--ease);
  -webkit-mask-image: linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  -webkit-mask-composite: source-in; mask-composite: intersect; }
.wm-region.loaded { opacity: 1; }
/* The road: a dashed dirt line for the whole route, an amber glow on the cleared legs; spurs dashed and faint. Stroke widths counter the zoom. */
.wm-route { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; overflow: visible; pointer-events: none; }
.wm-route path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.wm-route .dim { stroke: rgba(255,255,255,.7); stroke-width: calc(2.4px * var(--inv)); stroke-dasharray: calc(8px * var(--inv)) calc(7px * var(--inv)); filter: drop-shadow(0 0 calc(1px * var(--inv)) rgba(0,0,0,.8)); }
.wm-route .spur { stroke: rgba(255,255,255,.4); stroke-width: calc(1.8px * var(--inv)); stroke-dasharray: calc(4px * var(--inv)) calc(6px * var(--inv)); }
.wm-route .glow { stroke: rgba(247,207,85,.24); stroke-width: calc(9px * var(--inv)); filter: blur(calc(2px * var(--inv))); }
.wm-route .lit { stroke: rgba(255,236,170,.95); stroke-width: calc(2.6px * var(--inv)); filter: drop-shadow(0 0 calc(2px * var(--inv)) rgba(247,207,85,.8)); }
/* Fog of war: soft blue-grey ellipses over locked land; a cold horizon haze along the top of the viewport. */
.wm-fog { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; overflow: visible; pointer-events: none; }
.wm-fog ellipse { fill: url(#wm-fog-g); opacity: .62; }
.wm-fog ellipse.open { animation: wm-lift 1.4s var(--ease) both; }
@keyframes wm-lift { to { opacity: 0; } }
.wm-haze { position: absolute; left: 0; right: 0; top: 0; height: 34%; pointer-events: none; background: linear-gradient(to bottom, rgba(120,150,190,.34), rgba(120,150,190,.12) 45%, transparent); }
/* Cloud shadows: a tile of soft dark blobs drifting across the viewport (a pure transform loop, one layer; off under reduced motion). */
.wm-clouds { position: absolute; left: 0; top: 0; width: calc(100% + 640px); height: calc(100% + 640px); pointer-events: none; opacity: .55;
  background-image: radial-gradient(ellipse 260px 150px at 120px 200px, rgba(0,4,14,.5), transparent 70%), radial-gradient(ellipse 320px 170px at 480px 520px, rgba(0,4,14,.45), transparent 70%), radial-gradient(ellipse 190px 120px at 340px 60px, rgba(0,4,14,.4), transparent 70%);
  background-size: 640px 640px; animation: wm-drift 70s linear infinite; }
@keyframes wm-drift { from { transform: translate(-640px, -640px); } to { transform: translate(0, 0); } }
@media (prefers-reduced-motion: reduce) { .wm-clouds { animation: none; } }
/* Zone names: carved display capitals on two lines over the land (W-worldmap), the count beneath an open zone, the zone's sign
   beneath a locked one (the rule once per zone); they scale with the square root of the zoom. */
.wm-name { position: absolute; transform: translate(-50%, -50%) scale(var(--invh)) rotate(-6deg); transform-origin: 50% 50%; text-align: center; pointer-events: none; white-space: nowrap; color: var(--cream); text-shadow: 0 2px 0 rgba(29,35,38,.55), 0 3px 12px rgba(0,0,0,.6), 0 0 26px rgba(0,0,0,.45); }
.wm-name b { display: block; font: 400 29px/.94 var(--display); letter-spacing: .05em; text-transform: uppercase; margin-right: -.05em; }
.wm-name b span { display: block; }
.wm-name small { display: block; margin-top: 5px; font: 800 12px/1 var(--sans); letter-spacing: .24em; color: rgba(239,227,200,.82); margin-right: -.24em; }
.wm-name.locked b { color: rgba(239,227,200,.7); }
.wm-name.under { opacity: .22; transition: opacity var(--t2) var(--ease); }
.wm-sign { display: inline-flex; flex-direction: column; align-items: center; margin-top: 7px; padding: 4px 10px 4px 22px; position: relative; border-radius: 2px; background: linear-gradient(180deg, #B98A55, #8E6236); box-shadow: inset 0 1px 0 rgba(255,230,190,.45), 0 0 0 1px rgba(40,24,10,.7), 0 3px 8px rgba(0,0,0,.55); font: 800 10px/1.25 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: #FFF4E2; text-shadow: 0 1px 0 rgba(40,20,5,.6); }
.wm-sign small { display: block; margin-top: 1px; font: 800 8.5px/1.2 var(--sans); letter-spacing: .08em; color: rgba(255,244,226,.8); }
.wm-padlock { position: absolute; left: 8px; top: 7px; width: 9px; height: 7px; border-radius: 1.5px; background: #FFF4E2; }
.wm-padlock::before { content: ''; position: absolute; left: 1.5px; top: -4.5px; width: 3px; height: 4px; border: 1.5px solid #FFF4E2; border-bottom: 0; border-radius: 3px 3px 0 0; }
/* Markers: a diamond on the terrain in the medal colour (blue = playground / Lab, white = open, grey + padlock = locked — the rule is on the zone's sign), a light spire under it, a leader line up-right to a small name plate. */
.wm-markers { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; }
.wm-marker { position: absolute; width: 0; height: 0; transform: scale(var(--inv)); transform-origin: 0 0; --mk: #EEF1F2; --mk2: #9AA6AE; }
.wm-marker.gold { --mk: #F7CF55; --mk2: #B7801A; }
.wm-marker.silver { --mk: #e4e9f0; --mk2: #8892a0; }
.wm-marker.bronze { --mk: #E09A62; --mk2: #8A4B22; }
.wm-marker.platinum { --mk: #3EE0D2; --mk2: #0B1417; }
.wm-marker.proving { --mk: #2FB8B0; --mk2: var(--teal); }
.wm-marker.locked { --mk: #F4F1EA; --mk2: #B9B2A2; }
/* FREE RIDE: a round teal pin with a white flag (W-worldmap), not a diamond. */
.wm-marker.proving .wm-diamond { width: 22px; height: 22px; border-radius: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle at 35% 30%, #4FD3C9, var(--teal) 70%); box-shadow: 0 0 0 2px #fff, 0 3px 8px rgba(0,0,0,.55); }
.wm-marker.proving .wm-diamond::after { content: ''; position: absolute; left: 7px; top: 5px; width: 10px; height: 12px; background: #fff; clip-path: polygon(0 0, 100% 22%, 18% 45%, 18% 100%, 0 100%); }
.wm-marker.proving.locked .wm-diamond { filter: saturate(.3) brightness(.9); }
.wm-marker.proving .wm-plate b { color: #7EE7DF; text-transform: uppercase; letter-spacing: .08em; }
.wm-marker .wm-hit { position: absolute; left: -23px; top: -23px; width: 46px; height: 46px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.wm-marker .wm-diamond { position: absolute; left: 50%; top: 50%; width: 17px; height: 17px; transform: translate(-50%, -50%) rotate(45deg); background: linear-gradient(135deg, #fff 0%, var(--mk) 38%, var(--mk2) 100%); box-shadow: 0 0 0 1.5px rgba(0,0,0,.55), 0 0 10px 2px color-mix(in srgb, var(--mk) 70%, transparent), 0 3px 6px rgba(0,0,0,.6); }
.wm-marker .wm-spire { position: absolute; left: -3px; top: -46px; width: 6px; height: 46px; pointer-events: none; background: linear-gradient(to top, color-mix(in srgb, var(--mk) 85%, #fff) 0%, color-mix(in srgb, var(--mk) 55%, transparent) 40%, transparent 100%); border-radius: 3px; opacity: .85; filter: blur(.4px); }
.wm-marker .wm-foot { position: absolute; left: -16px; top: -6px; width: 32px; height: 12px; border-radius: 50%; pointer-events: none; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--mk) 60%, transparent), transparent 70%); }
.wm-marker.locked .wm-spire, .wm-marker.locked .wm-foot { opacity: .35; }
.wm-marker .wm-lock { position: absolute; left: 50%; top: 50%; width: 9px; height: 8px; transform: translate(-50%, -30%); display: none; border-radius: 2px; background: var(--coal); }
.wm-marker .wm-lock::before { content: ''; position: absolute; left: 1.5px; top: -5px; width: 4px; height: 6px; border: 1.5px solid var(--coal); border-bottom: 0; border-radius: 4px 4px 0 0; }
.wm-marker.locked .wm-lock { display: block; }
.wm-marker .wm-lead { position: absolute; left: 8px; top: -8px; width: 17px; height: 1px; background: rgba(255,255,255,.75); transform-origin: 0 0; transform: rotate(-32deg); pointer-events: none; }
.wm-marker .wm-plate { position: absolute; left: 22px; top: -28px; display: inline-flex; align-items: center; gap: .35em; height: 17px; padding: 0 7px 0 6px; border-radius: 3px; background: rgba(20,31,34,.9); box-shadow: 0 0 0 1px rgba(239,227,200,.18), 0 2px 8px rgba(0,0,0,.5); font: 700 10px/1 var(--sans); letter-spacing: .02em; color: var(--ink); white-space: nowrap; pointer-events: none; }
.wm-marker .wm-plate b { color: #fff; }
.wm-marker.locked .wm-plate { color: var(--ink-dim); }
.wm-marker .wm-plate .tag { font-style: normal; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; padding: 2px 5px; border-radius: 2px; margin-left: 2px; }
.wm-marker .wm-plate .tag.next { background: var(--teal); color: #fff; box-shadow: 0 0 0 1px #7EE7DF; }
.wm-marker .wm-plate .tag.pro { background: rgba(255,255,255,.18); color: var(--ink); }
.wm-marker .wm-plate .tag.ghost { background: rgba(90,169,255,.25); color: #cfe6ff; }
/* The focused marker: the bike at its foot, an amber beacon climbing into the sky, its plate hidden under the card. */
.wm-marker.on { z-index: 3; --mk: #6FA8FF; --mk2: #1D4FB8; }
.wm-marker.on .wm-diamond { box-shadow: 0 0 0 2px #fff, 0 0 12px 3px rgba(111,168,255,.8), 0 3px 6px rgba(0,0,0,.6); }
.wm-marker.on .wm-plate, .wm-marker.on .wm-lead { display: none; }
.wm-marker .wm-beacon { position: absolute; left: -9px; bottom: 0; width: 18px; height: 320px; display: none; pointer-events: none; background: linear-gradient(to top, rgba(200,245,242,1), rgba(126,231,223,.8) 18%, rgba(47,184,176,.42) 48%, rgba(47,184,176,.12) 78%, transparent); box-shadow: 0 0 18px 4px rgba(47,184,176,.35); filter: blur(1px); border-radius: 9px; animation: wm-beacon 2.4s ease-in-out infinite alternate; }
.wm-marker .wm-beacon::after { content: ''; position: absolute; left: -22px; bottom: -14px; width: 62px; height: 28px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(160,240,235,.85), rgba(47,184,176,.3) 50%, transparent 72%); }
.wm-marker.on .wm-beacon { display: block; }
@keyframes wm-beacon { from { opacity: .75; } to { opacity: 1; } }
.wm-marker .wm-ring { position: absolute; left: -24px; top: -12px; width: 48px; height: 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,.9); box-shadow: 0 0 12px rgba(111,168,255,.8), inset 0 0 10px rgba(111,168,255,.35); display: none; pointer-events: none; }
.wm-marker.on .wm-ring { display: block; }
.wm-marker .wm-bike { position: absolute; left: -15px; top: 4px; width: 30px; height: 20px; display: none; pointer-events: none; color: #6fb6ff; filter: drop-shadow(0 1px 2px rgba(0,0,0,.8)); }
.wm-marker.on .wm-bike { display: block; }
.wm-marker.on .wm-diamond { width: 20px; height: 20px; animation: wm-pulse 1.6s ease-in-out infinite alternate; }
@keyframes wm-pulse { from { box-shadow: 0 0 0 2px #fff, 0 0 10px 2px rgba(111,168,255,.7); } to { box-shadow: 0 0 0 2px #fff, 0 0 18px 5px rgba(111,168,255,.95); } }
.wm-marker.go .wm-diamond { animation: wm-go .42s var(--ease) both; }
@keyframes wm-go { to { transform: translate(-50%, -50%) rotate(45deg) scale(2.6); opacity: 0; } }
.wm-marker.shaded { opacity: .35; }
.wm-marker.shaded .wm-hit { pointer-events: none; }
/* Far zoom (the whole continent): plates fold away, diamonds shrink and stop taking pointers — a tap on the land flies to the nearest marker. */
.wm-scene.far .wm-marker .wm-plate { transform: scale(.8); transform-origin: 0 100%; left: 18px; top: -24px; }
.wm-scene.far .wm-marker .wm-plate .tag { display: none; }
.wm-scene.far .wm-lead { width: 15px; }
/* A marker whose name plate would sit on a zone name hangs it to the left instead (PLATE_LEFT in worldMap.ts). */
.wm-marker.lead-left .wm-lead { left: -25px; transform-origin: 100% 0; transform: rotate(32deg); }
.wm-marker.lead-left .wm-plate { left: auto; right: 22px; }
.wm-scene.far .wm-marker.lead-left .wm-plate { left: auto; right: 18px; transform-origin: 100% 100%; }
.wm-scene.far .wm-hit { pointer-events: none; }
.wm-scene.far .wm-diamond { width: 13px; height: 13px; }
.wm-scene.far .wm-marker.on .wm-diamond { width: 16px; height: 16px; }
.wm-scene.far .wm-spire { height: 34px; top: -34px; }
.wm-scene.far .wm-marker .wm-beacon { height: 110px; width: 10px; left: -5px; opacity: .8; }
/* The zone gate: three vermilion chevrons across the road where it enters the locked land (its rule is on the zone's sign). */
.wm-gate { position: absolute; width: 0; height: 0; transform: scale(var(--inv)); transform-origin: 0 0; z-index: 2; }
.wm-gate .wm-hit { position: absolute; left: -23px; top: -23px; width: 46px; height: 46px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }
.wm-gate .chev { position: absolute; left: -24px; top: -13px; width: 48px; display: flex; justify-content: center; transform-origin: 24px 13px; font: 400 26px/26px var(--display); color: var(--vermilion); text-shadow: 0 0 8px rgba(228,87,46,.9), 0 0 2px #000, 0 1px 2px #000; letter-spacing: -.12em; pointer-events: none; animation: wm-chev 1.2s ease-in-out infinite alternate; }
@keyframes wm-chev { from { opacity: .7; } to { opacity: 1; } }
.wm-gate.shaded { opacity: .35; }
.wm-gate.shaded .wm-hit { pointer-events: none; }
.wm-scene.far .wm-gate .wm-hit { pointer-events: none; }
/* The card, attached to the focused marker: code · tier · region, the name, best / target, the local board, GHOST. */
.wm-card { position: absolute; z-index: 4; transform: translate(26px, -14%) scale(var(--inv)); transform-origin: -26px 14%; width: 178px; padding: 8px 10px 9px; border-radius: 7px; background: linear-gradient(180deg, rgba(22,41,45,.96), rgba(14,26,29,.96)); box-shadow: 0 0 0 1px rgba(126,231,223,.28), 0 8px 22px rgba(0,0,0,.55); color: var(--ink); pointer-events: none; }
.wm-card::before { content: ''; position: absolute; left: -7px; top: 14%; width: 7px; height: 1px; background: rgba(255,255,255,.85); }
.wm-card.up { transform: translate(26px, -90%) scale(var(--inv)); transform-origin: -26px 90%; }
.wm-card.up::before { top: 90%; }
.wm-card.left { transform: translate(calc(-100% - 26px), -14%) scale(var(--inv)); transform-origin: calc(100% + 26px) 14%; }
.wm-card.left.up { transform: translate(calc(-100% - 26px), -90%) scale(var(--inv)); transform-origin: calc(100% + 26px) 90%; }
.wm-card.left::before { left: auto; right: -7px; }
.wm-scene.far .wm-card.up { transform: translate(18px, -90%) scale(calc(var(--inv) * .7)); transform-origin: -18px 90%; }
.wm-card .head { font: 800 9px/1 var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--ochre); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-card .head b { color: #F2C14E; }
.wm-card .name { margin-top: 4px; font: 400 18px/1 var(--display); text-transform: uppercase; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-card .times { margin-top: 4px; font: 700 12px/1 var(--mono); color: var(--ink-dim); white-space: nowrap; }
.wm-card .times b { color: var(--green); font-size: 14px; }
.wm-card .times b.none { color: var(--ink-mute); }
.wm-card .times b.behind { color: var(--ink); }
.wm-card .rule { margin-top: 5px; font: 800 9.5px/1.3 var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--ochre); }
.wm-card .board { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
.wm-card .board span { font: 700 9.5px/1 var(--mono); padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,.07); color: var(--ink-dim); }
.wm-card .board span.gold { color: var(--gold); } .wm-card .board span.silver { color: var(--silver); } .wm-card .board span.bronze { color: var(--bronze); } .wm-card .board span.platinum { color: var(--plat); }
.wm-card .wm-card-ghost { display: inline-flex; align-items: center; gap: .4em; margin-top: 6px; height: 18px; padding: 0 7px 0 6px; border-radius: 3px; background: rgba(90,169,255,.16); color: #cfe6ff; font: 700 10px/1 var(--font); letter-spacing: .12em; text-transform: uppercase; }
.wm-card .wm-card-ghost[hidden] { display: none; }
.wm-scene.far .wm-card { transform: translate(18px, -14%) scale(calc(var(--inv) * .7)); transform-origin: -18px 14%; }
.wm-scene.far .wm-card.left { transform: translate(calc(-100% - 18px), -14%) scale(calc(var(--inv) * .7)); transform-origin: calc(100% + 18px) 14%; }
.wm-scene.far .wm-card.left.up { transform: translate(calc(-100% - 18px), -90%) scale(calc(var(--inv) * .7)); transform-origin: calc(100% + 18px) 90%; }
/* Screen-space chrome: the badge + build stamp top-left, ‹ MENU top-right, progress bottom-left, RIDE + GHOST bottom-right. */
.wm-brand { position: absolute; left: calc(var(--s5) + var(--sal)); top: calc(var(--s4) + var(--sat)); z-index: 4; pointer-events: none; }
.wm-brand .plate { display: inline-flex; align-items: center; gap: .6em; min-height: 34px; padding: 0 1.3em 0 .9em; background: rgba(20,31,34,.9); box-shadow: inset 4px 0 0 var(--vermilion), 0 4px 14px rgba(0,0,0,.4); clip-path: polygon(0 0, 100% 0, calc(100% - .7em) 100%, 0 100%); }
.wm-brand .plate b.wordmark { width: 7.2rem; filter: none; }
.wm-brand .plate span { font: 800 .6rem/1 var(--sans); letter-spacing: .28em; text-transform: uppercase; color: var(--cream); padding-left: .6em; border-left: 1px solid rgba(255,255,255,.2); }
.wm-brand .stamp { margin-top: 4px; padding-left: .9em; font: 500 .6rem/1 var(--font); letter-spacing: .06em; color: var(--ink-mute); text-shadow: 0 1px 2px #000; }
.wm-safe { position: absolute; left: 0; top: 0; width: var(--sal); height: var(--sar); visibility: hidden; pointer-events: none; }
.worldmap-screen .backbtn { top: calc(var(--s4) + var(--sat)); }
.wm-progress { position: absolute; left: calc(var(--s5) + var(--sal)); bottom: calc(var(--s4) + var(--sab)); z-index: 4; display: flex; align-items: center; gap: 1.1em; min-height: 42px; padding: 0 1.1em 0 1em; border-radius: 10px; background: rgba(16,28,31,.9); box-shadow: 0 0 0 1px rgba(239,227,200,.16), 0 4px 14px rgba(0,0,0,.4); pointer-events: none; white-space: nowrap; }
.wm-progress .n { font: 400 1.15rem/1 var(--display); text-transform: uppercase; color: var(--ink); }
.wm-progress .n b { color: #fff; font-size: 1.4rem; }
.wm-progress .dots { display: flex; gap: .95em; padding-left: 1.1em; border-left: 1px solid rgba(239,227,200,.22); font: 400 1rem/1 var(--display); color: var(--ink); }
.wm-progress .dots span { display: inline-flex; align-items: center; gap: .35em; }
.wm-progress .dots svg { width: 1.3em; height: 1.3em; filter: drop-shadow(0 1px 2px rgba(0,0,0,.5)); }
.wm-actions { position: absolute; right: calc(var(--s5) + var(--sar)); bottom: calc(var(--s4) + var(--sab)); z-index: 4; display: flex; gap: 10px; }
#ui .wm-actions button { display: inline-flex; align-items: center; gap: .55em; min-height: 46px; padding: 0 1.2em; border: 0; border-radius: 6px; cursor: pointer; font: 400 1.05rem/1 var(--display); text-transform: uppercase; letter-spacing: .02em; -webkit-tap-highlight-color: transparent; }
/* RIDE: the cream card of the home screen with the teal word (W-worldmap). */
#ui .wm-actions .wm-ride { min-height: 52px; background: var(--contour) 0 0 / 240px 160px, linear-gradient(180deg, #F8EEDA, var(--cream) 55%, var(--cream-2)); color: var(--teal); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), inset 0 -3px 0 rgba(15,92,99,.14), 0 8px 22px rgba(8,14,16,.45); border-radius: 12px; padding: 0 1.4em; font-size: 1.35rem; }
#ui .wm-actions .wm-ride small { font: 800 .62rem/1 var(--sans); letter-spacing: .1em; opacity: .75; }
#ui .wm-actions .wm-ride .arrow { font-size: 1.1em; }
#ui .wm-actions .wm-ride[disabled] { background: rgba(16,28,31,.9); color: var(--ink-dim); box-shadow: 0 0 0 1px rgba(201,154,75,.5); cursor: default; }
#ui .wm-actions .wm-ride[disabled] small { color: var(--ochre); opacity: 1; }
#ui .wm-actions .wm-ghost { border-radius: 12px; background: rgba(16,28,31,.9); color: var(--ink); box-shadow: 0 0 0 1px rgba(255,255,255,.28), 0 4px 14px rgba(0,0,0,.4); }
#ui .wm-actions .wm-ghost[hidden] { display: none; }
#ui .wm-actions button.on { box-shadow: 0 0 0 3px var(--cream), 0 0 0 5px rgba(15,92,99,.9), 0 8px 22px rgba(8,14,16,.45); }
#ui .wm-actions button:active { filter: brightness(1.12); }
.worldmap-screen .legend { position: absolute; left: 50%; bottom: calc(var(--s3) + var(--sab)); transform: translateX(-50%); z-index: 3; pointer-events: none; opacity: .75; }
@media (max-height: 460px) { .wm-progress { gap: .9em; } .wm-progress .dots { gap: .75em; padding-left: .9em; } .worldmap-screen .legend { display: none; } }
`;

export function injectWorldMapStyles(): void {
  if (document.getElementById('worldmap-css')) return;
  const el = document.createElement('style');
  el.id = 'worldmap-css';
  el.textContent = WORLD_MAP_CSS;
  document.head.appendChild(el);
}
