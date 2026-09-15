"""Bounded connected trouser reconstruction; scratch sources only, never publishes.

Retains exact waist/cuffs and non-trouser meshes. Replaces the bent knee strip
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
        a,b=rings[3],rings[13]
        c0,c3=J.center(a),J.center(b)
        d0=(J.center(rings[4])-J.center(rings[2])).normalized()
        d1=(J.center(rings[14])-J.center(rings[12])).normalized()
        c1,c2=c0+d0*.13,c3-d1*.13
        axes=[]
        for ring,c,tangent in ((a,c0,d0),(b,c3,d1)):
            u=(ring[0].co-c).normalized();u=(u-tangent*u.dot(tangent)).normalized()
            v=tangent.cross(u).normalized()
            if (ring[1].co-c).dot(v)<0:v=-v
            axes.append((u,v))
        material=a[0].link_faces[0].material_index
        bmesh.ops.delete(bm,geom=[v for r in rings[4:13] for v in r],context='VERTS')
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
    if not output.is_relative_to(root/'harness/out/blender/r6-trousers') or output.exists() or output==source:raise RuntimeError('Fresh scratch output required')
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
