#!/usr/bin/env bash
# Run from the existing Second Live project directory. Source files may be in another checkout.
set -euo pipefail
src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(pwd)"
mode="${1:-cpu}"
[[ "$mode" == cpu || "$mode" == cuda ]] || { echo "Usage: bash scripts/start_da3.sh [cpu|cuda]"; exit 2; }
[[ -f "$root/compose.yaml" && -f "$root/.env" ]] || { echo "Run from the existing Second Live installation directory."; exit 2; }
cid="$(docker compose --project-directory "$root" --env-file "$root/.env" -f "$root/compose.yaml" ps -q second-live)"
[[ -n "$cid" ]] || { echo "Start Second Live first."; exit 2; }
project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$cid")"
network="${project}_default"
docker network inspect "$network" >/dev/null
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}' "$cid" | grep -Fxq "$network" || { echo "Game is not on expected Compose network."; exit 2; }
name="${project}-da3"
image="second-live-da3:0.8.0-$mode"
index=https://download.pytorch.org/whl/cpu
gpu=()
if [[ "$mode" == cuda ]]; then index=https://download.pytorch.org/whl/cu128;gpu=(--gpus all);fi
# Build before replacing an existing optional sidecar.
docker build -f "$src/Dockerfile.da3" --build-arg "SL_TORCH_INDEX=$index" -t "$image" "$src"
if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name";fi
docker run -d --name "$name" --network "$network" --network-alias second-live-da3 --restart unless-stopped --init --security-opt no-new-privileges --cap-drop ALL "${gpu[@]}" -e "SL_DA3_DEVICE=$mode" -v "${project}_da3_models:/models" "$image"
echo "DA3 startet getrennt vom Spiel. Modellstatus: docker logs -f $name"
echo "Das Spiel erkennt den Dienst automatisch; es wird kein externer Port geöffnet."
