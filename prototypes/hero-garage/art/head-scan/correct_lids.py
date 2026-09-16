"""Split actual scan edges along atlas-traced closed lid, then open the existing lids.
No ellipsoidal deletion or replacement face shell. UVs remain attached to source loops.
"""
import bpy,bmesh,json,heapq,math
from mathutils import Vector

def open_lids(head,root):
    landmarks=json.loads((root/'art/head-scan/source-lid-landmarks.json').read_text())
    bm=bmesh.new();bm.from_mesh(head.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
    uv=bm.loops.layers.uv.active
    original_uv={v:sum((l[uv].uv for l in v.link_loops),Vector((0,0)))/len(v.link_loops) for v in bm.verts}
    source_verts=list(bm.verts)
    eyes=[];measure=[]
    for side,marks in landmarks.items():
        bm.verts.ensure_lookup_table();bm.verts.index_update()
        original_uv={v:sum((l[uv].uv for l in v.link_loops),Vector((0,0)))/len(v.link_loops) for v in bm.verts}
        ids=[source_verts[m['vertex']].index for m in marks]
        crease=[]
        for start,end in zip(ids,ids[1:]):
            a,b=bm.verts[start],bm.verts[end];q=[(0,a.index)];dist={a.index:0};prev={};A=original_uv[a];B=original_uv[b];delta=B-A
            while q:
                cost,i=heapq.heappop(q)
                if i==b.index:break
                if cost!=dist[i]:continue
                for e in bm.verts[i].link_edges:
                    n=e.other_vert(bm.verts[i]);t=max(0,min(1,(original_uv[n]-A).dot(delta)/delta.length_squared));off=(original_uv[n]-(A+delta*t)).length
                    nc=cost+e.calc_length()*(1+off*1000)
                    if nc<dist.get(n.index,1e99):dist[n.index]=nc;prev[n.index]=i;heapq.heappush(q,(nc,n.index))
            chain=[b.index]
            while chain[-1]!=a.index:chain.append(prev[chain[-1]])
            crease.extend(chain[::-1][:-1])
        crease.append(ids[-1]);crease=list(dict.fromkeys(crease))
        edges=[]
        for a,b in zip(crease,crease[1:]):
            e=next(e for e in bm.verts[a].link_edges if e.other_vert(bm.verts[a]).index==b);edges.append(e)
        # Retain vertex references since split changes indices. UV coordinates classify upper/lower copies.
        poly=[original_uv[bm.verts[i]].copy() for i in crease];poly.sort(key=lambda p:p.x)
        left,right=poly[0].x,poly[-1].x
        def seam(u):
            for a,b in zip(poly,poly[1:]):
                if a.x<=u<=b.x:return a.y+(b.y-a.y)*(u-a.x)/max(1e-8,b.x-a.x)
            return poly[0 if u<left else -1].y
        coords=[bm.verts[i].co.copy() for i in crease]
        lo=min(p.x for p in coords);hi=max(p.x for p in coords);cx=(lo+hi)/2;cz=sum(p.z for p in coords)/len(coords)+.003
        front=min(p.y for p in coords);radius=(hi-lo)*.54;cy=front+radius-.0012
        eyes.append((cx,cy,cz,radius))
        bmesh.ops.split_edges(bm,edges=edges)
        changed=0
        for v in bm.verts:
            loops=list(v.link_loops)
            if not loops:continue
            pos=sum((l[uv].uv for l in loops),Vector((0,0)))/len(loops)
            if not left<pos.x<right:continue
            sy=seam(pos.x);d=pos.y-sy
            if abs(d)>.030:continue
            # A split-crease copy belongs to either upper or lower adjacent source faces.
            face_delta=sum(sum(l2[uv].uv.y-seam(l2[uv].uv.x) for l2 in l.face.loops)/len(l.face.loops) for l in loops)/len(loops)
            upper=face_delta>0 if abs(d)<.002 else d>0
            t=(pos.x-left)/(right-left);shape=math.sin(math.pi*t)**.7;falloff=(max(0,1-abs(d)/(.030 if upper else .020)))**2
            
            v.co.z+=(.008 if upper else -.001)*shape*falloff
            # The real lifted lid wraps around recessed eyeball; surrounding brow remains unchanged.
            if abs(d)<.009:
                rr=radius*radius-(v.co.x-cx)**2-(v.co.z-cz)**2
                if rr>0:
                    globe=cy-math.sqrt(rr)-.00065
                    v.co.y=min(v.co.y,globe)
            changed+=1
        measure.append({'side':side,'seam_source_vertices':crease,'seam_edges':len(edges),'deformed_source_vertices':changed,'eye_center':[cx,cy,cz],'radius':radius})
    bm.to_mesh(head.data);bm.free();head.data.update()
    return eyes,measure
