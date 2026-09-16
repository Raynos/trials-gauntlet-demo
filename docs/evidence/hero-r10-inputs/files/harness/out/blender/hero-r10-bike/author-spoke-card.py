"""Correct swept spoke coverage in a copied source; all geometry stays untouched."""
from pathlib import Path
import bpy,math,json,hashlib
import numpy as np
ROOT=Path.cwd();OUT=ROOT/'harness/out/blender/hero-r10-bike'
source=ROOT/'harness/out/blender/mega-bike/final-candidate/source/bike.blend'
original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
material=bpy.data.materials['bike_spokecard']
node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
n=128;yy,xx=np.mgrid[0:n,0:n].astype(np.float32)
x=(xx+.5)/n-.5;y=(yy+.5)/n-.5
normalized_radius=np.sqrt(x*x+y*y)*2
angle=np.arctan2(y,x)
# Source has 32 spokes with a 3.6 mm diameter. Front/rear atlas normalization
# uses their individual rim radii; .245 m is the midpoint (.262+.228)/2.
# Circumference occupancy is N*d/(2*pi*r). Two alpha card surfaces composite
# as 1-(1-.9*a)^2 under the existing renderer; invert to get per-layer alpha.
r=np.maximum(.052,normalized_radius*.245)
coverage=np.clip(32*.0036/(2*math.pi*r),0,.42)
# Small variation expresses imperfect phase integration, not solid fan blades.
coverage*=1+.045*np.sin(angle*32)+.025*np.sin(angle*67+1.3)
fade=np.clip((normalized_radius-.22)/.06,0,1)*np.clip((.97-normalized_radius)/.05,0,1)
coverage*=fade
alpha=(1-np.sqrt(1-coverage))/.9
pixels=np.empty((n,n,4),dtype=np.float32)
pixels[:,:,:3]=(.52,.54,.55)
pixels[:,:,3]=alpha
image=bpy.data.images.new('bike_spokecard',n,n,alpha=True)
image.pixels.foreach_set(pixels.ravel());image.alpha_mode='STRAIGHT'
image.filepath_raw=str(OUT/'bike_spokecard.png');image.file_format='PNG';image.save()
node.image=image
# Same alloy response as accepted material, without the old bright fan stripes.
material['spokeCoverageModel']='32 spokes x 0.0036m / circumference; two layers, runtime opacity 0.9'
bpy.context.scene['heroSpokeCardRevision']='physical swept coverage, r10'
(OUT/'source').mkdir(exist_ok=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/bike.blend'),compress=True,copy=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
report=dict(originalSourceSha256=original_hash,sourceSha256=hashlib.sha256((OUT/'source/bike.blend').read_bytes()).hexdigest(),spokes=32,diameterMetres=.0036,cardLayers=2,runtimeOpacity=.9,rgbaSize=n,samples=[])
for radius in (.08,.12,.16,.20,.23):
 c=32*.0036/(2*math.pi*radius);a=(1-math.sqrt(1-c))/.9
 report['samples'].append(dict(radius=radius,physicalCoverage=c,textureAlpha=a,combinedOpacity=1-(1-.9*a)**2))
(OUT/'coverage.json').write_text(json.dumps(report,indent=2))
