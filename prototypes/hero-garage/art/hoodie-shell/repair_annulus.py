"""Reconstruct the neck annulus as a discrete harmonic surface.

Call repair_annulus(object, source_geodesic_distances) after neck fitting and
before skin weights. Fixed neck ellipse and fixed outer cage rows are Dirichlet
boundaries; all intervening positions are solved, replacing the folded source
lip rather than retaining its displacement. Topology/UVs/weights are untouched.
"""
import bmesh
import numpy as np

def repair_annulus(ob, distances, radius=.18):
    bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table();bm.normal_update()
    before=np.array([v.co[:] for v in bm.verts],dtype=np.float64)
    neck={i for i,d in distances.items() if d==0.}
    interior=sorted(i for i,d in distances.items() if 0.<d<radius)
    ids=np.array(interior,dtype=int);remap={i:k for k,i in enumerate(interior)}
    # Uniform positive graph weights preserve a maximum principle and avoid
    # cotangent sign changes on the source's almost-reversed collar triangles.
    row=[];col=[]
    for i in interior:
        for e in bm.verts[i].link_edges:row.append(remap[i]);col.append(e.other_vert(bm.verts[i]).index)
    row=np.array(row);col=np.array(col);degree=np.bincount(row,minlength=len(ids));coords=before.copy()
    error=1.
    for iteration in range(12000):
        accum=np.zeros((len(ids),3));np.add.at(accum,row,coords[col]);target=accum/degree[:,None]
        error=float(np.max(np.abs(target-coords[ids])));coords[ids]=target
        if error<2e-9:break
    for i in interior:bm.verts[i].co=coords[i]
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
    inner_edges=[e for e in bm.edges if len(e.link_faces)==2 and all(v.index in remap or v.index in neck for v in e.verts)]
    angles=[e.calc_face_angle() for e in inner_edges]
    near=[e for e in inner_edges if all(distances.get(v.index,1e9)<.08 for v in e.verts)]
    near_angles=[e.calc_face_angle() for e in near]
    report={'method':'Dirichlet discrete harmonic annulus, positive uniform edge weights; fixed fitted neck and fixed outer cage','radiusM':radius,'solvedVertices':len(interior),'iterations':iteration+1,'lastIterationMaxDeltaM':error,'maximumInnerDihedralDegrees':float(np.degrees(max(angles))),'innerEdgesOver120Degrees':int(sum(a>np.radians(120) for a in angles)),'neck80mmMaxDihedralDegrees':float(np.degrees(max(near_angles))),'neck80mmEdgesOver120Degrees':int(sum(a>np.radians(120) for a in near_angles)),'maximumAdditionalMoveM':float(np.linalg.norm(coords-before,axis=1).max()),'distalMaximumMoveM':float(np.linalg.norm(coords[[i for i in range(len(coords)) if i not in remap]]-before[[i for i in range(len(coords)) if i not in remap]],axis=1).max()),'degenerateFaces':sum(f.calc_area()<1e-12 for f in bm.faces),'nonmanifoldInteriorEdges':sum(not e.is_manifold and not e.is_boundary for e in bm.edges),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'limitations':'No guarantee of whole-surface absence of intersections; parent must review motion and silhouette.'}
    bm.to_mesh(ob.data);bm.free();ob.data.update();return report
