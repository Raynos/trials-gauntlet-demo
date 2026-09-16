"""Reproducible local MLX trial; no change to upstream model/license claims."""
import argparse, hashlib, json, os, sys, time
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path[:0]=[str(root/'hy3dshape'), str(root/'hy3dpaint')]
os.environ['HUNYUAN3D_MLX_WEIGHTS_DIR']=str(root/'weights')
os.environ['HF_HUB_OFFLINE']='1'
p=argparse.ArgumentParser();p.add_argument('stage',choices=['shape','paint']);a=p.parse_args()
out=root/'outputs/hero-head-a1'; image=out/'input.png'
record={'stage':a.stage,'input_sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'code_revision':'5fe21945b790fbb7fb28c510e89babd7b9feabe6','model_revision':'5b1cf9ae1114c0b046d9385fd4f5ac6570df5287','seed':42,'backend':'mlx','started':time.time()}
def save(): (out/(a.stage+'-report.json')).write_text(json.dumps(record,indent=2)+'\n')
save()
try:
    if a.stage=='shape':
        from hy3dshape.pipeline_mlx import ShapePipeline
        record['settings']={'num_inference_steps':50,'guidance_scale':7.5,'octree_resolution':256};save()
        start=time.perf_counter();pipe=ShapePipeline.from_pretrained(str(root/'weights'))
        record['load_seconds']=time.perf_counter()-start;save()
        start=time.perf_counter();mesh=pipe(str(image),seed=42,**record['settings'])
        record['inference_seconds']=time.perf_counter()-start
        record['vertices']=len(mesh.vertices);record['faces']=len(mesh.faces)
        mesh.export(out/'shape.glb')
    else:
        from textureGenPipeline_mlx import Hunyuan3DPaintConfigMLX,Hunyuan3DPaintPipelineMLX
        cfg=Hunyuan3DPaintConfigMLX(max_num_view=6,resolution=512)
        record['settings']={'views':6,'resolution':512,'steps':cfg.mlx_num_inference_steps,'texture_size':cfg.texture_size,'render_size':cfg.render_size,'guidance_scale':cfg.mlx_guidance_scale,'super_resolution':cfg.use_mlx_super_res,'remesh':True};save()
        start=time.perf_counter();pipe=Hunyuan3DPaintPipelineMLX(cfg)
        record['load_seconds']=time.perf_counter()-start;save()
        start=time.perf_counter();pipe(mesh_path=str(out/'shape.glb'),image_path=str(image),output_mesh_path=str(out/'textured.obj'),use_remesh=True,save_glb=True)
        record['inference_seconds']=time.perf_counter()-start
    record['status']='completed'
except BaseException as exc:
    record['status']='failed';record['error']=repr(exc);raise
finally:
    record['elapsed_seconds']=time.time()-record['started'];save()
