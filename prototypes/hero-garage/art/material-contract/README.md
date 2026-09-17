# Material and texture contract exporter

`tools/export-material-contract.mjs` reads the current catalog and its local GLBs,
including distinct mobile variants. It reports asset hashes, exact authored
material descriptors, effective core PBR defaults, alpha and double-sided state,
extensions, texture channel/color-space interpretation, samplers, image hashes
and header dimensions, plus active default-scene node/mesh/primitive usage.
Materials referenced by variants are recorded separately. Unused descriptors
remain visible with empty usage. Duplicate desktop/mobile URLs are inspected once.

From any working directory:

```sh
node /absolute/repo/prototypes/hero-garage/tools/export-material-contract.mjs
node /absolute/repo/prototypes/hero-garage/tools/export-material-contract.mjs --catalog /absolute/catalog.json --out /absolute/material-contract.json
```

Without `--out`, the report is written to `reports/material-contract.json` in
the prototype. Stdout contains only a concise path/count summary. No report is generated merely
by installing the tool. It never changes catalog, GLBs, images, materials or
runner settings. Output directories must already exist. Local absolute catalog
URLs resolve under the prototype public directory; relative ones resolve against
the catalog directory. Remote URLs are rejected.

Only Node.js built-ins are required. Packed Meshopt GLBs keep their material JSON
and image buffers readable without decoding geometry. The report identifies the
runtime MeshoptDecoder dependency for rendering and KTX2/Basis requirements where
present. A compressed image bufferView is explicitly rejected rather than read
as image bytes. Header inspection supports PNG, JPEG, KTX2 and extended WebP;
unsupported dimensions are marked unknown. No pixel decoder is loaded.

PBR factors and texture semantics describe glTF inputs, not final rendered color.
Default-scene reachability precedes viewer visibility overrides; lighting, tone
mapping, environment and custom runtime material edits are outside this report.
Extension descriptors are exact; unrecognized texture semantics remain unknown.
