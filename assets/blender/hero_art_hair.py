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


def build_shell(groom, arm, budget=5000, voxel=0.004, radius=0.006, name="hair_shell"):
    """Closed shell around the strand cloud, collapsed to `budget` triangles, skinned rigidly to `head`."""
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
    # collapse; the blob is manifold so collapse reaches the target
    mod = shell.modifiers.new("LOD", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.005, budget / max(raw_tris, 1) * 0.98)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    shell.data.validate(verbose=False, clean_customdata=False)
    C.select_only([shell])
    bpy.ops.object.shade_smooth()
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


def bake_from_strands(shell, groom, size=512, samples=16, cage=0.012, ray=0.03, base_color=(0.028, 0.012, 0.006, 1), roughness=0.9, lift=4.0):
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
    # material: base colour * AO, roughness constant, tangent normal
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 1.0
    nt.links.new(tex_n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    # fold AO into an albedo image (no glTF occlusion needed; the shell's own lighting darkens the curl valleys)
    alb = bpy.data.images.new("hair_shell_albedo", size, size, alpha=False)
    alb.colorspace_settings.name = "sRGB"
    px = np.empty(size * size * 4, dtype=np.float32)
    ao.pixels.foreach_get(px)
    occ = np.clip(px[0::4], 0.0, 1.0)
    occ = 0.35 + 0.65 * occ  # keep the valleys readable, not black
    rgb = np.array(base_color[:3], dtype=np.float32)
    # slightly lift the delivered strand colour: the shell has no multiple-scatter brightening from many tubes
    rgb = np.clip(rgb * lift, 0, 1)
    out_px = np.empty_like(px)
    out_px[0::4] = rgb[0] * occ
    out_px[1::4] = rgb[1] * occ
    out_px[2::4] = rgb[2] * occ
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
            b.inputs["Specular IOR Level"].default_value = min(0.15, src.inputs["Specular IOR Level"].default_value)
    for img in (nrm, alb):
        img.pack()
    bpy.data.images.remove(ao)
    sc.render.bake.use_selected_to_active = False
    return {"normal": nrm.name, "albedo": alb.name, "size": size, "samples": samples}


def build_hair(groom, arm, budget=5000, bake_size=512, samples=16, voxel=0.003, radius=0.0045):
    shell, raw = build_shell(groom, arm, budget=budget, voxel=voxel, radius=radius)
    unwrap(shell)
    bake = bake_from_strands(shell, groom, size=bake_size, samples=samples)
    return shell, {"shellRawTris": raw, "shellTris": C.tri_count(shell), "voxel": voxel, "radius": radius, "bake": bake}
