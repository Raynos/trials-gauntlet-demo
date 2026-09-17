"""Folded two-panel hood fitted to the evaluated sweatshirt back."""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def build_hood(shirt, hood, arm):
    bpy.context.view_layer.update()
    evaluated=shirt.evaluated_get(bpy.context.evaluated_depsgraph_get()); em=evaluated.to_mesh()
    tree=BVHTree.FromPolygons([v.co for v in em.vertices],[p.vertices for p in em.polygons]); evaluated.to_mesh_clear()
    control=BVHTree.FromPolygons([v.co for v in shirt.data.vertices],[p.vertices for p in shirt.data.polygons])
    origin=arm.data.bones['neck'].head_local.copy()
    up=(arm.data.bones['chest'].tail_local-arm.data.bones['chest'].head_local).normalized()
    front=Vector((up.z,0,-up.x)); side=Vector((0,1,0))
    def world(x,y,z):return origin+front*x+side*y+up*z
    def back(y,z):
        hit,normal,_,_=tree.ray_cast(world(-.6,y,z),front,1.)
        if hit is None:raise RuntimeError(f'Hood outside back {y} {z}')
        return (hit-origin).dot(front)
    # A recessed mouth rolls into a tapered bag. Cloth is supported at the
    # front panel, with its volume retained on the outer panel.
    profiles=[(.018,.088,.026),(.012,.092,.030),(0,.097,.032),(-.024,.105,.038),(-.055,.108,.038),(-.088,.101,.031),(-.120,.083,.023),(-.145,.059,.015),(-.157,.032,.008),(-.160,.012,.004)]
    n=48; verts=[]; faces=[]; surfaces=[]
    for inner in (False,True):
        rings=[]
        for ri,(z0,width,depth) in enumerate(profiles):
            ring=[]
            for i in range(n):
                a=i*math.tau/n;s,c=math.sin(a),math.cos(a)
                y=width*s*(.977 if inner else 1)
                z=z0+(.008 if ri<3 else .004)*c
                x=back(y,z)-.0015-depth*(1-c)/2
                if inner:x+=.0018*(-c)
                x-=.0015*max(0,-c)*max(0,1-abs(s)/.2)
                ring.append(len(verts));verts.append(world(x,y,z))
            rings.append(ring)
        for a,b in zip(rings,rings[1:]):
            for i in range(n):j=(i+1)%n;faces.append((a[i],a[j],b[j],b[i]))
        faces.append(tuple(reversed(rings[-1])));surfaces.append(rings)
    for i in range(n):j=(i+1)%n;faces.append((surfaces[0][0][i],surfaces[1][0][i],surfaces[1][0][j],surfaces[0][0][j]))
    old=hood.data;mesh=bpy.data.meshes.new('tailored folded hood');mesh.from_pydata(verts,[],faces);mesh.update()
    for m in old.materials:mesh.materials.append(m)
    hood.data=mesh
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    for p in mesh.polygons:p.use_smooth=True
    for v in mesh.vertices:
        hit,_,fi,_=control.find_nearest(v.co);poly=shirt.data.polygons[fi];ws={}
        for vi in poly.vertices:
            w=1/max(.00001,(shirt.data.vertices[vi].co-hit).length)**2
            for g in shirt.data.vertices[vi].groups:
                name=shirt.vertex_groups[g.group].name;ws[name]=ws.get(name,0)+g.weight*w
        ws=dict(sorted(ws.items(),key=lambda x:-x[1])[:4]);total=sum(ws.values())
        for name,w in ws.items():
            group=hood.vertex_groups.get(name) or hood.vertex_groups.new(name=name);group.add([v.index],w/total,'REPLACE')
    return {'vertices':len(verts),'quads':len(faces)-2,'supportGapM':.0015,'clothThicknessM':.0018,'method':'Two cloth panels, rolled mouth, tapered crown, supported on evaluated back'}
