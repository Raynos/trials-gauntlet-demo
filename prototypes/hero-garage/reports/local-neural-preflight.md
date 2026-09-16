# Local neural 3D route — September 16, 2026

The user requested downloading/running TRELLIS.2 and/or Hunyuan3D on this laptop for the existing HERO_GARAGE production goal. This investigation does not change target01 or accept generated assets automatically.

## Machine and selected route

Measured locally: Apple M5 Max, 40-core GPU, 128 GB unified memory, arm64, macOS 26.5, Metal 4; approximately 2.8 TiB free disk. Unified memory capacity is sufficient for the community port's reported configuration, but does not provide CUDA compatibility.

The [official Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2) implementation specifies Linux/NVIDIA/CUDA. The selected [Jourloy Apple Silicon fork](https://github.com/Jourloy/TRELLIS.2) replaces required CUDA operations with Metal implementations and provides a reproducible headless CLI. Its supported route is PyTorch MPS; its MLX backend is experimental. Do not describe this as official Microsoft macOS support or as a fully MLX inference run.

Local installation: `/Users/raynos/ai-tools/TRELLIS.2-apple`, source revision `2ddae4f97d7ab3e9a64374bcaa459a3c82d0ea4b`, isolated `.venv`, pinned Metal dependencies. Source, packages and model weights remain outside this game repository. `LOCAL-SETUP.md`, `setup-local.log`, `weights-local-status.json` and `weights-local.log` in that directory record execution. Dependency installation is complete and actual local Metal probes passed. Public-weight download remains in progress; actual model inference is not yet demonstrated.

## License and access decisions

- TRELLIS.2 code and Microsoft weights are MIT. Dependency licenses are separate.
- DINOv3 is essential to image conditioning and has its own gated license. The official [Meta model page](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m) requires user access approval. A read-only metadata request returned HTTP401 with no configured Hugging Face token. No alternate mirror or gate bypass is used. The user was asked to accept that license and run `.venv/bin/hf auth login` locally, never send a token through chat.
- The optional RMBG2 background model is not downloaded. A recorded local patch skips eager loading when `--background keep` is selected. Prepared RGBA inputs will avoid that dependency.
- The [Hunyuan3D2.1 license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE) excludes EU, UK and South Korea, including output use there. The user explicitly confirmed intended use within an excluded territory. Hunyuan3D2.1 is therefore not selected for installation/inference. The [dgrauet MLX fork](https://github.com/dgrauet/Hunyuan3D-2.1-mlx), inspected at `5fe21945b790fbb7fb28c510e89babd7b9feabe6`, claims both shape and PBR paint on Apple Silicon, but its port does not remove upstream license restrictions. Only source was downloaded for inspection; no Hunyuan model weights or runtime environment were installed.

## Proof and production gates

First require local Metal capability probes to pass. Then, after licensed DINO access and required weights are present, run a bounded seeded512 image-to-mesh/PBR smoke test. Retain exact input hash, source/dependency revisions, model revisions, timing, peak memory, raw GLB, PBR GLB and metadata. An upstream author's successful Mac run is a feasibility signal, not our execution evidence.

For the hero, evaluate an isolated head from the already frozen reference authority. Original face information is limited; generated hidden detail cannot be represented as recovered truth. Review the resulting textured GLB in the existing Three.js comparison/orbit/relight harness. Target likeness, real eyes/lids, hair silhouette and material response still decide Milestone A.

A generated static mesh is starting material. Deliberate facial retopology, separate eyes, hair treatment, garment construction, rigging, deformation, bike mechanics and mobile optimization remain required by the production plan. Do not generate one fused rider-and-bike mesh and label the plan complete. At most two bounded candidate methods on the same isolated subject; stop or change route if repair cost exceeds the value of the generated source.

## Actual local verification

`local-neural/metal-probe.json` passes with no failures: MPS matmul and SDPA, MLX matmul, Metal rasterization, Metal BVH distance, and flex_gemm sparse attention capability/parity. The supported MPS sparse-convolution integration check also passes (dense/masked/production split-K paths). Dependency versions are frozen in `local-neural/requirements.freeze.txt`; the narrowly scoped background-loader patch is retained alongside it.

The selected lightweight test run is **38 passed, 2 failed**. Both failures are in experimental MLX parity (attention max absolute discrepancy0.00118 and sparse convolution0.00250 against strict FP32 tolerances). No tolerances were relaxed. The production proof will explicitly select `--backend mps`; MLX is not validated for this run. See `local-neural/tests.txt` and `local-neural/mps-integration.txt`.

The public Microsoft model manifest is14,819,878,398 bytes (~14.82GB), plus the original sparse decoder and gated DINOv3. The existing loader eagerly loads512 and1024 models, so the full pinned manifest is being retained instead of adding another loader patch. The download process was confirmed alive at this checkpoint; use `weights-local.log`/`weights-local-status.json` in the local install for current status.
