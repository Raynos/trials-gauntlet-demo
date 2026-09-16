# Street mustard — reference analysis

Reference: `../01-street-barehead.png`, OpenAI-generated target concept, not a photograph or an implemented game screenshot. Inspected at native 1672 × 941 resolution on 2026-09-15. Intended result: realistically proportioned, animated Three.js rider matching the approved concept, retaining playable contact and the existing bike physics contract. No acceptance of low-poly or chibi substitution is inferred.

## 1. Identification

One adult humanoid rider is the reconstruction subject (character domain, identification confidence 0.99). Inventory: exposed head and neck, dark hair and beard, hooded long-sleeve top, exposed distal forearms, two gloves, jeans, two shoes. The motorcycle is a separate articulated object and contact reference. Crowd, warehouse, HUD and banners are context, excluded from rider geometry and comparison masks.

## 2. Form and silhouette

Organic bilateral anatomy in an asymmetric projected riding pose. The near-side head occupies approximately x=694–803, y=132–239; clothing/body including hands and shoes occupies approximately x=603–949, y=193–650. These are image observations, not inferred physical dimensions. Head has a rounded cranial volume, projecting nose, defined jaw and a separate hair silhouette. Torso slopes forward; upper arms extend forward/down into bent elbows; forearms lead into the grips. Thighs run forward from the seat, shins drop toward the pegs. Hoodie has a broader lower ribcage/hem silhouette than the waist below it. Jeans narrow toward the ankle. Use continuous lofted/deformed surfaces for skin and clothing, not visible capsule junctions.

The seated foreshortened view cannot measure standing head count. Approximately 7.5 heads is an explicit realistic-proportion design assumption, to be checked against bike contact and the reference pose, never represented as image measurement.

## 3. Macro → meso → micro

- Head: cranial/face shell → brow, sockets, nose, cheek, lips, jaw, ears → eyelid rim, nostrils, lip division, beard transition. Hair: scalp-bound shell → overlapping swept masses → directional surface relief; no alpha-card stand-in.
- Top: connected torso and sleeves → dropped hood, sleeve roll/cuffs, waistband, front pouch → seam relief, drawstrings, elbow compression, diagonal tension folds, worn fold edges.
- Arms/hands: anatomical forearms and gloves → palm, thumb, four grouped-but-separated fingers wrapped around grips → glove knuckle panels, stitching and material changes.
- Bottom: joined jeans pelvis and legs → waistband, crotch, pockets, knee panels, ankle stack → double seams, denim weave, localized faded folds.
- Shoes: upper and sole → tongue, toe cap, heel and lacing → eyelets, lace crossings, two sole bands and contact wear.

## 4. Attachment relationships

Head joins neck; neck is embedded inside the collar. Hood overlaps the upper back and collar, not the skull. Sleeve cuff overlaps the proximal exposed forearm. Gloves overlap wrists; fingers curl around bike grips with thumb opposition. Jeans waistband sits under the top hem. Jeans cuffs overlap shoe uppers. Shoe soles contact foot pegs; pelvis contacts the saddle region. Far limbs must be mirrored in object space then posed, not rotated copies of the near silhouette. Frame, seat, pegs and grips supply separate measured runtime sockets. Clothing follows the same skeleton with shared boundary weights so joints cannot open during lean, hop or crash playback.

## 5. Material observations and inferred PBR

Hoodie shows broad diffuse highlights and small fabric relief; infer opaque cotton, dielectric metalness 0, roughness initially 0.8–0.95. Denim has visible directional weave and faded raised folds; infer dielectric roughness 0.75–0.9. Skin has smoother highlights than cloth; infer dielectric roughness 0.45–0.65 with restrained subsurface response, not metallic. Gloves are dark matte/satin with separate knuckle accents; infer textile/leather, roughness 0.55–0.85. Shoes have matte fabric uppers and lighter rubber soles; roughness 0.75–0.95. These are initialization ranges, not recovered physical measurements. Image shadows must not become albedo or false recess geometry. Verified material crops and de-lighting precede reference projection.

## 6. Color and finish

Top: mid-value yellow-orange/mustard with lower-value folds, low-gloss finish. Jeans: low-value desaturated blue, lighter blue-grey seam/fold regions. Hair and beard: low-value brown with warmer highlights. Skin: warm mid-value complexion; variation around beard/cheek. Gloves: near-black with grey patches. Shoes: charcoal upper, light-grey laces, off-white sole bands. Fixed clothing palette is independent of Rookie/Pro bike selection.

## 7. Identity-defining checks

Critical: (1) visible bare face with proportionate hair/head, (2) dropped hood plus mustard top and rolled cuffs, (3) continuous fitted denim legs and high-top shoes, (4) hands on grips and feet on pegs through motion, (5) readable forward riding silhouette at the actual game camera. Important: beard/hair framing, pouch/drawstrings, shoe sole/lacing construction. Each must receive component/material entries and its own review; a high whole-frame similarity score cannot excuse a missing face or detached hands.

## 8. Uncertainty and suitability

**Conditional: maximum reference likeness**, per the user's explicit realistic AAA target and approval of this concept. This full image is scene context, not a clean isolated object measurement. Use an explicit rider mask/crops and preserve source coordinates for comparison. Far-side face, back of head, back of garment, interior cloth, far hand/fingers and far shoe are hidden or partly occluded. Facial pixels support major volumes but not exact pore/iris reconstruction. Unseen design is inferred and must be reviewed in an orbit; no exact likeness or photogrammetric claim. Bike wheelbase/scale and standing anatomy come from the game/authoring contract, not invented pixel-to-meter conversion. Read character contracts before deciding what additional isolated reference evidence is required. This verdict alone does not pass deterministic admission or authorize geometry generation.

## Consumer and finish gate

The five approved designs are five independent selectable presets, initially three proposed geometry families (barehead, open-face, Race), subject to silhouette review. An open-face helmet requires real geometry. Each material preset must retain its appearance when switching bikes. Required final evidence: actual gameplay clips for all five, full/LOD verification, lean/hop/crash/restart and attachment checks, deterministic replay, and mobile performance/device evidence. The current baseline's passing tests do not prove these future requirements.
