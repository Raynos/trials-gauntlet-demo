"""Protected rider authoring source and derived exports (run inside Blender).

  blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- seed --outfit street
  blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street
  blender -b --python-exit-code 1 --python assets/blender/rider_asset.py -- export --outfit street --lod

seed creates source/rider-{street,race}.blend with unbaked materials and editable parts.
export reads that source; it never regenerates or saves over it. Outputs are staged,
decoded and checked before publication. Street is the default outfit.
"""
import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

HERE = Path(__file__).resolve().parent
SCHEMA = "trials.rider.authoring.v1"
BONES = {"pelvis", "spine", "chest", "neck", "head"} | {
    f"{bone}.{side}" for side in ("L", "R")
    for bone in ("shoulder", "upperArm", "forearm", "hand", "thigh", "shin", "foot")
}
CLIPS = {"stand_attack", "hang_back", "forward_attack", "crouch", "extend", "land_absorb", "idle_breathe", "sit_cruise"}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def clear_pose(arm):
    if arm.animation_data:
        arm.animation_data.action = None
        for track in arm.animation_data.nla_tracks:
            track.mute = True
    arm.data.pose_position = "POSE"
    for bone in arm.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def check_source(arm, meshes):
    if set(arm.data.bones.keys()) != BONES:
        raise RuntimeError("The current runtime needs its 19 named core bones; migrate the rig contract explicitly.")
    if not meshes:
        raise RuntimeError("No weighted rider meshes in source.")
    actions = {strip.action.name for track in arm.animation_data.nla_tracks for strip in track.strips if strip.action} if arm.animation_data else set()
    if actions != CLIPS:
        raise RuntimeError(f"The source must retain the eight runtime actions; found {sorted(actions)}.")
    for ob in meshes:
        if ob.data.shape_keys:
            raise RuntimeError("Corrective shape keys require a morph-enabled export/runtime migration first.")
        armatures = [modifier for modifier in ob.modifiers if modifier.type == "ARMATURE"]
        if len(armatures) != 1 or armatures[0].object != arm:
            raise RuntimeError(f"{ob.name} must use exactly the rider_rig armature.")
        for modifier in ob.modifiers:
            if modifier.type == "ARMATURE" and modifier.use_deform_preserve_volume:
                raise RuntimeError("Preserve Volume is not reproduced by the current glTF linear-skinning path.")
            if modifier.type != "ARMATURE":
                raise RuntimeError(f"Apply or explicitly support source modifier {ob.name}/{modifier.name} before exporting.")
        for vertex in ob.data.vertices:
            weights = [g.weight for g in vertex.groups if ob.vertex_groups[g.group].name in BONES and g.weight != 0]
            if not weights or any(not math.isfinite(w) or w < 0 for w in weights) or abs(sum(weights) - 1) > 1e-5 or len(weights) > 4:
                raise RuntimeError(f"Invalid skin weights: {ob.name} vertex {vertex.index}.")


def normalize_skin_weights(body):
    """Collapse interpolates group weights; keep four influences and renormalize the derived mesh."""
    for vertex in body.data.vertices:
        groups = [(g.group, g.weight) for g in vertex.groups if body.vertex_groups[g.group].name in BONES]
        if any(not math.isfinite(w) or w < 0 for _, w in groups):
            raise RuntimeError(f"Invalid decimated weights at vertex {vertex.index}.")
        keep = sorted(((g, w) for g, w in groups if w > 0), key=lambda item: (-item[1], item[0]))[:4]
        total = sum(w for _, w in keep)
        if total <= 0:
            raise RuntimeError(f"Decimation left vertex {vertex.index} without skin weights.")
        for group, _ in groups:
            body.vertex_groups[group].remove([vertex.index])
        for group, weight in keep:
            body.vertex_groups[group].add([vertex.index], weight / total, "REPLACE")


def seed(args):
    source = args.source.resolve()
    if source.exists() and not args.replace_source:
        raise RuntimeError(f"Refusing to replace authored source: {source}. Use --replace-source only intentionally.")
    import build_rider as R

    R.configure_outfit(args.outfit)
    C.reset_scene()
    import decals
    materials = R.make_materials(decals.ensure_sheet())
    R.BONES = R.define_bones(R.REST)
    arm = R.build_armature(R.BONES)
    builder = C.MeshBuilder("rider")
    R.build_body(R.REST, materials, builder)
    R.build_gear(R.REST, materials, builder)
    body = builder.build()
    for face in body.data.polygons:
        face.use_smooth = True
    body.parent = arm
    modifier = body.modifiers.new("Armature", "ARMATURE")
    modifier.object = arm
    C.apply_colourway(R.COLOURWAYS["rookie"])
    R.build_actions(arm)
    clear_pose(arm)
    # Keep material regions as editable source parts; export rejoins them into one skinned draw.
    C.select_only([body])
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    for ob in meshes:
        if ob.data.polygons:
            material = ob.data.materials[ob.data.polygons[0].material_index]
            ob.name = "rider:" + material.name
            ob["heroPart"] = material.name
    check_source(arm, meshes)
    scene = bpy.context.scene
    scene["heroSourceSchema"] = SCHEMA
    scene["heroOutfit"] = args.outfit
    scene["heroColourways"] = json.dumps(R.COLOURWAYS)
    scene["heroSourceNote"] = "Authoritative editable source. Export a copy; do not regenerate this file."
    arm.show_in_front = True
    arm.data.display_type = "STICK"
    source.parent.mkdir(parents=True, exist_ok=True)
    # Keep decal images with the authored material graphs when the source is moved or archived.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    C.log("created protected source", source, digest(source))


def export(args):
    source = args.source.resolve()
    source_hash = digest(source)
    stem = f"rider-{args.outfit}" + ("-lod" if args.lod else "")
    generated = args.generated.resolve() / f"{stem}.blend"
    glb = args.models.resolve() / f"{stem}.glb"
    if source in (generated.resolve(), glb.resolve()):
        raise RuntimeError("An export destination cannot be the authoring source.")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    if scene.get("heroSourceSchema") != SCHEMA:
        raise RuntimeError("Not a protected rider authoring source; use seed to create one.")
    ao = C.local_ao_settings(scene)
    if scene.get("heroOutfit") != args.outfit:
        raise RuntimeError(f"Source outfit {scene.get('heroOutfit')!r} does not match --outfit {args.outfit}.")
    arm = bpy.data.objects.get("rider_rig")
    if not arm or arm.type != "ARMATURE":
        raise RuntimeError("Missing rider_rig armature.")
    meshes = [ob for ob in scene.objects if ob.type == "MESH" and any(m.type == "ARMATURE" and m.object == arm for m in ob.modifiers)]
    omitted = [ob.name for ob in scene.objects if ob.type == "MESH" and ob not in meshes]
    if omitted:
        raise RuntimeError(f"Unweighted source meshes would be omitted: {omitted}.")
    check_source(arm, meshes)
    clear_pose(arm)
    C.select_only(meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = body.data.name = "rider"
    if args.lod:
        C.decimate_to(body, 6000)
        normalize_skin_weights(body)
    check_source(arm, [body])
    C.unwrap_all([body], angle=66, margin=0.003 if args.lod else 0.002)
    colourways = json.loads(scene["heroColourways"])
    C.apply_colourway(colourways["rookie"])
    size = args.size or (512 if args.lod else 1024)
    generated.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".rider-export-", dir=generated.parent) as directory:
        staging = Path(directory)
        staged_textures = staging / "textures"
        staged_textures.mkdir()
        staged_glb = staging / glb.name
        staged_blend = staging / generated.name
        try:
            paths = C.bake_atlas(
                [body], size, str(staged_textures), stem,
                jpeg_quality=90, normal_size=size // 2, orm_size=size // 2,
                variants=[(name, lambda name=name: C.apply_colourway(colourways[name])) for name in ("rookie", "pro")],
                **{'ao_' + key: value for key, value in ao.items()},
            )
            materials = {name: C.atlas_material(f"rider_{name}", paths, albedo=f"albedo:{name}") for name in ("rookie", "pro")}
            C.assign_atlas([body], materials["rookie"])
            C.setup_variants([body], [(f"rider_{name}", {"rider": materials[name]}) for name in ("rookie", "pro")])
            clear_pose(arm)
            bpy.ops.file.pack_all()
            bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend), compress=True, copy=True)
            # Empty sockets are retained as authored metadata; unsupported deform bones are rejected above.
            sockets = [ob for ob in scene.objects if ob.type == "EMPTY"]
            C.export_glb(str(staged_glb), [arm, body, *sockets], animations=True, meshopt=True)
            verified = subprocess.run(
                [args.node, str(HERE / "verify_rider_asset.mjs"), str(staged_glb), *(["--lod"] if args.lod else [])],
                cwd=C.ROOT, check=True, capture_output=True, text=True,
            )
            try:
                source_label = source.relative_to(Path(C.ROOT)).as_posix()
            except ValueError:
                source_label = source.name
            report = {"source": source_label, "sourceSha256": source_hash, "exportSha256": digest(staged_glb), "outfit": args.outfit, "lod": args.lod, "localAO": ao, "verified": json.loads(verified.stdout)}
            staged_report = staging / glb.with_suffix(".source.json").name
            staged_report.write_text(json.dumps(report, indent=2) + "\n")
            if digest(source) != source_hash:
                raise RuntimeError("Authoring source changed during export.")
            outputs = [(p, args.textures.resolve() / p.name) for p in staged_textures.iterdir()]
            outputs.extend([(staged_blend, generated), (staged_glb, glb), (staged_report, glb.with_suffix(".source.json"))])
            publish(outputs, source)
        except subprocess.CalledProcessError as error:
            raise RuntimeError(f"Export validation failed before publication:\n{error.stdout}\n{error.stderr}") from error
        finally:
            if digest(source) != source_hash:
                raise RuntimeError("Authoring source changed during export.")
    C.log("exported derived asset; source unchanged", report)


def publish(outputs, source):
    """Prepare sibling files first, then atomically replace each verified output; preserve the master."""
    if any(destination.resolve() == source for _, destination in outputs):
        raise RuntimeError("An export destination cannot be the authoring source.")
    prepared = []
    try:
        for staged, destination in outputs:
            destination.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
            os.close(fd)
            prepared.append((Path(temporary), destination))
            shutil.copyfile(staged, temporary)
        for temporary, destination in prepared:
            os.replace(temporary, destination)
    finally:
        for temporary, _ in prepared:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "export"))
    parser.add_argument("--outfit", choices=("street", "race", "openface"), default="street")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--replace-source", action="store_true")
    parser.add_argument("--lod", action="store_true")
    parser.add_argument("--size", type=int)
    parser.add_argument("--models", type=Path, default=Path(C.MODELS).parent.parent/"harness"/"out"/"blender"/"base-body"/"models", help="base-body exports are not shipped; default is an ignored scratch dir (the runtime family is hero_art_build.mjs)")
    parser.add_argument("--textures", type=Path, default=Path(C.BAKE_DIR))
    parser.add_argument("--generated", type=Path, default=HERE / "generated")
    parser.add_argument("--node", default="node", help="Node.js executable for actual meshopt GLB verification")
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(arguments)
    args.source = args.source or HERE / "source" / f"rider-{args.outfit}.blend"
    if args.action == "seed" and args.outfit == "openface":
        parser.error("Openface is authored with openface_candidate.py; export its packed source.")
    if args.action == "seed" and args.lod:
        parser.error("The source is full detail; LOD is derived by export.")
    if args.size is not None and args.size not in (256, 512, 1024, 2048):
        parser.error("Atlas size must be 256, 512, 1024 or 2048.")
    (seed if args.action == "seed" else export)(args)


if __name__ == "__main__":
    main()
