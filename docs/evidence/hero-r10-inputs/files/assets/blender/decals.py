"""Decal sheet: the fictional sponsor set + class digits rendered headlessly from Blender text
objects into textures/decals.png (1024², RGBA, white on transparent). The bake materials project
cells of this sheet onto the rider suit / helmet / bike plastics in object space, tinted per
colourway, so a sponsor never needs a UV layout. Sponsors are the fictional set of
public/art/manifest.json: VORTEX OIL, NORDVIK, APEX, BOLT ENERGY, KESTREL TYRES, IRONWORKS.

Cells (u0, v0, u1, v1) in 0-1 image coordinates, v up (Blender image convention).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
from mathutils import Vector

import common as C

SHEET = os.path.join(C.BAKE_DIR, "decals.png")
FONTS = "/System/Library/Fonts/Supplemental/"
FONT = dict(
    impact=FONTS + "Impact.ttf",
    black=FONTS + "Arial Black.ttf",
    din=FONTS + "DIN Condensed Bold.ttf",
    dinalt=FONTS + "DIN Alternate Bold.ttf",
)

T = 1 / 8  # tile
CELLS = {
    # wide logo strips (4 x 1 tiles)
    "vortex": (0, 7 * T, 4 * T, 8 * T),
    "nordvik": (4 * T, 7 * T, 8 * T, 8 * T),
    "apex": (0, 6 * T, 4 * T, 7 * T),
    "bolt": (4 * T, 6 * T, 8 * T, 7 * T),
    "kestrel": (0, 5 * T, 4 * T, 6 * T),
    "ironworks": (4 * T, 5 * T, 8 * T, 6 * T),
    # digits (2 x 3 tiles)
    "d7": (0, 2 * T, 2 * T, 5 * T),
    "d1": (2 * T, 2 * T, 4 * T, 5 * T),
    # emblems (2 x 2 tiles) + a chevron stripe pair for the helmet / shrouds
    "swirl": (4 * T, 3 * T, 6 * T, 5 * T),
    "bird": (6 * T, 3 * T, 8 * T, 5 * T),
    "trimark": (0, 0, 2 * T, 2 * T),
    "boltmark": (2 * T, 0, 4 * T, 2 * T),
    "wave": (4 * T, 0, 6 * T, 2 * T),
    "chevrons": (6 * T, 0, 8 * T, 2 * T),
}


def _white():
    m = bpy.data.materials.get("decal_white")
    if m is None:
        m = bpy.data.materials.new("decal_white")
        m.diffuse_color = (1, 1, 1, 1)
    return m


def _text(body, font, cx, cy, w_max, h_max, italic=0.0, tracking=0.0):
    cu = bpy.data.curves.new("t", type="FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT[font])
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.shear = italic
    cu.space_character = 1.0 + tracking
    cu.size = 1.0
    ob = bpy.data.objects.new("t", cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(_white())
    bpy.context.view_layer.update()
    dx, dy = ob.dimensions.x, ob.dimensions.y
    s = min(w_max / max(dx, 1e-6), h_max / max(dy, 1e-6))
    ob.scale = (s, s, 1)
    # centre the glyph box (align_y CENTER centres on the em box, not the ink)
    bpy.context.view_layer.update()
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    bx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    by = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    ob.location = (cx - bx, cy - by, 0)
    return ob


def _mesh(name, bm, cx=0, cy=0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_white())
    ob = bpy.data.objects.new(name, me)
    ob.location = (cx, cy, 0)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _strip(points, width, closed=False):
    """Flat ribbon along a 2D polyline (constant width), as a bmesh in the XY plane."""
    bm = bmesh.new()
    pts = [Vector((p[0], p[1], 0)) for p in points]
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        b = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x, 0)) * (width / 2)
        left.append(bm.verts.new(pts[i] + nrm))
        right.append(bm.verts.new(pts[i] - nrm))
    m = n if closed else n - 1
    for i in range(m):
        j = (i + 1) % n
        bm.faces.new([left[i], right[i], right[j], left[j]])
    return bm


def _poly(points):
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], 0)) for p in points]
    bm.faces.new(vs)
    return bm


def _cell_box(name):
    u0, v0, u1, v1 = CELLS[name]
    return (u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0), (v1 - v0)


def build_sheet(size=1024, out=SHEET):
    sc = C.reset_scene()
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.render_aa = "8"
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 1.0
    co = bpy.data.objects.new("cam", cam)
    co.location = (0.5, 0.5, 5)
    sc.collection.objects.link(co)
    sc.camera = co
    pad = 0.94

    # ---- VORTEX OIL: swirl + heavy italic caps
    cx, cy, w, h = _cell_box("vortex")
    _text("VORTEX OIL", "impact", cx + 0.055, cy, w * 0.68, h * pad, italic=0.25)
    sp = [(0.0 + 0.045 * (1 - t / 6.5) * math.cos(t), 0.045 * (1 - t / 6.5) * math.sin(t)) for t in [i * 0.25 for i in range(26)]]
    _mesh("swirl_s", _strip(sp, 0.014), cx - 0.20, cy)
    # ---- NORDVIK: tall condensed caps over a wave
    cx, cy, w, h = _cell_box("nordvik")
    _text("NORDVIK", "din", cx, cy + 0.018, w * pad, h * 0.72, tracking=0.08)
    wv = [(x, 0.010 * math.sin(x * 60)) for x in [i * 0.01 - 0.19 for i in range(39)]]
    _mesh("wave_s", _strip(wv, 0.008), cx, cy - 0.046)
    # ---- APEX: hollow triangle + caps
    cx, cy, w, h = _cell_box("apex")
    _text("APEX", "black", cx + 0.05, cy, w * 0.62, h * 0.78, tracking=0.12)
    tri = [(-0.05, -0.045), (0.05, -0.045), (0.0, 0.048)]
    _mesh("tri_s", _strip(tri, 0.012, closed=True), cx - 0.185, cy)
    _mesh("tri_c", _strip([(-0.018, -0.02), (0.0, 0.012), (0.018, -0.02)], 0.008), cx - 0.185, cy - 0.005)
    # ---- BOLT ENERGY: lightning bolt + caps
    cx, cy, w, h = _cell_box("bolt")
    _text("BOLT ENERGY", "black", cx + 0.035, cy, w * 0.74, h * 0.62, italic=0.15)
    bolt = [(-0.012, 0.05), (0.014, 0.05), (0.0, 0.012), (0.02, 0.012), (-0.014, -0.05), (-0.004, -0.004), (-0.022, -0.004)]
    _mesh("bolt_s", _poly(bolt), cx - 0.205, cy)
    # ---- KESTREL TYRES: bird chevron + condensed caps
    cx, cy, w, h = _cell_box("kestrel")
    _text("KESTREL", "din", cx + 0.03, cy + 0.02, w * 0.62, h * 0.60, tracking=0.06)
    _text("TYRES", "din", cx + 0.03, cy - 0.036, w * 0.40, h * 0.30, tracking=0.35)
    wing = [(-0.07, -0.01), (-0.035, 0.03), (0.0, 0.005), (0.035, 0.03), (0.07, -0.01)]
    _mesh("bird_s", _strip(wing, 0.013), cx - 0.185, cy + 0.01)
    _mesh("bird_b", _poly([(-0.012, 0.0), (0.012, 0.0), (0.0, -0.035)]), cx - 0.185, cy + 0.002)
    # ---- IRONWORKS: blocky caps in a bar
    cx, cy, w, h = _cell_box("ironworks")
    _text("IRONWORKS", "black", cx, cy, w * pad, h * 0.66, tracking=0.04)
    _mesh("iw_bar1", _poly([(-0.235, 0.05), (0.235, 0.05), (0.235, 0.058), (-0.235, 0.058)]), cx, cy)
    _mesh("iw_bar2", _poly([(-0.235, -0.058), (0.235, -0.058), (0.235, -0.05), (-0.235, -0.05)]), cx, cy)
    # ---- digits
    for name, d in (("d7", "7"), ("d1", "1")):
        cx, cy, w, h = _cell_box(name)
        _text(d, "impact", cx, cy, w * 0.9, h * 0.92)
    # ---- emblems
    cx, cy, w, h = _cell_box("swirl")
    sp = [(0.09 * (1 - t / 7.0) * math.cos(t), 0.09 * (1 - t / 7.0) * math.sin(t)) for t in [i * 0.2 for i in range(36)]]
    _mesh("swirl_e", _strip(sp, 0.026), cx, cy)
    cx, cy, w, h = _cell_box("bird")
    wing = [(-0.11, -0.02), (-0.055, 0.045), (0.0, 0.005), (0.055, 0.045), (0.11, -0.02)]
    _mesh("bird_e", _strip(wing, 0.022), cx, cy + 0.02)
    _mesh("bird_eb", _poly([(-0.02, 0.0), (0.02, 0.0), (0.0, -0.06)]), cx, cy + 0.005)
    cx, cy, w, h = _cell_box("trimark")
    _mesh("tri_e", _strip([(-0.09, -0.08), (0.09, -0.08), (0.0, 0.085)], 0.02, closed=True), cx, cy)
    _mesh("tri_ec", _strip([(-0.032, -0.035), (0.0, 0.022), (0.032, -0.035)], 0.014), cx, cy - 0.01)
    cx, cy, w, h = _cell_box("boltmark")
    bolt = [(-0.024, 0.1), (0.028, 0.1), (0.0, 0.024), (0.04, 0.024), (-0.028, -0.1), (-0.008, -0.008), (-0.044, -0.008)]
    _mesh("bolt_e", _poly(bolt), cx, cy)
    cx, cy, w, h = _cell_box("wave")
    for k, yy in enumerate((0.03, -0.03)):
        wv = [(x, 0.02 * math.sin(x * 35 + k)) for x in [i * 0.005 - 0.1 for i in range(41)]]
        _mesh(f"wave_e{k}", _strip(wv, 0.016), cx, cy + yy)
    cx, cy, w, h = _cell_box("chevrons")
    for k in range(3):
        x0 = -0.075 + k * 0.05
        _mesh(f"chev{k}", _strip([(x0 - 0.02, -0.1), (x0 + 0.02, 0.0), (x0 - 0.02, 0.1)], 0.02), cx, cy)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    C.log("decal sheet", out, f"{os.path.getsize(out) / 1024:.0f} KB")
    return out


def ensure_sheet():
    """Render the sheet if missing; loads it as a Blender image (kept in the build scene)."""
    if not os.path.exists(SHEET):
        build_sheet()
        C.reset_scene()
    img = bpy.data.images.load(SHEET)
    img.colorspace_settings.name = "sRGB"
    img.alpha_mode = "STRAIGHT"
    return img


if __name__ == "__main__":
    build_sheet()
