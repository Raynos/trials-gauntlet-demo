"""Scratch-only trials chassis reconstruction; existing articulation is retained.

blender -b --python assets/blender/author_bike_hero.py -- [--lod] [--size 1024]
Outputs editable source and derived runtime GLBs under harness/out/blender/mega-bike.
No protected source, runtime catalogue or public model is written.
"""
import os
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import bmesh
from mathutils import Matrix, Vector
import build_bike as B
import common as C
from common import V, MeshBuilder

OUT = Path(__file__).resolve().parents[2] / 'harness/out/blender/mega-bike'
V2 = '--mechanical-v2' in sys.argv
SUFFIX = '-v2' if V2 else ''
for part in ('models'+SUFFIX, 'textures'+SUFFIX, 'generated'+SUFFIX, 'source'+SUFFIX):
    (OUT / part).mkdir(parents=True, exist_ok=True)
C.HERE = str(OUT / ('generated'+SUFFIX))
C.MODELS = str(OUT / ('models'+SUFFIX))
C.BAKE_DIR = str(OUT / ('textures'+SUFFIX))

# The familiar classes become a coherent factory blue/white and carbon/yellow team.
B.COLOURWAYS['rookie'].update(PAINT=(0.018, .095, .54), FRAME=(.035,.055,.075), PLATE=(.89,.92,.94), LOGO=(.91,.95,1))
B.COLOURWAYS['pro'].update(PAINT=(.025,.028,.031), FRAME=(.07,.075,.078), PLATE=(1,.69,.015), LOGO=(1,.69,.015))
original_materials = B.make_materials

def make_materials():
    m = original_materials()
    # Solid race fields are material regions, not fragile millimetre surface decals.
    m['race'] = C.new_mat('hero_factory_race_field', rough=.31, metal=.03)
    race_col = C.cw_rgb(m['race'], 'PLATE')
    for sign in (-1, 1):
        race_col = C.decal(m['race'], race_col, B.SHEET, B._DC['vortex'],
            V(.811, sign*.111, .613), V(1 if sign < 0 else -1,0,0), V(0,0,1),
            .129,.024,C.cw_rgb(m['race'],'INK'), facing=V(0,sign,0),min_facing=.5,depth=.01)
    C.link(m['race'], race_col, C.bsdf(m['race']).inputs['Base Color'])
    m['chassis'] = C.new_mat('hero_forged_aluminium', (.36,.40,.43,1), rough=.28, metal=.96)
    C.bump(m['chassis'], C.noise_fac(m['chassis'], scale=450, detail=1), strength=.08, distance=.00025)
    m['engine_cover'] = C.new_mat('hero_magnesium_cover', (.115,.13,.14,1), rough=.43, metal=.86)
    m['tank'] = B.paint_material('hero_tank_paint', 'PAINT')
    m['white'] = B.plate_material()
    return m
B.make_materials = make_materials

def shell(builder, stations, material, power=4):
    """Manufactured folded cross section, with soft bevel-sized corner facets."""
    rings = [B.superellipse_ring(V(x,0,z), w,h,n=12,power=power) for x,z,w,h in stations]
    bm = B.loft(rings)
    builder.add(bm, Matrix.Identity(4), material, sharp_angle=40)
    bm.free()

def panel(builder, pts, sign, y, thick, material):
    """Closed thin extruded polygon; point order is repaired by bmesh normals."""
    bm=bmesh.new()
    aa=[bm.verts.new((x,sign*y,z)) for x,z in pts]
    bb=[bm.verts.new((x,sign*(y+thick),z)) for x,z in pts]
    bm.faces.new(aa); bm.faces.new(list(reversed(bb)))
    for i in range(len(pts)):
        j=(i+1)%len(pts); bm.faces.new((aa[i],bb[i],bb[j],aa[j]))
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    builder.add(bm,Matrix.Identity(4),material,smooth=False,sharp_angle=30)
    bm.free()

def build_bodywork(m):
    b=MeshBuilder('bodywork')
    # Tank is a short wedge, not the old single sausage extending over the wheel.
    shell(b,[(.98,.690,.042,.013),(.90,.696,.075,.041),(.78,.66,.083,.055),(.64,.605,.074,.039),(.54,.567,.057,.016)],m['tank'])
    # Black tank spine and machined filler cap.
    shell(b,[(.94,.731,.019,.004),(.86,.742,.033,.005),(.75,.711,.028,.004),(.65,.654,.018,.003)],m['black'])
    B.add_cyl(b,V(.85,0,.741),V(.85,0,.752),.027,mat=m['anod'],seg=16)
    B.add_box(b,V(.85,0,.755),(.030,.009,.005),m['alloy'],bevel=.002)
    # A tiny trials saddle exposes the frame below it; top follows the rider gap.
    shell(b,[(.60,.620,.044,.010),(.51,.585,.060,.014),(.37,.557,.068,.016),(.22,.547,.066,.015),(.11,.541,.052,.007)],m['seat'],3)
    # Long swept tail, nearly horizontal rather than wrapping down around tyre.
    shell(b,[(.29,.523,.067,.012),(.10,.517,.078,.012),(-.11,.493,.077,.011),(-.28,.468,.065,.009),(-.40,.437,.031,.005)],m['tank'])
    shell(b,[(.26,.539,.032,.002),(.08,.532,.041,.002),(-.12,.507,.043,.002),(-.29,.480,.032,.002),(-.38,.451,.013,.002)],m['race'])
    for s in (-1,1):
        # Upper and lower swept shroud sections leave a real open cooling slot.
        panel(b,[(.98,.66),(.90,.701),(.73,.647),(.61,.554),(.77,.546),(.88,.572)],s,.101,.008,m['tank'])
        panel(b,[(.91,.555),(.84,.56),(.70,.508),(.63,.438),(.77,.455),(.88,.501)],s,.117,.008,m['tank'])
        # Bold ascending stripe has enough area to survive the gameplay camera.
        panel(b,[(.925,.654),(.883,.678),(.726,.621),(.659,.565),(.749,.565),(.867,.609)],s,.110,.0015,m['race'])
        panel(b,[(.846,.541),(.785,.533),(.683,.468),(.746,.478),(.838,.518)],s,.126,.001,m['race'])
        # Rear numberboard stays in the legacy digit projection footprint.
        panel(b,[(.20,.505),(.075,.515),(-.085,.478),(-.13,.408),(.033,.392),(.17,.449)],s,.091,.008,m['white'])
        panel(b,[(.194,.505),(.070,.517),(-.085,.481),(-.10,.469),(.07,.500),(.177,.488)],s,.100,.001,m['tank'])
        # Real sidepanel fasteners, three anchor points rather than random bolts.
        for x,z,y in ((.894,.643,.112),(.738,.484,.127),(.147,.466,.101)):
            B.add_cyl(b,V(x,s*y,z),V(x,s*(y+.004),z),.006,mat=m['anod'],seg=6)
    return B.finish(b,(0,0,0))
B.build_bodywork=build_bodywork

def build_frame(m):
    b=MeshBuilder('frame')
    hb,ht,pv=B.P['head_bot'],B.P['head_top'],B.P['pivot']
    B.add_cyl(b,hb-B.FORK_DIR*.02,ht+B.FORK_DIR*.02,.032,mat=m['chassis'],seg=16)
    for s in (-1,1):
        # Cast perimeter spars: angular load path with open engine/shock windows.
        panel(b,[(1.02,.641),(.91,.621),(.68,.516),(.505,.299),(.445,.158),(.416,.139),(.426,.276),(.614,.551),(.874,.666),(1.005,.69)],s,.069,.025,m['chassis'])
        panel(b,[(.442,.233),(.469,.231),(.516,.099),(.491,.046),(.407,.057),(.401,.129)],s,.071,.028,m['chassis'])
        B.add_tube(b,[V(.443,s*.073,.063),V(.58,s*.085,.047),V(.81,s*.08,.061),V(.97,s*.052,.222)],.013,m['frame_paint'],sides=8,samples=3)
        B.add_tube(b,[V(.64,s*.065,.567),V(.38,s*.064,.506),V(.17,s*.065,.48)],.010,m['frame_paint'],sides=8,samples=2)
        B.add_tube(b,[V(.457,s*.074,.283),V(.29,s*.067,.429),V(.17,s*.065,.48)],.010,m['frame_paint'],sides=8,samples=2)
        for x,z in ((.433,.109),(.497,.279),(.96,.646)):
            B.add_cyl(b,V(x,s*.097,z),V(x,s*.105,z),.012,mat=m['anod'],seg=8)
            B.add_cyl(b,V(x,s*.105,z),V(x,s*.109,z),.005,mat=m['alloy'],seg=6)
        B.add_box(b,V(.52,s*.10,.06),(.06,.04,.03),m['anod'],bevel=.004)
    B.add_tube(b,[V(1.04,0,.50),V(.99,0,.355),V(.97,0,.222)],.021,m['frame_paint'],sides=10,samples=3)
    B.add_cyl(b,V(.43,-.093,.16),V(.43,.093,.16),.017,mat=m['anod'],seg=12)
    B.add_box(b,V(.73,0,.043),(.44,.205,.018),m['chassis'],bevel=.007)
    B.add_box(b,V(.955,0,.093),(.055,.205,.104),m['chassis'],bevel=.008,rot=Matrix.Rotation(.5,4,'Y'))
    # The radiator is an actual lamella stack visible through the cooling slot.
    B.add_box(b,V(.899,0,.505),(.045,.176,.202),m['black'],bevel=.004)
    for i in range(12 if not B.LOD else 6):
        z=.415+i*(.016 if not B.LOD else .032)
        B.add_box(b,V(.925,0,z),(.011,.174,.0035),m['alloy'],bevel=0)
    for z in (.395,.612):
        B.add_box(b,V(.90,0,z),(.06,.19,.027),m['anod'],bevel=.006)
    B.add_tube(b,[V(.895,-.069,.395),V(.85,-.075,.345),V(.75,-.071,.371)],.011,m['black'],sides=8,samples=4)
    return B.finish(b,(0,0,0))
B.build_frame=build_frame

original_engine=B.build_engine

def build_engine(m):
    # Preserve the visible single-cylinder/carb/case assembly, give its covers a
    # distinct magnesium finish and add the machined perimeter around the cases.
    mm=dict(m); mm['cast']=m['engine_cover']
    ob=original_engine(mm)
    b=MeshBuilder('engine_case_details')
    for s in (-1,1):
        for i in range(7):
            a=2*math.pi*i/7
            x=.66+.108*math.cos(a); z=.232+.105*math.sin(a)
            B.add_cyl(b,V(x,s*.132,z),V(x,s*.142,z),.0065,mat=m['alloy'],seg=6)
    extra=B.finish(b,(0,0,0))
    C.select_only([ob,extra]); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.join()
    return ob
B.build_engine=build_engine

def mechanical_materials(m):
    m['magnesium']=C.new_mat('hero_cast_magnesium',(.052,.063,.062,1),rough=.64,metal=.67)
    grain=C.noise_fac(m['magnesium'],scale=330,detail=2)
    C.bump(m['magnesium'],grain,strength=.17,distance=.00065)
    m['cast_light']=C.new_mat('hero_cast_cylinder',(.16,.185,.18,1),rough=.59,metal=.74)
    C.bump(m['cast_light'],C.noise_fac(m['cast_light'],scale=280,detail=2),strength=.13,distance=.00045)
    m['recess']=C.new_mat('hero_gasket_recess',(.012,.016,.016,1),rough=.79,metal=.12)
    m['machined']=C.new_mat('hero_machined_edge',(.36,.40,.39,1),rough=.32,metal=.95)
    m['titanium']=C.new_mat('hero_header_bronze',(.24,.17,.105,1),rough=.44,metal=.86)
    return m

def annulus(b,center,r,width,mat):
    bm=C.prim_torus(r,width,seg=24 if not B.LOD else 12,sides=6)
    b.add(bm,Matrix.Translation(center)@B.ROT_Z2Y,mat)
    bm.free()

def build_engine_v2(m):
    mechanical_materials(m)
    b=MeshBuilder('engine')
    # Compact asymmetric cast halves: transmission behind crank, barrel above.
    outline=[(.48,.175),(.48,.269),(.53,.340),(.635,.364),(.738,.350),(.802,.300),(.807,.218),(.755,.153),(.603,.137),(.524,.147)]
    panel(b,outline,1,-.108,.216,m['magnesium'])
    for sign in (-1,1):
        # Perimeter gasket is visible as a dark layer around each casting half.
        panel(b,[(.505,.184),(.502,.265),(.552,.320),(.639,.338),(.727,.329),(.777,.281),(.777,.222),(.735,.17),(.607,.157)],sign,.108,.009,m['recess'])
        panel(b,[(.514,.190),(.514,.260),(.556,.31),(.640,.326),(.724,.318),(.767,.278),(.765,.227),(.730,.181),(.61,.169)],sign,.117,.011,m['cast_light'])
        # Offset ignition (camera side) and larger clutch on far side.
        x,z,r=(.68,.255,.065) if sign<0 else (.68,.26,.082)
        B.add_cyl(b,V(x,sign*.128,z),V(x,sign*.138,z),r+ .006,mat=m['recess'],seg=24,sharp=35)
        B.add_cyl(b,V(x,sign*.138,z),V(x,sign*.146,z),r,mat=m['machined'],seg=24,sharp=35)
        B.add_cyl(b,V(x,sign*.146,z),V(x,sign*.152,z),r-.006,mat=m['magnesium'],seg=24,sharp=35)
        # Recessed flattened center avoids dome-shaped reflective highlights.
        B.add_box(b,V(x,sign*.153,z),(.058,.004,.020),m['recess'],bevel=.002,seg=1)
        for dz in (-.035,.034):
            B.add_box(b,V(x,sign*.155,z+dz),(.066,.005,.005),m['cast_light'],bevel=.001,seg=1)
        # Cast reinforcing ribs on transmission bulge, broad enough to read.
        for i in range(3):
            B.add_box(b,V(.551+i*.018,sign*.132,.246),(.007,.008,.093-i*.012),m['magnesium'],bevel=.002,seg=1)
        # Only structural fasteners at the casting extremities.
        for bx,bz in ((.538,.184),(.539,.286),(.729,.303),(.748,.204)):
            B.add_cyl(b,V(bx,sign*.130,bz),V(bx,sign*.135,bz),.0055,mat=m['machined'],seg=6,sharp=35)
    # Cylinder block has a separate dark gasket and deep cooling-fin intervals.
    lean=Matrix.Rotation(math.radians(-10),4,'Y')
    base=V(.727,0,.349); up=lean@V(0,0,1)
    B.add_box(b,base,(.142,.148,.024),m['recess'],bevel=.005,rot=lean)
    B.add_box(b,base+up*.086,(.111,.12,.158),m['magnesium'],bevel=.012,rot=lean)
    for i in range(6):
        B.add_box(b,base+up*(.022+i*.025),(.145,.160,.008),m['cast_light'],bevel=.007,rot=lean,seg=1)
    head=base+up*.184
    B.add_box(b,head,(.151,.165,.047),m['cast_light'],bevel=.008,rot=lean,seg=2)
    B.add_box(b,head+up*.027,(.13,.144,.005),m['recess'],bevel=.004,rot=lean,seg=1)
    B.add_box(b,head+up*.042,(.119,.136,.024),m['magnesium'],bevel=.005,rot=lean,seg=1)
    B.add_cyl(b,head+up*.055,head+up*.096,.012,mat=m['black'],seg=8,sharp=35)
    B.add_tube(b,[head+up*.094,V(.651,-.045,.641),V(.615,-.065,.61)],.004,m['black'],sides=6,samples=3)
    # Carburettor and corrugated rubber intake behind barrel.
    carb=V(.586,0,.438)
    B.add_cyl(b,carb+V(.045,0,0),carb-V(.018,0,0),.027,mat=m['cast_light'],seg=12,sharp=40)
    B.add_box(b,carb-V(0,0,.039),(.041,.047,.047),m['magnesium'],bevel=.004)
    B.add_tube(b,[carb-V(.018,0,0),V(.531,0,.438),V(.496,0,.481)],.026,m['black'],sides=10,samples=3)
    for x in (.565,.61):
        B.add_cyl(b,V(x,0,.438),V(x+.004,0,.438),.030,mat=m['machined'],seg=12,sharp=35)
    # Engine controls still attach to the same peg zone.
    B.add_tube(b,[V(.59,-.132,.182),V(.68,-.155,.131),V(.76,-.155,.133)],.006,m['machined'],sides=6,samples=2)
    B.add_cyl(b,V(.76,-.155,.133),V(.76,-.19,.133),.009,mat=m['rubber'],seg=8)
    B.add_tube(b,[V(.68,.139,.227),V(.69,.165,.331),V(.65,.165,.391)],.008,m['machined'],sides=6,samples=2)
    return B.finish(b,(0,0,0))

def build_exhaust_v2(m):
    b=MeshBuilder('exhaust')
    # Heat-darkened header and expanded collector follow the old outlet contract.
    pts=[V(.80,0,.50),V(.858,-.035,.474),V(.9,-.085,.401),V(.882,-.147,.30),V(.812,-.165,.209),V(.695,-.165,.162),V(.54,-.165,.179),V(.416,-.16,.263),V(.36,-.16,.34)]
    B.add_tube(b,pts,.019,m['titanium'],sides=12,samples=4,radius_fn=lambda u:.019+.019*math.sin(math.pi*u)**2)
    # Distinct heat shield following collector; slots are deep black insets.
    panel(b,[(.811,.266),(.734,.205),(.589,.197),(.563,.215),(.712,.235),(.79,.283)],-1,.197,.003,m['machined'])
    for x,z in ((.739,.225),(.704,.219),(.668,.214),(.632,.21)):
        panel(b,[(x-.009,z-.003),(x+.006,z-.003),(x+.015,z+.008),(x,z+.008)],-1,.2005,.001,m['recess'])
    # Flattened oval silencer with dark shell, bright end bands and outlet cap.
    rings=[]
    for x,z,w,h in ((.37,.35,.018,.020),(.328,.372,.037,.04),(.10,.428,.037,.039),(-.017,.443,.023,.027),(-.04,.445,.011,.013)):
        rings.append(B.superellipse_ring(V(x,-.165,z),w,h,n=12,power=3.3))
    bm=B.loft(rings);b.add(bm,Matrix.Identity(4),m['magnesium'],sharp_angle=40);bm.free()
    for x,z in ((.29,.383),(.08,.433)):
        B.add_box(b,V(x,-.203,z),(.018,.004,.056),m['machined'],bevel=.004,seg=1)
    B.add_cyl(b,V(-.017,-.165,.443),V(-.045,-.165,.445),.014,.010,m['machined'],seg=12,sharp=35)
    B.add_cyl(b,V(-.045,-.165,.445),V(-.046,-.165,.445),.007,mat=m['recess'],seg=12,sharp=35)
    return B.finish(b,(0,0,0))

if V2:
    B.build_engine=build_engine_v2
    B.build_exhaust=build_exhaust_v2

# Save the editable, multi-material assembly immediately before atlas derivation.
original_unwrap=C.unwrap_all
saved=False

def unwrap_and_save(*args,**kwargs):
    global saved
    if not saved:
        C.apply_colourway(B.COLOURWAYS['rookie'])
        bpy.context.scene['hero_author']='author_bike_hero.py'
        bpy.context.scene['hero_revision']='angular factory trials reconstruction'
        bpy.ops.file.pack_all()
        if not B.LOD:
            bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('source'+SUFFIX)/'bike-hero.blend'),compress=True)
        saved=True
    return original_unwrap(*args,**kwargs)
C.unwrap_all=unwrap_and_save
B.main()
