"""Rigged, skinned trials rider -> public/models/rider.glb

blender -b --python assets/blender/build_rider.py [-- --no-bake] [-- --size 1024]

Frame while building = the bike's: origin = REAR AXLE, +X forward, +Z up, -Y camera side
(rider's left). Exported Y-up (+x forward, +y up, +z camera). The REST POSE is the render's
attack chain (riderModel.ts poseRider at lean 0 / crouch 0 / torsoPitch 0 / armExtend 0):
hips (0.53, 0.74), shoulders (0.82, 1.15), grips (0.92, 0.78, z +-0.33), ankles (0.52, 0.11).
Bones are named exactly as the joint set the render drives:
  pelvis, spine, chest, neck, head, shoulder.L/R, upperArm.L/R, forearm.L/R, hand.L/R,
  thigh.L/R, shin.L/R, foot.L/R           (.L = rider's left = camera side, glTF +z)
Body = skin-modifier stick figure + subdivision (one continuous quad skin), gear = merged
primitives; weights are envelope-blended per bone with rigid groups for the hard parts.
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
SIZE = int(ARGS[ARGS.index("--size") + 1]) if "--size" in ARGS else 1024
MESHOPT = "--no-meshopt" not in ARGS
FPS = 30
BODY_DECIMATE = float(ARGS[ARGS.index("--decimate") + 1]) if "--decimate" in ARGS else 0.55

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
    lines.append(f"| neck (shoulder line -> head/helmet centre) | {L['neck']:.2f} | helmet radius {L['headR']:.2f}; helmet bottom sits 0.09 above the shoulder line = a visible neck |")
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
    with open(path, "w") as f:
        f.write("\n".join(lines))


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


# ----------------------------------------------------------------------------- materials
def make_materials():
    M = {}
    m = C.new_mat("jersey", (0.93, 0.66, 0.04, 1), rough=0.82)
    w = C.node(m, "ShaderNodeTexWave")
    w.wave_type = "BANDS"
    w.bands_direction = "DIAGONAL"
    w.inputs["Scale"].default_value = 900
    C.link(m, C.texcoord(m).outputs["Object"], w.inputs["Vector"])
    w2 = C.node(m, "ShaderNodeTexWave")
    w2.wave_type = "BANDS"
    w2.bands_direction = "X"
    w2.inputs["Scale"].default_value = 900
    C.link(m, C.texcoord(m).outputs["Object"], w2.inputs["Vector"])
    weave = C.math_node(m, "MULTIPLY", w.outputs["Fac"], w2.outputs["Fac"])
    C.bump(m, weave, strength=0.12, distance=0.0004)
    f = C.noise_fac(m, scale=25, detail=2)
    C.link(m, C.ramp(m, f, [(0.3, (0.90, 0.62, 0.03, 1)), (0.7, (0.97, 0.72, 0.08, 1))]), C.bsdf(m).inputs["Base Color"])
    M["jersey"] = m
    m = C.new_mat("pants", (0.05, 0.09, 0.30, 1), rough=0.78)
    f = C.noise_fac(m, scale=60, detail=3)
    C.bump(m, f, strength=0.1, distance=0.0005)
    C.link(m, C.ramp(m, f, [(0.3, (0.045, 0.08, 0.27, 1)), (0.7, (0.06, 0.11, 0.34, 1))]), C.bsdf(m).inputs["Base Color"])
    M["pants"] = m
    # body cloth: jersey above the belt line, pants below (object-space plane through the hips,
    # normal = torso direction) with a dark hem band; one material so the split is a clean line
    m = C.new_mat("bodycloth", (0.93, 0.66, 0.04, 1), rough=0.8)
    H, t = REST["hips"], REST["torsoDir"]
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ux = C.math_node(m, "MULTIPLY", sep.outputs["X"], t.x)
    uz = C.math_node(m, "MULTIPLY", sep.outputs["Z"], t.z)
    u = C.math_node(m, "ADD", ux, uz)
    u0 = H.x * t.x + H.z * t.z + 0.05
    above = C.math_node(m, "GREATER_THAN", u, u0)
    hem = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", u, u0 - 0.035), C.math_node(m, "LESS_THAN", u, u0))
    fj = C.noise_fac(m, scale=25, detail=2)
    jcol = C.ramp(m, fj, [(0.3, (0.90, 0.62, 0.03, 1)), (0.7, (0.97, 0.72, 0.08, 1))])
    fp = C.noise_fac(m, scale=60, detail=3)
    pcol = C.ramp(m, fp, [(0.3, (0.045, 0.08, 0.27, 1)), (0.7, (0.06, 0.11, 0.34, 1))])
    # jersey graphics: dark-blue side panels (|y| > 0.125 on the torso, u 0.06..0.40) and a
    # white chest band at u 0.30..0.34, so the shirt reads as printed race gear, not a blank tube
    ay = C.math_node(m, "ABSOLUTE", sep.outputs["Y"])
    side_panel = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", ay, 0.15), C.math_node(m, "LESS_THAN", u, u0 + 0.30))
    side_panel = C.math_node(m, "MULTIPLY", side_panel, C.math_node(m, "LESS_THAN", ay, 0.19))
    band = C.math_node(m, "MULTIPLY", C.math_node(m, "GREATER_THAN", u, u0 + 0.26), C.math_node(m, "LESS_THAN", u, u0 + 0.30))
    jcol = C.mix_rgb(m, side_panel, jcol, pcol)
    jcol = C.mix_rgb(m, band, jcol, (0.90, 0.90, 0.90, 1))
    col = C.mix_rgb(m, above, pcol, jcol)
    col = C.mix_rgb(m, hem, col, (0.08, 0.08, 0.09, 1))
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.link(m, C.math_node(m, "MULTIPLY_ADD", above, 0.05, 0.78), C.bsdf(m).inputs["Roughness"])
    w = C.node(m, "ShaderNodeTexWave")
    w.wave_type = "BANDS"
    w.bands_direction = "DIAGONAL"
    w.inputs["Scale"].default_value = 900
    C.link(m, C.texcoord(m).outputs["Object"], w.inputs["Vector"])
    C.bump(m, w.outputs["Fac"], strength=0.08, distance=0.0003)
    M["bodycloth"] = m
    m = C.new_mat("helmet", (0.03, 0.12, 0.62, 1), rough=0.22)
    # white centre stripe: |y| < 0.02 on the shell (object coords)
    sep = C.node(m, "ShaderNodeSeparateXYZ")
    C.link(m, C.texcoord(m).outputs["Object"], sep.inputs[0])
    ay = C.math_node(m, "ABSOLUTE", sep.outputs["Y"])
    stripe = C.math_node(m, "LESS_THAN", ay, 0.018)
    col = C.mix_rgb(m, stripe, (0.03, 0.12, 0.62, 1), (0.92, 0.92, 0.92, 1))
    C.link(m, col, C.bsdf(m).inputs["Base Color"])
    C.set_metal_source(m, 0.15)
    M["helmet"] = m
    M["visor"] = C.new_mat("visor", (0.05, 0.06, 0.08, 1), rough=0.08, metal=0.6)
    m = C.new_mat("gloves", (0.03, 0.03, 0.032, 1), rough=0.6)
    C.bump(m, C.noise_fac(m, scale=200, detail=2), strength=0.15, distance=0.0004)
    M["gloves"] = m
    m = C.new_mat("boots", (0.02, 0.02, 0.022, 1), rough=0.45)
    C.bump(m, C.noise_fac(m, scale=90, detail=3, rough=0.7), strength=0.2, distance=0.0006)
    M["boots"] = m
    M["sole"] = C.new_mat("sole", (0.09, 0.085, 0.075, 1), rough=0.9)
    m = C.new_mat("armour", (0.10, 0.10, 0.11, 1), rough=0.4)
    C.bump(m, C.noise_fac(m, scale=150, detail=1), strength=0.05, distance=0.0004)
    M["armour"] = m
    M["alloy"] = C.new_mat("alloy_r", (0.6, 0.6, 0.62, 1), rough=0.35, metal=1.0)
    M["skin"] = C.new_mat("balaclava", (0.02, 0.02, 0.02, 1), rough=0.85)
    # number patch: image texture drawn in numpy (white 27 on jersey yellow with a dark hem)
    M["number"] = number_material()
    return M


DIGITS = {
    "2": ["1111", "0001", "1111", "1000", "1111"],
    "7": ["1111", "0001", "0010", "0100", "0100"],
}


def number_material(text="27"):
    w, h = 128, 128
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[..., :3] = (0.93, 0.66, 0.04)
    px[..., 3] = 1
    px[:14, :, :3] = (0.05, 0.09, 0.30)  # hem (bottom in Blender image coords = row 0)
    cell = 16
    x0 = 20
    for d in text:
        rows = DIGITS[d]
        for r, row in enumerate(rows):
            for c, ch in enumerate(row):
                if ch == "1":
                    y0 = h - 22 - (r + 1) * cell
                    px[y0 : y0 + cell, x0 + c * cell : x0 + (c + 1) * cell, :3] = (0.97, 0.97, 0.97)
        x0 += 5 * cell
    img = bpy.data.images.new("rider_number", w, h)
    img.pixels.foreach_set(px.ravel())
    os.makedirs(C.BAKE_DIR, exist_ok=True)
    p = os.path.join(C.BAKE_DIR, "rider_number.png")
    img.filepath_raw = p
    img.file_format = "PNG"
    img.save()
    m = C.new_mat("number", rough=0.8)
    t = C.node(m, "ShaderNodeTexImage")
    t.image = bpy.data.images.load(p)
    t.interpolation = "Closest"
    uvn = C.node(m, "ShaderNodeUVMap")
    uvn.uv_map = "UVNum"
    C.link(m, uvn.outputs["UV"], t.inputs["Vector"])
    C.link(m, t.outputs["Color"], C.bsdf(m).inputs["Base Color"])
    return m


def apply_number_uvs(body, M):
    me = body.data
    uv = me.uv_layers.new(name="UVNum")
    mi = [i for i, m in enumerate(me.materials) if m == M["number"]]
    for p in me.polygons:
        if p.material_index not in mi:
            continue
        c = Vector(p.center)
        best = min(NUMBER_PATCHES, key=lambda pd: (pd[0] - c).length)
        centre, ua, va, size = best
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            d = co - centre
            uv.data[li].uv = (0.5 + d.dot(ua) / size, 0.5 + d.dot(va) / size)
    me.uv_layers["UVMap"].active_render = True
    me.uv_layers.active_index = 0


# ----------------------------------------------------------------------------- body (skin modifier)
def build_body(J, M):
    """Stick figure -> Skin modifier -> Subdivision; returns a plain mesh object of the body."""
    me = bpy.data.meshes.new("body_stick")
    H, S = J["hips"], J["shoulders"]
    t, hd = J["torsoDir"], J["headDir"]
    side = Vector((0, 1, 0))
    fwd = Vector((t.z, 0, -t.x))  # perpendicular to the torso in XZ, pointing forward
    verts = []
    edges = []
    radii = []

    def add(p, rx, ry=None):
        verts.append(Vector(p))
        radii.append((rx, rx if ry is None else ry))
        return len(verts) - 1

    def seg(a, b):
        edges.append((a, b))

    # torso column: crotch -> hips -> belly -> chest -> neck base -> neck top -> skull
    crotch = add(H - t * 0.13 + fwd * 0.01, 0.085, 0.055)
    hips = add(H, 0.16, 0.115)
    belly = add(H + t * 0.22, 0.155, 0.14)
    chest = add(H + t * 0.40 - fwd * 0.01, 0.225, 0.17)
    neckb = add(S + t * 0.01, 0.10, 0.085)
    neckt = add(S + hd * 0.11, 0.058, 0.058)
    skull = add(S + hd * 0.22, 0.085, 0.09)
    for a, b in ((crotch, hips), (hips, belly), (belly, chest), (chest, neckb), (neckb, neckt), (neckt, skull)):
        seg(a, b)
    for s, sg in (("L", -1), ("R", 1)):
        sh = add(J["shoulder." + s] - side * (sg * 0.015), 0.078, 0.07)
        ua = add(J["shoulder." + s].lerp(J["elbow." + s], 0.5), 0.07, 0.065)
        el = add(J["elbow." + s], 0.054, 0.05)
        fa = add(J["elbow." + s].lerp(J["wrist." + s], 0.55), 0.055, 0.051)
        wr = add(J["wrist." + s] - (J["wrist." + s] - J["elbow." + s]).normalized() * 0.04, 0.041, 0.039)
        for a, b in ((chest, sh), (sh, ua), (ua, el), (el, fa), (fa, wr)):
            seg(a, b)
        hp = add(J["hip." + s] - side * (sg * 0.005), 0.10, 0.095)
        th = add(J["hip." + s].lerp(J["knee." + s], 0.5), 0.095, 0.09)
        kn = add(J["knee." + s], 0.062, 0.06)
        sn = add(J["knee." + s].lerp(J["ankle." + s], 0.5), 0.056, 0.054)
        an = add(J["ankle." + s], 0.05, 0.05)
        for a, b in ((hips, hp), (hp, th), (th, kn), (kn, sn), (sn, an)):
            seg(a, b)
    me.from_pydata(verts, edges, [])
    me.update()
    ob = bpy.data.objects.new("body_stick", me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("Skin", "SKIN")
    mod.use_smooth_shade = True
    mod.branch_smoothing = 0.35
    sv = me.skin_vertices[0].data
    for i, (rx, ry) in enumerate(radii):
        sv[i].radius = (rx, ry)
        sv[i].use_root = i == hips
    sub = ob.modifiers.new("Sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    dec = ob.modifiers.new("Dec", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = BODY_DECIMATE
    dec.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    body_me = bpy.data.meshes.new_from_object(ev)
    body = bpy.data.objects.new("body", body_me)
    bpy.context.scene.collection.objects.link(body)
    bpy.data.objects.remove(ob)
    return body


# ----------------------------------------------------------------------------- gear (primitives)
def add(b, bm, M4, mat, group, sharp=None, smooth=True):
    b.add(bm, M4, mat, group=group, sharp_angle=sharp, smooth=smooth)
    bm.free()


def build_gear(J, M, b):
    """Helmet, goggles, collar, back hump, gloves, boots, knee braces, number patches."""
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
    R = L["headR"]
    # helmet shell (slightly egg shaped: longer front-back, flatter sides), chin bar, vents, peak, goggles
    add(b, prim_sphere(R * 1.08, seg=24, rings=14, scale=(1.08, 0.97, 1.02)), Mh @ Matrix.Translation((0.005, 0, 0.012)), M["helmet"], "head")
    add(b, prim_box(0.13, 0.17, 0.075, bevel=0.03, segments=3), Mh @ Matrix.Translation((0.075, 0, -0.075)) @ Matrix.Rotation(0.15, 4, "Y"), M["helmet"], "head")
    add(b, prim_box(0.035, 0.085, 0.03, bevel=0.008, segments=2), Mh @ Matrix.Translation((0.135, 0, -0.07)), M["armour"], "head", sharp=40)  # mouth vent
    add(b, prim_box(0.16, 0.20, 0.008, bevel=0.003, segments=1), Mh @ Matrix.Translation((0.10, 0, 0.085)) @ Matrix.Rotation(0.42, 4, "Y"), M["helmet"], "head", sharp=30)  # peak
    add(b, prim_box(0.05, 0.19, 0.075, bevel=0.025, segments=3), Mh @ Matrix.Translation((0.10, 0, 0.012)), M["armour"], "head")  # goggle frame
    add(b, prim_box(0.03, 0.17, 0.055, bevel=0.02, segments=3), Mh @ Matrix.Translation((0.118, 0, 0.012)), M["visor"], "head")  # lens
    add(b, prim_torus(R * 1.03, 0.012, seg=32, sides=6, scale_r=(1, 1)), Mh @ Matrix.Translation((0.0, 0, 0.012)) @ Matrix.Diagonal((1.08, 0.96, 1, 1)), M["armour"], "head")  # strap
    add(b, prim_box(0.05, 0.06, 0.022, bevel=0.006), Mh @ Matrix.Translation((-0.10, 0, 0.06)) @ Matrix.Rotation(-0.5, 4, "Y"), M["armour"], "head", sharp=40)  # rear vent
    # neck brace collar + back protector hump on the chest bone
    Mt = Matrix((
        (fwd_t.x, 0, t.x, S.x),
        (fwd_t.y, 1, t.y, S.y),
        (fwd_t.z, 0, t.z, S.z),
        (0, 0, 0, 1),
    ))
    add(b, prim_torus(0.10, 0.024, seg=28, sides=8, scale_r=(1.1, 1)), Mt @ Matrix.Translation((-0.03, 0, -0.02)) @ Matrix.Diagonal((1.1, 1.3, 1, 1)), M["armour"], "chest")
    add(b, prim_torus(0.068, 0.012, seg=20, sides=6), Mt @ Matrix.Translation((0.0, 0, 0.012)), M["pants"], "chest")
    add(b, prim_sphere(0.085, seg=16, rings=10, scale=(0.6, 1.2, 1.4)), Mt @ Matrix.Translation((-0.115, 0, -0.16)), M["jersey"], lambda co: {"chest": 1.0})
    # number patch on the back (a decal quad floating 4 mm off the hump) and a small one on the chest
    add(b, prim_box(0.004, 0.20, 0.20, bevel=0.0, segments=1), Mt @ Matrix.Translation((-0.165, 0, -0.14)), M["number"], "chest", smooth=False)
    NUMBER_PATCHES.append((Mt @ Vector((-0.165, 0, -0.14)), Vector((0, -1, 0)), t, 0.20))
    add(b, prim_box(0.004, 0.13, 0.13, bevel=0.0, segments=1), Mt @ Matrix.Translation((0.128, 0, -0.16)) @ Matrix.Rotation(-0.15, 4, "Y"), M["number"], "chest", smooth=False)
    NUMBER_PATCHES.append((Mt @ Vector((0.128, 0, -0.16)), Vector((0, 1, 0)), t, 0.13))
    # shoulder caps (jersey) so the deltoid reads
    for s, sg in (("L", -1), ("R", 1)):
        sh = J["shoulder." + s]
        add(b, prim_sphere(0.07, seg=14, rings=8, scale=(1, 0.9, 1)), Matrix.Translation(sh + V(0, -sg * 0.01, 0.005)), M["jersey"], {"upperArm." + s: 0.6, "chest": 0.4})
        # -- glove: fist around the grip (bar axis = y): 4 finger rings + palm + thumb + cuff
        wr = J["wrist." + s]
        fd = (wr - J["elbow." + s]).normalized()
        Mw = Matrix.Translation(wr)
        for i in range(4):
            add(b, prim_torus(0.026, 0.013, seg=14, sides=7), Mw @ Matrix.Translation((0, (i - 1.5) * 0.021, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"), M["gloves"], "hand." + s)
        add(b, prim_box(0.06, 0.09, 0.055, bevel=0.018, segments=2), Matrix.Translation(wr - fd * 0.035), M["gloves"], "hand." + s)
        add(b, prim_cylinder(0.012, 0.012, 0.03, seg=8), Mw @ Matrix.Translation((0.02, -sg * 0.05, -0.005)) @ Matrix.Rotation(math.pi / 2, 4, "X"), M["gloves"], "hand." + s)
        add(b, prim_cylinder(0.037, 0.041, 0.07, seg=12), Matrix.Translation(wr - fd * 0.10) @ C.rot_frame(fd), M["gloves"], {"forearm." + s: 0.7, "hand." + s: 0.3})
        add(b, prim_torus(0.041, 0.005, seg=14, sides=5), Matrix.Translation(wr - fd * 0.09) @ C.rot_frame(fd), M["armour"], {"forearm." + s: 0.7, "hand." + s: 0.3})
        # -- boot: shaft up the shin, foot block on the peg, toe, sole, heel cup, 3 buckles + shin plate
        an, kn = J["ankle." + s], J["knee." + s]
        sd = (kn - an).normalized()
        shaft_len = 0.30
        add(b, prim_lathe([(0.0, -0.01), (0.058, 0.0), (0.056, 0.12), (0.054, 0.24), (0.06, shaft_len), (0.0, shaft_len + 0.01)], seg=14), Matrix.Translation(an) @ C.rot_frame(sd), M["boots"], lambda co, an=an, sd=sd, s=s: {"shin." + s: 1.0} if (co - an).dot(sd) > 0.05 else {"shin." + s: 0.6, "foot." + s: 0.4})
        Mf = Matrix.Translation(an)
        add(b, prim_box(0.25, 0.105, 0.085, bevel=0.03, segments=3), Mf @ Matrix.Translation((0.055, 0, -0.048)), M["boots"], "foot." + s)
        add(b, prim_box(0.09, 0.10, 0.06, bevel=0.028, segments=3), Mf @ Matrix.Translation((0.155, 0, -0.06)), M["boots"], "foot." + s)
        add(b, prim_box(0.29, 0.11, 0.02, bevel=0.006), Mf @ Matrix.Translation((0.06, 0, -0.088)), M["sole"], "foot." + s, sharp=40)
        add(b, prim_box(0.06, 0.11, 0.09, bevel=0.02), Mf @ Matrix.Translation((-0.055, 0, -0.04)), M["armour"], "foot." + s)
        for by in (0.10, 0.18, 0.26):
            add(b, prim_box(0.03, 0.12, 0.03, bevel=0.006), Matrix.Translation(an + sd * by) @ C.rot_frame(sd) @ Matrix.Translation((0.056, 0, 0)), M["alloy"], "shin." + s, sharp=40)
        add(b, prim_box(0.03, 0.09, 0.26, bevel=0.012, segments=2), Matrix.Translation(an + sd * 0.17) @ C.rot_frame(sd) @ Matrix.Translation((0.05, 0, 0)), M["boots"], "shin." + s)
        # -- knee brace: cup over the knee + hinge plates, on the knee (thigh/shin blend)
        td = (kn - J["hip." + s]).normalized()
        knee_fwd = Vector((td.z, 0, -td.x))
        add(b, prim_sphere(0.062, seg=14, rings=8, scale=(0.9, 1.0, 1.1)), Matrix.Translation(kn + knee_fwd * 0.025 - td * 0.02), M["armour"], {"thigh." + s: 0.5, "shin." + s: 0.5})
        add(b, prim_box(0.085, 0.09, 0.16, bevel=0.03, segments=3), Matrix.Translation(kn + knee_fwd * 0.03) @ C.rot_frame(sd), M["armour"], {"thigh." + s: 0.5, "shin." + s: 0.5})
        for hs in (-1, 1):
            add(b, prim_cylinder(0.022, 0.022, 0.010, seg=12), Matrix.Translation(kn + V(0, hs * 0.058, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"), M["alloy"], {"thigh." + s: 0.5, "shin." + s: 0.5}, sharp=40)
        # -- hip pads / belt on the pelvis


# ----------------------------------------------------------------------------- weights
def envelope_weights(body, B, rigid_names=()):
    """Bone-envelope weights: influence = 1 / (d / r)^4 over the bone segment, normalised, top 4."""
    me = body.data
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    P = co.reshape(n, 3)
    names = list(B.keys())
    radii = dict(pelvis=0.14, spine=0.14, chest=0.16, neck=0.07, head=0.11)
    for s in ("L", "R"):
        radii.update({f"shoulder.{s}": 0.06, f"upperArm.{s}": 0.055, f"forearm.{s}": 0.045, f"hand.{s}": 0.04, f"thigh.{s}": 0.085, f"shin.{s}": 0.06, f"foot.{s}": 0.05})
    infl = np.zeros((n, len(names)))
    for j, name in enumerate(names):
        h, t, _ = B[name]
        h = np.array(h)
        t = np.array(t)
        d = t - h
        L2 = float(d.dot(d))
        u = np.clip(((P - h) @ d) / L2, 0.0, 1.0)
        # bones with a small joint radius keep influence to their span; the torso column is
        # allowed to reach a little past its ends to fill the hips/shoulders
        closest = h + u[:, None] * d
        dist = np.linalg.norm(P - closest, axis=1)
        r = radii[name]
        infl[:, j] = 1.0 / (1e-6 + (dist / r) ** 4)
    # normalise, keep 4 strongest, drop < 2 %
    idx = np.argsort(-infl, axis=1)[:, :4]
    w = np.take_along_axis(infl, idx, axis=1)
    w = w / w.sum(axis=1, keepdims=True)
    w[w < 0.02] = 0
    w = w / w.sum(axis=1, keepdims=True)
    groups = {name: body.vertex_groups.new(name=name) for name in names}
    for i in range(n):
        for k in range(4):
            if w[i, k] > 0:
                groups[names[idx[i, k]]].add([i], float(w[i, k]), "REPLACE")


def material_by_bone(body, M):
    """Body skin faces: jersey above the belt, pants on pelvis/legs, gloves at the wrists, balaclava on the neck."""
    me = body.data
    me.materials.clear()
    mats = [M["bodycloth"], M["bodycloth"], M["gloves"], M["skin"], M["boots"]]
    for m in mats:
        me.materials.append(m)
    names = {g.index: g.name for g in body.vertex_groups}
    dom = []
    for v in me.vertices:
        best, bw = None, -1
        for g in v.groups:
            if g.weight > bw:
                bw, best = g.weight, names[g.group]
        dom.append(best or "pelvis")
    H, t = REST["hips"], REST["torsoDir"]
    for p in me.polygons:
        bones = [dom[i] for i in p.vertices]
        b = max(set(bones), key=bones.count)
        base = b.split(".")[0]
        u = (Vector(p.center) - H).dot(t)
        if base == "thigh" or (base in ("pelvis", "spine") and u < 0.06):
            mi = 1
        elif base == "shin":
            mi = 4
        elif base == "hand":
            mi = 2
        elif base in ("neck", "head"):
            mi = 3
        else:
            mi = 0
        p.material_index = mi


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
    C.reset_scene()
    M = make_materials()
    J = REST
    BONES = define_bones(J)
    arm = build_armature(BONES)
    body = build_body(J, M)
    envelope_weights(body, BONES)
    material_by_bone(body, M)
    gb = MeshBuilder("gear")
    build_gear(J, M, gb)
    gear = gb.build()
    log("body tris", C.tri_count(body), "gear tris", C.tri_count(gear))
    for p in gear.data.polygons:
        p.use_smooth = True
    # join gear into the body (vertex groups merge by name)
    C.select_only([body, gear])
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "rider"
    body.data.name = "rider"
    # clean: merge doubles inside the skin body only would change gear; leave as is.
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    body.parent = arm
    bpy.context.view_layer.update()
    tris = C.tri_count(body)
    log("rider tris", tris, "verts", len(body.data.vertices))

    write_chain_md(os.path.join(C.HERE, "RIDER_CHAIN.md"))
    C.unwrap_all([body], angle=66, margin=0.002)
    apply_number_uvs(body, M)
    if not NO_BAKE:
        paths = C.bake_atlas([body], SIZE, C.BAKE_DIR, "rider", jpeg_quality=88, normal_size=SIZE, orm_size=SIZE)
        atlas = C.atlas_material("rider_atlas", paths)
        C.assign_atlas([body], atlas)
    actions = build_actions(arm)
    log("actions", list(actions))
    # rest pose for the file
    bpy.context.scene.frame_set(1)
    blend_path = os.path.join(C.HERE, "rider.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    out = os.path.join(C.MODELS, "rider.glb")
    size = C.export_glb(out, [arm, body], animations=True, meshopt=MESHOPT)
    info = C.gltf_summary(out)
    log("glb", info)
    with open(os.path.join(C.HERE, "rider.stats.txt"), "w") as f:
        f.write(f"tris={tris}\nglb_bytes={size}\n")
        f.write("bones (rest head -> tail, rear-axle frame, Blender x,y,z):\n")
        for n in BONE_ORDER:
            h, t, p = BONES[n]
            f.write(f"  {n:12s} parent={p or '-':12s} head=({h.x:.3f},{h.y:.3f},{h.z:.3f}) tail=({t.x:.3f},{t.y:.3f},{t.z:.3f}) len={(t - h).length:.3f}\n")
        f.write(f"gltf={info}\n")


if __name__ == "__main__":
    main()
