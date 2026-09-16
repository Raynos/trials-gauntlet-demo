# Connected neckline reconstruction

The source garment's main neckline is an open chain of 146 edges, with front endpoints 10.15 mm apart. It was not a closed collar that smoothing could repair.

This candidate extends those actual garment edges through two attached strips to a smaller anatomical neck opening. Every original rim edge now has a second incident face. The 292 new quads add 584 triangles; the local weld removes one degenerate source triangle, for a net increase of 583 triangles; no new material or overlay shell is introduced. The front seam remains open and is explicitly not a watertight garment pass. The new exposed boundary has 150 edges: 146 around the inner opening and four along the two open strip ends.

Outer weights remain authored; inner weights are 70% chest and 30% neck. Adjacent rim UV texels extend across the added strips, preserving source texture bytes. Shoulder appearance and collar fit still require recorded Three.js review. Head, seat fit, skeleton and six clips are preserved.

Run `build.py` then `verify.py` with Blender from the repository root. Verification samples all 750 exported frames for contacts, loop endpoints and prior pelvis clearance checks. The existing approximately 0.05 mm rearward-shift grazing remains disclosed. The topology check proves attached reconstruction of the rim, not visual acceptance or closure of every garment opening.
