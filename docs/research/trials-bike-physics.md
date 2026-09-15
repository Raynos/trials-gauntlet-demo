# Trials bike physics: what the real games do

Author: physics architect. Purpose: the factual base for `physics-audit.md` and `docs/plans/physics-v2.md`.
Every statement is tagged **[S]** sourced (URL given), **[I]** inferred from sourced facts or from first
principles, or **[M]** measured by us on the reference corpus (`reference/techniques/`, 720p 29.97 fps
cuts of RedLynx's own University of Trials lesson videos and one skill game; frame indices are 0-based
from the start of each cut; 1 frame = 33.4 ms). Supporting files: `raw-techniques-and-bikes.md` (the
verbatim research dossier, quotes with URLs), `raw-dev-sources.md` (developer / tech-press dossier),
`frame-analysis.md` (per-frame tables), `physics-audit-probe-output.md` (our probes of the v1 solver).

Contents: 1 the games and their engines · 2 bikes · 3 input model · 4 techniques and how the bike
responds · 5 speeds, gravity, hang time · 6 frame analysis of the corpus · 7 what makes it learnable ·
8 the model the evidence implies · 9 open questions.

## 1. The games, their engines, tick rates and determinism

| game | year, platforms | engine facts | frame / physics rate |
|--|--|--|--|
| Trials (2000) / Trials 2 SE (2008, PC) | RedLynx, Java then PC | **[S]** "The physics in Trials are spring-based. The bike and rider appear to be contraptions composed of several springs… Your rider's position is changed by modifying the lengths of these springs." (Fun-Motion, 2006, https://www.fun-motion.com/physics-games/trials/) | — |
| Trials HD (2009, X360 XBLA) | RedLynx in-house engine | **[S]** "the rider is an actual physical model of a human being, so he is modeling real bones that all have realistic relations and constraints to each other… when you ride the bike, you'll see the rider move and slightly change position – not because of animations, but because that is the way the physics moves his body." **[S]** "Tuning the bike took 6 months until it was just right. The bike alone took hundreds of iterations, hundreds of parts and thousands of parameters." **[S]** "the only actions players can make are gas/acceleration, brake and leaning of the rider (shifting the balance: forward and backward)… all of the riding and tricks are executed by controlling the balance, inertia and acceleration of the bike." (RedLynx, Destructoid interview 2009-08-13, https://www.destructoid.com/interview-redlynx-talks-bringing-trials-hd-to-xbla/) | 60 fps **[S]** (Wikipedia, https://en.wikipedia.org/wiki/Trials_HD) |
| Trials Evolution (2012, X360; Gold on PC 2013) | **[S]** "As with its predecessor, Trials Evolution uses an optimized version of the Bullet Physics Library to handle the game's physics." (Wikipedia, citing the RedLynx tech talk, https://en.wikipedia.org/wiki/Trials_Evolution) | **[S]** "The game runs at a locked 60 frames per second." (same) |
| Trials Fusion (2014, PS4/XB1/X360/PC) | same lineage; Sebastian Aaltonen lead programmer / rendering (GPU-driven rendering, SIGGRAPH 2015: https://www.advances.realtimerendering.com/s2015/aaltonenhaar_siggraph2015_combined_final_footer_220dpi.pdf) | **[S]** 1080p60 PS4 / 900p60 XB1, "locked 60" (NeoGAF/Eurogamer coverage, https://www.neogaf.com/threads/trials-fusion-runs-at-1080-60-on-ps4-900-60-on-xbox-one.800427/) |
| Trials Rising (2019, PS4/XB1/PC/Switch) | same lineage (Ubisoft RedLynx + Kyiv) | **[S]** 60 fps on PS4/XB1/PC; Switch 30 fps, 720p docked, dynamic 720p→432p portable, frame pacing issues docked (Digital Foundry via Nintendo Everything 2019-02-25, https://nintendoeverything.com/trials-rising-early-switch-technical-analysis/). **[I]** the physics is a fixed-step simulation independent of the display rate: the Switch version plays the same tracks with the same leaderboards and ghosts as the 60 fps versions, and RedLynx's own statements (below) describe replays as reproducible; the tick rate itself is not published. |
| Trials Frontier (2014, iOS/Android) | **[S]** a different engine and team: "our in-house mobile game engine, called GeneTek… It is not the same engine we use for Trials Fusion" (Justin Swan, PocketGamer.biz); sebbbi: "The mobile Trials is quite different from the console version". Four on-screen digital buttons (lean back/fwd, brake/gas), "a 2D driving line as opposed to… 2.5D"; upgrade stats *grip / lean / top speed / acceleration* **[S]** (https://trials.fandom.com/wiki/Trials_Frontier) | unpublished; reviews call the physics "forgiving" **[S]** |

**On determinism and tick rate — sourced.** Sebastian Aaltonen (RedLynx lead programmer), Beyond3D, 2012
(`raw-dev-sources.md` A1): **[S]** "Our replays only record controller state. The physics simulation has to be
fully deterministic (same input always results in exactly same output)." **[S]** "Replays are recorded
controller states. We bit pack them tightly and (lossless) compress them. Result is around 2kb of data per
replay (half an hour maximum)." **[S]** Ghosts are a fitted curve (< 200 bytes per leaderboard row), not a
second simulation. **[S]** "The physically modeled gameplay feels so responsive and natural, because the game
runs at constant 60 fps, and because we spend lot of time in fine-tuning the physics response and reducing the
input lag." **[S]** Instant restart: "in a single frame (16 milliseconds) the whole level (textures, meshes,
physics world, trigger systems, etc, etc) needs to be restored to the original state." **[S]** Kiviluoma
(lead designer, Fusion): "when a top player is shaving microseconds of time off of his score, he has to have
absolute fidelity between the controller, the physics engine, and what happens on the screen… the 60 fps
Guarantee is the spoke upon which the entire Trials experience spins." **[S]** Kiviluoma: "A game like Trials
is also very sensitive to physics changes and a small change can drastically affect the leaderboards… One time
a change made all bikes in the game move just a tiny bit slower due to wind resistance being increased and
nobody noticed it except for a level designer who… failed [a jump] today." (there is an aero-drag term).
**[S]** The simulation step is the 60 Hz frame: PC players report "Game speed is tied to framerate… it's a
60fps cap"; a Fusion half-speed bug let a player "jump insane distances… it was registering my leans as if I
was doing them insanely fast" (so lean *rate* is a physical quantity in the model); on Switch "the game still
calculates its physics at 60 frames per second… rendered at 30" (WellPlayed; DF: "the simulation runs at 60fps
on all platforms"). **[I]** Tick = 1/60 s, one physics step per frame, inputs sampled once per step; no
sub-stepping is documented. This project's 120 Hz is a choice, not a match (§8, design §3).

**On the engine — sourced.** **[S]** Trials 2 SE: "our own simple 2D physics engine"; bike collision "just two
spheres (bike tyres) connected to a centre sphere (the bike's engine) and a front sphere (the bike's handle
bar)". **[S]** Trials HD onward: "a modified version of an open source physics engine called Bullet Physics
Library… in-house optimized it for the Xbox 360 CPU and vector units"; Evolution "upgraded to a newer version
of Bullet". **[S]** "We also have physically modelled springs and shock absorbers on the bike, and the rider
physics are now also simulated when he sits on the bike. **The rider pulls the handlebars for real when you
lean forward; it's not just a baked animation and a faked impulse like it used to be in the past.**" **[S]**
Evolution: "Bike suspension needed to be modified so that the heavy impacts wouldn't cause bike parts to get
stuck in the ground"; the editor exposes "mass and buoyancy to surface friction". **[S]** "Tuning the bike
took 6 months… hundreds of parts and thousands of parameters." **[S]** Rising (Ilvessuo): "There's no animation
delay. If you make a fault, it's only your fault."

**On the rider.** The most important sourced facts for this project: the rider is *a physical model with
bones and constraints* moved by the physics, and he *pulls the bars for real* when you lean — the lean is a
body motion whose reaction the bike feels, not a torque applied to the bike. The 2006 lineage was *springs
whose rest lengths the lean input changes*. Together: **the lean input sets a target pose; the rider's body,
which has mass and inertia, is driven toward that pose by bounded internal forces; the bike feels the
reaction.** Neither a force pushing a point mass around (v1) nor a hidden flywheel (v1's torso store) is that.

## 2. Bikes

Sources and quotes in `raw-techniques-and-bikes.md` §A. Summary:

| game | bikes (main) | what differs, per the sources |
|--|--|--|
| HD | Reptile 125, Scorpion 250, Phoenix EVO 250, Micro Donkey; track-locked Hauler, Phoenix REV, Scorpion Air | **[S]** Micro Donkey "very quick and nippy, but also extremely prone to flipping on full throttle"; "if you gas it and immediately lean forward as far as you can, you'll usually pop a small (and very stable) wheelie" (TrueAchievements). |
| Evolution | Rattler 125 (2/2/2/2), Piranha 250 (4/4/4/4), Scorpion 450 (top speed 8, accel 6, agility 6, difficulty 6), Phoenix Evo 250 (6/8/8/8), Micro Donkey (6/6/6/8); DLC Banshee 350, Gecko 520 | **[S]** IGN 8-point bars. **[S]** "The 450 is heavier but has more low end torque… takes a second or two longer to get up to speed. The 250cc… accelerates quicker. It's also lighter… tougher to balance cause that front wheel will come up a lot easier." **[S]** "'jello-like' suspension of the Phoenix… Phoenix jumps better." |
| Fusion | Baggie, Roach, Pit Viper, Foxbat, TKO-Panda, Rabbit, Donkey, Unicorn MK II | **[S]** Baggie "slow and has weak suspension making bunny hops way harder"; Roach "the fastest bike, but… the heaviest… not good at bunny hopping or jumps… pretty good at climbing hills"; Pit Viper "great bunny hopping potential, throttle control, wheelies"; Rabbit "a bicycle… incredible grip… slow and extremely easy to tip"; Donkey "Simply holding accelerate from a starting point will tip the bike over". No numeric stats in Fusion. |
| Rising | Squid, Rhino, Mantis, Helium, Donkey, Tandem; Turtle, King Crab, Scarab | **[S]** Squid "all-purpose"; Rhino "more control and power instead of acceleration"; Mantis "moves fluidly, but is harder to control", "on a flat road and apply full gas using the Mantis… you'll often find yourself flipping over. Try to get in the habit of applying some forward lean"; Helium "BMX lacking power, very light and flexible… superior traction and 'floatiness'". No numeric stats. |
| Frontier | Armadillo, Tango, Bronco / Jackal, Mantis, Marauder / Riptide, Berserker, Phantom / Donkey, Agent | **[S]** four upgradeable stats: grip, lean, top speed, acceleration. |

**What this says about the model [I].** Bikes differ in **mass** ("heavier"), **torque curve** ("low end
torque" vs "accelerates quicker"), **top speed**, **suspension rate/damping** ("jello-like", "weak suspension
makes bunny hops harder", "bouncy… helps in flinging them around in long bunny hops"), **grip** (Rabbit,
Helium), and **wheelbase / COM** (Donkey: tiny, flips under throttle; Rhino: stable). In every game the
beginner bike is *slower, heavier or lower-powered*, never *assisted*: the same rider model rides all of them,
and "the front wheel comes up easier" on the light, powerful bike is the physics, not a difficulty flag.
Suspension stiffness is explicitly part of *hop height*: the hop is stored spring energy.

## 3. Input model

**[S]** (dossier §B) Throttle: right trigger, analogue ("press it slightly, and the bike moves slow, press it
all the way, and the bike roars"). Brake: left trigger, one input for both wheels in every game (no split is
documented anywhere); a long press reverses. Lean: left stick left/right (back/forward); on the ground the
rider goes to a pose ("leaning is simply a forward, backward response"), in the air the stick magnitude sets
the rotation rate ("you can determine how fast you can rotate the bike around by how far you push the stick").
D-pad lean is digital and "the biker leans quicker". Bail-out: Y/Triangle. Keyboard is fully viable ("one of
the best riders is playing only with keyboard"). **[S]** Rising quantises: **3 brake levels, 7 throttle
levels** (Kaiser Panda guide, Steam); the Switch build puts the throttle on the right stick. **[S]** Lean
across the games: Evolution players describe it as "just 'forward' and 'backward' with nothing in-between";
in Fusion "he stays leaned in whatever direction" when the stick is released and "leaning also seems very
sensitive"; in Rising "dont press all the way forward just press a little" (proportional) and the community
distinguishes held vs released positions. **[S]** The Fusion half-speed bug ("registering my leans as if I
was doing them insanely fast… would send me flying") shows that the *speed* of the body's motion, not the
stick position alone, is what the physics reads (`raw-dev-sources.md` A1, A5).

**[S]** A community model of the rider states (Kaiser Panda): five effective positions — *hard-back*
(stick held), *light-back* (released from back), *neutral*, *light-forward*, *hard-forward*; "holding full
forward puts all weight on the front and risks lifting the rear; released-forward keeps the rear down". **[I]**
This is what a rate-limited, hysteretic pose target looks like from the outside: the stick sets a target,
the body moves there at a finite speed, and releasing from an extreme leaves the body passing through a
lesser pose. It also tells us the *rear can be unloaded by leaning forward alone*: the forward pose moves the
COM far enough toward the front axle that rear grip is lost.

**What this means for v2 [I].** Input is three scalars, quantised (throttle 0–1 in ≥ 7 steps, brake 0–1 in
≥ 3 steps, lean −1..1); lean maps to a *pose target*, not to a force; in the air the same pose motion is what
rotates the bike, so no second mapping is needed. Our recording format (u8/u8/i8 per tick) already exceeds
Rising's resolution.

## 4. Techniques: execution and response

All quotes in `raw-techniques-and-bikes.md` §C; RedLynx's own lesson scripts are the primary source (the
University of Trials lessons are in-game content, narrated by RedLynx's community manager).

### 4.1 Throttle, wheelie, balance

- **[S]** Lesson 1: "full gas is [not] the fastest way… applying the gas gently… will also help you stay in
  control." Lesson 2: "going up a slope lean forward over the handlebars to stop the bike flipping… riding
  downhill… lean backwards." Lesson 8: "use the gas very gently and only enough to maintain control without
  flipping backwards."
- **[S]** Wheelie: "lean back with a little throttle to really get that front wheel up… Once in the wheelie,
  you can apply moderate gas to reach the required distance." Rear-wheel balance (Lesson 11): "lean backwards
  and land on the rear wheel at roughly a 45° angle. If your front wheel dips down, lean backwards next time.
  And if you find yourself flipping backwards, lean forward a little."
- **[M]** Balance in the corpus (tracked, `frame-analysis.md` §7): clip 03 holds ≈ 30–45 deg true for
  the 0.9 s that is live (the rest of the cut is a frozen frame), drifting nose-up, corrected by body motion;
  clip 14 rolls a wheelie in a 40–50 deg screen band at 4.1 m/s with a **0.8–1.0 s correction cycle** of
  torso fore/aft and one near-touchdown save; clip 04 holds 55–63 deg through a 1.1 s rear-wheel hop and
  37–39 deg rolling afterwards; Evolution clip 05 sits at 40–50 deg for 4 s with small rear-wheel hops every
  0.4–0.5 s as the throttle is pulsed (`evolution-gameplay.md` obs 10).
- **[I]** Balance is shared: lean moves the COM relative to the contact patch (slow, large authority);
  throttle changes the pitch moment F·h and the rear load (fast, moderate authority); both are used, and the
  visible corrections are body motion. Balance points 45–75 deg are ridden — the model's COM must be high and
  the rider's fore-aft travel large enough that 65–75 deg is a reachable equilibrium.

### 4.2 Stability under acceleration; why weight forward is stable

- **[S]** "All the power in the bike comes from the back wheel… full gas… you'll often find yourself flipping
  over… applying some forward lean." "Leaning forward up hills is much more needed because your rear tire is
  what's moving you." Prima (Fusion): "Lean forward… Don't forget to let go after coming up the hill, or
  else you'll end up in a nasty flip forward." Micro Donkey: "gas it and immediately lean forward as far as you
  can, you'll usually pop a small (and very stable) wheelie."
- **[S]** Every competent rider launches with the front wheel up (`evolution-gameplay.md` obs 8: "front
  wheel ~40 cm up, rider leaning back… The throttle from rest pitches the bike back within ~0.3 s").
- **[I]** Mechanics. Take the bike as a rigid body pivoting about the rear contact patch with total mass m,
  COM d ahead and h above the patch, rear thrust F. Pitch-up moment about the patch: F·h − m g d + (inertial
  term). The front lifts when a = F/m > g·d/h; the nose *keeps rising* only while a > g·d(θ)/h(θ) where d
  shrinks and h grows with pitch θ — a rising nose raises the threshold acceleration needed to keep it
  rising. Two things make forward weight stable: (1) leaning forward increases d and lowers h at once, so the
  critical a jumps (v2 toy model at the design's pose table: d/h 0.57 at hard-back → 0.67 neutral → 0.78 at
  hard-forward, a 37 % change in threshold acceleration — `toy-v2/run4-design-params.md` T0); (2) real
  engine thrust falls with speed (constant power: F = P/v above
  the torque peak), so a falls through the threshold within a second or two of a full-throttle launch. The
  result is a *wheelie that self-limits*: F·h falls as v rises until the balance angle is reached, and the
  rider then holds it with small lean changes. **A bike whose thrust does not fall with speed (v1's flat
  curve to 8000 rpm, a/g ≈ 1 off the clutch at 1.4 g) has no self-limiting wheelie and must be governed.**
- **[S]** Corroboration that the *bike* is the variable, not an assist: Donkey/Mantis flip at full gas from
  the line, Rhino/Squid do not — same game, same rider model.

### 4.3 Bunny hop

- **[S]** Lesson 7 (RedLynx): "consider that your rear suspension is a spring, and the more pressure you apply,
  the harder it bounces back. This release of pressure and shifting your body weight will make the bike jump…
  As you start accelerating, sit back on the bike and load the suspension to build up potential energy… when
  it's at its maximum, release the pressure by leaning forward. The timing of these two movements is crucial…
  Lean back to load the suspension, lean forward to release the pressure, and then quickly lean back again…
  this final step will lift the bike underneath you and ensure that the back wheel doesn't hit anything."
- **[S]** FatShady (long-form): "if you just start from a seated position and try and do a bunny hop it's not
  physically possible… to generate spring for a bunny hop you either need to be standing or leaning forward…
  as you accelerate… lean back… sit down over the bike and that will build up the energy in the springs…
  just at the point where you've got maximum load on those Springs you then want to push yourself forward…
  you're not only releasing the potential energy from the rear springs… you're actually pulling the bike… a
  pretty quick and succinct left right and then potentially left again movement."
- **[S]** Antti Ilvessuo (RedLynx creative director): "Lean forward… gas… lean back really fast and then
  forward, to get the springs loaded and then release that momentum at the right time."
- **[S]** Trials 2 SE wiki (developer-era): *Switch Jump* — "Doable when you are leaning fully forwards…
  Quickly tap lean back and then immediately tap lean forward just before your front tire goes over the ramp
  edge… uphill press lean back and lean forward very shortly or you will likely flip… downhill press the
  buttons for a longer time to get even higher… It doesn't help with horizontal jump distance (often actually
  making your jump shorter)." *Spring Jump* — "Doable when you are leaning fully backwards… Just before your
  front wheel goes over the ramp edge, press forward and keep it pressed until the driver is fully at front
  position and your backwheel is in air. The main usage of Spring Jump is to get further."
- **[S]** Lesson 9: "prior to performing a bunny hop Lean Forward… when you lean back there is extra pressure
  loaded on the rear suspension and… this increases the height." Lesson 10 (consecutive hops): "use your bike's
  rotation and the force from landing to create the load on the rear suspension. sit back on the bike and land
  with your front wheel slightly earlier… when you hit that point shift your body weight forward and perform
  another bunny hop."
- **[S]** "You want to get your front wheel up high while still having it remain in front of you (not above)
  and then thrust forward." Kaiser Panda: get the front up a little, then back-then-forward quickly; how high
  the front is decides *higher vs further*.

**Mechanics [I], consistent with every quote above:**

1. *Load.* From a standing/forward pose the rider drops back and down (hard-back is 0.25–0.30 m lower and
   0.3 m further back than attack — RIDER_CHAIN.md hips (−0.28, 0.85) → (−0.57, 0.60)). Moving 75 kg down
   0.25 m in ~0.25 s and stopping it puts a transient ~2 m/s²·75 kg ≈ 150 N *plus* the settling ~750 N onto
   the rear spring, on top of the rear-biased static load of the hang-back pose. Throttle adds squat via
   F·h. The rear compresses toward its travel — "maximum load" is the bottom of that motion, ~0.25–0.35 s
   after the drop starts (**[M]** clip 01: crouch 0.73 s then a 0.40 s extension for a front lift; clip
   04: 0.33 s pre-load for a rear-wheel hop — `frame-analysis.md` §7).
2. *Release.* At maximum compression the rider drives forward and up (hang-back → forward-attack is +0.35 m
   x, +0.30 m y in 0.2–0.3 s). Three effects add: the spring's stored energy ½ k x² returns as chassis
   upward velocity; the rider's upward COM velocity, when his legs reach full extension, *pulls the bike up
   with him* ("you're actually pulling the bike"); and the forward body motion's reaction pitches the frame
   nose-down, which is why the front wheel that was high stays "in front of you" rather than looping. Rear
   apex is set by the sum; front apex by the pre-existing wheelie plus the nose-down rotation.
3. *Tuck.* A second lean-back after take-off raises the rear relative to the chassis ("lift the bike
   underneath you") — the rider pulls his hips up and back, the bike follows because the rider's mass is now
   the reference in free fall. This is the "left again" and the *Spring Jump Reverse*.
4. *Timing.* The window is the rear spring's half-period after the load. With a rear natural period of
   ~0.35–0.45 s (loaded rear mass ~90 kg on ~7–9 kN/m) the optimum release is 0.15–0.25 s after the load
   peaks; too early (spring not yet compressed) or too late (already rebounding) gives less. Height scales
   monotonically with *how fast and how far* the body moves — "very short" taps uphill, "longer" downhill,
   because uphill the front is already high and a long forward push would loop it forward.
5. *Front-first vs rear-first.* Hop out of a wheelie (front high, "not above you"): the front wheel meets
   the ledge, the release lifts the rear — clips 01/12 (**[M]** §6). Hop from flat (switch jump): both wheels
   leave together or rear slightly first; the rear apex is what clears the obstacle.

### 4.4 Rear-wheel hop / bounce

- **[S]** Lesson 11: "only the rear wheel is powered, and therefore, only the rear wheel needs to be in
  contact… land on the rear wheel at roughly a 45° angle… when the load is at its maximum, lean forward to
  jump." Trials 2 SE: "Leaning forward, with about 80 degree wheelie angle (aka 'pogo stick' bounce)…
  transfers the downward motion to upward motion." Glossary: "Stationary Bunny Hop – Using a very intricate
  combination of leaning and throttle/brake to back wheel bounce in place."
- **[M]** clip 03: pitch 65–75 deg, 4 s; clip 04: hops between pole tops; clips 18/19: one step every
  1.5–2 s with a ~0.5 s settle (`techniques.md` obs 6). Evolution clip 05: a small hop every 0.4–0.5 s while
  balancing.
- **[I]** At 45–80 deg of pitch the rear spring's axis is 45–80 deg from vertical, so a spring-only pogo
  would push the bike mostly *forward*; what makes the pogo work is the rider's legs pushing along the
  hip→peg line, which at those pitches is near vertical (v1 round-11 owner reached the same conclusion). The
  rider model must push along the body's own leg line, not along the frame's up axis.

### 4.5 Front-wheel lift over obstacles; slam

- **[S]** Lesson 9: "slam the rear wheel and bike frame into the corner of the obstacle and then lean
  forward… your momentum will get you up." Kaiser Panda "Slide": lift the front a few metres before the lip
  (rider back), then once the front is over it lean hard forward to tip the bike over. Lesson 8: "accelerate
  at the base of the ramp but… ease off the gas only when your front wheel has cleared the obstacle lean
  forward… if you hold gas all the way to the top you'll be pushed backwards."
- **[I]** All of these are COM placement: front high enough that the *front* meets the edge (a tyre
  climbing a corner needs its centre above the corner's height), then weight over the front so the rear can
  follow with its momentum and thrust; a corner hit by the rear tyre below its axle is a wall (v1 round 4's
  geometry note is correct).

### 4.6 Snapping forward corrects a rising front

- **[S]** "if you find yourself flipping backwards, lean forward a little" (Lesson 11); "apply full gas…
  flipping over. Try to get in the habit of applying some forward lean" (Rising guide); Micro Donkey quote
  above. **[S]** Kaiser Panda "Transition": when the bike is mid-curve at ~45 deg, *snap forward* to pin it
  to the slope; if the rear lifts you used hard-forward where light-forward was needed.
- **[I]** Two mechanisms, both present in a rider-body model and both absent in a point-mass-on-a-spring:
  (a) **COM placement** — forward pose moves d/h up by ~40 % (T0), lowering the equilibrium pitch for the
  same thrust; (b) **angular momentum exchange** — the rider rotating his torso forward (hang-back torso 55
  deg → forward-attack 26 deg about the hips, ~0.5 rad in 0.2 s with I ≈ 8–10 kg m² about the hips plus the
  75 kg translating on a ~0.6 m arm) carries angular momentum the frame must supply: the frame gets a
  nose-down impulse of the order 0.5 rad × 10 kg m² + 75 kg × 2 m/s × 0.6 m ≈ 95 N m s, i.e. ~−60 deg/s on
  a 90 kg m² system — a *visible correction within 0.1–0.2 s*, before the slower COM effect. The toy model
  (`toy-v2/run4-design-params.md` T2) shows exactly this: from a full-throttle wheelie at 20–60 deg a snap
  to hard-forward peaks within 0.1 s (+10–14 deg of overshoot) and is back under 5 deg within 0.5 s with the
  throttle still held.
- **[M]** v1 does neither (`physics-audit.md` §2.1, P5): its forward lean pitches the frame *up* for 0.1 s.

### 4.7 Air control: lean, throttle, brake

- **[S]** GamesRadar (Rising): flips — "lean backwards or forwards just before you leave a ramp, then keep
  holding the lean… The longer you hold it, the faster your rotation speed will get… push in the opposite
  direction to slow your rotation." Lesson 3: "shifting your body weight will make the bike rotate in the
  direction of the lean gentle adjustments… gently apply the gas to land in a better location." Fusion
  guide: "The only way you can rotate the bike is with the brake and throttle, the brake will lean the bike
  forward whilst throttle will lean it backward." "Hit brake off a jump to pitch the front end down."
  "Flapping": "rapidly tap brake while accelerating and your rear wheel should rise up" (Lesson 8) — the
  engine spins the rear up, the brake dumps its angular momentum into the frame, repeatedly.
- **[I]** Three air torques: rider pose motion (internal angular-momentum exchange, bounded by how far the
  body can move and how fast); engine torque on the rear wheel reacting on the frame (T_engine, nose-up
  while the wheel accelerates; nothing once it hits the limiter — matches v1's finding that throttle at
  20 m/s does nothing); brake torque decelerating a spinning wheel reacting on the frame (nose-down,
  proportional to the wheel's spin and the brake torque; both wheels). The rate build-up "the longer you
  hold it" is not a rider effect (a pose has finite travel) — it is the *wheel spin* mechanism: holding gas
  keeps the rear accelerating, and holding brake keeps braking a wheel that engine or ground spun. **[M]**
  Evolution obs 12: "During flight the bike pitch drifts slowly (about 30 degrees over the whole arc) unless
  leaned" — a slow nose-down drift over 2–3 s is consistent with small engine-braking / aerodynamic
  moments, i.e. a few deg/s, not v1's −100 deg/s.
- **[S]** Landing shortcut: "easing off the gas or even dabbing the brakes to drop off the end of a big ramp,
  which will allow you to land quicker" — throttle at the lip pitches nose-up and extends the flight.

### 4.8 Landing and "hard landing"

- **[S]** Lesson 6: "just as the bike meets the ramp lean forward to get your body weight over the
  handlebars… press the gas hard enough to stop you rolling backwards but gentle enough to avoid lifting
  your front wheel… the most common mistakes… accelerate too hard and flip backwards or… lean too far
  forward which will lift the rear wheel… if the rear wheel lifts you've got no power… tap the brake this
  will bring the rear wheel down." "land with your back wheel first and only slightly have the acceleration
  down… if you land both wheels together, you usually bounce off." "land on your back tire, at about a 20
  degree angle to the ground… let you continue with speed even if you overshoot"; big drop: "almost at a 90
  degree angle with your back tire so that you don't slam down." Trials 2 SE: "Leaning back on landing means
  stability… Back wheel landing… a decent spring assisted speed boost."
- **[M]** clip 07/08 (tracked): the plank-to-plank jump lands **front-first and level** (−5 deg screen),
  rear down 4–5 frames later, no bounce, rider crouch 0.3–0.5 s after; clip 18 (a 2.1 s drop onto a stair
  tread) lands **rear-first at 35–45 deg** and rotates nose-down 35 deg in 4–5 frames; Evolution obs 11:
  rider crouches 0.25 s, extends 0.4 s. So "rear-first, nose-up" is the *drop* landing and a short hop lands
  flat — consistent with the guides ("land with your back wheel first" for speed, "about 20 degree angle").
- **[I]** "Weight shift saves a landing": a rear-first landing converts vertical momentum into rear-spring
  compression and a nose-down rotation; leaning forward at touchdown moves the COM over the front so that
  rotation stops at level instead of continuing into a loop (the rider's forward motion also removes
  angular momentum). Leaning back at touchdown keeps the COM behind, the front comes down late, the rear
  spring's rebound plus thrust loops the bike — Lesson 6's "flip backwards". Nose-first landings loop the
  rider forward because the front spring's rebound is ahead of the COM. There is no hidden "save"; it is
  the same COM-placement mechanism as §4.2.

### 4.9 Crash rules

- **[S]** A fault is a crash (ragdoll) or a bail; stalls, foot-downs, over-rotation without contact are not
  faults (`techniques.md` obs 10 — the fault counter never changes across two stairs clips despite stalls).
  The crash trigger in the mainline games is the **rider's body touching the world** (head/torso in HD/Evo;
  in Fusion/Rising also limbs against geometry — "rug burn" is *riding with your back touching the ground* on
  the rear wheel, i.e. in Fusion/Rising you *can* touch with the back at certain angles; **[S]** glossary).
  **[S]** Kaiser Panda: it is the rider's *head* crossing the line that validates a checkpoint/finish.
- **[I]** For v2: crash = head or torso sensor contact with any collider (existing rule); no force/tether
  proxies; over-rotation alone never faults.

### 4.10 Grip, surfaces, engine braking, brakes

- **[S]** Rear grip is very high: vertical wall riding is a documented technique (Oso "Slope to Vertical";
  "wall climbs": land on the wall rear-first, release throttle momentarily, accelerate once both wheels are
  on the wall). Rabbit/Helium have *more* grip than the motorbikes. **[S]** Engine braking is real and
  strong: "accelerating downhill acts like braking" relative to coasting (Kaiser Panda). **[S]** Brakes: one
  input; "pump the brake in light rapid taps — a hard stab flips you forward"; endo = "small amount of gas
  and then heavily brake to lift your back tire." **[S]** Reverse: long brake press.
- **[I]** The friction cone must allow ~tan 60–70 deg on the rear under load (μ ≈ 1.7–2.7 effective) or wall
  techniques do not exist; a slip-based longitudinal model with high peak μ and a soft fall-off gives the
  "wheel visibly spins up, grips, stops" cadence of Evolution obs 13.

## 5. Speeds, gravity, hang time

- **[S]** No mainline Trials game shows a speedometer; no official top speeds exist (dossier §NOT FOUND).
  **[M]** clip 14 HUD: 26.7 m in 6.5 s at a 30–45 deg wheelie = **4.1 m/s**. **[M]** clip 06: ~1
  wheelbase/s on a 60 deg plank, ~2 on 50 deg. **[M]** Evolution: a clean beginner track (HD Warehouse) is
  16–19 s (obs 7); expert run 16.06 s. **[I]** From the 500 m-class beginner tracks and 16–19 s… the tracks
  are ~150–250 m, so average speed ≈ 10–14 m/s with a top of ~20 m/s on the fast bike; consistent with the
  CONTRACT's 20 m/s limiter and with "the 450 takes a second or two longer to get up to speed" (0–top in
  ~3–4 s, not 1.4 s).
- **[M]** Hang times (`frame-analysis.md` §7, tracked): clip 07 (Rising lesson, uphill landing) rear-off
  f142 → front-on f160 = **0.62 s**, rear-on 0.77 s, launch and landing planks at about the same height,
  touchdown front-first and level; clip 18 (Fusion stairs drop-in, in-game timer visible) **2.13 s**;
  clip 04 rear-wheel hop onto a platform **1.1 s**; Evolution big jumps 2.4–3.2 s (obs 12). Clip 18 is
  consistent with g = 9.81 given a ≈ 9 m/s vertical launch (the frames show the bike ≈ 2 m above the edge
  0.27 s after leaving it, which g ≈ 4 cannot produce). **[M] The two Rising hop events are not ballistic
  as measured**: in clip 04 the rear axle keeps rising for ~30 frames at a constant 55–63 deg pitch and
  would read g_eff ≈ 3–4 m/s² if fitted as a free flight; in clip 01 the rear pop is ≤ 4 cm. Either the
  pixel scale/pan correction is off by ~2× (flagged ±25 % / ±35 % by the analyst) or the game applies lift
  after take-off — an open question (§9), and the reason the design treats the hop as a *force profile over
  0.4–1 s*, not an impulse. No measurement in the corpus supports gravity *heavier* than 9.81.
- **[I]** Gravity scale in Trials: unknown officially; nothing in the footage requires g ≠ 9.81 once the
  bike's scale (wheelbase ~1.3–1.4 m) is fixed, and a 2.5D game built on Bullet with real masses would have
  no reason to change it. v2 uses 9.81 and gets airtime from geometry and launch speed.

## 6. Frame analysis of the corpus [M]

Per-frame tables (frame indices, pixel scale, derived metres/degrees) are in `frame-analysis.md`. Summary
of what was measured at 30 fps (see also `reference/notes/techniques.md` obs 7–11, which were the 2 fps
first pass):

| move | clip | measured |
|--|--|--|
| Front-wheel lift onto a ledge (the lesson's "bunny hop") | 01 (D2; 15 fps source) | rolling at 1.4 → 2.4 m/s on a plank level with the container top; **crouch 0.73 s** (f73–95, helmet to bar height); **front lifts at f95**; **extension 0.40 s** (f101–113, arms straight, hips back); pitch rises at 14 deg/s to **≈ 18 deg true** (27 deg screen); rear wheel unsupported **≤ 0.27 s, ≤ 4 cm**; rear touches first, front 0.73 s later; exhaust puff after rear touchdown |
| Same set-up, pre-load only | 02 | crouch held ≥ 0.8 s at 0.9 m/s; lift onset 24 deg/s; the source freezes before the move completes |
| Rear-wheel balance | 03 | **live balance ≈ 0.9 s at ≈ 30–45 deg true** (37–55 deg screen), drifting nose-up at ~20 deg/s; rear spring dips ≈ 8 cm on the drop onto the crate and recovers in 4 frames; f77–172 of the cut is a frozen frame (the "4 s balance" of the 2 fps notes is that freeze) |
| Rear-wheel hop | 04 | one full hop: pre-load 0.33 s (rear compressing), take-off f62, **airtime 1.1 ± 0.1 s**, rear axle rise ≈ 1.6–2.3 m (scale ±25 %), pitch 61–63 deg at take-off, 55–63 in flight, 37–39 after landing; rider dips → full extension at take-off → knees bend on landing |
| Climbs | 05, 06, 07 | quarter-pipe from 25–30 to 75–80 deg in 0.8 s at ≈ 4.5–5 m/s carried, front hovering; 60–65 deg plank: stall, roll-back 0.6–0.8 wheelbase in 0.5 s, rider stays forward; 42 deg plank at ≈ 1–2 wheelbases/s; 49 deg plank at ≈ 1.0 wheelbase/s in throttle blips every ≈ 0.8 s |
| Uphill landing | 07 | bike pitches **nose-down 10 deg in 5 frames** as the front unloads over the crest; **airtime 0.62 s** (rear-off f142 → front-on f160); touchdown **front-first, level (−5 deg screen)**, rear 4–5 frames later; pitch change in the first 10 frames after touchdown +2 deg; no rebound; rider crouches 0.3–0.5 s after |
| Big drop-in (Fusion) | 18 | **2.13 s** (in-game timer); rear-first at ≈ 35–45 deg screen, front down 4 frames later, nose-down rotation ≈ 35 deg in 4–5 frames |
| Wheelie | 13, 14 | front lifts **0.13 s after GO** (no crouch; rider pre-set); ≈ 20–25 deg by +0.5 s, ≈ 50 deg by +1.3 s; sustained band ≈ 40–50 deg screen at 4.1 m/s; a near-touchdown save (pitch → ~0, back to 45 in 10 frames); **correction cycle 0.8–1.0 s**, corrections are torso fore/aft, throttle held |

The table is the frame-analysis sub-agent's tracked reading (`frame-analysis.md` §7, verbatim there); it
supersedes the architect's earlier by-eye reading (kept in `frame-analysis.md` §1–6, marked superseded)
and corrects five items of `reference/notes/techniques.md` (listed in `frame-analysis.md` §7 §8: the
clip-01 "0.6 s hop", the clip-03 "4 s balance", the clip-07 "rear-first 30 deg" landing, the 1.5–2 s
wheelie cycle, and the source freezes in clips 02/03). What the corpus therefore *does* pin: a 0.7 s
crouch and 0.4 s extension for a front lift; a 0.33 s pre-load and 1.1 s flight for a rear-wheel hop at
60 deg; a 0.62 s level flight off a ~49 deg plank; 30–45 deg (true) rear-wheel balance; 0.8–1.0 s
wheelie corrections by body motion.

## 7. What makes it learnable [I from S]

1. **Three inputs, one meaning each, everywhere.** Lean is always "where the rider's body is"; throttle
   is always rear-wheel torque; brake is always wheel torque. In the air the *same* actions have the
   *same* mechanical effect (pose motion exchanges angular momentum; wheel torques react on the frame) —
   there is no mode switch and nothing to memorise except the bike.
2. **Continuous, monotone responses.** More lean = more COM shift; faster lean = bigger angular impulse;
   more throttle = more torque; "the longer you hold it the faster your rotation". Community guides
   speak in *amounts* ("a little", "hard", "longer", "very short") because the mapping is proportional.
3. **Windows set by physics, not by timers.** The hop window is the spring's half-period; the landing
   window is the compression stroke; both are ~0.2–0.4 s wide and degrade gracefully (a late hop is a
   lower hop, "you usually bounce off").
4. **Nothing hidden.** Every state that affects the next tick is visible: bike pose, rider pose, spring
   compression (the suspension is drawn), wheel spin (dust, sound), speed. Guides never mention "arming",
   "cooldowns" or thresholds.
5. **Failure is informative.** Loop = too much rear weight or throttle for the pitch; endo = too much
   front weight or brake; short hop = late/slow release. The same rule explains every failure.
6. **Determinism.** Same inputs, same outcome — replays, ghosts, leaderboards, and the player's own
   muscle memory rely on it.

## 8. The model the evidence implies [I]

- A **chassis rigid body**, two **wheels with spin and suspension** (rear suspension explicitly a spring
  the rider loads), a **rider body with mass and inertia whose pose is the lean input's target**, moved by
  **bounded internal forces** (RedLynx: "real bones… constraints"; 2006: "springs whose lengths the input
  changes"). Momentum and angular momentum are conserved between rider and bike: that alone produces air
  rotation from lean, nose-down from a forward snap, hop lift from leg extension, and the tuck.
- **Real gravity, real masses, real torque-vs-speed.** Stability under throttle comes from thrust falling
  with speed and from COM geometry, not from governors.
- **High rear grip** with a slip curve; **engine braking**; **brake = both wheels**, with the front's
  effect on pitch coming from geometry (an endo is available and is the player's problem).
- **Crash = body contact.** **Input quantised.** **Fixed step.** Everything else is layout.

## 9. Not sourced / open

- RedLynx has not published the physics tick rate in Hz in so many words (the 60 Hz step is inferred from
  "game speed is tied to framerate", the 16.6 ms budget, the one-frame restart and the Switch 60/30 split),
  nor the integrator or solver settings, nor the replay bit format (only "controller state, bit packed,
  ~2 kB per half hour"). Bullet is sourced (TeamXbox 2009, DF 2012). No GDC talk on the bike physics exists.
- No official masses, powers, top speeds or hop heights exist for any bike in any Trials game; the bars
  in Evolution are 1–8 relative scores.
- Whether Rising's lean is analogue on the ground (the Kaiser Panda five-state model suggests a
  rate-limited pose with a "released" intermediate) or strictly three-valued is not documented by
  Ubisoft; our design uses a continuous target with a finite rate, which reproduces the five states.
- Whether the rider in HD/Evolution is a full articulated ragdoll under active control or a reduced
  body (torso + legs) is not stated; the design uses a reduced body (one rigid torso-pelvis mass with
  kinematic limbs), which is sufficient for every documented behaviour.
- **Is the Rising rear-wheel hop ballistic?** Clip 04's rear axle keeps rising for ~1 s at constant pitch
  and reads g_eff ≈ 3–4 m/s² if fitted as free flight (`frame-analysis.md` §7 F); clip 18 (Fusion) fits
  9.81. Either the clip-04 scale (no known-length object; ±25 % / ±35 %) is off by ~2×, or Rising applies
  a sustained lift after take-off. Resolution needs a clip with a known dimension in frame (the pole spacing
  or platform height of that lesson); until then the design uses 9.81 and a hop force profile of 0.4–1 s
  (which is what §7 F recommends), and the lab level's HUD reports measured apex and airtime so the same
  fit can be run on our own bike.
