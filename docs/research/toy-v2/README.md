# Toy planar model used to check the v2 design claims

`toy-v2.ts.txt` (rename to `.ts` and run with `npx tsx` from the repo root) is a ~250-line planar model:
chassis rigid body, two massless wheels on suspension springs against flat ground, wheel spin DOFs with a
slip-stiffness tyre, a rigid **rider body** (75 kg, 9 kg m²) driven to a lean-dependent pose target by a
force/torque-capped servo (internal pairs), and the declared attitude torque `K_att`. Explicit Euler at
1920 Hz sub-steps; it is a check of the physics, not the design's solver.

Runs (each file is the raw stdout):

- `run2-servo-only.md` — no attitude torque (`K_att` 0), thrust constant to 14 m/s: shows the pure-servo
  air response is dominated by the COM translation (lean −1 gives −21 deg), which is why §9.4 of the design
  exists; hop ordering already correct.
- `run3-katt260.md` — `K_att` 260, thrust 0.62 W constant: too much authority (lean ≤ −0.25 loops at full gas
  within 0.8 s; lean 0 at 3.5 s).
- `run4-design-params.md` — **the design's parameters except engine and brakes** (`F_peak` 780 N with the falling curve, `K_att` 180,
  `c_att` 20, pose table shifted +0.08 m, `F_max` 2600 N, springs 8500 / 0.26 m). This is the run quoted in
  `docs/plans/physics-v2.md` §9.5, §10 and §14.

Rows: T0 static COM geometry per lean; T1 full throttle from rest per lean; T2 snap-forward from a wheelie;
T3 lean step on the ground; T4 stationary hop sweeps (preload, snap speed, throttle through the snap, snap
magnitude); T6 full brake from 10 m/s; T5 air control 0.5 s.
- `run5-fpeak880-brake650.md` — run 4 with the §13 table's engine (`F_peak` 880 N, plateau to 8 m/s) and a
  650 Nm / 60-40 brake: neutral full gas becomes a 58 deg self-limiting wheelie (adopted as the design's
  stated behaviour, §10); the brake stoppied at neutral, so §8/§13 were revised to 560 Nm / 55-45.
