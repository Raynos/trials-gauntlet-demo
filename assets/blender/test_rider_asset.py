"""Headless authoring/export regression checks; every test output stays under ignored harness/out.

  python3 assets/blender/test_rider_asset.py

Uses installed Blender and Node.js; no browser, renderer build, or committed asset is modified.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "assets" / "blender" / "rider_asset.py"
BLENDER = os.environ.get("BLENDER", "/opt/homebrew/bin/blender")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def glb_json(path):
    data = Path(path).read_bytes()
    size = int.from_bytes(data[12:16], "little")
    return json.loads(data[20:20 + size])


def zero_weight_glb(source, destination):
    """Keep the real GLB geometry/clips, but point weights at a new all-zero float accessor.

    GLTFLoader repairs these to [1, 0, 0, 0], so post-load sum checks alone would accept them.
    """
    data = Path(source).read_bytes()
    json_size = int.from_bytes(data[12:16], "little")
    document = glb_json(source)
    binary = data[28 + json_size:]
    primitive = document["meshes"][0]["primitives"][0]
    count = document["accessors"][primitive["attributes"]["WEIGHTS_0"]]["count"]
    weights = bytes(count * 16)
    view = len(document["bufferViews"])
    document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(weights), "target": 34962})
    primitive["attributes"]["WEIGHTS_0"] = len(document["accessors"])
    document["accessors"].append({"bufferView": view, "componentType": 5126, "count": count, "type": "VEC4"})
    binary += weights
    document["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(document).encode()
    encoded += b" " * (-len(encoded) % 4)
    header = struct.pack("<IIIII", 0x46546C67, 2, 28 + len(encoded) + len(binary), len(encoded), 0x4E4F534A)
    Path(destination).write_bytes(header + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary)


class RiderPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = ROOT / "harness" / "out" / "blender"
        base.mkdir(parents=True, exist_ok=True)
        cls.directory = tempfile.TemporaryDirectory(prefix="pipeline-test-", dir=base)
        cls.output = Path(cls.directory.name)
        cls.counter = 0

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def blender(self, args, expect_success=True):
        result = subprocess.run([BLENDER, "-b", "--python-exit-code", "1", *args], cwd=ROOT, capture_output=True, text=True)
        type(self).counter += 1
        log = self.output / f"command-{self.counter}.log"
        log.write_text(result.stdout + result.stderr)
        if expect_success:
            self.assertEqual(result.returncode, 0, log.read_text())
        else:
            self.assertNotEqual(result.returncode, 0, "Expected rejection: " + log.read_text())
        return log.read_text()

    def pipeline(self, action, outfit, source, *extra, expect_success=True):
        return self.blender([
            "--python", str(SCRIPT), "--", action, "--outfit", outfit, "--source", str(source),
            "--models", str(self.output / outfit / "models"),
            "--generated", str(self.output / outfit / "generated"),
            "--textures", str(self.output / outfit / "textures"), *extra,
        ], expect_success)

    def test_full_and_lod_preserve_editable_master_and_validate_before_publication(self):
        for outfit in ("street", "race"):
            with self.subTest(outfit=outfit):
                source = self.output / outfit / "source" / f"rider-{outfit}.blend"
                self.pipeline("seed", outfit, source)
                original_hash = digest(source)
                self.pipeline("seed", outfit, source, expect_success=False)
                self.assertEqual(digest(source), original_hash)
                # Audit the saved source, then add an authored socket/custom property. Export must
                # retain those edits, proving it consumes this file instead of rebuilding the seed.
                expression = f'''
import bpy, sys
from mathutils import Matrix
sys.path.insert(0, {str(SCRIPT.parent)!r})
import rider_asset as A
bpy.ops.wm.open_mainfile(filepath={str(source)!r})
arm = bpy.data.objects['rider_rig']
meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
A.check_source(arm, meshes)
assert len(meshes) > 1, 'source parts remain editable'
assert arm.animation_data.action is None
assert all(track.mute for track in arm.animation_data.nla_tracks)
assert all(max(abs(bone.matrix_basis[r][c] - Matrix.Identity(4)[r][c]) for r in range(4) for c in range(4)) < 1e-7 for bone in arm.pose.bones)
assert sum(len(material.node_tree.nodes) for material in bpy.data.materials if material.use_nodes) > 50, 'authored material graphs'
assert all(image.packed_file for image in bpy.data.images if image.source == 'FILE'), 'source texture dependencies packed'
assert bpy.context.scene['heroOutfit'] == {outfit!r}
arm['pipelineProbe'] = 'authored-source-edit'
socket = bpy.data.objects.new('socket_pipeline_probe', None)
bpy.context.scene.collection.objects.link(socket)
socket.parent = arm
socket.parent_type = 'BONE'
socket.parent_bone = 'hand.L'
socket.location = (.031, .027, .019)
bpy.ops.wm.save_as_mainfile(filepath={str(source)!r}, compress=True)
'''
                self.blender(["--python-expr", expression])
                authored_hash = digest(source)
                self.assertNotEqual(original_hash, authored_hash)
                for lod in (False, True):
                    self.pipeline("export", outfit, source, "--size", "256", *(["--lod"] if lod else []))
                    self.assertEqual(digest(source), authored_hash)
                    stem = f"rider-{outfit}" + ("-lod" if lod else "")
                    glb = self.output / outfit / "models" / f"{stem}.glb"
                    report = json.loads(glb.with_suffix(".source.json").read_text())
                    self.assertEqual(report["sourceSha256"], authored_hash)
                    self.assertEqual(report["exportSha256"], digest(glb))
                    self.assertEqual(report["outfit"], outfit)
                    self.assertLess(report["verified"]["maxWeightError"], 1e-4)
                    if lod:
                        self.assertLessEqual(report["verified"]["triangles"], 6000)
                    document = glb_json(glb)
                    self.assertTrue(any(node.get("name") == "socket_pipeline_probe" for node in document["nodes"]))
                    self.assertTrue(any(node.get("extras", {}).get("pipelineProbe") == "authored-source-edit" for node in document["nodes"]))
                    corrupt = self.output / outfit / f"{stem}-zero-weights.glb"
                    zero_weight_glb(glb, corrupt)
                    rejected = subprocess.run(["node", str(SCRIPT.with_name("verify_rider_asset.mjs")), str(corrupt)], cwd=ROOT, capture_output=True, text=True)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn("normalized raw skin weights", rejected.stderr)

                before = {p: digest(p) for folder in ("models", "generated", "textures") for p in (self.output / outfit / folder).glob("*") if p.is_file()}
                # A validator failure occurs after baking/export, so this checks staging itself.
                self.pipeline("export", outfit, source, "--size", "256", "--node", "/usr/bin/false", expect_success=False)
                self.assertEqual({p: digest(p) for p in before}, before)
                self.assertEqual(digest(source), authored_hash)
                self.pipeline("export", "race" if outfit == "street" else "street", source, expect_success=False)
                self.assertEqual(digest(source), authored_hash)

                # Source destination aliasing is rejected before touching the master.
                self.pipeline("export", outfit, source, "--generated", str(source.parent), expect_success=False)
                self.assertEqual(digest(source), authored_hash)

                bad = source.with_name("invalid-weights.blend")
                shutil.copyfile(source, bad)
                self.blender(["--python-expr", f'''
import bpy
bpy.ops.wm.open_mainfile(filepath={str(bad)!r})
body = next(ob for ob in bpy.context.scene.objects if ob.type == 'MESH')
vertex = next(v for v in body.data.vertices if v.groups)
body.vertex_groups[vertex.groups[0].group].add([vertex.index], .2, 'REPLACE')
bpy.ops.wm.save_as_mainfile(filepath={str(bad)!r}, compress=True)
'''])
                log = self.pipeline("export", outfit, bad, expect_success=False)
                self.assertIn("Invalid skin weights", log)
                self.assertEqual({p: digest(p) for p in before}, before)


if __name__ == "__main__":
    unittest.main()
