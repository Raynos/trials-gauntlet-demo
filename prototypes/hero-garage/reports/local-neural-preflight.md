# Separate neural 3D experiment — September 16, 2026

Current scope: the user directed the original Blender/licensed-asset production plan to proceed without either neural model. Hunyuan is a separate parallel experiment only. TRELLIS is paused. This report preserves setup history; none of these results is a dependency or acceptance gate for the main build.

The user requested downloading/running TRELLIS.2 and/or Hunyuan3D on this laptop for the existing HERO_GARAGE production goal. This investigation does not change target01 or accept generated assets automatically.

## Latest isolated result

Hunyuan shape inference succeeded in 75.0 seconds (77.35 seconds total, nonisolated timing), exporting 226,686 vertices and 454,454 faces. Evidence: `/Users/raynos/ai-tools/Hunyuan3D-2.1-mlx/outputs/hero-head-a1/shape-report.json` and `shape.glb`. The first attempt failed in empty SDF refinement; a documented local scheduler fix changes the final sigma from 0 to 1 to match the bundled PyTorch implementation. Original failure and `local-scheduler-fix.patch` are preserved. An isolated 8-second WebKit orbit exposes large rear cut planes, perforated spiky hair and fused facial detail. The raw geometry is rejected in its current state; the bounded diagnosis is complete and painting is stopped. Exact repetition and saved-latent fp32 decoding retain the defects, with 1,637 zero-crossing endpoints adjacent to undefined field samples. An aspect-ratio/border preprocessing mismatch was identified but not causally tested. Details: `/Users/raynos/ai-tools/Hunyuan3D-2.1-mlx/outputs/hero-head-diagnostic/DIAGNOSIS.md`. Evidence stays outside the game in `outputs/hero-head-a1/review/parent-review.json`. No visual acceptance or main-catalog integration is claimed. The setup statements below are historical.

## Machine and selected route

Measured locally: Apple M5 Max, 40-core GPU, 128 GB unified memory, arm64, macOS 26.5, Metal 4; approximately 2.8 TiB free disk. Unified memory capacity is sufficient for the community port's reported configuration, but does not provide CUDA compatibility.

The [official Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2) implementation specifies Linux/NVIDIA/CUDA. The selected [Jourloy Apple Silicon fork](https://github.com/Jourloy/TRELLIS.2) replaces required CUDA operations with Metal implementations and provides a reproducible headless CLI. Its supported route is PyTorch MPS; its MLX backend is experimental. Do not describe this as official Microsoft macOS support or as a fully MLX inference run.

Local installation: `/Users/raynos/ai-tools/TRELLIS.2-apple`, source revision `2ddae4f97d7ab3e9a64374bcaa459a3c82d0ea4b`, isolated `.venv`, pinned Metal dependencies. Source, packages and model weights remain outside this game repository. `LOCAL-SETUP.md`, `setup-local.log`, `weights-local-status.json` and `weights-local.log` in that directory record execution. Dependency installation is complete and actual local Metal probes passed. Public-weight download remains in progress; actual model inference is not yet demonstrated.

## License and access decisions

- TRELLIS.2 code and Microsoft weights are MIT. Dependency licenses are separate.
- DINOv3 is essential to image conditioning and has its own gated license. The official [Meta model page](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m) requires user access approval. A read-only metadata request returned HTTP401 with no configured Hugging Face token. No alternate mirror or gate bypass is used. The user was asked to accept that license and run `.venv/bin/hf auth login` locally, never send a token through chat.
- The optional RMBG2 background model is not downloaded. A recorded local patch skips eager loading when `--background keep` is selected. Prepared RGBA inputs will avoid that dependency.
- The [Hunyuan3D2.1 license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE) excludes EU, UK and South Korea, including output use there. The user explicitly confirmed intended use within an excluded territory. The user subsequently explicitly directed local trials of both Hunyuan3D2.1 and TRELLIS.2, so a Hunyuan MLX environment and public-weight trial are now being prepared. This records the changed user direction; the upstream restriction remains unchanged. The [dgrauet MLX fork](https://github.com/dgrauet/Hunyuan3D-2.1-mlx), inspected at `5fe21945b790fbb7fb28c510e89babd7b9feabe6`, claims both shape and PBR paint on Apple Silicon, but its port does not remove upstream license restrictions. Source inspection is complete; isolated runtime installation is now in progress. No Hunyuan generation success is claimed yet.

## Proof and production gates

First require local Metal capability probes to pass. Then, after licensed DINO access and required weights are present, run a bounded seeded512 image-to-mesh/PBR smoke test. Retain exact input hash, source/dependency revisions, model revisions, timing, peak memory, raw GLB, PBR GLB and metadata. An upstream author's successful Mac run is a feasibility signal, not our execution evidence.

For the hero, evaluate an isolated head from the already frozen reference authority. Original face information is limited; generated hidden detail cannot be represented as recovered truth. Review the resulting textured GLB in the existing Three.js comparison/orbit/relight harness. Target likeness, real eyes/lids, hair silhouette and material response still decide Milestone A.

A generated static mesh is starting material. Deliberate facial retopology, separate eyes, hair treatment, garment construction, rigging, deformation, bike mechanics and mobile optimization remain required by the production plan. Do not generate one fused rider-and-bike mesh and label the plan complete. At most two bounded candidate methods on the same isolated subject; stop or change route if repair cost exceeds the value of the generated source.

## Actual local verification

`local-neural/metal-probe.json` passes with no failures: MPS matmul and SDPA, MLX matmul, Metal rasterization, Metal BVH distance, and flex_gemm sparse attention capability/parity. The supported MPS sparse-convolution integration check also passes (dense/masked/production split-K paths). Dependency versions are frozen in `local-neural/requirements.freeze.txt`; the narrowly scoped background-loader patch is retained alongside it.

The selected lightweight test run is **38 passed, 2 failed**. Both failures are in experimental MLX parity (attention max absolute discrepancy0.00118 and sparse convolution0.00250 against strict FP32 tolerances). No tolerances were relaxed. The production proof will explicitly select `--backend mps`; MLX is not validated for this run. See `local-neural/tests.txt` and `local-neural/mps-integration.txt`.

The public Microsoft model manifest is14,819,878,398 bytes (~14.82GB), plus the original sparse decoder and gated DINOv3. The existing loader eagerly loads512 and1024 models, so the full pinned manifest is being retained instead of adding another loader patch. The download process was confirmed alive at this checkpoint; use `weights-local.log`/`weights-local-status.json` in the local install for current status.

## Latest user direction

September16: user explicitly requested trying both Hunyuan3D2.1 and TRELLIS.2; original TRELLIS is not substituted. TRELLIS2 Microsoft weight download has completed. Hugging Face login now works, but the required DINOv3 weight request returns403 with the specific reason “awaiting a review from the repo authors.” No repeated login request or gated-access workaround is needed. Hunyuan3D2.1 MLX installation proceeds independently under the user’s explicit direction.

### Hunyuan MLX runtime ready; model transfer in progress

The isolated environment imports both shape and paint modules. Forty renderer tests pass; `local-neural/hunyuan-renderer-tests.txt` retains the result, and `hunyuan-requirements.freeze.txt` pins the installed environment. This proves local rendering components, not full model inference. Public converted model revision `5b1cf9ae1114c0b046d9385fd4f5ac6570df5287` was checked as ungated without a token; its file manifest is retained. Shape files total7,365,930,708 bytes; the complete model repository totals15,062,117,737 bytes. Download PID16705 is live at this checkpoint and transfers are progressing. No generation output exists yet.

The prepared first trial uses `art/neural-inputs/head-front-reference.png`, an unchanged-pixel crop from the already admitted front-view design, SHA256 `44e47aa11405235c2fc971d08d5b0735b79033c0a7bb0547200d0919b75d882e`. Input extraction and authority are recorded beside it. The local runner `run_local_trial.py` records settings, exact source/model/input identity, timings and generated asset hashes under `outputs/hero-head-a1`. Run shape with50 steps, seed42 and256 extraction resolution; paint follows with6 views at512 and a4096 atlas. The agent will start when the relevant downloaded snapshot is complete. A copied recipe in this report folder is documentary; execute it from the installed runtime directory, not the report folder.
