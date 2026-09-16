# Authored head correction 2 — frozen for parent review

The second correction addresses the parent's three visible defects from the completed a2 orbit. It is not acceptance. Prior a2 recipe, source, GLB and report are retained under ignored `attempts/a2/` with SHA256SUMS.

- Removed the inferred hair normal after parent relighting showed broad mottled plates. Removed the ambiguously labeled beard normals too. The runtime has no normalTexture entries. Original diffuse/coverage remains authored source data; hair roughness/specular is restrained. **The Cortu mesh and atlas still contain broad, mostly flat strand panels. Material changes cannot supply the missing irregular curl-group geometry.** This source limitation should be judged candidly and not sent through another endless correction cycle.
- Both beard meshes retain their authored UVs/strand textures, but an editable Shrinkwrap modifier now fits them to the actual evaluated morphed face with 1mm offset. Verification measures every evaluated beard vertex against the face BVH: all are within 1.00011mm, removing the projecting beard shell. Brown-tinted source coverage uses BLEND at 0.58 alpha with backfaces culled, so skin shows through. The source lip opening remains; no facial coordinates were sculpted or guessed. BLEND introduces a sorting question that must be checked in the played orbit, not passed from a source still.
- Reduced the overshooting nose-depth/Greek/down-tip morphs. Increased authored brow forward/down and eye recession modestly. Removed the separate heavy eyelash sheet while retaining authored eyelids and separate iris/sclera geometry.

`verify_correction2.py` checks the actual packed source's evaluated beard fit and final GLB: six meshes; no separate lashes; no inferred normals; both beard materials single-sided BLEND with explicit alpha 0.58. It writes measurements and the final GLB hash to `reports/authored-head-build.json`.

No catalog, viewer, plan or game files were changed. Grinsegold licensing remains a local-personal-use trial with unresolved CC-BY pack versus embedded AGPL metadata; do not infer public publishing clearance.
