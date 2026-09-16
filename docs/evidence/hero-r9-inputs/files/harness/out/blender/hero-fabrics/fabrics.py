"""Scratch photographed-fabric input layer, intended for the existing atlas bake.
Import in Blender; apply_existing() changes only selected material roughness/normal inputs.
Object coordinates are measured in metres; no generated-coordinate stretching or UV changes.
"""
from pathlib import Path
import json
import bpy

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / 'license-manifest.json').read_text())
TARGETS = {
    'hero heavy cotton': ('cotton_jersey', .00018, .72),
    'hero indigo twill': ('denim_fabric_03', .00015, .64),
    'hero denim pocket': ('denim_fabric_03', .00015, .64),
}

def apply_fabric(material, asset, *, relief_metres=.00015, minimum_roughness=.64,
                 preserve_existing_normal=False, pack=True):
    """Retain albedo/CW inputs exactly; replace old procedural micro bump and roughness.

    Displacement is sampled through BOX projection (0.2 blend) at the provider's measured
    tile size. Bump converts this real height image into a surface-space normal, so it
    does not depend on atlas tangent/UV direction. Relief amplitude is an explicitly
    artistic submillimetre setting; only tile scale is source-measured. Geometry seams,
    garment folds, stitching, normal smoothing and class-colour nodes are untouched.
    Set preserve_existing_normal=True only for an existing authored macro-normal chain.
    """
    if material.get('photographed_fabric'):
        raise ValueError('Fabric already applied: ' + material.name)
    spec = MANIFEST['assets'][asset]
    width, height = [x / 1000 for x in spec['dimensions_mm']]
    # BOX uses each pair of object-coordinate axes; these scans are square within 0.2%.
    # Use geometric mean so all projections share physical yarn density without seams.
    tile = (width * height) ** .5
    nt = material.node_tree
    bsdf = nt.nodes.get('BSDF') or next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base_before = [(l.from_node.name, l.from_socket.name) for l in bsdf.inputs['Base Color'].links]
    old_normal = bsdf.inputs['Normal'].links[0].from_socket if bsdf.inputs['Normal'].links else None
    def node(kind, name):
        n = nt.nodes.new(kind); n.name = 'PHOTO_' + name; n.label = name; return n
    coord = node('ShaderNodeTexCoord', 'metre object coordinates')
    scale = node('ShaderNodeVectorMath', 'measured tile %.6fm' % tile)
    scale.operation = 'SCALE'; scale.inputs['Scale'].default_value = 1 / tile
    nt.links.new(coord.outputs['Object'], scale.inputs[0])
    def texture(key):
        n = node('ShaderNodeTexImage', asset + ' ' + key)
        n.image = bpy.data.images.load(str(ROOT / spec['maps'][key]['path']), check_existing=True)
        n.image.colorspace_settings.name = 'Non-Color'
        if pack and not n.image.packed_file: n.image.pack()
        n.projection = 'BOX'; n.projection_blend = .2; n.extension = 'REPEAT'
        n.interpolation = 'Linear'; nt.links.new(scale.outputs['Vector'], n.inputs['Vector'])
        return n
    height_image = texture('Displacement'); rough_image = texture('Rough')
    bump = node('ShaderNodeBump', 'image-derived micro normal')
    bump.inputs['Strength'].default_value = .65
    bump.inputs['Distance'].default_value = relief_metres
    nt.links.new(height_image.outputs['Color'], bump.inputs['Height'])
    if preserve_existing_normal and old_normal: nt.links.new(old_normal, bump.inputs['Normal'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    rough = node('ShaderNodeMath', 'cloth roughness floor')
    rough.operation = 'MAXIMUM'; rough.inputs[1].default_value = minimum_roughness
    nt.links.new(rough_image.outputs['Color'], rough.inputs[0])
    nt.links.new(rough.outputs[0], bsdf.inputs['Roughness'])
    assert base_before == [(l.from_node.name, l.from_socket.name) for l in bsdf.inputs['Base Color'].links]
    report = dict(asset=asset, tile_metres=tile, source_dimensions_metres=[width,height],
                  bump_distance_metres=relief_metres, bump_strength=.65,
                  roughness_floor=minimum_roughness, albedo_unchanged=True,
                  preserves_existing_normal=preserve_existing_normal, packed=pack)
    material['photographed_fabric'] = json.dumps(report)
    return report

def apply_existing(*, strict=True):
    """Apply to existing mega_outfits Street material names; preserve all other materials."""
    reports = {}
    for name, (asset, relief, rough) in TARGETS.items():
        material = bpy.data.materials.get(name)
        if material is None:
            if strict: raise KeyError('Expected outfit material absent: ' + name)
            continue
        users = [o for o in bpy.data.objects if o.type == 'MESH' and material.name in o.data.materials]
        if any(max(abs(s - 1) for s in o.scale) > 1e-5 for o in users):
            raise ValueError('Apply object scale before metre-based fabric: ' + name)
        reports[name] = apply_fabric(material, asset, relief_metres=relief, minimum_roughness=rough)
    return reports
