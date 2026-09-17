"""Race helmet remaster (ask 49, fix-list item 1): an MX-style full-face helmet built around the delivered head.

Astra remastered only the open-face helmet; the Race `rider:constructed_helmet` is a boxy shell with a flat strap.
This builds, in the head bone's frame (so it tilts with the riding posture): a padded cranium shell with a face
opening and neck opening (solidified so the rims read), a chin bar, an upward-flaring peak, goggles (rubber frame,
tinted lens, strap around the shell), crown vents and a racing stripe in the livery accent colour. Everything is
weighted 1.0 to `head` like the delivered helmet. Opaque parts are one object with flat materials that the stage-1
atlas bake folds into the rider's single draw; the lens stays its own BLEND draw.
"""
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

import common as C

LIVERIES = {
    "charcoalyellow": dict(base=(0.040, 0.043, 0.048, 1), accent=(0.95, 0.66, 0.03, 1)),
    "bluewhite": dict(base=(0.90, 0.91, 0.93, 1), accent=(0.03, 0.12, 0.62, 1)),
}


def livery_for(name):
    return LIVERIES["charcoalyellow"] if "charcoalyellow" in name.lower() else LIVERIES["bluewhite"]


def head_frame(arm):
    """(origin, matrix) of the head bone: columns forward / left / up in world space."""
    bone = arm.data.bones["head"]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    up = (tail - head).normalized()
    left = Vector((0, 1, 0))
    forward = left.cross(up).normalized()
    left = up.cross(forward).normalized()
    m = Matrix((forward, left, up)).transposed()  # columns
    return head, m


def to_frame(origin, m, ob):
    inv = m.inverted()
    return [inv @ ((ob.matrix_world @ v.co) - origin) for v in ob.data.vertices]


def _mesh_from_bm(bm, name, mats, smooth=True):
    me = bpy.data.meshes.new(name)
    for f in bm.faces:
        f.smooth = smooth
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return me


def build_race_helmet(arm, head_ob, eye_obs, old_helmet, livery, name="rider:race helmet"):
    origin, M = head_frame(arm)
    head_pts = to_frame(origin, M, head_ob)
    eye_pts = [p for ob in eye_obs for p in to_frame(origin, M, ob)]
    eye = sum(eye_pts, Vector()) / len(eye_pts)
    f_eye, u_eye = eye.x, eye.z
    cranium = [p for p in head_pts if p.z > u_eye - 0.01]
    f_min = min(p.x for p in cranium); f_max = max(p.x for p in cranium)
    l_max = max(abs(p.y) for p in cranium); u_max = max(p.z for p in cranium)
    pad_side, pad_top, pad_front, pad_back = 0.024, 0.030, 0.030, 0.026
    cf = (f_min - pad_back + f_max + pad_front) / 2
    cu = (u_eye + u_max) / 2 - 0.005
    rx = (f_max + pad_front - (f_min - pad_back)) / 2
    ry = l_max + pad_side
    rz = (u_max + pad_top) - cu
    rz_down = rz * 1.75  # the shell reaches down to the jaw line (cheek coverage)
    lv = livery_for(livery)
    shell_mat = C.new_mat("race helmet shell", lv["base"], rough=0.32)
    accent_mat = C.new_mat("race helmet accent", lv["accent"], rough=0.32)
    black_mat = C.new_mat("race helmet rubber", (0.018, 0.018, 0.02, 1), rough=0.85)
    lens_mat = C.new_mat("race goggle lens", (0.05, 0.10, 0.22, 1), rough=0.08)
    lens_mat.node_tree.nodes["BSDF"].inputs["Alpha"].default_value = 0.55
    lens_mat.use_backface_culling = False

    def surface(theta, u):
        """Point on the shell ellipsoid at polar angle theta around up (0 = forward) and height u (frame coords)."""
        z = (u - cu) / (rz if u >= cu else rz_down)
        z = max(-0.999, min(0.999, z))
        r = math.sqrt(1 - z * z)
        return Vector((cf + rx * r * math.cos(theta), ry * r * math.sin(theta), u))

    # --- shell: ellipsoid, face + neck openings, stripe faces, solidified rim
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=22, radius=1.0)
    for v in bm.verts:
        z = v.co.z
        v.co = Vector((cf + rx * v.co.x, ry * v.co.y, cu + (rz if z >= 0 else rz_down) * z))
    kill = []
    brow = u_eye + 0.040
    jaw = u_eye - 0.030
    for v in bm.verts:
        p = v.co
        theta = math.atan2(p.y, (p.x - cf) / rx * ry) if rx else 0.0
        front = math.cos(theta) > 0.66
        if front and jaw < p.z < brow:
            kill.append(v)
        elif p.z < cu - rz_down * 0.92:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    stripe = []
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.y) < 0.024 and c.z > cu + 0.02 and (c.x - cf) > -0.55 * rx:
            stripe.append(f)
    helmet = C.MeshBuilder(name)
    shell_bm = bm
    shell_faces = helmet.add(shell_bm, Matrix.Identity(4), shell_mat, smooth=True, group="head")
    stripe_centres = [f.calc_center_median() for f in stripe]
    for f in shell_faces:
        c = f.calc_center_median()
        if any((c - s).length < 1e-6 for s in stripe_centres):
            f.material_index = helmet.mat_index(accent_mat)
    shell_bm.free()
    # --- chin bar: tube from the left jaw around the chin to the right jaw
    u_chin = u_eye - 0.088
    path = []
    for i in range(9):
        theta = math.radians(88 - 176 * i / 8)
        p = surface(theta, u_chin)
        bulge = 0.040 * math.cos(theta) ** 2  # the bar stands off the chin
        path.append(p + Vector((bulge, 0, -0.006 * math.cos(theta))))
    chin = C.prim_tube(path, lambda t: 0.022 + 0.006 * math.sin(math.pi * t), sides=10, samples=4, cap=True)
    helmet.add(chin, Matrix.Identity(4), shell_mat, smooth=True, group="head")
    # --- peak: curved plate flaring up and forward from the brow
    peak = bmesh.new()
    rows = []
    for i in range(11):
        theta = math.radians(-80 + 160 * i / 10)
        base = surface(theta, brow + 0.014)
        radial = Vector((math.cos(theta) * rx, math.sin(theta) * ry, 0)).normalized()
        row = []
        for j, t in enumerate((0.0, 0.5, 1.0)):
            reach = 0.072 * (1 - 0.45 * abs(math.sin(theta)) ** 1.5)
            row.append(peak.verts.new(base + radial * (reach * t) + Vector((0, 0, 0.022 * t))))
        rows.append(row)
    for i in range(10):
        for j in range(2):
            peak.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    peak.verts.index_update()
    peak.normal_update()
    helmet.add(peak, Matrix.Identity(4), accent_mat, smooth=True, group="head")
    # --- goggles: superellipse frame + strap; lens is a separate blend object
    a, b, n = 0.097, 0.050, 3.0
    frame_path, lens_pts = [], []
    for i in range(40):
        t = 2 * math.pi * i / 40
        c, s = math.cos(t), math.sin(t)
        l = a * math.copysign(abs(c) ** (2 / n), c)
        u = u_eye + 0.004 + b * math.copysign(abs(s) ** (2 / n), s)
        f = f_eye + 0.030 - (l / a) ** 2 * 0.030
        frame_path.append(Vector((f, l, u)))
        lens_pts.append(Vector((f - 0.004, l * 0.93, u_eye + 0.004 + (u - u_eye - 0.004) * 0.9)))
    goggle = C.prim_tube(frame_path, 0.0075, sides=8, samples=2, closed=True, cap=False)
    helmet.add(goggle, Matrix.Identity(4), black_mat, smooth=True, group="head")
    strap = bmesh.new()
    top, bot = [], []
    for i in range(25):
        theta = math.radians(62 + 236 * i / 24)
        for u, row in ((u_eye + 0.024, top), (u_eye - 0.010, bot)):
            p = surface(theta, u)
            outward = Vector(((p.x - cf) / rx, p.y / ry, 0)).normalized() * 0.006
            row.append(strap.verts.new(p + outward))
    for i in range(24):
        strap.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    strap.verts.index_update()
    strap.normal_update()
    helmet.add(strap, Matrix.Identity(4), black_mat, smooth=True, group="head")
    # --- crown vents: three dark slots pressed into the shell top
    for k, (theta, u_off, size) in enumerate(((0.0, 0.010, (0.034, 0.011)), (math.radians(28), -0.004, (0.026, 0.009)), (math.radians(-28), -0.004, (0.026, 0.009)))):
        p = surface(theta, cu + rz - 0.030 + u_off) - Vector((0, 0, 0.011))
        box = C.prim_box(size[0] * 1.3, size[1], 0.010, bevel=0.002)
        rot = Matrix.Rotation(theta * 0.6, 4, "Z")
        helmet.add(box, Matrix.Translation(p) @ rot, black_mat, smooth=False, group="head")
    helmet_ob = helmet.build()
    lens = C.MeshBuilder("rider:race goggle lens")
    lbm = bmesh.new()
    verts = [lbm.verts.new(p) for p in lens_pts]
    lbm.faces.new(verts)
    lbm.verts.index_update()
    lbm.normal_update()
    lens.add(lbm, Matrix.Identity(4), lens_mat, smooth=True, group="head")
    lens_ob = lens.build()
    # --- into world space, skinned to the head bone
    world = Matrix.Translation(origin) @ M.to_4x4()
    for ob in (helmet_ob, lens_ob):
        ob.matrix_world = world
        ob.parent = arm
        ob.matrix_parent_inverse = arm.matrix_world.inverted()
        am = ob.modifiers.new("Armature", "ARMATURE")
        am.object = arm
    # shell thickness (rims at the openings) - apply so the export sees plain geometry
    sol = helmet_ob.modifiers.new("shell", "SOLIDIFY")
    sol.thickness = 0.006
    sol.offset = -1.0
    sol.use_rim = True
    helmet_ob.modifiers.move(len(helmet_ob.modifiers) - 1, 0)
    C.select_only([helmet_ob])
    bpy.context.view_layer.objects.active = helmet_ob
    bpy.ops.object.modifier_apply(modifier=sol.name)
    helmet_ob.data.validate(verbose=False)
    report = {"shell": {"cf": cf, "cu": cu, "rx": rx, "ry": ry, "rz": rz, "rzDown": rz_down}, "eye": [f_eye, u_eye], "livery": livery,
              "tris": C.tri_count(helmet_ob), "lensTris": C.tri_count(lens_ob), "replaced": old_helmet.name if old_helmet else None,
              "replacedTris": C.tri_count(old_helmet) if old_helmet else 0}
    return helmet_ob, lens_ob, report
