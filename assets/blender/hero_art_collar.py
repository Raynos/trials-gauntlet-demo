"""Race collar tailoring (ask 49, fix-list item 3).

The delivered Race jersey ends in a wide, hard-edged scoop that leaves the neck and the top of the shoulders bare.
This lofts a collar/yoke panel from the jersey's own neckline boundary loop up to a ring around the neck (measured
from the delivered head-and-neck mesh in the neck bone's frame), in the jersey's own colour (sampled from its albedo
at the neckline), skinned from the jersey's neckline weights at the bottom to the neck bone at the top. The panel
is a flat-colour opaque part, so the stage-1 atlas bake folds it into the rider's single draw.
"""
import math

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

import common as C


def bone_frame(arm, bone_name):
    bone = arm.data.bones[bone_name]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    up = (tail - head).normalized()
    left = Vector((0, 1, 0))
    forward = left.cross(up).normalized()
    left = up.cross(forward).normalized()
    return head, Matrix((forward, left, up)).transposed()


def sample_albedo(ob, uvs):
    """Mean linear colour of the object's base-colour image at the given UVs (falls back to the BSDF colour)."""
    mat = ob.data.materials[0] if ob.data.materials else None
    if not mat or not mat.use_nodes:
        return (0.5, 0.5, 0.5, 1)
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return (0.5, 0.5, 0.5, 1)
    link = bsdf.inputs["Base Color"].links[0] if bsdf.inputs["Base Color"].is_linked else None
    node = link.from_node if link else None
    while node is not None and node.type != "TEX_IMAGE":
        inp = next((i for i in node.inputs if i.is_linked and i.type in ("RGBA", "VECTOR")), None)
        node = inp.links[0].from_node if inp else None
    if node is None or node.image is None:
        return tuple(bsdf.inputs["Base Color"].default_value)
    img = node.image
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    samples = []
    for u, v in uvs:
        x = min(w - 1, max(0, int((u % 1.0) * w)))
        y = min(h - 1, max(0, int((v % 1.0) * h)))
        samples.append(px[y, x, :3])
    mean = np.median(np.array(samples), axis=0) if samples else np.array([0.5, 0.5, 0.5])
    if img.colorspace_settings.name == "sRGB":
        mean = np.where(mean <= 0.04045, mean / 12.92, ((mean + 0.055) / 1.055) ** 2.4)
    return (float(mean[0]), float(mean[1]), float(mean[2]), 1.0)


def build_race_collar(arm, jersey, neck_mesh, bins=36, rows=4, pad=0.007, rise=0.045, name="rider:race collar"):
    origin, M = bone_frame(arm, "neck")
    inv = M.inverted()
    local = lambda ob, co: inv @ ((ob.matrix_world @ co) - origin)
    # 1. the jersey's neckline: boundary vertices near the neck axis, binned by angle around it
    bm = bmesh.new()
    bm.from_mesh(jersey.data)
    bm.verts.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.active
    boundary = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    ring = []
    for v in boundary:
        p = local(jersey, v.co)
        r = math.hypot(p.x, p.y)
        if -0.10 < p.z < 0.12 and r < 0.16:
            uv = None
            for l in v.link_loops:
                uv = tuple(l[uv_layer].uv) if uv_layer else None
                break
            groups = {jersey.vertex_groups[g.group].name: g.weight for g in jersey.data.vertices[v.index].groups}
            ring.append((math.atan2(p.y, p.x), p, uv, groups))
    if len(ring) < bins // 2:
        raise RuntimeError(f"race collar: only {len(ring)} neckline boundary vertices found")
    per_bin = [[] for _ in range(bins)]
    for theta, p, uv, groups in ring:
        per_bin[int(((theta + math.pi) / (2 * math.pi)) * bins) % bins].append((p, uv, groups))
    bottom = []
    for b in range(bins):
        cell = per_bin[b]
        if not cell:
            bottom.append(None)
            continue
        cell.sort(key=lambda c: c[0].z)
        p = cell[len(cell) // 2][0]  # median height in the bin (the scoop edge)
        bottom.append((p, cell[len(cell) // 2][1], cell[len(cell) // 2][2]))
    for b in range(bins):  # fill empty bins from neighbours
        if bottom[b] is None:
            k = 1
            while bottom[(b + k) % bins] is None or bottom[(b - k) % bins] is None:
                k += 1
            a, c = bottom[(b - k) % bins], bottom[(b + k) % bins]
            bottom[b] = ((a[0] + c[0]) / 2, a[1] or c[1], a[2])
    u_top = max(p.z for p, _, _ in bottom) + rise
    # 2. the neck ring at u_top from the head-and-neck mesh
    neck_r = [0.0] * bins
    for v in neck_mesh.data.vertices:
        p = local(neck_mesh, v.co)
        if abs(p.z - u_top) < 0.012:
            b = int(((math.atan2(p.y, p.x) + math.pi) / (2 * math.pi)) * bins) % bins
            neck_r[b] = max(neck_r[b], math.hypot(p.x, p.y))
    for b in range(bins):
        if neck_r[b] == 0.0:
            neighbours = [neck_r[(b + k) % bins] for k in (-2, -1, 1, 2) if neck_r[(b + k) % bins] > 0]
            neck_r[b] = sum(neighbours) / len(neighbours) if neighbours else 0.06
    # 3. loft
    colour = sample_albedo(jersey, [uv for _, uv, _ in bottom if uv is not None])
    mat = C.new_mat("race collar", colour, rough=0.75)
    mat.use_backface_culling = False
    builder = C.MeshBuilder(name)
    cb = bmesh.new()
    grid = []
    weights = []
    for b in range(bins):
        theta = -math.pi + (b + 0.5) * 2 * math.pi / bins
        p0, _, groups = bottom[b]
        r0 = math.hypot(p0.x, p0.y) + 0.004
        r1 = neck_r[b] + pad
        col = []
        for i in range(rows):
            t = i / (rows - 1)
            ease = t * t * (3 - 2 * t)
            r = r0 + (r1 - r0) * ease + 0.006 * math.sin(math.pi * t)  # slight convex yoke
            z = p0.z + (u_top - p0.z) * t
            col.append(cb.verts.new(Vector((r * math.cos(theta), r * math.sin(theta), z))))
            w = {k: v * (1 - t) for k, v in groups.items()}
            w["neck"] = w.get("neck", 0.0) + 0.85 * t
            w["chest"] = w.get("chest", 0.0) + 0.15 * t
            weights.append(w)
        grid.append(col)
    for b in range(bins):
        nb = (b + 1) % bins
        for i in range(rows - 1):
            cb.faces.new((grid[b][i], grid[nb][i], grid[nb][i + 1], grid[b][i + 1]))
    cb.verts.index_update()
    cb.normal_update()
    base = len(builder.bm.verts)
    builder.add(cb, Matrix.Identity(4), mat, smooth=True)
    for k, w in enumerate(weights):
        builder.groups[base + k] = w
    ob = builder.build()
    ob.matrix_world = Matrix.Translation(origin) @ M.to_4x4()
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    am = ob.modifiers.new("Armature", "ARMATURE")
    am.object = arm
    return ob, {"tris": C.tri_count(ob), "bins": bins, "rows": rows, "rise": rise, "neckRadius": [round(r, 4) for r in neck_r[::9]],
                "colour": [round(c, 4) for c in colour[:3]], "necklineVerts": len(ring)}
