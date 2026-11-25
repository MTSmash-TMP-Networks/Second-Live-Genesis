# Depth Anything 3 – experimental local runtime (v0.8.0)

DA3-Small (Apache 2.0): https://huggingface.co/depth-anything/DA3-SMALL
Source: https://github.com/ByteDance-Seed/Depth-Anything-3, pinned source revision
`3d835ec1a5802d64a8b8b15f817a1ab54809bfe4`, model revision `e08cab6`.

## Installation after the game update

The game update itself does not download PyTorch or replace the host updater. First install v0.8.0 via the game's system app. The optional model is a separate, non-root Docker service, so a failed dependency or model download cannot prevent the game from starting.

From the original Second Live installation directory, run:

```bash
sudo bash "$(sudo python3 -c 'import json; print(json.load(open(".sl-update/active.compose.json"))["services"]["second-live"]["build"]["context"])')/scripts/start_da3.sh" cpu
```

For a normal checkout containing these files: `sudo bash scripts/start_da3.sh cpu`. CPU mode is the initial test. CUDA mode (`cuda` instead of `cpu`) requires a compatible NVIDIA GPU, driver and NVIDIA Container Toolkit. The CUDA wheel choice targets CUDA 12.8; not every older NVIDIA GPU is supported. No GPU speed has been validated.

The script builds the isolated image, joins the existing Compose network using the alias `second-live-da3` and starts the service without publishing its port. The Hugging Face safetensors checkpoint is downloaded on first start, then cached in a dedicated Docker volume. The scanner shows DA3-Small and CPU/CUDA once model initialization succeeds. If unavailable, the old COLMAP method remains available and is explicitly labelled. Scan photos are sent only to the local container; there is no remote inference call.

The script prints the container name. Inspect it using `sudo docker logs <container-name>` and `sudo docker inspect <container-name>`. If initialization fails, the game continues without DA3. For complete Compose teardown, remove the independent sidecar first (`sudo docker rm -f <container-name>`); the model cache volume is retained.

## Scan behaviour

- Four images start the first live reconstruction. DA3 is preferred once ready, including existing scans that previously filled the 60-image limit. Take overlapping pictures from slightly shifted positions.
- Live inference jointly estimates depth, confidence and relative world-to-camera poses for up to eight evenly spaced keyframes. Final inference uses up to sixteen. These are bounded test budgets, not a requirement to capture all 60.
- Points must pass confidence and approximate cross-view predicted-depth consistency checks. A positive status is evidence of model consistency, not measured room coverage. The final preview can include small estimated surface patches. It is not a closed, metric, collision-ready model.
- Once a usable DA3 preview exists, the player may submit after four or more images. The final calculation may still fail; in that case more perspectives can be added. COLMAP remains the fallback (minimum eight pictures).
- No global alignment of streaming windows, native AR tracking, LiDAR, or guaranteed real-time performance is implemented. Successive previews can change coordinates. The user must inspect the actual 3D model.
- Synthetic geometry tests and an upstream-model construction/import check run in the optional DA3 Docker build. A real iPhone and full model inference are required for acceptance; the CPU/GPU latency is not measured.

