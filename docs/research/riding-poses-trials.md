# Riding poses: Trials reference research

Researched 2026-09-21 for ask 73. User-confirmed reference set: **Trials Evolution, Trials Fusion, Trials Rising**.
HD is retained only as historical developer context; it does not substitute for Rising.
User priorities: fix forward lean first; research the riding style; physics changes are authorized.

## What the primary sources establish

### Trials Evolution: preserve controls, retune the physical response

Antti Ilvessuo says the game moved to an improved Bullet version and some pieces were rewritten, while motorcycle
controls remained substantially the same; experienced players could notice different behavior. This is translated
paraphrase of the Dutch interview, not a claim that the two games have identical handling.
[Original 4Gamers interview, 2012](https://4gamers.be/specials/12796/interview-trials-evolution/).

The creative director also identifies larger outdoor environments, curving riding lines and multiplayer as major
changes. That establishes a presentation/context difference, not evidence of new anatomical target angles.
[Original GamesBeat interview, 2012](https://gamesbeat.com/trials-evolution-interview/).

The engineering implication for this project is to judge posture during actual obstacle traversal and suspension
response. A pose change may require servo, hop or landing retuning without requiring different player controls.
This is our design inference; it does not prescribe Evolution's exact physics parameters.

### Trials Fusion: ordinary balance and stunt poses are different inputs

The official manual lists forward/back lean, FMX pose and bailout separately. It retains the series' physics
gameplay and defines ordinary performance by faults and completion time. It specifies immediate return to the
previous checkpoint on retry. Its FMX section describes airborne pose holding, with full extension relevant to
trick quality and gentle landings relevant to flow. Thus a dramatic stunt extension is not evidence that ordinary
forward lean should release the grips or pegs. The manual does not document ordinary arm pole vectors or a
standing-versus-seated duty cycle.
[Official Trials Fusion manual, Xbox](https://dlassets-ssl.xboxlive.com/public/content/4bf57e2c-173a-4764-bee7-fe93e0613204/GameManual/2925b744-4ba1-43f7-9201-8964ad2b555e/en-GB/index.html).

Ubisoft's launch article likewise identifies FMX as its own trick system on special courses. Our implementation
should distinguish controlled riding, loss of contact and crash, rather than using one generic stretched pose.
[Ubisoft's Ed Casey, PlayStation Blog, 2014](https://blog.playstation.com/2014/04/16/trials-fusion-now-available-on-ps4-new-trailer/).

### Trials Rising: readable technique and physical consistency

Ubisoft describes balance, jumps, narrow airborne obstacles and platform hops as the challenge. Its tandem mode
requires coordinating lean to climb, flip and recover orientation. This supports lean as continuous balance
control through grounded and airborne phases, rather than a special-purpose jump pose.
[Ubisoft's Mikel Reparaz, 2018](https://news.ubisoft.com/en-us/article/4Br16FNvGgY2MtpWelZDIh/trials-rising-going-tandem-and-breaking-bones-abroad-e3-2018).

Brad Hill (Professor FatShady) explains in an original interview that Ubisoft commissioned his tutorial videos,
then invited him to design Rising's in-game lessons in 2016. He describes researching earlier games and pitching
the tutorial approach to RedLynx. His UniversityOfTrials uploads of the in-game lessons are therefore especially
useful first-person explanations of intended behavior, while his older videos are player demonstrations rather
than disclosures of engine source code.
[Original Brad Hill interview, Stevivor, 2019](https://stevivor.com/features/interviews/how-aussie-professor-fatshady-became-a-trials-rising-dev/).

### Historical context only — Trials HD: body movement must communicate physical balance

RedLynx's creative director, project manager and CEO describe lean as shifting balance, alongside gas and brake.
They explain that leaning back loads the rear suspension and leaning forward at takeoff adds forward momentum.
They also describe the rider as a constrained physical body whose motion responds to simulation, with ragdoll
behavior on crashes. This supports a connected weight-transfer sequence, rather than an isolated torso tilt
or an animation triggered independently of the bike's state. It does not disclose joint angles, bone lengths,
contact thresholds or solver equations. [RedLynx interview, Destructoid, 2009](https://www.destructoid.com/interview-redlynx-talks-bringing-trials-hd-to-xbla/).

In another original interview, the same studio describes the core as simple controls combined with a developed
physics model, stressing player control rather than predetermined actions. Our inference: preserve the player's
ability to reverse the lean during a maneuver; avoid a noninterruptible forward-lean or hop animation.
[RedLynx interview, GOONL!NE, 2009](https://gamzsonev3.wordpress.com/2009/09/03/goonlne-exclusive-goonlne-sits-down-with-trials-hd-dev-redlynx/).

## Riding-style decision proposed for this build

Keep the plan's required **seated neutral → active forward rise → rearward weight shift**. The tutorial narration distinguishes seated, standing and forward positions; it does not establish a
requirement to replace the project's seated neutral with permanently standing real-world trials posture. The common, supported reference is responsive physical weight transfer; preserve the user's existing
neutral requirement until explicitly changed.

Forward should read as pelvis rising from the seat while shoulders move toward the bars, with knees and elbows
absorbing the change. Rearward should visibly shift the pelvis behind neutral and lengthen the reach without
stretching limbs. These silhouettes are **project design proposals grounded in the existing plan**, not measured
copies of the reference games. The head, garment and hips must remain mutually coherent as the bike pitches.
Do not fix an ugly full-forward endpoint by leaving most of the input range in neutral.

For hops, use an interruptible back-to-forward transfer coupled to the existing suspension/servo system; the
body's loading and extension should explain the motion. For landing, show compression and recovery in response
to actual impact. For excess reach, switch to a visible released/fault state seeded from the current body pose.
Ordinary airborne balance should retain the riding contacts unless the simulation has declared release.

## Timestamped technique evidence from original tutorial captions

**Method:** retrieved YouTube metadata and English original auto-caption tracks with `yt-dlp`; read timed captions.
The videos below are uploads by UniversityOfTrials. They are original explanatory sources, but automatic
speech recognition can contain errors. Video downloads returned HTTP 403 for both progressive and separate-video
formats. **These are narrated behavioral observations, not watched motion or measured geometry.** The existing local
reference corpus was subsequently found and sampled separately below. Full captions remain temporary research material
under `/tmp/trials-research/`; only short paraphrased findings are recorded here.

| Game / original upload | Time range | Caption-supported behavior |
|---|---|---|
| Evolution — [Semester 1, Class 1](https://www.youtube.com/watch?v=zgLI78bLKw0&t=243s) | 04:03–04:19 | The instructor distinguishes sitting, standing and leaning forward; holding any one while accelerating fails his example gap. A static endpoint alone is insufficient. |
| Same | 04:37–05:06 | He describes rearward weight compressing rear suspension, forward transfer lifting the bike, then bringing it back underneath the rider. Back → forward → back is explained as a timed sequence. |
| Fusion — [Bunny Hop Detailed Walkthrough](https://www.youtube.com/watch?v=28QIiX-jlmw&t=130s) | 02:10–02:47 | Starting already seated/rearward leaves little additional rearward loading movement; prepare from standing or forward. |
| Same | 02:50–03:49 | Accelerate, move back to load suspension, then transfer the body forward near maximum load; the rider remains attached and pulls the bike with the transfer. |
| Same | 05:00–05:44 | A rearward return after forward transfer helps raise the rear wheel over an obstacle. |
| Same | 06:15–06:36 | Timing must permit loading; a careless instantaneous left-right input is not equivalent to a well-timed hop. |
| Rising — [Introduction to Leaning, In-game Lesson 2](https://www.youtube.com/watch?v=p-48hUANk3c&t=15s) | 00:15–00:29 | Lean forward over the handlebars uphill and rearward downhill, combining lean with throttle control. |
| Rising — [Mid Air Rotation, In-game Lesson 3](https://www.youtube.com/watch?v=JMKEXDk_y00&t=12s) | 00:12–00:31 | Shifting body weight rotates the bike in the direction of lean; gentle adjustments align the wheels, with gentle gas on landing. |
| Rising — [Flat Obstacles, In-game Lesson 9](https://www.youtube.com/watch?v=V9f_hggzEvE&t=27s) | 00:27–00:52 | The narrated technique depends on obstacle shape: small round obstacles versus square edges; the latter use rear-wheel/frame contact followed by forward lean. |
| Same | 00:54–01:38 | Forward preparation before rearward loading increases hop height; an endo before that loading is described as a further boost. |

**Consensus supported by these explanations:** rider movement, suspension loading and obstacle contact form one
sequence. The order, starting posture and timing matter. **Not established:** identical angles or durations between
titles, exact mass/servo constants, and the claim that all games use the same collision/animation implementation.

**Meaningful differences in available evidence:** Evolution's lesson introduces the sequence and comparative
failure examples; Fusion's longer lesson explicitly explains starting posture, delayed loading and the recovery
phase; Rising's authored lesson applies those principles to distinct obstacle shapes and endo preparation.
These are differences in instruction and scenario coverage, not proof that a mechanic is exclusive to one title.
Fusion's separate FMX input is a documented mode distinction; it should not contaminate the ordinary riding pose.

**Implementation consequence:** probe full forward from neutral *and* from a compressed rearward state. Probe rapid
reversal and load-dependent recovery. A fix that only improves a motionless forward screenshot misses what these
sources teach. Measure pelvis/shoulder response alongside suspension travel and bike pitch, then judge ridden clips.

## Sequential visual observations from the local played-footage corpus

Provenance: `reference/techniques/manifest.json` and `reference/evolution-gameplay/manifest.json` identify the original
uploads and cut start/end times. Actual local MP4s exist under the corresponding `clips/` paths. I decoded those
played-footage clips using ffmpeg, inspected the existing complete-clip 2 fps sequences, then extracted **6 fps
ordered sequences** from the windows below (about 18 consecutive samples per 3 seconds). This is sequential image
inspection of recorded play, **not real-time video playback and not a parent visual acceptance judgment**. It is
suitable for coarse body relationships and event order, not sub-frame latency, exact 3D joint angles, cloth quality
certification, or claiming contacts hold between samples. Camera perspective makes screen vertical unreliable.

| Game / local clip | Source window inspected at 6 fps | Observed sequence and implication |
|---|---|---|
| Rising: `techniques/clips/01-bunnyhop-plank-to-ledge-and-reset.mp4` | [Bunny Hop lesson, 34–37 s](https://www.youtube.com/watch?v=-a_ulossbyc&t=34s); local +2–5 s | Begins with pelvis conspicuously above saddle and chest pitched toward horizontal over bars. Pelvis then drops rearward toward saddle, knees fold and arms lengthen; rider extends upward again as the front wheel rises and the bike crosses the edge. The visible mass movement is whole-body, not a head nod. Hands and boots appear attached in the samples. |
| Evolution: `evolution-gameplay/clips/05-a-license-obstacle-climb-wheelie.mp4` | [A License, 58–61 s](https://www.youtube.com/watch?v=ytUW5r3RYw0&t=58s); local +0–3 s | Compact forward crouch with chest over bars becomes rear-wheel lift and then a much taller pelvis/leg configuration. The silhouette alternates compressed and extended while climbing; it does not preserve one seated hip height. Input timing is not visible, so the pose changes cannot be mapped to exact stick values. |
| Fusion: `techniques/clips/16-seesaw-tip-and-exit.mp4` | [Inferno IV tutorial, 51–54 s](https://www.youtube.com/watch?v=5EtbE9r9L5k&t=51s); local +3–6 s | With the bike strongly nose-up, torso is fairly upright in world space and hips remain raised relative to the saddle. Bent elbows absorb changes as the bike approaches the pivot. World-upright torso does not mean neutral lean in the bike's frame. The source is cropped/upscaled per its manifest; costume and near-arm overlap limit shoulder detail. |
| Rising: `techniques/clips/05-steep-curved-ramp-climb.mp4` | [Uphill Obstacles lesson, 13–16 s](https://www.youtube.com/watch?v=U7DWi1Kd1IE&t=13s); local +0–3 s | Crouch on approach, extended bar reach while the front rises steeply, then a pronounced off-seat, chest-down configuration as the bike returns toward level at the next platform. The entire pelvis/chest relationship changes with the maneuver. |
| Rising: `techniques/clips/07-uphill-plank-landing.mp4` | [Uphill Landing lesson, 30–32.4 s](https://www.youtube.com/watch?v=HU5qgS4DhwE&t=30s); local +4–6.4 s | Rider extends from the steep launch, changes posture in flight and compacts over the bike on landing. Camera pulls back and rotates, so exact contact timing and compression distance cannot be recovered reliably from this sequence. |
| Rising: `techniques/clips/10-drum-spool-crash-respawn.mp4` | [Flat Obstacles lesson, 52.5–55.5 s](https://www.youtube.com/watch?v=V9f_hggzEvE&t=52s); local +1–4 s | Bike rotates around the spool; the rider tumbles beside it, with legs visibly separating from peg posture, then lies extended on the platform while the bike is overturned. Release is readable as a different body/contact state, not continued riding IK on an inverted bike. Exact grip-release frame is obscured. |

Additional Fusion stair-descent samples (`techniques/clips/19-stairs-step-by-step-descent.mp4`, source 12–15 s)
show repeated compact/extended silhouettes but the camera is too distant for useful arm analysis. Do not use this
clip to set elbow targets. No isolated reference still establishes that the demo's new implementation is good.

**Forward-lean finding:** the useful reference target is a clearly visible pelvis departure from the saddle plus
chest movement toward the bars. Rising's close tutorial gives the clearest evidence of this. Backward preparation
and forward extension traverse substantially different silhouettes. Use bike-local pelvis/shoulder coordinates,
then judge whether that distinction remains readable at the actual gameplay camera. Do not infer a numerical
travel target from these perspective images; calibrate the demo's metrics against its geometry and clips.

**Arms finding:** the close Rising sequence retains bent elbows during the forward preparation, extends reach in
the seated/rearward phase, then changes bend during extension. This supports a pole-continuous two-segment solve.
It does not establish that every reference elbow points down: camera, bike pitch and reach change the screen-space
silhouette. An unconditional world-down elbow rule would misread the references.

## Proposed measurements and played evidence

These are implementation acceptance proposals, **not reference-game measurements**. Record baseline values
before choosing numerical thresholds; retain the existing handling bars rather than relaxing them to fit new poses.

| Requirement | Measurement | Played check |
|---|---|---|
| Forward priority | Bike-local pelvis height and shoulder forward displacement versus neutral; seat separation; torso pitch; input-to-visible-motion latency | Continuous neutral → forward → neutral and rapid direction reversal, with input overlay |
| Neutral | Pelvis-to-seat clearance in settled riding; visible/physical pelvis and torso mismatch | Low-speed flat cruise followed by bumps; no floating seated pelvis |
| Rearward | Pelvis moves rearward relative to neutral; shoulder-to-grip reach remains within the same limb lengths | Forward → back while accelerating, braking and pitching |
| Arms | Per-frame shoulder/elbow/wrist positions, joint angles, arm-length error and pole-side continuity | Both silhouettes through reversals; no elbow snap, raised chicken wing or collapsed sleeve |
| Contacts | Hand/grip and boot/peg error distributions, maxima and duration; explicit released flags | Every ordinary riding phase plus impact sufficient to cause release |
| Landing and hop | Suspension load, physical and visible pelvis trajectories, hop height and survival; no render-only excursion clamp | Actual ramp takeoff, flat landing and sloped landing; normal and hard impact |
| Crash handoff | Last riding and first released world-space joint positions/velocities; discontinuity and contact state | Over-reach/crash and immediate restart; no reattachment or teleport |
| Garment | Skinned-surface inspection around shoulders, hood, elbows, hips and bike; bone tests alone are insufficient | Moving full-detail and LOD garments, both sides when visible |

Use the identical deterministic input recordings before/after. Cover both bike classes and every rider family/LOD
for contacts, silhouette and clothing. Run the existing handling rows, changed-physics goldens, byte-identical
browser replay and the plan's bot + stranger attempts-to-clear on b1–e3 (n ≥ 2). Track restart latency. The parent
must judge played clips; this source research does not accept an implementation or close a visual requirement.

## Evidence limits and rejected leads

- This pass inspected published text/manuals, original tutorial auto-captions and sequential samples from local
  recorded-play MP4s. It did not perform real-time video playback. It cannot certify exact 3D elbow angles, pelvis
  travel, sub-frame transition duration or garment deformation; the observed silhouette relationships are qualitative.
- A [UniversityOfTrials Fusion bunny-hop lesson](https://www.youtube.com/watch?v=28QIiX-jlmw) was located (2014-05-03).
  Its timed narration was inspected as recorded above; neither captions nor its description are visual motion evidence.
- A mirrored Evolution tips article attributes a loading sequence to Ilvessuo, but the original publisher was not
  verified. Do not elevate it above the directly inspected original interviews.
- Digital Foundry's original Evolution/Fusion technical interview pages did not load in this pass. A forum copy
  was located; it is not used here as authoritative evidence for physics constants or animation behavior.
- [Physics Meets Animation, GDC 2010](https://media.gdcvault.com/gdc10/slides/Nilsson_Andreas_PhysicsMeetsAnimation.pdf)
  is **Character Stunts in Just Cause 2**, by John Fuller and Andreas Nilsson. It is not a Trials presentation
  and must not be cited as evidence of RedLynx's rider implementation.
- No located primary source supplies cloth limits, numerical contact-release rules or the runtime rig geometry.
  Those need project measurements and played evidence. Research does not authorize inventing missing game facts.
