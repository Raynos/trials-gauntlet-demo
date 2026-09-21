# Played Race sleeve diagnosis (open)

The retained source entering this investigation is preserved in `source-before.ts.txt` with its SHA-256. All candidates below replayed the Pro lean-transition input through tick 416, rendering the full prefix. Frame 0 is input tick 404 (3.367 s), matching the previously rejected Race frame 55. No physics changed. These are diagnostic comparisons, not visual acceptance.

- `/tmp/trials-sleeve-neck-spine`: extending skin-weight smoothing through neck/spine boundaries did not remove the visible pits. Rejected.
- `/tmp/trials-sleeve-surface`, `surface2`, `surface3`: bounded Taubin smoothing of the riding clone's sleeve surface did not reliably remove the pits. The first iteration rebuilt normals into normalized Int8 storage and produced black sleeves; subsequent candidates use Float32 normal computation. All rejected.
- `/tmp/trials-sleeve-laplace`, `laplace35`: stronger Laplacian smoothing (12 mm then 35 mm displacement cap) distorted the surface without a convincing fix. Rejected; the final failed source is preserved in `rejected-surface-smoothing.ts.txt`.
- `/tmp/trials-sleeve-no-normal`, `no-maps`, `flat`: removing normal detail, then baked AO, then albedo still leaves pits on the arm. This rules out a texture-only fix. Diagnostic material mutations were reverted.

`surface.ts` reconstructs the actual recorded tick 404 and compares triangle face normals with skin-transformed vertex normals. The compressed before/neck-spine JSON files retain the measurements. Opposing normals occur at several shoulder seams but are not by themselves proof that the visible pit is there. Projected candidate points near the pit also include nearly rigid upper-arm weights (98–99%), so weight noise alone is not established as the cause. `components.ts` confirms that the upper-arm garment is part of a connected torso mesh, rather than detached decorative pieces.

Next diagnostic: a controlled arm-roll comparison with unchanged joint positions, before further surface edits. The current sleeveSkin.ts is restored to the entering source.

A final radial-normal shell-removal probe (`/tmp/trials-sleeve-shell`) also failed to improve the played pit. It is preserved as `rejected-shell-probe.ts.txt` and reverted. This was only a coarse diagnostic, not proof that shell intersections are absent: the source needs reliable inner/outer shell identification before such a repair is viable. No index removal is retained.
