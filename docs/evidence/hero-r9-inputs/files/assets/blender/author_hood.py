"""Isolated folded hood studies from the promoted Street source; never publishes.

Only the original 112-vertex hood component is replaced. The connected shoulder/
elbow shell, other meshes, rig, sockets, actions and material graphs are invariants.
The replacement is a sewn double cloth surface with a recessed opening, rolled
rim, tapering crown and a narrow center fold. It is not a remesh of the rider.
Run with Blender -b --python-exit-code 1 --python assets/blender/author_hood.py --
  --source assets/blender/source/rider-street.blend
  --output harness/out/blender/r5-hood/street-compact-v1.blend --variant compact
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

sys.path.insert(0, str(Path(__file__).resolve().parent))
import author_garments as garment


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=list).encode()).hexdigest()


def mesh_signature(ob, indices=None):
    indices = set(range(len(ob.data.vertices))) if indices is None else set(indices)
    order = {i: j for j, i in enumerate(sorted(indices))}
    return digest(dict(
        vertices=[(list(v.co), [(g.group, g.weight) for g in v.groups])
                  for v in ob.data.vertices if v.index in indices],
        faces=[([order[i] for i in p.vertices], p.material_index, p.use_smooth)
               for p in ob.data.polygons if all(i in indices for i in p.vertices)],
        groups=[g.name for g in ob.vertex_groups],
        materials=[m.name if m else None for m in ob.data.materials]))


def hood_ids(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    groups = garment.components(bm)
    marked = bm.verts.layers.int.get("author_hood")
    if marked:
        ids = {v.index for v in bm.verts if v[marked]}
    else:
        original = [c for c in groups if len(c) == 112]
        if len(original) != 1 or sorted(map(len, groups)) != [112, 976]:
            raise RuntimeError("Expected promoted 976-vertex shoulder/elbow shell and original 112-vertex hood")
        ids = {v.index for v in original[0]}
    bm.free()
    return ids


def replace_hood(ob, arm, variant):
    ids = hood_ids(ob)
    origin = arm.data.bones["neck"].head_local.copy()
    up = (arm.data.bones["chest"].tail_local - arm.data.bones["chest"].head_local).normalized()
    front = Vector((up.z, 0, -up.x))
    side = Vector((0, 1, 0))
    def world(x, y, z):
        return origin + front * x + side * y + up * z
    # Raycast the retained upper back at each profile point. This follows its
    # authored curvature without changing it or transferring weights by proximity.
    torso_faces = [list(p.vertices) for p in ob.data.polygons if not any(i in ids for i in p.vertices)]
    tree = BVHTree.FromPolygons([v.co for v in ob.data.vertices], torso_faces)
    def back(y, z):
        hit, _, _, _ = tree.ray_cast(world(-.5, y, z), front, 1.)
        if hit is None:
            raise RuntimeError(f"Hood profile outside upper back: y={y}, z={z}")
        return (hit - origin).dot(front)

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    layer = bm.verts.layers.deform.verify()
    region = bm.verts.layers.int.get("author_hood") or bm.verts.layers.int.new("author_hood")
    material = next(p.material_index for p in ob.data.polygons if all(i in ids for i in p.vertices))
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in ids], context="VERTS")
    chest = ob.vertex_groups["chest"].index
    # z, lateral half-width, depth behind retained torso. Deliberate narrow support
    # rings at the mouth create a folded edge, not a large rounded collar.
    profiles = [(-.002, .123, .053), (-.009, .129, .057), (-.027, .132, .049),
                (-.064, .125, .041), (-.113, .102, .034), (-.151, .068, .024),
                (-.174, .022, .010)]
    if variant == "draped":
        profiles = [(z * 1.30 - .002, w * .94, d * .86) for z, w, d in profiles]
    n = 28
    points = []
    def make(x, y, z):
        vertex = bm.verts.new(world(x, y, z))
        vertex[region] = 1
        garment.write_weights(vertex, layer, {chest: 1.})
        points.append((x, y, z))
        return vertex
    def face(vertices, smooth=True):
        f = bm.faces.new(vertices)
        f.material_index = material
        f.smooth = smooth
        return f
    surfaces = []
    for inner in (False, True):
        rings = []
        for ring_index, (z0, width, depth) in enumerate(profiles):
            ring = []
            for i in range(n):
                a = i * math.tau / n
                s, c = math.sin(a), math.cos(a)
                # Flatten the front/back into cloth panels with angular side folds.
                y = width * s
                z = z0 + (.016 if ring_index < 3 else .007 if ring_index < len(profiles) - 1 else 0.) * c
                gap = .0045
                if inner:
                    y *= .975
                    z += .0028 if ring_index > 1 else -.0022
                x = back(y, z) - gap - depth * (1 - c) / 2
                # A narrow seam ridge along the rear center, tapering at the crown.
                ridge = .0025 * max(0, -c) * max(0, 1 - abs(s) / .23)
                x -= ridge
                if inner:
                    x += .0027 * (-c)
                ring.append(make(x, y, z))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i + 1) % n
                face([a[i], a[j], b[j], b[i]])
        # A small planar crown seam closes the two panels instead of a round pole.
        face(list(reversed(rings[-1])), False)
        surfaces.append(rings)
    for i in range(n):
        j = (i + 1) % n
        face([surfaces[0][0][i], surfaces[1][0][i], surfaces[1][0][j], surfaces[0][0][j]])
    new_faces = [f for f in bm.faces if all(v[region] for v in f.verts)]
    bmesh.ops.recalc_face_normals(bm, faces=new_faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    ob["heroHoodStudy"] = f"{variant}: doubled cloth pocket, recessed mouth, rolled rim and central crown fold"
    return dict(variant=variant, profiles=profiles, thickness_m=.0027,
                bounds_local=dict(min=[min(p[k] for p in points) for k in range(3)],
                                  max=[max(p[k] for p in points) for k in range(3)]))


def triangles(ob):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    faces = [(tuple(t.vertices), t.polygon_index) for t in mesh.loop_triangles]
    evaluated.to_mesh_clear()
    return points, faces


def crossing_pairs(first, second, same=False, details=False):
    a, af = first
    b, bf = second
    at = BVHTree.FromPolygons(a, [f[0] for f in af], all_triangles=True)
    bt = at if same else BVHTree.FromPolygons(b, [f[0] for f in bf], all_triangles=True)
    pairs = set()
    for i, j in at.overlap(bt):
        ia, ib = af[i][0], bf[j][0]
        if same and (i >= j or set(ia) & set(ib)):
            continue
        for points, one, target, two in ((a, ia, b, ib), (b, ib, a, ia)):
            crossed = False
            for k in range(3):
                start, end = points[one[k]], points[one[(k + 1) % 3]]
                direction = end - start
                if direction.length_squared < 1e-16:
                    continue
                hit = intersect_ray_tri(target[two[0]], target[two[1]], target[two[2]], direction, start, True)
                if hit is not None and 1e-6 < (hit - start).dot(direction) / direction.length_squared < 1 - 1e-6:
                    pairs.add(tuple(sorted((af[i][1], bf[j][1]))) if same else (af[i][1], bf[j][1]))
                    crossed = True
                    break
            if crossed:
                break
    return sorted(pairs) if details else len(pairs)


def pose_stats(ob, ids):
    points, faces = triangles(ob)
    hood = points, [(f, p) for f, p in faces if all(v in ids for v in f)]
    torso = points, [(f, p) for f, p in faces if not any(v in ids for v in f)]
    stats = {"self": crossing_pairs(hood, hood, True), "torso": crossing_pairs(hood, torso)}
    areas = [(points[f[1]] - points[f[0]]).cross(points[f[2]] - points[f[0]]).length / 2 for f, _ in hood[1]]
    stats.update(degenerate_triangles=sum(a < 1e-12 for a in areas), minimum_triangle_area=min(areas),
                 finite=all(math.isfinite(c) for i in ids for c in points[i]))
    for name in ("rider:skin", "rider:helmet", "rider:armour", "rider:cotton_laces"):
        stats[name] = crossing_pairs(hood, triangles(bpy.data.objects[name]))
    return stats


def audit(ob, arm, poses=None, authored=True):
    ids = hood_ids(ob)
    garment.pipeline.clear_pose(arm)
    bpy.context.view_layer.update()
    rest = pose_stats(ob, ids)
    rows = []
    actions = [strip.action for track in arm.animation_data.nla_tracks for strip in track.strips if strip.action]
    for action in sorted(actions, key=lambda a: a.name) if authored else []:
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        lo, hi = map(int, action.frame_range)
        worst = {}
        for frame in range(lo, hi + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            stats = pose_stats(ob, ids)
            for key, value in stats.items():
                if key not in worst or (value < worst[key]["value"] if key in ("minimum_triangle_area", "finite") else value > worst[key]["value"]):
                    worst[key] = dict(value=value, frame=frame)
        rows.append(dict(action=action.name, frame_range=[lo, hi], frames=hi-lo+1, worst=worst))
        print(json.dumps(rows[-1]), flush=True)
    measured = []
    if poses:
        # D is an armature-space deformation matrix, derived from actual exported
        # rest and runtime bone world transforms, with global chest motion removed.
        for index, sample in enumerate(poses["poses"]):
            garment.pipeline.clear_pose(arm)
            desired = {bone.name: Matrix(sample["deform"][bone.name]) @ bone.matrix_local for bone in arm.data.bones}
            for bone in arm.data.bones:
                if arm.pose.bones[bone.name].constraints or bone.inherit_scale != "FULL":
                    raise RuntimeError("Pose reconstruction requires unconstrained full-inheritance bones")
                basis = bone.matrix_local.inverted()
                if bone.parent:
                    basis = basis @ bone.parent.matrix_local @ desired[bone.parent.name].inverted()
                arm.pose.bones[bone.name].matrix_basis = basis @ desired[bone.name]
            bpy.context.view_layer.update()
            error = max(abs(arm.pose.bones[name].matrix[i][j] - target[i][j])
                        for name, target in desired.items() for i in range(4) for j in range(4))
            if error > 2e-6:
                raise RuntimeError(f"Runtime pose reconstruction error {error}; audit does not represent the measured pose")
            measured.append(dict(input=sample["input"], tick=sample["tick"], bike=sample["bike"],
                                 matrix_reconstruction_max_absolute_error=error, stats=pose_stats(ob, ids)))
            if (index + 1) % 250 == 0:
                print(f"Measured game pose {index+1}/{len(poses['poses'])}", flush=True)
    garment.pipeline.clear_pose(arm)
    return dict(rest=rest, actions=rows, measured_game_poses=measured,
                method="BVH broad phase + bidirectional triangle-edge segment intersections. Nonadjacent polygon pairs; excludes shared vertices and parallel/coplanar pairs. Counts surface crossings, not signed volume containment or visual acceptance.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--variant", choices=("compact", "draped"), default="compact")
    parser.add_argument("--game-poses", type=Path)
    parser.add_argument("--skip-baseline", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source, output = args.source.resolve(), args.output.resolve()
    allowed = Path(__file__).resolve().parents[2] / "harness/out/blender/r5-hood"
    if not output.is_relative_to(allowed) or output == source or output.exists():
        raise RuntimeError("Choose a fresh ignored r5-hood candidate, never a protected source")
    source_sha = garment.sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    arm, ob = bpy.data.objects["rider_rig"], bpy.data.objects["rider:hoodie"]
    if bpy.context.scene.get("heroOutfit") != "street":
        raise RuntimeError("This isolated study requires the promoted Street source")
    garment.pipeline.check_source(arm, [o for o in bpy.data.objects if o.type == "MESH"])
    garment.pipeline.clear_pose(arm)
    invariant = garment.invariant_signature()
    other_meshes = {o.name: mesh_signature(o) for o in bpy.data.objects if o.type == "MESH" and o != ob}
    preserved = mesh_signature(ob, set(range(len(ob.data.vertices))) - hood_ids(ob))
    poses = json.loads(args.game_poses.read_text()) if args.game_poses else None
    baseline = None if args.skip_baseline else audit(ob, arm, poses)
    before = garment.topology(ob.data)
    edit = replace_hood(ob, arm, args.variant)
    after = garment.topology(ob.data)
    if after["degenerate_faces"] or after["nonmanifold_interior_edges"]:
        raise RuntimeError(f"Invalid topology: {after}")
    candidate = audit(ob, arm, poses)
    if preserved != mesh_signature(ob, set(range(len(ob.data.vertices))) - hood_ids(ob)):
        raise RuntimeError("Promoted torso/shoulder/elbow component changed")
    if other_meshes != {o.name: mesh_signature(o) for o in bpy.data.objects if o.type == "MESH" and o != ob}:
        raise RuntimeError("An unrelated mesh changed")
    if garment.invariant_signature() != invariant:
        raise RuntimeError("Rig, actions, sockets or material graphs changed")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    if garment.sha(source) != source_sha:
        raise RuntimeError("Protected source bytes changed")
    report = dict(source=str(source), source_sha256=source_sha, candidate=str(output), candidate_sha256=garment.sha(output),
                  script_sha256=garment.sha(__file__), edit=edit, topology_before=before, topology_after=after,
                  baseline=baseline, candidate_audit=candidate, preserved_component_sha256=preserved,
                  other_meshes_sha256=other_meshes, exact_rig_actions_sockets_materials=True,
                  game_poses_sha256=garment.sha(args.game_poses) if args.game_poses else None)
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print("CANDIDATE", output, flush=True)


if __name__ == "__main__":
    main()
