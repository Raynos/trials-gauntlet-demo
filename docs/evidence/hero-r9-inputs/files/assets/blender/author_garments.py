"""Surgical connected-armhole candidate from a protected authored rider source.

Does not invoke the seed builder or publish any source/export. Example:
  Blender -b --python-exit-code 1 --python assets/blender/author_garments.py -- \
    --source assets/blender/source/rider-street.blend \
    --output harness/out/blender/connected-garments/rider-street.blend

The existing ring layout is a precondition, checked before editing.
Race material-separated sleeve pieces are rejoined along exact shared seam vertices. Distal sleeves, hood,
rig, sockets, actions and procedural material graphs are retained. The new garment shell
has two 18-edge armholes, two intermediate shoulder loops per side and four intentional
openings (hem, neck, cuffs). No remeshing, boolean, reseeding or weight transfer is used.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rider_asset as pipeline


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def components(bm):
    seen, result = set(), []
    for vertex in bm.verts:
        if vertex in seen:
            continue
        group, todo = {vertex}, [vertex]
        seen.add(vertex)
        while todo:
            current = todo.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other not in seen:
                    seen.add(other)
                    group.add(other)
                    todo.append(other)
        result.append(group)
    return result


def topology(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    groups = components(bm)
    boundaries = [e for e in bm.edges if e.is_boundary]
    boundary_vertices = {v for e in boundaries for v in e.verts}
    loops = []
    while boundary_vertices:
        todo = [boundary_vertices.pop()]
        loop = set(todo)
        while todo:
            v = todo.pop()
            for e in v.link_edges:
                if e.is_boundary:
                    other = e.other_vert(v)
                    if other in boundary_vertices:
                        boundary_vertices.remove(other)
                        loop.add(other)
                        todo.append(other)
        loops.append(len(loop))
    report = dict(vertices=len(bm.verts), faces=len(bm.faces),
                  components=sorted(len(c) for c in groups),
                  boundary_edges=len(boundaries), boundary_loops=sorted(loops),
                  nonmanifold_interior_edges=sum(not e.is_manifold and not e.is_boundary for e in bm.edges),
                  degenerate_faces=sum(f.calc_area() < 1e-12 for f in bm.faces),
                  minimum_face_area=min(f.calc_area() for f in bm.faces))
    bm.free()
    return report


def boundary_cycle(vertices):
    vertices = set(vertices)
    first = min(vertices, key=lambda v: v.index)
    sequence, current, previous = [], first, None
    while not sequence or current is not first:
        sequence.append(current)
        neighbors = sorted((e.other_vert(current) for e in current.link_edges
                            if e.is_boundary and e.other_vert(current) in vertices), key=lambda v: v.index)
        if len(neighbors) != 2:
            raise RuntimeError(f"Expected a simple boundary; vertex {current.index} has {len(neighbors)} neighbors")
        next_vertex = neighbors[0] if neighbors[0] is not previous else neighbors[1]
        previous, current = current, next_vertex
        if len(sequence) > len(vertices):
            raise RuntimeError("Armhole loop did not close")
    if len(sequence) != len(vertices):
        raise RuntimeError("Armhole boundary contains multiple cycles")
    return sequence


def blend_weights(a, b, weight):
    values = {key: a.get(key, 0) * (1 - weight) + b.get(key, 0) * weight for key in set(a) | set(b)}
    values = sorted(((key, value) for key, value in values.items() if value > 1e-8), key=lambda item: (-item[1], item[0]))[:4]
    total = sum(value for _, value in values)
    return {key: value / total for key, value in values}


def write_weights(vertex, layer, weights):
    target = vertex[layer]
    for group in list(target.keys()):
        del target[group]
    for group, weight in weights.items():
        target[group] = weight


def connect_sleeves(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    layer = bm.verts.layers.deform.verify()
    region = bm.verts.layers.int.new("author_armhole")
    bm.verts.ensure_lookup_table()
    all_components = components(bm)
    torsos = [c for c in all_components if len(c) == 240]
    sleeves = [c for c in all_components if len(c) == 342]
    if len(torsos) != 1 or len(sleeves) != 2:
        raise RuntimeError("Expected existing 10×24 torso and two 19×18 sleeve rings; source changed, inspect before adapting")
    torso = sorted(torsos[0], key=lambda v: v.index)
    torso_ring = {v: i // 24 for i, v in enumerate(torso)}
    torso_angle = {v: i % 24 for i, v in enumerate(torso)}
    bm.normal_update()
    original_normals = {v: v.normal.copy() for v in bm.verts}
    bridges = []
    # Open cloth endings: the solid end caps were buried inside the rider/boots.
    remove = {face for face in bm.faces if len(face.verts) == 24 and all(v in torso_ring for v in face.verts)}
    for comp in sleeves:
        sleeve = sorted(comp, key=lambda v: v.index)
        rings = {v: i // 18 for i, v in enumerate(sleeve)}
        trim = 3
        side = -1 if sum(v.co.y for v in sleeve) < 0 else 1
        center = 12 if side < 0 else 0
        angles = [(center - 3 + i) % 24 for i in range(7)]
        # Rectangular 3×6-face hole: perimeter = 2*(3+6) = 18 edges.
        hole_faces = set()
        for r in range(5, 8):
            for k in range(6):
                corners = {torso[r * 24 + angles[k]], torso[r * 24 + angles[k + 1]],
                           torso[(r + 1) * 24 + angles[k]], torso[(r + 1) * 24 + angles[k + 1]]}
                matches = [face for face in bm.faces if set(face.verts) == corners]
                if len(matches) != 1:
                    raise RuntimeError("Torso quad ring topology changed; refusing a guessed cut")
                hole_faces.add(matches[0])
        boundary = {v for face in hole_faces for v in face.verts
                    if torso_ring[v] in (5, 8) or torso_angle[v] in (angles[0], angles[-1])}
        root = set(sleeve[trim * 18:(trim + 1) * 18])
        material = next(face.material_index for face in bm.faces if all(v in comp for v in face.verts)
                        and min(rings[v] for v in face.verts) == trim)
        remove |= hole_faces
        remove |= {face for face in bm.faces if all(v in comp for v in face.verts)
                   and (max(rings[v] for v in face.verts) <= trim and min(rings[v] for v in face.verts) < trim
                        or len(face.verts) == 18)}
        bridges.append((side, boundary, root, material))
    bmesh.ops.delete(bm, geom=list(remove), context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    edits = []
    for side, boundary, root, material in bridges:
        a, b = boundary_cycle(boundary), boundary_cycle(root)
        if len(a) != 18 or len(b) != 18:
            raise RuntimeError("Armholes must have 18 edges")
        options = []
        for reverse in (False, True):
            ordered = list(reversed(b)) if reverse else b
            for offset in range(18):
                candidate = ordered[offset:] + ordered[:offset]
                options.append((sum((v.co - w.co).length_squared for v, w in zip(a, candidate)), candidate))
        _, b = min(options, key=lambda item: item[0])
        old_weights = [dict(v[layer]) for v in a]
        arm_weights = [dict(v[layer]) for v in b]
        # A small arm contribution at the seam plus two graded shoulder loops distributes
        # rotation over the cap, instead of a chest-only seam meeting a rigid upper arm.
        for i, vertex in enumerate(a):
            vertex[region] = 1
            b[i][region] = 1
            write_weights(vertex, layer, blend_weights(old_weights[i], arm_weights[i], .15))
            # Spread the seam influence one torso edge outward; otherwise a single weighted
            # boundary meets a chest-only ring and creates a visible shoulder crease.
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor not in boundary and neighbor in torso_ring:
                    write_weights(neighbor, layer, blend_weights(dict(neighbor[layer]), arm_weights[i], .025))
        rings = [a]
        for alpha in (1 / 3, 2 / 3):
            ring = []
            for i, (v, w) in enumerate(zip(a, b)):
                # The 10 mm convex cap keeps the armhole bridge from forming a straight
                # ruled-surface hollow. Skin influence changes monotonically across the three strips.
                bulge = original_normals[v] * (.010 * math.sin(math.pi * alpha))
                vertex = bm.verts.new(v.co.lerp(w.co, alpha) + bulge)
                vertex[region] = 1
                write_weights(vertex, layer, blend_weights(old_weights[i], arm_weights[i], .15 + .85 * alpha))
                ring.append(vertex)
            rings.append(ring)
        rings.append(b)
        for start, end in zip(rings, rings[1:]):
            for i in range(18):
                j = (i + 1) % 18
                face = bm.faces.new([start[i], start[j], end[j], end[i]])
                face.material_index = material
                face.smooth = True
        edits.append(dict(side="L" if side < 0 else "R", armhole_edges=18, intermediate_loops=2,
                          removed_sleeve_rings=3, longest_bridge=(max((v.co - w.co).length for v, w in zip(a, b)))))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    ob["heroTopology"] = "Connected armholes: retained torso/distal sleeve rings with two graded 18-vertex shoulder loops"
    return edits


def pose_audit(ob, arm):
    """Sample every authored action at native key-frame cadence; measure every evaluated
    face area and edge stretch. These are degeneration witnesses, not an aesthetic verdict."""
    reference_edges = [(edge.vertices[:], (ob.data.vertices[edge.vertices[0]].co - ob.data.vertices[edge.vertices[1]].co).length)
                       for edge in ob.data.edges]
    actions = [strip.action for track in arm.animation_data.nla_tracks for strip in track.strips if strip.action]
    region = ob.data.attributes.get("author_armhole")
    region_vertices = {i for i, item in enumerate(region.data) if item.value} if region else set()
    result = []
    for action in sorted(actions, key=lambda action: action.name):
        arm.animation_data.action = action
        if hasattr(action, "slots") and len(action.slots):
            arm.animation_data.action_slot = action.slots[0]
        lo, hi = map(int, action.frame_range)
        minimum_area, maximum_stretch, minimum_edge_ratio = math.inf, 0, math.inf
        degenerate, nonfinite, samples = 0, 0, 0
        shoulder_maximum_stretch, shoulder_minimum_ratio = 0, math.inf
        for frame in range(lo, hi + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            minimum_area = min(minimum_area, *(p.area for p in mesh.polygons))
            degenerate += sum(p.area < 1e-12 for p in mesh.polygons)
            nonfinite += sum(not all(math.isfinite(x) for x in v.co) for v in mesh.vertices)
            for (a, b), rest_length in reference_edges:
                if rest_length <= 1e-9:
                    continue
                ratio = (mesh.vertices[a].co - mesh.vertices[b].co).length / rest_length
                maximum_stretch = max(maximum_stretch, ratio)
                minimum_edge_ratio = min(minimum_edge_ratio, ratio)
                if a in region_vertices and b in region_vertices:
                    shoulder_maximum_stretch = max(shoulder_maximum_stretch, ratio)
                    shoulder_minimum_ratio = min(shoulder_minimum_ratio, ratio)
            evaluated.to_mesh_clear()
            samples += 1
        result.append(dict(action=action.name, samples=samples, min_face_area=minimum_area,
                           degenerate_face_samples=degenerate, nonfinite_vertex_samples=nonfinite,
                           max_edge_stretch=maximum_stretch, min_edge_ratio=minimum_edge_ratio,
                           armhole_max_edge_stretch=shoulder_maximum_stretch if region else None,
                           armhole_min_edge_ratio=shoulder_minimum_ratio if region else None))
    pipeline.clear_pose(arm)
    return result


def triangle_crossings(mesh, labels):
    """Count nonadjacent triangle surface crossings (not broadphase AABB overlaps).
    Coplanar overlaps and pairs sharing vertices are excluded; this is a conservative
    diagnostic of distinct surface penetration, not a proof of no self-intersections.
    """
    mesh.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    vertices = [v.co.copy() for v in mesh.vertices]
    region = mesh.attributes.get("author_armhole")
    marked = {i for i, item in enumerate(region.data) if item.value} if region else set()
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0)
    pairs, shoulder_pairs, shoulder_other_part = set(), set(), set()
    for i, j in tree.overlap(tree):
        if i >= j or set(triangles[i]) & set(triangles[j]):
            continue
        a, b = triangles[i], triangles[j]
        intersects = False
        for one, two in ((a, b), (b, a)):
            for k in range(3):
                start, end = vertices[one[k]], vertices[one[(k + 1) % 3]]
                direction = end - start
                if direction.length_squared < 1e-16:
                    continue
                hit = intersect_ray_tri(vertices[two[0]], vertices[two[1]], vertices[two[2]], direction, start, True)
                if hit is not None and 1e-6 < (hit - start).dot(direction) / direction.length_squared < 1 - 1e-6:
                    intersects = True
                    break
            if intersects:
                break
        if intersects:
            pair = tuple(sorted((mesh.loop_triangles[i].polygon_index, mesh.loop_triangles[j].polygon_index)))
            pairs.add(pair)
            if marked & (set(a) | set(b)):
                if labels[a[0]] == labels[b[0]]:
                    shoulder_pairs.add(pair)
                else:
                    shoulder_other_part.add(pair)
    return len(pairs), len(shoulder_pairs) if region else None, len(shoulder_other_part) if region else None


def crossing_audit(ob, arm):
    # Keep the existing hood's overlapping fabric separate from a self-crossing armhole.
    # Both remain in the total; the distinction is reported rather than hidden.
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    labels = {v.index: index for index, group in enumerate(components(bm)) for v in group}
    bm.free()
    actions = [strip.action for track in arm.animation_data.nla_tracks for strip in track.strips if strip.action]
    rows = []
    for action in sorted(actions, key=lambda action: action.name):
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        lo, hi = map(int, action.frame_range)
        frames = sorted(set(range(lo, hi + 1, 5)) | {hi})
        total, shoulder, other = dict(pairs=-1, frame=0), dict(pairs=-1, frame=0), dict(pairs=-1, frame=0)
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            count, armhole, other_part = triangle_crossings(mesh, labels)
            evaluated.to_mesh_clear()
            if count > total["pairs"]:
                total = dict(pairs=count, frame=frame)
            if armhole is not None and armhole > shoulder["pairs"]:
                shoulder = dict(pairs=armhole, frame=frame)
            if other_part is not None and other_part > other["pairs"]:
                other = dict(pairs=other_part, frame=frame)
        rows.append(dict(action=action.name, sampled_frames=frames, worst_all=total,
                         worst_armhole=shoulder if shoulder["pairs"] >= 0 else None,
                         worst_armhole_other_component=other if other["pairs"] >= 0 else None))
    pipeline.clear_pose(arm)
    return rows


def invariant_signature():
    def convert(value):
        if isinstance(value, (int, float, str, bool)) or value is None:
            return value
        try:
            return list(value)
        except TypeError:
            return str(value)
    arm = bpy.data.objects["rider_rig"]
    return dict(bones=[(b.name, list(b.head_local), list(b.tail_local), list(b.matrix_local)) for b in arm.data.bones],
                sockets=[(o.name, o.parent.name if o.parent else None, o.parent_bone, [list(row) for row in o.matrix_local])
                         for o in bpy.data.objects if o.type == "EMPTY"],
                actions=[(a.name, a.as_pointer()) for a in bpy.data.actions],
                materials=[(m.name, [(n.name, n.bl_idname, [(s.name, convert(s.default_value)) for s in n.inputs if hasattr(s, "default_value")]) for n in m.node_tree.nodes],
                            [(link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name) for link in m.node_tree.links])
                           for m in bpy.data.materials if m.node_tree])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source, output = args.source.resolve(), args.output.resolve()
    allowed = Path(__file__).resolve().parents[2] / "harness/out/blender/connected-garments"
    if not output.is_relative_to(allowed) or source == output:
        raise RuntimeError("Candidate output must be under ignored harness/out/blender/connected-garments and distinct from source")
    if output.exists():
        raise RuntimeError("Candidate exists; choose a fresh filename for review history")
    source_hash = sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    arm = bpy.data.objects["rider_rig"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    pipeline.check_source(arm, meshes)
    pipeline.clear_pose(arm)
    outfit = bpy.context.scene.get("heroOutfit")
    signature = invariant_signature()
    if outfit == "street":
        ob = bpy.data.objects["rider:hoodie"]
    elif outfit == "race":
        # Source material separation duplicated the shared upper/lower sleeve vertices.
        # Join only these three authored parts and weld their coincident seam vertices;
        # no remesh/nearest-surface approximation or new materials are involved.
        parts = [bpy.data.objects[name] for name in ("rider:bodycloth", "rider:sleeve_upper", "rider:sleeve_lower")]
        bpy.ops.object.select_all(action="DESELECT")
        for part in parts:
            part.select_set(True)
        ob = parts[0]
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
        ob.name = "rider:upper-garment"
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        initial_vertices = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
        if initial_vertices - len(bm.verts) != 36:
            raise RuntimeError("Expected exactly two 18-vertex material seams in race sleeves")
        bm.to_mesh(ob.data)
        bm.free()
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    else:
        raise RuntimeError("Source must declare street or race outfit")
    before = topology(ob.data)
    baseline_animation = pose_audit(ob, arm)
    baseline_crossings = crossing_audit(ob, arm)
    edits = connect_sleeves(ob)
    after = topology(ob.data)
    if after["nonmanifold_interior_edges"] or after["degenerate_faces"]:
        raise RuntimeError(f"Invalid candidate topology: {after}")
    if len(after["components"]) != len(before["components"]) - 2:
        raise RuntimeError("Torso and both sleeves must become one component")
    pipeline.check_source(arm, meshes)
    animation = pose_audit(ob, arm)
    crossings = crossing_audit(ob, arm)
    if signature != invariant_signature():
        raise RuntimeError("Protected bones/sockets/actions/material graphs changed")
    if any(row["degenerate_face_samples"] or row["nonfinite_vertex_samples"] for row in animation):
        raise RuntimeError("Authored animation produced degenerate or nonfinite geometry")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene["heroCandidateNote"] = "Connected armhole prototype; pending parent motion judgment. Protected source unchanged."
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    if sha(source) != source_hash:
        raise RuntimeError("Protected source bytes changed")
    report = dict(outfit=outfit, source=str(source), source_sha256=source_hash, source_unchanged=True,
                  candidate=str(output), candidate_sha256=sha(output), script_sha256=sha(__file__),
                  before=before, after=after, edits=edits, animation=animation,
                  baseline_animation=baseline_animation, baseline_crossings=baseline_crossings, crossings=crossings,
                  protected_bones_sockets_actions_materials_unchanged=True,
                  limitations="Numeric topology/deformation checks only. Parent must judge played action/gameplay, armhole silhouette, garment folds and self intersections before publishing.")
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
