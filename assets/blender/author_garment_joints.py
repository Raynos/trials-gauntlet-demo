"""Refine reviewed garment candidates without modifying protected masters.

Keeps the authored rig, sockets, actions and procedural material graphs. Replaces
only a bounded sleeve joint strip and/or connects the existing trouser pieces.
No remeshing, skeleton changes, corrective shapes or preserve-volume modifier.

blender -b --python-exit-code 1 --python assets/blender/author_garment_joints.py -- \
  --source harness/out/blender/connected-garments/rider-street-connected-v6.blend \
  --output harness/out/blender/connected-garments/rider-street-elbows-v1.blend --mode elbows
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

sys.path.insert(0, str(Path(__file__).resolve().parent))
import author_garments as G


def center(ring):
    return sum((v.co for v in ring), Vector()) / len(ring)


def smooth(x):
    x = min(1, max(0, x))
    return x * x * (3 - 2 * x)


def boundary_groups(bm):
    remaining = {v for v in bm.verts if any(e.is_boundary for e in v.link_edges)}
    result = []
    while remaining:
        first = min(remaining, key=lambda v: v.index)
        group, todo = {first}, [first]
        while todo:
            for edge in todo.pop().link_edges:
                if edge.is_boundary:
                    for v in edge.verts:
                        if v not in group:
                            group.add(v)
                            todo.append(v)
        remaining -= group
        result.append(group)
    return result


def walk_rings(ring, limit):
    rings, seen = [ring], set(ring)
    for _ in range(limit):
        neighbors = [[e.other_vert(v) for e in v.link_edges if e.other_vert(v) not in seen] for v in rings[-1]]
        if any(len(n) != 1 for n in neighbors):
            break
        ring = [n[0] for n in neighbors]
        if len(set(ring)) != len(ring):
            break
        rings.append(ring)
        seen.update(ring)
    return rings


def bridge(bm, rings, material):
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            face = bm.faces.new([a[i], a[j], b[j], b[i]])
            face.material_index = material if isinstance(material, int) else material(a, b)
            face.smooth = True


def refine_elbows(ob, arm):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    layer = bm.verts.layers.deform.verify()
    region = bm.verts.layers.int.get("author_elbow") or bm.verts.layers.int.new("author_elbow")
    cuffs = [g for g in boundary_groups(bm) if len(g) == 18]
    if len(cuffs) != 2:
        raise RuntimeError("Expected two existing 18-vertex sleeve cuffs")
    edits = []
    for cuff in cuffs:
        rings = walk_rings(G.boundary_cycle(cuff), 13)
        if len(rings) != 14:
            raise RuntimeError("Existing sleeve quad strips changed")
        side = "L" if center(rings[0]).y < 0 else "R"
        a, b = rings[3], rings[12]
        c0, c3 = center(a), center(b)
        d0 = (center(rings[4]) - center(rings[2])).normalized()
        d1 = (center(rings[13]) - center(rings[11])).normalized()
        c1, c2 = c0 + d0 * .080, c3 - d1 * .080
        axes = []
        for ring, c, tangent in ((a, c0, d0), (b, c3, d1)):
            u = (ring[0].co - c).normalized()
            u = (u - tangent * u.dot(tangent)).normalized()
            v = tangent.cross(u).normalized()
            if (ring[1].co - c).dot(v) < 0:
                v = -v
            axes.append((u, v))
        # Keep the exact existing endpoint loop and material slots. Cloth outside
        # this strip, including the newly reviewed shoulder connection, is untouched.
        interior = {v for ring in rings[4:12] for v in ring}
        strip_faces = {f for v in interior for f in v.link_faces}
        material_a = next(f.material_index for f in strip_faces if any(v in a for v in f.verts))
        material_b = next(f.material_index for f in strip_faces if any(v in b for v in f.verts))
        for v in set(a) | set(b) | interior:
            v[region] = 1
        bmesh.ops.delete(bm, geom=list(interior), context="VERTS")
        new_rings = [a]
        group_a = ob.vertex_groups["forearm." + side].index
        group_b = ob.vertex_groups["upperArm." + side].index
        joint = arm.data.bones["forearm." + side].head_local
        max_radius, min_radius = 0, math.inf
        for k in range(1, 12):
            t = k / 12
            c = c0 * (1-t)**3 + c1 * (3*(1-t)**2*t) + c2 * (3*(1-t)*t*t) + c3 * t**3
            tangent = ((c1-c0)*(3*(1-t)**2) + (c2-c1)*(6*(1-t)*t) + (c3-c2)*(3*t*t)).normalized()
            u = axes[0][0].lerp(axes[1][0], smooth(t))
            u = (u - tangent * u.dot(tangent)).normalized()
            v_axis = tangent.cross(u).normalized()
            if v_axis.dot(axes[0][1].lerp(axes[1][1], t)) < 0:
                v_axis = -v_axis
            outer = joint - c
            outer = (outer - tangent * outer.dot(tangent)).normalized()
            ring = []
            for i in range(18):
                angle = 2 * math.pi * i / 18
                radial = u * math.cos(angle) + v_axis * math.sin(angle)
                endpoint_radius = (a[i].co-c0).length*(1-t) + (b[i].co-c3).length*t
                influence = math.sin(math.pi*t)**2
                outside = radial.dot(outer)
                # Thin the inside elbow crease and retain a shaped outside cap.
                # Three restrained 2.5 mm support ridges break up the smooth tube.
                radius = endpoint_radius - .023 * influence * max(0, -outside)**2
                radius += .0025 * math.cos(6*math.pi*t + .45*math.sin(angle)) * influence * (.3 + .7*max(0,outside))
                vertex = bm.verts.new(c + radial * radius)
                vertex[region] = 1
                weight = smooth(t)
                G.write_weights(vertex, layer, {group_a: 1-weight, group_b: weight})
                ring.append(vertex)
                max_radius, min_radius = max(max_radius, radius), min(min_radius, radius)
            new_rings.append(ring)
        new_rings.append(b)
        for k, (start, end) in enumerate(zip(new_rings, new_rings[1:])):
            bridge(bm, [start, end], material_a if k < 6 else material_b)
        edits.append(dict(side=side, replaced_loops=8, new_loops=11, ring_vertices=18,
                          min_radius=min_radius, max_radius=max_radius,
                          control_points=[list(c) for c in (c0,c1,c2,c3)]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return edits


def crossing_count(mesh, marked):
    """Exact nonadjacent triangle/segment crossings, excluding coplanar pairs.
    Counts polygon pairs, with separate region membership; this is a diagnostic.
    """
    mesh.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    vertices = [v.co.copy() for v in mesh.vertices]
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0)
    pairs, regional = set(), set()
    for i,j in tree.overlap(tree):
        a,b = triangles[i],triangles[j]
        if i>=j or set(a)&set(b):
            continue
        intersects = False
        for one,two in ((a,b),(b,a)):
            for k in range(3):
                start,end = vertices[one[k]],vertices[one[(k+1)%3]]
                direction = end-start
                if direction.length_squared < 1e-16:
                    continue
                hit = intersect_ray_tri(*(vertices[t] for t in two), direction, start, True)
                if hit is not None and 1e-6 < (hit-start).dot(direction)/direction.length_squared < 1-1e-6:
                    intersects = True
                    break
            if intersects:
                break
        if intersects:
            pair = tuple(sorted((mesh.loop_triangles[i].polygon_index,mesh.loop_triangles[j].polygon_index)))
            pairs.add(pair)
            if marked & (set(a)|set(b)):
                regional.add(pair)
    return len(pairs),len(regional)


def audit(ob, arm, region_name):
    attribute = ob.data.attributes.get(region_name)
    marked = {i for i,v in enumerate(attribute.data) if v.value} if attribute else set()
    edges = [(e.vertices[:],(ob.data.vertices[e.vertices[0]].co-ob.data.vertices[e.vertices[1]].co).length) for e in ob.data.edges]
    G.pipeline.clear_pose(arm)
    rest_crossings = crossing_count(ob.data,marked)
    rows = []
    actions = [s.action for t in arm.animation_data.nla_tracks for s in t.strips if s.action]
    for action in sorted(actions,key=lambda a:a.name):
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        lo,hi = map(int,action.frame_range)
        row = dict(action=action.name,samples=0,nonfinite=0,degenerate=0,min_face_area=math.inf,
                   max_edge_stretch=0,min_edge_ratio=math.inf,region_max_stretch=0,region_min_ratio=math.inf,
                   crossings=dict(pairs=-1,frame=0),region_crossings=dict(pairs=-1,frame=0))
        for frame in range(lo,hi+1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            row['samples'] += 1
            row['nonfinite'] += sum(not all(math.isfinite(x) for x in v.co) for v in mesh.vertices)
            row['degenerate'] += sum(p.area<1e-12 for p in mesh.polygons)
            row['min_face_area'] = min(row['min_face_area'],*(p.area for p in mesh.polygons))
            for (a,b),length in edges:
                if length<1e-9:
                    continue
                ratio=(mesh.vertices[a].co-mesh.vertices[b].co).length/length
                row['max_edge_stretch']=max(row['max_edge_stretch'],ratio)
                row['min_edge_ratio']=min(row['min_edge_ratio'],ratio)
                if a in marked and b in marked:
                    row['region_max_stretch']=max(row['region_max_stretch'],ratio)
                    row['region_min_ratio']=min(row['region_min_ratio'],ratio)
            if (frame-lo)%5==0 or frame==hi:
                whole,regional=crossing_count(mesh,marked)
                for key,count in (('crossings',whole),('region_crossings',regional)):
                    if count>row[key]['pairs']:
                        row[key]=dict(pairs=count,frame=frame)
            evaluated.to_mesh_clear()
        rows.append(row)
    G.pipeline.clear_pose(arm)
    return dict(rest_crossings=rest_crossings,animation=rows)


def elbow_extreme_audit(ob,arm):
    """Synthetic local-joint sweep, not an action or runtime reach guarantee.
    Keep the upper arm/rest torso fixed and rotate the forearm about its hinge
    from interior 35 through 175 degrees. The attached hand follows its parent.
    These poses exercise the permitted runtime flexion beyond the authored clips.
    """
    attribute=ob.data.attributes.get('author_elbow')
    marked={i for i,v in enumerate(attribute.data) if v.value}
    edges=[(e.vertices[:],(ob.data.vertices[e.vertices[0]].co-ob.data.vertices[e.vertices[1]].co).length)
           for e in ob.data.edges if all(i in marked for i in e.vertices)]
    rows=[]
    for interior in range(35,176,5):
        G.pipeline.clear_pose(arm)
        for side in ('L','R'):
            upper=arm.data.bones['upperArm.'+side]
            lower=arm.data.bones['forearm.'+side]
            u=(upper.tail_local-upper.head_local).normalized()
            d=(lower.tail_local-lower.head_local).normalized()
            axis=u.cross(d).normalized()
            delta=math.pi-math.radians(interior)-math.acos(max(-1,min(1,u.dot(d))))
            rotate=Quaternion(axis,delta).to_matrix().to_4x4()
            joint=lower.head_local
            arm.pose.bones[lower.name].matrix=Matrix.Translation(joint) @ rotate @ Matrix.Translation(-joint) @ lower.matrix_local
        bpy.context.view_layer.update()
        evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=evaluated.to_mesh()
        ratios=[(mesh.vertices[a].co-mesh.vertices[b].co).length/length for (a,b),length in edges if length>1e-9]
        whole,regional=crossing_count(mesh,marked)
        measured=[]
        for side in ('L','R'):
            upper=arm.pose.bones['upperArm.'+side]
            lower=arm.pose.bones['forearm.'+side]
            u=(upper.tail-upper.head).normalized()
            d=(lower.tail-lower.head).normalized()
            measured.append(math.degrees(math.pi-math.acos(max(-1,min(1,u.dot(d))))))
        if any(abs(v-interior)>.001 for v in measured):
            raise RuntimeError(f'Synthetic elbow angle did not match request: {interior}, {measured}')
        rows.append(dict(interior_degrees=interior,measured_degrees=measured,max_region_stretch=max(ratios),
                         min_region_ratio=min(ratios),crossing_pairs=whole,region_crossing_pairs=regional,
                         min_face_area=min(p.area for p in mesh.polygons),
                         degenerate=sum(p.area<1e-12 for p in mesh.polygons),
                         nonfinite=sum(not all(math.isfinite(x) for x in v.co) for v in mesh.vertices)))
        evaluated.to_mesh_clear()
    G.pipeline.clear_pose(arm)
    return rows


def mark_baseline_elbows(ob):
    bm=bmesh.new()
    bm.from_mesh(ob.data)
    region=bm.verts.layers.int.new('author_elbow')
    for cuff in [g for g in boundary_groups(bm) if len(g)==18]:
        rings=walk_rings(G.boundary_cycle(cuff),13)
        for ring in rings[3:13]:
            for v in ring:
                v[region]=1
    bm.to_mesh(ob.data)
    bm.free()


def trouser_parts(bm):
    groups=G.components(bm)
    pelvis=[sorted(c,key=lambda v:v.index) for c in groups if len(c)==120]
    legs=[sorted(c,key=lambda v:v.index) for c in groups if len(c)==460]
    if len(pelvis)!=1 or len(legs)!=2:
        raise RuntimeError('Expected existing 5 by 24 pelvis shell and two 23 by 20 legs')
    return pelvis[0],legs


def mark_baseline_crotch(ob):
    bm=bmesh.new()
    bm.from_mesh(ob.data)
    region=bm.verts.layers.int.new('author_crotch')
    saddle=bm.verts.layers.int.new('author_saddle')
    pelvis,legs=trouser_parts(bm)
    for v in pelvis+[v for leg in legs for v in leg[:380]]:
        v[region]=1
    for v in pelvis+[v for leg in legs for v in leg[:180]]:
        v[saddle]=1
    bm.to_mesh(ob.data)
    bm.free()


def connect_trousers(ob,arm,saddle_drop=.100):
    """Turn the existing pelvis bottom into two leg openings sharing one saddle.
    The 24-edge pelvis loop splits into two 12-edge half loops. Each gains the
    same 8-edge front-to-back crotch seam, yielding two 20-edge leg openings.
    Cut depth follows 242 mm of thigh projection (street ring 8, race ring 10).
    Distal rings retain their topology with the medial clearance adjustment below.
    """
    bm=bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    layer=bm.verts.layers.deform.verify()
    region=bm.verts.layers.int.get('author_crotch') or bm.verts.layers.int.new('author_crotch')
    saddle_region=bm.verts.layers.int.get('author_saddle') or bm.verts.layers.int.new('author_saddle')
    pelvis,legs=trouser_parts(bm)
    material=next(f.material_index for f in bm.faces)
    bottom=pelvis[48:72]
    waist=pelvis[96:120]
    # The old crotch-to-belt loft followed the torso's steep inclination. Its
    # forward bottom rim dipped below the outgoing thigh and folded back through
    # the belt when connected. Shape a flatter lower seat while retaining the
    # exact waist loop; the middle hip loop becomes a graded transition.
    hips=arm.data.bones['pelvis'].head_local
    seat_center=hips+Vector((.010,0,-.035))
    for i,v in enumerate(bottom):
        angle=2*math.pi*i/24
        v.co=seat_center+Vector((.090*math.sin(angle),.160*math.cos(angle),-.050*math.sin(angle)))
        pelvis[72+i].co=v.co.lerp(waist[i].co,.5)
    # The inherited cylinders interpenetrate each other at the inner thighs in
    # deep bends. Give only their medial fabric up to 12 mm of clearance, fading
    # out below the knee; keep outer knee/calf shape and every distal ring edge.
    for leg in legs:
        sign=-1 if center(leg).y<0 else 1
        for k in range(8,19):
            ring=leg[k*20:(k+1)*20]
            c=center(ring)
            lateral=max(abs(v.co.y-c.y) for v in ring)
            falloff=1 if k<=13 else smooth((18-k)/5)
            for v in ring:
                medial=max(0,-sign*(v.co.y-c.y)/lateral)
                v.co.y+=sign*.012*medial**2*falloff
                v[region]=1
    cuts=[]
    for leg in legs:
        side='L' if center(leg).y<0 else 'R'
        thigh=arm.data.bones['thigh.'+side]
        direction=(thigh.tail_local-thigh.head_local).normalized()
        cut=min(range(5,13),key=lambda k:abs((center(leg[k*20:(k+1)*20])-thigh.head_local).dot(direction)-.242))
        cuts.append((side,cut,leg))
    thigh_roots=[leg[cut*20:(cut+1)*20] for _,cut,leg in cuts]
    # Open waist and cuffs; remove buried caps and the old sealed crotch/hip bulbs.
    remove_vertices=pelvis[:48]+[v for _,cut,leg in cuts for v in leg[:cut*20]]
    caps=[f for f in bm.faces if len(f.verts)>4]
    bmesh.ops.delete(bm,geom=caps,context='FACES_ONLY')
    bmesh.ops.delete(bm,geom=remove_vertices,context='VERTS')
    t=(arm.data.bones['pelvis'].tail_local-arm.data.bones['pelvis'].head_local).normalized()
    pelvis_group=ob.vertex_groups['pelvis'].index
    # Front and back center vertices (angles 6 and 18) are retained exactly.
    front,back=bottom[6],bottom[18]
    saddle=[front]
    for k in range(1,8):
        alpha=k/8
        v=bm.verts.new(front.co.lerp(back.co,alpha)-t*(saddle_drop*math.sin(math.pi*alpha)))
        v[region]=1
        v[saddle_region]=1
        G.write_weights(v,layer,{pelvis_group:1})
        saddle.append(v)
    saddle.append(back)
    # Equal, opposite saddle ordering ensures two incident faces per seam edge.
    openings=[bottom[6:19]+list(reversed(saddle[1:-1])),
              bottom[18:]+bottom[:7]+saddle[1:-1]]
    edits=[]
    for a in openings:
        side='L' if center(a).y<0 else 'R'
        sign=-1 if side=='L' else 1
        b=next(root for root in thigh_roots if center(root).y*sign>0)
        # Choose the cyclic correspondence by position, never arbitrary indices.
        possibilities=[]
        for reverse in (False,True):
            order=list(reversed(b)) if reverse else b
            for offset in range(20):
                candidate=order[offset:]+order[:offset]
                possibilities.append((sum((v.co-w.co).length_squared for v,w in zip(a,candidate)),candidate))
        _,b=min(possibilities,key=lambda item:item[0])
        thigh_group=ob.vertex_groups['thigh.'+side].index
        for v in a+b:
            v[region]=1
            v[saddle_region]=1
        # Crotch center follows pelvis; outer hips gradually share their thigh.
        # A stronger symmetric thigh blend was rejected after it compressed the
        # retained hip-to-waist strips in deep crouch and landing.
        for v in a:
            lateral=min(1,abs(v.co.y)/.16)
            G.write_weights(v,layer,{pelvis_group:1-.2*lateral,thigh_group:.2*lateral})
        rings=[a]
        for alpha in (1/4,1/2,3/4):
            ring=[]
            for v,w in zip(a,b):
                co=v.co.lerp(w.co,alpha)
                # A restrained lateral hip roll distributes glute volume while
                # keeping the inner saddle from becoming overlapping leg tubes.
                co.y+=sign*.008*math.sin(math.pi*alpha)*min(1,abs(co.y)/.12)
                vertex=bm.verts.new(co)
                vertex[region]=1
                vertex[saddle_region]=1
                G.write_weights(vertex,layer,G.blend_weights(dict(v[layer]),dict(w[layer]),smooth(alpha)))
                ring.append(vertex)
            rings.append(ring)
        rings.append(b)
        bridge(bm,rings,material)
        edits.append(dict(side=side,opening_edges=20,saddle_edges=8,intermediate_loops=3,
                          saddle_drop_m=saddle_drop,
                          retained_leg_start_ring=next(cut for s,cut,_ in cuts if s==side),
                          longest_bridge=max((v.co-w.co).length for v,w in zip(a,b))))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return edits


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--mode',choices=('elbows','jeans'),required=True)
    parser.add_argument('--saddle-drop',type=float,default=.100)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source,output=args.source.resolve(),args.output.resolve()
    root=Path(__file__).resolve().parents[2]
    if not output.is_relative_to(root/'harness/out/blender/connected-garments') or output==source or output.exists():
        raise RuntimeError('Choose a fresh candidate path under ignored connected-garments; never overwrite source/history')
    source_hash=G.sha(source)
    protected={str(p):G.sha(p) for p in (root/'assets/blender/source').glob('*.blend')}
    bpy.ops.wm.open_mainfile(filepath=str(source))
    arm=bpy.data.objects['rider_rig']
    G.pipeline.clear_pose(arm)
    G.pipeline.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
    signature=G.invariant_signature()
    outfit=bpy.context.scene.get('heroOutfit')
    if args.mode=='elbows':
        ob=bpy.data.objects['rider:hoodie' if outfit=='street' else 'rider:upper-garment']
        if ob.data.attributes.get('author_elbow'):
            raise RuntimeError('Elbows already refined; choose the reviewed armhole-only candidate')
        mark_baseline_elbows(ob)
        region='author_elbow'
    else:
        ob=bpy.data.objects['rider:denim' if outfit=='street' else 'rider:pants']
        if ob.data.attributes.get('author_crotch'):
            raise RuntimeError('Trousers already refined; choose the reviewed armhole-only candidate')
        mark_baseline_crotch(ob)
        region='author_crotch'
    before=G.topology(ob.data)
    baseline=audit(ob,arm,region)
    baseline_saddle=audit(ob,arm,'author_saddle') if args.mode=='jeans' else None
    baseline_extremes=elbow_extreme_audit(ob,arm) if args.mode=='elbows' else None
    edits=refine_elbows(ob,arm) if args.mode=='elbows' else connect_trousers(ob,arm,args.saddle_drop)
    after=G.topology(ob.data)
    candidate=audit(ob,arm,region)
    candidate_saddle=audit(ob,arm,'author_saddle') if args.mode=='jeans' else None
    candidate_extremes=elbow_extreme_audit(ob,arm) if args.mode=='elbows' else None
    if after['nonmanifold_interior_edges'] or after['degenerate_faces'] or any(r['nonfinite'] or r['degenerate'] for r in candidate['animation']+(candidate_extremes or [])):
        raise RuntimeError('Candidate failed topology or animation validity')
    if args.mode=='elbows' and (after['boundary_loops']!=before['boundary_loops'] or len(after['components'])!=len(before['components'])):
        raise RuntimeError('Elbow refinement changed the garment openings or components')
    if args.mode=='jeans' and (len(after['components'])!=1 or after['boundary_loops']!=[20,20,24]):
        raise RuntimeError('Connected trousers require one component and waist/two cuff openings')
    G.pipeline.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
    if signature!=G.invariant_signature():
        raise RuntimeError('Protected rig, sockets, actions or material graphs changed')
    bpy.context.scene['heroCandidateNote']='Joint refinement prototype; parent must judge played animation and textured gameplay before promotion.'
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    if G.sha(source)!=source_hash or any(G.sha(p)!=h for p,h in protected.items()):
        raise RuntimeError('Protected source bytes changed')
    report=dict(mode=args.mode,outfit=outfit,source=str(source),source_sha256=source_hash,
                candidate=str(output),candidate_sha256=G.sha(output),script_sha256=G.sha(__file__),
                protected_sources=protected,protected_sources_unchanged=True,rig_sockets_actions_materials_unchanged=True,
                bone_count=len(arm.data.bones),action_count=len(bpy.data.actions),
                before=before,after=after,edits=edits,baseline=baseline,candidate_audit=candidate,
                baseline_elbow_extremes=baseline_extremes,candidate_elbow_extremes=candidate_extremes,
                baseline_saddle=baseline_saddle,candidate_saddle=candidate_saddle,
                limitation='Numeric audits are not an art verdict. Crossings sampled every five authored frames exclude coplanar pairs; parent must play all candidate clips and textured gameplay.')
    output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
