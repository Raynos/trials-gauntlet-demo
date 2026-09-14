"""Shared helpers for the headless Blender asset builds (bike + rider).

Run as:  blender -b --python assets/blender/build_bike.py
Blender 5.2 API. Blender frame: +X forward along the course, +Z up, -Y toward
the camera (the rider's left). The glTF exporter (export_yup) turns that into
the render frame: +x forward, +y up, +z toward the camera.
"""
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "public", "models")
PREVIEWS = os.path.join(HERE, "previews")
BAKE_DIR = os.path.join(HERE, "textures")
TAU = math.pi * 2


def log(*a):
    print("[asset]", *a)
    sys.stdout.flush()


# --------------------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.render.fps = 30
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    return sc


def V(x, y=0.0, z=0.0):
    return Vector((x, y, z))


def rot_frame(direction, up_hint=None):
    """Matrix whose Z axis is `direction` (for lathe/cylinder primitives built along +Z)."""
    d = Vector(direction).normalized()
    return d.to_track_quat("Z", "Y").to_matrix().to_4x4()


# --------------------------------------------------------------------------- builder
class MeshBuilder:
    """Accumulates primitives into one bmesh with material indices and per-part
    vertex-group tags (used by the rider for skinning)."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []
        self.groups = {}  # vert index -> {group: weight}
        self._layer_group = None

    def mat_index(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def add(self, geom_bm, matrix, mat, smooth=True, group=None, sharp_angle=None):
        """Append the geometry of another bmesh transformed by `matrix`."""
        mi = self.mat_index(mat)
        geom_bm.verts.ensure_lookup_table()
        base = len(self.bm.verts)
        vmap = {}
        for v in geom_bm.verts:
            nv = self.bm.verts.new(matrix @ v.co)
            vmap[v.index] = nv
        self.bm.verts.ensure_lookup_table()
        new_faces = []
        for f in geom_bm.faces:
            try:
                nf = self.bm.faces.new([vmap[v.index] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = mi
            nf.smooth = smooth
            new_faces.append(nf)
        if sharp_angle is not None:
            lim = math.radians(sharp_angle)
            seen = set()
            for f in new_faces:
                for e in f.edges:
                    if e.index in seen:
                        continue
                    if len(e.link_faces) == 2:
                        a = e.calc_face_angle(0)
                        if a > lim:
                            e.smooth = False
        if group is not None:
            n = len(self.bm.verts)
            if isinstance(group, str):
                for i in range(base, n):
                    self.groups[i] = {group: 1.0}
            elif callable(group):
                self.bm.verts.ensure_lookup_table()
                for i in range(base, n):
                    self.groups[i] = group(self.bm.verts[i].co)
            else:
                for i in range(base, n):
                    self.groups[i] = dict(group)
        return new_faces

    def build(self, collection=None):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.materials:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        if self.groups:
            names = sorted({g for d in self.groups.values() for g in d})
            vgs = {n: ob.vertex_groups.new(name=n) for n in names}
            for vi, d in self.groups.items():
                s = sum(d.values()) or 1.0
                for g, w in d.items():
                    if w > 1e-4:
                        vgs[g].add([vi], w / s, "REPLACE")
        return ob


# --------------------------------------------------------------------------- primitives (bmesh, built around origin)
def prim_lathe(profile, seg=16, closed=False, cap=True):
    """Revolve a profile of (r, z) points around +Z. `closed` = profile is a loop (torus-like).
    With r == 0 at an end the pole is merged."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if abs(r) < 1e-6:
            v = bm.verts.new((0, 0, z))
            rings.append([v] * seg)
        else:
            ring = []
            for i in range(seg):
                a = TAU * i / seg
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
            rings.append(ring)
    n = len(rings)
    pairs = list(range(n - 1)) + ([n - 1] if closed else [])
    for k in pairs:
        A = rings[k]
        B = rings[(k + 1) % n]
        for i in range(seg):
            j = (i + 1) % seg
            quad = [A[i], A[j], B[j], B[i]]
            # collapse degenerate (pole) quads to tris
            uniq = []
            for v in quad:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) >= 3:
                try:
                    bm.faces.new(uniq)
                except ValueError:
                    pass
    if cap and not closed:
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            if len(set(ring)) > 2:
                try:
                    f = bm.faces.new(ring if flip else list(reversed(ring)))
                except ValueError:
                    pass
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prim_cylinder(r1, r2, h, seg=16, cap=True):
    return prim_lathe([(r1, 0.0), (r2, h)], seg=seg, cap=cap)


def prim_sphere(r, seg=16, rings=10, scale=(1, 1, 1)):
    prof = []
    for i in range(rings + 1):
        t = math.pi * i / rings
        prof.append((r * math.sin(t) * 1.0, -r * math.cos(t)))
    bm = prim_lathe(prof, seg=seg, cap=False)
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    return bm


def prim_torus(R, r, seg=24, sides=8, sweep=TAU, scale_r=(1, 1)):
    """Torus around +Z (ring in the XY plane). scale_r = (radial, axial) scale of the tube section."""
    bm = bmesh.new()
    rings = []
    n = seg if abs(sweep - TAU) < 1e-6 else seg + 1
    for i in range(n):
        a = sweep * i / seg
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(sides):
            b = TAU * j / sides
            rr = R + r * math.cos(b) * scale_r[0]
            zz = r * math.sin(b) * scale_r[1]
            ring.append(bm.verts.new((rr * c, rr * s, zz)))
        rings.append(ring)
    m = seg if abs(sweep - TAU) < 1e-6 else seg
    for k in range(m):
        A = rings[k]
        B = rings[(k + 1) % n]
        for j in range(sides):
            jj = (j + 1) % sides
            bm.faces.new([A[j], B[j], B[jj], A[jj]])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prim_box(sx, sy, sz, bevel=0.0, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bevel = min(bevel, min(sx, sy, sz) * 0.49)
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bevel, segments=segments, profile=0.5, affect="EDGES")
    bm.normal_update()
    return bm


def catmull(points, samples, closed=False, tension=0.5):
    pts = [Vector(p) for p in points]
    out = []
    n = len(pts)
    segs = n if closed else n - 1
    for k in range(segs):
        p0 = pts[(k - 1) % n] if closed else pts[max(k - 1, 0)]
        p1 = pts[k]
        p2 = pts[(k + 1) % n]
        p3 = pts[(k + 2) % n] if closed else pts[min(k + 2, n - 1)]
        for i in range(samples):
            t = i / samples
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    if not closed:
        out.append(pts[-1])
    return out


def prim_tube(points, radius, sides=8, samples=6, closed=False, cap=True, smooth_path=True, radius_fn=None):
    """Tube along a polyline / catmull spline. `radius` may be a number or a function of t in [0,1]."""
    path = catmull(points, samples, closed) if smooth_path else [Vector(p) for p in points]
    bm = bmesh.new()
    n = len(path)
    # parallel-transport frames
    tangents = []
    for i in range(n):
        if closed:
            t = (path[(i + 1) % n] - path[(i - 1) % n])
        else:
            a = path[max(i - 1, 0)]
            b = path[min(i + 1, n - 1)]
            t = b - a
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((1, 0, 0)))
    normal = Vector((0, 0, 1)).cross(tangents[0])
    if normal.length < 1e-4:
        normal = Vector((0, 1, 0)).cross(tangents[0])
    normal.normalize()
    rings = []
    for i in range(n):
        t = tangents[i]
        normal = (normal - t * normal.dot(t))
        if normal.length < 1e-6:
            normal = Vector((0, 0, 1)).cross(t)
        normal.normalize()
        binorm = t.cross(normal)
        u = i / max(n - 1, 1)
        r = radius(u) if callable(radius) else radius
        if radius_fn:
            r = radius_fn(u)
        ring = []
        for j in range(sides):
            a = TAU * j / sides
            ring.append(bm.verts.new(path[i] + (normal * math.cos(a) + binorm * math.sin(a)) * r))
        rings.append(ring)
    m = n if closed else n - 1
    for k in range(m):
        A = rings[k]
        B = rings[(k + 1) % n]
        for j in range(sides):
            jj = (j + 1) % sides
            bm.faces.new([A[j], A[jj], B[jj], B[j]])
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def between(a, b):
    """Matrix placing a +Z primitive from point a to b (length = |b-a|, scale z)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    M = Matrix.Translation(a) @ rot_frame(d)
    return M, L


def cyl_between(a, b, r1, r2=None, seg=12, cap=True):
    M, L = between(a, b)
    return prim_cylinder(r1, r1 if r2 is None else r2, L, seg=seg, cap=cap), M


# --------------------------------------------------------------------------- materials
def new_mat(name, base=(0.8, 0.8, 0.8, 1), rough=0.5, metal=0.0, tint_noise=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.name = "OUT"
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.name = "BSDF"
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m


def node(m, kind, name=None, **props):
    n = m.node_tree.nodes.new(kind)
    if name:
        n.name = name
    for k, v in props.items():
        setattr(n, k, v)
    return n


def link(m, a, b):
    m.node_tree.links.new(a, b)


def bsdf(m):
    return m.node_tree.nodes["BSDF"]


def texcoord(m):
    nt = m.node_tree
    if "TC" in nt.nodes:
        return nt.nodes["TC"]
    return node(m, "ShaderNodeTexCoord", "TC")


def noise_fac(m, scale=40.0, detail=3.0, rough=0.5, coord="Object", distortion=0.0):
    n = node(m, "ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    n.inputs["Distortion"].default_value = distortion
    link(m, texcoord(m).outputs[coord], n.inputs["Vector"])
    return n.outputs["Fac"]


def ramp(m, fac, stops):
    r = node(m, "ShaderNodeValToRGB")
    cr = r.color_ramp
    while len(cr.elements) > 1:
        cr.elements.remove(cr.elements[-1])
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = stops[0][1]
    for pos, col in stops[1:]:
        e = cr.elements.new(pos)
        e.color = col
    link(m, fac, r.inputs["Fac"])
    return r.outputs["Color"]


def mix_rgb(m, fac, a, b, blend="MIX"):
    n = node(m, "ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    if hasattr(fac, "default_value") or hasattr(fac, "links"):
        link(m, fac, n.inputs["Factor"])
    else:
        n.inputs["Factor"].default_value = fac
    for sock, val in ((n.inputs[6], a), (n.inputs[7], b)):
        if hasattr(val, "links"):
            link(m, val, sock)
        else:
            sock.default_value = val
    return n.outputs[2]


def bump(m, height, strength=0.3, distance=0.002):
    b = node(m, "ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    link(m, height, b.inputs["Height"])
    link(m, b.outputs["Normal"], bsdf(m).inputs["Normal"])
    return b


def math_node(m, op, a, b=None, c=None, clamp=False):
    n = node(m, "ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, val in enumerate((a, b, c)):
        if val is None:
            continue
        if hasattr(val, "links"):
            link(m, val, n.inputs[i])
        else:
            n.inputs[i].default_value = val
    return n.outputs[0]


def set_metal_source(m, sock_or_value):
    """Remember what feeds Metallic so the bake can turn it into an emission pass."""
    b = bsdf(m)
    if hasattr(sock_or_value, "links"):
        link(m, sock_or_value, b.inputs["Metallic"])
    else:
        b.inputs["Metallic"].default_value = sock_or_value


# --------------------------------------------------------------------------- UV + bake
def select_only(obs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]


def unwrap_all(obs, angle=66.0, margin=0.002, scale_to_bounds=False):
    """Smart-project each mesh, then pack every island of every object into one 0-1 atlas."""
    for o in obs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    select_only(obs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin, margin_method="FRACTION", shape_method="AABB", scale=True)
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def _bake_image(name, size, color=(0, 0, 0, 1), non_color=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.generated_color = color
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def _attach_bake_target(mats, img):
    nodes_added = []
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.name = "BAKE_TARGET"
        n.image = img
        nt.nodes.active = n
        n.select = True
        nodes_added.append((m, n))
    return nodes_added


def _detach(nodes_added):
    for m, n in nodes_added:
        m.node_tree.nodes.remove(n)


def bake_atlas(obs, size, out_dir, prefix, jpeg_quality=90, normal_size=None, margin=4, orm_size=None):
    """Bake DIFFUSE colour, NORMAL (tangent), ROUGHNESS and METALLIC (via emission swap) of every
    material on `obs` into `prefix`_albedo.jpg / _normal.jpg / _orm.jpg. Returns dict of paths."""
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.render.bake.margin = margin
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.use_clear = True
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = jpeg_quality
    sc.render.image_settings.color_mode = "RGB"
    mats = []
    for o in obs:
        for slot in o.material_slots:
            if slot.material and slot.material not in mats:
                mats.append(slot.material)
    select_only(obs)
    paths = {}

    def run(kind, img, **kw):
        added = _attach_bake_target(mats, img)
        t0 = time.time()
        bpy.ops.object.bake(type=kind, **kw)
        log(f"bake {kind} {img.size[0]}px {time.time() - t0:.1f}s")
        _detach(added)

    def emit_swap(socket_name, img, default_from):
        """Bake a Principled input as emission (works for metals, unlike the DIFFUSE colour pass)."""
        restore = []
        for m in mats:
            nt = m.node_tree
            b = nt.nodes["BSDF"]
            out = nt.nodes["OUT"]
            em = nt.nodes.new("ShaderNodeEmission")
            em.name = "BAKE_EMIT"
            src = b.inputs[socket_name]
            if src.links:
                nt.links.new(src.links[0].from_socket, em.inputs["Color"])
            else:
                v = src.default_value
                em.inputs["Color"].default_value = default_from(v)
            nt.links.new(em.outputs[0], out.inputs[0])
            restore.append((m, em))
        run("EMIT", img)
        for m, em in restore:
            nt = m.node_tree
            nt.nodes.remove(em)
            nt.links.new(nt.nodes["BSDF"].outputs[0], nt.nodes["OUT"].inputs[0])

    # albedo (base colour as emission)
    alb = _bake_image(prefix + "_albedo", size, (0.5, 0.5, 0.5, 1), non_color=False)
    emit_swap("Base Color", alb, lambda v: tuple(v))
    # roughness + metallic at the (smaller) ORM size
    osize = orm_size or size
    rough = _bake_image(prefix + "_rough", osize)
    run("ROUGHNESS", rough)
    # metallic (as emission)
    met = _bake_image(prefix + "_metal", osize)
    emit_swap("Metallic", met, lambda v: (v, v, v, 1))
    # normal (tangent space)
    nsize = normal_size or size
    nrm = _bake_image(prefix + "_normal", nsize, (0.5, 0.5, 1.0, 1))
    sc.render.bake.normal_space = "TANGENT"
    run("NORMAL", nrm)

    # compose ORM = (1, roughness, metallic)
    orm = _bake_image(prefix + "_orm", osize)
    r = np.empty(osize * osize * 4, dtype=np.float32)
    rough.pixels.foreach_get(r)
    mt = np.empty(osize * osize * 4, dtype=np.float32)
    met.pixels.foreach_get(mt)
    px = np.empty(osize * osize * 4, dtype=np.float32)
    px[0::4] = 1.0
    px[1::4] = r[0::4]
    px[2::4] = mt[0::4]
    px[3::4] = 1.0
    orm.pixels.foreach_set(px)
    for img, key in ((alb, "albedo"), (nrm, "normal"), (orm, "orm")):
        p = os.path.join(out_dir, f"{prefix}_{key}.jpg")
        # raw pixel save (no view transform): albedo is already sRGB bytes, the others are data
        img.filepath_raw = p
        img.file_format = "JPEG"
        try:
            img.save(filepath=p, quality=jpeg_quality)
        except TypeError:
            img.save()
        paths[key] = p
        log("saved", p, f"{os.path.getsize(p) / 1024:.0f} KB")
    return paths


def atlas_material(name, paths):
    """One export material: Principled BSDF fed by the baked atlas (glTF-friendly wiring)."""
    m = new_mat(name)
    nt = m.node_tree
    b = bsdf(m)
    tc = node(m, "ShaderNodeTexCoord")
    ta = node(m, "ShaderNodeTexImage")
    ta.image = bpy.data.images.load(paths["albedo"])
    ta.image.colorspace_settings.name = "sRGB"
    link(m, tc.outputs["UV"], ta.inputs["Vector"])
    link(m, ta.outputs["Color"], b.inputs["Base Color"])
    to = node(m, "ShaderNodeTexImage")
    to.image = bpy.data.images.load(paths["orm"])
    to.image.colorspace_settings.name = "Non-Color"
    link(m, tc.outputs["UV"], to.inputs["Vector"])
    sep = node(m, "ShaderNodeSeparateColor")
    link(m, to.outputs["Color"], sep.inputs[0])
    link(m, sep.outputs["Green"], b.inputs["Roughness"])
    link(m, sep.outputs["Blue"], b.inputs["Metallic"])
    tn = node(m, "ShaderNodeTexImage")
    tn.image = bpy.data.images.load(paths["normal"])
    tn.image.colorspace_settings.name = "Non-Color"
    link(m, tc.outputs["UV"], tn.inputs["Vector"])
    nm = node(m, "ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 1.0
    link(m, tn.outputs["Color"], nm.inputs["Color"])
    link(m, nm.outputs["Normal"], b.inputs["Normal"])
    return m


def assign_atlas(obs, mat):
    for o in obs:
        me = o.data
        me.materials.clear()
        me.materials.append(mat)
        for p in me.polygons:
            p.material_index = 0


# --------------------------------------------------------------------------- stats + export
def tri_count(ob):
    me = ob.data
    return sum(len(p.vertices) - 2 for p in me.polygons)


def export_glb(path, obs, animations=False, meshopt=False, extra=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(obs)
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_jpeg_quality=90,
        export_animations=animations,
        export_skins=animations,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_meshopt_compression_enable=meshopt,
    )
    if animations:
        kw.update(
            export_animation_mode="ACTIONS",
            export_nla_strips=True,
            export_force_sampling=True,
            export_frame_step=1,
            export_optimize_animation_size=True,
            export_anim_slide_to_zero=True,
            export_bake_animation=False,
            export_def_bones=False,
            export_rest_position_armature=True,
            export_influence_nb=4,
            export_all_influences=False,
            export_leaf_bone=False,
        )
    if extra:
        kw.update(extra)
    bpy.ops.export_scene.gltf(**kw)
    size = os.path.getsize(path)
    log(f"exported {path} {size / 1024:.0f} KB")
    return size


def gltf_summary(path):
    """Read a .glb header and print node/mesh/animation names + tri counts (no external deps)."""
    import json
    import struct

    with open(path, "rb") as f:
        magic, ver, length = struct.unpack("<III", f.read(12))
        clen, ctype = struct.unpack("<II", f.read(8))
        js = json.loads(f.read(clen))
    acc = js.get("accessors", [])
    tris = 0
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            if "indices" in p:
                tris += acc[p["indices"]]["count"] // 3
            else:
                tris += acc[p["attributes"]["POSITION"]]["count"] // 3
    info = {
        "bytes": length,
        "triangles": tris,
        "nodes": [n.get("name") for n in js.get("nodes", [])],
        "meshes": [m.get("name") for m in js.get("meshes", [])],
        "materials": [m.get("name") for m in js.get("materials", [])],
        "images": [(i.get("mimeType"), i.get("name")) for i in js.get("images", [])],
        "animations": [a.get("name") for a in js.get("animations", [])],
        "skins": [(s.get("name"), len(s.get("joints", []))) for s in js.get("skins", [])],
        "extensions": js.get("extensionsUsed", []),
    }
    return info
