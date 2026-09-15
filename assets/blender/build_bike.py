"""Modern trials bike -> public/models/bike.glb

blender -b --python assets/blender/build_bike.py [-- --no-bake] [-- --size 2048]

Blender frame while building: origin = REAR AXLE, +X forward, +Z up, -Y = camera side
(rider's left: chain, front sprocket, silencer, front disc). Exported Y-up so the render
gets +x forward, +y up, +z camera. Wheelbase 1.30, wheel radius 0.34.
Every named object keeps its own origin (documented in README.md) so the render can
rotate the swingarm about its pivot, slide fork_lower along the fork axis, spin the
wheels about their axles and scale shock_spring along its axis.
Two atlases (bike_body_<cw> for frame / bodywork / fork_upper with plates + sponsors, baked per
colourway -> KHR_materials_variants bike_rookie / bike_pro; bike_mech for the rest), spokes as
child meshes + `<wheel>_blur` alpha cards; `-- --lod` writes bike-lod.glb (<= 6k tris).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
from common import MeshBuilder, V, log, prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
NO_BAKE = "--no-bake" in ARGS
LOD = "--lod" in ARGS  # public/models/bike-lod.glb: <= 6k tris, 512 atlases, same nodes / materials / variants
SIZE = int(ARGS[ARGS.index("--size") + 1]) if "--size" in ARGS else (512 if LOD else 1024)
MESHOPT = "--no-meshopt" not in ARGS
LOD_TRIS = 5800
OUT_NAME = "bike-lod" if LOD else "bike"
if LOD:
    C.set_detail(0.5)
prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube = (C.scaled(f) for f in (prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube))

# colourways = the render's bike liveries (src/render/bike/livery.ts): Rookie metallic blue, white
# plate, black 7; Pro charcoal plastics, gunmetal frame, yellow plate, red 1. Baked as two body
# albedos -> KHR_materials_variants bike_rookie / bike_pro on frame / bodywork / fork_upper.
COLOURWAYS = dict(
    rookie=dict(PAINT=(0.02, 0.11, 0.62), FRAME=(0.02, 0.11, 0.62), PLATE=(0.86, 0.87, 0.87), INK=(0.07, 0.07, 0.08), LOGO=(0.92, 0.92, 0.93), num_u=0.0, num_v=2 / 8),
    pro=dict(PAINT=(0.05, 0.05, 0.055), FRAME=(0.14, 0.15, 0.17), PLATE=(0.95, 0.76, 0.10), INK=(0.78, 0.14, 0.10), LOGO=(0.92, 0.72, 0.05), num_u=2 / 8, num_v=2 / 8),
)
_DC = None
SHEET = None

WB = 1.30
R_WHEEL = 0.34
# render BIKE constants (axle-midpoint frame) shifted to the rear-axle frame: x + 0.65, y -> z
P = dict(
    rear=V(0.0, 0, 0.0),
    front=V(WB, 0, 0.0),
    pivot=V(0.43, 0, 0.10),
    head_bot=V(1.08, 0, 0.50),
    head_top=V(1.00, 0, 0.68),
    bar=V(0.96, 0, 0.77),
    grip=V(0.92, 0, 0.78),
    grip_y=0.33,
    pegs=V(0.51, 0, 0.02),
    peg_y=0.20,
    seat=V(0.35, 0, 0.55),
    shock_top=V(0.60, 0, 0.52),
    shock_swing=0.55,
)
FORK_DIR = (P["head_bot"] - P["front"]).normalized()  # along the fork, upward
FORK_ANGLE = math.atan2(-FORK_DIR.x, FORK_DIR.z)  # rake from vertical (rad)

# ------------------------------------------------------------------------- materials
def paint_material(name, cw_key, decals_fn=None):
    """Metallic paint in the colourway colour with Pointiness edge wear and micro flake; `decals_fn(m, col)`
    composites the sponsor decals (object space of the part the material is on)."""
    m = C.new_mat(name, (0.02, 0.11, 0.62, 1), rough=0.32, metal=0.25)
    base = C.cw_rgb(m, cw_key)
    geo = C.node(m, "ShaderNodeNewGeometry", "GEO")
    wear = C.ramp(m, geo.outputs["Pointiness"], [(0.50, (0, 0, 0, 1)), (0.58, (0, 0, 0, 1)), (0.66, (1, 1, 1, 1))])
    grain = C.noise_fac(m, scale=180, detail=2)
    wear_mask = C.math_node(m, "MULTIPLY", C.math_node(m, "MULTIPLY", wear, grain), 1.6, clamp=True)
    bright = C.mix_rgb(m, 1.0, base, (1.18, 1.18, 1.18, 1), blend="MULTIPLY")
    flake = C.mix_rgb(m, C.ramp(m, C.noise_fac(m, scale=900, detail=1), [(0.35, (0, 0, 0, 1)), (0.65, (1, 1, 1, 1))]), base, bright)
    col = flake
    if decals_fn:
        col = decals_fn(m, col)
    col = C.mix_rgb(m, wear_mask, col, (0.55, 0.56, 0.58, 1))
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.set_metal_source(m, C.math_node(m, "MULTIPLY_ADD", wear_mask, 0.7, 0.25, clamp=True))
    C.link(m, C.math_node(m, "MULTIPLY_ADD", wear_mask, 0.15, 0.30), C.bsdf(m).inputs["Roughness"])
    C.bump(m, C.noise_fac(m, scale=600, detail=1), strength=0.04, distance=0.001)
    return m


def body_decals(m, col):
    """Sponsors on the bodywork (object origin = rear axle): VORTEX OIL on both shrouds, BOLT ENERGY
    across the tank top, APEX on the rear fender sides, class digit on both side plates."""
    LOGO, INK = C.cw_rgb(m, "LOGO"), C.cw_rgb(m, "INK")
    for sg in (-1, 1):
        n_out = Vector((0, sg, 0))
        ua = Vector((1, 0, 0)) if sg < 0 else Vector((-1, 0, 0))
        col = C.decal(m, col, SHEET, _DC["vortex"], Vector((0.82, sg * 0.14, 0.50)), ua, Vector((0, 0, 1)), 0.17, 0.045, LOGO, facing=n_out, min_facing=0.35, depth=0.10)
        col = C.decal(m, col, SHEET, _DC["apex"], Vector((-0.10, sg * 0.07, 0.43)), ua, Vector((0, 0, 1)), 0.09, 0.025, LOGO, facing=n_out, min_facing=0.35, depth=0.05)
        # side plate digit (plates are M["plate"] faces; the projection is shared so the digit lands on them)
    col = C.decal(m, col, SHEET, _DC["bolt"], Vector((0.80, 0, 0.765)), Vector((0, 1, 0)), Vector((-1, 0, 0)), 0.16, 0.04, LOGO, facing=Vector((0, 0, 1)), min_facing=0.5, depth=0.05)
    return col


def plate_material():
    """Number plates: colourway plate colour with the class digit on both side plates (bodywork object,
    origin = rear axle) and the front plate (fork_upper object, origin = head_bot)."""
    m = C.new_mat("plate", (0.85, 0.86, 0.86, 1), rough=0.45, metal=0.0)
    PLATE, INK = C.cw_rgb(m, "PLATE"), C.cw_rgb(m, "INK")
    col = C.mix_rgb(m, C.math_node(m, "MULTIPLY", C.noise_fac(m, scale=30, detail=2), 0.12), PLATE, (0.3, 0.3, 0.3, 1))
    for sg in (-1, 1):
        n_out = Vector((0, sg, 0))
        ua = Vector((1, 0, 0)) if sg < 0 else Vector((-1, 0, 0))
        va = Matrix.Rotation(-0.15, 4, "Y") @ Vector((0, 0, 1))
        col = C.decal(m, col, SHEET, _DC["d7"], Vector((0.06, sg * 0.092, 0.445)), ua, va, 0.082, 0.108, INK, facing=n_out, min_facing=0.5, depth=0.03, cell_key="num")
    # front plate (fork_upper local): centre = plate centre - head_bot, readable from the front
    n = FORK_DIR
    f = Vector((n.z, 0, -n.x))
    c = n * 0.03 + f * 0.054
    col = C.decal(m, col, SHEET, _DC["d7"], c, Vector((0, 1, 0)), n, 0.095, 0.125, INK, facing=f, min_facing=0.5, depth=0.03, cell_key="num")
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    return m


def make_materials():
    M = {}
    # -- metallic paint (plastics) + frame paint, colourway driven; sponsors on the plastics
    M["paint"] = paint_material("paint", "PAINT", body_decals)
    M["frame_paint"] = paint_material("frame_paint", "FRAME")
    # -- brushed alloy (swingarm, hubs, clamps, levers)
    m = C.new_mat("alloy_brushed", (0.62, 0.63, 0.65, 1), rough=0.38, metal=1.0)
    n = C.node(m, "ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 400
    n.inputs["Detail"].default_value = 1
    mp = C.node(m, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.02, 1, 1)
    C.link(m, C.texcoord(m).outputs["Object"], mp.inputs["Vector"])
    C.link(m, mp.outputs[0], n.inputs["Vector"])
    C.bump(m, n.outputs["Fac"], strength=0.12, distance=0.0005)
    C.link(m, C.math_node(m, "MULTIPLY_ADD", n.outputs["Fac"], 0.15, 0.30), C.bsdf(m).inputs["Roughness"])
    M["alloy"] = m
    # -- cast engine alloy
    m = C.new_mat("alloy_cast", (0.28, 0.28, 0.29, 1), rough=0.62, metal=0.85)
    f = C.noise_fac(m, scale=250, detail=3, rough=0.7)
    C.bump(m, f, strength=0.25, distance=0.0008)
    C.link(m, C.ramp(m, f, [(0.3, (0.22, 0.22, 0.23, 1)), (0.7, (0.34, 0.34, 0.35, 1))]), C.bsdf(m).inputs["Base Color"])
    M["cast"] = m
    # -- black matte plastic (fenders, shrouds back, guards)
    m = C.new_mat("plastic_black", (0.022, 0.022, 0.024, 1), rough=0.62, metal=0.0)
    C.bump(m, C.noise_fac(m, scale=300, detail=2), strength=0.06, distance=0.0005)
    M["black"] = m
    # -- black anodised (fork lowers, pegs, bar clamps)
    m = C.new_mat("anodised_black", (0.03, 0.03, 0.034, 1), rough=0.33, metal=0.9)
    M["anod"] = m
    # -- gold anodised stanchions
    m = C.new_mat("anodised_gold", (0.78, 0.55, 0.22, 1), rough=0.18, metal=1.0)
    M["gold"] = m
    # -- rubber: grain + a knob-row bump in wheel polar coordinates (object origin = axle, axis y), so
    # the tread reads in the normal map between the geometric knobs and on the knob-less LOD tyre
    m = C.new_mat("rubber", (0.016, 0.016, 0.016, 1), rough=0.88, metal=0.0)
    f = C.noise_fac(m, scale=120, detail=3, rough=0.6)
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ang = C.math_node(m, "ARCTAN2", sep.outputs["Z"], sep.outputs["X"])
    row = C.math_node(m, "FLOOR", C.math_node(m, "MULTIPLY_ADD", sep.outputs["Y"], 1 / 0.03, 0.5))
    parity = C.math_node(m, "MULTIPLY", C.math_node(m, "MODULO", C.math_node(m, "ABSOLUTE", row), 2.0), 0.5)
    au = C.math_node(m, "FRACT", C.math_node(m, "MULTIPLY_ADD", ang, 30 / C.TAU, parity))
    av = C.math_node(m, "FRACT", C.math_node(m, "MULTIPLY_ADD", sep.outputs["Y"], 1 / 0.03, 0.5))
    band = lambda x: C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", x, 0.22), C.math_node(m, "LESS_THAN", x, 0.78))  # noqa: E731
    knob = C.math_node(m, "MULTIPLY", band(au), band(av))
    # only on the tread (radius > rim + a bit): r = length(x, z)
    r = C.math_node(m, "SQRT", C.math_node(m, "ADD", C.math_node(m, "MULTIPLY", sep.outputs["X"], sep.outputs["X"]), C.math_node(m, "MULTIPLY", sep.outputs["Z"], sep.outputs["Z"])))
    knob = C.math_node(m, "MULTIPLY", knob, C.math_node(m, "GREATER_THAN", r, 0.30))
    height = C.math_node(m, "MULTIPLY_ADD", knob, 0.6, C.math_node(m, "MULTIPLY", f, 0.4))
    C.bump(m, height, strength=0.45, distance=0.003)
    C.link(m, C.ramp(m, C.math_node(m, "MULTIPLY_ADD", knob, 0.5, C.math_node(m, "MULTIPLY", f, 0.5)), [(0.3, (0.012, 0.012, 0.012, 1)), (0.7, (0.03, 0.03, 0.028, 1))]), C.bsdf(m).inputs["Base Color"])
    C.link(m, C.math_node(m, "MULTIPLY_ADD", knob, -0.12, 0.90), C.bsdf(m).inputs["Roughness"])
    M["rubber"] = m
    # -- stainless header with heat tint near the port (object x > 0.7 and z > 0.4 is hot)
    m = C.new_mat("steel_header", (0.45, 0.45, 0.47, 1), rough=0.35, metal=1.0)
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    heat = C.math_node(m, "MULTIPLY_ADD", sep.outputs["Z"], 2.5, -0.9, clamp=True)
    tint = C.ramp(m, heat, [(0.0, (0.42, 0.42, 0.44, 1)), (0.55, (0.55, 0.45, 0.28, 1)), (0.8, (0.38, 0.28, 0.42, 1)), (1.0, (0.22, 0.28, 0.45, 1))])
    C.link(m, tint, C.bsdf(m).inputs["Base Color"])
    M["steel"] = m
    # -- seat cover: grippy black fabric
    m = C.new_mat("seat", (0.04, 0.04, 0.042, 1), rough=0.92, metal=0.0)
    w = C.node(m, "ShaderNodeTexWave")
    w.wave_type = "BANDS"
    w.inputs["Scale"].default_value = 220
    C.link(m, C.texcoord(m).outputs["Object"], w.inputs["Vector"])
    C.bump(m, w.outputs["Fac"], strength=0.15, distance=0.0005)
    M["seat"] = m
    # -- number plates (colourway colour + class digit)
    M["white"] = plate_material()
    # -- fork guards: black plastic with IRONWORKS down the front (fork_lower object, origin = front axle)
    m = C.new_mat("guard", (0.022, 0.022, 0.024, 1), rough=0.6, metal=0.0)
    n = FORK_DIR
    f = Vector((n.z, 0, -n.x))
    col = C.mix_rgb(m, C.math_node(m, "MULTIPLY", C.noise_fac(m, scale=40, detail=2), 0.15), (0.022, 0.022, 0.024, 1), (0.05, 0.05, 0.052, 1))
    for sg in (-1, 1):
        c = n * 0.24 + Vector((0, sg * 0.10, 0)) + f * 0.036
        col = C.decal(m, col, SHEET, _DC["ironworks"], c, n, Vector((0, -sg, 0)), 0.20, 0.045, (0.85, 0.85, 0.86, 1), facing=f, min_facing=0.5, depth=0.03)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    M["guard"] = m
    # -- swingarm alloy with IRONWORKS on the camera-side arm (swingarm object, origin = pivot)
    m = C.new_mat("alloy_swing", (0.62, 0.63, 0.65, 1), rough=0.38, metal=1.0)
    c = (P["pivot"].lerp(P["rear"], 0.5) - P["pivot"]) + Vector((0, -0.134, 0.0))
    col = C.decal(m, (0.62, 0.63, 0.65, 1), SHEET, _DC["nordvik"], c, Vector((1, 0, 0)), Vector((0, 0, 1)), 0.14, 0.035, (0.05, 0.05, 0.06, 1), facing=Vector((0, -1, 0)), min_facing=0.5, depth=0.03)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.link(m, C.math_node(m, "MULTIPLY_ADD", C.noise_fac(m, scale=400, detail=1), 0.15, 0.30), C.bsdf(m).inputs["Roughness"])
    M["alloy_swing"] = m
    # -- front fender: black plastic with NORDVIK on the nose (fork_upper object, origin = head_bot)
    m = C.new_mat("fender", (0.022, 0.022, 0.024, 1), rough=0.62, metal=0.0)
    a = math.radians(42)
    c = V(0.40 * math.cos(a), 0, 0.40 * math.sin(a))
    col = C.decal(m, (0.022, 0.022, 0.024, 1), SHEET, _DC["nordvik"], c, Vector((0, 1, 0)), Vector((-math.sin(a), 0, math.cos(a))), 0.10, 0.028, (0.85, 0.85, 0.86, 1), facing=Vector((math.cos(a), 0, math.sin(a))), min_facing=0.4, depth=0.04)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.bump(m, C.noise_fac(m, scale=300, detail=2), strength=0.06, distance=0.0005)
    M["fender"] = m
    # -- red anodised accents (chain guide, caliper)
    m = C.new_mat("anodised_red", (0.55, 0.05, 0.04, 1), rough=0.3, metal=0.8)
    M["red"] = m
    # -- steel disc (brake rotors): turned rings + two rows of drilled holes (wheel polar coords)
    m = C.new_mat("steel_disc", (0.55, 0.55, 0.56, 1), rough=0.35, metal=1.0)
    ring = C.node(m, "ShaderNodeTexWave")
    ring.wave_type = "RINGS"
    ring.rings_direction = "SPHERICAL"
    ring.inputs["Scale"].default_value = 40
    C.link(m, C.texcoord(m).outputs["Object"], ring.inputs["Vector"])
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ang = C.math_node(m, "ARCTAN2", sep.outputs["Z"], sep.outputs["X"])
    r = C.math_node(m, "SQRT", C.math_node(m, "ADD", C.math_node(m, "MULTIPLY", sep.outputs["X"], sep.outputs["X"]), C.math_node(m, "MULTIPLY", sep.outputs["Z"], sep.outputs["Z"])))
    rr = C.math_node(m, "MULTIPLY_ADD", r, 1 / 0.024, 0.0)
    row = C.math_node(m, "FLOOR", rr)
    parity = C.math_node(m, "MULTIPLY", C.math_node(m, "MODULO", row, 2.0), 0.5)
    au = C.math_node(m, "SUBTRACT", C.math_node(m, "FRACT", C.math_node(m, "MULTIPLY_ADD", ang, 18 / C.TAU, parity)), 0.5)
    av = C.math_node(m, "SUBTRACT", C.math_node(m, "FRACT", rr), 0.5)
    d2 = C.math_node(m, "ADD", C.math_node(m, "MULTIPLY", au, au), C.math_node(m, "MULTIPLY", av, av))
    hole = C.math_node(m, "MULTIPLY", C.math_node(m, "LESS_THAN", d2, 0.045), C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", r, 0.05), C.math_node(m, "LESS_THAN", r, 0.096)))
    C.link(m, C.mix_rgb(m, hole, (0.55, 0.55, 0.56, 1), (0.06, 0.06, 0.06, 1)), C.bsdf(m).inputs["Base Color"])
    C.link(m, C.math_node(m, "MULTIPLY_ADD", hole, 0.5, 0.32), C.bsdf(m).inputs["Roughness"])
    C.bump(m, C.math_node(m, "MULTIPLY_ADD", hole, -1.0, C.math_node(m, "MULTIPLY", ring.outputs["Fac"], 0.3)), strength=0.5, distance=0.0008)
    M["disc"] = m
    return M


# ------------------------------------------------------------------------- helpers
def loft(sections, closed_ring=True, cap_ends=True):
    """Bridge consecutive rings of equal point count into a skin."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in s] for s in sections]
    for A, B in zip(rings[:-1], rings[1:]):
        n = len(A)
        for i in range(n if closed_ring else n - 1):
            j = (i + 1) % n
            bm.faces.new([A[i], A[j], B[j], B[i]])
    if cap_ends and closed_ring:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def superellipse_ring(center, half_w, half_h, n=16, power=2.6, top_bias=0.0, tilt=0.0):
    """Ring in the YZ plane around `center` (x = center.x), rounded-rectangle-ish section."""
    pts = []
    ct, st = math.cos(tilt), math.sin(tilt)
    for i in range(n):
        a = C.TAU * i / n
        cs, sn = math.cos(a), math.sin(a)
        y = math.copysign(abs(cs) ** (2 / power), cs) * half_w
        z = math.copysign(abs(sn) ** (2 / power), sn) * half_h
        if top_bias and z > 0:
            z *= 1 + top_bias
        # tilt in XZ
        x = center.x + z * st
        zz = center.z + z * ct
        pts.append(Vector((x, center.y + y, zz)))
    return pts


def add_cyl(b, a, c, r1, r2=None, mat=None, seg=12, cap=True, group=None, sharp=None):
    bm, M = C.cyl_between(a, c, r1, r2, seg=C.S(seg), cap=cap)
    b.add(bm, M, mat, group=group, sharp_angle=sharp)
    bm.free()


def add_box(b, center, size, mat, bevel=0.004, rot=None, seg=2, group=None, sharp=40):
    bm = prim_box(*size, bevel=bevel, segments=seg)
    M = Matrix.Translation(center) @ (rot or Matrix.Identity(4))
    b.add(bm, M, mat, group=group, sharp_angle=sharp)
    bm.free()


def add_sphere(b, center, r, mat, seg=14, rings=8, scale=(1, 1, 1), group=None):
    bm = prim_sphere(r, seg=seg, rings=rings, scale=scale)
    b.add(bm, Matrix.Translation(center), mat, group=group)
    bm.free()


def add_tube(b, pts, r, mat, sides=8, samples=5, closed=False, cap=True, smooth=True, group=None, radius_fn=None):
    bm = prim_tube(pts, r, sides=sides, samples=samples, closed=closed, cap=cap, smooth_path=smooth, radius_fn=radius_fn)
    b.add(bm, Matrix.Identity(4), mat, group=group)
    bm.free()


ROT_Z2Y = Matrix.Rotation(math.radians(-90), 4, "X")  # +Z primitive axis -> +Y (wheel spin axis)
ROT_Z2X = Matrix.Rotation(math.radians(90), 4, "Y")  # +Z -> +X


def set_origin(ob, world_point):
    """Move the object's origin to `world_point` without moving the geometry."""
    p = Vector(world_point)
    me = ob.data
    for v in me.vertices:
        v.co -= p
    ob.location = p


def finish(b, origin, parent=None):
    ob = b.build()
    set_origin(ob, origin)
    for p in ob.data.polygons:
        p.use_smooth = True
    if parent:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob


# ------------------------------------------------------------------------- parts
def build_wheel(name, M, rim_r, section, disc_side, sprocket_side=None):
    """Wheel around +Y through the origin; disc at y = disc_side * 0.075."""
    b = MeshBuilder(name)
    Rt = rim_r + section  # ~0.34
    # tyre carcass: a round section of diameter `section` sitting on the rim (21" front: 0.073 tall,
    # 18" rear: 0.11 tall), revolved around +Z then rotated to +Y
    prof = []
    n = 12
    hw = section * 0.5
    for i in range(n + 1):
        a = -math.pi / 2 + math.pi * i / n
        r = rim_r + section * (0.5 + 0.5 * math.cos(a) ** 0.8)
        w = math.sin(a) * hw * 1.05
        prof.append((r, w))
    bm = prim_lathe(prof, seg=44, cap=False)
    b.add(bm, ROT_Z2Y, M["rubber"])
    bm.free()
    # inner sidewall to the rim bead
    bm = prim_lathe([(rim_r + section * 0.5, -hw * 1.05), (rim_r + 0.01, -hw * 0.7), (rim_r - 0.012, -hw * 0.45), (rim_r - 0.012, hw * 0.45), (rim_r + 0.01, hw * 0.7), (rim_r + section * 0.5, hw * 1.05)], seg=44, cap=False)
    b.add(bm, ROT_Z2Y, M["rubber"])
    bm.free()
    # knobs: 3 rows (centre + 2 shoulders), alternating offsets
    knob_n = 30 if section > 0.09 else 26
    kh = 0.011  # knob height
    rows = [] if LOD else [(0.0, 0.0, 0.026, hw * 0.55), (hw * 0.62, 0.75, 0.020, hw * 0.5), (-hw * 0.62, -0.75, 0.020, hw * 0.5)]
    for row, (wy, tilt, kx, ky) in enumerate(rows):
        for i in range(knob_n):
            a = C.TAU * (i + (0.5 if row else 0.0)) / knob_n
            if row == 0 and i % 2:
                kxx, kyy = kx * 0.75, ky * 1.25
            else:
                kxx, kyy = kx, ky
            rr = Rt - kh * 0.5 + 0.002 - (0.004 if row else 0.0) - (0.006 if row else 0.0) * 0.5
            rr = rim_r + section * (0.5 + 0.5 * math.cos(tilt) ** 0.8) - kh * 0.35
            pos = Vector((rr * math.cos(a), wy, rr * math.sin(a)))
            bm = prim_box(kh, kyy, kxx, bevel=0.0025, segments=1)
            b.add(bm, Matrix.Translation(pos) @ Matrix.Rotation(-a, 4, "Y") @ Matrix.Rotation(tilt, 4, "X"), M["rubber"], sharp_angle=50)
            bm.free()
    # rim: channel section
    rw = 0.02 if section > 0.09 else 0.016
    bm = prim_lathe([(rim_r - 0.014, -rw), (rim_r - 0.001, -rw - 0.004), (rim_r + 0.006, -rw + 0.002), (rim_r - 0.006, 0), (rim_r + 0.006, rw - 0.002), (rim_r - 0.001, rw + 0.004), (rim_r - 0.014, rw), (rim_r - 0.022, rw * 0.6), (rim_r - 0.022, -rw * 0.6)], seg=40, closed=True)
    b.add(bm, ROT_Z2Y, M["alloy"], sharp_angle=45)
    bm.free()
    # hub + flanges
    bm = prim_lathe([(0.0, -0.075), (0.028, -0.075), (0.028, -0.055), (0.052, -0.05), (0.052, -0.04), (0.036, -0.035), (0.036, 0.035), (0.052, 0.04), (0.052, 0.05), (0.028, 0.055), (0.028, 0.075), (0.0, 0.075)], seg=20, cap=False)
    b.add(bm, ROT_Z2Y, M["alloy"], sharp_angle=40)
    bm.free()
    # axle nut / spacer
    bm = prim_cylinder(0.014, 0.014, 0.19, seg=8)
    b.add(bm, ROT_Z2Y @ Matrix.Translation((0, 0, -0.095)), M["anod"])
    bm.free()
    # spokes: 32 (LOD 16), alternating sides and cross-2 lacing — a separate child mesh
    # `<wheel>_spokes` so the render can hide it at speed and show the blur card instead
    bs = MeshBuilder(name + "_spokes")
    ns = 32 if not LOD else 16
    for i in range(ns):
        a = C.TAU * i / ns
        side = 1 if i % 2 == 0 else -1
        cross = 1 if (i // 2) % 2 == 0 else -1
        a_hub = a + cross * (C.TAU / ns) * 2.0
        hub = Vector((0.048 * math.cos(a_hub), side * 0.046, 0.048 * math.sin(a_hub)))
        rim = Vector(((rim_r - 0.018) * math.cos(a), side * 0.004, (rim_r - 0.018) * math.sin(a)))
        bm, M4 = C.cyl_between(hub, rim, 0.0018, 0.0018, seg=3 if LOD else 4, cap=False)
        bs.add(bm, M4, M["alloy"])
        bm.free()
    # disc rotor
    ds = disc_side
    bm = prim_lathe([(0.03, -0.0025), (0.105, -0.0025), (0.105, 0.0025), (0.03, 0.0025)], seg=36, closed=True)
    b.add(bm, ROT_Z2Y @ Matrix.Translation((0, 0, ds * 0.074)), M["disc"], sharp_angle=40)
    bm.free()
    # rotor carrier spider
    for i in range(6):
        a = C.TAU * i / 6
        add_box(b, Vector((0.05 * math.cos(a), ds * 0.068, 0.05 * math.sin(a))), (0.045, 0.006, 0.012), M["anod"], rot=Matrix.Rotation(-a, 4, "Y"), bevel=0.001, seg=1)
    ob = finish(b, (0, 0, 0))
    spokes = finish(bs, (0, 0, 0))
    spokes.parent = ob
    # blur card: a flat annulus hub -> rim with the radial-streak alpha texture, both faces
    bc = MeshBuilder(name + "_blur")
    for sd in (-1, 1):
        bm = prim_lathe([(0.052, sd * 0.008), (rim_r - 0.016, sd * 0.008)], seg=32, cap=False)
        if sd < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bc.add(bm, ROT_Z2Y, M["spokecard"])
        bm.free()
    card = finish(bc, (0, 0, 0))
    card.parent = ob
    uv = card.data.uv_layers.new(name="UVMap")
    Rr = rim_r
    for poly in card.data.polygons:
        for li in poly.loop_indices:
            co = card.data.vertices[card.data.loops[li].vertex_index].co
            uv.data[li].uv = (0.5 + co.x / (2 * Rr), 0.5 + co.z / (2 * Rr))
    return ob, spokes, card


def spokecard_material():
    """128x128 RGBA radial-streak card (grey, alpha) for the at-speed wheel: `bike_spokecard`, glTF BLEND."""
    n = 128
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (xx + 0.5) / n - 0.5
    y = (yy + 0.5) / n - 0.5
    r = np.sqrt(x * x + y * y) * 2  # 0 at centre, 1 at the rim
    ang = np.arctan2(y, x)
    rng = np.random.default_rng(7)
    streak = 0.5 + 0.5 * np.sin(ang * 32 + rng.uniform(0, 6.28)) * 0.6 + 0.2 * np.sin(ang * 96 + 1.3)
    streak = np.clip(streak, 0, 1)
    ring = np.clip((r - 0.22) / 0.06, 0, 1) * np.clip((0.97 - r) / 0.05, 0, 1)
    alpha = ring * (0.30 + 0.30 * streak)
    px = np.zeros((n, n, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = 0.55 + 0.25 * streak
    px[..., 3] = alpha
    img = bpy.data.images.new("bike_spokecard", n, n, alpha=True)
    img.pixels.foreach_set(px.ravel())
    p = os.path.join(C.BAKE_DIR, "bike_spokecard.png")
    os.makedirs(C.BAKE_DIR, exist_ok=True)
    img.filepath_raw = p
    img.file_format = "PNG"
    img.save()
    m = C.new_mat("bike_spokecard", rough=0.5, metal=0.6)
    m.blend_method = "BLEND"
    m.use_backface_culling = False
    t = C.node(m, "ShaderNodeTexImage")
    t.image = bpy.data.images.load(p)
    t.image.alpha_mode = "STRAIGHT"
    t.extension = "EXTEND"
    C.link(m, t.outputs["Color"], C.bsdf(m).inputs["Base Color"])
    C.link(m, t.outputs["Alpha"], C.bsdf(m).inputs["Alpha"])
    return m


def build_sprocket(name, centre, r, teeth, thick, M, mat):
    b = MeshBuilder(name)
    bm = bmesh.new()
    top, bot = [], []
    for i in range(teeth * 2):
        a = C.TAU * i / (teeth * 2)
        rr = r if i % 2 == 0 else r - 0.009
        top.append(bm.verts.new((rr * math.cos(a), thick / 2, rr * math.sin(a))))
        bot.append(bm.verts.new((rr * math.cos(a), -thick / 2, rr * math.sin(a))))
    n = len(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([top[i], top[j], bot[j], bot[i]])
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    b.add(bm, Matrix.Translation(centre), mat, smooth=False)
    bm.free()
    # lightening holes as a ring of dark discs? keep: centre boss
    bm = prim_cylinder(r * 0.35, r * 0.35, thick + 0.004, seg=16)
    b.add(bm, Matrix.Translation(centre) @ ROT_Z2Y @ Matrix.Translation((0, 0, -(thick + 0.004) / 2)), M["anod"], sharp_angle=40)
    bm.free()
    return finish(b, centre)


def chain_path(c1, r1, c2, r2, y):
    """Closed path around two circles in the XZ plane (external tangents), sampled densely."""
    d = (c2 - c1)
    L = d.length
    ang = math.atan2(d.z, d.x)
    off = math.asin((r2 - r1) / L) if L > 0 else 0
    pts = []
    # upper run: from c1 to c2 along tangent, wrap c2, lower run back, wrap c1
    def arc(c, r, a0, a1, n):
        out = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            out.append(Vector((c.x + r * math.cos(a), y, c.z + r * math.sin(a))))
        return out
    a_up = ang + math.pi / 2 + off
    a_dn = ang - math.pi / 2 - off
    pts += arc(c2, r2, a_up, a_dn + C.TAU if a_dn < a_up else a_dn, 26)[:-1]
    pts += arc(c1, r1, a_dn + C.TAU if a_dn < a_up else a_dn, a_up + C.TAU, 60)[:-1]
    return pts


def belt_sample(u, rear, rr, front, fr):
    """Clockwise chain path: upper tangent rear -> front, then both sprocket wraps."""
    d = front - rear
    distance = math.hypot(d.x, d.z)
    phi = math.atan2(d.z, d.x)
    alpha = math.acos((rr - fr) / distance)
    upper, lower = phi + alpha, phi - alpha
    tangent = math.sqrt(distance * distance - (rr - fr) ** 2)
    front_arc, rear_arc = 2 * alpha * fr, (C.TAU - 2 * alpha) * rr
    total = 2 * tangent + front_arc + rear_arc
    v = (u % 1) * total
    if v < tangent:
        k = v / tangent
        a = rear + V(rr * math.cos(upper), 0, rr * math.sin(upper))
        b = front + V(fr * math.cos(upper), 0, fr * math.sin(upper))
        point, angle = a.lerp(b, k), upper
    elif v < tangent + front_arc:
        angle = upper - (v - tangent) / fr
        point = front + V(fr * math.cos(angle), 0, fr * math.sin(angle))
    elif v < 2 * tangent + front_arc:
        k = (v - tangent - front_arc) / tangent
        a = front + V(fr * math.cos(lower), 0, fr * math.sin(lower))
        b = rear + V(rr * math.cos(lower), 0, rr * math.sin(lower))
        point, angle = a.lerp(b, k), lower
    else:
        angle = lower - (v - 2 * tangent - front_arc) / rr
        point = rear + V(rr * math.cos(angle), 0, rr * math.sin(angle))
    return point, V(math.cos(angle), 0, math.sin(angle)), total


def build_chain(M, c_rear, r_rear, c_front, r_front, y):
    # UV.u is an arc-length fraction of the closed loop, UV.v identifies the tube corner.
    # These stable parameters survive meshopt vertex reordering and let runtime deform the
    # actual exported chain mesh; chain topology is excluded from collapse decimation.
    count = 48 if LOD else 96
    radius = 0.006
    vertices, faces = [], []
    for i in range(count):
        point, normal, total = belt_sample(i / count, c_rear, r_rear, c_front, r_front)
        point.y = y
        for corner in range(4):
            angle = C.TAU * corner / 4
            vertices.append(point + normal * (radius * math.cos(angle)) + V(0, radius * math.sin(angle), 0))
    for i in range(count):
        for corner in range(4):
            faces.append((i * 4 + corner, ((i + 1) % count) * 4 + corner,
                          ((i + 1) % count) * 4 + (corner + 1) % 4, i * 4 + (corner + 1) % 4))
    me = bpy.data.meshes.new("chain")
    me.from_pydata(vertices, [], faces)
    me.materials.append(M["chain"])
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        poly.use_smooth = True
        ring = poly.index // 4
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            index, corner = divmod(vi, 4)
            u = 1.0 if ring == count - 1 and index == 0 else index / count
            uv.data[li].uv = (u, corner / 4)
    ob = bpy.data.objects.new("chain", me)
    bpy.context.scene.collection.objects.link(ob)
    ob["tube_radius"] = radius
    ob["link_pitch"] = 0.0127
    ob["rest_length"] = total
    mapping = C.node(M["chain"], "ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (total / 0.0127, 1, 1)
    tex = next(node for node in M["chain"].node_tree.nodes if node.type == "TEX_IMAGE")
    C.link(M["chain"], C.texcoord(M["chain"]).outputs["UV"], mapping.inputs["Vector"])
    C.link(M["chain"], mapping.outputs["Vector"], tex.inputs["Vector"])
    return ob


def chain_material():
    """Tiling chain-link texture (one link per UV unit): plates dark, pins bright."""
    w, h = 64, 32
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[..., 3] = 1
    px[..., :3] = 0.08
    # side plates: two bands
    px[4:11, :, :3] = 0.35
    px[21:28, :, :3] = 0.35
    # pin heads at the ends of each link
    for cx in (8, 56):
        yy, xx = np.ogrid[:h, :w]
        m = (xx - cx) ** 2 + (yy - 16) ** 2 < 5 ** 2
        px[m, :3] = 0.7
    # rollers between
    px[12:20, 16:48, :3] = 0.45
    img = bpy.data.images.new("chain_links", w, h)
    img.pixels.foreach_set(px.ravel())
    p = os.path.join(C.BAKE_DIR, "chain_links.png")
    os.makedirs(C.BAKE_DIR, exist_ok=True)
    img.filepath_raw = p
    img.file_format = "PNG"
    img.save()
    m = C.new_mat("chain_links", rough=0.45, metal=1.0)
    t = C.node(m, "ShaderNodeTexImage")
    t.image = bpy.data.images.load(p)
    t.extension = "REPEAT"
    t.interpolation = "Linear"
    C.link(m, t.outputs["Color"], C.bsdf(m).inputs["Base Color"])
    return m


def build_frame(M):
    b = MeshBuilder("frame")
    hb, ht, pv = P["head_bot"], P["head_top"], P["pivot"]
    paint = M["frame_paint"]
    # head tube along the fork axis, from a bit below head_bot to a bit above head_top
    add_cyl(b, hb - FORK_DIR * 0.02, ht + FORK_DIR * 0.02, 0.032, 0.032, paint, seg=14)
    # twin spars: from the head tube, out and back over the engine, down to the pivot plates
    for s in (-1, 1):
        pts = [V(1.02, s * 0.03, 0.66), V(0.86, s * 0.075, 0.64), V(0.66, s * 0.085, 0.58), V(0.52, s * 0.08, 0.45), V(0.45, s * 0.072, 0.30), V(0.43, s * 0.068, 0.16)]
        add_tube(b, pts, 0.021, paint, sides=8, samples=5, radius_fn=lambda u: 0.024 - 0.005 * u)
        # pivot plates
        add_box(b, V(0.44, s * 0.075, 0.13), (0.09, 0.012, 0.14), paint, bevel=0.01)
        # cradle rails: pivot plate bottom -> under the engine -> down tube foot
        add_tube(b, [V(0.44, s * 0.07, 0.07), V(0.55, s * 0.08, 0.055), V(0.80, s * 0.08, 0.07), V(0.98, s * 0.05, 0.22)], 0.014, paint, sides=8, samples=4)
        # subframe: spar -> seat rail -> rear
        add_tube(b, [V(0.62, s * 0.075, 0.58), V(0.40, s * 0.08, 0.52), V(0.17, s * 0.075, 0.47)], 0.012, paint, sides=8, samples=4)
        add_tube(b, [V(0.47, s * 0.07, 0.30), V(0.30, s * 0.075, 0.40), V(0.17, s * 0.075, 0.47)], 0.011, paint, sides=8, samples=4)
        # peg hanger bracket
        add_box(b, V(0.52, s * 0.10, 0.06), (0.06, 0.04, 0.03), M["anod"], bevel=0.005)
    # downtube: head bottom -> down in front of the engine -> cradle
    add_tube(b, [V(1.04, 0, 0.50), V(0.99, 0, 0.36), V(0.98, 0, 0.22)], 0.020, paint, sides=10, samples=4)
    # cross members
    add_cyl(b, V(0.17, -0.075, 0.47), V(0.17, 0.075, 0.47), 0.011, mat=paint, seg=8)
    add_cyl(b, V(0.43, -0.09, 0.16), V(0.43, 0.09, 0.16), 0.016, mat=M["anod"], seg=10)  # pivot bolt
    # bash plate: aluminium tray under the engine
    add_box(b, V(0.72, 0, 0.055), (0.46, 0.20, 0.014), M["alloy"], bevel=0.005, rot=Matrix.Rotation(0.06, 4, "Y"))
    add_box(b, V(0.96, 0, 0.10), (0.05, 0.20, 0.10), M["alloy"], bevel=0.008, rot=Matrix.Rotation(0.5, 4, "Y"))
    # radiator core between the downtube and the front of the cylinder
    add_box(b, V(0.905, 0, 0.50), (0.05, 0.19, 0.22), M["black"], bevel=0.004, rot=Matrix.Rotation(0.2, 4, "Y"))
    add_box(b, V(0.905, 0, 0.62), (0.06, 0.20, 0.03), M["black"], bevel=0.006)
    add_box(b, V(0.905, 0, 0.38), (0.06, 0.20, 0.03), M["black"], bevel=0.006)
    # radiator cap
    add_cyl(b, V(0.905, 0.04, 0.63), V(0.905, 0.04, 0.655), 0.018, mat=M["anod"], seg=10)
    # rear axle adjuster blocks live on the swingarm; chain guard / rear brake reservoir here
    return finish(b, (0, 0, 0))


def build_bodywork(M):
    """Slim tank -> seat unit -> rear mudguard, radiator shrouds, side plates."""
    b = MeshBuilder("bodywork")
    paint = M["paint"]
    # tank + seat unit: loft of superellipse rings along x, top follows the frame spars then flattens
    secs = []
    spine = [
        # x, halfw, halfh, zc, tilt
        (1.00, 0.055, 0.020, 0.700, 0.0),
        (0.94, 0.085, 0.045, 0.705, 0.0),
        (0.84, 0.105, 0.062, 0.700, 0.0),
        (0.72, 0.11, 0.070, 0.665, 0.0),
        (0.60, 0.105, 0.060, 0.615, 0.0),
        (0.50, 0.095, 0.045, 0.565, 0.0),
        (0.40, 0.090, 0.040, 0.545, 0.0),
        (0.30, 0.085, 0.035, 0.535, 0.0),
        (0.20, 0.080, 0.032, 0.528, 0.0),
        (0.10, 0.075, 0.030, 0.522, 0.0),
        (0.00, 0.070, 0.028, 0.512, 0.0),
        (-0.06, 0.055, 0.020, 0.495, 0.0),
        (-0.09, 0.035, 0.010, 0.480, 0.0),
    ]
    for (x, hw, hh, zc, tilt) in spine:
        secs.append(superellipse_ring(V(x, 0, zc), hw, hh, n=16, power=2.4, tilt=tilt))
    bm = loft(secs)
    b.add(bm, Matrix.Identity(4), paint)
    bm.free()
    # seat pad: from x 0.55 back to 0.05, a flatter black slab on top of the unit
    secs = []
    for (x, hw, hh, zc) in [(0.56, 0.06, 0.010, 0.612), (0.50, 0.075, 0.016, 0.586), (0.40, 0.078, 0.016, 0.567), (0.30, 0.076, 0.015, 0.558), (0.20, 0.072, 0.014, 0.551), (0.10, 0.066, 0.012, 0.545), (0.04, 0.05, 0.008, 0.538)]:
        secs.append(superellipse_ring(V(x, 0, zc), hw, hh, n=16, power=3.0))
    bm = loft(secs)
    b.add(bm, Matrix.Identity(4), M["seat"])
    bm.free()
    # rear mudguard: curved shell over the rear tyre from the seat back down behind the wheel
    secs = []
    for i in range(9):
        a = math.radians(62 + i * 13)  # angle around the rear axle, from ahead-top (62 deg) over to behind (166 deg)
        r = R_WHEEL + 0.07 + (0.03 * i / 8)
        c = V(r * math.cos(a), 0, r * math.sin(a))
        hw = 0.075 - 0.015 * (i / 8)
        # ring tangent to the arc: build a flat arch section (y across, small radial thickness)
        ring = []
        n = 12
        for j in range(n):
            t = C.TAU * j / n
            y = math.cos(t) * hw
            rad = 0.004 * math.sin(t) + (0.012 if abs(math.cos(t)) < 0.5 else 0.0) * math.sin(t)
            # arch: edges droop a little
            rr = r + rad - 0.012 * (abs(y) / hw) ** 2
            ring.append(V(rr * math.cos(a), y, rr * math.sin(a)))
        secs.append(ring)
    bm = loft(secs, cap_ends=True)
    b.add(bm, Matrix.Identity(4), paint)  # body-colour rear fender like the reference
    bm.free()
    # radiator shrouds: two winged plates from the tank front sweeping back and down
    for s in (-1, 1):
        secs = []
        for (x, y, z, hw, hh) in [(1.00, s * 0.075, 0.60, 0.006, 0.09), (0.93, s * 0.135, 0.56, 0.008, 0.13), (0.85, s * 0.145, 0.50, 0.008, 0.14), (0.75, s * 0.135, 0.45, 0.007, 0.12), (0.66, s * 0.11, 0.42, 0.006, 0.09), (0.60, s * 0.09, 0.42, 0.004, 0.05)]:
            ring = []
            n = 10
            for j in range(n):
                t = C.TAU * j / n
                ring.append(V(x + math.cos(t) * hw, y + s * (0.5 * math.sin(t) * hw), z + math.sin(t) * hh))
            secs.append(ring)
        bm = loft(secs)
        b.add(bm, Matrix.Identity(4), paint, sharp_angle=50)
        bm.free()
    # side number plates on the rear fender flanks, behind the rider's legs (readable from the riding camera)
    for s in (-1, 1):
        add_box(b, V(0.06, s * 0.088, 0.445), (0.19, 0.008, 0.12), M["white"], bevel=0.015, rot=Matrix.Rotation(s * 0.06, 4, "X") @ Matrix.Rotation(-0.15, 4, "Y"))
    # rear fender tail light stub / mud flap
    add_box(b, V(-0.14, 0, 0.36), (0.06, 0.12, 0.03), M["black"], bevel=0.008, rot=Matrix.Rotation(0.8, 4, "Y"))
    return finish(b, (0, 0, 0))


def build_engine(M):
    b = MeshBuilder("engine")
    cast, alloy = M["cast"], M["alloy"]
    cx, cz = 0.66, 0.29
    # crankcases: rounded block + left/right covers
    add_box(b, V(cx, 0, cz), (0.30, 0.22, 0.25), cast, bevel=0.035, seg=3)
    add_box(b, V(cx - 0.04, 0, cz + 0.08), (0.20, 0.20, 0.12), cast, bevel=0.03, seg=3)
    # clutch cover (right, +y) and ignition cover (left, -y)
    add_cyl(b, V(cx + 0.02, 0.11, cz + 0.02), V(cx + 0.02, 0.145, cz + 0.02), 0.105, 0.095, alloy, seg=24)
    add_cyl(b, V(cx + 0.02, 0.145, cz + 0.02), V(cx + 0.02, 0.16, cz + 0.02), 0.05, 0.045, alloy, seg=16)
    add_cyl(b, V(cx - 0.02, -0.11, cz), V(cx - 0.02, -0.135, cz), 0.085, 0.078, alloy, seg=24)
    # countershaft area / front sprocket cover stub (left)
    add_box(b, V(0.50, -0.10, 0.14), (0.10, 0.02, 0.10), cast, bevel=0.015)
    # cylinder: finned barrel leaning forward 10 deg, base at top of the cases
    tilt = Matrix.Rotation(math.radians(-10), 4, "Y")
    base = V(cx + 0.06, 0, cz + 0.13)
    up = tilt @ Vector((0, 0, 1))
    add_cyl(b, base, base + up * 0.16, 0.062, 0.062, cast, seg=20)
    for i in range(7):
        z0 = 0.02 + i * 0.02
        c0 = base + up * z0
        bm = prim_cylinder(0.085, 0.085, 0.006, seg=20)
        b.add(bm, Matrix.Translation(c0) @ tilt, cast, sharp_angle=40)
        bm.free()
    # head with a domed cover and spark plug cap
    head = base + up * 0.16
    add_cyl(b, head, head + up * 0.07, 0.075, 0.07, cast, seg=20)
    add_cyl(b, head + up * 0.07, head + up * 0.095, 0.05, 0.04, alloy, seg=16)
    add_cyl(b, head + up * 0.095, head + up * 0.135, 0.014, 0.014, M["black"], seg=8)
    # carburettor behind the cylinder with a rubber boot to the airbox
    carb = head - up * 0.06 + Vector((-0.10, 0, 0))
    add_cyl(b, carb + V(0.06, 0, 0), carb + V(-0.03, 0, 0), 0.03, 0.03, alloy, seg=14)
    add_cyl(b, carb + V(0.0, 0, -0.02), carb + V(0.0, 0, -0.07), 0.035, 0.03, M["black"], seg=12)
    add_tube(b, [carb + V(-0.03, 0, 0), carb + V(-0.10, 0, 0.0), carb + V(-0.17, 0, 0.03)], 0.028, M["black"], sides=10, samples=4)
    # kick start lever on the right
    add_tube(b, [V(cx + 0.06, 0.17, cz + 0.05), V(cx + 0.05, 0.19, cz + 0.20), V(cx + 0.02, 0.19, cz + 0.30)], 0.009, alloy, sides=6, samples=3)
    # gear lever left, rear brake pedal right
    add_tube(b, [V(cx - 0.05, -0.13, cz - 0.09), V(cx + 0.06, -0.15, cz - 0.11), V(cx + 0.16, -0.16, cz - 0.10)], 0.007, alloy, sides=6, samples=3)
    add_tube(b, [V(cx + 0.02, 0.13, cz - 0.10), V(cx + 0.14, 0.15, cz - 0.13), V(cx + 0.24, 0.16, cz - 0.12)], 0.007, alloy, sides=6, samples=3)
    add_box(b, V(cx + 0.26, 0.16, cz - 0.12), (0.05, 0.035, 0.008), alloy, bevel=0.003)
    return finish(b, (0, 0, 0))


def build_exhaust(M):
    b = MeshBuilder("exhaust")
    # header: from the exhaust port (front of the cylinder) down, back under the engine on the left,
    # then up behind the left side to the silencer under the seat.
    port = V(0.80, 0.0, 0.50)
    pts = [port, V(0.90, -0.02, 0.44), V(0.93, -0.06, 0.32), V(0.90, -0.10, 0.20), V(0.80, -0.13, 0.14), V(0.62, -0.14, 0.13), V(0.48, -0.15, 0.17), V(0.40, -0.16, 0.26), V(0.36, -0.16, 0.34)]
    add_tube(b, pts, 0.017, M["steel"], sides=10, samples=5, radius_fn=lambda u: 0.017 + 0.005 * u)
    # silencer: oval can along the left under the seat
    secs = []
    for (x, z, hw, hh) in [(0.37, 0.35, 0.018, 0.02), (0.33, 0.37, 0.038, 0.045), (0.20, 0.405, 0.04, 0.05), (0.06, 0.435, 0.038, 0.046), (-0.02, 0.445, 0.026, 0.03), (-0.04, 0.445, 0.01, 0.012)]:
        secs.append(superellipse_ring(V(x, -0.165, z), hw, hh, n=14, power=2.2))
    bm = loft(secs)
    b.add(bm, Matrix.Identity(4), M["black"])
    bm.free()
    # heat shield strap + end cap
    add_cyl(b, V(0.06, -0.165, 0.435), V(-0.045, -0.165, 0.445), 0.017, 0.013, M["alloy"], seg=12)
    add_box(b, V(0.20, -0.195, 0.405), (0.12, 0.004, 0.075), M["alloy"], bevel=0.008)
    return finish(b, (0, 0, 0))


def build_swingarm(M):
    b = MeshBuilder("swingarm")
    pv = P["pivot"]
    ax = P["rear"]
    alloy = M["alloy_swing"]
    for s in (-1, 1):
        y = s * 0.115
        # tapered box beam pivot -> axle
        secs = []
        for i in range(4):
            t = i / 3
            c = pv.lerp(ax, t) + V(0, y, 0)
            hh = 0.042 - 0.02 * t
            hw = 0.018 - 0.004 * t
            secs.append(superellipse_ring(c, hw, hh, n=10, power=3.0))
        bm = loft(secs)
        b.add(bm, Matrix.Identity(4), alloy, sharp_angle=50)
        bm.free()
        # axle blocks
        add_box(b, ax + V(0.0, y, 0), (0.08, 0.03, 0.05), M["anod"], bevel=0.006)
        # Machined axle end cap, centered on the actual axle rather than a decorative marker.
        add_cyl(b, ax + V(0, s * 0.13, 0), ax + V(0, s * 0.15, 0), 0.015, 0.015, M["anod"], seg=16)
    # pivot barrel + cross brace ahead of the tyre
    add_cyl(b, pv + V(0, -0.13, 0), pv + V(0, 0.13, 0), 0.028, mat=alloy, seg=14)
    add_box(b, pv.lerp(ax, 0.30) + V(0, 0, 0.06), (0.06, 0.24, 0.05), alloy, bevel=0.01)
    # shock linkage lug on the arm (under the swing point)
    link_pt = pv.lerp(ax, P["shock_swing"]) + V(0, 0, 0.03)
    add_box(b, link_pt + V(0, 0, 0.0), (0.05, 0.05, 0.05), alloy, bevel=0.01)
    # chain guide (red anodised) near the rear sprocket, chain slider on the left arm
    add_box(b, V(0.13, -0.11, 0.06), (0.08, 0.02, 0.05), M["red"], bevel=0.006)
    add_box(b, V(0.34, -0.11, 0.13), (0.14, 0.014, 0.02), M["black"], bevel=0.004)
    # rear caliper (right)
    add_box(b, V(0.045, 0.085, 0.09), (0.07, 0.035, 0.05), M["red"], bevel=0.008)
    return finish(b, pv)


def build_shock(M):
    top = P["shock_top"]
    bottom = P["pivot"].lerp(P["rear"], P["shock_swing"]) + V(0, 0, 0.03)
    n = (bottom - top).normalized()
    L = (bottom - top).length
    side = Vector((n.z, 0, -n.x))
    b = MeshBuilder("shock_body")
    add_cyl(b, top - n * 0.02, top + n * 0.03, 0.03, 0.03, M["anod"], seg=14)
    add_cyl(b, top + n * 0.03, top + n * 0.36, 0.026, 0.026, M["anod"], seg=14)
    add_cyl(b, top + n * 0.035, top + n * 0.05, 0.047, 0.047, M["anod"], seg=14)
    add_cyl(b, top + n * 0.05 + side * 0.05, top + n * 0.22 + side * 0.05, 0.02, 0.02, M["anod"], seg=12)
    add_cyl(b, top + n * 0.20 + side * 0.05, top + n * 0.28 + side * 0.05, 0.018, 0.012, M["red"], seg=12)
    body = finish(b, top)
    rod = MeshBuilder("shock_shaft")
    add_cyl(rod, bottom, top + n * 0.32, 0.012, 0.012, M["gold"], seg=10)
    shaft = finish(rod, bottom)
    end = MeshBuilder("shock_clevis")
    add_cyl(end, bottom - n * 0.04, bottom, 0.024, 0.024, M["anod"], seg=12)
    add_cyl(end, bottom - n * 0.055, bottom - n * 0.04, 0.047, 0.047, M["anod"], seg=14)
    clevis = finish(end, bottom)
    bs = MeshBuilder("shock_spring")
    upper_seat, lower_seat = top + n * 0.05, bottom - n * 0.055
    pts = []
    steps = 48 if LOD else 96
    for i in range(steps + 1):
        t = i / steps
        angle = t * 8 * C.TAU
        pts.append(upper_seat.lerp(lower_seat, t) + side * (0.04 * math.cos(angle)) + n.cross(side) * (0.04 * math.sin(angle)))
    add_tube(bs, pts, 0.0055, M["paint"], sides=6, samples=1, smooth=False)
    spring = finish(bs, upper_seat)
    # Preserve this complete rest frame at runtime, including its roll around the shock axis.
    q = (-n).to_track_quat("Z", "Y")
    for ob in (body, shaft, clevis, spring):
        inv = q.to_matrix().to_4x4().inverted()
        for v in ob.data.vertices:
            v.co = inv @ v.co
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = q
    return body, shaft, clevis, spring, L


def build_forks(M):
    fa = P["front"]
    hb, ht = P["head_bot"], P["head_top"]
    n = FORK_DIR
    side = Vector((0, 1, 0))
    # ---- upper: triple clamps, stanchions, bar mount, number plate, front fender
    b = MeshBuilder("fork_upper")
    off = 0.10  # stanchion spacing from the steering axis
    for s in (-1, 1):
        a0 = fa + n * 0.34 + side * (s * off)  # top of the lowers overlap
        a1 = hb + n * 0.30 + side * (s * off)
        add_cyl(b, a0, a1, 0.019, 0.019, M["gold"], seg=14)
        add_cyl(b, a1, a1 + n * 0.012, 0.022, 0.022, M["anod"], seg=12)  # fork caps
    q = n.to_track_quat("Z", "Y").to_matrix().to_4x4()
    for c, thick in ((hb, 0.03), (ht + n * 0.04, 0.026)):
        add_box(b, c, (0.07, 2 * off + 0.05, thick), M["alloy"], bevel=0.01, rot=q)
    # bar mount risers
    for s in (-1, 1):
        add_cyl(b, ht + n * 0.05 + side * (s * 0.035), P["bar"] + side * (s * 0.035) - V(0, 0, 0.02), 0.014, 0.014, M["anod"], seg=10)
    # steering stem nut
    add_cyl(b, ht + n * 0.05, ht + n * 0.075, 0.02, 0.02, M["anod"], seg=10)
    # front number plate ahead of the lower clamp, facing forward (box axes under q: x -> -y, y -> f, z -> n)
    f = Vector((n.z, 0, -n.x))
    add_box(b, hb + n * 0.03 + f * 0.05, (0.20, 0.008, 0.17), M["white"], bevel=0.015, rot=q)
    for s in (-1, 1):  # plate stays
        add_cyl(b, hb + n * 0.03 + f * 0.048 + side * (s * 0.06), hb + n * 0.03 + side * (s * 0.06), 0.005, 0.005, M["anod"], seg=6)
    # front fender on the lower clamp: arch over the tyre
    secs = []
    for i in range(8):
        a = math.radians(118 - i * 13)  # from behind-top to ahead
        r = R_WHEEL + 0.06
        hw = 0.06 - 0.012 * abs(i - 3.5) / 3.5
        ring = []
        nn = 12
        for j in range(nn):
            t = C.TAU * j / nn
            y = math.cos(t) * hw
            rr = r + 0.004 * math.sin(t) - 0.010 * (abs(y) / max(hw, 1e-3)) ** 2
            ring.append(fa + V(rr * math.cos(a), y, rr * math.sin(a)))
        secs.append(ring)
    bm = loft(secs)
    fender_geometry = bm
    upper = finish(b, hb)
    # ---- lower: sliders from the axle up, axle lugs, caliper (left), brake hose guide
    b = MeshBuilder("fork_lower")
    b.add(fender_geometry, Matrix.Identity(4), M["fender"])
    fender_geometry.free()
    for s in (-1, 1):
        a0 = fa + side * (s * off)
        add_cyl(b, a0 - n * 0.01, a0 + n * 0.42, 0.025, 0.024, M["anod"], seg=14)
        add_cyl(b, a0 + n * 0.42, a0 + n * 0.445, 0.028, 0.027, M["black"], seg=14)  # dust seal
        add_box(b, a0, (0.06, 0.03, 0.05), M["anod"], bevel=0.008, rot=q)  # axle lug
        # fender/brace bosses
    add_cyl(b, fa + side * (-off - 0.02), fa + side * (off + 0.02), 0.011, 0.011, M["alloy"], seg=8)  # axle
    # fork guards: plastic plates ahead of the sliders (sponsor down the front)
    f = Vector((n.z, 0, -n.x))
    for s in (-1, 1):
        add_box(b, fa + n * 0.24 + side * (s * off) + f * 0.032, (0.006, 0.062, 0.30), M["guard"], bevel=0.003, rot=q, seg=1)
    # caliper on the left, ahead of the slider at disc radius
    add_box(b, fa + n * 0.075 + V(0.05, -0.085, 0), (0.06, 0.035, 0.07), M["red"], bevel=0.008, rot=q)
    lower = finish(b, fa)
    return upper, lower


def build_handlebar(M):
    b = MeshBuilder("handlebar")
    bar = P["bar"]
    gy = P["grip_y"]
    # bar: centre section then sweep back/out to the grips at y = +-gy, z 0.78
    pts_r = [bar + V(0, 0, 0), bar + V(0.005, 0.12, 0.004), bar + V(-0.01, 0.20, 0.008), bar + V(-0.035, 0.30, 0.01), bar + V(-0.045, 0.42, 0.01)]
    pts_l = [Vector((p.x, -p.y, p.z)) for p in pts_r]
    add_tube(b, list(reversed(pts_l)) + pts_r[1:], 0.014, M["alloy"], sides=10, samples=5)
    # grips (rubber, slightly fatter) from y 0.26..0.42
    for s in (-1, 1):
        g0 = bar + V(-0.028, s * 0.26, 0.009)
        g1 = bar + V(-0.045, s * 0.425, 0.01)
        add_cyl(b, g0, g1, 0.017, 0.016, M["rubber"], seg=12)
        add_cyl(b, g1, g1 + V(-0.002, s * 0.008, 0), 0.019, 0.019, M["black"], seg=12)  # end flange
        # lever perch + lever (brake right, clutch left) sweeping forward
        perch = bar + V(-0.02, s * 0.235, 0.012)
        add_box(b, perch, (0.05, 0.03, 0.035), M["anod"], bevel=0.006)
        add_tube(b, [perch + V(0.02, s * 0.01, 0.01), perch + V(0.09, s * 0.07, 0.008), perch + V(0.16, s * 0.14, 0.0)], 0.006, M["alloy"], sides=6, samples=3)
    # bar clamp on the risers
    add_box(b, bar + V(0, 0, -0.008), (0.04, 0.10, 0.03), M["anod"], bevel=0.006)
    # throttle housing, kill switch
    add_cyl(b, bar + V(-0.03, 0.25, 0.01), bar + V(-0.028, 0.26, 0.01), 0.02, 0.02, M["black"], seg=12)
    return finish(b, bar)


def build_pegs(M):
    b = MeshBuilder("pegs")
    pz = P["pegs"]
    for s in (-1, 1):
        y_in = s * 0.10
        y_out = s * (P["peg_y"] + 0.04)
        # wide serrated platform
        add_box(b, V(pz.x, s * (P["peg_y"] - 0.01), pz.z), (0.10, 0.11, 0.012), M["anod"], bevel=0.004, seg=1)
        # teeth along the front and back edges
        for i in range(5):
            x = pz.x - 0.04 + i * 0.02
            for sy in (-1, 1):
                add_box(b, V(x, s * (P["peg_y"] - 0.01) + sy * 0.05, pz.z + 0.008), (0.006, 0.006, 0.006), M["anod"], bevel=0.0, seg=1, sharp=None)
        # mount bracket from the frame hanger down/out to the peg
        add_tube(b, [V(pz.x, y_in, pz.z + 0.04), V(pz.x, s * 0.14, pz.z + 0.005), V(pz.x, s * 0.16, pz.z)], 0.012, M["anod"], sides=8, samples=3)
    return finish(b, pz)


# ------------------------------------------------------------------------- main
def main():
    global SHEET, _DC
    import decals as D

    C.reset_scene()
    SHEET = D.ensure_sheet()
    _DC = D.CELLS
    M = make_materials()
    M["chain"] = chain_material()
    M["spokecard"] = spokecard_material()
    objs = {}
    objs["frame"] = build_frame(M)
    objs["bodywork"] = build_bodywork(M)
    objs["engine"] = build_engine(M)
    objs["exhaust"] = build_exhaust(M)
    objs["swingarm"] = build_swingarm(M)
    body, shaft, clevis, spring, shock_len = build_shock(M)
    objs["shock_body"], objs["shock_shaft"], objs["shock_clevis"], objs["shock_spring"] = body, shaft, clevis, spring
    upper, lower = build_forks(M)
    objs["fork_upper"], objs["fork_lower"] = upper, lower
    objs["handlebar"] = build_handlebar(M)
    objs["pegs"] = build_pegs(M)
    objs["wheel_rear"], objs["wheel_rear_spokes"], objs["wheel_rear_blur"] = build_wheel("wheel_rear", M, 0.228, 0.112, disc_side=+1)
    objs["wheel_front"], objs["wheel_front_spokes"], objs["wheel_front_blur"] = build_wheel("wheel_front", M, 0.262, 0.078, disc_side=-1)
    objs["wheel_front"].location = P["front"]
    objs["wheel_rear"].location = P["rear"]
    objs["sprocket_rear"] = build_sprocket("sprocket_rear", P["rear"] + V(0, -0.092, 0), 0.105, 42, 0.006, M, M["alloy"])
    cs = V(0.47, -0.092, 0.135)  # countershaft and rear sprocket share the chain plane
    objs["sprocket_front"] = build_sprocket("sprocket_front", cs, 0.036, 11, 0.007, M, M["alloy"])
    objs["chain"] = build_chain(M, P["rear"], 0.101, cs, 0.033, -0.092)

    all_obs = list(objs.values())
    # one parent empty = the bike frame origin (rear axle)
    root = bpy.data.objects.new("bike", None)
    bpy.context.scene.collection.objects.link(root)
    for o in all_obs:
        if o.parent is None:
            o.parent = root
    hier = dict(sprocket_rear="wheel_rear")  # spins with the wheel
    for child, par in hier.items():
        o = objs[child]
        o.parent = objs[par]
        o.matrix_parent_inverse = objs[par].matrix_world.inverted()
    # smooth shading everywhere (sharp edges were marked while building)
    for o in all_obs:
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.context.view_layer.update()

    # Exported attachment frames are the runtime contract; authored geometry and runtime
    # share these exact hard points. Empty nodes survive both full and LOD exports.
    markers = []
    def marker(name, point, parent=root):
        ob = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = parent.matrix_world.inverted() @ Vector(point)
        markers.append(ob)
        return ob
    root["mechanism_version"] = 3
    root["meshopt_exp_bits"] = 20
    marker("attach_frame_origin", V(WB / 2, 0, 0))
    marker("attach_chassis_com", V(0.585, 0, 0.21))
    marker("attach_swing_pivot", P["pivot"])
    marker("attach_swing_axle", P["rear"], objs["swingarm"])
    link = P["pivot"].lerp(P["rear"], P["shock_swing"]) + V(0, 0, 0.03)
    marker("attach_shock_link", link, objs["swingarm"])
    marker("attach_fork_top", P["head_bot"])
    marker("attach_front_axle_rest", P["front"])
    marker("attach_rear_axle_rest", P["rear"])
    marker("attach_shock_top", P["shock_top"])
    n = (link - P["shock_top"]).normalized()
    marker("attach_shock_upper_seat", P["shock_top"] + n * 0.05, body)
    marker("attach_shock_lower_seat", link - n * 0.055, clevis)
    marker("attach_shock_rod_top", P["shock_top"] + n * 0.32, body)
    marker("attach_shock_eye", link, clevis)
    marker("attach_countershaft", cs)
    marker("attach_front_pitch", cs + V(0.033, 0, 0))
    rear_sprocket = P["rear"] + V(0, -0.092, 0)
    marker("attach_rear_sprocket", rear_sprocket, objs["wheel_rear"])
    marker("attach_rear_pitch", rear_sprocket + V(0.101, 0, 0), objs["wheel_rear"])
    marker("attach_exhaust_outlet", V(-0.045, -0.165, 0.445), objs["exhaust"])
    for suffix, sign in (("L", -1), ("R", 1)):
        marker("attach_grip_" + suffix, P["grip"] + V(0, sign * P["grip_y"], 0))
        marker("attach_peg_" + suffix, P["pegs"] + V(0, sign * P["peg_y"], 0))
    bpy.context.view_layer.update()

    tris = {o.name: C.tri_count(o) for o in all_obs}
    log("tris", tris, "total", sum(tris.values()))
    if LOD:
        protected = {"chain", "swingarm", "fork_upper", "fork_lower", "shock_body", "shock_shaft", "shock_clevis", "shock_spring"}
        protected.update(o.name for o in all_obs if o.name.endswith("_blur") or o.name.endswith("_spokes"))
        fixed = sum(tris[name] for name in protected)
        reducible = sum(tris.values()) - fixed
        ratio = min(1.0, (LOD_TRIS - fixed) / reducible)
        for o in all_obs:
            if o.name not in protected:
                C.decimate_to(o, max(12, int(tris[o.name] * ratio)))
        tris = {o.name: C.tri_count(o) for o in all_obs}
        log("lod tris", tris, "total", sum(tris.values()))

    # two atlases: the livery-dependent body set (two albedos -> variants) and the shared mechanicals
    body_names = ("frame", "bodywork", "fork_upper")
    body_obs = [o for o in all_obs if o.name in body_names]
    mech_obs = [o for o in all_obs if o.name not in body_names and o.name != "chain" and not o.name.endswith("_blur")]
    C.unwrap_all(body_obs, angle=66, margin=0.002)
    C.unwrap_all(mech_obs, angle=66, margin=0.0015)
    C.apply_colourway(COLOURWAYS["rookie"])
    if not NO_BAKE:
        variants = [(cw, (lambda cw=cw: C.apply_colourway(COLOURWAYS[cw]))) for cw in ("rookie", "pro")]
        pb = C.bake_atlas(body_obs, SIZE, C.BAKE_DIR, OUT_NAME + "_body", jpeg_quality=86, normal_size=SIZE // 2, orm_size=SIZE // 2, variants=variants)
        pm = C.bake_atlas(mech_obs, SIZE, C.BAKE_DIR, OUT_NAME + "_mech", jpeg_quality=86, normal_size=SIZE // 2, orm_size=SIZE // 2)
        body_mats = {cw: C.atlas_material(f"bike_body_{cw}", pb, albedo=f"albedo:{cw}") for cw in ("rookie", "pro")}
        C.assign_atlas(body_obs, body_mats["rookie"])
        C.assign_atlas(mech_obs, C.atlas_material("bike_mech", pm))
        C.setup_variants(body_obs, [(f"bike_{cw}", {n: body_mats[cw] for n in body_names}) for cw in ("rookie", "pro")])
    blend_path = os.path.join(C.HERE, OUT_NAME + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    out = os.path.join(C.MODELS, OUT_NAME + ".glb")
    # Blender 5.2 defaults its exponential meshopt filter to 12 bits (~1 mm here),
    # while empty-node attachments retain float precision. Keep the actual machined
    # geometry coincident with those attachments. This setting is scoped to this export.
    from io_scene_gltf2.io.exp import meshopt as encoder
    previous_bits = encoder.EXP_FILTER_BITS
    try:
        encoder.EXP_FILTER_BITS = 20
        size = C.export_glb(out, all_obs + markers + [root], animations=False, meshopt=MESHOPT)
    finally:
        encoder.EXP_FILTER_BITS = previous_bits
    info = C.gltf_summary(out)
    log("glb", info)
    with open(os.path.join(C.HERE, OUT_NAME + ".stats.txt"), "w") as f:
        f.write(f"tris_per_object={tris}\ntotal_tris={sum(tris.values())}\nglb_bytes={size}\nshock_len={shock_len:.4f}\nfork_rake_deg={math.degrees(FORK_ANGLE):.2f}\n")
        f.write(f"gltf={info}\n")


if __name__ == "__main__":
    main()
