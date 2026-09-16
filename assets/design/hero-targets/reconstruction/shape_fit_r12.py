"""R12 correction2: joined metric garment fields from admitted turnaround contours.
No acceptance, review counters, materials or canonical game assets are changed.
"""
import copy
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parent
SPEC = ROOT.parent / 'street-mustard.sculpt.json'
spec = json.loads(SPEC.read_text())
components = {c['id']: c for c in spec['componentTree']}
owned = []

class Field:
    def __init__(self): self.primitives=[]; self.operations=[]; self.last=None
    def primitive(self, name, kind, **kw):
        self.primitives.append(dict(id=name,type=kind,**kw)); return name
    def op(self, kind, a, b, radius=None):
        name='op-'+str(len(self.operations)); d=dict(id=name,type=kind,left=a,right=b)
        if radius is not None: d['radius']=radius
        self.operations.append(d); return name
    def add(self, node, blend=.014):
        self.last=node if self.last is None else self.op('smooth-union',self.last,node,blend)
    def ellipse(self,name,center,radii,blend=.014): self.add(self.primitive(name,'ellipsoid',center=center,radii=radii),blend)
    def frustum(self,name,a,b,ra,rb,depth=1,blend=.014):
        # A is wider than B; clip a full cone to the intended segment before union.
        dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy);full=length*ra/(ra-rb)
        direction=[dx/length,dy/length,0];rotation=[0,0,math.atan2(-direction[0],direction[1])]
        center=[a[i]+direction[i]*full/2 for i in range(3)]
        cone=self.primitive(name+'-cone','cone',radius=ra,height=full,transform=dict(position=center,rotation=rotation,scale=[1,1,depth]))
        clip=self.primitive(name+'-clip','box',size=[ra*2+.08,length,ra*2+.08],transform=dict(position=[(a[i]+b[i])/2 for i in range(3)],rotation=rotation))
        self.add(self.op('intersect',cone,clip),blend)
    def cut(self,name,center,size): self.last=self.op('intersect',self.last,self.primitive(name,'box',center=center,size=size))
    def subtract(self,name,center,radii): self.last=self.op('subtract',self.last,self.primitive(name,'ellipsoid',center=center,radii=radii))

def apply(identifier,field,bounds,position=(0,0,0),parent=None,resolution=72):
    c=components[identifier];g=c['geometryDescriptor'];
    for key in ['latheProfile','profile2D','tubePath','semanticGroupOnly']:g.pop(key,None)
    c['primitive']='ellipsoid';c['topologyClass']='implicit';c['topologyRationale']='Single sampled continuous field; constituent cone/ellipsoid volumes are unioned before meshing, not separate overlapping visible meshes.'
    c['transform']=dict(position=list(position),rotation=[0,0,0],scale=[1,1,1])
    if parent is not None:c['parent']=parent
    g['sdf']=dict(primitives=field.primitives,operations=field.operations,resolution=resolution,bounds=dict(min=bounds[0],max=bounds[1]))
    g['normalStrategy']='Gradient-consistent smooth normals on a single connected garment field'
    g['shapeFitEvidence']='reconstruction/shape-fit-r12.json'
    g['joinPolicy']='Union all listed garment regions before extraction; no detached sleeve/thigh/shin render meshes. Separate cloth/skin/shoe material interfaces embed at measured silhouette boundaries.'
    c['dimensions'].update(width=bounds[1][0]-bounds[0][0],height=bounds[1][1]-bounds[0][1],depth=bounds[1][2]-bounds[0][2],units='meters',inference='Sampling bounds, not normalized geometry dimensions. Transform scale remains exactly one.')
    owned.append(identifier)

def semantic(identifier,position=None):
    c=components[identifier];g=c['geometryDescriptor']
    if 'semanticRegionEvidence' not in g:
        original=dict(primitive=c['primitive'],topologyClass=c['topologyClass'],dimensions=copy.deepcopy(c['dimensions']),geometryDescriptor=copy.deepcopy(g),material=c['material'],materialLayers=copy.deepcopy(c['materialLayers']))
    else: original=g['semanticRegionEvidence']
    c['primitive']='box';c['topologyClass']='assembled-solid'
    for key in ['sdf','latheProfile','profile2D','tubePath']:g.pop(key,None)
    g['semanticRegionEvidence']=original;g['semanticGroupOnly']=True
    c['material']='hidden';c['materialLayers']=['hidden']
    c['dimensions'].update(width=.001,height=.001,depth=.001)
    c['topologyRationale']='Hidden 1mm semantic region marker; visible garment volume lives in the continuous owner field, original region evidence retained.'
    g['shapeFitEvidence']='reconstruction/shape-fit-r12.json'
    g['note']='Region anchor retained; visible surface is part of the parent continuous garment field, not an extra mesh.'
    # Generator bakes transform.scale into geometry only; pivot Group remains unity.
    c['transform']['scale']=[.001,.001,.001]
    if position is not None:c['transform']['position']=position
    owned.append(identifier)

# Front observations converted through initial camera scale1.78/938; depth inferred
# jointly from side silhouette, not treated as calibrated photogrammetry.
f=Field()
f.ellipse('abdomen',[0,1.119,.007],[.200,.231,.120])
f.ellipse('ribcage',[0,1.298,.003],[.191,.204,.121],.025)
f.ellipse('shoulder-yoke',[0,1.394,-.004],[.205,.065,.113],.028)
# Broad lower ellipse makes a fitted hem instead of the old pinched 4-point barrel.
f.ellipse('hem',[0,.980,.003],[.193,.065,.113],.018)
for sign,label in [(1,'l'),(-1,'r')]:
    f.ellipse('shoulder-cap-'+label,[sign*.175,1.411,0],[.090,.080,.092],.020)
    f.frustum('upper-sleeve-'+label,[sign*.180,1.415,0],[sign*.263,1.192,0],.083,.065,1.04,.025)
    f.frustum('lower-sleeve-'+label,[sign*.261,1.202,0],[sign*.296,1.079,0],.066,.049,1.03,.016)
    f.ellipse('cuff-'+label,[sign*.296,1.087,0],[.051,.029,.052],.011)
f.ellipse('dropped-hood',[0,1.444,-.084],[.144,.102,.101],.02)
f.subtract('hood-opening',[0,1.538,.016],[.088,.145,.113])
f.cut('hem-plane',[0,1.30,0],[1,.708,1])
apply('hoodie',f,([-.375,.936,-.205],[.375,1.558,.150]),resolution=64)
for sign,label in [(1,'l'),(-1,'r')]:
    semantic('sleeve-'+label,[sign*.230,1.295,0])
    components['sleeve-'+label]['parent']='root'
    semantic('cuff-'+label,[sign*.296,1.087,0]);components['cuff-'+label]['parent']='root'
semantic('hood',[0,1.444,-.084]);components['hood']['parent']='root'

# Jeans are one pelvis/crotch/both-leg surface, joined prior to triangulation.
f=Field();f.ellipse('pelvis',[0,.892,-.009],[.181,.117,.116])
for sign,label in [(1,'l'),(-1,'r')]:
    f.frustum('thigh-'+label,[sign*.092,.900,-.005],[sign*.135,.522,.002],.091,.070,1.14,.017)
    f.frustum('calf-'+label,[sign*.134,.540,.002],[sign*.169,.268,-.004],.071,.060,1.12,.014)
    f.frustum('ankle-'+label,[sign*.168,.289,-.004],[sign*.185,.133,-.008],.061,.0525,1.10,.012)
    f.ellipse('ankle-stack-'+label,[sign*.181,.169,-.008],[.055,.042,.061],.01)
f.cut('waist-plane',[0,.50,0],[1,.954,1])
apply('jeans',f,([-.255,.120,-.143],[.255,.989,.130]),resolution=64)
for sign,label in [(1,'l'),(-1,'r')]:
    semantic('thigh-'+label,[sign*.112,.713,0]);components['thigh-'+label]['parent']='root'
    semantic('shin-'+label,[sign*.160,.330,0]);components['shin-'+label]['parent']='root'
    # Pockets are not in blockout render; preserve details but place on the actual hip shell.
    components['pocket-'+label]['transform']['position']=[sign*.084,.889,-.117]

for sign,label in [(1,'l'),(-1,'r')]:
    f=Field();f.frustum('forearm',[sign*.295,1.102,0],[sign*.347,.954,.003],.041,.0285,.96,.01)
    f.ellipse('wrist',[sign*.345,.961,.003],[.029,.025,.028],.008)
    apply('forearm-'+label,f,([min(sign*.244,sign*.398),.925,-.05],[max(sign*.244,sign*.398),1.127,.052]),parent='root',resolution=48)
    f=Field();f.ellipse('palm',[0,.007,0],[.035,.066,.023]);f.ellipse('fingers',[sign*.004,-.055,.006],[.031,.049,.022],.010)
    f.ellipse('thumb',[sign*-.035,-.008,.012],[.018,.045,.020],.008)
    apply('palm-'+label,f,([-.060,-.115,-.033],[.060,.084,.043]),position=[sign*.358,.885,.004],parent='gloves',resolution=48)
    f=Field();f.ellipse('ankle-upper',[0,.111,-.028],[.047,.073,.060])
    f.ellipse('vamp',[0,.066,.065],[.053,.046,.112],.012)
    f.ellipse('toe',[sign*.003,.050,.145],[.055,.027,.062],.010)
    f.cut('upper-sole-interface',[0,.19,.06],[.3,.319,.5])
    apply('upper-'+label,f,([-.067,.024,-.100],[.067,.195,.220]),position=[sign*.190,0,0],parent='shoes',resolution=56)
    f=Field();f.ellipse('sole-plan',[0,.023,.051],[.060,.10,.153])
    f.cut('sole-slab',[0,.023,.051],[.2,.026,.4])
    apply('sole-'+label,f,([-.070,.008,-.110],[.070,.038,.215]),parent='upper-'+label,resolution=48)
    semantic('tongue-'+label,[0,.112,.023])

# Preserve evidence and consumer socket metadata. The new fields use metre coordinates
# directly; dimensions never apply a second scale. Components retain exact IDs.
recipe={'correction':'R12 blockout correction2, complete silhouette group','reference':'turnaround-front.png + turnaround-side.png + turnaround-back.png','priorRender':'harness/out/blender/img2-preview/neutral-blockout-04','coordinateConvention':'+Y up, +Z forward, character left +X','cameraScaleMetresPerPixel':1.78/938,'observedFrontLandmarksPixels':{'shoulder':[155,201],'elbow':[105,350],'cuff':[87,384],'wrist':[60,447],'handTip':[52,549],'hem':[243,455],'knee':[176,677],'ankle':[145,884]},'limitation':'Pixel landmarks are hand observations. Metric positions/depth are construction inferences, not calibrated final likeness. Source01 remains final gameplay identity.','continuousOwners':{'hoodie':['torso','both shoulders','both sleeves','cuffs','dropped hood'],'jeans':['pelvis','crotch','both thighs','both shins','ankle stacks']},'removedDuplicateMeshIds':[i for i in owned if components[i]['geometryDescriptor'].get('semanticGroupOnly')],'ownedComponents':sorted(set(owned)),'samplingBounds':{i:components[i]['geometryDescriptor']['sdf']['bounds'] for i in owned if 'sdf' in components[i]['geometryDescriptor'] and not components[i]['geometryDescriptor'].get('semanticGroupOnly')},'next':'Strict validation, coordinated generation, actual field mesh bounds/connectedness, scalp gate and neutral rendered parent review. No review or material acceptance is recorded.'}
(ROOT/'shape-fit-r12.json').write_text(json.dumps(recipe,indent=2)+'\n')
SPEC.write_text(json.dumps(spec,indent=2)+'\n')
