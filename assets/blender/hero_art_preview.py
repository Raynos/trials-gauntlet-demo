"""Eevee stills of exported hero-art GLBs (headless): a front 3/4 view plus a head close-up per file.

blender -b --python-exit-code 1 --python assets/blender/hero_art_preview.py -- --out DIR file.glb [file2.glb ...] [--size 768] [--frame 40]

Meshopt outputs are decoded first with assets/blender/unpack_meshopt.mjs into DIR (the 5.2 importer cannot
read the fallback-buffer layout). Riders are posed at --frame of `sit_cruise` so the skin is exercised.
"""
import argparse
import math
import os
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--size", type=int, default=768)
    p.add_argument("--frame", type=int, default=40)
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--turntable", type=int, default=0, help="also render N head-camera frames sweeping 360 deg")
    p.add_argument("--head-only", action="store_true")
    p.add_argument("files", nargs="+")
    return p.parse_args(argv)


def decoded_copy(src, out_dir):
    with open(src, "rb") as f:
        head = f.read(8192)
    if b"EXT_meshopt_compression" not in head[:8192] and b"EXT_meshopt" not in head:
        return src
    dst = Path(out_dir) / (Path(src).stem + ".decoded.glb")
    subprocess.run(["node", str(HERE / "unpack_meshopt.mjs"), str(src), str(dst)], check=True, capture_output=True, cwd=ROOT)
    return str(dst)


def setup_world(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16
    world = bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.58, 0.62, 1)
    bg.inputs[1].default_value = 1.0
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 3.0
    key.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))
    scene.collection.objects.link(key)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.rotation_euler = (math.radians(60), 0, math.radians(-140))
    scene.collection.objects.link(fill)


def bounds(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objects:
        if ob.type != "MESH":
            continue
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def render(scene, path, target, radius, azimuth_deg, elevation_deg, size):
    cam_data = bpy.data.cameras.get("cam") or bpy.data.cameras.new("cam")
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.lens = 60
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    offset = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))) * radius
    cam.location = target + offset
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


def main():
    a = args()
    os.makedirs(a.out, exist_ok=True)
    for file in a.files:
        C.reset_scene()
        scene = bpy.context.scene
        scene.render.fps = 30
        setup_world(scene)
        src = decoded_copy(file, a.out)
        bpy.ops.import_scene.gltf(filepath=src, bone_heuristic="BLENDER", disable_bone_shape=True, import_scene_as_collection=False)
        objects = [o for o in scene.objects]
        arms = [o for o in objects if o.type == "ARMATURE"]
        if arms:
            arm = arms[0]
            for track in arm.animation_data.nla_tracks:
                track.mute = track.name != "sit_cruise" and not any(s.action.name == "sit_cruise" for s in track.strips)
            scene.frame_set(a.frame)
        bpy.context.view_layer.update()
        lo, hi = bounds(objects)
        centre = (lo + hi) / 2
        extent = max(hi - lo)
        stem = Path(file).stem
        if not a.head_only:
            render(scene, str(Path(a.out) / f"{stem}.png"), centre, extent * 1.9, -35, 12, a.size)
        if arms:
            head = arm.matrix_world @ arm.pose.bones["head"].head
            render(scene, str(Path(a.out) / f"{stem}-head.png"), head + Vector((0, 0, 0.05)), 0.55, -40, 8, a.size)
            for i in range(a.turntable):
                render(scene, str(Path(a.out) / f"{stem}-tt-{i:02d}.png"), head + Vector((0, 0, 0.05)), 0.55, -40 + 360.0 * i / a.turntable, 8, a.size)
        else:
            render(scene, str(Path(a.out) / f"{stem}-rear.png"), centre, extent * 1.9, 145, 15, a.size)
        C.log(f"rendered {stem}")


main()
