# Bike numberboard and clamp correction

Candidate for parent motion review; not automatically adopted.

The original triple-clamp boxes put their 250 mm dimension along the forward direction rather than across the fork tubes. They pierced the numberboard. This pass rotates each disconnected clamp shell 90 degrees around its own fork axis centre, preserving its position and all structural joints. It retains the original numberboard depth, tapers its bottom by 13%, and adds two rubber-isolated mounts with recessed metal fasteners. Hardware is joined to `fork_upper` and follows existing articulation.

Run from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python prototypes/hero-garage/art/bike-detail/build.py
cd prototypes/hero-garage
node --experimental-strip-types art/bike-detail/verify.mjs
```

The packed editable source is `bike-detail.blend`. Sources remain byte-identical; original vertices outside the board and two clamp shells remain unchanged. The exported GLB is mechanically checked over 101 stroke samples and all six rider clips at start/middle/end. This does not substitute for rendered motion review or physical simulation validation.
