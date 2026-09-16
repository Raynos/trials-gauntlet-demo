# First blockout geometry diagnostic

Initial generated source dd95eefe6e90ff8424918c5383e3c03ec059a232fb2a776ba5ff168b4a919bbb produced only 44 head and 36 hair vertices. SDF descriptors lacked local bounds, so a metre-scale default grid undersampled the centimetre-scale head. The standProud target also synthesized unit-radius rings despite metre-space SDF geometry.

Before any render, add bounded local SDF sampling volumes from existing ellipsoid extents with 8mm margin, and explicit metre-space cranium rings for clearance. No hair width increase or gate tolerance change. Repeat actual geometry measurement before rendering. Original failed report remains in harness/out/blender/img2-preview/scalp-blockout-01. No visual pass or correction acceptance claimed.
