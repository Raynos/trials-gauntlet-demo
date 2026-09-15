"""Scratch-only constructed motocross helmet replacement, on the existing head rig.

Preserves every non-head vertex/face/weight and every material graph. Does not
export or promote. Run with Blender --background --python-exit-code 1 --python
assets/blender/author_helmet.py -- --source ... --output harness/out/blender/r8-helmet/....blend
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import author_garments as G
import author_hood as H
import common as C
import rider_forms as F


def head_ids(ob):
    group = ob.vertex_groups.get('head')
    return {v.index for v in ob.data.vertices if group and any(g.group == group.index and g.weight > 0 for g in v.groups)}


def construct(arm):
    up = (arm.data.bones['head'].tail_local-arm.data.bones['head'].head_local).normalized()
    front = Vector((up.z, 0, -up.x))
    center = arm.data.bones['head'].head_local + up*.12
    transform = Matrix(((front.x, 0, up.x, center.x), (0, 1, 0, center.y),
                        (front.z, 0, up.z, center.z), (0, 0, 0, 1)))
    transform = transform @ Matrix.Translation((.01, 0, .018)) @ Matrix.Rotation(-.17, 4, 'Y')
    builder = C.MeshBuilder('rider:constructed_helmet')
    mats = {name: bpy.data.materials[name] for name in ('helmet', 'armour', 'visor', 'gloves')}
    parts = []

    def add(name, vertices, faces):
        start = len(builder.bm.verts)
        F.mesh(builder, vertices, faces, transform, mats, 'head')
        parts.append(dict(name=name, first=start, count=len(vertices)))

    # Continuous skull/jaw skin: two curved eyeport boundaries, not a square
    # subtraction from a lathe. Angular cheek recess and projected mouth are
    # part of the same outer shell. The shell remains open only at the neck.
    n = 64
    profiles = [(-.143,.77),(-.128,.88),(-.105,.96),(-.050,1),(.057,1),
                (.087,.94),(.119,.79),(.145,.56),(.159,.28),(.162,.035)]
    vertices = []
    for row,(z,r) in enumerate(profiles):
        for i in range(n):
            a = math.tau*i/n; co=math.cos(a); si=math.sin(a); f=max(0,co)
            x=.158*r*co; y=.130*r*si
            if row < 4:
                x += (.060,.071,.077,.055)[row]*f**5
                # Jaw rises into a shallow nose guard and sweeps up to temples.
                zz=z + (.008,.005,0,-.015)[row]*f**2
                y*=1-.08*f**4
            else:
                zz=z
                if row==4: zz+=.012*f**2-.010*abs(si)**4
                # Twin shallow crown ridges are in the shell surface.
                if 5<=row<=8:
                    zz+=.006*math.exp(-((abs(y)-.045)/.016)**2)
            vertices.append((x,y,zz))
    outside=[]; boundaries={}; vent=[]
    for row in range(len(profiles)-1):
        for i in range(n):
            a=math.tau*(i+.5)/n
            if row==3 and math.cos(a)>.29: continue
            q=(row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i)
            # Actual mouth inlet, with an inset floor and four wall strips.
            if row==1 and math.cos(a)>.925:
                vent.append(q)
            else: outside.append((q,'helmet'))
            for j,k in zip(q,q[1:]+q[:1]):
                key=tuple(sorted((j,k)))
                if key in boundaries: del boundaries[key]
                else: boundaries[key]=(j,k)
    offset=len(vertices)
    vertices += [(x*.955,y*.955,z*.975) for x,y,z in vertices]
    faces=list(outside)+[(tuple(v+offset for v in reversed(q)),'armour') for q,_ in outside]
    top_start=(len(profiles)-1)*n
    faces += [((a,b,b+offset,a+offset),'armour') for a,b in boundaries.values() if not(a>=top_start and b>=top_start)]
    faces += [(tuple((len(profiles)-1)*n+i for i in range(n)),'helmet')]
    faces += [(tuple(reversed([offset+top_start+i for i in range(n)])),'armour')]
    # A blind pocket has its own floor, ahead of the continuous inner liner.
    # Sharing its floor with the liner would create three faces at every rim
    # edge, so retain the liner and inset a separate outer-surface patch.
    pocket={}
    for i in sorted({v for q in vent for v in q}):
        x,y,z=vertices[i];pocket[i]=len(vertices)
        vertices.append((x-.006,y,z))
    vent_edges={}
    for q in vent:
        faces.append((tuple(v+offset for v in reversed(q)),'armour'))
        faces.append((tuple(pocket[v] for v in q),'gloves'))
        for a,b in zip(q,q[1:]+q[:1]):
            key=tuple(sorted((a,b)))
            if key in vent_edges:del vent_edges[key]
            else:vent_edges[key]=(a,b)
    faces += [((a,b,pocket[b],pocket[a]),'armour') for a,b in vent_edges.values()]
    add('shell and recessed chin inlet',vertices,faces)

    # Curved, thin three-dimensional peak. Crosswise arch and turned-down
    # leading corners avoid the original flat polygon board silhouette.
    stations=[(.020,.115,.162),(.070,.140,.148),(.130,.148,.119),(.200,.136,.095),(.244,.119,.081),(.270,.097,.074)]
    v=[]; cross=12
    for x,w,z in stations:
        for j in range(cross+1):
            t=-1+2*j/cross
            v.append((x-.020*abs(t)**3,w*t,z+.012*(1-t*t)))
    count=len(v);v += [(x,y,z-.004) for x,y,z in v]
    f=[];edges={}
    for i in range(len(stations)-1):
        for j in range(cross):
            q=(i*(cross+1)+j,i*(cross+1)+j+1,(i+1)*(cross+1)+j+1,(i+1)*(cross+1)+j)
            f += [(q,'helmet'),(tuple(k+count for k in reversed(q)),'armour')]
            for a,b in zip(q,q[1:]+q[:1]):
                key=tuple(sorted((a,b)))
                if key in edges:del edges[key]
                else:edges[key]=(a,b)
    f += [((a,b,b+count,a+count),'helmet') for a,b in edges.values()]
    add('arched peak',v,f)
    for sign in (-1,1):
        # Small solid webs connect the peak underside to the temple shell.
        outline=[Vector(p) for p in ((.018,sign*.120,.080),(.070,sign*.138,.146),(.130,sign*.146,.116))]
        normal=(outline[1]-outline[0]).cross(outline[2]-outline[0]).normalized()
        v=[tuple(p) for p in outline]+[tuple(p+normal*.004) for p in outline]
        f=[((0,1,2),'helmet'),((5,4,3),'helmet')]+[((i,(i+1)%3,(i+1)%3+3,i+3),'helmet') for i in range(3)]
        add('peak temple support '+str(sign),v,f)

    # The goggle assembly has a rounded polygon outline with a proper nose
    # cutout, an inset lens, a narrow hard rim and a deeper soft seal.
    outline=[(-.112,-.013),(-.102,-.036),(-.083,-.047),(-.037,-.043),(-.017,-.027),(0,-.022),
             (.017,-.027),(.037,-.043),(.083,-.047),(.102,-.036),(.112,-.013),(.106,.023),
             (.088,.038),(.040,.045),(0,.047),(-.040,.045),(-.088,.038),(-.106,.023)]
    def point(y,z,depth):return (.174-4.8*y*y+depth,y,z)
    rings=[]
    for sy,sz,depth in ((1.07,1.12,-.011),(1.055,1.06,-.001),(1,1,.004),(.88,.76,.004),(.88,.76,-.001)):
        rings.append([point(y*sy,z*sz,depth) for y,z in outline])
    v=sum(rings,[]);n=len(outline);f=[]
    for row,mat in enumerate(('gloves','helmet','armour','armour')):
        for j in range(n):f.append(((row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j),mat))
    v.append(point(0,.004,-.001))
    for j in range(n):f.append(((4*n+j,4*n+(j+1)%n,5*n),'visor'))
    add('goggle seal rim and lens',v,f)
    # Strap follows the actual rear shell width with flush temple outriggers.
    v=[];n=40
    for i in range(n+1):
        a=math.radians(68+224*i/n)
        for z in (-.022,.008):v.append((.161*math.cos(a),.133*math.sin(a),z))
    add('woven rear strap',v,[((2*i,2*i+1,2*i+3,2*i+2),'gloves') for i in range(n)])
    for s in (-1,1):
        add('goggle strap outrigger '+str(s),[(.114,s*.120,-.019),(.115,s*.120,.009),(.061,s*.124,.008),(.061,s*.124,-.022)], [((0,1,2,3),'armour')])

    ob=builder.build();ob.parent=arm;ob.modifiers.new('Armature','ARMATURE').object=arm
    ob['author_helmet_parts']=json.dumps(parts)
    return ob,parts


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=a.source.resolve();output=a.output.resolve()
    root=Path(__file__).resolve().parents[2]
    if not output.is_relative_to(root/'harness/out/blender/r8-helmet') or output.exists() or source==output:raise RuntimeError('Fresh r8-helmet scratch output required')
    protected={str(f):G.sha(f) for f in (root/'assets/blender/source').glob('*.blend')};source_hash=G.sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];G.pipeline.clear_pose(arm)
    signature=G.invariant_signature();retained={};removed={}
    for ob in list(bpy.data.objects):
        if ob.type!='MESH':continue
        ids=head_ids(ob);other=set(range(len(ob.data.vertices)))-ids
        if other:retained[ob.name]=H.mesh_signature(ob,other)
        if not ids:continue
        removed[ob.name]=len(ids)
        if not other:bpy.data.objects.remove(ob,do_unlink=True);continue
        bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.verts[i] for i in ids],context='VERTS');bm.to_mesh(ob.data);bm.free()
    candidate,parts=construct(arm)
    assert signature==G.invariant_signature()
    assert retained=={name:H.mesh_signature(bpy.data.objects[name]) for name in retained}
    G.pipeline.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
    assert all(len(v.groups)==1 and v.groups[0].weight==1 for v in candidate.data.vertices)
    candidate.data.calc_loop_triangles();audit=[]
    for action in sorted(bpy.data.actions,key=lambda x:x.name):
        arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
        lo,hi=map(int,action.frame_range);max_error=0
        for frame in range(lo,hi+1):
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            ev=candidate.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
            assert all(math.isfinite(c) for v in mesh.vertices for c in v.co)
            # Rigid head ownership must preserve every edge through every clip.
            for edge in candidate.data.edges:
                i,j=edge.vertices;base=(candidate.data.vertices[i].co-candidate.data.vertices[j].co).length
                max_error=max(max_error,abs((mesh.vertices[i].co-mesh.vertices[j].co).length-base))
            ev.to_mesh_clear()
        audit.append(dict(action=action.name,frames=hi-lo+1,max_edge_length_error=max_error))
    G.pipeline.clear_pose(arm)
    topology=G.topology(candidate.data)
    print('HELMET_TOPOLOGY',json.dumps(topology))
    assert not topology['degenerate_faces'] and not topology['nonmanifold_interior_edges']
    assert max(r['max_edge_length_error'] for r in audit)<1e-5
    output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    assert source_hash==G.sha(source) and protected=={f:G.sha(f) for f in protected}
    report=dict(source=str(source),source_sha256=source_hash,candidate_sha256=G.sha(output),script_sha256=G.sha(__file__),removed_head_vertices=removed,retained_mesh_signatures=retained,invariants_unchanged=True,source_check=True,parts=parts,topology=topology,motion=audit,contact_exceptions=['Peak temple webs deliberately seat into shell and peak underside','Goggle soft seal, outriggers and strap meet shell; separate material surfaces at these manufactured joins'],visual_verdict='Parent must judge played motion; no quality claim')
    output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))


if __name__=='__main__':main()
