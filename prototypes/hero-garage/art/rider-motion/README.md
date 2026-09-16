# Whole-rider motion breadth pass

Input is frozen `street01-rider-cloth.glb`. Source geometry, UVs, materials, rig and existing three actions are preserved. Three new 150-frame clips at 30 fps add compression, extension and landing absorption. All start and end in seated neutral, with a standing preparation so compression happens above the seat.

- Compression: raise 135 mm, compress 80 mm, recover and sit.
- Extension: raise 135 mm, extend another 90 mm, recover and sit.
- Landing absorption: raise, extend to 225 mm above neutral, absorb 180 mm, recover and sit.

These are rider performance clips on a stationary bike, not a simulated impact or suspension animation. Grip and sole markers stay on their authored bike targets. Every exported frame is checked: 750 frames across six clips. Loop endpoints match exactly. Each of 450 new frames also checks vertical clearance from pelvis-weighted trouser underside to actual bike bodywork. Minimum 0.620 mm occurs in seated neutral. This is not a full-body collision test.

Run `build.py` and `verify.py` with Blender in background from repository root. `reports/rider-motion.json` contains every-frame measurements, hashes and preservation checks. No visual acceptance is inferred; parent reviews recorded Three.js motion.
