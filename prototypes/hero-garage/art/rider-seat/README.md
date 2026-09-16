# Seated support correction

Input is frozen motionGLB `f9cb8e7…`. Protected inputs and bike are untouched. No skeleton/action changes.

The earlier0.6mm minimum ray clearance did not prove seated support: a grid over the saddle found centerline gaps33–45mm at x0.30–0.38m, and side gaps62–119mm. The minimum occurred elsewhere. This correction extends205existing denim underside vertices toward the actual saddle using inverse linear skin matrices, smoothly tapered across the glute region. Maximum change75mm; this is a meaningful garment volume correction whose appearance requires review.

Centerline grid gaps now3.54mm,2.00mm,2.76mm at x0.30,0.34,0.38m. Side support is improved but remains uneven; no perfect seated-anatomy claim. All750exported frames retain grip/sole contacts below0.01mm and exact loop endpoints. Vertical bodywork clearance is positive in five clips; rear shift grazes by0.0496mm at the worst sample. Report this as a measured tiny penetration, not a zero-penetration pass. The check covers pelvis-weighted trouser underside, not every garment triangle/body collision.

Reproduce from repository root with Blender: `build.py`, `verify.py`, `inspect_candidate.py`. Baseline and candidate saddle grids are preserved under this directory; report includes every exported frame. Same triangle count and exact source texture bytes. No hair/face work.
