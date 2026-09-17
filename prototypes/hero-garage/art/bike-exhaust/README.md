# Tempered warm-steel exhaust

Material-only candidate on the accepted contour bike. The original bronze header region (386 polygons) receives a quiet spatial temper gradient from darker, rougher metal near the engine port to neutral warm steel around the collector. There is no procedural noise or rainbow coloration. Linear base-color stops and roughness values are recorded in `reports/bike-exhaust-build.json`.

Every geometry coordinate, polygon, UV, hierarchy and transform is asserted unchanged. The silencer, heat shield, endpoints, wheels and contact points are not edited. Accepted blue/white paint texture file hashes remain identical.

Run `build.py` with Blender from repository root, then `node --experimental-strip-types art/bike-exhaust/verify.mjs` from the prototype directory. Editable procedural source: `bike-exhaust-source.blend`. The candidate is `street01-bike-exhaust.glb`.

Parent should compare neutral and garage bike-camera views and recorded orbit, judging reduced gold dominance while retaining a readable metallic highlight. Mechanical checks cover 101 suspension samples and all six rider clips at start/middle/end; they are not aesthetic approval.
