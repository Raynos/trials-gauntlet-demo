# Raw research: RedLynx Trials physics engine — developer and tech-press sources (sub-agent dossier, verbatim)

Collected 2026-09-14 by the architect's research sub-agent (~45 searches). Eurogamer/Digital Foundry block the
crawler and Beyond3D now requires login, so those were read from Wayback Machine captures (URLs below are the
canonical originals). All quotes are verbatim from the captured page text.

## PART A — DIRECT QUOTES (with URL)

### A1. Sebastian Aaltonen (sebbbi), RedLynx lead programmer — the primary sources

**Digital Foundry Tech Interview: Trials HD (Eurogamer, Sept 2009)** — https://www.eurogamer.net/articles/digitalfoundry-tech-interview-trials-hd (archived: https://web.archive.org/web/20100916093718/http://www.eurogamer.net/articles/digitalfoundry-tech-interview-trials-hd)

- Framing by DF: "RedLynx's lead programmer Sebastian Aaltonen (aka sebbbi in online circles) … Trials HD is a masterpiece of memory management. There is no loading … with each level taking a mere 8K … while tournament options occupy a mere 100 bytes (!)."
- Aaltonen, on Trials 2 SE: it "had arcade-style gameplay, direct support for the Xbox 360 pad, achievements, leaderboards, data storage on leaderboards (replays and ghost), global ranking, etc."
- Aaltonen: "The most important change is the unified physics model we use in Trials HD. A highly developed physics model has always been the core feature of Trials games, but until Trials HD the bike physics have been modelled with our own simple 2D physics engine."
- "In our previous game, Trials 2 SE, only the moving physics obstacles and the rider ragdoll were simulated using a real 3D physics engine. In Trials HD everything is simulated using a fully featured 3D physics engine. Full 3D physics allowed us to create levels that were not possible before and the physics interaction between different types of objects feels more natural, and the amount of physics glitches are reduced greatly."
- "In Trials 2, the bike collision model for example was just two spheres (bike tyres) connected to a centre sphere (the bike's engine) and a front sphere (the bike's handle bar). Obstacles often got stuck between the separate bike parts and the physics response felt a bit unnatural. In Trials HD the bike is a real 3D entity and its collision model is very precisely modelled to match the graphics model."
- "We also have physically modelled springs and shock absorbers on the bike, and the rider physics are now also simulated when he sits on the bike. The rider pulls the handlebars for real when you lean forward; it's not just a baked animation and a faked impulse like it used to be in the past."
- "Graphics engine optimisation was the single task that required the most work. The result is stunning, however: we achieve a constant full 60 frames-per-second representation all the time. The game rendering is also vertical-refresh-locked to produce absolutely tearless graphics output."

**TeamXbox "Trials HD Developer Interview" (Dale Nardozzi, 6 Aug 2009)** — http://interviews.teamxbox.com/xbox/2459/Trials-HD-Developer-Interview/p1 (archived: https://web.archive.org/web/20100211140603/http://interviews.teamxbox.com/xbox/2459/Trials-HD-Developer-Interview/p1/)

- Aaltonen: "All of our content tools and content tool chain are homemade at RedLynx. With the content tools, the designers can easily control, fine tune and simulate the physics behavior of the various game objects and bikes before exporting them to the game. All of our physics models are built using the in-house PC tools."
- "We are also using a modified version of an open source physics engine called Bullet Physics Library to calculate our physics simulation and collision inside the game. We have in-house optimized it for the Xbox 360 CPU and vector units. Our game engine is designed to be fully multithreaded, and we are simulating physics at the same time we are processing game logic, graphics, sound and particles in other Xbox 360 hardware threads. With extensive optimization, we have achieved a very good balance, with all six CPU hardware threads constantly working under heavy load."
- Antti Ilvessuo (same interview): "the physics and how you use them is the crucial thing in making Trials such a fun and addictive game … our aim … was to create really tight and solid core gameplay that uses the physics in a tuned manner."

**Digital Foundry Tech Interview: Trials Evolution (Eurogamer, 28 Apr 2012)** — http://www.eurogamer.net/articles/digitalfoundry-trials-evolution-tech-interview (archived: https://web.archive.org/web/20120430071113/http://www.eurogamer.net/articles/digitalfoundry-trials-evolution-tech-interview)

- DF: "While physics and playability is similar between Trials HD and its sequel, the entire look of the game has been radically transformed."
- Aaltonen: "Physics changes weren't as radical this time. We upgraded to a newer version of Bullet Physics. Unfortunately that meant we had to write all our Xbox physics optimisations again. This time, however, we had much more knowledge of the hardware specifics and that provided better results in the end."
- "Physics modifications were required, because the bike was moving faster in the outdoor game world, and the jumps were bigger. Bike suspension needed to be modified so that the heavy impacts wouldn't cause bike parts to get stuck in the ground. In Trials Evolution, we also give users more options for controlling the physics properties of the objects. Everything from mass and buoyancy to surface friction can now be changed in the Editor."
- On multiplayer: "Fortunately our game modes are really latency-tolerant because bikes cannot collide with each other. In Supercross each bike has its own lane, and in Trials you will see opponents as real-time ghosts. This allowed us to have perfect control precision in multiplayer as well. If the network is slow, only opponents' bikes show any signs of lag. Your own bike always plays perfectly."
- "Each console simulates only its own physics world. We only send an optimised visual representation over the network. We do, however, use the physics engine to do extrapolation to better predict where the opposing bikes would be."
- "Getting the huge game world to run at stable 60 frames per second and fine-tuning all the new streaming techniques took all the technology programmers' time."
- "Our version [of FXAA] runs at 0.8ms, less than five per cent of the 16.6ms frame." (Confirms a 16.6 ms frame budget.)
- "We fully optimised our particle engine with VMX128 instructions, and this freed up one of the six hardware threads just for visibility culling purposes."

**Beyond3D thread "Trials: evolution. [xbla]"** — https://forum.beyond3d.com/threads/trials-evolution-xbla.51297/ (pages 12–13 read via Wayback 2015 captures)

- sebbbi, 26 May 2012 (page 13): "The physically modeled gameplay feels so responsive and natural, because the game runs at constant 60 fps, and because we spend lot of time in fine-tuning the physics response and reducing the input lag. I spent almost a year just optimizing our engine. Huge outdoor world (2 kilometer view distance) + 60 fps + fully dynamic lighting and physics wasn't an easy thing to achieve."
- sebbbi, 28 May 2012 (page 13), on replay rewind: "Rewind is a b**ch to implement for a heavily physics based game. Our replays only record controller state. The physics simulation has to be fully deterministic (same input always results in exactly same output). Physics engine has many acceleration structures that automatically optimize themselves. If you would rewind back the state, you would need to store considerably more state than just previous object position+rotation+speeds+accelerations … Naturally you cannot just simply run the physics simulation backwards either. Forces and impulses and integrators do not work properly that way... and even if you could implement backwards running physics, it wouldn't stay in sync as evaluating (inverse) floating point equations in backwards order causes slightly different results (caused by floating point rounding errors, and lower precision SIMD estimates used)."
- sebbbi, 22 Jun 2012 (page 13): "Replays are recorded controller states. We bit pack them tightly and (lossless) compress them. Result is around 2kb of data per replay (half an hour maximum). … since replay playing uses the whole game engine (needs full physics simulation and full game world to simulate), we cannot show a replay simultaneously while you play the game (it would double physics processing cost and double memory usage for game world)."
- Same post, on ghosts: "Ghost data in the other hand is directly stored to the leaderboard database row … It must fit to less than 200 bytes. The ghost data itself is a mathematical curve that we fit to the recorded bike position data points. We optimize the curve (minimize control points while keeping the error as low as possible) … Showing ghosts is pretty much free (calculate position based on time and one curve segment)." Also: "We never show more than 5 ghosts … Technically we could show all of your friends (up to 100 ghosts) simultaneously."
- sebbbi, 11 Sep 2011 (page 2), on why 2.5D with a fixed camera: "Actually depth perception is really critical in this game. Trials 2 SE … had multiple selectable camera modes … Once you learned the game using one of these camera modes, it was really hard to play in other camera modes, just because you did see the track in slightly different angle and perspective (jumps became slightly too short or long). … In Trials HD development, we tried to put many fancy looking camera sequences in the tracks, but most of them were removed later on, because the game play just becomes too hard with changing camera … Trials style precision sensitive 2.5D game really benefits from it."
- sebbbi, 19 Apr 2012 (page 9): "Nothing in the game is baked offline (all lights are real time calculated, visibility/occlusion is real time calculated without PVS …). All our data is streamed during runtime." and "I am doing an interview with Digital Foundry (just like I did with Trials HD)."
- Player Rotmm, 15 May 2012 (page 12), on Evolution's lean input: "I keep thinking there should be some subtlety, some finesse to the forward and backward movement using left analogue stick, but of course it's just 'forward' and 'backward' with nothing in-between." (Player perception that lean was effectively binary in Evolution.)

**Beyond3D thread "Trials Fusion [PS4, XO]"** — https://forum.beyond3d.com/threads/trials-fusion-ps4-xo.55118/ (pages 5, 10 via Wayback)

- sebbbi, 14 Apr 2014: "You (customers) will see 60 fps vsync locked game on all platforms straight at the launch day. … Hint: It will be 60 fps locked, and smooth as butter."
- sebbbi, 17 Apr 2014: "In our development version we have noticed tearing only in one track (drop to ~58 fps in two places), everything else has been running at rock solid 60 fps."
- sebbbi, 17 Apr 2014, on instant restart: "Instant restart means that in a single frame (16 milliseconds) the whole level (textures, meshes, physics world, trigger systems, etc, etc) needs to be restored to the original state. … We would never trade game play for improved graphics."
- sebbbi, 18 Apr 2014: "We had a bug in an earlier Trials game that caused the full 3-2-1-GO! countdown for every track restart (instead of the 1 second long READY-GO). There was a huge riot in our forums. Instant restart is a key game play feature of the Trials series."
- sebbbi, 19 Apr 2014: "I am personally looking at the frame rate problems (in the worst case the fps drops occasionally down to 55. That's not acceptable)."
- sebbbi, 17 Apr 2014, on Trials Frontier: "We have two separate teams. One team is making mobile games (iOS and Android mostly) and one team is making console / PC games. The mobile Trials is quite different from the console version."
- sebbbi, 3 Aug 2014: "Update 3 also had some minor FPS improvements (should be rock solid locked 60 fps now in all the official levels)."
- sebbbi, 3 May 2014: "I have 100% platinum medals in Trials HD and Trials Evolution. I am (after all) the guy who originally designed the Inferno (Trials 2 Second Edition) and Inferno II (Trials HD) levels … In Trials HD I held the #1 spot in global leaderboard for the first two months."
- Player Jedi2016, 17 Apr 2014, on Fusion lean model: "My instincts tell me that the rider should reset to center when I let go of the stick, but he stays leaned in whatever direction. Leaning also seems very sensitive, coming off of Trials: Evolution on PC."
- Player Scott_Arm, 6 May 2014 — strong evidence the sim is tied to frame update: "I had a weird bug last night where the game was running in slow motion. The clock seemed to be going full speed, but the game was running at around half speed. The thing was, I could jump insane distances. I guess because the game simulation was running at half speed, it was registering my leans as if I was doing them insanely fast. So that lean back lean forward to jump would send me flying."
- Player Arwin, 20 Apr 2014: "I do feel you maintain a bit too much speed during air-time."
- Scott_Arm's bunny-hop description, 6 May 2014: "It's a quick lean back and then lean forward, but let the stick reset. Don't hold it back then forward. It's a very fast move … just when you're going to hit the point where you jump (before your front tire goes off the ledge), you quickly lean back then forward."

**sebbbi on X (Twitter)** — https://x.com/SebAaltonen/status/1663891592736899074: "AFAIK Zelda uses standard Havok physics as their solver. People were already doing more complex physics stuff in the Trials Evolution UGC editor 10 years ago on Xbox 360." And https://twitter.com/SebAaltonen/status/1604814178551750657: "Early tests with HypeHype's Jolt Physics integration show up to 6x perf improvement over Bullet Physics." (No tweet found stating a Trials tick rate.)

### A2. Other developer statements

**Destructoid interview (Trials HD, 2009)** — https://www.destructoid.com/interview-redlynx-talks-bringing-trials-hd-to-xbla/
- RedLynx "replaced the 2D bike collision engine in Trials 2 with a proper 3D physics engine in Trials HD"; "Tuning the bike took 6 months until it was just right. The bike alone took hundreds of iterations"; "the only actions players can make are gas/acceleration, brake and leaning of the rider"; "the rider is an actual physical model of a human being, so he is modeling real bones that all have realistic relations"; "you'll see the rider move and slightly change position – not because of animations, but because that is the way the physics moves his body".

**Game Developer / Gamasutra Q&A "Welcome to the Future — Designing Trials Fusion" (Karri Kiviluoma, lead designer)** — https://www.gamedeveloper.com/design/q-a-welcome-to-the-future---designing-i-trials-fusion-i-
- "A game like Trials is also very sensitive to physics changes and a small change can drastically affect the leaderboards so we're extremely careful not to tamper with the core gameplay even if the change is perceived to be something very small."
- "One time a change made all bikes in the game move just a tiny bit slower due to wind resistance being increased and nobody noticed it except for a level designer who said he was positive he could make a certain jump in a track he was making the day before but somehow failed today." (Confirms an aerodynamic-drag term in the model.)
- FMX mode "is a whole new gameplay system which is reliant on so many factors like how fast the character reacts to player input, how physics affect the system".

**GamingBolt interview (Karri Kiviluoma, 29 May 2014)** — https://gamingbolt.com/trials-fusion-interview-challenges-of-xbox-oneps4-and-lowered-resolutions
- "The frame rate actually has not increased with the console generation but that is because we had achieved a rather remarkable 60 frames per second already on the Xbox 360."
- "That high, locked frame rate is a vital part of the Trials experience, because when a top player is shaving microseconds of time off of his score, he has to have absolute fidelity between the controller, the physics engine, and what happens on the screen."
- "the 60 fps Guarantee is the spoke upon which the entire Trials experience spins."
- Platforms chosen so "the 60 frames per second lock, could be achieved on those platforms without intense customization and rewriting of crucial pieces of our physics and engine technology."

**Game Developer — Tero Virtala on Trials Evolution** — https://www.gamedeveloper.com/business/-i-trials-evolution-i-success-down-to-pleasure-over-pain-says-redlynx-s-virtala
- "the controls simple and friendly enough that a child can pick up and play the game, yet at the same time introducing a sophisticated physics model"; "Don't break the base game, because it isn't broken."

**GamesBeat interview, Ilvessuo (Evolution)** — https://gamesbeat.com/trials-evolution-interview/ — "It's very technical, making a game that has to run at 60 frames per second."; "You can create pretty much anything that modifies the bike physics, the speed, all physics, by triggers."

**PCGamesN, Ilvessuo (Rising, 2018)** — https://www.pcgamesn.com/trials-rising/trials-rising-redlynx-interview — "The bike physics and how the rider behaves, that always takes time - there's no shortcuts. We could have made a simple bike game many years ago. Two weeks and we'd be done. But it has taken a lot of time to get it right, to not mess it up and to keep it consistent." Also: "There's no animation delay. If you make a fault, it's only your fault." Tandem: "each player controls 50% of the bike."

**GameRevolution, John Lloyd (Ubisoft community director, Rising, 26 Feb 2019)** — https://www.gamerevolution.com/originals/500431-trials-rising-interview-tandem-bike — "It's really important that we don't touch that core gameplay too much. We can tune it a little bit here and there. We can add do some improvements to the physics and maybe make sure the bikes handle a little bit differently, a little bit better depending on your point of view."

**Gamereactor E3 2018 first look (Julius Fondem, associate producer)** — https://www.gamereactor.eu/trials-rising-first-look/ — "Two players will have to cooperate on the same bike, with each player controlling 50% of the throttle. Both riders must lean in sync to perform flips and land safely." Also notes Rising's ghosts became full rendered riders: "in Rising you can actually see how they balance their bike".

**Gamereactor Fusion preview** — https://www.gamereactor.eu/trials-fusion-preview/ — FMX "tricks are based wholly on the in-game physics and there are no built-in animations used."

**PocketGamer.biz "The making of Trials Frontier" (Justin Swan, lead designer)** — https://www.pocketgamer.biz/a-spectacular-leap-the-making-of-trials-frontier/
- "the most significant piece of technology we used is our in-house mobile game engine, called GeneTek, which we had developed earlier for MotoHeroz"; "It is not the same engine we use for Trials Fusion incidentally, that simply wouldn't run on the current generation of mobile hardware."; "the fact that some people think both games use the same engine, or that people feel the physics in our game feel so responsive and natural and Trials-like, compared to some of the clunkier clones out there, is a tribute to the talented game programmers".

**Grab It Magazine interview (Swan)** — https://www.grabitmagazine.com/blog/post/interview-trials-frontier-with-redlynx/ — Fusion is "running at blazingly fast frame rates in high resolutions, with … a complex physics model between bike, rider and environment"; "Mobile CPUs simply can't run that kind of game at this point in time"; Frontier has "a touchscreen interface and a 2D driving line as opposed to the controller-based gameplay and 2.5D space of the console games."

### A3. Frame rate per platform (press)

**Digital Foundry Face-Off: Trials Fusion (Eurogamer, Apr 2014)** — http://www.eurogamer.net/articles/digitalfoundry-2014-trials-fusion-face-off (Wayback 2015 capture)
- "It still uses a 2D plane for gameplay while flexing its technical might with outlandish, detailed 3D backdrops".
- Resolutions: Xbox One "1408x800, rising impressively to 1600x900 post-patch"; PS4 "1920x1080"; "the Xbox 360 release operates at 1024x608".
- "RedLynx has taken the curious decision to run dynamic shadows in the background at 15fps on all formats - a quarter of the game's overall frame-rate."
- "The Xbox One, PS4 and 360 releases deliver a pure 60fps experience for most of the way, only letting things slip when alpha appears on-screen. Adaptive v-sync is used in these moments."
- "One slight issue is that v-sync takes a few moments to re-engage when tears appear, leading to the odd burst of excess frames as the 60fps cap falls off, but this doesn't impact playability."
- "Ever since the series' console debut five years ago with Trials HD, the Finnish studio has put the emphasis on this number to make sure every tap of the trigger and flick of the analogue stick creates a rapid on-screen response."
- 360: "some frame-rate hiccups when crossing the finish line, while resetting to a checkpoint is slightly delayed compared to other formats"; "The only sore spot is a slightly narrower field of view".

**Softpedia (Fusion, 2014)** — https://news.softpedia.com/news/Trials-Fusion-Has-the-Same-Features-and-60fps-Framerate-on-All-Platforms-435543.shtml — RedLynx "strived to deliver a 60fps framerate on all possible devices"; feature parity across PC/PS4/360/XB1.

**TheSixthAxis Trials HD review** — https://www.thesixthaxis.com/2009/08/13/review-trials-hd/ — "It is fast and runs at sixty frames a second with no screen tearing at all"; leaderboard replay download "is literally instant too – a very impressive technical accomplishment."

**WellPlayed Trials Rising review (Switch)** — https://www.well-played.com.au/trials-review-back-in-track/ — "The game still calculates its physics at 60 frames per second, however, all of what you see is all rendered at 30 frames per second"; Tandem: "one player can only put in about 60% of the speed (meaning when both players do it, it is 120%)".

**Nintendo Life / DF Rising Switch** — https://www.nintendolife.com/news/2019/03/video_digital_foundry_looks_at_the_cutbacks_in_trials_rising_on_switch — "Trials Rising runs at 30 frames per second in comparison to 60 FPS on other systems"; "Frame pacing is an issue, but only when docked"; docked 720p, portable dynamic down to 480p/432p worst case. Search snippets of the DF piece also carry the line "the simulation runs at 60fps on all platforms so the gameplay should be similar" and "cut back quite aggressively for Trials Rising, but the physics-based driving is still as compelling as ever – even at 30fps" (DF video/ResetEra thread: https://www.resetera.com/threads/digital-foundry-trials-rising-switch-vs-ps4-xbox-one-comparison-a-cut-too-far-on-switch.103763/).

**VGTech Rising Pro/X (via NeoGAF)** — https://www.neogaf.com/threads/vg-tech-trials-rising-ps4-pro-vs-xbox-one-x-comparison.1472922/ — PS4 Pro dynamic 1170p–1800p, One X 1620p–2160p, both "virtually locked at 60 FPS".

**Kotaku (Rising Switch)** — https://kotaku.com/trials-rising-switch-eshop-screenshots-look-way-better-1832911633 — "running at 30 frames per second on Switch compared to 60 on other platforms"; Switch triggers "only register on and off".

### A4. PC frame cap / physics tied to update rate (community)

**Steam, Trials Fusion "Anyone know if FPS is capped?"** — https://steamcommunity.com/app/245490/discussions/0/558754259505856830/
- Jack (24 Apr 2014): "Game speed is tied to framerate, so 144fps would be unplayable, but it's a 60fps cap."
- Luthanick (8 May 2014): "the game engine is built around 60 fps, so it will stay at 60fps"; "User made tracks are made with 60 fps in mind, meaning that if I want something to happen with any exact timing I have to consider how many frames it will take... Changing that 60 fps to something else would likely break user made content as things would happen out of sync or not at all."
- Still B0r3d: devs "did say they were working on a 'satisfying solution'." (No such solution ever shipped.)

**Steam, Trials Fusion "How to remove fps cap??"** — https://steamcommunity.com/app/245490/discussions/0/3183345000081192937/ — Ponlets: "if the physics systems are locked to 60hz we interpolate the inbetweens for 120hz"; frame-gen workaround yields "fake frames still simulating at 60".

**Steam, Trials Rising "FPS Cap ??!"** — https://steamcommunity.com/app/641080/discussions/1/5452154443640609950/ (search snippet: "The physics in Trials Rising is tied to the framerate, which is the cause of the locked 60 FPS"; "According to a developer, the physics lock was kept to make sure physics worked correctly as it's core to the game" — thread body not retrievable, treat as paraphrase).

### A5. Input model

- **Trusted Reviews (Rising)** — https://www.trustedreviews.com/reviews/trials-rising — "leaning your rider forwards or backwards through the course to try and maintain balance, feathering the accelerator … Play it on a keyboard and all of this stuff is nearly impossible with the binary buttons, but otherwise it controls like a dream".
- **Steam "Reduce lean sensitivity?"** — https://steamcommunity.com/app/641080/discussions/0/2966146418287849692/ — Why Not Dr Z? (30 Nov 2020): "No matter how gently I touch the stick, the dude jumps all the way forward or backward." Reply $2 Hero: "you should be able to control the rider more precisely. dont press all the way forward just press a little." (Community consensus that lean IS proportional on a working pad.)
- **Nintendo Life forum (Rising Switch, GameCube analogue triggers)** — https://www.nintendolife.com/forums/nintendo-switch/trials_rising_-_the_first_switch_game_with_analog_trigger_support — "the analogue part of the triggers act as the right joycon's analogue stick. Right trigger actuates pushing the stick up, and the left trigger actuated pushing the stick down"; "you'll be able to get analogue acceleration in Trials Rising, you'll need it if you want to shave the milliseconds off your best times, because acceleration at full-whack isn't always the best way"; "Have you tried using the right analog stick? … it didn't take long before it started feeling natural."
- **Techgage (Fusion)** — https://techgage.com/article/trials-fusion-review-future-stunt-biking-slightly-exaggerated/ — "The game can be played with a keyboard, but those who go that route are effectively crazy – a gamepad is definitely a better input choice here because when precision is needed, analog wins."
- **AppSpy (Frontier)** — https://www.appspy.com/review/8411/trials-frontier — "The major downside is the replacement of analogue subtleties with binary buttons, meaning you can no longer ease off on the gas on trickier slopes."
- **Beyond3D, sebbbi on Gold Edition PC controls** (thread above, 4 Mar 2013): "all keys are fully configurable. The game supports keyboard, pad and mouse. You can even put two players on the same keyboard."
- **Steam Rising "Bike handling feels drastically different"** — https://steamcommunity.com/app/1004390/discussions/0/1795152172923361618/ — Fazo: "the bike is actually faster. you can also turn quicker. its the front suspension that is alot stiffer."
- **Stick deadzone bug (Rising console)** — https://x.com/VarsityGamingTV/status/1803080807835213868 — "the deadzone glitch seems to be from Ubi trying to prevent stick drift. Which was causing incorrect MouseTrap activations on console."

### A6. Hobbyist / clone devlogs

- **Fun-Motion review of original Trials (Java/PC)** — https://www.fun-motion.com/physics-games/trials/ — "The physics in Trials are spring-based. The bike and rider appear to be contraptions composed of several springs. Your rider's position is changed by modifying the lengths of these springs."
- **Dirt Bike Dialed devlog (Planck.js)** — https://djtroy.itch.io/dirt-bike-dialed-the-game/devlog/1663469/dirt-bike-dialed-the-game-from-the-first-bike-to-itchio — "a chassis and two wheels connected by suspension joints. The rear wheel drives, the brakes slow both wheels, and leaning puts rotation on the chassis."; "Physics runs in fixed 1/60-second steps and the drawing gets smoothed between them."; "If you've played Mad Skills or Trials, you already know the feel I was chasing."; crash trigger moved "to a sensor at the rider's head."
- **SummitGames Unity tutorial** — https://summitgamesentertainment.wordpress.com/2015/08/16/2d-and-3d-motorbike-game-tutorial/ — "sphere collider for the front and rear tires", "hinge joint for the rear fork … configurable joint component for the front fork", rider as character-joint ragdoll; targets Bike Baron / Trials Frontier clones.
- **Freeride devlog** — https://kjelle69.itch.io/freeride/devlog/1441147/ — "A bike rig with tuned joints + torque controls", "Less 'sirup physics' (drag/damping/unit scale bugs are real)".

## PART B — PARAPHRASED (with URL)

- Wikipedia Trials HD cites the TeamXbox interview for "in-house engine coupled with a modified version of Bullet Physics Library … optimized to utilize the Xbox 360's CPU and vector units" and "bend the reality in just the proper way"; VideoGamer review for "the fastest five thousand times are able to be viewed as replays … the viewer can view that recorded player's controller presses". https://en.wikipedia.org/wiki/Trials_HD ; https://www.videogamer.com/reviews/trials-hd-review/
- Wikipedia Trials Evolution: "optimized version of the Bullet Physics Library" (citing DF 2012); "locked 60 frames per second" flagged citation-needed. https://en.wikipedia.org/wiki/Trials_Evolution
- Trials HD PC (in Evolution: Gold Edition) uses the Evolution engine and players report changed feel ("floaty", "styrofoam", "the 250 is too bouncy compared to the xbox version"). https://steamcommunity.com/app/220160/discussions/0/540732889625801371/ ; Gold Edition was built by Ubisoft Shanghai under RedLynx supervision (sebbbi, B3D, 2 Mar 2013).
- Trials Evolution's first title update reset multiplayer leaderboards; replay bugs were widespread in Gold Edition. https://primagames.com/news/trials-evolution-gets-its-first-update-multiplayer ; https://steamcommunity.com/app/220160/discussions/0/846963165527224675
- Game Rant on Fusion: RedLynx "fine-tuned the physics … to make for a less frustrating end product", "widened that line to make the game more approachable". https://gamerant.com/trials-fusion-review/
- Xbox Wire, Ilvessuo (Fusion): "The great thing about physics is you don't know how it will end until you land." https://news.xbox.com/en-us/2014/04/16/games-trials-fusion/
- MotoHeroz (Frontier's engine ancestor) has "a physics engine that makes vehicles feel extremely light" and forgiving. http://www.nintendoworldreport.com/hands-on-preview/25523/motoheroz-wii
- Frontier controls: four on-screen buttons (lean back/forward left, brake/gas right); no tilt option; no auto-accelerate — throttle is manual and digital. https://www.gamereactor.eu/trials-frontier-review/ ; https://www.pocketgamer.com/trials-frontier/review/ ; Digitally Downloaded calls it "forgiving physics" https://www.digitallydownloaded.net/2014/04/review-trials-frontier-iphone.html . A NeoGAF OT claims 60fps on iPad mini (unverified): https://www.neogaf.com/threads/trials-frontier-ot-its-portable-trials.796937/
- Rising community: game omits the old per-bike speed/agility bar graphs. https://steamcommunity.com/app/641080/discussions/0/1840188800794319456/ Bike roster/roles: Squid all-rounder, Rhino "fast and heavy", Mantis "lightweight and agile", plus Helium, Donkey, Tandem. https://gamerheadquarters.com/articles/trials-rising-bikes.html
- Fusion bike roles: Roach heaviest/fastest, poor bunny-hop; Pit Viper light/nippy, best for extremes. https://psnprofiles.com/guide/8325-trials-fusion-trophy-guide
- Rising Switch: only GameCube controllers give analogue throttle; otherwise right-stick throttle; "it is actually possible to do the hardest content with digital triggers". https://mrpanda2002.wordpress.com/2019/02/25/trials-rising-switch-review/ ; https://www.nintendolife.com/news/2019/02/trials_rising_on_switch_doesnt_rise_up_to_the_challenge_of_its_rivals
- Prima Games tips snippet claims Fusion bikes reach "60 mph … 0 to 60 mph in just 3 seconds" — page is Cloudflare-blocked; treat as unverified marketing-ish copy. https://www.primagames.com/tips/trials-fusion-top-5-advanced-tips
- Beyond3D search snippet: during Trials HD dev the engine "rendered only 20 true frames per second halfway through the project" and RedLynx experimented with reprojection to hit 60 — the archived page 1 of that thread failed; sebbbi's page-4 post confirms only that they "tried [near/far split rendering] too in Trials HD" and abandoned it for "sync locked 60 fps". https://forum.beyond3d.com/threads/realtime-frame-interpolation-upscaling-30fps-to-60fps.49577/page-4
- Eurogamer "The Trials of Trials": Trials began (1999) as a Java physics experiment; the bunny-hop was discovered emergently ("Suddenly I noticed I can make jumps longer or higher using these techniques"). https://www.eurogamer.net/the-trials-of-trials-article

## PART C — NOT FOUND / COULD NOT VERIFY

1. An explicit developer statement of the physics tick rate in Hz. Nothing says "physics at 60 Hz" or "120 Hz substeps" verbatim. Best evidence: sebbbi ties responsiveness to "constant 60 fps", the 16.6 ms frame budget, "instant restart … in a single frame (16 milliseconds)", DF's "60fps cap", the community "game speed is tied to framerate" reports, the Fusion half-speed bug, and WellPlayed's Rising Switch claim (physics 60 Hz, render 30). No fixed-timestep-vs-render decoupling statement from RedLynx exists for PC beyond the hard 60 cap.
2. A GDC Vault talk by RedLynx on Trials physics. Aaltonen's SIGGRAPH 2015 "GPU-Driven Rendering Pipelines" is rendering only. No Ilvessuo/Virtala GDC physics talk found.
3. Any statement that replays desync across platforms or after patches. Evolution replay bugs and the Gold Edition physics feel change are documented, but no dev note of the form "old replays no longer validate".
4. Trials Frontier tick rate or auto-accelerate. No dev statement; reviews describe manual digital gas. GeneTek engine internals undocumented.
5. Rising dev diary on physics changes from Fusion. Only Lloyd's "we can tune it a little bit" and Ilvessuo's "keep it consistent"; the Steam dev-diary series covered economy/cross-platform, not physics.
6. Measured top speeds, 0–100 times, hang times, gravity constants. None credible. Rising removed stat bars; no speedometer exists. Only a dubious Prima "60 mph" line.
7. Controller dead-zone values or an official "lean is proportional" statement. Evidence is indirect: Rising has analogue lean per players; Evolution-era players describe lean as binary; Fusion players note the rider holds lean when the stick is released.
8. Academic reverse-engineering of Trials. None found; only hobbyist clones (Box2D/Planck: chassis + two wheel joints, rear-wheel motor, lean = chassis torque, ragdoll head sensor as crash).
9. Red Bull Rising interview body (page renders empty to all fetchers, including Wayback).
10. sebbbi tweets/Mastodon posts specifically about Trials tick/determinism — only the two indirect tweets above.
