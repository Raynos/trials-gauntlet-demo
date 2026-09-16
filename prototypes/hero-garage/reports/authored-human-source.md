# Authored human source intake — MPFB

Technical source import passed on Blender 5.2.1 LTS. This is a new source foundation, not target01 likeness acceptance or a head candidate. No garage catalog, current render, or game asset was changed.

## Selected and acquired

MPFB 2.0.17 official source tag `80919fa4682335c41847f761a4d79dcad4124732`, plus official MakeHuman system assets. Downloads total about 310 MB. Both archives and extracted original data live in ignored `../art/sources/authored-human/raw/`; URLs, byte counts and SHA256 are in `../art/sources/authored-human/provenance.json`. No account, spending or global extension installation was required.

The authored base has facial deformation topology and open-eye sockets, with fitted separate eye meshes; it does not require reopening a closed scan. Real mapped male skin color, eye, eyebrow and eyelash images were successfully loaded and packed. Authored macro/detail target data provide coordinated anatomical changes rather than guessed coordinate edits. Hair/body/clothing MHCLO fitting uses the same basemesh indices, allowing the parent's independently selected MakeHuman hair sources to fit.

Local editable probe: `../art/sources/authored-human/adult-male-source-probe.blend`. It retains full body plus masked helpers and editable macro shape keys for future source work; this is intentionally not a cropped/runtime production export.

## Evidence and limits

`../art/sources/authored-human/verification.json` records the actual imported scene: 19,158 base vertices / 18,486 faces with one UV layer (includes masked helpers); 1,064 eye vertices / 1,020 faces; separate 124-vertex brows and 250-vertex lashes. Four packed textures: 2048² middleage male skin diffuse, 1024² brown eye, 512² brows and lashes. Blender returned `SOURCE_PROBE_PASS` and saved the packed scene. The command uses `--python-exit-code 1` to distinguish Python failure from Blender's usual zero exit.

The imported system skin is **diffuse only**; no authored skin normal or roughness map was provided by this material. It cannot yet claim pore-level fidelity. Imported game-engine skin nodes, eye appearance, open-lid visibility, fit after identity changes and glTF parity still require parent browser review. The base and male macro parameters are not the target's likeness. No assumption that subdivision or successful import proves art quality.

## Reproduce and APIs

Run from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/sources/authored-human/verify_import.py
```

`verify_import.py` loads the source addon with `addon_utils.enable('mpfb', default_set=True)` for that process. A narrowly scoped `extension_path_user` adapter supplies a local data directory because an uninstalled source checkout lacks Blender's extension namespace. It does not save user preferences. MPFB's startup logger can create ordinary local log configuration in Blender's user-data directory; this is neither copied nor tracked.

```python
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService
from pathlib import Path

macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0, age=0.48, muscle=0.58, weight=0.48)
macro['race'] = {'caucasian': 0.8, 'asian': 0.1, 'african': 0.1}
human = HumanService.create_human(macro_detail_dict=macro)
# Human scale defaults to meters (0.1 source scale), Z up, feet on ground.
# The probe values are a mature-male foundation, not a frozen identity design.

root = Path(LocationService.get_mpfb_data('targets'))
TargetService.load_target(human, str(root/'nose/nose-volume-incr.target.gz'), weight=0.2)
# Set only deliberately chosen authored target weights. Full available list is
# ../art/sources/authored-human/authored-targets.txt.
HumanService.set_character_skin('/absolute/skin.mhmat', human, skin_type='GAMEENGINE')
HumanService.add_mhclo_asset('/absolute/hair.mhclo', human,
                           asset_type='Hair', subdiv_levels=1)
HumanService.refit(human)
```

The target-loading example illustrates API only; that nose target was not applied to the saved probe. Preserve base vertex order and helper topology until MHCLO fitting finishes. For export, evaluate masks/modifiers on a copy and retain editable source. High-poly eye MHCLO automatically selects its supplied brown eye material.

## Exact permissions

Official [license overview](https://static.makehumancommunity.org/about/license.html) distinguishes GPL MPFB code from CC0 core assets. The [pinned MPFB license](https://github.com/makehumancommunity/mpfb2/blob/v2.0.17/LICENSE.md) specifies GPL v3 or later for program logic and CC0 1.0 Universal for base meshes, targets, textures, MHCLO assets, rigs and mesh metadata. Its output section explicitly includes graphical data generated through scripts, saved models and exports within the asset/output treatment. Copies of all three upstream license files are preserved beside the script.

The separate [official system pack manifest](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) individually lists the imported skin, high-poly eyes, eyebrow001 and eyelashes01 as CC0. Each selected `.mhmat`/`.mhclo` contains the explicit September 2020 CC0 release notice naming Data Collection AB, Joel Palmius and Jonas Hauquier. The source code is kept local; generated art can be used in this personal project and later commercial/closed-source output under the stated asset terms. Third-party hair licenses remain separately owned and verified by the parent; this report does not grant CC0 to those assets.

## First candidate follow-on

Parent authorized a bounded first head candidate after the technical probe. `../art/head-authored/build_head.py` retains a complete editable body in `../art/street01-head-authored.blend` and exports only its evaluated head/neck copy plus fitted source eyes, brows/lashes and Cortu hair to `../public/assets/street01-head-authored.glb`. Named morph weights and measured geometry are in `authored-head-build.json`; browser acceptance remains exclusively the parent's decision.

Additional acquired source: official Skins02 pack (about 73MB), using **jartur69 middleage Slavic male with genitals and beard**, individually listed CC0 in its official pack manifest. Archive hash and author are in source provenance. Source texture remains unmodified and provides subtle stubble; no claim that this already matches the target's denser beard. Neither full-body nudity nor helper geometry is included in runtime head export.

The high-poly eye's source texture alpha is essential: an outer shell is transparent in its authored material. Replacing it with opaque material made the eyes black; preserving authored alpha restored visible sclera/iris in source diagnostics. Runtime eye and strand materials explicitly use alpha MASK at 0.35. The exported GLB JSON also explicitly sets the dark-brown hair baseColorFactor because the Blender exporter did not preserve the Multiply-node factor. Object-space hair normal is omitted. Source mask, morphs and subdivision are evaluated before a planar capped neck crop, leaving editable body source intact.
