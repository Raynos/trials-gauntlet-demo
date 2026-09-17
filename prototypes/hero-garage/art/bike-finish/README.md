# Stable bike finishes and static control geometry

Run Blender from repository root with `--python prototypes/hero-garage/art/bike-finish/build.py`. Editable source: `bike-finish.blend`; output `public/assets/street01-bike-finish.glb`. Then run `node --experimental-strip-types art/bike-finish/verify.mjs` from the prototype directory.

Sources are the protected original bike and accepted bike-detail source. Exact source material polygon correspondence replaces noisy frame/handlebar shading with stable satin metal and blue graphite paint. Swingarm retains its atlas albedo/logo, with stable roughness/metallic and no noisy normal contribution.

Only three static control cable tubes and two lever tubes are geometrically replaced. Original source paths, endpoint centers and radii are retained; curve sampling rises from3to10, radial sides from6to10–12. All other handlebar vertices, all other mesh positions, every transform and parent remain unchanged. The separately articulated brake hose and its metadata are untouched.

Mechanical verification covers101suspension strokes and18rider clip/time samples, including exact neutral reset. Rendered finish acceptance is parent-owned. New explicit materials target street01; no separate pro-variant art claim.
