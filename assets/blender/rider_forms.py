"""Editable rider garment/gear forms. Coordinates here are local X-forward, Z-up."""
import math

import bmesh
from mathutils import Matrix, Vector

import common as C


def mesh(b, vertices, faces, transform, materials, group):
    """Append an explicitly surfaced part, retaining material regions and deformation ownership."""
    verts = [b.bm.verts.new(transform @ Vector(point)) for point in vertices]
    b.bm.verts.index_update()
    for vertex in verts:
        b.groups[vertex.index] = {group: 1.0} if isinstance(group, str) else dict(group)
    added = []
    for indices, material in faces:
        face = b.bm.faces.new([verts[i] for i in indices])
        face.material_index = b.mat_index(materials[material])
        face.smooth = True
        added.append(face)
    bmesh.ops.recalc_face_normals(b.bm, faces=added)


def solid_panel(b, outline, thickness, transform, material, group):
    n = len(outline)
    vertices = list(outline) + [(x, y, z - thickness) for x, y, z in outline]
    faces = [(tuple(range(n)), "surface"), (tuple(reversed(range(n, n * 2))), "surface")]
    faces += [((i, (i + 1) % n, (i + 1) % n + n, i + n), "surface") for i in range(n)]
    mesh(b, vertices, faces, transform, {"surface": material}, group)


def helmet(b, transform, materials):
    """A continuous shell and chin guard around an actual eyeport, with a lined opening."""
    count = 40
    sections = [(-.148, .70), (-.126, .86), (-.092, .98), (-.055, 1.0),
                (-.018, 1.0), (.024, .98), (.060, .92), (.103, .76), (.137, .42), (.151, .045)]
    outer = []
    for z, radius in sections:
        for i in range(count):
            angle = i * math.tau / count
            front = max(0, math.cos(angle))
            # Lower face projects into a chin guard; the eye opening remains recessed behind it.
            chin = .054 * front ** 3 * max(0, min(1, (-z - .035) / .055))
            outer.append((.153 * radius * math.cos(angle) + chin, .123 * radius * math.sin(angle), z))
    vertices = outer + [(x * .945, y * .94, z * .96) for x, y, z in outer]
    offset = len(outer)
    faces = []
    edges = {}
    for row in range(len(sections) - 1):
        z = (sections[row][0] + sections[row + 1][0]) / 2
        for i in range(count):
            angle = (i + .5) * math.tau / count
            if -.079 < z < .057 and math.cos(angle) > .42:
                continue
            quad = (row * count + i, row * count + (i + 1) % count,
                    (row + 1) * count + (i + 1) % count, (row + 1) * count + i)
            faces.append((quad, "helmet"))
            faces.append((tuple(index + offset for index in reversed(quad)), "armour"))
            for a, c in zip(quad, quad[1:] + quad[:1]):
                key = tuple(sorted((a, c)))
                if key in edges:
                    del edges[key]
                else:
                    edges[key] = (a, c)
    for a, c in edges.values():
        faces.append(((a, c, c + offset, a + offset), "armour"))
    faces.append((tuple((len(sections) - 1) * count + i for i in range(count)), "helmet"))
    mesh(b, vertices, faces, transform, materials, "head")

    # Contoured goggle frame and lens; their surfaces fill the eyeport without covering the jaw.
    outline = [(-.100, -.027), (-.085, -.051), (-.025, -.054), (0, -.038),
               (.025, -.054), (.085, -.051), (.100, -.027), (.094, .019), (.060, .032),
               (-.060, .032), (-.094, .019)]
    frame = [(.164 - 6.0 * y * y, y, z) for y, z in outline]
    inner = [(.165 - 6.0 * (y * .84) ** 2, y * .84, z * .74) for y, z in outline]
    n = len(frame)
    faces = [((i, (i + 1) % n, (i + 1) % n + n, i + n), "armour") for i in range(n)]
    faces += [((n + i, n + (i + 1) % n, n * 2), "visor") for i in range(n)]
    mesh(b, frame + inner + [(.165, 0, -.005)], faces, transform, materials, "head")
    strap = []
    for i in range(25):
        angle = math.radians(65 + 230 * i / 24)
        strap += [(.158 * math.cos(angle), .128 * math.sin(angle), z) for z in (-.024, .004)]
    mesh(b, strap, [((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2), "armour") for i in range(24)], transform, materials, "head")
    for sign in (-1, 1):
        bridge = [(.106, sign * .100, -.024), (.106, sign * .100, .006),
                  (.067, sign * .117, .004), (.067, sign * .117, -.024)]
        mesh(b, bridge, [((0, 1, 2, 3), "armour")], transform, materials, "head")
    solid_panel(b, [(-.014, -.111, .111), (.112, -.151, .115), (.248, -.113, .078),
                    (.267, -.055, .066), (.267, .055, .066), (.248, .113, .078),
                    (.112, .151, .115), (-.014, .111, .111)], .006, transform, materials["helmet"], "head")
    # Recessed front ventilation, its outline follows the continuous chin guard.
    vent = [(.205, -.055, -.115), (.210, -.048, -.086), (.217, .048, -.086), (.211, .055, -.115)]
    mesh(b, vent, [((0, 1, 2, 3), "armour")], transform, materials, "head")


def glove(b, grip, side, materials):
    """Four curled fingers and an opposed thumb around the actual transverse grip axis."""
    def add(geometry, transform, material):
        b.add(geometry, transform, material, group=f"hand.{side}")
        geometry.free()
    transform = Matrix.Translation(grip)
    add(C.prim_box(.058, .087, .035, bevel=.013, segments=3), transform @ Matrix.Translation((-.025, 0, .020)), materials["glove_top"])
    for index, y in enumerate((-.032, -.011, .011, .032)):
        radius = .025 if index in (0, 3) else .027
        points = [(radius * math.cos(math.radians(a)), y, radius * math.sin(math.radians(a))) for a in (153, 120, 84, 45, 5, -38)]
        add(C.prim_tube(points, .008, sides=8, samples=2), transform, materials["gloves"])
    sign = 1 if side == "L" else -1
    thumb = [(-.042, sign * .030, .013), (-.029, sign * .051, .015),
             (-.002, sign * .059, -.001), (.015, sign * .039, -.022)]
    add(C.prim_tube(thumb, .011, sides=10, samples=2), transform, materials["gloves"])


def trainer(b, ankle, side, materials):
    transform = Matrix.Translation(ankle)
    sections = [(-.102, .038, .003), (-.073, .055, .046), (-.025, .061, .052),
                (.033, .065, .025), (.112, .064, -.025), (.192, .048, -.039), (.218, .021, -.056)]
    vertices = []
    count = 12
    for x, width, top in sections:
        for i in range(count):
            angle = i * math.tau / count
            z = -.061 + (top + .061) * (math.sin(angle) + 1) / 2
            vertices.append((x, width * math.cos(angle), z))
    faces = [((row * count + i, row * count + (i + 1) % count,
               (row + 1) * count + (i + 1) % count, (row + 1) * count + i), "boots")
             for row in range(len(sections) - 1) for i in range(count)
             if not (row in (0, 1, 2) and math.sin((i + .5) * math.tau / count) > .6)]
    faces += [(tuple(reversed(range(count))), "boots"),
              (tuple((len(sections) - 1) * count + i for i in range(count)), "boots")]
    mesh(b, vertices, faces, transform, materials, f"foot.{side}")
    # Peg serrations end 11 mm above the nominal peg origin. With the 90 mm ankle offset,
    # the tread is 79 mm below the ankle; it meets the teeth rather than swallowing the peg.
    outline = [(-.107, -.037, -.059), (-.065, -.058, -.059), (.085, -.068, -.059),
               (.19, -.05, -.059), (.227, -.015, -.062), (.227, .015, -.062),
               (.19, .05, -.059), (.085, .068, -.059), (-.065, .058, -.059), (-.107, .037, -.059)]
    solid_panel(b, outline, .020, transform, materials["sole"], f"foot.{side}")
    for x, z in (((-.004, .044), (.018, .035), (.040, .022), (.062, .010)) if "laces" in materials else ()):
        geometry = C.prim_tube([(x, -.028, z), (x + .01, 0, z + .003), (x, .028, z)], .0023, sides=6, samples=1)
        b.add(geometry, transform, materials["laces"], group=f"foot.{side}")
        geometry.free()


def hood(b, transform, materials):
    count = 28
    vertices = []
    for z, width, depth in ((-.055, .12, .072), (-.012, .157, .095), (.07, .139, .098), (.12, .105, .074)):
        for i in range(count):
            angle = i * math.tau / count
            vertices.append((-.072 + depth * math.cos(angle), width * math.sin(angle), z + .035 * max(0, -math.cos(angle))))
    faces = [((row * count + i, row * count + (i + 1) % count,
               (row + 1) * count + (i + 1) % count, (row + 1) * count + i), "hoodie")
             for row in range(3) for i in range(count)]
    mesh(b, vertices, faces, transform, materials, "chest")
    for sign in (-1, 1):
        geometry = C.prim_tube([(.055, sign * .055, .065), (.084, sign * .06, .005),
                                (.14, sign * .057, -.09), (.148, sign * .064, -.14)], .0025, sides=6, samples=2)
        b.add(geometry, transform, materials["laces"], group="chest")
        geometry.free()
