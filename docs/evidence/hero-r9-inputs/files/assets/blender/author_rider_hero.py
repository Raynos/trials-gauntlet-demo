"""Whole-outfit hero tailoring on protected R7/R8 sources; fresh scratch output only.

Blender -b --python assets/blender/author_rider_hero.py -- --source INPUT.blend --output
harness/out/blender/mega-outfits/street-v1.blend
Retains skeleton/actions/sockets/helmet and contact geometry. Applied subdivision supplies
cloth folds; sewn projected panels inherit local garment weights. No source generation.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
import common as C
import author_garments as G
import author_hood as H
import rider_asset as P


def material(name, color, rough=.8, scale=600, cw=None, dark=.0):
    m=C.new_mat(name, (*color,1), rough=rough)
    base=C.cw_rgb(m,cw) if cw else (*color,1)
    noise=C.noise_fac(m,scale=22,detail=3)
    base=C.mix_rgb(m,C.math_node(m,'MULTIPLY',noise,.18),base,tuple(c*.52 for c in color)+(1,))
    if dark:base=C.mix_rgb(m,dark,base,(.012,.018,.023,1))
    C.link(m,base,C.bsdf(m).inputs['Base Color'])
    fine=C.noise_fac(m,scale=scale,detail=2)
    wave=C.node(m,'ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='DIAGONAL';wave.inputs['Scale'].default_value=scale*.38
    C.link(m,C.texcoord(m).outputs['Object'],wave.inputs['Vector'])
    height=C.math_node(m,'MULTIPLY',fine,wave.outputs['Fac'])
    bump=C.node(m,'ShaderNodeBump');bump.inputs['Strength'].default_value=.23;bump.inputs['Distance'].default_value=.00065
    C.link(m,height,bump.inputs['Height']);C.link(m,bump.outputs['Normal'],C.bsdf(m).inputs['Normal'])
    C.link(m,C.math_node(m,'MULTIPLY_ADD',noise,.08,rough-.04),C.bsdf(m).inputs['Roughness'])
    return m


def bind(ob,arm):
    mod=ob.modifiers.new('rig','ARMATURE');mod.object=arm;ob.parent=arm
    P.normalize_skin_weights(ob)
    return ob


def weights(ob, vertex):
    return {ob.vertex_groups[g.group].name:g.weight for g in vertex.groups if g.weight>1e-8}


def sculpt(ob, arm, outfit, trousers=False):
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    mod=ob.modifiers.new('cloth sampling','SUBSURF');mod.subdivision_type='SIMPLE';mod.levels=1
    bpy.ops.object.modifier_apply(modifier=mod.name);P.normalize_skin_weights(ob)
    pelvis=arm.data.bones['pelvis'];t=(pelvis.tail_local-pelvis.head_local).normalized();front=Vector((t.z,0,-t.x))
    for v in ob.data.vertices:
        ws=weights(ob,v);dominant=max(ws,key=ws.get);co=v.co.copy()
        if trousers:
            side='L' if co.y<0 else 'R';bone=arm.data.bones['thigh.'+side]
            axis=(bone.tail_local-bone.head_local).normalized();u=(co-bone.head_local).dot(axis)
            # Relaxed straight denim; fitted race thigh with an articulated knee.
            if .09<u<.39:
                radial=co-(bone.head_local+axis*u)
                factor=math.sin(math.pi*(u-.09)/.30)**2
                v.co+=radial.normalized()*(.0035 if outfit=='street' else -.004)*factor
            knee=arm.data.bones['shin.'+side].head_local
            d=(co-knee).length
            if d<.22:
                n=v.normal.copy();phase=(co-knee).dot(axis)*110+co.y*20
                envelope=math.exp(-((d-.115)/.07)**2)
                v.co+=n*(.0038 if outfit=='street' else .002)*math.sin(phase)*envelope
        elif dominant in ('pelvis','spine','chest'):
            rel=co-pelvis.head_local;u=rel.dot(t);depth=rel.dot(front)
            if -.07<u<.39:
                env=math.sin(math.pi*(u+.07)/.46)**2
                # Two asymmetric compression folds at the bent waist, quieter chest.
                fold=.005*math.sin(u*57+co.y*12)*math.exp(-((u-.075)/.17)**2)
                v.co+=v.normal*fold
                if outfit=='street':v.co+=front*.009*env*max(0,depth/.15)
                else:v.co.y*=1-.045*env
        elif dominant.startswith(('upperArm','forearm')):
            side=dominant.split('.')[-1];el=arm.data.bones['forearm.'+side].head_local;wr=arm.data.bones['hand.'+side].head_local
            axis=(wr-el).normalized();u=(co-el).dot(axis)
            # Sleeve bunching follows elbow and wrist, leaving the actual cuff anchors.
            env=math.exp(-((u-.035)/.083)**2)+.55*math.exp(-((u-.20)/.042)**2)
            v.co+=v.normal*(.0065 if outfit=='street' else .003)*math.sin(u*100+co.y*16)*env
            if outfit=='street':
                bone=arm.data.bones[dominant];d=(bone.tail_local-bone.head_local).normalized();along=(co-bone.head_local).dot(d);radial=co-(bone.head_local+d*along)
                wrist_fade=max(0,min(1,(co-wr).length/.13))
                v.co+=radial.normalized()*.009*wrist_fade
            else:v.co+=v.normal*.003*env
    ob.data.update()


class Surface:
    def __init__(self,ob,arm):
        self.ob=ob;self.arm=arm
        self.tree=BVHTree.FromPolygons([v.co for v in ob.data.vertices],[p.vertices for p in ob.data.polygons],all_triangles=False)
    def sample(self, point, outward, lift=.003):
        hit,n,idx,d=self.tree.ray_cast(point+outward*.50,-outward,1)
        if hit is None:
            hit,n,idx,d=self.tree.find_nearest(point)
            if hit is None or d>.18:raise RuntimeError('Panel missed '+self.ob.name+' '+str(point))
        poly=self.ob.data.polygons[idx];nearest=sorted(poly.vertices,key=lambda i:(self.ob.data.vertices[i].co-hit).length)[:4]
        total={};den=0
        for vi in nearest:
            f=1/max(.00001,(self.ob.data.vertices[vi].co-hit).length)**2;den+=f
            for k,w in weights(self.ob,self.ob.data.vertices[vi]).items():total[k]=total.get(k,0)+w*f
        total=sorted(total.items(),key=lambda x:-x[1])[:4];s=sum(w for k,w in total)
        return hit+n*lift,{k:w/s for k,w in total},n
    def panel(self,b,name,center,u,v,normal,outline,mat,lift=.004,bulge=.002,rows=5,cols=8,seam=None):
        # Bilinear four-corner textile patch, subdivided so it follows skinning.
        p=[Vector(x) for x in outline];verts=[];allw=[]
        for iy in range(rows+1):
            y=iy/rows
            for ix in range(cols+1):
                x=ix/cols;uv=p[0].lerp(p[1],x).lerp(p[3].lerp(p[2],x),y)
                co,w,n=self.sample(center+u*uv.x+v*uv.y,normal,lift+bulge*math.sin(math.pi*x)*math.sin(math.pi*y))
                verts.append(co);allw.append(w)
        first=len(b.bm.verts)
        bv=[b.bm.verts.new(co) for co in verts];b.bm.verts.index_update()
        for ve,w in zip(bv,allw):b.groups[ve.index]=w
        for iy in range(rows):
            for ix in range(cols):
                a=iy*(cols+1)+ix;f=b.bm.faces.new([bv[i] for i in (a,a+1,a+cols+2,a+cols+1)]);f.material_index=b.mat_index(mat);f.smooth=True
        if seam:
            boundary=[i for i in range(cols+1)]+[i*(cols+1)+cols for i in range(1,rows+1)]+[rows*(cols+1)+i for i in reversed(range(cols))]+[i*(cols+1) for i in reversed(range(1,rows))]
            self.seam(b,[verts[i] for i in boundary]+[verts[0]],seam,normal,.0011,project=False)
    def seam(self,b,points,mat,outward,radius=.0012,project=True):
        samples=[];ww=[]
        for p in points:
            c,w,n=self.sample(Vector(p),outward,.0045) if project else (Vector(p),self.sample(Vector(p),outward,0)[1],outward)
            samples.append(c);ww.append(w)
        geom=C.prim_tube(samples,radius,sides=5,samples=1)
        def wg(co):return ww[min(range(len(samples)),key=lambda i:(co-samples[i]).length)]
        b.add(geom,Matrix.Identity(4),mat,group=wg);geom.free()


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(__file__).resolve().parents[2];out=args.output.resolve();source=args.source.resolve()
    if not out.is_relative_to(root/'harness/out/blender/mega-outfits') or out.exists() or source==out:raise RuntimeError('Fresh mega-outfits scratch output required')
    hashes={str(f):G.sha(f) for f in (root/'assets/blender/source').glob('*.blend')}
    bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
    invariant={k:v for k,v in G.invariant_signature().items() if k!='materials'};helmet=H.mesh_signature(bpy.data.objects['rider:constructed_helmet']);outfit=bpy.context.scene['heroOutfit'];street=outfit=='street'
    top=bpy.data.objects['rider:hoodie' if street else 'rider:upper-garment'];pants=bpy.data.objects['rider:denim' if street else 'rider:pants']
    sculpt(top,arm,outfit);sculpt(pants,arm,outfit,True)
    mats={
      'cotton':material('hero heavy cotton',(.33,.18,.065),.91,410,'JA'),
      'rib':material('hero knitted rib',(.12,.12,.105),.92,380,'JA',.27),
      'denim':material('hero indigo twill',(.035,.085,.14),.84,720,'PA'),
      'denim_panel':material('hero denim pocket',(.045,.105,.16),.84,720,'PA',.07),
      'thread':material('hero tobacco topstitch',(.29,.18,.073),.88,650),
      'black':material('hero stretch gusset',(.016,.021,.027),.91,780),
      'race':material('hero technical textile',(.065,.085,.11),.72,910,'JB',.20),
      'guard':material('hero moulded protection',(.025,.031,.039),.43,230),
      'edge':material('hero reflective binding',(.33,.36,.36),.48,750),
      'shoe':material('hero suede reinforcement',(.07,.085,.089),.92,510),
    }
    if street:
        top.data.materials[0]=mats['cotton'];pants.data.materials[0]=mats['denim']
    ribidx=len(top.data.materials);top.data.materials.append(mats['rib' if street else 'black'])
    pelvis=arm.data.bones['pelvis'];H0=pelvis.head_local;t=(pelvis.tail_local-H0).normalized();f=Vector((t.z,0,-t.x));lat=Vector((0,1,0))
    # Rib waistband and wrist cuffs are part of the continuous shell, no floating rings.
    for p in top.data.polygons:
        c=p.center;u=(c-H0).dot(t)
        if -.085<u<-.018 and abs(c.y)<.23:p.material_index=ribidx
        for side in ('L','R'):
            wr=arm.data.bones['hand.'+side].head_local
            if (c-wr).length<.08:p.material_index=ribidx
    b=C.MeshBuilder('rider:hero garment construction');TS=Surface(top,arm);PS=Surface(pants,arm)
    if street:
        TS.panel(b,'kangaroo',H0+t*.13,lat,t,f,[(-.115,-.065),(.115,-.065),(.075,.065),(-.075,.065)],mats['cotton'],.006,.008,seam=mats['rib'])
        # Pocket hand openings, a doubled topstitched line and jersey side seam.
        for sign in (-1,1):
            TS.seam(b,[H0+t*u+lat*(sign*y) for u,y in ((.20,.075),(.17,.10),(.135,.115))],mats['rib'],f,.0024)
            TS.seam(b,[H0+t*u+lat*sign*.17 for u in (-.03,.03,.11,.20,.29,.36)],mats['rib'],lat*sign,.0012)
        # Flat drawcords follow the hoodie front and remain safely below the chin guard.
        for sign in (-1,1):
            TS.seam(b,[H0+t*u+lat*sign*y for u,y in ((.51,.045),(.46,.038),(.40,.045),(.355,.04))],mats['edge'],f,.0021)
    else:
        # Underarm ventilation and contrasting race jersey side panels.
        for sign in (-1,1):
            TS.panel(b,'vented flank',H0+t*.19,f,t,lat*sign,[(-.07,-.18),(.07,-.13),(.06,.16),(-.08,.18)],mats['black'],.003,.001,seam=mats['race'])
    for side,sign in (('L',-1),('R',1)):
        thigh=arm.data.bones['thigh.'+side];a=(thigh.tail_local-thigh.head_local).normalized();outward=Vector((0,sign,0));across=a.cross(outward).normalized()
        # Outer leg seam breaks the cylinder silhouette with continuous construction.
        center=thigh.head_local+a*.245
        PS.seam(b,[thigh.head_local+a*u for u in (.07,.12,.18,.24,.30,.36)],mats['thread' if street else 'edge'],outward,.0012)
        if street:
            PS.panel(b,'jean rear pocket',thigh.head_local+a*.105,lat,a,-Vector((-a.z,0,a.x)).normalized(),[(-.048,-.025),(.048,-.025),(.041,.076),(-.038,.084)],mats['denim_panel'],.004,.001,seam=mats['thread'])
            PS.seam(b,[thigh.head_local+a*u+across*v for u,v in ((.05,-.025),(.08,.008),(.12,.033),(.17,.036))],mats['thread'],outward,.0013)
        else:
            PS.panel(b,'articulated outer thigh',center,across,a,outward,[(-.046,-.105),(.049,-.08),(.039,.09),(-.037,.12)],mats['race'],.004,.003,seam=mats['edge'])
            knee=arm.data.bones['shin.'+side].head_local
            # Knee pad follows the actual garment bend, with textile expansion channels.
            kn=(knee-thigh.head_local).normalized();kf=Vector((-kn.z,0,kn.x)).normalized()
            PS.panel(b,'knee protection',knee,lat,kn,kf,[(-.050,-.083),(.050,-.083),(.049,.053),(-.049,.053)],mats['guard'],.005,.006,seam=mats['race'])
        # Sleeve seams and elbow reinforcement follow the skinned shell.
        ua=arm.data.bones['upperArm.'+side];axis=(ua.tail_local-ua.head_local).normalized();cross=axis.cross(outward).normalized()
        TS.seam(b,[ua.head_local+axis*u for u in (.075,.13,.19,.24,.29)],mats['rib' if street else 'edge'],outward,.00125)
        if not street:
            TS.panel(b,'elbow stretch',ua.tail_local-axis*.015,cross,axis,outward,[(-.035,-.070),(.035,-.070),(.033,.03),(-.033,.03)],mats['black'],.004,.004,seam=mats['race'])
    garment=bind(b.build(),arm)
    # Give the footwear a real layered welt, heel counter, toe rand and side panels.
    b=C.MeshBuilder('rider:hero footwear construction')
    for side,sign in (('L',-1),('R',1)):
        ankle=arm.data.bones['foot.'+side].head_local;xf=Matrix.Translation(ankle);group='foot.'+side
        for sg in (-1,1):
            line=[(-.085,sg*.045,-.054),(-.035,sg*.061,-.054),(.06,sg*.067,-.054),(.15,sg*.058,-.055),(.205,sg*.033,-.058)]
            geom=C.prim_tube(line,.003,sides=6,samples=2);b.add(geom,xf,mats['edge' if street else 'black'],group=group);geom.free()
            # Suede/synthetic quarter panels sit on actual upper shell.
            shoe=bpy.data.objects.get('rider:trainer_upper' if street else 'rider:boots')
            SS=Surface(shoe,arm)
            if street:
                SS.panel(b,'shoe quarter',ankle+Vector((.012,0,-.005)),Vector((1,0,0)),Vector((0,0,1)),Vector((0,sg,0)),[(-.065,-.030),(.07,-.027),(.025,.016),(-.045,.034)],mats['shoe'],.002,.001,rows=3,cols=5,seam=mats['edge'])
        # Toe bumper has a thin upper edge and small forefoot grooves, avoiding sole anchor changes.
        for x in (.143,.166,.187):
            geom=C.prim_tube([(x,-.040,-.045),(x,0,-.041),(x,.040,-.045)],.0016,sides=5,samples=1);b.add(geom,xf,mats['black'],group=group);geom.free()
    footwear=bind(b.build(),arm)
    # Knuckle islands and finger seams make the articulated gripping glove readable.
    b=C.MeshBuilder('rider:hero glove construction')
    for side in ('L','R'):
        grip=arm.data.bones['hand.'+side].head_local
        for y in (-.031,-.010,.011,.031):
            geom=C.prim_box(.018,.015,.006,bevel=.003,segments=2)
            b.add(geom,Matrix.Translation(grip+Vector((-.004,y,.028))),mats['guard'],group='hand.'+side);geom.free()
        geom=C.prim_tube([(-.040,-.033,.028),(-.048,0,.035),(-.040,.033,.028)],.0014,sides=5,samples=2)
        b.add(geom,Matrix.Translation(grip),mats['edge'],group='hand.'+side);geom.free()
    glove=bind(b.build(),arm)
    assert invariant=={k:v for k,v in G.invariant_signature().items() if k!='materials'},'rig/actions/sockets modified'
    assert helmet==H.mesh_signature(bpy.data.objects['rider:constructed_helmet']),'helmet modified'
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
    # Evaluate every clip at five positions: finite geometry and no dropped skin bindings.
    checks={}
    for track in arm.animation_data.nla_tracks:track.mute=True
    for action in bpy.data.actions:
        arm.animation_data.action=action;frames=[action.frame_range[0]+i*(action.frame_range[1]-action.frame_range[0])/4 for i in range(5)]
        for frame in frames:
            bpy.context.scene.frame_set(int(frame));deps=bpy.context.evaluated_depsgraph_get()
            for ob in meshes:
                evaluated=ob.evaluated_get(deps);me=evaluated.to_mesh()
                assert all(math.isfinite(c) for v in me.vertices for c in v.co)
                evaluated.to_mesh_clear()
        checks[action.name]=frames
    P.clear_pose(arm)
    C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie'])
    out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
    assert hashes=={p:G.sha(p) for p in hashes}
    report=dict(source=str(source),source_sha256=G.sha(source),output=str(out),output_sha256=G.sha(out),script_sha256=G.sha(__file__),outfit=outfit,rig_actions_sockets_and_helmet_unchanged=True,pose_samples=checks,meshes={o.name:dict(vertices=len(o.data.vertices),triangles=sum(len(p.vertices)-2 for p in o.data.polygons)) for o in meshes},protected_sources=hashes)
    out.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':main()
