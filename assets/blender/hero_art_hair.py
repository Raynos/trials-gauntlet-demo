"""Lightweight groom for the street riders, derived from the delivered 3.46 M-triangle strand mesh.

The delivery's `Bystedt_EvaluatedStrandCrossSections` is 9,000 strands x 65 rings x 3 vertices (open tubes,
0.5 mm across, every vertex weighted 1.0 to `head`). It cannot ship. Two derived parts replace it:

  shell   the strand cloud turned into a closed volume (Geometry Nodes: Mesh to Points -> Points to Volume ->
          Volume to Mesh), collapsed to a few thousand triangles, smart-unwrapped, and baked from the real
          strands (tangent normal + ambient occlusion, selected-to-active) so the curls still read as hair.
  ribbons (optional) a subset of the strand centrelines as flat two-sided strips with an alpha-tested
          strand texture, for a broken silhouette on top of the shell.

Everything is rigid to the head bone, exactly like the delivered groom.
"""
import math
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector

import common as C

STRAND_RINGS = 65
RING_VERTS = 3


def strand_centrelines(groom):
    """(strands, rings, 3) array of ring centres, in the groom's local space, from the delivered vertex order."""
    me = groom.data
    n = len(me.vertices)
    if n % (STRAND_RINGS * RING_VERTS) != 0:
        raise RuntimeError(f"groom vertex count {n} is not strands x {STRAND_RINGS} x {RING_VERTS}")
    co = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, STRAND_RINGS, RING_VERTS, 3)
    return co.mean(axis=2)


def _menu(socket, candidates):
    for value in candidates:
        try:
            socket.default_value = value
            return
        except TypeError:
            continue
    raise RuntimeError(f"menu socket {socket.name}: none of {candidates} accepted")


def _points_to_shell_group(voxel, radius):
    ng = bpy.data.node_groups.new("hair_shell", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes, links = ng.nodes, ng.links
    gi = nodes.new("NodeGroupInput")
    go = nodes.new("NodeGroupOutput")
    to_points = nodes.new("GeometryNodeMeshToPoints")
    to_points.mode = "VERTICES"
    to_volume = nodes.new("GeometryNodePointsToVolume")
    _menu(to_volume.inputs["Resolution Mode"], ("Size", "VOXEL_SIZE"))
    to_volume.inputs["Density"].default_value = 1.0
    to_volume.inputs["Voxel Size"].default_value = voxel
    to_volume.inputs["Radius"].default_value = radius
    to_mesh = nodes.new("GeometryNodeVolumeToMesh")
    _menu(to_mesh.inputs["Resolution Mode"], ("Size", "VOXEL_SIZE"))
    to_mesh.inputs["Voxel Size"].default_value = voxel
    to_mesh.inputs["Threshold"].default_value = 0.5
    to_mesh.inputs["Adaptivity"].default_value = 0.0
    links.new(gi.outputs[0], to_points.inputs["Mesh"])
    links.new(to_points.outputs["Points"], to_volume.inputs["Points"])
    links.new(to_volume.outputs["Volume"], to_mesh.inputs["Volume"])
    links.new(to_mesh.outputs["Mesh"], go.inputs[0])
    return ng


def smooth_shading(ob):
    """Smooth vertex normals everywhere: no sharp faces/edges, no custom split normals (else the exporter splits
    every vertex and the shell renders flat-faceted, as v1 did: 11,100 verts for 7,677 tris)."""
    me = ob.data
    for attr in ("sharp_face", "sharp_edge"):
        layer = me.attributes.get(attr)
        if layer is not None:
            me.attributes.remove(layer)
    if hasattr(me, "has_custom_normals") and me.has_custom_normals:
        try:
            C.select_only([ob])
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except RuntimeError:
            pass
    me.shade_smooth()
    me.update()


def build_shell(groom, arm, budget=5000, voxel=0.004, radius=0.006, name="hair_shell", shrink=0.0, smooth=0):
    """Closed shell around the strand cloud, collapsed to `budget` triangles, skinned rigidly to `head`.
    `shrink` pulls the remeshed surface back along its normals (the point radius inflates it); `smooth` runs
    that many Laplacian-free smooth iterations after collapse to take the lumps out of the facets."""
    t0 = time.time()
    shell = bpy.data.objects.new(name, groom.data.copy())
    shell.data.name = name
    bpy.context.scene.collection.objects.link(shell)
    shell.matrix_world = groom.matrix_world.copy()
    mod = shell.modifiers.new("shell", "NODES")
    mod.node_group = _points_to_shell_group(voxel, radius)
    C.select_only([shell])
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=mod.name)
    raw_tris = C.tri_count(shell)
    if shrink > 0:
        smooth_shading(shell)
        mod = shell.modifiers.new("shrink", "DISPLACE")
        mod.direction = "NORMAL"
        mod.mid_level = 0.0
        mod.strength = -shrink
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # collapse; the blob is manifold so collapse reaches the target
    mod = shell.modifiers.new("LOD", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.005, budget / max(raw_tris, 1) * 0.98)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    shell.data.validate(verbose=False, clean_customdata=False)
    if smooth > 0:
        mod = shell.modifiers.new("smooth", "SMOOTH")
        mod.factor = 0.5
        mod.iterations = smooth
        bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth_shading(shell)
    # rigid to head like the delivered groom
    shell.vertex_groups.clear()
    vg = shell.vertex_groups.new(name="head")
    vg.add(list(range(len(shell.data.vertices))), 1.0, "REPLACE")
    shell.parent = arm
    shell.matrix_parent_inverse = arm.matrix_world.inverted()
    am = shell.modifiers.new("Armature", "ARMATURE")
    am.object = arm
    C.log(f"hair shell: {raw_tris} -> {C.tri_count(shell)} tris in {time.time() - t0:.1f}s")
    return shell, raw_tris


def unwrap(ob, angle=66.0, margin=0.01):
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    C.select_only([ob])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def scalp_thickness(shell, scalp):
    """Per-vertex distance (m) from the shell surface inward to the scalp mesh: thin hair = scalp shows through."""
    from mathutils.bvhtree import BVHTree
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(scalp, depsgraph, deform=False)
    to_scalp = scalp.matrix_world.inverted() @ shell.matrix_world
    out = np.zeros(len(shell.data.vertices), dtype=np.float32)
    for i, v in enumerate(shell.data.vertices):
        loc, nrm, _, dist = bvh.find_nearest(to_scalp @ v.co)
        out[i] = dist if loc is not None else 1.0
    return out


def bake_thickness_map(shell, thickness, size, nt):
    """Bake the per-vertex thickness (as a colour attribute) into a Non-Color image via emission."""
    me = shell.data
    attr = me.color_attributes.new("thickness", "FLOAT_COLOR", "POINT")
    cols = np.zeros((len(me.vertices), 4), dtype=np.float32)
    cols[:, 0] = cols[:, 1] = cols[:, 2] = thickness
    cols[:, 3] = 1.0
    attr.data.foreach_set("color", cols.ravel())
    sc = bpy.context.scene
    img = bpy.data.images.new("hair_shell_thickness", size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    out = nt.nodes["OUT"]
    previous = [(l.from_socket, l.to_socket) for l in out.inputs["Surface"].links]
    em = nt.nodes.new("ShaderNodeEmission")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "thickness"
    nt.links.new(ca.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    tex.select = True
    sc.render.bake.use_selected_to_active = False
    sc.cycles.samples = 1
    C.select_only([shell])
    bpy.ops.object.bake(type="EMIT")
    for n in (tex, em, ca):
        nt.nodes.remove(n)
    for a, b in previous:
        nt.links.new(a, b)
    me.color_attributes.remove(attr)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    t = px[0::4].copy()
    bpy.data.images.remove(img)
    return t


def bake_from_strands(shell, groom, size=512, samples=16, cage=0.012, ray=0.03, base_color=(0.028, 0.012, 0.006, 1), roughness=0.9, lift=4.0,
                      version=1, scalp=None, skin=(0.60, 0.42, 0.33), normal_strength=1.0, specular=0.15, ao_floor=0.35, scalp_band=(0.003, 0.012), scalp_mix=0.5, grey=0.0):
    """Selected-to-active bake of the strands onto the shell: tangent normal + AO, folded into one material."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.use_cage = False
    sc.render.bake.cage_extrusion = cage
    sc.render.bake.max_ray_distance = ray
    sc.render.bake.margin = 8
    sc.render.bake.use_clear = True
    sc.render.bake.normal_space = "TANGENT"
    mat = bpy.data.materials.new("hair_shell")
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.name = "BSDF"
    out = nt.nodes["Material Output"]
    out.name = "OUT"
    shell.data.materials.clear()
    shell.data.materials.append(mat)
    groom_mat = groom.data.materials[0] if groom.data.materials else None

    def target(img):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.name = "BAKE_TARGET"
        n.image = img
        nt.nodes.active = n
        n.select = True
        return n

    C.select_only([groom, shell])
    bpy.context.view_layer.objects.active = shell
    groom.hide_render = False
    groom.hide_set(False)
    shell.hide_render = False
    # normal
    nrm = bpy.data.images.new("hair_shell_normal", size, size, alpha=False)
    nrm.generated_color = (0.5, 0.5, 1.0, 1)
    nrm.colorspace_settings.name = "Non-Color"
    n = target(nrm)
    sc.cycles.samples = 1
    t0 = time.time()
    bpy.ops.object.bake(type="NORMAL")
    C.log(f"hair normal bake {size}px {time.time() - t0:.1f}s")
    nt.nodes.remove(n)
    # ambient occlusion of the strands (source-side AO, bounded rays)
    ao = bpy.data.images.new("hair_shell_ao", size, size, alpha=False)
    ao.generated_color = (1, 1, 1, 1)
    ao.colorspace_settings.name = "Non-Color"
    n = target(ao)
    sc.cycles.samples = samples
    sc.world.light_settings.distance = 0.04 if sc.world else None
    t0 = time.time()
    bpy.ops.object.bake(type="AO")
    C.log(f"hair AO bake {size}px {samples}spp {time.time() - t0:.1f}s")
    nt.nodes.remove(n)
    thickness = None
    if version >= 2 and scalp is not None:
        thickness = bake_thickness_map(shell, scalp_thickness(shell, scalp), size, nt)
    # material: base colour * AO, roughness constant, tangent normal
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(tex_n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    # fold AO into an albedo image (no glTF occlusion needed; the shell's own lighting darkens the curl valleys)
    alb = bpy.data.images.new("hair_shell_albedo", size, size, alpha=False)
    alb.colorspace_settings.name = "sRGB"
    px = np.empty(size * size * 4, dtype=np.float32)
    ao.pixels.foreach_get(px)
    occ = np.clip(px[0::4], 0.0, 1.0)
    occ = ao_floor + (1.0 - ao_floor) * occ  # keep the valleys readable, not black
    rgb = np.array(base_color[:3], dtype=np.float32)
    # lift the delivered strand colour: a solid shell has none of the per-strand specular that makes the
    # rendered groom read lighter than its 0.028/0.012/0.006 albedo (the factor is matched on rendered stills)
    rgb = np.clip(rgb * lift + grey, 0, 1)  # `grey` stands in for the strands' white specular sheen
    colour = np.tile(rgb, (occ.size, 1))
    if thickness is not None:
        # thin hair over the scalp (hairline, parting): let the skin tone through
        lo, hi = scalp_band
        w = np.clip((hi - thickness) / (hi - lo), 0.0, 1.0) * scalp_mix
        colour = colour * (1.0 - w)[:, None] + np.array(skin, dtype=np.float32)[None, :] * w[:, None]
    out_px = np.empty_like(px)
    out_px[0::4] = colour[:, 0] * occ
    out_px[1::4] = colour[:, 1] * occ
    out_px[2::4] = colour[:, 2] * occ
    out_px[3::4] = 1.0
    alb.pixels.foreach_set(out_px)
    tex_a = nt.nodes.new("ShaderNodeTexImage")
    tex_a.image = alb
    nt.links.new(tex_a.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = 0.0
    if groom_mat and groom_mat.use_nodes:
        src = groom_mat.node_tree.nodes.get("Principled BSDF")
        if src and "Specular IOR Level" in src.inputs:
            b.inputs["Specular IOR Level"].default_value = min(specular, src.inputs["Specular IOR Level"].default_value)
    for img in (nrm, alb):
        img.pack()
    bpy.data.images.remove(ao)
    sc.render.bake.use_selected_to_active = False
    return {"normal": nrm.name, "albedo": alb.name, "size": size, "samples": samples, "version": version, "lift": lift, "grey": grey,
            "roughness": roughness, "specular": specular, "normalStrength": normal_strength, "scalpTint": thickness is not None}


V2 = dict(voxel=0.003, radius=0.0045, shrink=0.002, smooth=2, lift=6.0, grey=0.12, roughness=0.9, specular=0.08, normal_strength=0.35, ao_floor=0.45)


def build_hair(groom, arm, budget=5000, bake_size=512, samples=16, voxel=0.003, radius=0.0045, version=2, scalp=None):
    if version >= 2:
        shell, raw = build_shell(groom, arm, budget=budget, voxel=V2["voxel"], radius=V2["radius"], shrink=V2["shrink"], smooth=V2["smooth"])
        unwrap(shell)
        bake = bake_from_strands(shell, groom, size=bake_size, samples=samples, version=2, scalp=scalp, lift=V2["lift"], roughness=V2["roughness"],
                                 specular=V2["specular"], normal_strength=V2["normal_strength"], ao_floor=V2["ao_floor"], grey=V2["grey"])
        return shell, {"version": 2, "shellRawTris": raw, "shellTris": C.tri_count(shell), "verts": len(shell.data.vertices), **{k: V2[k] for k in ("voxel", "radius", "shrink", "smooth")}, "bake": bake}
    shell, raw = build_shell(groom, arm, budget=budget, voxel=voxel, radius=radius)
    unwrap(shell)
    bake = bake_from_strands(shell, groom, size=bake_size, samples=samples, version=1)
    return shell, {"version": 1, "shellRawTris": raw, "shellTris": C.tri_count(shell), "voxel": voxel, "radius": radius, "bake": bake}


# --------------------------------------------------------------------------- ribbons (comparison option)
def _resample(points, n):
    """Arc-length resample an (m,3) polyline to n points."""
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    if s[-1] <= 0:
        return np.repeat(points[:1], n, axis=0)
    t = np.linspace(0.0, s[-1], n)
    return np.stack([np.interp(t, s, points[:, k]) for k in range(3)], axis=1)


def strand_strip_texture(lines, name="hair_ribbon_albedo", width=256, height=1024, lanes=7, base=(0.028, 0.012, 0.006), lift=4.0, seed=7):
    """Alpha-tested strip: real strand centrelines projected onto their principal plane, one per lane, stamped as
    thick feathered lines. Colour is the delivered strand colour lifted like the shell."""
    rng = np.random.default_rng(seed)
    rgb = np.zeros((height, width, 3), dtype=np.float32)
    alpha = np.zeros((height, width), dtype=np.float32)
    yy, xx = np.mgrid[0:height, 0:width]
    picks = rng.choice(len(lines), lanes, replace=False)
    lane_w = width / lanes
    for lane, index in enumerate(picks):
        pts = lines[index] - lines[index].mean(axis=0)
        u_, s_, vt = np.linalg.svd(pts, full_matrices=False)
        proj = pts @ vt[:2].T  # (m,2): principal (length) and secondary (curl) axes
        v = proj[:, 0]
        v = (v - v.min()) / max(v.max() - v.min(), 1e-6)
        u = proj[:, 1]
        u = u / max(np.abs(u).max(), 1e-6) * lane_w * 0.32 + (lane + 0.5) * lane_w
        y = 20 + v * (height - 40)
        # densify and stamp
        dense = _resample(np.stack([u, y, np.zeros_like(u)], axis=1), 600)
        tone = rgb_tone = np.array(base, dtype=np.float32) * lift * rng.uniform(0.7, 1.3)
        radius = rng.uniform(5.0, 8.0)
        for k, (px, py, _) in enumerate(dense):
            r = radius * (1.0 - 0.5 * k / len(dense))  # thinner toward the tip
            x0, x1 = int(max(0, px - r - 2)), int(min(width, px + r + 3))
            y0, y1 = int(max(0, py - r - 2)), int(min(height, py + r + 3))
            if x1 <= x0 or y1 <= y0:
                continue
            d = np.hypot(xx[y0:y1, x0:x1] - px, yy[y0:y1, x0:x1] - py)
            a = np.clip(1.6 - d / r * 1.6, 0.0, 1.0)
            cur = alpha[y0:y1, x0:x1]
            newer = a > cur
            alpha[y0:y1, x0:x1] = np.maximum(cur, a)
            # shade: darker toward the strand edge
            shade = (0.6 + 0.4 * (1.0 - np.clip(d / r, 0, 1)))[..., None]
            rgb[y0:y1, x0:x1][newer] = (tone * shade)[newer]
    img = bpy.data.images.new(name, width, height, alpha=True)
    img.colorspace_settings.name = "sRGB"
    px = np.empty((height, width, 4), dtype=np.float32)
    px[..., :3] = rgb
    px[..., 3] = alpha
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def build_ribbons(groom, arm, shell, budget=7000, segments=6, width=0.012, lift=0.003, band=(-0.002, 0.014), name="hair_ribbons", alpha_like=None):
    """Silhouette ribbons: strands skimming the shell surface, as tapered flat strips lying on the shell,
    alpha-tested strand strip texture, rigid to `head`. Returns the object and a report."""
    from mathutils.bvhtree import BVHTree
    lines = strand_centrelines(groom)
    world = np.array(groom.matrix_world)
    # centrelines to shell-local space (both objects are skinned identity children of the rig)
    to_shell = np.array(shell.matrix_world.inverted() @ groom.matrix_world)
    lines_l = lines @ to_shell[:3, :3].T + to_shell[:3, 3]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(shell, depsgraph, deform=False)
    n_strands, rings, _ = lines_l.shape
    per_ribbon = segments * 2
    want = max(1, budget // per_ribbon)
    resampled = np.stack([_resample(lines_l[i], segments + 1) for i in range(n_strands)])
    signed = np.zeros((n_strands, segments + 1), dtype=np.float32)
    normals = np.zeros((n_strands, segments + 1, 3), dtype=np.float32)
    for i in range(n_strands):
        for j in range(segments + 1):
            loc, nrm, _, dist = bvh.find_nearest(Vector(resampled[i, j]))
            if loc is None:
                signed[i, j] = 1.0
                normals[i, j] = (0, 0, 1)
                continue
            d = Vector(resampled[i, j]) - loc
            signed[i, j] = dist if d.dot(nrm) >= 0 else -dist
            normals[i, j] = nrm
    score = signed[:, 1:].mean(axis=1)  # ignore the root ring (inside the scalp)
    candidates = np.where((score > band[0]) & (score < band[1]))[0]
    if len(candidates) < want:
        candidates = np.argsort(-score)[:max(want, 1)]
    # stratify by root position so coverage is even around the head
    roots = resampled[candidates, 0]
    order = np.lexsort((roots[:, 2], roots[:, 1], np.arctan2(roots[:, 2], roots[:, 0])))
    step = max(1, len(candidates) // want)
    chosen = candidates[order][::step][:want]
    verts, faces, uvs = [], [], []
    for i in chosen:
        for j in range(segments + 1):
            p = resampled[i, j]
            n = normals[i, j]
            push = lift + max(0.0, -signed[i, j])
            q = p + n * push
            t = resampled[i, min(j + 1, segments)] - resampled[i, max(j - 1, 0)]
            t = t / (np.linalg.norm(t) + 1e-9)
            w = np.cross(t, n)
            w = w / (np.linalg.norm(w) + 1e-9)
            half = width * 0.5 * (1.0 - 0.55 * j / segments)
            verts.append(tuple(q - w * half))
            verts.append(tuple(q + w * half))
        base = len(verts) - 2 * (segments + 1)
        for j in range(segments):
            a = base + 2 * j
            faces.append((a, a + 1, a + 3, a + 2))
            uvs.append(((0, j / segments), (1, j / segments), (1, (j + 1) / segments), (0, (j + 1) / segments)))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for f, quad in zip(me.polygons, uvs):
        for li, co in zip(f.loop_indices, quad):
            uv.data[li].uv = co
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = shell.matrix_world.copy()
    vg = ob.vertex_groups.new(name="head")
    vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    am = ob.modifiers.new("Armature", "ARMATURE")
    am.object = arm
    C.select_only([ob])
    bpy.ops.object.shade_smooth()
    # material: strip texture, alpha-tested, double sided
    img = strand_strip_texture(lines)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    # the glTF exporter reads alphaMode MASK (cutoff 0.5) from a Math:Round on the alpha path
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "ROUND"
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.9
    b.inputs["Specular IOR Level"].default_value = 0.15
    mat.use_backface_culling = False
    if alpha_like is not None:
        for attr in ("blend_method", "alpha_threshold", "surface_render_method"):
            try:
                setattr(mat, attr, getattr(alpha_like, attr))
            except (AttributeError, TypeError):
                pass
    else:
        for attr, value in (("blend_method", "CLIP"), ("alpha_threshold", 0.5)):
            try:
                setattr(mat, attr, value)
            except (AttributeError, TypeError):
                pass
    me.materials.append(mat)
    return ob, {"ribbons": int(len(chosen)), "candidates": int(len(candidates)), "segments": segments, "tris": C.tri_count(ob),
                "width": width, "lift": lift, "band": band, "texture": [img.size[0], img.size[1]]}
