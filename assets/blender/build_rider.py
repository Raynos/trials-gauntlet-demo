"""Rigged, skinned trials rider -> public/models/rider.glb

blender -b --python assets/blender/build_rider.py [-- --no-bake] [-- --size 1024]

Frame while building = the bike's: origin = REAR AXLE, +X forward, +Z up, -Y camera side
(rider's left). Exported Y-up (+x forward, +y up, +z camera). The REST POSE is the render's
attack chain (riderModel.ts poseRider at lean 0 / crouch 0 / torsoPitch 0 / armExtend 0):
hips (0.53, 0.74), shoulders (0.82, 1.15), grips (0.92, 0.78, z +-0.33), ankles (0.52, 0.11).
Bones are named exactly as the joint set the render drives:
  pelvis, spine, chest, neck, head, shoulder.L/R, upperArm.L/R, forearm.L/R, hand.L/R,
  thigh.L/R, shin.L/R, foot.L/R           (.L = rider's left = camera side, glTF +z)
Body = lofted volumes (jersey shell over a pants shell, one continuous tube per limb with keyed
radii, skin neck) + gear primitives in one MeshBuilder; weights per loft station (bone blends across
each joint) with rigid groups for the hard parts (H1 round 2 — round 4 was a skin-modifier figure).
Suit graphics: panels in object space + sponsor decals projected from textures/decals.png
(decals.py); two colourways baked as two albedos -> KHR_materials_variants rider_rookie / rider_pro.
`-- --lod` writes rider-lod.glb (<= 6k tris, 512 atlas).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import common as C  # noqa: E402
from common import MeshBuilder, V, log, prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
NO_BAKE = "--no-bake" in ARGS
LOD = "--lod" in ARGS  # public/models/rider-lod.glb: <= 6k tris, 512 atlas, same bones / clips / material names
SIZE = int(ARGS[ARGS.index("--size") + 1]) if "--size" in ARGS else (512 if LOD else 1024)
MESHOPT = "--no-meshopt" not in ARGS
FPS = 30
LOD_TRIS = 6000
OUT_NAME = "rider-lod" if LOD else "rider"
if LOD:
    C.set_detail(0.5)
prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube = (C.scaled(f) for f in (prim_box, prim_cylinder, prim_lathe, prim_sphere, prim_torus, prim_tube))

# ---- rider chain (assets/blender/RIDER_CHAIN.md), measured from the reference; +0.65 x -> rear-axle frame
X0 = 0.65
L = dict(torso=0.52, neck=0.22, headR=0.13, upperArm=0.32, forearm=0.30, thigh=0.46, shin=0.43, ankle=0.09, hipHalf=0.09, shoulderHalf=0.21, pelvis=0.2)
GRIP = (0.27 + X0, 0.78)
GRIP_Z = 0.33
PEGS = (-0.14 + X0, 0.02)
PEG_HALF = 0.2
SEAT_TOP = (-0.3 + X0, 0.55)
ELBOW_POLE = Vector((0.6, 0.5, 1.0))   # forward-up-out (z sign flipped per side)
KNEE_POLE = Vector((1.0, 0.2, -0.15))  # forward, a little up, slightly IN (z sign flipped per side)
KNEE_MIN_Z = 0.08

# canonical poses: hips (x, y) in AXLE coords, torso angle from horizontal (deg), head angle (deg)
POSES = dict(
    stand_attack=dict(hips=(-0.28, 0.85), torso=40, head=66),
    forward_attack=dict(hips=(-0.22, 0.90), torso=26, head=42),
    hang_back=dict(hips=(-0.57, 0.60), torso=55, head=75),
    crouch=dict(hips=(-0.38, 0.78), torso=28, head=40),
    sit_cruise=dict(hips=(-0.30, 0.62), torso=60, head=80),
    extend=dict(hips=(-0.14, 0.96), torso=46, head=70),
    land_absorb=dict(hips=(-0.40, 0.70), torso=30, head=45),
)


def ik3(a, b, l1, l2, pole):
    """3D two-bone IK: joint for a->b with lengths l1/l2, elbow/knee pushed toward `pole`.
    Returns (joint, reach_clamped)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    dist = d.length
    mx = (l1 + l2) * 0.995
    mn = abs(l1 - l2) + 0.02
    dist_c = min(max(dist, mn), mx)
    u = d / (dist or 1e-6)
    x = (l1 * l1 - l2 * l2 + dist_c * dist_c) / (2 * dist_c)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = Vector(pole)
    p = p - u * p.dot(u)
    if p.length < 1e-6:
        p = Vector((0, 0, 1))
    p.normalize()
    return a + u * x + p * h, dist > mx


def pose_chain(hips=(-0.20, 0.93), torso=47.0, head=68.0, side_z=None):
    """Canonical pose -> joint positions (Blender frame: x fwd, y = -z_camera, z up), keys like the
    old chain(): hips, shoulders, head, torsoDir, headDir, and per side shoulder/elbow/wrist/hip/knee/
    ankle/toe.  Hands stay ON the grips: if the shoulder is out of arm's reach the whole upper body
    slides toward the bars along the shoulder->grip line (and away if closer than 0.18 m)."""
    hx, hy = hips[0] + X0, hips[1]
    ta = math.radians(torso)
    ha = math.radians(head)
    t = Vector((math.cos(ta), 0, math.sin(ta)))      # torso direction (hips -> shoulders)
    hd = Vector((math.cos(ha), 0, math.sin(ha)))     # neck/head direction
    S = Vector((hx, 0, hy)) + t * L["torso"]
    H = Vector((hx, 0, hy))
    gx, gy = GRIP
    reach = (L["upperArm"] + L["forearm"]) * 0.985
    # reach slide (3D distance shoulder joint -> grip, z from +-0.21 to +-0.33)
    dz = GRIP_Z - L["shoulderHalf"]
    dvec = Vector((gx - S.x, 0, gy - S.z))
    d3 = math.hypot(dvec.length, dz)
    near = 0.18
    if d3 > reach or d3 < near:
        want = reach if d3 > reach else near
        planar = math.sqrt(max(want * want - dz * dz, 1e-6))
        shift = dvec.normalized() * (dvec.length - planar)
        S += shift
        H += shift
    # leg slide: hips never beyond thigh+shin from the ankles
    ax0 = PEGS[0] + 0.01
    ay0 = PEGS[1] + L["ankle"]
    legReach = (L["thigh"] + L["shin"]) * 0.985
    dl = Vector((ax0 - H.x, 0, ay0 - H.z))
    dzl = PEG_HALF - L["hipHalf"]
    d3l = math.hypot(dl.length, dzl)
    if d3l > legReach:
        planar = math.sqrt(max(legReach ** 2 - dzl ** 2, 1e-6))
        shift = dl.normalized() * (dl.length - planar)
        H += shift
        S += shift
    headC = S + hd * L["neck"]
    J = dict(hips=H, shoulders=S, head=headC, torsoDir=t, headDir=hd, torsoA=math.pi / 2 - ta, headA=math.pi / 2 - ha)
    for name, s in (("L", -1), ("R", 1)):
        sh = Vector((S.x, s * L["shoulderHalf"], S.z))
        wr = Vector((gx, s * GRIP_Z, gy))
        # axle pole (x, y_up, z_cam*sign) -> blender (x, y_bl = -z_cam, z_bl = y_up); side s=-1 is .L (+z_cam)
        pole = Vector((ELBOW_POLE.x, s * ELBOW_POLE.z, ELBOW_POLE.y))
        el, _ = ik3(sh, wr, L["upperArm"], L["forearm"], pole)
        hp = Vector((H.x, s * L["hipHalf"], H.z))
        an = Vector((ax0, s * PEG_HALF, ay0))
        kpole = Vector((KNEE_POLE.x, s * KNEE_POLE.z, KNEE_POLE.y))
        kn, _ = ik3(hp, an, L["thigh"], L["shin"], kpole)
        if abs(kn.y) < KNEE_MIN_Z:
            kn.y = s * KNEE_MIN_Z
        J["shoulder." + name] = sh
        J["elbow." + name] = el
        J["wrist." + name] = wr
        J["hip." + name] = hp
        J["knee." + name] = kn
        J["ankle." + name] = an
        J["toe." + name] = an + Vector((0.19, 0, -0.075))
    return J


def chain(pose="stand_attack", **over):
    """Canonical pose by name with optional overrides (hips=(x,y), torso=deg, head=deg, dh=(dx,dy), dt=deg)."""
    P = dict(POSES[pose])
    dh = over.pop("dh", None)
    if dh:
        P["hips"] = (P["hips"][0] + dh[0], P["hips"][1] + dh[1])
    dt = over.pop("dt", None)
    if dt:
        P["torso"] = P["torso"] + dt
    P.update(over)
    return pose_chain(**P)


def to_axle(v):
    """Blender file-frame Vector -> AXLE coords (x fwd, y up, z camera) tuple."""
    return (round(v.x - X0, 3), round(v.z, 3), round(-v.y, 3))


def write_chain_md(path):
    lines = []
    lines.append("# Rider chain (measured from the reference, owned by assets/blender)\n")
    lines.append("Rider 1.78 m at 7.5 heads (head 0.237). AXLE coordinates: origin = axle midpoint at static sag, x forward, y up, z toward the camera (rider's LEFT = +z). Grips fixed at (0.27, 0.78, +-0.33), pegs at (-0.14, 0.02, +-0.20); ankles = pegs + (0.01, 0.09).\n")
    lines.append("## Segment lengths (m)\n")
    lines.append("| segment | length | note |\n|---|---|---|")
    lines.append(f"| torso (hip joint -> shoulder line) | {L['torso']:.2f} | acromion height for 1.78 m |")
    lines.append(f"| neck (shoulder line -> head/helmet centre) | {L['neck']:.2f} | helmet shell radius {HELMET_R:.3f} (H1 r2, was 0.14); shell bottom 0.09 above the shoulder line, the chin bar lower = a short visible neck over the brace |")
    lines.append(f"| upper arm | {L['upperArm']:.2f} | shoulder joint -> elbow |")
    lines.append(f"| forearm (elbow -> grip centre, fist included) | {L['forearm']:.2f} | |")
    lines.append(f"| thigh | {L['thigh']:.2f} | hip joint -> knee |")
    lines.append(f"| shin (knee -> ankle) | {L['shin']:.2f} | ankle 0.09 above the peg, boot on the peg |")
    lines.append(f"| shoulder half width | {L['shoulderHalf']:.2f} | biacromial 0.42 |")
    lines.append(f"| hip half width | {L['hipHalf']:.2f} | |")
    lines.append("\nMeasured on reference/techniques/clips 13 (countdown, GO, wheelie), 06/07 (hang-forward climb, landing), 03 (rear-wheel balance), rising-visuals 02 (start gate idle) and the hero crop grid: attack torso 45-50 deg from horizontal, upper arm 25-35 deg below horizontal going FORWARD and OUT, elbow interior 125-130 deg, forearm ~70 deg down to the bar; thigh 65-70 deg below horizontal, knee flexion 35-45 deg, shin 12-18 deg from vertical (foot behind the knee); hang-forward: torso 20-30, elbows 85-95 high and out; hang-back: arms straight (~170), shoulders ~25 deg above the bar line, torso 50-60, knees 80-95; countdown crouch: torso 20-30, elbows 60-75, knees 100-110; elbows ~0.2 m outside the shoulders in 3/4 views, knees on the tank sides.\n")
    lines.append("## Bend-direction rules (pole vectors for a 2-bone IK)\n")
    lines.append("Two-bone IK in 3D: `u = normalize(B - A)`, `x = (l1^2 - l2^2 + d^2) / 2d`, `h = sqrt(l1^2 - x^2)`, joint `= A + u*x + h * normalize(pole - u*(pole.u))`. Reach is clamped to 0.995*(l1+l2); if the shoulder is farther than 0.985*(l1+l2) from the grip the WHOLE upper body slides toward the grip along the shoulder->grip line (hands never leave the grips), and away if closer than 0.18 m; the hips never go beyond 0.985*(thigh+shin) from the ankles.\n")
    lines.append(f"* **Elbow pole = forward-up-out:** `pole = (0.6, 0.5, sign(side)*1.0)` in axle coords (side = +1 for .L/+z, -1 for .R). In attack the elbow ends ~0.18 m ahead of, ~0.14 m below and ~0.22 m outside the shoulder (upper arm ~27 deg below horizontal going forward and out, elbow ~0.28 m above the grip), the forearm angles ~70 deg down and in to the grip: one wide S from shoulder to bar. A pure up-or-out pole is WRONG: it folds the elbow sideways and the arm reads as hanging straight from the side view. Never below the bar line, never behind the shoulder.")
    lines.append(f"* **Knee pole = forward-and-slightly-in:** `pole = (1, 0.2, -sign(side)*0.15)`; clamp `|knee.z| >= {KNEE_MIN_Z}` so the knees hug the tank sides (tank half width 0.10) without crossing. Knee ends ahead of the hip and roughly above the peg; the shin is 10-20 deg from vertical in attack.")
    lines.append("* Torso: hips -> shoulders at the torso angle from horizontal; head/helmet centre = shoulders + 0.22 at the head angle (always more upright than the torso: the rider looks ahead). Shoulder joints at z = +-0.21 on the shoulder line; hips at z = +-0.09.\n")
    lines.append("## Canonical poses (AXLE coords, metres; .L side listed, .R mirrors z)\n")
    lines.append("| pose | hips (x,y) | torso deg | head deg | interior elbow | knee flexion |\n|---|---|---|---|---|---|")
    tables = []
    for name in ("stand_attack", "hang_back", "forward_attack", "crouch", "sit_cruise", "extend", "land_absorb"):
        P = POSES[name]
        J = pose_chain(**P)
        sh, el, wr = J["shoulder.L"], J["elbow.L"], J["wrist.L"]
        hp, kn, an = J["hip.L"], J["knee.L"], J["ankle.L"]
        def ang(a, b, c):
            v1 = (a - b).normalized()
            v2 = (c - b).normalized()
            return math.degrees(math.acos(max(-1, min(1, v1.dot(v2)))))
        e_int = ang(sh, el, wr)
        k_int = ang(hp, kn, an)
        lines.append(f"| {name} | ({P['hips'][0]:.2f}, {P['hips'][1]:.2f}) | {P['torso']} | {P['head']} | {e_int:.0f} | {180 - k_int:.0f} |")
        chest = J["hips"] + J["torsoDir"] * (L["torso"] * 0.72)
        rows = [("hips", J["hips"]), ("chest", chest), ("shoulders (centre)", J["shoulders"]), ("shoulder.L", sh), ("elbow.L", el), ("hand.L (grip)", wr), ("hip.L", hp), ("knee.L", kn), ("ankle.L", an), ("head (helmet centre)", J["head"])]
        tables.append((name, rows))
    lines.append("")
    for name, rows in tables:
        lines.append(f"### {name}\n")
        lines.append("| joint | x | y | z |\n|---|---|---|---|")
        for label, v in rows:
            x, y, z = to_axle(v)
            lines.append(f"| {label} | {x:.3f} | {y:.3f} | {z:+.3f} |")
        lines.append("")
    lines.append("`extend` (hop push) and `land_absorb` (touchdown) are the two transient poses the clips pass through; `stand_attack` is the rest pose of rider.glb.\n")
    lines.append("## Clips = blends between canonical poses (30 fps)\n")
    lines.append("stand_attack: hold. hang_back / forward_attack / crouch / sit_cruise: stand_attack -> pose at f15 -> hold to f30. extend: crouch -> extend at f8 -> stand_attack at f20. land_absorb: extend -> land_absorb at f8 -> stand_attack at f30. idle_breathe: stand_attack with hips +-1.5 cm, torso +-1.5 deg, head +-2 deg over 4 s (cyclic).\n")
    # keep anything other owners appended below the generated part (pose.ts curves, studies)
    tail = ""
    if os.path.exists(path):
        old = open(path).read()
        marker = "\n## Curves between"
        if marker in old:
            tail = old[old.index(marker):]
    with open(path, "w") as f:
        f.write("\n".join(lines) + tail)


REST = chain()

# ----------------------------------------------------------------------------- armature
BONES = {}  # name -> (head, tail, parent)
NUMBER_PATCHES = []  # (centre, u axis, v axis, size) for the decal UV layer


def define_bones(J):
    H, S = J["hips"], J["shoulders"]
    t, hd = J["torsoDir"], J["headDir"]
    B = {}
    B["pelvis"] = (H - t * 0.02, H + t * 0.10, None)
    B["spine"] = (H + t * 0.10, H + t * 0.28, "pelvis")
    B["chest"] = (H + t * 0.28, S, "spine")
    B["neck"] = (S, S + hd * 0.10, "chest")
    B["head"] = (S + hd * 0.10, S + hd * 0.36, "neck")
    for s, sg in (("L", -1), ("R", 1)):
        B["shoulder." + s] = (S + V(0, sg * 0.04, -0.01), J["shoulder." + s], "chest")
        B["upperArm." + s] = (J["shoulder." + s], J["elbow." + s], "shoulder." + s)
        B["forearm." + s] = (J["elbow." + s], J["wrist." + s], "upperArm." + s)
        fd = (J["wrist." + s] - J["elbow." + s]).normalized()
        B["hand." + s] = (J["wrist." + s], J["wrist." + s] + fd * 0.09, "forearm." + s)
        B["thigh." + s] = (J["hip." + s], J["knee." + s], "pelvis")
        B["shin." + s] = (J["knee." + s], J["ankle." + s], "thigh." + s)
        B["foot." + s] = (J["ankle." + s], J["toe." + s], "shin." + s)
    return B


BONE_ORDER = ["pelvis", "spine", "chest", "neck", "head"] + [f"{b}.{s}" for s in ("L", "R") for b in ("shoulder", "upperArm", "forearm", "hand")] + [f"{b}.{s}" for s in ("L", "R") for b in ("thigh", "shin", "foot")]


def build_armature(B):
    arm = bpy.data.armatures.new("rider_rig")
    arm.display_type = "STICK"
    ob = bpy.data.objects.new("rider_rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name in BONE_ORDER:
        h, t, p = B[name]
        b = arm.edit_bones.new(name)
        b.head = h
        b.tail = t
        b.use_connect = False
        b.roll = 0.0
        eb[name] = b
    for name in BONE_ORDER:
        p = B[name][2]
        if p:
            eb[name].parent = eb[p]
    # roll: make every bone's local Z axis point toward -Y (camera side) where possible so the
    # exported rotations are tidy. Blender's default roll from head/tail is fine for a Y-up export.
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ----------------------------------------------------------------------------- colourways
# Two colourways matching the render's bike liveries (src/render/bike/livery.ts): Rookie = blue /
# white #7, Pro = charcoal / yellow #1. Every CW_* key below is a named node in the bake materials;
# the albedo is baked once per colourway (normal + ORM shared) and exported as KHR_materials_variants
# `rider_rookie` / `rider_pro`.
_DC = None  # decal sheet image (decals.CELLS)
COLOURWAYS = dict(
    rookie=dict(
        JA=(0.78, 0.79, 0.80), JB=(0.03, 0.12, 0.62),           # jersey main / panels + sleeves
        PA=(0.03, 0.07, 0.30), PB=(0.78, 0.79, 0.80),           # pants main / seam stripe
        LOGO_A=(0.03, 0.04, 0.10), LOGO_B=(0.92, 0.92, 0.93), LOGO_P=(0.85, 0.86, 0.88),
        NUM_BG=(0.03, 0.12, 0.62), NUM_INK=(0.92, 0.92, 0.93),
        HELMET=(0.82, 0.83, 0.84), HSTRIPE=(0.03, 0.12, 0.62), HLOGO=(0.03, 0.12, 0.62),
        VISOR=(0.20, 0.26, 0.36), GLOVE=(0.03, 0.12, 0.62), BOOTPLATE=(0.03, 0.12, 0.62),
        num_u=0.0, num_v=2 / 8,                                  # decals.CELLS['d7'] origin
    ),
    pro=dict(
        JA=(0.045, 0.045, 0.05), JB=(0.92, 0.72, 0.05),
        PA=(0.03, 0.03, 0.033), PB=(0.92, 0.72, 0.05),
        LOGO_A=(0.92, 0.72, 0.05), LOGO_B=(0.05, 0.05, 0.055), LOGO_P=(0.92, 0.72, 0.05),
        NUM_BG=(0.92, 0.72, 0.05), NUM_INK=(0.72, 0.10, 0.06),
        HELMET=(0.06, 0.06, 0.065), HSTRIPE=(0.92, 0.72, 0.05), HLOGO=(0.92, 0.72, 0.05),
        VISOR=(0.80, 0.60, 0.30), GLOVE=(0.92, 0.72, 0.05), BOOTPLATE=(0.92, 0.72, 0.05),
        num_u=2 / 8, num_v=2 / 8,                                # decals.CELLS['d1'] origin
    ),
)
SKIN = (0.55, 0.36, 0.26, 1)


def _torso_uv(m):
    """Object-space torso coordinates: u along the torso from the hips, w forward, y lateral."""
    H, t = REST["hips"], REST["torsoDir"]
    fwd = Vector((t.z, 0, -t.x))
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    d = C.vmath(m, "SUBTRACT", C.texcoord(m).outputs["Object"], tuple(H))
    u = C.vmath(m, "DOT_PRODUCT", d, tuple(t))
    w = C.vmath(m, "DOT_PRODUCT", d, tuple(fwd))
    return u, w, sep.outputs["Y"], C.math_node(m, "ABSOLUTE", sep.outputs["Y"])


def _folds(m, sites, wrinkle=0.25):
    """Cloth folds for the normal map: creases ringing each joint (sin along the limb axis, wobbled by
    noise, gated by distance to the joint) + a low-frequency wrinkle field. sites: (centre, axis, radius,
    spacing m)."""
    P = C.texcoord(m).outputs["Object"]
    wob = C.math_node(m, "MULTIPLY", C.noise_fac(m, scale=16, detail=2, rough=0.5), 7.0)
    h = C.math_node(m, "MULTIPLY", C.noise_fac(m, scale=28, detail=3, rough=0.55), wrinkle)
    for c, ax, r, spacing in sites:
        d = C.vmath(m, "SUBTRACT", P, tuple(c))
        along = C.vmath(m, "DOT_PRODUCT", d, tuple(ax.normalized()))
        gate = C.math_node(m, "SUBTRACT", 1.0, C.math_node(m, "DIVIDE", C.vmath(m, "LENGTH", d), r), clamp=True)
        gate = C.math_node(m, "MULTIPLY", gate, gate)
        ph = C.math_node(m, "MULTIPLY_ADD", along, 2 * math.pi / spacing, wob)
        s = C.math_node(m, "MULTIPLY_ADD", C.math_node(m, "SINE", ph), 0.5, 0.5)
        h = C.math_node(m, "ADD", h, C.math_node(m, "MULTIPLY", s, gate))
    return h


def _fabric(m, scale=900, strength=0.10, folds=None):
    w = C.node(m, "ShaderNodeTexWave")
    w.wave_type = "BANDS"
    w.bands_direction = "DIAGONAL"
    w.inputs["Scale"].default_value = scale
    C.link(m, C.texcoord(m).outputs["Object"], w.inputs["Vector"])
    w2 = C.node(m, "ShaderNodeTexWave")
    w2.wave_type = "BANDS"
    w2.bands_direction = "X"
    w2.inputs["Scale"].default_value = scale
    C.link(m, C.texcoord(m).outputs["Object"], w2.inputs["Vector"])
    weave = C.math_node(m, "MULTIPLY", w.outputs["Fac"], w2.outputs["Fac"])
    if folds is None:
        C.bump(m, weave, strength=strength, distance=0.0004)
    else:
        # weave (0.4 mm) + folds (3 mm) into the one Normal input
        C.bump(m, C.math_node(m, "MULTIPLY_ADD", weave, 0.12, folds), strength=0.8, distance=0.0035)
    return weave


def _grime(m, col, amount=0.12, scale=18):
    """Low-frequency dirt / wear so a flat panel is never one value."""
    f = C.noise_fac(m, scale=scale, detail=3, rough=0.6)
    dark = C.mix_rgb(m, 1.0, col, (0.0, 0.0, 0.0, 1), blend="MULTIPLY")
    return C.mix_rgb(m, C.math_node(m, "MULTIPLY", f, amount), col, C.mix_rgb(m, 0.55, col, (0.02, 0.02, 0.02, 1)))


def make_materials(sheet):
    import decals as D

    global _DC
    _DC = D.CELLS
    S, H = REST["shoulders"], REST["hips"]
    t = REST["torsoDir"]
    fwd = Vector((t.z, 0, -t.x))
    up = Vector((0, 0, 1))
    M = {}

    # ---- torso: jersey above the belt, pants below; panels; sponsors front + back; numbers
    m = C.new_mat("bodycloth", (0.8, 0.8, 0.8, 1), rough=0.8)
    JA, JB, PA = C.cw_rgb(m, "JA"), C.cw_rgb(m, "JB"), C.cw_rgb(m, "PA")
    LOGO_A, LOGO_B, NUM_BG, NUM_INK = C.cw_rgb(m, "LOGO_A"), C.cw_rgb(m, "LOGO_B"), C.cw_rgb(m, "NUM_BG"), C.cw_rgb(m, "NUM_INK")
    u, w, y, ay = _torso_uv(m)
    u0 = -0.045  # jersey hem line along the torso (the shell hangs to -0.065, over the pants shell)
    above = C.math_node(m, "GREATER_THAN", u, u0)
    hem = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", u, u0 - 0.035), C.math_node(m, "LESS_THAN", u, u0 + 0.004))
    # side panels (JB) on the flanks up to the armpit, a JB chevron across the chest, JB yoke on the back
    side = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", ay, 0.150), C.math_node(m, "LESS_THAN", u, 0.42))
    chev_c = C.math_node(m, "MULTIPLY_ADD", ay, 0.55, 0.0)  # V: higher at the sides
    chev_lo = C.math_node(m, "ADD", chev_c, 0.24)
    chev_hi = C.math_node(m, "ADD", chev_c, 0.31)
    chev = C.math_node(m, "MULTIPLY", C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", u, chev_lo), C.math_node(m, "LESS_THAN", u, chev_hi)), C.math_node(m, "GREATER_THAN", w, 0.0))
    yoke = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", u, 0.43), C.math_node(m, "LESS_THAN", w, -0.02))
    jcol = C.mix_rgb(m, side, JA, JB)
    jcol = C.mix_rgb(m, chev, jcol, JB)
    jcol = C.mix_rgb(m, yoke, jcol, JB)
    col = C.mix_rgb(m, above, PA, jcol)
    col = C.mix_rgb(m, hem, col, (0.06, 0.06, 0.07, 1))
    # decals: chest VORTEX OIL, right-chest number, belly BOLT ENERGY, back NORDVIK + number plate
    tor = REST["torsoDir"]
    front = S - tor * 0.13 + fwd * 0.12
    col = C.decal(m, col, sheet, _DC["vortex"], front, Vector((0, 1, 0)), tor, 0.26, 0.065, LOGO_A, facing=fwd)
    col = C.decal(m, col, sheet, _DC["bolt"], S - tor * 0.37 + fwd * 0.11, Vector((0, 1, 0)), tor, 0.22, 0.055, LOGO_A, facing=fwd)
    numc = S - tor * 0.235 + fwd * 0.125 + Vector((0, -0.07, 0))  # right chest (anatomical right = -y)
    col = C.patch(m, col, numc, Vector((0, 1, 0)), tor, 0.085, 0.10, NUM_BG, facing=fwd)
    col = C.decal(m, col, sheet, _DC["d7"], numc, Vector((0, 1, 0)), tor, 0.06, 0.09, NUM_INK, facing=fwd, cell_key="num")
    back = S - tor * 0.20 - fwd * 0.12
    col = C.decal(m, col, sheet, _DC["nordvik"], S - tor * 0.06 - fwd * 0.11, -Vector((0, 1, 0)), tor, 0.24, 0.06, LOGO_B, facing=-fwd)
    col = C.patch(m, col, back, -Vector((0, 1, 0)), tor, 0.21, 0.23, NUM_BG, facing=-fwd)
    col = C.decal(m, col, sheet, _DC["d7"], back, -Vector((0, 1, 0)), tor, 0.14, 0.21, NUM_INK, facing=-fwd, cell_key="num")
    col = _grime(m, col, 0.10)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.link(m, C.math_node(m, "MULTIPLY_ADD", above, 0.04, 0.80), C.bsdf(m).inputs["Roughness"])
    _fabric(m, folds=_folds(m, [(H + tor * 0.12, tor, 0.22, 0.045), (H - tor * 0.05, tor, 0.20, 0.03), (S - tor * 0.06 + Vector((0, -0.19, 0)), tor, 0.10, 0.03), (S - tor * 0.06 + Vector((0, 0.19, 0)), tor, 0.10, 0.03)]))
    M["bodycloth"] = m

    # ---- sleeves: upper arm JB with KESTREL along the outside, forearm JA with a JB cuff
    m = C.new_mat("sleeve_upper", (0.2, 0.2, 0.6, 1), rough=0.8)
    JA, JB, LOGO_B = C.cw_rgb(m, "JA"), C.cw_rgb(m, "JB"), C.cw_rgb(m, "LOGO_B")
    col = JB
    for s, sg in (("L", -1), ("R", 1)):
        sh, el = REST["shoulder." + s], REST["elbow." + s]
        ua = (el - sh).normalized()
        n_out = Vector((0, sg, 0))
        va = n_out.cross(ua).normalized()
        if sg > 0:
            ua = -ua  # read left-to-right from the rider's right side too
            va = n_out.cross(ua).normalized()
        col = C.decal(m, col, sheet, _DC["kestrel"], sh.lerp(el, 0.55) + n_out * 0.07, ua, va, 0.15, 0.04, LOGO_B, facing=n_out, min_facing=0.3)
    col = _grime(m, col, 0.10)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    _fabric(m, folds=_folds(m, [(REST["elbow." + s], REST["wrist." + s] - REST["shoulder." + s], 0.13, 0.03) for s in ("L", "R")]))
    M["sleeve_upper"] = m
    m = C.new_mat("sleeve_lower", (0.8, 0.8, 0.8, 1), rough=0.8)
    JA, JB = C.cw_rgb(m, "JA"), C.cw_rgb(m, "JB")
    dl = C.vmath(m, "DISTANCE", C.texcoord(m).outputs["Object"], tuple(REST["wrist.L"]))
    dr = C.vmath(m, "DISTANCE", C.texcoord(m).outputs["Object"], tuple(REST["wrist.R"]))
    cuff = C.math_node(m, "LESS_THAN", C.math_node(m, "MINIMUM", dl, dr), 0.11)
    col = C.mix_rgb(m, cuff, JA, JB)
    col = _grime(m, col, 0.10)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    _fabric(m, folds=_folds(m, [(REST["elbow." + s], REST["wrist." + s] - REST["shoulder." + s], 0.13, 0.03) for s in ("L", "R")] + [(REST["wrist." + s] - (REST["wrist." + s] - REST["elbow." + s]).normalized() * 0.12, REST["wrist." + s] - REST["elbow." + s], 0.08, 0.025) for s in ("L", "R")]))
    M["sleeve_lower"] = m

    # ---- pants: PA with a PB stripe down the outer seam and APEX along the outer thigh
    m = C.new_mat("pants", (0.05, 0.09, 0.30, 1), rough=0.78)
    PA, PB, LOGO_P = C.cw_rgb(m, "PA"), C.cw_rgb(m, "PB"), C.cw_rgb(m, "LOGO_P")
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ay = C.math_node(m, "ABSOLUTE", sep.outputs["Y"])
    seam = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", ay, 0.168), C.math_node(m, "LESS_THAN", ay, 0.20))
    col = C.mix_rgb(m, seam, PA, PB)
    for s, sg in (("L", -1), ("R", 1)):
        hp, kn = REST["hip." + s], REST["knee." + s]
        ua = (kn - hp).normalized()
        n_out = Vector((0, sg, 0))
        if sg > 0:
            ua = -ua
        va = n_out.cross(ua).normalized()
        col = C.decal(m, col, sheet, _DC["apex"], hp.lerp(kn, 0.5) + n_out * 0.14, ua, va, 0.16, 0.045, LOGO_P, facing=n_out, min_facing=0.3)
    col = _grime(m, col, 0.14, scale=12)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    sites = [(REST["knee." + s], REST["ankle." + s] - REST["hip." + s], 0.14, 0.035) for s in ("L", "R")]
    sites.append((REST["hips"] - t * 0.12 + fwd * 0.06, t, 0.16, 0.035))  # crotch
    sites += [(REST["hip." + s] - t * 0.03, REST["knee." + s] - REST["hip." + s], 0.12, 0.04) for s in ("L", "R")]
    _fabric(m, scale=700, folds=_folds(m, sites, wrinkle=0.35))
    M["pants"] = m

    # ---- helmet: shell colour, centre stripe + rear chevrons, trimark on each side; glossy
    m = C.new_mat("helmet", (0.8, 0.8, 0.8, 1), rough=0.20)
    HELMET, HSTRIPE, HLOGO = C.cw_rgb(m, "HELMET"), C.cw_rgb(m, "HSTRIPE"), C.cw_rgb(m, "HLOGO")
    headC, hd = REST["head"], REST["headDir"]
    fwd_h = Vector((hd.z, 0, -hd.x))
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ay = C.math_node(m, "ABSOLUTE", sep.outputs["Y"])
    stripe = C.math_node(m, "LESS_THAN", ay, 0.021)
    col = C.mix_rgb(m, stripe, HELMET, HSTRIPE)
    for sg in (-1, 1):
        n_out = Vector((0, sg, 0))
        col = C.decal(m, col, sheet, _DC["chevrons"], headC - fwd_h * 0.10 + n_out * 0.13 + hd * 0.04, (fwd_h if sg < 0 else -fwd_h), hd, 0.11, 0.11, HSTRIPE, facing=n_out - fwd_h * 0.4, min_facing=0.3)
        col = C.decal(m, col, sheet, _DC["trimark"], headC + fwd_h * 0.03 + n_out * 0.15 + hd * 0.085, (fwd_h if sg < 0 else -fwd_h), hd, 0.08, 0.08, HLOGO, facing=n_out, min_facing=0.5)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.set_metal_source(m, 0.0)
    C.bump(m, C.noise_fac(m, scale=400, detail=1), strength=0.02, distance=0.0003)
    M["helmet"] = m
    # visor / goggle lens: a dark (rookie) or gold (pro) mirror — metal 1, rough 0.06 so three's
    # PMREM environment gives it a specular highlight at any angle
    m = C.new_mat("visor", (0.1, 0.1, 0.1, 1), rough=0.06, metal=1.0)
    C.link(m, C.cw_rgb(m, "VISOR"), C.bsdf(m).inputs["Base Color"])
    M["visor"] = m
    # gloves: coloured back / cuff, black fingers + palm with a knuckle bump
    m = C.new_mat("gloves", (0.03, 0.03, 0.032, 1), rough=0.6)
    C.bump(m, C.noise_fac(m, scale=200, detail=2), strength=0.15, distance=0.0004)
    M["gloves"] = m
    m = C.new_mat("glove_top", (0.2, 0.2, 0.6, 1), rough=0.65)
    C.link(m, _grime(m, C.cw_rgb(m, "GLOVE"), 0.15, scale=40), C.bsdf(m).inputs["Base Color"])
    C.bump(m, C.noise_fac(m, scale=200, detail=2), strength=0.12, distance=0.0004)
    M["glove_top"] = m
    # boots: black leather with buckles; coloured shin plate carrying IRONWORKS
    m = C.new_mat("boots", (0.02, 0.02, 0.022, 1), rough=0.45)
    C.bump(m, C.noise_fac(m, scale=90, detail=3, rough=0.7), strength=0.2, distance=0.0006)
    C.link(m, _grime(m, (0.025, 0.025, 0.027, 1), 0.2, scale=30), C.bsdf(m).inputs["Base Color"])
    M["boots"] = m
    m = C.new_mat("bootplate", (0.2, 0.2, 0.6, 1), rough=0.35)
    BOOTPLATE, LOGO_B = C.cw_rgb(m, "BOOTPLATE"), C.cw_rgb(m, "LOGO_B")
    col = BOOTPLATE
    for s, sg in (("L", -1), ("R", 1)):
        an, kn = REST["ankle." + s], REST["knee." + s]
        sd = (kn - an).normalized()
        n_out = Vector((0, sg, 0))
        col = C.decal(m, col, sheet, _DC["ironworks"], an + sd * 0.19 + Vector((0.065, 0, 0)), Vector((0, sg, 0)) if False else sd, n_out.cross(sd).normalized(), 0.12, 0.03, LOGO_B, facing=Vector((1, 0, 0)), min_facing=0.4)
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    M["bootplate"] = m
    M["sole"] = C.new_mat("sole", (0.09, 0.085, 0.075, 1), rough=0.9)
    m = C.new_mat("armour", (0.10, 0.10, 0.11, 1), rough=0.4)
    C.bump(m, C.noise_fac(m, scale=150, detail=1), strength=0.05, distance=0.0004)
    M["armour"] = m
    M["alloy"] = C.new_mat("alloy_r", (0.6, 0.6, 0.62, 1), rough=0.35, metal=1.0)
    # skin: the neck between the collar and the helmet (the only skin a trials rider shows)
    m = C.new_mat("skin", SKIN, rough=0.55)
    f = C.noise_fac(m, scale=80, detail=2)
    C.link(m, C.ramp(m, f, [(0.3, (0.50, 0.32, 0.23, 1)), (0.7, (0.60, 0.40, 0.29, 1))]), C.bsdf(m).inputs["Base Color"])
    M["skin"] = m
    M["jersey"] = M["sleeve_upper"]  # shoulder caps / back hump take the panel colour
    return M


# ----------------------------------------------------------------------------- body (lofted volumes, H1 round 2)
# Round 4 was a skin-modifier stick figure: every limb the same tube, no shoulders, no hem, paint-only
# seams. Round 2 of H1 lofts the body from measured cross sections instead: a jersey shell that hangs
# over a separate pants shell (a real hem), one continuous tube per limb with deltoid / bicep / elbow
# pad / thigh / knee pad / calf radii keyed by arc length (guards under the fabric), a skin neck,
# gloves that are a fist, boots with a flared shaft. Weights are assigned per loft station (bone
# blends across each joint), so the same 19-joint rig deforms it without tearing.
TAU = math.tau
HELMET_R = 0.172  # shell radius; round 4 was 0.13 * 1.08 = 0.14 -> the reference helmet is ~1.2-1.3x that


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def blend2(s, s_joint, bw, a, b):
    """Weights across a joint at arc length s_joint: bone a before, b after, blended over +-bw."""
    w = smoothstep((s - s_joint + bw) / (2 * bw))
    return {k: v for k, v in ((a, 1 - w), (b, w)) if v > 1e-3}


def ring_pts(c, au, av, ru, rvf, rvb, seg):
    """Elliptical section: half-width ru along au, rvf toward +av (front / bend outside), rvb toward -av."""
    pts = []
    for i in range(seg):
        a = TAU * i / seg
        ca, sa = math.cos(a), math.sin(a)
        rv = rvf if sa >= 0 else rvb
        pts.append(Vector(c) + au * (ru * ca) + av * (rv * sa))
    return pts


def loft(b, rings, weights, mats, cap_start=True, cap_end=True):
    """Quad-strip the rings (equal length) into the MeshBuilder; weights: per-ring group dict,
    mats: per-segment material (len(rings) - 1). Caps are n-gons (triangulated on export)."""
    bm = b.bm
    vr = []
    for ring in rings:
        vr.append([bm.verts.new(p) for p in ring])
    bm.verts.index_update()
    for k, vs in enumerate(vr):
        for v in vs:
            b.groups[v.index] = dict(weights[k])
    seg = len(rings[0])
    faces = []
    for k in range(len(rings) - 1):
        mi = b.mat_index(mats[k])
        A, B = vr[k], vr[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            try:
                f = bm.faces.new([A[i], A[j], B[j], B[i]])
            except ValueError:
                continue
            f.material_index = mi
            f.smooth = True
            faces.append(f)
    for on, ring, mi in ((cap_start, vr[0], b.mat_index(mats[0])), (cap_end, vr[-1], b.mat_index(mats[-1]))):
        if on:
            try:
                f = bm.faces.new(ring)
                f.material_index = mi
                f.smooth = True
                faces.append(f)
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def interp_keys(keys, s):
    """keys: sorted (s, ru, rvf, rvb, out) -> linear interpolation at s."""
    ss = [k[0] for k in keys]
    return tuple(float(np.interp(s, ss, [k[i] for k in keys])) for i in range(1, 5))


def limb(b, pts, keys_fn, bones_fn, mat_fn, seg, n, hint, s_max_fn=None, out_dir=None):
    """One continuous lofted limb along the Catmull-Rom path through the joints `pts`.
    keys_fn(sj) -> radius keys (s, lateral half-width, radius toward `hint` = the bend's outside,
    radius away from it, outward centre shift) with sj = arc length of each joint; bones_fn(s, sj)
    -> weights; mat_fn(s, sj) -> material. `out_dir` = lateral direction for the centre shift."""
    path = C.catmull(pts, 12)
    cum = [0.0]
    for i in range(1, len(path)):
        cum.append(cum[-1] + (path[i] - path[i - 1]).length)
    sj = [cum[min(12 * k, len(cum) - 1)] for k in range(len(pts))]
    s_max = s_max_fn(sj) if s_max_fn else cum[-1]
    keys = sorted(keys_fn(sj))
    rings, ws, ss = [], [], []
    for k in range(n + 1):
        s = s_max * k / n
        i = min(int(np.searchsorted(cum, s, side="right")) - 1, len(path) - 2)
        i = max(i, 0)
        f = (s - cum[i]) / max(cum[i + 1] - cum[i], 1e-9)
        c = path[i].lerp(path[i + 1], f)
        tang = (path[i + 1] - path[i]).normalized()
        au = Vector((0, 1, 0)) - tang * tang.y
        au.normalize()
        av = tang.cross(au)
        if av.dot(hint) < 0:
            av = -av
        ru, rvf, rvb, out = interp_keys(keys, s)
        if out and out_dir is not None:
            c = c + out_dir * out
        rings.append(ring_pts(c, au, av, ru, rvf, rvb, seg))
        ws.append(bones_fn(s, sj))
        ss.append(s)
    mats = [mat_fn(0.5 * (ss[k] + ss[k + 1]), sj) for k in range(n)]
    loft(b, rings, ws, mats)


def build_body(J, M, b):
    """Torso (jersey shell over a pants shell), arms, legs, neck into the MeshBuilder `b`."""
    H, S = J["hips"], J["shoulders"]
    t, hd = J["torsoDir"], J["headDir"]
    side = Vector((0, 1, 0))
    fwd = Vector((t.z, 0, -t.x))  # perpendicular to the torso in XZ, forward

    def torso_w(u):
        """pelvis / spine / chest along the torso (u from the hips, metres), as the bones are laid out."""
        if u < 0.10:
            w = blend2(u, 0.10, 0.05, "pelvis", "spine")
        else:
            w = blend2(u, 0.28, 0.06, "spine", "chest")
        return w

    # ---- jersey shell: hem (below the belt, over the pants) -> waist -> chest -> shoulder line -> traps -> neck base
    seg = C.S(24)
    JER = [  # (u along t, ru lateral, rv front, rv back)
        (-0.065, 0.185, 0.130, 0.135),
        (-0.010, 0.178, 0.126, 0.132),
        (0.060, 0.170, 0.124, 0.130),
        (0.160, 0.166, 0.126, 0.134),
        (0.260, 0.176, 0.132, 0.150),
        (0.360, 0.192, 0.138, 0.156),
        (0.440, 0.208, 0.136, 0.150),
        (0.520, 0.215, 0.112, 0.128),
        (0.560, 0.150, 0.088, 0.096),
        (0.600, 0.085, 0.060, 0.062),
    ]
    rings, ws = [], []
    for u, ru, rvf, rvb in JER:
        c = H + t * u + fwd * (0.008 if u > 0.4 else 0.0)
        rings.append(ring_pts(c, side, fwd, ru, rvf, rvb, seg))
        w = torso_w(u) if u < 0.53 else {"chest": 0.75, "neck": 0.25}
        ws.append(w)
    loft(b, rings, ws, [M["bodycloth"]] * (len(rings) - 1))
    # ---- pants shell: crotch -> seat -> hips -> belt (inside the jersey)
    PAN = [
        (-0.165, 0.055, 0.045, 0.050),
        (-0.120, 0.125, 0.092, 0.108),
        (-0.060, 0.160, 0.110, 0.122),
        (0.000, 0.170, 0.114, 0.126),
        (0.070, 0.166, 0.112, 0.122),
    ]
    rings, ws = [], []
    for u, ru, rvf, rvb in PAN:
        rings.append(ring_pts(H + t * u + fwd * 0.012, side, fwd, ru, rvf, rvb, seg))
        ws.append({"pelvis": 1.0})
    loft(b, rings, ws, [M["pants"]] * (len(rings) - 1))
    # ---- neck (skin) between the collar and the helmet
    add(b, prim_cylinder(0.056, 0.052, 0.15, seg=C.S(14)), Matrix.Translation(S + hd * 0.02) @ C.rot_frame(hd), M["skin"], {"neck": 0.7, "chest": 0.3})

    for s, sg in (("L", -1), ("R", 1)):
        out_dir = Vector((0, sg, 0))
        # ---- arm: starts inside the jersey at the shoulder, deltoid, bicep, elbow pad on the outside, forearm, wrist
        sh, el, wr = J["shoulder." + s], J["elbow." + s], J["wrist." + s]
        p0 = sh.lerp(S, 0.28)
        hint = el - sh.lerp(wr, 0.5)  # the outside of the elbow bend

        def arm_keys(sj):
            s1, s2, s3 = sj[1], sj[2], sj[3]
            return [
                (0.0, 0.052, 0.052, 0.052, 0),
                (s1 + 0.035, 0.080, 0.082, 0.080, 0),   # deltoid
                (s1 + 0.130, 0.071, 0.074, 0.070, 0),   # bicep / triceps
                (s2 - 0.070, 0.063, 0.064, 0.062, 0),
                (s2, 0.060, 0.078, 0.056, 0),           # elbow guard under the sleeve
                (s2 + 0.060, 0.061, 0.066, 0.060, 0),
                (s2 + 0.140, 0.058, 0.058, 0.057, 0),   # forearm
                (s3, 0.046, 0.046, 0.046, 0),
            ]

        def arm_bones(sa, sj, s=s):
            s1, s2 = sj[1], sj[2]
            if sa < s1 + 0.10:
                w = 0.55 * (1 - smoothstep((sa - s1 + 0.04) / 0.14))
                return {"chest": w, "upperArm." + s: 1 - w}
            return blend2(sa, s2, 0.055, "upperArm." + s, "forearm." + s)

        limb(b, [p0, sh, el, wr], arm_keys, arm_bones, lambda sa, sj: M["sleeve_upper"] if sa < sj[2] + 0.02 else M["sleeve_lower"], C.S(18), C.S(18), hint, out_dir=out_dir)

        # ---- leg: from inside the pelvis, glute / thigh, knee pad forward (shifted out off the tank), calf, into the boot
        hp, kn, an = J["hip." + s], J["knee." + s], J["ankle." + s]
        p0 = hp + t * 0.09
        hint = kn - hp.lerp(an, 0.5)  # forward

        def leg_keys(sj):
            s1, s2, s3 = sj[1], sj[2], sj[3]
            return [
                (0.0, 0.092, 0.092, 0.098, 0),
                (s1, 0.104, 0.104, 0.118, 0),           # hip / glute
                (s1 + 0.180, 0.098, 0.102, 0.100, 0.006),
                (s2 - 0.080, 0.085, 0.088, 0.084, 0.016),
                (s2, 0.078, 0.100, 0.076, 0.022),       # knee guard under the pants
                (s2 + 0.070, 0.075, 0.082, 0.074, 0.016),
                (s2 + 0.170, 0.070, 0.070, 0.074, 0.006),  # calf
                (s3 - 0.230, 0.066, 0.066, 0.066, 0),
            ]

        def leg_bones(sa, sj, s=s):
            s1, s2 = sj[1], sj[2]
            if sa < s1 + 0.10:
                w = 0.5 * (1 - smoothstep((sa - s1 + 0.04) / 0.14))
                return {"pelvis": w, "thigh." + s: 1 - w}
            return blend2(sa, s2, 0.06, "thigh." + s, "shin." + s)

        limb(b, [p0, hp, kn, an], leg_keys, leg_bones, lambda sa, sj: M["pants"], C.S(20), C.S(18), hint, s_max_fn=lambda sj: sj[3] - 0.235, out_dir=out_dir)


# ----------------------------------------------------------------------------- gear (primitives)
def add(b, bm, M4, mat, group, sharp=None, smooth=True):
    b.add(bm, M4, mat, group=group, sharp_angle=sharp, smooth=smooth)
    bm.free()


def build_gear(J, M, b):
    """Helmet (MX shell, chin bar, peak, wrap-around goggles + strap, vents), neck brace, gloves (fist), boots."""
    S, H = J["shoulders"], J["hips"]
    t, hd = J["torsoDir"], J["headDir"]
    fwd_h = Vector((hd.z, 0, -hd.x))  # head forward
    fwd_t = Vector((t.z, 0, -t.x))
    headC = J["head"]
    # head frame: local x = forward, z = up along headDir
    Mh = Matrix((
        (fwd_h.x, 0, hd.x, headC.x),
        (fwd_h.y, 1, hd.y, headC.y),
        (fwd_h.z, 0, hd.z, headC.z),
        (0, 0, 0, 1),
    ))
    R = HELMET_R
    cz = 0.03  # shell centre above the head-bone centre (the chin bar hangs below)
    # the shell is pitched 10 deg up on the head bone so the goggles face the track, not the front wheel
    Mc = Mh @ Matrix.Translation((0.01, 0, cz)) @ Matrix.Rotation(-0.17, 4, "Y")
    front = lambda deg: Matrix.Rotation(-math.radians(deg) / 2, 4, "Z")  # centre a torus sweep on +x  # noqa: E731
    # shell: a lathe, round on top, the lower half drawn in toward the jaw (not a sphere), longer front-back
    prof = [(0.0, 1.0), (0.42, 0.91), (0.72, 0.70), (0.90, 0.44), (0.985, 0.18), (1.0, -0.06), (0.97, -0.30), (0.90, -0.52), (0.80, -0.70), (0.66, -0.82), (0.45, -0.90), (0.0, -0.94)]
    add(b, prim_lathe([(r * R, z * R) for r, z in prof], seg=32), Mc @ Matrix.Diagonal((1.06, 0.95, 1, 1)), M["helmet"], "head")
    # chin bar: a 200 deg sweep at jaw height, flush with the shell at the cheeks, thrust forward at the mouth
    add(b, prim_torus(R * 0.78, 0.040, seg=28, sides=10, sweep=math.radians(200), scale_r=(1.0, 1.4)), Mc @ Matrix.Translation((0.05, 0, -0.62 * R)) @ Matrix.Diagonal((1.22, 0.92, 1, 1)) @ front(200), M["helmet"], "head")
    add(b, prim_box(0.04, 0.11, 0.05, bevel=0.012, segments=2), Mc @ Matrix.Translation((0.05 + (R * 0.78 + 0.028) * 1.22, 0, -0.62 * R)), M["armour"], "head", sharp=40)  # mouth vent, half buried in the bar
    # peak: a flat annular sector above the goggles, a little nose-down on top of the head's own 24 deg
    add(b, prim_torus(R * 0.98, 0.058, seg=20, sides=6, sweep=math.radians(118), scale_r=(1.0, 0.06)), Mc @ Matrix.Translation((0.035, 0, 0.72 * R)) @ Matrix.Rotation(0.30, 4, "Y") @ Matrix.Diagonal((1.0, 0.9, 1, 1)) @ front(118), M["helmet"], "head", sharp=30)
    # goggles: frame + proud lens both follow the shell (torus sectors), strap around the shell
    Mg = Mc @ Matrix.Translation((0.0, 0, 0.012)) @ Matrix.Diagonal((1.06, 0.95, 1, 1))
    add(b, prim_torus(R * 1.02, 0.044, seg=16, sides=8, sweep=math.radians(120), scale_r=(0.55, 1.0)), Mg @ front(120), M["armour"], "head")
    add(b, prim_torus(R * 1.05, 0.036, seg=16, sides=8, sweep=math.radians(108), scale_r=(0.40, 1.0)), Mg @ front(108), M["visor"], "head")
    add(b, prim_torus(R * 1.0, 0.014, seg=32, sides=6, scale_r=(0.6, 1.9)), Mg, M["armour"], "head")  # strap
    # vents: two brow scoops and a rear spoiler
    for sg in (-1, 1):
        add(b, prim_box(0.045, 0.03, 0.016, bevel=0.005), Mc @ Matrix.Translation((0.085, sg * 0.05, 0.86 * R)) @ Matrix.Rotation(0.75, 4, "Y"), M["armour"], "head", sharp=40)
    add(b, prim_box(0.06, 0.13, 0.024, bevel=0.007), Mc @ Matrix.Translation((-0.86 * R, 0, 0.42 * R)) @ Matrix.Rotation(-0.55, 4, "Y"), M["armour"], "head", sharp=40)
    # neck brace collar + a chest strap ring on the chest bone
    Mt = Matrix((
        (fwd_t.x, 0, t.x, S.x),
        (fwd_t.y, 1, t.y, S.y),
        (fwd_t.z, 0, t.z, S.z),
        (0, 0, 0, 1),
    ))
    add(b, prim_torus(0.115, 0.028, seg=28, sides=8, scale_r=(1.1, 1)), Mt @ Matrix.Translation((-0.03, 0, -0.02)) @ Matrix.Diagonal((1.15, 1.3, 1, 1)), M["armour"], "chest")
    add(b, prim_torus(0.072, 0.012, seg=20, sides=6), Mt @ Matrix.Translation((0.0, 0, 0.012)), M["armour"], "chest")
    for s, sg in (("L", -1), ("R", 1)):
        # -- glove: a fist around the grip (bar axis = y), thumb, back-of-hand plate, cuff over the sleeve
        wr = J["wrist." + s]
        fd = (wr - J["elbow." + s]).normalized()
        ybar = (Vector((0, 1, 0)) - fd * fd.y).normalized()
        zf = fd.cross(ybar)  # forward-ish = back of the hand
        Mw = Matrix((
            (fd.x, ybar.x, zf.x, wr.x),
            (fd.y, ybar.y, zf.y, wr.y),
            (fd.z, ybar.z, zf.z, wr.z),
            (0, 0, 0, 1),
        ))
        add(b, prim_box(0.082, 0.100, 0.078, bevel=0.030, segments=3), Mw @ Matrix.Translation((0.012, 0, 0.004)), M["gloves"], "hand." + s)
        add(b, prim_box(0.028, 0.092, 0.024, bevel=0.009, segments=2), Mw @ Matrix.Translation((-0.004, 0, 0.046)), M["gloves"], "hand." + s)  # knuckles
        add(b, prim_box(0.055, 0.084, 0.024, bevel=0.009, segments=2), Mw @ Matrix.Translation((-0.028, 0, 0.036)), M["glove_top"], "hand." + s)  # back plate
        add(b, prim_cylinder(0.015, 0.013, 0.046, seg=10), Mw @ Matrix.Translation((0.028, -sg * 0.045, -0.012)) @ Matrix.Rotation(-sg * math.pi / 2, 4, "X"), M["gloves"], "hand." + s)  # thumb
        add(b, prim_cylinder(0.047, 0.053, 0.085, seg=14), Matrix.Translation(wr - fd * 0.115) @ C.rot_frame(fd), M["glove_top"], {"forearm." + s: 0.7, "hand." + s: 0.3})
        add(b, prim_torus(0.052, 0.006, seg=14, sides=5), Matrix.Translation(wr - fd * 0.10) @ C.rot_frame(fd), M["armour"], {"forearm." + s: 0.7, "hand." + s: 0.3})
        # -- boot: flared shaft over the pants, bellows, foot block on the peg, toe, sole, heel cup, 3 buckles + shin plate
        an, kn = J["ankle." + s], J["knee." + s]
        sd = (kn - an).normalized()
        shaft_len = 0.30
        add(b, prim_lathe([(0.0, -0.01), (0.066, 0.0), (0.064, 0.09), (0.063, 0.17), (0.070, 0.24), (0.079, shaft_len), (0.0, shaft_len + 0.008)], seg=16), Matrix.Translation(an) @ C.rot_frame(sd), M["boots"], lambda co, an=an, sd=sd, s=s: {"shin." + s: 1.0} if (co - an).dot(sd) > 0.05 else {"shin." + s: 0.6, "foot." + s: 0.4})
        add(b, prim_torus(0.064, 0.012, seg=16, sides=6, scale_r=(1, 1.6)), Matrix.Translation(an + sd * 0.045) @ C.rot_frame(sd), M["armour"], {"shin." + s: 0.6, "foot." + s: 0.4})  # bellows
        Mf = Matrix.Translation(an)
        add(b, prim_box(0.26, 0.120, 0.095, bevel=0.034, segments=3), Mf @ Matrix.Translation((0.055, 0, -0.045)), M["boots"], "foot." + s)
        add(b, prim_box(0.10, 0.112, 0.07, bevel=0.032, segments=3), Mf @ Matrix.Translation((0.165, 0, -0.058)), M["boots"], "foot." + s)
        add(b, prim_box(0.30, 0.124, 0.022, bevel=0.007), Mf @ Matrix.Translation((0.065, 0, -0.088)), M["sole"], "foot." + s, sharp=40)
        add(b, prim_box(0.07, 0.124, 0.10, bevel=0.024), Mf @ Matrix.Translation((-0.06, 0, -0.038)), M["armour"], "foot." + s)
        for by in (0.10, 0.18, 0.26):
            add(b, prim_box(0.032, 0.135, 0.032, bevel=0.007), Matrix.Translation(an + sd * by) @ C.rot_frame(sd) @ Matrix.Translation((0.064, 0, 0)), M["alloy"], "shin." + s, sharp=40)
        add(b, prim_box(0.03, 0.10, 0.26, bevel=0.012, segments=2), Matrix.Translation(an + sd * 0.17) @ C.rot_frame(sd) @ Matrix.Translation((0.058, 0, 0)), M["bootplate"], "shin." + s)


# ----------------------------------------------------------------------------- posing + actions
def pose_from_joints(arm, B, J):
    """Set every pose bone so its head/tail match the target joints J (armature space)."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    targets = {}
    H, S = J["hips"], J["shoulders"]
    t, hd = J["torsoDir"], J["headDir"]
    targets["pelvis"] = (H - t * 0.02, H + t * 0.10)
    targets["spine"] = (H + t * 0.10, H + t * 0.28)
    targets["chest"] = (H + t * 0.28, S)
    targets["neck"] = (S, S + hd * 0.10)
    targets["head"] = (S + hd * 0.10, S + hd * 0.36)
    for s, sg in (("L", -1), ("R", 1)):
        targets["shoulder." + s] = (S + V(0, sg * 0.04, -0.01), J["shoulder." + s])
        targets["upperArm." + s] = (J["shoulder." + s], J["elbow." + s])
        targets["forearm." + s] = (J["elbow." + s], J["wrist." + s])
        fd = (J["wrist." + s] - J["elbow." + s]).normalized()
        targets["hand." + s] = (J["wrist." + s], J["wrist." + s] + fd * 0.09)
        targets["thigh." + s] = (J["hip." + s], J["knee." + s])
        targets["shin." + s] = (J["knee." + s], J["ankle." + s])
        targets["foot." + s] = (J["ankle." + s], J["toe." + s])
    for name in BONE_ORDER:
        pb = arm.pose.bones[name]
        rest_h, rest_t, _ = B[name]
        d0 = (Vector(rest_t) - Vector(rest_h)).normalized()
        th, tt = targets[name]
        d1 = (Vector(tt) - Vector(th)).normalized()
        q = d0.rotation_difference(d1)
        rest_rot = arm.data.bones[name].matrix_local.to_3x3()
        M4 = Matrix.Translation(th) @ (q.to_matrix() @ rest_rot).to_4x4()
        pb.matrix = M4
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def action_fcurves(act, arm):
    if hasattr(act, "fcurves"):
        return act.fcurves
    from bpy_extras import anim_utils

    slot = arm.animation_data.action_slot
    cb = anim_utils.action_get_channelbag_for_slot(act, slot)
    return cb.fcurves if cb else []


def make_action(arm, name, keys, loop=False):
    """keys: list of (frame, chain kwargs dict or J)."""
    act = bpy.data.actions.new(name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    try:
        if not act.slots:
            act.slots.new(id_type="OBJECT", name="rider_rig")
        arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    for frame, J in keys:
        pose_from_joints(arm, BONES, J)
        key_all(arm, frame)
    act.frame_range = (keys[0][0], keys[-1][0])
    act.use_frame_range = True
    act.use_cyclic = loop
    for fc in action_fcurves(act, arm):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.easing = "AUTO"
    # stash on the NLA so the exporter picks every action up
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(keys[0][0]), act)
    track.mute = True
    arm.animation_data.action = None
    return act


def build_actions(arm):
    A = {}
    P = lambda name, **o: chain(name, **o)  # noqa: E731
    rest = P("stand_attack")
    A["stand_attack"] = make_action(arm, "stand_attack", [(1, rest), (30, rest)])
    A["hang_back"] = make_action(arm, "hang_back", [(1, rest), (15, P("hang_back")), (30, P("hang_back"))])
    A["forward_attack"] = make_action(arm, "forward_attack", [(1, rest), (15, P("forward_attack")), (30, P("forward_attack"))])
    A["crouch"] = make_action(arm, "crouch", [(1, rest), (15, P("crouch")), (30, P("crouch"))])
    A["extend"] = make_action(arm, "extend", [(1, P("crouch")), (8, P("extend")), (20, rest)])
    A["land_absorb"] = make_action(arm, "land_absorb", [(1, P("extend")), (8, P("land_absorb")), (30, rest)])
    breathe = []
    for f in range(0, 121, 15):
        ph = f / 120 * 2 * math.pi
        breathe.append((1 + f, P("stand_attack", dh=(0.0, -0.015 + 0.015 * math.cos(ph)), dt=1.5 * math.sin(ph), head=68 + 2 * math.sin(ph))))
    A["idle_breathe"] = make_action(arm, "idle_breathe", breathe, loop=True)
    A["sit_cruise"] = make_action(arm, "sit_cruise", [(1, rest), (15, P("sit_cruise")), (30, P("sit_cruise", head=82))])
    return A


# ----------------------------------------------------------------------------- main
def main():
    global BONES
    import decals as D

    C.reset_scene()
    sheet = D.ensure_sheet()
    M = make_materials(sheet)
    J = REST
    BONES = define_bones(J)
    arm = build_armature(BONES)
    gb = MeshBuilder("rider")
    build_body(J, M, gb)
    body_tris = sum(len(f.verts) - 2 for f in gb.bm.faces)
    build_gear(J, M, gb)
    body = gb.build()
    log("body tris", body_tris, "gear tris", C.tri_count(body) - body_tris)
    for p in body.data.polygons:
        p.use_smooth = True
    body.name = "rider"
    body.data.name = "rider"
    if LOD:
        log("lod decimate", C.tri_count(body), "->", C.decimate_to(body, LOD_TRIS))
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    body.parent = arm
    bpy.context.view_layer.update()
    tris = C.tri_count(body)
    log("rider tris", tris, "verts", len(body.data.vertices))

    if not LOD:
        write_chain_md(os.path.join(C.HERE, "RIDER_CHAIN.md"))
    C.unwrap_all([body], angle=66, margin=0.002)
    C.apply_colourway(COLOURWAYS["rookie"])
    if not NO_BAKE:
        variants = [(cw, (lambda cw=cw: C.apply_colourway(COLOURWAYS[cw]))) for cw in ("rookie", "pro")]
        paths = C.bake_atlas([body], SIZE, C.BAKE_DIR, OUT_NAME, jpeg_quality=88, normal_size=SIZE // 2, orm_size=SIZE // 2, variants=variants)
        mats = {cw: C.atlas_material(f"rider_{cw}", paths, albedo=f"albedo:{cw}") for cw in ("rookie", "pro")}
        C.assign_atlas([body], mats["rookie"])
        C.setup_variants([body], [(f"rider_{cw}", {"rider": mats[cw]}) for cw in ("rookie", "pro")])
    actions = build_actions(arm)
    log("actions", list(actions))
    # rest pose for the file
    bpy.context.scene.frame_set(1)
    blend_path = os.path.join(C.HERE, OUT_NAME + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    out = os.path.join(C.MODELS, OUT_NAME + ".glb")
    size = C.export_glb(out, [arm, body], animations=True, meshopt=MESHOPT)
    info = C.gltf_summary(out)
    log("glb", info)
    with open(os.path.join(C.HERE, OUT_NAME + ".stats.txt"), "w") as f:
        f.write(f"tris={tris}\nglb_bytes={size}\n")
        f.write("bones (rest head -> tail, rear-axle frame, Blender x,y,z):\n")
        for n in BONE_ORDER:
            h, t, p = BONES[n]
            f.write(f"  {n:12s} parent={p or '-':12s} head=({h.x:.3f},{h.y:.3f},{h.z:.3f}) tail=({t.x:.3f},{t.y:.3f},{t.z:.3f}) len={(t - h).length:.3f}\n")
        f.write(f"gltf={info}\n")


if __name__ == "__main__":
    main()
