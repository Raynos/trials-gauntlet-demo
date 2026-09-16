# Parent material evidence review

Inspected all five source crops and the whole-frame de-lighted candidate on 2026-09-15. Cotton/denim crops contain garment surfaces; skin crop contains visible cheek; glove and shoe crops include their small construction marks. The source supports palette and broad response only: 54×32 cotton, 52×27 denim, 20×16 skin/glove, 32×20 shoe. Upsampling these to512 does not add weave, pores or physical normal evidence.

Automatic finish classifications called cotton/denim/skin painted-metal. Rejected by direct visual evidence. Explicit reference-library assignments are fabric.woven-matte, fabric.woven-matte, skin.human, leather.matte, fabric.woven-matte respectively. Glove leather versus textile remains an inference; use matte dielectric behavior and revisit controlled renders. Registry resolution now reports proceed. Extractor scores0.781–0.86 are heuristic confidence, not measured material fidelity. Generated maps require controlled neutral/grazing rendering before acceptance; no microstructure claim from tiny source crops.

Whole-frame de-lighting0.6 reduces highlights but leaves strong under-chin/hood folds and contact shadows; report confidence0.588. This candidate is NOT accepted as finished albedo. Projection route is required for visible likeness, but camera remains an agent starting guess and bake_projected_texture emits only a descriptor. Actual head UV projection must follow shape/camera fit and another lighting-removal review. No geometry or material gate has passed on the strength of these files alone.

## Supplemental eye and lace evidence

See detail-reference-provenance.md, eye-pbr-report.json and thread-pbr-report.json. All nine visible material records now have reference evidence; hidden is a transparent structural utility. Smooth eye and matte lace response override implausible generic relief extraction. Neutral relighting acceptance remains pending.
