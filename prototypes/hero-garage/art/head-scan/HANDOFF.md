# Correction 1 — source seam split failed to establish open eyes

September 16, 2026. Builder does not claim art acceptance. Parent must judge browser orbit. This is the one deliberate changed-source correction; further guessed parameter loops are not recommended.

`inspect_source_lids.py` renders the actual unmodified scan front and maps an atlas-traced eyelid crease to source vertices. `source-lid-landmarks.json` records exact atlas pixels, vertex IDs, mapped coordinates, and UV errors. Source diagnostic image is `source-lids-front.png`. This is inspection evidence, not a posed acceptance artifact.

`correct_lids.py` follows actual source mesh edges between these crease landmarks by a UV-distance-weighted graph path. It splits 17 left / 19 right seam edges, preserves every original source face and UV, then lifts original upper-lid vertices with a local falloff while lowering lower lids slightly. Separate recessed eyes use centers and radii measured from the seam's coordinates; no ellipse-cut face deletion or ellipsoid skin patch was used. Full measurements are in the build report. Original crease coordinates and the copy-side diagnostic are preserved separately.

**Still unresolved:** the authoring render (`corrected-lids-front.png`) retains a closed-lid appearance above exposed eye fragments. Merely splitting/lifting the scanned crease did not establish proper upper/lower surfaces and globe coverage. No eyelid thickness, tear-line, corneal geometry, retopology, or accepted socket anatomy is claimed. The source has a different identity from target01. Nose/jaw identity was intentionally not distorted while eye correctness remains unresolved.

Hair now has 655 raised, wavy cards following the actual scalp, rather than 225 flat cards. Source scalp vertex color alpha fades the root region and smooth-shaded normals replace faceted coverage shading. The actual rendered strand atlas is retained. **Still unresolved:** broad ribbon-like clumps and scalp boundaries remain apparent in authoring diagnosis; this is not an accepted tousled curl groom. Atlas normal/directional maps remain absent.

Current runtime export: 43,936 triangles, 9 primitives, 2,203,452 bytes. SHA-256: `8aac5801e2a311375777ba1477549cba9c1c754c575b8043cf433453efd50f1b`. Packed editable blend and repeatable source recipe are retained. Parent may capture this exact candidate for failure evidence. Previous candidate and source originals remain preserved as described below.

Recommended next decision if parent confirms failure: a character artist repairs the scan with deliberate retopology/sculpt and authored groom, or obtains a textured anatomical base with real open eyelid topology and compatible licensed groom. Neither the present scan nor the rejected generic mesh proves autonomous high-fidelity art capability. Do not build clothing/variants atop this failure or mislabel technical export as Milestone A.

---

# Changed scan route — failed first art trial, builder handoff

Parent reviewed an eight-second orbit of the initial BLEND export (`dd31672e14b66a444afec2eb7a81ebf38640dc3f54e0f6016245d3972583260f`) and failed Milestone A. Skin/anatomy is more credible than rejected generic-head route, but eyes protrude below still-visible closed lids, hair is a hard jagged dark cap and identity is different. Do not report a pass. Public asset is now MASK version `30e3f723c82ff2aface272cc5b9265345149450555525e727cf0cbe75c294169`; this changes alpha coverage only, so it does not repair the eyelids or cap silhouette.

## Source / reconstruction of current trial

`build_scan.py` imports the actual CC-BY Lee Perry-Smith GLB, applies object transforms, scales full mesh height to 0.44m, places minimum Z 1.355m / maximum Z 1.795m, shifts X +0.013m. Forward is−Y in Blender and+Z in GLB. UV V is flipped for native Blender sampling of the supplied JPEG maps. The packed Blender contains original scan color and tangent-normal maps; normal strength 0.42, constant skin roughness 0.53. No displacement application, retopology or texture bake is claimed. The scan's identity has not been sculpted into target01.

`inspect_geometry.py` measured coordinates near approximate color-atlas eyelid markers. This was inadequate as an anatomical eye-center measurement. UV probes before native-V correction `(0.432,0.305)` and `(0.545,0.305)` averaged nearby mesh-loop positions `(-0.04554,-0.10239,1.66558)` and `(0.01716,-0.10345,1.66448)` respectively, before X+0.013 shift. The build then used eye centers `(-0.0325,-0.1025,1.665)` and `(0.0305,-0.1035,1.665)`. These are estimates, not accepted socket landmarks. Parent orbit showed their vertical placement is below the real closed lids.

The failed aperture algorithm removes triangles by face-centroid ellipse around those estimates (halfwidth 0.0118m, halfheight 0.0037m, Y<−0.087), removing 607 faces. It does not identify a lid edge loop, move actual upper/lower lid boundaries, or reconstruct eyelid thickness. The source closed lids therefore remain visible above the added eyes. Added sclera are scaled spheres centered at estimated Y+0.005 with scales(0.0125,0.010,0.0075); iris front is Y−0.0052, pupil Y−0.0060. Those protrude and do not create a credible opened socket. **Do not tune these guessed constants again.** Inspect actual source eyelid topology and silhouettes, isolate real lid seams, and rebuild/deform a deliberate open-eye aperture with matched lid curvature before placing eyeballs. Preserve an unmodified scan source for comparison.

## Hair facts

The scalp undercoverage is a direct scan subset offset 0.0014m, currently dark opaque material. Region: Z>1.726 when Y<−0.05 (front), otherwise Z>1.635; excludes abs(X)>0.085 and Z<1.686 near ears. Boundary follows source triangles and is visibly jagged. Parent sees the cap as dominant, not hidden beneath convincing hair. Do not call it finished hair.

225 broad cards follow BVH nearest-surface paths, 8 quads each, widths 0.012–0.022m, lengths 0.053–0.09m. Their atlas `hair-strand-atlas.png` is genuinely rendered from 135 editable emissive Blender strand curves in `hair-strand-atlas.blend`, 512×1024 RGBA. This contains multiple thin strands with substantial transparency. Root-guide curves remain editable in `street01-head-scan.blend`. Although method differs from previous tube field, card coverage/silhouette remains insufficient to hide cap and read tousled curls.

Blender authoring material is DITHERED with texture alpha connected. Blender exports that as BLEND. The deterministic final GLB step changes only this material toMASK cutoff 0.25, preserving all other scene bytes/meshes. Parent's first clip was BLEND; MASK clip still needs review. Current runtime 28,961 triangles, 9 primitives,1.88MB. No hair normal/direction maps yet.

## Preserved artifacts

Editable `art/street01-head-scan.blend`, runtime `public/assets/street01-head-scan.glb`, source recipe and rendered atlas in this folder. `reports/head-scan-build.json` gives counts/hash/limitations. Ignored `art/head/attempts/scan01-*` preserves current MASK GLB, blend and report; `attempt01-hashes.json` records hashes. Source originals and exact CC-BY license/provenance remain in `art/sources/alternates/lee-perry-smith/`. Earlier generic-head studies are separately preserved and rejected; do not return to coordinate-tuning that head.
