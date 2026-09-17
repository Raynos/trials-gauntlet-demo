# Front mudguard contour refinement

Only the exposed blue front mudguard region of `fork_lower` changes. Its authored circular arc is sampled at 29 longitudinal rings instead of eight, retaining the same 12-vertex cross section, radial thickness, taper formula and exact start/end rings. The long visible arc now has smaller geometric steps without moving a suspension or wheel attachment.

Run `build.py` using Blender from repository root, then `node --experimental-strip-types art/bike-contours/verify.mjs` from the prototype directory. The packed editable source is `bike-contours-source.blend`; export uses the accepted bike-paint PNG files and original polygon assignments for all logos and body panels.

Build assertions check exact preservation of every surviving lower-fork vertex, both fender end rings, all other geometry, hierarchy and transforms. Mechanical verification covers 101 suspension samples, exact neutral reset and six rider clips at start/middle/end. Parent must compare recorded bike-camera orbits and compression, especially the fender silhouette and tyre clearance.
