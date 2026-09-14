"""Preview renders of the EXPORTED glTF files (what the render will actually load).

blender -b --python assets/blender/preview.py -- [bike|rider|composite|all] [--size 900] [--quick]

Writes assets/blender/previews/*.png:
  bike-turntable.png       4 views (side/camera angle, front 3/4, rear 3/4, top)
  rider-turntable.png      4 views of the rest pose
  rider-poses.png          the 6 hero poses (one frame of each action)
  composite.png            rider on bike, reference camera (yaw 20 deg, pitch 15 deg down),
                           at the 25 % and 40 % frame-height sizes the game uses
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

import common as C  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
WHAT = ARGS[0] if ARGS and not ARGS[0].startswith("--") else "all"
SIZE = int(ARGS[ARGS.index("--size") + 1]) if "--size" in ARGS else 900
QUICK = "--quick" in ARGS

# render frame (glTF) -> Blender: x -> x, y -> z, z -> -y


def setup_world():
    sc = C.reset_scene()
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = 8 if QUICK else 32
    sc.eevee.use_shadows = True
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    w = bpy.data.worlds.new("W")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.62, 0.75, 1)
    bg.inputs[1].default_value = 0.6
    # sun key + fill
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.0
    sun.angle = math.radians(3)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = Euler((math.radians(50), math.radians(-15), math.radians(-35)))
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 1.2
    fill.angle = math.radians(20)
    fo = bpy.data.objects.new("fill", fill)
    sc.collection.objects.link(fo)
    fo.rotation_euler = Euler((math.radians(60), math.radians(20), math.radians(150)))
    # ground: dark dirt plane at wheel-contact height (y = -0.34 in render frame -> z = -0.34)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0.65, 0, -0.34))
    g = bpy.context.active_object
    g.name = "ground"
    gm = C.new_mat("ground", (0.20, 0.15, 0.11, 1), rough=0.95)
    g.data.materials.append(gm)
    return sc


def import_glb(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    grp = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(grp)
    for r in roots:
        r.parent = grp
    return grp, new


def camera_at(target, yaw_deg, pitch_deg, dist, fov_deg=35):
    """Camera looking at `target` (Blender coords) from yaw (about +Z, 0 = from -Y = the game's +z
    side) and pitch (down)."""
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.lens_unit = "FOV"
    cam.angle = math.radians(fov_deg)
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    co.location = Vector(target) + d * dist
    co.rotation_euler = (Vector(target) - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = co
    return co


def render(path, w, h):
    sc = bpy.context.scene
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    C.log("rendered", path)


def montage(paths, out, cols):
    import subprocess

    rows = (len(paths) + cols - 1) // cols
    subprocess.run(["/opt/homebrew/bin/magick", "montage", *paths, "-tile", f"{cols}x{rows}", "-geometry", "+2+2", "-background", "#222", out], check=True)
    C.log("montage", out)


def hide_all_but(objs, keep):
    for o in objs:
        o.hide_render = o not in keep


# ------------------------------------------------------------------------------ views
def views(target, dist, prefix, extra_rows=None):
    outs = []
    for (name, yaw, pitch) in [("side", 20, 15), ("front34", 60, 12), ("rear34", -50, 12), ("top", 20, 70)]:
        cam = camera_at(target, yaw, pitch, dist)
        p = os.path.join(C.PREVIEWS, f"_{prefix}-{name}.png")
        render(p, SIZE, SIZE)
        outs.append(p)
        bpy.data.objects.remove(cam)
    return outs


def preview_bike():
    setup_world()
    grp, objs = import_glb(os.path.join(C.MODELS, "bike.glb"), "bike_import")
    target = (0.65, 0, 0.30)
    outs = views(target, 2.6, "bike")
    montage(outs, os.path.join(C.PREVIEWS, "bike-turntable.png"), 2)


def find_armature(objs):
    for o in objs:
        if o.type == "ARMATURE":
            return o
    return None


def set_action(arm, name, frame):
    act = bpy.data.actions.get(name)
    if act is None:
        C.log("missing action", name, [a.name for a in bpy.data.actions])
        return
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    try:
        if act.slots:
            arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    bpy.context.scene.frame_set(frame)


def preview_rider():
    setup_world()
    grp, objs = import_glb(os.path.join(C.MODELS, "rider.glb"), "rider_import")
    arm = find_armature(objs)
    target = (0.55, 0, 0.75)
    outs = views(target, 3.2, "rider")
    montage(outs, os.path.join(C.PREVIEWS, "rider-turntable.png"), 2)
    if arm is None:
        return
    poses = [("stand_attack", 1), ("hang_back", 15), ("forward_attack", 15), ("crouch", 12), ("extend", 8), ("land_absorb", 10), ("idle_breathe", 60), ("sit_cruise", 15)]
    outs = []
    for name, fr in poses:
        set_action(arm, name, fr)
        cam = camera_at(target, 20, 15, 3.2)
        p = os.path.join(C.PREVIEWS, f"_pose-{name}.png")
        render(p, SIZE, SIZE)
        bpy.data.objects.remove(cam)
        import subprocess

        subprocess.run(["/opt/homebrew/bin/magick", p, "-gravity", "north", "-pointsize", "28", "-fill", "white", "-annotate", "+0+10", name, p], check=True)
        outs.append(p)
    montage(outs, os.path.join(C.PREVIEWS, "rider-poses.png"), 4)


def preview_composite():
    setup_world()
    import_glb(os.path.join(C.MODELS, "bike.glb"), "bike_import")
    grp, objs = import_glb(os.path.join(C.MODELS, "rider.glb"), "rider_import")
    arm = find_armature(objs)
    if arm:
        set_action(arm, "stand_attack", 1)
    target = (0.65, 0, 0.62)
    # full-frame hero
    cam = camera_at(target, 20, 15, 5.4)
    p_hero = os.path.join(C.PREVIEWS, "composite.png")
    render(p_hero, 1280, 720)
    bpy.data.objects.remove(cam)
    # game framing: bike ~ 11 % of frame width (rider+bike ~ 25 % height) and tight (~40 % height)
    outs = []
    for label, dist, tz in (("25pct", 18.0, 0.62), ("40pct", 11.3, 0.78)):
        cam = camera_at((target[0], 0, tz), 20, 15, dist)
        p = os.path.join(C.PREVIEWS, f"composite-{label}.png")
        render(p, 1280, 720)
        bpy.data.objects.remove(cam)
        outs.append(p)
    # side-by-side crop sheet like the hero crop grid: 400x300 crops around the bike
    import subprocess

    crops = []
    for p in outs:
        c = p.replace(".png", "-crop.png")
        subprocess.run(["/opt/homebrew/bin/magick", p, "-gravity", "center", "-crop", "400x260+0+0", "+repage", "-resize", "200%", c], check=True)
        crops.append(c)
    montage(crops, os.path.join(C.PREVIEWS, "composite-gamesize.png"), 2)


def preview_compare():
    """Our rider+bike next to two reference crops for the same poses (attack, hang-back)."""
    import subprocess

    ref = os.path.join(C.HERE, "..", "..", "reference")
    tmp = os.path.join(C.PREVIEWS, "_cmp")
    os.makedirs(tmp, exist_ok=True)
    # reference frames straight from the clips
    subprocess.run(["/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-ss", "3.4", "-i", os.path.join(ref, "rising-visuals/clips/02-canyon-multistart.mp4"), "-frames:v", "1", os.path.join(tmp, "ref-idle.png")], check=True)
    subprocess.run(["/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-ss", "5.0", "-i", os.path.join(ref, "techniques/clips/13-wheelie-countdown-launch.mp4"), "-frames:v", "1", os.path.join(tmp, "ref-wheelie.png")], check=True)
    subprocess.run(["/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-ss", "4.2", "-i", os.path.join(ref, "techniques/clips/13-wheelie-countdown-launch.mp4"), "-frames:v", "1", os.path.join(tmp, "ref-go.png")], check=True)
    subprocess.run(["/opt/homebrew/bin/magick", os.path.join(tmp, "ref-idle.png"), "-crop", "300x300+190+230", "+repage", "-resize", "500x500", os.path.join(tmp, "ref-attack.png")], check=True)
    subprocess.run(["/opt/homebrew/bin/magick", os.path.join(tmp, "ref-wheelie.png"), "-crop", "240x240+310+290", "+repage", "-resize", "500x500", os.path.join(tmp, "ref-hangback.png")], check=True)
    subprocess.run(["/opt/homebrew/bin/magick", os.path.join(tmp, "ref-go.png"), "-crop", "240x240+250+280", "+repage", "-resize", "500x500", os.path.join(tmp, "ref-forward.png")], check=True)
    setup_world()
    bike, bobjs = import_glb(os.path.join(C.MODELS, "bike.glb"), "bike_import")
    rider, robjs = import_glb(os.path.join(C.MODELS, "rider.glb"), "rider_import")
    arm = find_armature(robjs)
    shots = [
        ("attack", "stand_attack", 30, 0.0, 42, 16, 3.5, (0.55, 0, 0.70)),
        ("side", "stand_attack", 30, 0.0, 12, 10, 4.2, (0.55, 0, 0.60)),
        ("forward", "forward_attack", 30, 0.0, -35, 28, 4.4, (0.55, 0, 0.75)),
        ("hangback", "hang_back", 30, 38.0, -40, 25, 4.6, (0.45, 0, 0.85)),
    ]
    outs = []
    for label, action, frame, pitch_up, yaw, pitch, dist, target in shots:
        set_action(arm, action, frame)
        # pitch bike + rider nose-up about the rear axle (origin): rotate about Blender -Y
        for g in (bike, rider):
            g.rotation_euler = (0, -math.radians(pitch_up), 0)
        cam = camera_at(target, yaw, pitch, dist)
        p = os.path.join(tmp, f"ours-{label}.png")
        render(p, 500, 500)
        bpy.data.objects.remove(cam)
        outs.append(p)
    for g in (bike, rider):
        g.rotation_euler = (0, 0, 0)
    hero = os.path.join(os.path.dirname(C.HERE), "..", "..", "..", "..")  # unused
    hero_grid = "/private/tmp/claude-501/-Users-raynos-projects-game-demos-trials-gauntlet-demo/f8d5e168-4022-47f3-b796-362acd49ca35/scratchpad/render3/hero-crops-r6.jpg"
    side_ref = os.path.join(tmp, "ref-side.png")
    if os.path.exists(hero_grid):
        subprocess.run(["/opt/homebrew/bin/magick", hero_grid, "-crop", "440x440+20+440", "+repage", "-resize", "500x500", side_ref], check=True)
    else:
        subprocess.run(["/opt/homebrew/bin/magick", "-size", "500x500", "xc:#333", side_ref], check=True)
    tiles = [os.path.join(tmp, "ref-attack.png"), outs[0], side_ref, outs[1], os.path.join(tmp, "ref-forward.png"), outs[2], os.path.join(tmp, "ref-hangback.png"), outs[3]]
    labels = ["reference: start-gate attack", "ours: stand_attack", "reference: finish-line side", "ours: stand_attack side", "reference: GO hang-forward", "ours: forward_attack", "reference: wheelie hang-back", "ours: hang_back (bike +38 deg)"]
    for t, l in zip(tiles, labels):
        subprocess.run(["/opt/homebrew/bin/magick", t, "-gravity", "north", "-pointsize", "22", "-fill", "white", "-undercolor", "#00000080", "-annotate", "+0+6", l, t], check=True)
    montage(tiles, os.path.join(C.PREVIEWS, "compare-reference.png"), 2)


if __name__ == "__main__":
    os.makedirs(C.PREVIEWS, exist_ok=True)
    if WHAT in ("bike", "all"):
        preview_bike()
    if WHAT in ("rider", "all") and os.path.exists(os.path.join(C.MODELS, "rider.glb")):
        preview_rider()
    if WHAT in ("composite", "all") and os.path.exists(os.path.join(C.MODELS, "rider.glb")):
        preview_composite()
    if WHAT in ("compare", "all") and os.path.exists(os.path.join(C.MODELS, "rider.glb")):
        preview_compare()
