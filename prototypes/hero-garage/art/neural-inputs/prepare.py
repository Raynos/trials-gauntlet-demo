"""Extract immutable reference pixels for a bounded image-to-3D head trial."""
from pathlib import Path
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parents[4]
here=Path(__file__).resolve().parent
source=root/'assets/design/hero-targets/reconstruction/street-mustard-turnaround.png'
box=(250,8,403,182)
image=Image.open(source)
image.crop(box).save(here/'head-front-reference.png')
report={'source':str(source.relative_to(root)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cropXYXY':box,'output':'head-front-reference.png','outputSha256':hashlib.sha256((here/'head-front-reference.png').read_bytes()).hexdigest(),'operation':'Crop only; original pixel resolution retained. No retouching, synthesis or upscale.','authority':'Existing provisionally admitted generated front-view design. Original target01 profile remains the identity authority.','limitations':['Small source crop cannot establish pores or recover hidden surfaces.','Crop includes neck and gray backdrop; model input behavior must be checked.','Not a production render or an accepted model.']}
(here/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
