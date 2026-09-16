"""R12 original open-face headgear; scratch-only source, no body or consumer changes."""
import bpy, json, math, sys, argparse
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C
import author_garments as G
import author_hood as H
import rider_asset as P
import rider_forms as F

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, default=Path('harness/out/blender/openface-r12'))
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
ROOT = args.output_dir
SOURCE = Path('assets/blender/source/rider-street.blend')
OUT = ROOT/'source/rider-openface.blend'
if OUT.exists():
    raise RuntimeError('Fresh candidate directory required')
source_sha = G.sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE.resolve()))
arm = bpy.data.objects['rider_rig']; P.clear_pose(arm)
before = G.invariant_signature()
rig_signature = {k:v for k,v in before.items() if k != 'materials'}
hair_names = ['rider:short hair prototype', 'rider:short hair directional clumps']
fixed = {o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type == 'MESH' and o.name not in hair_names}
for name in hair_names:
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
head = arm.data.bones['head']
up = (head.tail_local-head.head_local).normalized()
front = Vector((up.z,0,-up.x))
origin = head.head_local
basis = Matrix(((front.x,0,up.x,origin.x),(0,1,0,origin.y),(front.z,0,up.z,origin.z),(0,0,0,1)))
inverse = basis.inverted()
mats = {
    'shell': C.new_mat('openface satin graphite shell', (.026,.029,.033,1), rough=.38),
    'rim': C.new_mat('openface rubber edge trim', (.008,.009,.011,1), rough=.72),
    'liner': C.new_mat('openface dark foam liner', (.014,.015,.017,1), rough=.91),
    'metal': C.new_mat('openface recessed hardware', (.09,.095,.10,1), rough=.43, metal=.65),
    'strap': C.new_mat('openface woven chin strap', (.013,.014,.016,1), rough=.84),
}
builder = C.MeshBuilder('rider:openface helmet')
parts = []
def add(name, vertices, faces):
    parts.append({'name':name,'vertices':len(vertices),'triangles':sum(len(p)-2 for p,_ in faces)})
    F.mesh(builder,vertices,faces,basis,mats,'head')
def primitive(name, bm, transform, material):
    parts.append({'name':name,'vertices':len(bm.verts)})
    builder.add(bm,basis@transform,mats[material],group='head');bm.free()

# A single double-wall shell with an uninterrupted open face. Its lower boundary
# rises to the forehead at the front, drops over the ears, and clears the hood.
# Metres in human-head frame, measured from the existing head-bone origin.
N, ROWS = 64, 18
def boundary(angle):
    c = math.cos(angle)
    return 2.23 - 1.11*max(c,0)**3
def point(angle, theta, inner=False):
    inset=.006 if inner else 0
    ear_flare=.015*max(0,(theta-1.65)/.58)**2
    return Vector((.026+(.114-inset)*math.sin(theta)*math.cos(angle),
                   (.106-inset+ear_flare)*math.sin(theta)*math.sin(angle),
                   .147+(.110-inset)*math.cos(theta)))
vertices=[]
for inner in [False,True]:
    for row in range(ROWS+1):
        for col in range(N):
            angle=math.tau*col/N
            vertices.append(point(angle,.012+(boundary(angle)-.012)*row/ROWS,inner))
layer=(ROWS+1)*N;faces=[]
for row in range(ROWS):
    for col in range(N):
        a=row*N+col;b=row*N+(col+1)%N;c=b+N;d=a+N
        faces.append(((a,b,c,d),'shell'))
        faces.append(((a+layer,d+layer,c+layer,b+layer),'liner'))
for col in range(N):
    a=ROWS*N+col;b=ROWS*N+(col+1)%N
    faces.append(((a,a+layer,b+layer,b),'rim'))
faces.extend([(tuple(reversed(range(N))),'shell'),(tuple(layer+i for i in range(N)),'liner')])
add('continuous open-face shell and inner foam',vertices,faces)
rim=[point(math.tau*i/N,boundary(math.tau*i/N)) for i in range(N)]
primitive('rolled aperture edge',C.prim_tube(rim,.0026,sides=8,samples=1,closed=True,smooth_path=False),Matrix.Identity(4),'rim')

# Short curved eyebrow peak: no full-face chin bar, goggles or visor hiding eyes.
pv=[];pf=[];segments=24
for row in range(3):
    for i in range(segments+1):
        a=-.70+1.40*i/segments
        base=point(a,boundary(a))
        pv.append(base+Vector((row*.018*math.cos(a),row*.006*math.sin(a),-row*.006)))
for row in range(2):
    for i in range(segments):
        a=row*(segments+1)+i;pf.append(((a,a+1,a+segments+2,a+segments+1),'shell'))
# Solidify a separate swept surface, retaining the visibly thin peak edge.
count=len(pv);pv += [v-Vector((0,0,.003)) for v in pv]
pf += [(tuple(i+count for i in reversed(ids)),'rim') for ids,_ in list(pf)]
boundary_ids=list(range(segments+1))+[(r*(segments+1)+segments) for r in [1,2]]+list(range(3*(segments+1)-2,2*(segments+1)-1,-1))+[segments+1]
pf += [((a,b,b+count,a+count),'rim') for a,b in zip(boundary_ids,boundary_ids[1:]+boundary_ids[:1])]
add('short curved eyebrow peak',pv,pf)

# Flush circular ear hardware and small crown fasteners, not bulky headphones.
for side in (-1,1):
    hardware = Matrix.Translation((.011,side*.103,.125))@Matrix.Rotation(math.pi/2,4,'X')
    primitive('ear mounting recess',C.prim_cylinder(.012,.012,.003,seg=24),hardware,'rim')
    primitive('ear hardware ring',C.prim_torus(.0088,.0014,seg=24,sides=8),hardware@Matrix.Translation((0,0,-side*.002)),'metal')
    for x,z in [(.09,.183),(-.023,.223)]:
        primitive('small shell rivet',C.prim_sphere(.0025,seg=10,rings=6),Matrix.Translation((x,side*.069,z)),'metal')
    strap=[(.011,side*.105,.083),(.065,side*.084,.045),(.102,side*.048,.005),(.101,side*.012,-.009)]
    primitive('chin retention webbing',C.prim_tube(strap,.0035,sides=8,samples=3),Matrix.Identity(4),'strap')
helmet=builder.build();helmet.parent=arm;helmet.modifiers.new('Armature','ARMATURE').object=arm
helmet['openfaceParts']=json.dumps(parts)
assert fixed == {name:H.mesh_signature(bpy.data.objects[name]) for name in fixed}
assert rig_signature == {k:v for k,v in G.invariant_signature().items() if k!='materials'}
# Existing material graphs (including the accepted charcoal dye) must not change.
existing={m[0]:m for m in G.invariant_signature()['materials']}
assert all(existing[m[0]]==m for m in before['materials'])
P.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
def tree(ob,deps=None):
    if deps:
        ev=ob.evaluated_get(deps);me=ev.to_mesh()
        result=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons]);ev.to_mesh_clear();return result
    return BVHTree.FromPolygons([v.co for v in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons])
human=bpy.data.objects['rider:human head and neck']
rest_crossings=tree(helmet).overlap(tree(human))
crossing_centers=[]
for _,pi in rest_crossings:
    polygon=human.data.polygons[pi]
    crossing_centers.append(list(inverse@(sum((human.data.vertices[i].co for i in polygon.vertices),Vector())/len(polygon.vertices))))
samples=[]
for action in sorted(bpy.data.actions,key=lambda a:a.name):
    arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
    lo,hi=map(int,action.frame_range)
    for frame in sorted({lo,(lo+hi)//2,hi}):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        deps=bpy.context.evaluated_depsgraph_get()
        samples.append({'action':action.name,'frame':frame,'helmetHeadTriangleCrossings':len(tree(helmet,deps).overlap(tree(human,deps)))})
P.clear_pose(arm)
local=[inverse@v.co for v in helmet.data.vertices]
bpy.context.scene['heroOutfit']='openface'
bpy.context.scene['heroDesign']='street-openface; fixed rider_pro charcoal palette'
bpy.context.scene['heroLocalAO']=json.dumps({'distance':.025,'samples':32,'strength':.8})
OUT.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT.resolve()),compress=True)
report={'source':str(SOURCE),'sourceSha256':source_sha,'candidate':str(OUT),'candidateSha256':G.sha(OUT),'recipeSha256':G.sha(__file__),'reference':'assets/design/hero-targets/02-street-openface.png','headgearAuthoring':'Original procedural geometry, no new third-party geometry','inheritedLicenses':'docs/evidence/hero-r9-inputs/THIRD-PARTY.md','preservedBodyMeshes':list(fixed),'bodyMeshWeightAndOriginalMaterialParity':True,'rigActionsSocketsParity':True,'scalpHairHiddenUnderShell':hair_names,'headgearDimensionsMetres':[max(v[i] for v in local)-min(v[i] for v in local) for i in range(3)],'parts':parts,'topology':G.topology(helmet.data),'restHeadCrossingPairs':len(rest_crossings),'crossingCentersHeadFrame':crossing_centers,'poseSamples':samples,'visualStatus':'Candidate only; parent must play and judge; no runtime fifth-preset activation'}
ROOT.mkdir(exist_ok=True);(ROOT/'source-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['poseSamples','parts','crossingCentersHeadFrame']},indent=2))
print('CROSSING_CENTERS',crossing_centers[:20])
assert source_sha == G.sha(SOURCE)
