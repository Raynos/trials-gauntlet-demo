"""Bounded connected trouser reconstruction; scratch sources only, never publishes.

Retains exact cuffs and non-trouser meshes; tailors the waist and upper legs. Replaces the bent knee strip
with a broad cubic surface and grades joint weights by longitudinal position.
Uses the existing pelvis split seam, with a new continuous hip weight field.
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import author_garment_joints as J
import author_garments as G
import author_hood as H


def reconstruct(ob, arm):
    # Establish one waist / two cuff topology before replacing joint surfaces.
    J.connect_trousers(ob,arm,.100)
    bm=bmesh.new();bm.from_mesh(ob.data)
    layer=bm.verts.layers.deform.verify()
    region=bm.verts.layers.int.get('author_crotch')
    for cuff in [c for c in J.boundary_groups(bm) if len(c)==20]:
        rings=J.walk_rings(G.boundary_cycle(cuff),14)
        side='L' if J.center(cuff).y<0 else 'R'
        thigh=arm.data.bones['thigh.'+side]
        direction=(thigh.tail_local-thigh.head_local).normalized()
        # Both outfits end the knee strip on actual upper-thigh fabric, not
        # Race's shorter retained strip's curved crotch connector.
        end=min(range(9,14),key=lambda k:abs((J.center(rings[k])-thigh.head_local).dot(direction)-.285))
        a,b=rings[3],rings[end]
        c0,c3=J.center(a),J.center(b)
        d0=(J.center(rings[4])-J.center(rings[2])).normalized()
        d1=-direction
        c1,c2=c0+d0*.13,c3-d1*.13
        axes=[]
        for ring,c,tangent in ((a,c0,d0),(b,c3,d1)):
            u=(ring[0].co-c).normalized();u=(u-tangent*u.dot(tangent)).normalized()
            v=tangent.cross(u).normalized()
            if (ring[1].co-c).dot(v)<0:v=-v
            axes.append((u,v))
        material=a[0].link_faces[0].material_index
        bmesh.ops.delete(bm,geom=[v for r in rings[4:end] for v in r],context='VERTS')
        side='L' if c0.y<0 else 'R'
        knee=arm.data.bones['shin.'+side].head_local
        new=[a]
        for k in range(1,14):
            t=k/14;s=1-t
            c=c0*s**3+c1*3*s*s*t+c2*3*s*t*t+c3*t**3
            tangent=((c1-c0)*3*s*s+(c2-c1)*6*s*t+(c3-c2)*3*t*t).normalized()
            u=axes[0][0].lerp(axes[1][0],t);u=(u-tangent*u.dot(tangent)).normalized()
            v=tangent.cross(u).normalized()
            if v.dot(axes[0][1].lerp(axes[1][1],t))<0:v=-v
            outward=c-knee;outward-=tangent*outward.dot(tangent)
            outward=outward.normalized()
            ring=[]
            for i in range(20):
                angle=2*math.pi*i/20;radial=u*math.cos(angle)+v*math.sin(angle)
                radius=(a[i].co-c0).length*(1-t)+(b[i].co-c3).length*t
                # Broad bend and slimmer back-knee radius avoid an inner accordion.
                radius*=1-.30*math.sin(math.pi*t)**2*max(0,-radial.dot(outward))**2
                vertex=bm.verts.new(c+radial*radius);vertex[region]=1;ring.append(vertex)
            new.append(ring)
        new.append(b);J.bridge(bm,new,material)
    # A fitted waist has a short band and a shaped seat, rather than continuing
    # the torso's broad tube all the way into both thighs.
    waist=next(G.boundary_cycle(c) for c in J.boundary_groups(bm) if len(c)==24)
    hip_origin=arm.data.bones['pelvis'].head_local
    torso=(arm.data.bones['pelvis'].tail_local-hip_origin).normalized()
    waist_center=J.center(waist)
    for v in waist:
        v.co=waist_center+(v.co-waist_center)*.90-torso*.022
    waist_strips=J.walk_rings(waist,2)
    if len(waist_strips)!=3:raise RuntimeError('Expected waist, hip, seat rings')
    middle,seat=waist_strips[1:]
    # Fit through the hips with a rear yoke curve. The top ring remains open;
    # all new band faces are sewn into the same trouser shell.
    for a,b,c in zip(waist,middle,seat):
        b.co=c.co.lerp(a.co,.52)
    material=waist[0].link_faces[0].material_index
    band=[]
    for top,low in zip(waist,middle):
        v=bm.verts.new(top.co.lerp(low.co,.24));v[region]=1;band.append(v)
    old=set(f for v in waist for f in v.link_faces if any(w in middle for w in f.verts))
    bmesh.ops.delete(bm,geom=list(old),context='FACES_ONLY')
    for edge in list(bm.edges):
        if not edge.link_faces:bm.edges.remove(edge)
    J.bridge(bm,[waist,band,middle],material)
    # Upper-leg tailoring: wider front/back panels with a quieter side seam,
    # plus a restrained diagonal ease fold above the knee. This changes the
    # surface itself rather than painting folds into a texture.
    for cuff in [c for c in J.boundary_groups(bm) if len(c)==20]:
        side='L' if J.center(cuff).y<0 else 'R';sign=-1 if side=='L' else 1
        thigh=arm.data.bones['thigh.'+side]
        axis=(thigh.tail_local-thigh.head_local).normalized()
        front=Vector((-axis.z,0,axis.x)).normalized()
        for ring in J.walk_rings(G.boundary_cycle(cuff),30):
            c=J.center(ring);station=(c-thigh.head_local).dot(axis)
            fade=J.smooth((station-.11)/.09)*(1-J.smooth((station-.33)/.10))
            if fade<=0:continue
            for v in ring:
                radial=v.co-c
                # Anatomical front panel and tapered side seam replace an
                # approximately circular tube cross-section.
                v.co.y=c.y+radial.y*(1-.12*fade)
                v.co+=front*(radial.dot(front)*.09*fade)
                angle=math.atan2(radial.dot(front),sign*radial.y)
                fold=.0025*fade*math.exp(-((station-(.29+.015*math.sin(angle)))/.023)**2)
                v.co+=radial.normalized()*fold*max(0,math.sin(angle))
    # Common analytic weight field across the seam and rebuilt knees. Each
    # vertex has pelvis + same-side thigh/shin, with no abrupt ring assignments.
    for vertex in bm.verts:
        co=vertex.co;side='L' if co.y<0 else 'R'
        thigh=arm.data.bones['thigh.'+side];shin=arm.data.bones['shin.'+side]
        u=(thigh.tail_local-thigh.head_local).normalized()
        d=(shin.tail_local-shin.head_local).normalized()
        hipdist=(co-thigh.head_local).dot(u)
        # Lateral hip blends gradually, midline saddle stays pelvis anchored.
        hip=J.smooth((hipdist-.045)/.27)
        kneecenter=shin.head_local
        bisector=(u+d).normalized()
        lower=J.smooth(((co-kneecenter).dot(bisector)+.15)/.30)
        weights={'pelvis':1-hip,'thigh.'+side:hip*(1-lower),'shin.'+side:hip*lower}
        J.G.write_weights(vertex,layer,{ob.vertex_groups[n].index:w for n,w in weights.items() if w>1e-8})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=args.source.resolve();output=args.output.resolve()
    root=Path(__file__).resolve().parents[2]
    if not any(output.is_relative_to(root/'harness/out/blender'/round_name) for round_name in ('r6-trousers','r7-trousers')) or output.exists() or output==source:raise RuntimeError('Fresh scratch output required')
    protected={str(f):G.sha(f) for f in (root/'assets/blender/source').glob('*.blend')};source_hash=G.sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];G.pipeline.clear_pose(arm)
    ob=bpy.data.objects['rider:denim' if bpy.context.scene.get('heroOutfit')=='street' else 'rider:pants']
    signature=G.invariant_signature();other={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o!=ob}
    reconstruct(ob,arm)
    topology=G.topology(ob.data);audit=J.audit(ob,arm,'author_crotch')
    assert signature==G.invariant_signature()
    assert other=={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o!=ob}
    G.pipeline.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
    assert len(topology['components'])==1 and topology['boundary_loops']==[20,20,24]
    assert not topology['degenerate_faces'] and not topology['nonmanifold_interior_edges']
    output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    assert source_hash==G.sha(source) and protected=={f:G.sha(f) for f in protected}
    report=dict(source=str(source),source_sha256=source_hash,candidate_sha256=G.sha(output),script_sha256=G.sha(__file__),topology=topology,audit=audit,protected_sources=protected,other_meshes=other,invariants_unchanged=True)
    output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
