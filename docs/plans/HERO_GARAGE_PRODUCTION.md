# High-fidelity rider and bike: fresh garage production plan

Status: Breadth-first assembly in progress, September 16, 2026. The user explicitly changed execution order: show the full person and full bike together in Three.js now, then polish individual elements. The user subsequently asked to attach the saved face, curly hair and beard to the full rider immediately; that existing identity assembly is now active, without a new grooming pass. The full original quality, motion, runtime and integration scope remains open.

## Confirmed user decisions

- **Latest priority — breadth first:** assemble a complete person and complete bike, provide a real Three.js screenshot of both, then refine individual elements. This supersedes every earlier head-first dependency in this plan. Reuse existing authored project assets for the whole-scene baseline and label their quality honestly.

- **Visual approval:** the user approves the identity board and each major visual milestone, but explicitly authorizes provisional parent approval and continued overnight work while asleep. Preserve the board and milestone evidence for final user review; do not label provisional review as final user acceptance.
- **Sources and spending:** start with free licensed assets and local Blender tools. Free personal-use/noncommercial assets are allowed for this personal laptop project; CC0 is not required. Record exact terms and keep restricted assets local where required. Ask before spending on assets, tools, hosted services or specialist work.
- **Usage floor:** stop sustained work at 20% weekly allowance remaining, replacing the older 30% floor in the handoff. Check account usage during the run.
- **Stalled likeness:** after two head-and-hair correction attempts with no visible improvement, change the free asset or method. Bring the user a concrete decision if still blocked.
- **Fixed design:** retain target 01's mustard hoodie, exposed face, tousled dark curls and blue/white bike, with seated neutral, forward rise and rearward hip shift. Develop missing angles while preserving that design, then submit the identity board for approval.
- **Mobile garage:** target 30 fps to preserve more detail, verified on an actual iPhone/Safari. This decision applies to the garage; gameplay performance requirements remain separate.

## Latest execution result

The independent viewer now renders the complete existing Blender-authored mustard Street rider and blue/white bike together. The original `sit_cruise` began standing; the breadth-first pose pass now exports a seated start, forward rise and rearward shift, with lowered elbows and measured hand/foot markers. The requested [browser screenshot](../../prototypes/hero-garage/captures/full-rider-bike-a2/webkit-full.png) and [full-scene orbit](../../prototypes/hero-garage/captures/full-rider-bike-a2/webkit-orbit-relight.webm) are captured. Whole-scene priorities are seating/contact, relaxed elbows, proportions and clothing. These assets establish breadth; they are not a claim that the requested final character fidelity is complete.

Round 11 adds a [whole-body pose review](../../prototypes/hero-garage/reports/full-rider-pose-review.json) and [updated full-scene screenshot](../../prototypes/hero-garage/captures/full-rider-bike-a4/webkit-full.png). All three motion clips load and repeat deterministically in headless WebKit. Lowered elbows improve the pose; seated support, garment deformation and contact shadows remain provisional.

Round 12 adds looping forward/rear motion, a bounded garment surface correction, precise floor alignment, and parked wheel cleanup. The [whole-scene review](../../prototypes/hero-garage/reports/whole-scene-round12-review.json) keeps garment/seat quality open. A 30-second WebKit orbit records **p95 26 ms**, failing the 16.7 ms desktop target. The frozen game ship gate passes 1,038 identical replay ticks, an 8.65-second clear and one-tick restart.

Round 13 adds compression, extension and landing-absorption clips with seated returns, verified contact markers across all 750 exported frames. [Motion review](../../prototypes/hero-garage/reports/whole-motion-round13-review.json) retains them provisionally; the stationary bike has no physical suspension response. Timing diagnosis records 18 ms p95 both for the scene without video and for an empty page; the 16.7 ms runtime gate remains unproven rather than relaxed.

Round 14 corrects an earlier misleading contact metric: saddle-region gaps were 33–45 mm despite a 0.6 mm minimum elsewhere. The new seat-fit candidate reduces central gaps to 2–3.54 mm; uneven side support and a measured 0.05 mm rearward grazing intersection remain. The bike receives source-derived 2K color/1K lossless data maps. [Review and resource limits](../../prototypes/hero-garage/reports/whole-seat-materials-review.json) retain both provisionally; estimated active image residency is 98.76 MiB before renderer allocations.

Round 15 reconstructs the existing open neckline rim into a connected collar (+583 net triangles). Full-scene neutral/landing review shows reduced gaping, but the 10.15 mm front seam, collar UV stretch and shoulder shape remain provisional. [Review](../../prototypes/hero-garage/reports/whole-collar-round15-review.json) includes the passing frozen game ship gate: 1,038 identical ticks, 8.65-second clear, one-tick restart.

Round 16 adds a mobile texture tier with unchanged geometry and all six clips. The all-image RGBA8+mip estimate falls from 98.76 to 34.76 MiB. Automatic touch selection, portrait/landscape DPR1.5, loading and tap checks pass in desktop WebKit emulation. [Comparison review](../../prototypes/hero-garage/reports/mobile-round16-review.json) records no obvious whole-scene regression; actual iPhone performance remains unmeasured.

Head-only studies, source files and their rejected reviews are preserved. They do not block body, bike or scene work. Hunyuan's isolated experiment finished without a usable mesh, and TRELLIS is paused. No paid work has been commissioned. The latest checked allowance is 22% remaining, with the 20% reserve unchanged.

## Status checklist (moved here from HERO_OPEN_WORK.md §4 — the one list for this milestone)

Start with one mustard-hoodie, bareheaded rider and one bike, using target 01. Do not expand to five outfits before the first character passes visual review.

- [x] Create the independent `prototypes/hero-garage/` Three.js viewer with fixed comparison cameras and a simple garage lighting setup. TypeScript/build and frozen-build WebKit load/orbit/error/touch smoke checks pass; visual acceptance remains separate.
- [ ] After whole-scene review, establish the recognizable face and tousled curly hair in the actual browser: anatomy, eyes/lids, jaw, ears, beard and authored curl clumps.
- [ ] Build the dressed body: tailored hoodie and jeans, convincing folds/seams, hands and footwear, coherent proportions.
- [ ] Finish the hero bike's silhouette, mechanical details and materials at the same viewing scale.
- [ ] Produce editable Blender sources, retopologized meshes, UVs, baked/painted textures, rig and corrective deformation; export verified runtime GLBs.
- [ ] Prove orbit quality and animation, then measure load cost, rendering and memory against the production plan's budgets.
- [ ] After the first hero is accepted, derive the remaining outfits and integrate with the game's physical pose system.

**Pipeline clarification:** current game assets are real Blender-exported GLBs, many authored through Python; the old procedural fallback/toggle remains. The separate img2threejs reconstruction experiment never shipped and is stopped. A Blender file or high triangle count does not by itself create high-fidelity character art. The new route requires deliberate sculpting, grooming, clothing, texturing and deformation review. Image-to-mesh may provide raw material, but is not the acceptance criterion.

**Done when:** the browser-rendered hero convincingly matches the reference's identity, hair, clothing and bike design at comparable framing, also holds up from other angles and in motion, and meets the agreed runtime budgets. An AI mockup, procedural stand-in or larger screenshot is not completion. Use the staged acceptance gates in the production plan.

## The decision

Build a standalone Three.js garage prototype around **one excellent rider and one excellent bike**. Start with the mustard hoodie, exposed face and tousled curly hair from [target 01](../../assets/design/hero-targets/01-street-barehead.png). Establish the complete rider and bike in the browser first, then refine character art, outfits and integration through whole-scene reviews.

The recommended route is **an editable anatomical base → reference-driven Blender sculpt → authored hair and clothing → animation topology and UVs → texture baking/painting → rig and corrective deformation → Three.js look development**. AI mesh generation is an optional source of raw material, not the production pipeline or its acceptance authority.

Blender is the editable asset source. Three.js is the delivered renderer. Python automates repeatable operations; computer use supports visual sculpting, grooming, painting and rig review. None of these tools supplies artistic judgment automatically.

### What “looks exactly like the image” means

Aim for the same recognizable person, hair silhouette, proportions, garments, bike design and material character from the reference camera. Also require a convincing orbit and animation. A single AI image does not uniquely specify a three-dimensional object: hidden surfaces and some mechanical details must be designed. Supplementary generated views can contradict the original. Do not promise pixel-identical appearance at every angle or silently replace the original face with a different generated identity.

The target screenshot also gives the rider much more screen space than our current gameplay captures. Evaluate at **both equal framing and ordinary gameplay framing**. A larger screenshot is not an asset improvement.

## Why the current work missed

- The current gallery has real Blender exports, but broad clothing shapes, simplified facial anatomy and cap-like hair do not reproduce the target's identity.
- Correct grip positions, manifold meshes and triangle counts are technical requirements. They do not prove believable anatomy or good character art.
- The img2threejs experiment built a separate procedural approximation; it was never integrated. More primitive/implicit-surface correction loops are not the recommended foundation for this hero.
- Current riding poses are computed by the physical pose system, which bypasses the Blender animation clips. A well-authored seated clip cannot fix a standing neutral target while that bypass remains.
- Small sleeve smoothing did not solve the chicken-wing pose and was rejected. Pose design and asset art need explicit, coordinated ownership.

## 1. A genuinely independent prototype

Proposed location: `prototypes/hero-garage/`, inside this checkout. Separate package, build output and asset catalog; no imports from game boot, gameplay physics, procedural rider factories or production model-selection code.

```text
prototypes/hero-garage/
  README.md                  # run/build/capture commands and current accepted milestone
  package.json
  src/                       # scene, cameras, materials, animation, inspection controls
  public/assets/             # exported runtime GLBs and compressed textures
  references/manifest.json   # pointers/hashes for original references and admitted additions
  art/                       # editable Blender sources, UVs, paint sources, export recipes
  captures/                  # fixed-camera stills, orbit and motion evidence
  reports/                   # asset provenance, review decisions, performance measurements
```

Keep existing reference originals in their current location; do not create multiple untracked authorities. Large sources and runtime assets need a deliberate repository/storage policy before accumulating generations.

The first scene is a modest garage bay: floor, wall, soft overhead light, broad side light, restrained environment reflections. Rider, bike and their contact shadow dominate. No elaborate props, menus, particles or cinematic effects until the hero passes.

Required controls: orbit; face / full rider / bike / reference cameras; neutral / forward / back / transition playback; outfit switch when variants exist; neutral-light / garage-light comparison. Developer inspection may expose wireframe and maps. The product view has **one asset pipeline**, not a procedural-versus-modelled quality toggle. Missing hero assets show a clear load error rather than a misleading fallback person.

## 2. Lock the art brief before generating meshes

From target 01, record visible observations separately from design assumptions:

| Region | Identity we must retain |
|---|---|
| Face | Adult face; defined nose bridge and profile; strong brow; recessed eyes with real lids; cheek/jaw structure; beard and stubble variation; recognizable side profile |
| Hair | Dark brown, irregular tousled curls; visible strand groups and gaps; shaped temples and sideburns; uneven fringe and crown; no smooth helmet silhouette |
| Hoodie | Mustard cotton, substantial hood and ribbing, dropped fabric around torso, compression folds at elbows and waist, stitching and pocket construction |
| Jeans / shoes | Indigo denim with directional weave and seam wear; believable knee/hip folds; dark canvas trainers with separate rubber soles and laces |
| Hands | Gloves wrapped around grips; readable finger/thumb placement, wrist thickness and contact |
| Bike | Slim blue/white trials bodywork, gold fork tubes, black knobby tyres, thin spokes, convincing engine/exhaust, distinct structural assemblies |
| Pose | Seated neutral; feet on pegs; relaxed shoulders and elbows; forward rise and rearward hip shift visibly different |

Build a reference board with original image, face crop, hair crop, garment and mechanical details. The original face crop has limited information; agree an enlarged identity design before spending days on likeness. Existing generated turnarounds are proposals, not recovered truth.

Admit a front, profile and three-quarter head design as a consistent set. Check nose, jaw, eye spacing, ears, hairline and age against the original. Resolve contradictions once, then freeze the brief. Do not regenerate the person every iteration.

## 3. Choose the starting material deliberately

| Route | Role in this project | Decision |
|---|---|---|
| Licensed/CC0 anatomical base with clean topology | Provides usable eyes, mouth, ears, hands and body anatomy; sculpt it into the approved identity | **Preferred starting point**, after source/license and deformation inspection |
| Manual Blender sculpt from a simple base | Maximum control over identity and silhouette; requires actual character-art skill | Primary shaping method; no promise that script automation replaces sculpting |
| Neural image-to-mesh | May provide a useful shape or texture starting point | Optional bounded trial on an isolated head or garment; never generate rider + bike as one final mesh |
| Procedural tubes, lathes and implicit surfaces | Useful for fast mechanical repetition and rough layout | Not the facial, hair or cloth quality strategy |
| Experienced character artist | Can author likeness, groom, tailoring and deformation where autonomous tooling plateaus | Explicit production fallback; prepare a commission-ready asset brief rather than endless failed automation |

If trying neural generation, compare at most two candidate routes on the **same isolated subject**. Evaluate facial planes in clay, multiple angles, texture under changed light and repair effort. Reject fused hair/skin, painted eyes without structure, baked lighting, melted ears/hands or clothing fused to limbs. Keep only a candidate that saves meaningful sculpting time.

Examples worth evaluating, not installed or endorsed as proven here: [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) exports PBR assets; [Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) separates shape and texture generation. Neither repository's output claim establishes hero likeness or animation readiness. Check hardware support and the exact code/weights/output terms before choosing; open weights do not automatically mean unrestricted use. Do not assume their GPU workflows run on this Mac. No purchases, hosted jobs or paid services are initiated by this plan.

## 4. Face and hair quality — after whole-scene assembly review

### Face sculpt

Work on the head at useful portrait scale, with neutral diffuse material. Shape skull, jaw, cheek planes, nose, lips and chin before pores. Add separate eyes with corneal shape, iris depth, eyelid thickness, tear-line treatment and proper sockets. Sculpt ear anatomy and the neck transition. Match the approved front/profile/three-quarter design; introduce controlled asymmetry after the basic form is right.

Use Blender sculpt tools and reference overlays for artistic placement. Use Python for scene setup, versioned snapshots, camera matching and exports—not hundreds of guessed coordinates as a substitute for looking at the face.

Produce animation-suitable edge flow around eyes, mouth, jaw and neck. Retopology means rebuilding the dense sculpt as a mesh with deliberate loops for deformation. Keep the detailed sculpt for baking. Automatic remeshing/decimation alone is not a facial topology solution.

### Curly hair

Author a scalp and directional guide curves in Blender. First establish the overall silhouette and parting; then primary curl clumps, secondary breakup, fringe, sideburns and a few flyaways. Vary curl radius, length, phase and orientation intentionally. The ear and forehead boundaries must look grown, not glued on.

For the real-time version use a hybrid: limited solid geometry for silhouette-defining curls, plus carefully arranged hair cards for fine strands and breakup. A hair card is a narrow mesh with a strand/coverage texture; it is not one shell painted with hair lines. Bake authored strand groups into albedo/coverage, normal and directional data as supported by the chosen shader. Check front and rear lighting, dark and bright backgrounds, and orbit for exposed scalp and obvious flat strips.

Hair curves/grooms in Blender are authoring sources, not assumed portable runtime hair. Export evaluated meshes/cards explicitly. Start with stable alpha-tested coverage and measure edges/overdraw; add more complex transparency only if it visibly improves the result without sorting failures. Facial hair uses distinct stubble color/roughness plus sparse geometry where silhouette needs it.

### Face textures and light response

Paint skin color variation, beard distribution, lips, eyelids and ears using references. Separate base color from illumination. Sculpt/bake medium detail before adding pore-scale normal detail. Use distinct roughness for lips, skin and facial hair. Test eyes and skin under neutral and garage lighting; glossy plastic skin or painted-on eyes fail.

Do not assume Blender subsurface or complex node graphs export identically. Begin with a verified glTF-compatible material; only add a documented Three.js skin approximation if the simpler version demonstrably lacks the required response.

**Milestone A deliverable:** head + hair portrait in Three.js, original reference beside it, three-quarter orbit, and a relighting clip. If this does not look like the approved character, record the defect for targeted polish while continuing the complete rider/bike assembly. An attractive Blender-only render is insufficient.

## 5. Tailor the body, clothing and hands

Build on a believable anatomical body and useful rest pose. Construct real garment surfaces with seams, cuffs, hems, hood thickness and pocket placement. Cloth simulation can establish drape and compression, followed by sculpting; its raw result is not automatically production geometry.

Author folds where forces create them: hanging fabric below the hood, elbow compression, seat/hip contact, knee bends and ankle stacking. Avoid uniform procedural wrinkles and disconnected sleeve tubes. Check hoodie over body, trousers over legs and shoes around feet across all required poses.

Create a high-detail garment source and a clean deformable runtime mesh. UV unwrap with consistent texel density and place seams intentionally. Bake sculpt detail onto the runtime version with a controlled cage, then inspect seams and tangent-space normals in Three.js. Paint cotton/denim structure, stitch contrast and localized wear; do not bake a photographed or generated directional shadow into base color. [Blender baking documentation](https://docs.blender.org/manual/en/4.0/render/cycles/baking.html) describes the high-to-low detail transfer workflow.

Keep gloves and fingers anatomically shaped. Author the grip pose against the real handlebar diameter; assess thumb opposition, finger wrap and wrist angle from both sides. Make shoes sit on the pegs with believable soles rather than floating at an ankle coordinate.

Only after mustard Street passes, derive charcoal Street and open-face Street from the same approved person. Race clothing and helmet require their own tailoring and silhouette, then their two palettes. Five palettes are not five completed high-fidelity outfits.

## 6. Build the bike as a mechanical asset

Use the concept for visual design, and coherent mechanical references for hidden construction. Separate frame, swingarm, wheels, forks, steering, brakes, chain, engine, exhaust, body panels, seat and controls. Preserve functional clearances and correct axle/pivot placement. Do not retain impossible details merely because the AI image invented them.

Model large forms and bevels first. Use repeatable procedural tools for spokes, fasteners, tyre blocks, chain links and cable routing. Keep important silhouettes in geometry; bake smaller detail where it survives at the intended distance. Author rubber, painted plastic, coated metal, brushed/machined metal and seat fabric as different surfaces. Dirt and wear belong in plausible contact areas.

The high-detail bike and rider must fit each other: seat, pelvis contact, peg/sole, grip/palm and knee clearances are shared measurements. Validate this before finishing textures. The prototype initially presents one reference bike; other classes/designs come after this fit and appearance pass.

## 7. Rig for the actual requested motions

Do not inherit the current 19-bone rig as an unquestionable restriction. Assess whether clavicle, upper-arm twist, forearm twist, finger and facial controls are needed. Authoring controls may be richer than exported deform bones. Record rest transforms, coordinate conventions, sockets and the export mapping.

Author these poses on the actual bike, then the transitions between them:

1. **Neutral:** seated pelvis supported by the seat, relaxed shoulders, naturally bent elbows, feet on pegs.
2. **Forward:** pelvis rises from the seat; torso and weight move forward; elbows remain natural.
3. **Back:** pelvis visibly moves rearward; torso leans back; arms approach extension without locking or losing grip.
4. Compression, extension, landing absorption and return to neutral.
5. Grip release/crash transition as a later motion test, after normal riding reads correctly.

Use an animator-friendly control rig in Blender. Weight paint deliberately; inspect shoulder, elbow, hip and knee silhouettes through transitions. Where skinning loses volume or cloth folds incorrectly, author corrective shape keys (pose-dependent mesh adjustments). Blender drivers and IK constraints are not assumed to travel in a GLB: bake supported animation channels or implement an explicit runtime driver for corrective morph weights, then test the exported result. [Blender glTF documentation](https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html) is the export contract reference.

In the garage, author and play clips deterministically, with optional contact IK applied in a documented order. Inspect both sides and intermediate frames. No frame-by-frame manual pose substitution for recorded evidence.

For game integration, choose one authoritative mapping between physical body state and the approved pose family. Changing that family changes the limb mass distribution: update the shared physical mass map and renderer together. Do not simply enable additive clips that move the visible body away from its simulated mass, and do not bypass approved clips without replacing their movement quality. Test wheel response to the actual weight shift; a wheelie animation alone is not a physics fix.

## 8. Make the exported assets look right in Three.js

Use GLTFLoader with explicit texture/color-space handling, one color-management path and matched exposure. Validate each material after export; arbitrary Blender node graphs do not become equivalent Three.js shaders. Start with standard PBR and use physical-material features selectively—cloth sheen and coating response can help, but each adds cost. [Three.js documents those features and their performance tradeoff](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

Use a restrained environment map and large, motivated lights, stable contact shadows, sensible camera focal length and exposure. Compare neutral light before adding garage mood. Bloom, sharpening, depth of field and color grading must not hide missing anatomy or texture defects. Every review includes an effects-disabled view.

Mesh compression and KTX2 texture support belong in the runtime export stage; [GLTFLoader exposes the decoder integrations](https://threejs.org/docs/pages/GLTFLoader.html). Compare compressed assets visually before adopting them. Use actual material/shader support in the selected Three.js version, not a feature list from a different version.

## 9. Resource budgets: starting hypotheses, not acceptance badges

Initial garage target at 1920×1080: rider including clothes 80–120k triangles, hair 15–35k, bike 60–100k; simple room under 30k. Aim for at most 35 hero material draw calls. These are planning envelopes to revise from profiling, not claims that a triangle count produces PS4 quality.

Start with separate face, garment and bike texture sets; allow 4K face/detail sources for close inspection, then measure whether 2K runtime maps retain the required appearance. Keep a texture-memory ledger, including mipmaps and GPU format, rather than reporting compressed download size as memory use. Initial resident-texture target: ≤128 MiB for the desktop hero scene; leaner mobile tier to be measured.

Prototype performance target: p95 frame time ≤16.7ms over a 30-second scripted orbit/animation at the declared desktop configuration. Record GPU, browser, resolution, DPR, shader warmup and memory. The user-selected mobile garage target is 30 fps, measured on an actual iPhone/Safari at a declared internal resolution; reduce hair overdraw, texture residency and expensive shading based on measured costs. A desktop garage pass does not prove the game or iOS performance.

Create LODs after the approved high-detail asset. Preserve face/hair silhouette and pose deformation; review transitions in motion. Optimization must not erase the identity we just approved.

## 10. Milestones and stop rules

| Milestone | Deliverable | Acceptance evidence |
|---|---|---|
| 0. Brief and source choice | Frozen identity board, candidate provenance, simple garage/cameras | One consistent person and feasible asset route; no broad setup spree |
| A. Face + curly hair | Browser portrait, editable sculpt/groom, exported head | Side-by-side likeness review, orbit and relighting; no cap hair, toy face or painted eye shortcuts |
| B. Dressed rider + bike | One finished mustard outfit and fitted bike | Same-framing target comparison, closeups, full orbit, material separation and contact checks |
| C. Motion | Neutral/forward/back plus compression/landing transitions | Played clips show seated default, clear rise/rearward shift, natural elbows, sound deformation and contacts |
| D. Runtime proof | Compressed exports and desktop/mobile settings | Declared-device performance trace plus visual comparison to uncompressed/high-detail source |
| E. Five outfits | All approved designs on the same character | Every outfit shown in the same cameras and motion sequence; helmet preserves intended face visibility |
| F. Game integration | Explicit pose/physics contract and asset import | Cold boot, riding, crash/restart, deterministic replay, actual gameplay comparison and device testing |

These are milestones, not arbitrary percent-complete scores. Report which artifact passed and which is missing. A mesh that loads does not complete A; a static beauty frame does not complete C; a fast desktop orbit does not complete F.

At each art review select at most three **visible, named** defects and address them as one meaningful correction. After two attempts with no visible improvement, change the method or artist/source—not another scorecard. Do not impose an unrelated plugin's reconstruction loop on this Blender production workflow. Do not silently change that plugin's stopped run either.

The next major checkpoint is **the complete rider and bike together in the browser**, per the latest user direction. Review the whole before allocating more time to head, hair or beard polish. Preserve the weekly usage floor.

## 11. Practical staffing, effort and delivery

This is character art, grooming, technical animation and rendering work. A realistic planning allowance is several specialist working days for a compelling first hero, and potentially multiple weeks for likeness, five outfits, bike, animation and mobile polish. That is an estimate, not a promise or measured schedule. AI generation may shorten a starting stage but does not remove review, cleanup and deformation work.

Use one character artist/owner for identity, face, hair and garments; one mechanical asset owner for the bike; one technical artist for rig/export/material parity; one parent reviewer to judge the assembled result. Parallelize only after identity and fit are agreed. If autonomous Blender sculpting does not reach the head milestone, use a better licensed base or a human specialist with this same brief. Do not pretend more automation alone guarantees the target.

Final handoff contains editable packed Blender sources, source/texture licenses, rig and socket specification, high-detail and runtime exports, texture sources, deterministic export recipe, prototype source, versioned assets, and honest still/video/performance evidence. Publish a garage preview for sharing after its first visual milestone; label reference concepts separately from rendered assets.

## Immediate execution order

1. Freeze target01 face/hair identity and the seated/forward/back brief.
2. Create the minimal isolated garage and reference-matched cameras.
3. Select an editable anatomical base; optionally evaluate one bounded neural-mesh experiment.
4. Assemble the complete dressed rider and bike with the seated neutral clip; capture a real Three.js screenshot and orbit.
5. Improve proportions, contacts, clothing, face/hair and bike details from whole-scene review, then complete movement, optimization, variants and integration.

The requested result is not “we have a pipeline.” It is a rider and bike that survive close inspection, motion and comparison with the approved image.

### Round 3 verification

The unchanged existing game passes frozen-build headless WebKit cold boot, 1,038 byte-identical replay ticks to an 8.65s clear, crash and one-tick restart. See `prototypes/hero-garage/reports/round3-ship/report.json`. This does not accept the independent head study or count as game integration/iPhone evidence.

### Separate Hunyuan experiment; TRELLIS paused

Main production uses Blender and licensed authored assets without either neural pipeline. Hunyuan runs separately at the user's request; no generated output is admitted to the production catalog. TRELLIS remains paused with setup preserved and DINOv3 access pending repository-author approval. See the [experiment report](../../prototypes/hero-garage/reports/local-neural-preflight.md) for provenance, terms, runtime changes and measured outcomes.

### Round 6 verification and isolated experiment

The existing game again passes frozen WebKit cold boot, 1,038 byte-identical replay ticks to an 8.65s clear, crash and one-tick restart; see `prototypes/hero-garage/reports/round6-ship/report.json`. This does not accept the garage artwork or prove iPhone performance. Hunyuan separately generated a raw head in 75 seconds after a documented scheduler-port fix; raw orbit review rejected cut planes and fragmented hair. Painting is stopped after a bounded diagnosis found no reliable fix. It has not entered the main catalog.

### Round 9 technical verification

The frozen existing game passes WebKit cold boot, 1,038 byte-identical replay ticks to an 8.65s clear, crash and one-tick restart. Evidence: `prototypes/hero-garage/reports/round9-ship/report.json`. Portrait key-light shadows now fit asset bounds instead of using a six-metre region and 15mm normal offset. A same-asset orbit retains all art failures; this is a renderer correction, not milestone approval. Large-GLB capture now hashes the upstream bytes forwarded unchanged to WebKit, avoiding inspector-cache eviction.

### Round 17 — complete scene first

The user reaffirmed breadth before hair/beard polish. Those studies stay paused. A 14-file, 20,191,930-byte local runtime package contains the full current rider/bike, desktop/mobile textures and six clips. The recorded packaged WebKit run renders without errors and repeats the canvas byte-identically. Parent inspected sequential frames decoded from the real recording: complete assembly remains visible through orbit and landing motion; clothing, anatomy and detached-looking shadows remain provisional. This is no final-art, physics or iPhone-performance pass. Evidence: `prototypes/hero-garage/reports/whole-package-round17.json`. No new external source was adopted.

### Round 18 — coordinated rider and bike motion

The bike now articulates during the compression and landing clips instead of remaining rigid. A standalone garage driver solves chassis pitch, a 25 mm fork stroke and rear swingarm closure with stationary tyre contacts; the rider shares the chassis transform. Shock, chain and constant-length brake hose follow the existing exported pivots. Motion timing follows the rider clip keys. No production physics imports or changes were made.

Actual exported meshes pass 101 stroke samples with exact neutral restoration; 18 rider clip/time samples preserve existing grip/sole offset baselines. A WebKit sweep covers all 750 clip frames, with axle/hinge errors below 1 micrometre and no browser errors. Parent inspected sequential decoded frames of the recorded full-scene orbit: no gross detachment or assembly break is visible; rider deformation, clothing, shadow appearance and final motion quality remain provisional. Evidence: `reports/bike-fit-review.json`, `reports/suspension-browser-round18.json` and `reports/whole-suspension-round18.json` under the prototype. The 10-second recording's p95 is 25 ms (video enabled); it is not the 30-second performance gate.

The frozen round-18 game ship gate passes 1,038 identical ticks, 8.65-second clear and one-tick crash restart. This validates the frozen game only, not integration of the new prototype driver. Hair and beard remain paused.

### Round 19 — exported rig contract and source investigation

`reports/rig-contract.json` now captures actual GLB hashes, initial local transforms, inverse bind matrices, exported/runtime name mappings, sockets, clip channels and contact measurements across all 750 frames. Repeat generation is byte-identical. This supplies the current export contract while final rig quality and physical pose integration stay open. `reports/body-source-round19.json` records the bounded better-clothing search: official anonymous asset query returned 403; no candidate geometry was acquired or admitted. Hair/beard remain paused.

### Round 20 — GPU-compressed mobile textures

Mobile now uses KTX2/UASTC with complete mip chains, sRGB color and linear data maps, plus local Three.js Basis decoders and license. All 288 nonimage payloads remain byte-identical. Parent matched full-scene renders and decoded recorded orbit frames before provisional adoption. WebKit loads actual ASTC 4x4 textures; automatic mobile selection/touch/layout checks pass. Estimated all-image texture storage falls 34.76 → 8.69 MiB; asset download increases 6.41 → 7.44 MB. This does not close art approval, the 30-second desktop budget or actual iPhone validation. See `reports/ktx-round20-review.json` and `reports/mobile-ktx-ledger.json` in the prototype.

### Round 21 — saved face, curls and beard attached

At the user's explicit request, the full rider now uses the saved authored-groom head rather than the older cap-haired head. The exact prior head GLB is fitted at 0.9 scale and weighted to the existing head joint; the old head-weighted faces are removed. Body attributes and six clip payloads remain identical. Real Three.js full/portrait renders and forward-rise orbit show the combined assembly; no browser errors and deterministic canvas replay matches. Neck seams remain visible. The generated 173 MB asset is local and reproducible, not committed or deployed; previous mobile budgets are superseded for this appearance preview. See `art/full-rider-identity/README.md` and `reports/full-rider-identity.json`.

The earlier data-map rebake remains an unadopted candidate. Its UV check found 584 zero-area collar triangles; a collar repair probe was stopped when the user reprioritized identity. Frozen game ship gate passes 1,038 identical ticks, 8.65-second clear and one-tick restart (`reports/round21-ship/report.json`). No physical iPhone was connected. Final production acceptance remains open.

### Round 22 — rejected neck-fit trial

A bounded taper of the portrait shoulder edge below source Y1.590 preserved face/hair/beard/body attributes but did not visibly resolve the jagged pale neck patch. Parent rejected it after matched portraits and sequential decoded forward-rise frames; the prior assembly SHA `500990e54f6d3c7b5c413ef99e9292fa761e16a8712d71744eb6742a798bfd82` is restored in public and both local previews. Trial recipe and review are preserved. Correct next diagnosis is component-level old/new neck separation, not another broad taper.

### Round 23 — neck component attribution

A reversible false-color diagnostic replaced only the attached portrait skin material with green; geometry, motion and binary payload stayed identical. The pale jagged rear-neck patches remained pale in the matched portrait and sequential decoded forward-rise orbit frames. This isolates the defect away from the new portrait skin and points to retained original rider-neck surfaces. The production asset was untouched and the disposable preview restored byte-for-byte. Next work is source-face/UV identification of the old neck followed by targeted removal and collar review, not another portrait taper. Exact offending triangles remain unidentified. Evidence: `reports/neck-component-round23-review.json` under the prototype.

### Round 24 — residual old neck removed

Exact-position component analysis isolated 347 old-neck triangles surviving the head-weight threshold. Removing that remainder clears the pale overlays in the matched portrait and sampled forward-rise orbit. All 244 non-index accessor payloads, scene nodes, materials and six animation definitions stay identical; the saved face/curls/beard are unchanged. The active generated asset and both previews now use SHA `4ab4c5863ddc738c9254eca945e85ec7d6c0d0df1078d5a6b8d3c085db17bc11`. Collar shape/UVs remain visibly provisional. See `reports/neck-cleanup-round24-review.json` under the prototype.

The fresh frozen game ship gate passes cold boot, 1,038 byte-identical replay ticks, an 8.65-second clear, crash and one-tick restart with no browser errors (`reports/round24-ship/report.json`). This checks the frozen game, not production integration of the dense prototype identity.

### Round 25 — collar texture coordinates repaired

All 584 zero-area collar UV triangles now map inside an existing heavy-cotton atlas triangle, with explicit Blender-to-glTF V conversion. Duplicate vertices isolate the edit from neighboring garment UVs. Verified rendered triangle-corner positions, normals, joints and weights are identical; non-body accessor bytes and all six animations are unchanged. Matched portrait and decoded forward-rise orbit frames show reduced dark stretching. The corrected derivative is active in the catalog and both previews, SHA `67302f649eff8f536e17f99c55c15c673503bf3ccdf8e64f97ca87ec41d69e3c`. Per-triangle texture reuse is provisional; continuous unwrap, rough collar shape and seam remain open. See `reports/collar-uv-round25-review.json` in the prototype.
