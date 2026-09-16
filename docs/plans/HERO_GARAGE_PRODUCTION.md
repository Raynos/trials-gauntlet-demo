# High-fidelity rider and bike: fresh garage production plan

Status: Milestone A in progress, September 16, 2026. Main production uses local Blender and licensed authored assets, with no Hunyuan or TRELLIS dependency. The MPFB head has completed two corrections; parent orbit review still rejects hair, identity and beard variation. The exhausted Cortu hair source is being replaced with Daniel Bystedt’s authored Blender curl groom; alignment is corrected, but browser orbit rejects sparse crown coverage and wiry curl groups. Correction1 improves locks and density but the rear/right crown gap persists; correction2 investigates scalp penetration and silhouette. A separate Hunyuan experiment runs in parallel; TRELLIS work is paused. No visual milestone is accepted yet.

## Confirmed user decisions

- **Visual approval:** the user approves the identity board and each major visual milestone, but explicitly authorizes provisional parent approval and continued overnight work while asleep. Preserve the board and milestone evidence for final user review; do not label provisional review as final user acceptance.
- **Sources and spending:** start with free licensed assets and local Blender tools. Free personal-use/noncommercial assets are allowed for this personal laptop project; CC0 is not required. Record exact terms and keep restricted assets local where required. Ask before spending on assets, tools, hosted services or specialist work.
- **Usage floor:** stop sustained work at 20% weekly allowance remaining, replacing the older 30% floor in the handoff. Check account usage during the run.
- **Stalled likeness:** after two head-and-hair correction attempts with no visible improvement, change the free asset or method. Bring the user a concrete decision if still blocked.
- **Fixed design:** retain target 01's mustard hoodie, exposed face, tousled dark curls and blue/white bike, with seated neutral, forward rise and rearward hip shift. Develop missing angles while preserving that design, then submit the identity board for approval.
- **Mobile garage:** target 30 fps to preserve more detail, verified on an actual iPhone/Safari. This decision applies to the garage; gameplay performance requirements remain separate.

## Latest execution result

The independent viewer builds and its headless WebKit loading, deterministic canvas repeat, missing-file and touch-control checks pass. Generic-head and scan routes were rejected. MPFB correction2 improves beard fit and eye clarity but still fails the target curls, facial identity and beard variation in the [recorded parent review](../../prototypes/hero-garage/reports/parent-review-authored-a3.json). The Cortu hair correction loop is stopped. Daniel Bystedt’s Blender Hair Styles demo provides 303 authored guides and 22,418 evaluated strands under recorded CC BY-SA terms. Its first fit used a scalp height48mm too low; corrected alignment was verified against the evaluated head. The [first groom orbit](../../prototypes/hero-garage/reports/parent-review-groom-a1.json) still fails density, curl grouping and nape/fringe shape. Correction1 retains9,000 smooth evaluated strands and improves locks/side density, but the [second orbit](../../prototypes/hero-garage/reports/parent-review-groom-a2.json) still exposes crown gaps and an overly swept/wide silhouette. Correction2 investigates full-curve scalp penetration and retargeting; the1.152million-hair-triangle,50.1MB trial is explicitly outside runtime budgets. No body or outfit multiplication begins before Milestone A passes.

The user explicitly directed the main plan to proceed without waiting on neural models. Hunyuan remains a separate local experiment with no authority to change the main asset catalog or count as a production pass. TRELLIS setup is preserved but paused. All original body, bike, rig, variants, integration and device requirements remain open. The hourly heartbeat remains paused while the active goal runs. Last allowance check:29% remaining; floor20%. No spending or specialist contact has occurred.

## Status checklist (moved here from HERO_OPEN_WORK.md §4 — the one list for this milestone)

Start with one mustard-hoodie, bareheaded rider and one bike, using target 01. Do not expand to five outfits before the first character passes visual review.

- [x] Create the independent `prototypes/hero-garage/` Three.js viewer with fixed comparison cameras and a simple garage lighting setup. TypeScript/build and frozen-build WebKit load/orbit/error/touch smoke checks pass; visual acceptance remains separate.
- [ ] Establish the recognizable face and tousled curly hair in the actual browser first: anatomy, eyes/lids, jaw, ears, beard and authored curl clumps.
- [ ] Build the dressed body: tailored hoodie and jeans, convincing folds/seams, hands and footwear, coherent proportions.
- [ ] Finish the hero bike's silhouette, mechanical details and materials at the same viewing scale.
- [ ] Produce editable Blender sources, retopologized meshes, UVs, baked/painted textures, rig and corrective deformation; export verified runtime GLBs.
- [ ] Prove orbit quality and animation, then measure load cost, rendering and memory against the production plan's budgets.
- [ ] After the first hero is accepted, derive the remaining outfits and integrate with the game's physical pose system.

**Pipeline clarification:** current game assets are real Blender-exported GLBs, many authored through Python; the old procedural fallback/toggle remains. The separate img2threejs reconstruction experiment never shipped and is stopped. A Blender file or high triangle count does not by itself create high-fidelity character art. The new route requires deliberate sculpting, grooming, clothing, texturing and deformation review. Image-to-mesh may provide raw material, but is not the acceptance criterion.

**Done when:** the browser-rendered hero convincingly matches the reference's identity, hair, clothing and bike design at comparable framing, also holds up from other angles and in motion, and meets the agreed runtime budgets. An AI mockup, procedural stand-in or larger screenshot is not completion. Use the staged acceptance gates in the production plan.

## The decision

Build a standalone Three.js garage prototype around **one excellent rider and one excellent bike**. Start with the mustard hoodie, exposed face and tousled curly hair from [target 01](../../assets/design/hero-targets/01-street-barehead.png). Establish convincing character art in the actual browser before expanding to the other four outfits or integrating the game.

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

## 4. Make the face and hair first—the decisive milestone

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

**Milestone A deliverable:** head + hair portrait in Three.js, original reference beside it, three-quarter orbit, and a relighting clip. If this does not look like the approved character, stop body/outfit multiplication. Fix the art route or use specialist help. An attractive Blender-only render is insufficient.

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

The first major checkpoint is **the head and hair in the browser**. If we cannot make those convincing, state that plainly before creating an entire cast. We should not spend down the weekly usage floor to manufacture activity.

## 11. Practical staffing, effort and delivery

This is character art, grooming, technical animation and rendering work. A realistic planning allowance is several specialist working days for a compelling first hero, and potentially multiple weeks for likeness, five outfits, bike, animation and mobile polish. That is an estimate, not a promise or measured schedule. AI generation may shorten a starting stage but does not remove review, cleanup and deformation work.

Use one character artist/owner for identity, face, hair and garments; one mechanical asset owner for the bike; one technical artist for rig/export/material parity; one parent reviewer to judge the assembled result. Parallelize only after identity and fit are agreed. If autonomous Blender sculpting does not reach the head milestone, use a better licensed base or a human specialist with this same brief. Do not pretend more automation alone guarantees the target.

Final handoff contains editable packed Blender sources, source/texture licenses, rig and socket specification, high-detail and runtime exports, texture sources, deterministic export recipe, prototype source, versioned assets, and honest still/video/performance evidence. Publish a garage preview for sharing after its first visual milestone; label reference concepts separately from rendered assets.

## Immediate execution order

1. Freeze target01 face/hair identity and the seated/forward/back brief.
2. Create the minimal isolated garage and reference-matched cameras.
3. Select an editable anatomical base; optionally evaluate one bounded neural-mesh experiment.
4. Sculpt and groom **only the head first**, export it, and review it in Three.js.
5. Proceed through dressed rider/bike, movement, optimization and variants only when that visual foundation is convincing.

The requested result is not “we have a pipeline.” It is a rider and bike that survive close inspection, motion and comparison with the approved image.

### Round 3 verification

The unchanged existing game passes frozen-build headless WebKit cold boot, 1,038 byte-identical replay ticks to an 8.65s clear, crash and one-tick restart. See `prototypes/hero-garage/reports/round3-ship/report.json`. This does not accept the independent head study or count as game integration/iPhone evidence.

### Separate Hunyuan experiment; TRELLIS paused

Main production uses Blender and licensed authored assets without either neural pipeline. Hunyuan runs separately at the user's request; no generated output is admitted to the production catalog. TRELLIS remains paused with setup preserved and DINOv3 access pending repository-author approval. See the [experiment report](../../prototypes/hero-garage/reports/local-neural-preflight.md) for provenance, terms, runtime changes and measured outcomes.

### Round 6 verification and isolated experiment

The existing game again passes frozen WebKit cold boot, 1,038 byte-identical replay ticks to an 8.65s clear, crash and one-tick restart; see `prototypes/hero-garage/reports/round6-ship/report.json`. This does not accept the garage artwork or prove iPhone performance. Hunyuan separately generated a raw head in 75 seconds after a documented scheduler-port fix; raw orbit review rejected cut planes and fragmented hair. Painting is stopped after a bounded diagnosis found no reliable fix. It has not entered the main catalog.
