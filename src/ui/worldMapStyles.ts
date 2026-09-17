/**
 * World map styles (docs/plans/WORLD_MAP.md, ask 54) — owned by src/ui/worldMapScreen.ts, injected once as its own
 * <style id="worldmap-css">. Tokens come from styles.ts (`--amber`, `--slab`, `--font`, medal colours, safe-area
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
.wm-route .glow { stroke: rgba(255,170,30,.22); stroke-width: calc(9px * var(--inv)); filter: blur(calc(2px * var(--inv))); }
.wm-route .lit { stroke: rgba(255,205,85,.92); stroke-width: calc(2.6px * var(--inv)); filter: drop-shadow(0 0 calc(2px * var(--inv)) rgba(255,176,32,.8)); }
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
/* Region names: widely tracked serif capitals floating over the land, the count beneath; they scale with the square root of the zoom. */
.wm-name { position: absolute; transform: translate(-50%, -50%) scale(var(--invh)); transform-origin: 50% 50%; text-align: center; pointer-events: none; white-space: nowrap; color: rgba(255,255,255,.86); text-shadow: 0 0 2px rgba(0,0,0,.8), 0 2px 10px rgba(0,0,0,.7), 0 0 26px rgba(0,0,0,.5); }
.wm-name b { display: block; font: 400 30px/1 Georgia, "Times New Roman", "Iowan Old Style", serif; letter-spacing: .32em; text-transform: uppercase; margin-right: -.32em; }
.wm-name small { display: block; margin-top: 4px; font: 500 13px/1 var(--font); letter-spacing: .3em; color: rgba(255,255,255,.7); margin-right: -.3em; }
.wm-name.locked b { color: rgba(200,214,236,.66); }
/* Markers: a diamond on the terrain in the medal colour (blue = playground / Lab, white = open, grey + padlock = locked), a light spire under it, a leader line up-right to a small name plate. */
.wm-markers { position: absolute; left: 0; top: 0; width: 1536px; height: 1024px; }
.wm-marker { position: absolute; width: 0; height: 0; transform: scale(var(--inv)); transform-origin: 0 0; --mk: #dfe6ef; --mk2: #8e9bab; }
.wm-marker.gold { --mk: #ffd25a; --mk2: #b7791a; }
.wm-marker.silver { --mk: #e4e9f0; --mk2: #8892a0; }
.wm-marker.bronze { --mk: #e0a068; --mk2: #8a4f24; }
.wm-marker.platinum { --mk: #e8f4ff; --mk2: #6fa0d0; }
.wm-marker.proving { --mk: #6fc0ff; --mk2: #2a6db8; }
.wm-marker.locked { --mk: #9aa4b2; --mk2: #4a525d; }
.wm-marker .wm-hit { position: absolute; left: -23px; top: -23px; width: 46px; height: 46px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.wm-marker .wm-diamond { position: absolute; left: 50%; top: 50%; width: 17px; height: 17px; transform: translate(-50%, -50%) rotate(45deg); background: linear-gradient(135deg, #fff 0%, var(--mk) 38%, var(--mk2) 100%); box-shadow: 0 0 0 1.5px rgba(0,0,0,.55), 0 0 10px 2px color-mix(in srgb, var(--mk) 70%, transparent), 0 3px 6px rgba(0,0,0,.6); }
.wm-marker .wm-spire { position: absolute; left: -3px; top: -46px; width: 6px; height: 46px; pointer-events: none; background: linear-gradient(to top, color-mix(in srgb, var(--mk) 85%, #fff) 0%, color-mix(in srgb, var(--mk) 55%, transparent) 40%, transparent 100%); border-radius: 3px; opacity: .85; filter: blur(.4px); }
.wm-marker .wm-foot { position: absolute; left: -16px; top: -6px; width: 32px; height: 12px; border-radius: 50%; pointer-events: none; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--mk) 60%, transparent), transparent 70%); }
.wm-marker.locked .wm-spire, .wm-marker.locked .wm-foot { opacity: .35; }
.wm-marker .wm-lock { position: absolute; left: 50%; top: 50%; width: 9px; height: 8px; transform: translate(-50%, -30%); display: none; border-radius: 2px; background: #1a1e26; }
.wm-marker .wm-lock::before { content: ''; position: absolute; left: 1.5px; top: -5px; width: 4px; height: 6px; border: 1.5px solid #1a1e26; border-bottom: 0; border-radius: 4px 4px 0 0; }
.wm-marker.locked .wm-lock { display: block; }
.wm-marker .wm-lead { position: absolute; left: 8px; top: -8px; width: 17px; height: 1px; background: rgba(255,255,255,.75); transform-origin: 0 0; transform: rotate(-32deg); pointer-events: none; }
.wm-marker .wm-plate { position: absolute; left: 22px; top: -28px; display: inline-flex; align-items: center; gap: .35em; height: 17px; padding: 0 7px 0 6px; border-radius: 3px; background: rgba(9,11,15,.86); box-shadow: 0 0 0 1px rgba(255,255,255,.16), 0 2px 8px rgba(0,0,0,.5); font: 700 10px/1 var(--font); letter-spacing: .04em; color: var(--ink); white-space: nowrap; pointer-events: none; }
.wm-marker .wm-plate b { color: var(--mk); }
.wm-marker.locked .wm-plate { color: var(--ink-dim); }
.wm-marker .wm-plate .tag { font-style: normal; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; padding: 2px 5px; border-radius: 2px; margin-left: 2px; }
.wm-marker .wm-plate .tag.next { background: var(--amber); color: var(--amber-ink); }
.wm-marker .wm-plate .tag.pro { background: rgba(255,255,255,.18); color: var(--ink); }
.wm-marker .wm-plate .tag.ghost { background: rgba(90,169,255,.25); color: #cfe6ff; }
.wm-marker .wm-rule { position: absolute; left: 22px; top: -10px; height: 14px; padding: 0 5px; border-radius: 2px; background: rgba(9,11,15,.8); box-shadow: 0 0 0 1px rgba(255,176,32,.35); font: 700 8px/14px var(--font); letter-spacing: .1em; text-transform: uppercase; color: var(--amber); white-space: nowrap; pointer-events: none; display: none; }
.wm-marker.locked .wm-rule { display: block; }
/* The focused marker: the bike at its foot, an amber beacon rising into the sky, its plate hidden under the card. */
.wm-marker.on { z-index: 3; --mk: #ffd25a; --mk2: #c98a10; }
.wm-marker.on .wm-plate, .wm-marker.on .wm-lead, .wm-marker.on .wm-rule { display: none; }
.wm-marker .wm-beacon { position: absolute; left: -9px; bottom: 0; width: 18px; height: 320px; display: none; pointer-events: none; background: linear-gradient(to top, rgba(255,214,110,1), rgba(255,190,60,.8) 18%, rgba(255,176,32,.42) 48%, rgba(255,176,32,.12) 78%, transparent); box-shadow: 0 0 18px 4px rgba(255,176,32,.35); filter: blur(1px); border-radius: 9px; animation: wm-beacon 2.4s ease-in-out infinite alternate; }
.wm-marker .wm-beacon::after { content: ''; position: absolute; left: -22px; bottom: -14px; width: 62px; height: 28px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(255,200,80,.85), rgba(255,176,32,.3) 50%, transparent 72%); }
.wm-marker.on .wm-beacon { display: block; }
@keyframes wm-beacon { from { opacity: .75; } to { opacity: 1; } }
.wm-marker .wm-ring { position: absolute; left: -24px; top: -12px; width: 48px; height: 24px; border-radius: 50%; border: 2px solid rgba(255,200,80,.85); box-shadow: 0 0 12px rgba(255,176,32,.7), inset 0 0 10px rgba(255,176,32,.35); display: none; pointer-events: none; }
.wm-marker.on .wm-ring { display: block; }
.wm-marker .wm-bike { position: absolute; left: -15px; top: 4px; width: 30px; height: 20px; display: none; pointer-events: none; color: #6fb6ff; filter: drop-shadow(0 1px 2px rgba(0,0,0,.8)); }
.wm-marker.on .wm-bike { display: block; }
.wm-marker.on .wm-diamond { width: 20px; height: 20px; animation: wm-pulse 1.6s ease-in-out infinite alternate; }
@keyframes wm-pulse { from { box-shadow: 0 0 0 1.5px rgba(0,0,0,.55), 0 0 10px 2px rgba(255,200,80,.7); } to { box-shadow: 0 0 0 1.5px rgba(0,0,0,.55), 0 0 18px 5px rgba(255,200,80,.95); } }
.wm-marker.go .wm-diamond { animation: wm-go .42s var(--ease) both; }
@keyframes wm-go { to { transform: translate(-50%, -50%) rotate(45deg) scale(2.6); opacity: 0; } }
.wm-marker.shaded { opacity: .35; }
.wm-marker.shaded .wm-hit { pointer-events: none; }
/* Far zoom (the whole continent): plates fold away, diamonds shrink and stop taking pointers — a tap on the land flies to the nearest marker. */
.wm-scene.far .wm-rule { display: none; }
.wm-scene.far .wm-marker .wm-plate { transform: scale(.8); transform-origin: 0 100%; left: 18px; top: -24px; }
.wm-scene.far .wm-marker .wm-plate .tag { display: none; }
.wm-scene.far .wm-lead { width: 15px; }
.wm-scene.far .wm-hit { pointer-events: none; }
.wm-scene.far .wm-diamond { width: 13px; height: 13px; }
.wm-scene.far .wm-marker.on .wm-diamond { width: 16px; height: 16px; }
.wm-scene.far .wm-spire { height: 34px; top: -34px; }
.wm-scene.far .wm-marker .wm-beacon { height: 110px; width: 10px; left: -5px; opacity: .8; }
/* The tier gate: three amber chevrons across the road where it enters the locked land, and the rule on a plate. */
.wm-gate { position: absolute; width: 0; height: 0; transform: scale(var(--inv)); transform-origin: 0 0; z-index: 2; }
.wm-gate .wm-hit { position: absolute; left: -23px; top: -23px; width: 46px; height: 46px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }
.wm-gate .chev { position: absolute; left: -24px; top: -13px; width: 48px; display: flex; justify-content: center; transform-origin: 24px 13px; font: 900 26px/26px var(--display); font-style: italic; color: var(--amber); text-shadow: 0 0 8px rgba(255,176,32,1), 0 0 2px #000, 0 1px 2px #000; letter-spacing: -.12em; pointer-events: none; animation: wm-chev 1.2s ease-in-out infinite alternate; }
@keyframes wm-chev { from { opacity: .7; } to { opacity: 1; } }
.wm-gate .wm-plate { position: absolute; left: 24px; top: -28px; display: block; padding: 3px 7px; border-radius: 3px; background: rgba(9,11,15,.88); box-shadow: 0 0 0 1px rgba(255,176,32,.45), 0 2px 8px rgba(0,0,0,.5); font: 700 9px/1.25 var(--font); letter-spacing: .1em; text-transform: uppercase; color: var(--amber); white-space: nowrap; pointer-events: none; }
.wm-gate .wm-plate small { display: block; font-size: 8px; color: var(--ink-dim); letter-spacing: .08em; margin-top: 2px; }
.wm-gate.shaded { opacity: .35; }
.wm-gate.shaded .wm-hit { pointer-events: none; }
.wm-scene.far .wm-gate .wm-plate { transform: scale(.8); transform-origin: 0 100%; }
.wm-scene.far .wm-gate .wm-hit { pointer-events: none; }
/* The card, attached to the focused marker: code · tier · region, the name, best / target, the local board, GHOST. */
.wm-card { position: absolute; z-index: 4; transform: translate(26px, -14%) scale(var(--inv)); transform-origin: -26px 14%; width: 172px; padding: 7px 9px 8px; border-radius: 4px; background: rgba(9,11,15,.9); box-shadow: 0 0 0 1px rgba(255,176,32,.5), 0 6px 20px rgba(0,0,0,.55); color: var(--ink); pointer-events: none; }
.wm-card::before { content: ''; position: absolute; left: -7px; top: 14%; width: 7px; height: 1px; background: rgba(255,200,80,.85); }
.wm-card.up { transform: translate(26px, -90%) scale(var(--inv)); transform-origin: -26px 90%; }
.wm-card.up::before { top: 90%; }
.wm-scene.far .wm-card.up { transform: translate(18px, -90%) scale(calc(var(--inv) * .7)); transform-origin: -18px 90%; }
.wm-card .head { font: 700 9.5px/1 var(--font); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-card .head b { color: var(--amber); }
.wm-card .name { margin-top: 3px; font: italic 900 17px/1 var(--display); text-transform: uppercase; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wm-card .times { margin-top: 4px; font: 700 12px/1 var(--mono); color: var(--ink-dim); white-space: nowrap; }
.wm-card .times b { color: var(--green); font-size: 14px; }
.wm-card .times b.none { color: var(--ink-mute); }
.wm-card .times b.behind { color: var(--ink); }
.wm-card .rule { margin-top: 5px; font: 700 10px/1.3 var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--amber); }
.wm-card .board { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
.wm-card .board span { font: 700 9.5px/1 var(--mono); padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,.07); color: var(--ink-dim); }
.wm-card .board span.gold { color: var(--gold); } .wm-card .board span.silver { color: var(--silver); } .wm-card .board span.bronze { color: var(--bronze); } .wm-card .board span.platinum { color: var(--plat); }
.wm-card .wm-card-ghost { display: inline-flex; align-items: center; gap: .4em; margin-top: 6px; height: 18px; padding: 0 7px 0 6px; border-radius: 3px; background: rgba(90,169,255,.16); color: #cfe6ff; font: 700 10px/1 var(--font); letter-spacing: .12em; text-transform: uppercase; }
.wm-card .wm-card-ghost[hidden] { display: none; }
.wm-scene.far .wm-card { transform: translate(18px, -14%) scale(calc(var(--inv) * .7)); transform-origin: -18px 14%; }
/* Screen-space chrome: the badge + build stamp top-left, ‹ MENU top-right, progress bottom-left, RIDE + GHOST bottom-right. */
.wm-brand { position: absolute; left: calc(var(--s5) + var(--sal)); top: calc(var(--s4) + var(--sat)); z-index: 4; pointer-events: none; }
.wm-brand .plate { display: inline-flex; align-items: center; gap: .6em; min-height: 34px; padding: 0 1.3em 0 .9em; background: rgba(9,11,15,.88); box-shadow: inset 4px 0 0 var(--amber), 0 4px 14px rgba(0,0,0,.4); clip-path: polygon(0 0, 100% 0, calc(100% - .7em) 100%, 0 100%); }
.wm-brand .plate b { font: italic 900 1.05rem/1 var(--display); text-transform: uppercase; letter-spacing: .01em; color: var(--ink); }
.wm-brand .plate span { font: 700 .62rem/1 var(--font); letter-spacing: .34em; text-transform: uppercase; color: var(--amber); padding-left: .6em; border-left: 1px solid rgba(255,255,255,.2); }
.wm-brand .stamp { margin-top: 4px; padding-left: .9em; font: 500 .6rem/1 var(--font); letter-spacing: .06em; color: var(--ink-mute); text-shadow: 0 1px 2px #000; }
.worldmap-screen .backbtn { top: calc(var(--s4) + var(--sat)); }
.wm-progress { position: absolute; left: calc(var(--s5) + var(--sal)); bottom: calc(var(--s4) + var(--sab)); z-index: 4; display: flex; align-items: center; gap: 1.1em; min-height: 40px; padding: 0 1em 0 .9em; border-radius: 6px; background: rgba(9,11,15,.86); box-shadow: 0 0 0 1px rgba(255,255,255,.14), 0 4px 14px rgba(0,0,0,.4); pointer-events: none; white-space: nowrap; }
.wm-progress .n { font: italic 900 1.15rem/1 var(--display); text-transform: uppercase; color: var(--ink); }
.wm-progress .n b { color: var(--amber); font-size: 1.35rem; }
.wm-progress .dots { display: flex; gap: .9em; font: 700 .62rem/1 var(--font); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-dim); }
.wm-progress .dots span { display: inline-flex; align-items: center; gap: .4em; }
.wm-progress .dots i { width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
.wm-progress .dots .platinum { color: var(--plat); } .wm-progress .dots .gold { color: var(--gold); } .wm-progress .dots .silver { color: var(--silver); } .wm-progress .dots .bronze { color: var(--bronze); }
.wm-actions { position: absolute; right: calc(var(--s5) + var(--sar)); bottom: calc(var(--s4) + var(--sab)); z-index: 4; display: flex; gap: 10px; }
.wm-actions button { display: inline-flex; align-items: center; gap: .55em; min-height: 46px; padding: 0 1.2em; border: 0; border-radius: 6px; cursor: pointer; font: italic 900 1.05rem/1 var(--display); text-transform: uppercase; letter-spacing: .02em; -webkit-tap-highlight-color: transparent; }
.wm-actions .wm-ride { background: linear-gradient(180deg, #ffd25a, #ffb020 60%, #f0951a); color: var(--amber-ink); box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 6px 18px rgba(255,176,32,.35); clip-path: polygon(0 0, 100% 0, calc(100% - .5em) 100%, .5em 100%); padding: 0 1.5em; }
.wm-actions .wm-ride small { font: 700 .72rem/1 var(--font); letter-spacing: .1em; opacity: .8; }
.wm-actions .wm-ride .arrow { font-size: 1.1em; }
.wm-actions .wm-ride[disabled] { background: rgba(9,11,15,.86); color: var(--ink-dim); box-shadow: 0 0 0 1px rgba(255,176,32,.45); cursor: default; }
.wm-actions .wm-ride[disabled] small { color: var(--amber); opacity: 1; }
.wm-actions .wm-ghost { background: rgba(9,11,15,.86); color: var(--ink); box-shadow: 0 0 0 1px rgba(255,255,255,.28), 0 4px 14px rgba(0,0,0,.4); }
.wm-actions .wm-ghost[hidden] { display: none; }
.wm-actions button.on { box-shadow: 0 0 0 3px var(--amber), 0 6px 18px rgba(255,176,32,.35); }
.wm-actions button:active { filter: brightness(1.12); }
.worldmap-screen .legend { position: absolute; left: 50%; bottom: calc(var(--s3) + var(--sab)); transform: translateX(-50%); z-index: 3; pointer-events: none; opacity: .75; }
@media (max-height: 460px) { .wm-progress .dots { gap: .7em; } .worldmap-screen .legend { display: none; } }
@media (max-width: 700px) { .wm-progress .dots span em { display: none; } }
`;

export function injectWorldMapStyles(): void {
  if (document.getElementById('worldmap-css')) return;
  const el = document.createElement('style');
  el.id = 'worldmap-css';
  el.textContent = WORLD_MAP_CSS;
  document.head.appendChild(el);
}
