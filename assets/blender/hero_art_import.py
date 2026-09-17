"""Astra's hero-garage art delivery -> game-budget GLBs (inside Blender).

blender -b --python-exit-code 1 --python assets/blender/hero_art_import.py -- \
    --input <decoded.glb> --output <out.glb> --kind rider|bike [--lod] [--tris N] [--tex N] \
    [--report <out.json>] [--drop NAME ...] [--stage 0]

The input is an UNCOMPRESSED glTF binary (decode EXT_meshopt_compression deliveries first with
prototypes/hero-garage/tools/unpack-art-lossless.mjs; the Blender importer cannot read them).
The driver is assets/blender/hero_art_build.mjs, which also verifies and writes the source.json.

Stage 0 (quick export): drop the strand groom + dead 0-triangle meshes, join meshes that share a
material list, collapse-decimate to the triangle budget, cap texture sizes, export Meshopt.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402
import hero_art_hair as H  # noqa: E402

GROOM_NAMES = {"Street01_Bystedt_CurlyGroom_Runtime"}
# The delivered bike keeps the game's 23 parts; these keep their exact topology (chain/hose are
# deformed by the runtime from vertex order; spokes/blur cards are coverage models).
BIKE_PROTECTED = {"chain", "brake_hose", "wheel_front_blur", "wheel_rear_blur", "wheel_front_spokes", "wheel_rear_spokes"}
RIDER_BONES = ["pelvis", "spine", "chest", "neck", "head"] + [f"{b}.{s}" for s in "LR" for b in
               ["shoulder", "upperArm", "forearm", "hand", "thigh", "shin", "foot"]]
RIDER_CLIPS = {"sit_cruise": 59, "forward_attack": 119, "hang_back": 119, "compression": 149, "extension": 149, "landing_absorption": 149}


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--kind", choices=["rider", "bike"], required=True)
    p.add_argument("--lod", action="store_true")
    p.add_argument("--tris", type=int, default=None, help="total triangle budget (default rider 45000/8000, bike 33500/6000)")
    p.add_argument("--tex", type=int, default=None, help="max colour texture size (default 1024, LOD 512)")
    p.add_argument("--tex-data", type=int, default=None, help="max normal/ORM texture size (default = --tex for riders, 512 for bikes)")
    p.add_argument("--min-tris", type=int, default=400, help="meshes at or below this are never decimated")
    p.add_argument("--report", default=None)
    p.add_argument("--drop", nargs="*", default=[], help="extra object names to delete")
    p.add_argument("--keep-groom", action="store_true")
    p.add_argument("--no-join", action="store_true")
    p.add_argument("--save-blend", default=None)
    p.add_argument("--stage", type=int, default=0)
    p.add_argument("--no-meshopt", action="store_true", help="export uncompressed (the driver packs with hero_art_pack.mjs)")
    p.add_argument("--hair-tris", type=int, default=None, help="stage>=1: hair shell budget (default 8000, LOD 1200)")
    p.add_argument("--atlas", type=int, default=None, help="stage>=1: body atlas size (default 2048, LOD 1024)")
    p.add_argument("--bake-dir", default=None, help="stage>=1: where baked atlas JPEGs are written (default: temp dir)")
    p.add_argument("--hair-bake", type=int, default=None, help="stage>=1: hair bake size (default 512, LOD 256)")
    p.add_argument("--hair-v1", action="store_true", help="the round-1 shell recipe (inflated, flat-shaded, full-strength normal)")
    p.add_argument("--ribbons", type=int, default=0, help="stage>=1 comparison: add silhouette ribbons with this triangle budget")
    return p.parse_args(argv)


def scene_objects():
    return list(bpy.context.scene.objects)


def delete_objects(obs):
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)


def meshes_of(kind):
    return [o for o in scene_objects() if o.type == "MESH"]


def image_role(img):
    """'color' for sRGB (base colour / emissive) images, 'data' for Non-Color (normal / ORM)."""
    return "color" if img.colorspace_settings.name in ("sRGB", "Filmic sRGB", "AgX") else "data"


SMALL_IMAGE = ("brown_eye", "full_beard", "moustache", "eyebrow", "chain_links", "spokecard")  # tiny on screen: cap at 512


def alpha_images():
    """Images whose Alpha output feeds a material (alpha-tested/blended): keep PNG."""
    used = set()
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.outputs["Alpha"].is_linked:
                used.add(n.image.name)
    return used


def cap_images(max_color, max_data, jpeg_color=True):
    report = []
    with_alpha = alpha_images()
    for img in bpy.data.images:
        if img.users == 0 or img.size[0] == 0:
            continue
        role = image_role(img)
        cap = max_color if role == "color" else max_data
        if img.name.startswith(("rider_body", "hair_shell", "hair_ribbon", "bike_atlas")):
            cap = max(img.size)  # baked at the intended size already
        if any(k in img.name.lower() for k in SMALL_IMAGE):
            cap = min(cap, 512)
        w, h = img.size
        nw, nh = w, h
        if max(w, h) > cap:
            s = cap / max(w, h)
            nw, nh = max(1, round(w * s)), max(1, round(h * s))
            img.scale(nw, nh)
        fmt = img.file_format
        if jpeg_color and role == "color" and img.name not in with_alpha and fmt != "JPEG" and max(nw, nh) > 256:
            # colour maps without alpha ship as JPEG q90 like the existing atlases; data/alpha maps stay PNG.
            # The exporter picks JPEG from the filepath extension and re-encodes only dirty images.
            if not img.is_dirty:
                px = img.pixels[0]
                img.pixels[0] = px
            img.file_format = "JPEG"
            img.filepath_raw = f"//{bpy.path.clean_name(img.name)}.jpg"
            fmt = "JPEG"
        report.append({"image": img.name, "role": role, "alpha": img.name in with_alpha, "from": [w, h], "to": [nw, nh], "format": fmt})
    return report


def material_uses_alpha(mat):
    if not mat or not mat.use_nodes:
        return False
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            alpha = n.inputs.get("Alpha")
            if alpha and (alpha.is_linked or alpha.default_value < 0.999):
                return True
    return False


def bind_texture_uvs(mats, uv_name):
    """Give every unlinked Image Texture an explicit UV Map node so a second (atlas) UV layer can be active."""
    for mat in mats:
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type == "TEX_IMAGE" and not n.inputs["Vector"].is_linked:
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = uv_name
                nt.links.new(uv.outputs["UV"], n.inputs["Vector"])
        for n in nt.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.name = "BSDF"
            elif n.type == "OUTPUT_MATERIAL" and n.is_active_output:
                n.name = "OUT"


def merge_opaque(meshes, arm, name="rider_body"):
    """Join every mesh whose materials are all opaque into one object (still multi-material until baked)."""
    opaque = [o for o in meshes if o.data.materials and all(not material_uses_alpha(m) for m in o.data.materials)]
    if len(opaque) < 2:
        return None, []
    opaque.sort(key=lambda o: -C.tri_count(o))
    target = opaque[0]
    names = [o.name for o in opaque]
    C.select_only(opaque)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target, names


def bake_body_atlas(body, size, out_dir, orm_size=None, ao=(0.025, 32, 0.8)):
    """One atlas material for the joined body: albedo / normal / ORM baked from the delivered materials."""
    import tempfile
    me = body.data
    if not me.uv_layers:
        raise RuntimeError("body has no UV layer to bake from")
    source_uv = me.uv_layers[0].name
    mats = [m for m in me.materials if m]
    bind_texture_uvs(mats, source_uv)
    atlas = me.uv_layers.new(name="atlas")
    me.uv_layers.active = atlas
    atlas.active_render = True
    C.unwrap_all([body], angle=66.0, margin=0.004)
    C.configure_local_ao(*ao)
    paths = C.bake_atlas([body], size, out_dir, "rider_body", jpeg_quality=90, normal_size=size, orm_size=orm_size or size // 2)
    mat = C.atlas_material("rider_body", paths)
    C.assign_atlas([body], mat)
    me.uv_layers.remove(me.uv_layers[source_uv])
    me.uv_layers[0].name = "UVMap"
    for img in bpy.data.images:
        if img.filepath_raw and os.path.dirname(os.path.abspath(bpy.path.abspath(img.filepath_raw))) == os.path.abspath(out_dir):
            img.pack()
    return paths


BIKE_KEEP_MATERIAL = {"chain", "brake_hose", "wheel_front_blur", "wheel_rear_blur"}  # runtime-deformed / scrolled / coverage cards


def bake_bike_atlas(meshes, size, out_dir, orm_size=None, ao=(0.025, 32, 0.8)):
    """Bake every part except the runtime-deformed ones into one atlas material: one draw per part."""
    parts = [o for o in meshes if o.name not in BIKE_KEEP_MATERIAL]
    mats = []
    for o in parts:
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    for o in parts:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        source_uv = o.data.uv_layers[0].name
        bind_texture_uvs([m for m in o.data.materials if m], source_uv)
        atlas = o.data.uv_layers.new(name="atlas")
        o.data.uv_layers.active = atlas
        atlas.active_render = True
    C.unwrap_all(parts, angle=66.0, margin=0.003)
    C.configure_local_ao(*ao)
    paths = C.bake_atlas(parts, size, out_dir, "bike_atlas", jpeg_quality=90, normal_size=size, orm_size=orm_size or size // 2)
    mat = C.atlas_material("bike_atlas", paths)
    C.assign_atlas(parts, mat)
    for o in parts:
        o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers[0].name = "UVMap"
    for img in bpy.data.images:
        if img.filepath_raw and os.path.dirname(os.path.abspath(bpy.path.abspath(img.filepath_raw))) == os.path.abspath(out_dir):
            img.pack()
    # textures now used only by the hose can be tiny
    kept = [o for o in meshes if o.name in BIKE_KEEP_MATERIAL]
    for o in kept:
        if o.name != "brake_hose":
            continue
        for m in o.data.materials:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and max(n.image.size) > 256:
                    n.image.scale(256, 256)
    return paths, [o.name for o in parts]


def join_by_material(meshes, exclude=()):
    """Join skinned meshes whose material lists match exactly; fewer nodes, same draws."""
    groups = {}
    for ob in meshes:
        if ob.name in exclude:
            continue
        key = tuple(m.name if m else "" for m in ob.data.materials)
        groups.setdefault(key, []).append(ob)
    joined = []
    for key, obs in groups.items():
        if len(obs) < 2:
            continue
        obs.sort(key=lambda o: -C.tri_count(o))
        target = obs[0]
        names = [x.name for x in obs[1:]]
        C.select_only(obs)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.join()
        joined.append({"into": target.name, "from": names, "materials": list(key)})
    return joined


HAND_FLOOR = 400  # LOD: fingers collapse into spikes below this; keep hand parts at >= 400 triangles each


def is_hand_part(ob):
    """True when most of a skinned part's weight sits on hand.L / hand.R (gloves, glove tops)."""
    groups = {g.index: g.name for g in ob.vertex_groups}
    hand = total = 0.0
    for v in ob.data.vertices:
        for g in v.groups:
            total += g.weight
            if groups.get(g.group, "").startswith("hand."):
                hand += g.weight
    return total > 0 and hand / total > 0.5


def allocate(meshes, budget, min_tris, protected=(), floors=None):
    """Per-mesh triangle targets: protected/small meshes keep their count, the rest share one collapse ratio
    with a per-part floor (`floors`: name -> minimum, e.g. hands at the LOD)."""
    floors = floors or {}
    counts = {ob.name: C.tri_count(ob) for ob in meshes}
    total = sum(counts.values())
    if total <= budget:
        return counts, total, 1.0
    floor = {n: max(min_tris, floors.get(n, 0)) for n in counts}
    fixed = {n: t for n, t in counts.items() if n in protected or t <= floor[n]}
    free = {n: t for n, t in counts.items() if n not in fixed}
    lo, hi = 0.02, 1.0
    for _ in range(60):
        r = (lo + hi) / 2
        got = sum(fixed.values()) + sum(max(floor[n], int(t * r)) for n, t in free.items())
        if got > budget:
            hi = r
        else:
            lo = r
    r = lo
    targets = dict(fixed)
    for n, t in free.items():
        targets[n] = max(floor[n], int(t * r))
    return targets, total, r


def weld(ob, dist=1e-5):
    """Merge coincident vertices (the delivery's panels are split along every seam, and collapse never
    removes boundary edges, so an unwelded shell bottoms out at ~5 % of its triangles)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.validate(verbose=False, clean_customdata=False)
    ob.data.update()
    return before, len(ob.data.vertices)


def decimate(ob, target, passes=4):
    """Collapse to at most `target` triangles; collapse undershoots on small/non-manifold parts, so iterate."""
    before = C.tri_count(ob)
    current = before
    if current > target:
        weld(ob)
    for _ in range(passes):
        if current <= target:
            break
        mod = ob.modifiers.new("LOD", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.01, target / current * 0.98)
        mod.use_collapse_triangulate = True
        C.select_only([ob])
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        ob.data.validate(verbose=False, clean_customdata=False)
        after = C.tri_count(ob)
        if after >= current * 0.99:
            break  # no progress: the part cannot collapse further
        current = after
    return before, current


def rider_checks():
    arms = [o for o in scene_objects() if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise RuntimeError(f"expected one armature, found {[a.name for a in arms]}")
    arm = arms[0]
    names = sorted(b.name for b in arm.data.bones)
    if names != sorted(RIDER_BONES):
        raise RuntimeError(f"bone set mismatch: {names}")
    tracks = [t for t in (arm.animation_data.nla_tracks if arm.animation_data else [])]
    actions = {}
    for t in tracks:
        for s in t.strips:
            actions[s.action.name] = s.action
    missing = set(RIDER_CLIPS) - set(actions)
    if missing:
        raise RuntimeError(f"missing clips after import: {missing} (have {list(actions)})")
    return arm, actions


def export(path, obs, animations, meshopt=True):
    extra = dict(
        export_image_format="AUTO",
        export_jpeg_quality=90,
        export_optimize_animation_size=False,
        export_hierarchy_flatten_objs=False,
        export_import_convert_lighting_mode="SPEC",
        export_original_specular=False,
        export_unused_images=False,
        export_unused_textures=False,
        export_gn_mesh=False,
    )
    if animations:
        extra.update(export_anim_slide_to_zero=False)  # clips already start at 0; keep the sampled range
    return C.export_glb(path, obs, animations=animations, meshopt=meshopt, extra=extra)


def main():
    a = args()
    C.reset_scene()
    scene = bpy.context.scene
    scene.render.fps = 30  # delivery clips are 30 fps samples: keep keys on integer frames
    scene.render.fps_base = 1.0
    scene.frame_start = 0
    bpy.ops.import_scene.gltf(filepath=a.input, bone_heuristic="BLENDER", import_shading="NORMALS",
                              disable_bone_shape=True, import_scene_as_collection=False,
                              guess_original_bind_pose=True, import_scene_extras=True, merge_vertices=False)
    report = {"input": a.input, "output": a.output, "kind": a.kind, "lod": a.lod, "stage": a.stage, "dropped": [], "joined": [],
              "decimated": [], "images": []}

    # 1. drop payload that must not ship (stage >= 1 first derives the hair shell from the groom)
    drop = []
    groom = None
    for ob in scene_objects():
        if ob.type == "MESH" and len(ob.data.polygons) == 0:
            drop.append(ob)  # the delivery keeps the retired prototype rider as a 0-triangle vertex cloud
        elif ob.name in GROOM_NAMES and ob.type == "MESH" and a.stage >= 1 and not a.keep_groom:
            groom = ob
        elif ob.name in a.drop or (not a.keep_groom and ob.name in GROOM_NAMES):
            drop.append(ob)
    report["dropped"] = [{"object": o.name, "mesh": o.data.name if o.data else None, "tris": C.tri_count(o) if o.type == "MESH" else 0} for o in drop]
    delete_objects(drop)
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    for ob in scene_objects():
        if ob.type == "MESH" and ob.hide_render:
            ob.hide_render = False
        ob.hide_set(False)
        ob.hide_viewport = False

    if a.kind == "rider":
        arm, actions = rider_checks()
        # KHR_materials_variants in the delivery only mapped the dead prototype mesh (bike_rookie/bike_pro); clear.
        if hasattr(scene, "gltf2_KHR_materials_variants_variants"):
            scene.gltf2_KHR_materials_variants_variants.clear()
            for me in bpy.data.meshes:
                me.gltf2_variant_mesh_data.clear()
        report["bones"] = len(arm.data.bones)
        report["clips"] = {n: {"frames": int(act.frame_range[1] - act.frame_range[0]), "start": act.frame_range[0], "end": act.frame_range[1]} for n, act in actions.items()}
        for name, act in actions.items():
            frames = act.frame_range[1] - act.frame_range[0]
            if abs(frames - RIDER_CLIPS[name]) > 0.01:
                raise RuntimeError(f"clip {name} spans {frames} frames, expected {RIDER_CLIPS[name]}")
        protected = ()
        budget = a.tris or (8000 if a.lod else 45000)
        if groom is not None:
            if scene.world is None:
                scene.world = bpy.data.worlds.new("bake")
            hair_budget = a.hair_tris or (1200 if a.lod else 8000)
            scalp = next((o for o in scene_objects() if o.type == "MESH" and o.name.startswith("Street01_Authored_EditableBody")), None)
            shell, report["hair"] = H.build_hair(groom, arm, budget=hair_budget, bake_size=a.hair_bake or (256 if a.lod else 512),
                                                 version=1 if a.hair_v1 else 2, scalp=scalp)
            report["dropped"].append({"object": groom.name, "mesh": groom.data.name, "tris": C.tri_count(groom), "replacedBy": shell.name})
            protected = (shell.name,)
            if a.ribbons > 0:
                alpha_like = next((m for m in bpy.data.materials if "eyebrow" in m.name), None)
                ribbons, report["ribbons"] = H.build_ribbons(groom, arm, shell, budget=a.ribbons, alpha_like=alpha_like)
                protected = (shell.name, ribbons.name)
            delete_objects([groom])
            for me in [m for m in bpy.data.meshes if m.users == 0]:
                bpy.data.meshes.remove(me)
    else:
        protected = BIKE_PROTECTED
        budget = a.tris or (6000 if a.lod else 33500)
        for ob in scene_objects():
            if ob.type == "MESH" and ob.modifiers:
                raise RuntimeError(f"unexpected modifiers on {ob.name}")

    # 2. join same-material meshes (draws unchanged, nodes fewer) before decimation so budgets are per part;
    #    stage >= 1 joins every opaque part into one body that is atlas-baked to a single draw after decimation
    meshes = meshes_of(a.kind)
    body = None
    if not a.no_join and a.kind == "rider" and a.stage == 0:
        report["joined"] = join_by_material(meshes)
        meshes = meshes_of(a.kind)

    # 3. decimate to budget (per part; hands keep a floor at the LOD so fingers survive)
    floors = {}
    if a.kind == "rider" and a.lod:
        floors = {ob.name: HAND_FLOOR for ob in meshes if ob.name not in protected and is_hand_part(ob)}
        report["handFloors"] = floors
    targets, total_before, ratio = allocate(meshes, budget, a.min_tris, protected, floors)
    for ob in meshes:
        before, after = decimate(ob, targets[ob.name])
        report["decimated"].append({"object": ob.name, "before": before, "after": after})
    total_after = sum(C.tri_count(o) for o in meshes)
    if total_after > budget:
        # parts that could not collapse to their share: take the remainder from the largest parts
        over = total_after - budget
        big = sorted(meshes, key=lambda o: -C.tri_count(o))
        for ob in big:
            if over <= 0 or ob.name in protected:
                break
            t = C.tri_count(ob)
            cut = min(over, max(0, t - max(a.min_tris, int(t * 0.5))))
            if cut <= 0:
                continue
            _, after = decimate(ob, t - cut)
            over -= t - after
            for row in report["decimated"]:
                if row["object"] == ob.name:
                    row["after"] = after
        total_after = sum(C.tri_count(o) for o in meshes)
    report["triangles"] = {"budget": budget, "before": total_before, "after": total_after, "ratio": ratio}
    if total_after > budget:
        C.log("per-part results:", [(row["object"], row["before"], row["after"]) for row in report["decimated"]])
        raise RuntimeError(f"over budget after decimation: {total_after} > {budget}")

    # 3b. stage >= 1: join every opaque part (already at budget) and bake its materials into one atlas (one
    #     draw); a single-material body (the race riders) is already one draw and keeps its delivered textures
    if not a.no_join and a.kind == "rider" and a.stage >= 1:
        body, merged = merge_opaque([m for m in meshes if m.name != (protected[0] if protected else None)], arm)
        report["joined"] = [{"into": body.name, "from": merged, "materials": "opaque set -> rider_body atlas"}] if body else []
        meshes = meshes_of(a.kind)
    if body is not None and len([m for m in body.data.materials if m]) > 1:
        import tempfile
        bake_dir = a.bake_dir or tempfile.mkdtemp(prefix="hero-art-bake-")
        atlas_size = a.atlas or (1024 if a.lod else 2048)
        report["atlas"] = {"size": atlas_size, "paths": bake_body_atlas(body, atlas_size, bake_dir)}

    if a.kind == "bike" and a.stage >= 1:
        import tempfile
        bake_dir = a.bake_dir or tempfile.mkdtemp(prefix="hero-art-bake-")
        atlas_size = a.atlas or (1024 if a.lod else 2048)
        paths, parts = bake_bike_atlas(meshes, atlas_size, bake_dir)
        report["atlas"] = {"size": atlas_size, "paths": paths, "parts": parts}

    # 4. textures
    tex = a.tex or (512 if a.lod else 1024)
    tex_data = a.tex_data or (tex if a.kind == "rider" else min(tex, 512))
    if a.lod:
        tex_data = min(tex_data, 512)
    report["images"] = cap_images(tex, tex_data)

    # 5. export everything left in the scene
    obs = [o for o in scene_objects()]
    if a.kind == "rider":
        # keep the delivery's rest pose as the exported node transforms and make sure nothing is posed
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        arm.animation_data.action = None
    size = export(a.output, obs, animations=(a.kind == "rider"), meshopt=not a.no_meshopt)
    report["bytes"] = size
    report["objects"] = [{"name": o.name, "type": o.type, "tris": C.tri_count(o) if o.type == "MESH" else None,
                          "materials": [m.name for m in o.data.materials] if o.type == "MESH" else None} for o in obs]
    if a.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=a.save_blend, compress=True)
    if a.report:
        Path(a.report).write_text(json.dumps(report, indent=1))
    C.log(f"{a.kind} {'lod' if a.lod else 'full'}: {total_before} -> {total_after} tris, {size} bytes")


main()
