"""blender -b INPUT.blend --python .../apply_source.py -- --output <fresh scratch.blend>"""
from pathlib import Path
import argparse,json,sys
import bpy
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
import fabrics
ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True)
a=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=a.output.resolve()
if not out.is_relative_to(ROOT) or out.exists(): raise ValueError('Fresh hero-fabrics scratch output required')
out.parent.mkdir(parents=True,exist_ok=True)
report=fabrics.apply_existing()
bpy.ops.wm.save_as_mainfile(filepath=str(out))
out.with_suffix('.fabrics.json').write_text(json.dumps(report,indent=2))
