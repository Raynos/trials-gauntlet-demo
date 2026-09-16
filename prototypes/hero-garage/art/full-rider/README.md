# Whole-rider pose pass

This is the breadth-first replacement animation family for the existing released Street rider. It does not change the hair, face, clothing geometry, UVs, or skeleton. The imported released texture bytes are identical and the 44,734-triangle mesh count is retained. Source GLB and source Blender file remain untouched.

Run from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/full-rider/build.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/full-rider/verify.py
```

- `sit_cruise` is seated from its first frame, not a standing-to-seated transition.
- `forward_attack` rises 125 mm and moves the pelvis 100 mm forward over 40 frames.
- `hang_back` shifts the pelvis 220 mm rearward with near-constant height over 40 frames.
- Every frame is solved before export; palm and sole attachment positions remain fixed. The corrected elbow pole points down and back with limited outward displacement. Neutral elbow is at (0.630, ±0.324, 0.887) m, below the shoulder and slightly above the grip, replacing the rejected high-elbow pass.
- Neutral pelvis height is 0.735 m in rear-axle coordinates. At the old 0.62 m, the rendered pelvis-weighted trouser underside penetrated bike bodywork by 110 mm. The revised minimum vertical gap is 0.6 mm. This is a conservative sampled geometric clearance, not proof of visually convincing seated support or full collision freedom.
- `reports/full-rider-pose.json` records seven mesh-clearance samples per clip and 60-frame reimported GLB contact checks. Both grips stay within 2 micrometres of bike socket targets at sampled exported frames; authored sole contacts remain 11 mm above peg centers.

Parent must judge actual Three.js recorded motion. No visual or final-production pass is asserted here. Source head quality, clothing deformation and bike fit can be polished after whole-scene review.
