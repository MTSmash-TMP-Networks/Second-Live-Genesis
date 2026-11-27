# All external resources are fetched at build time, never in the player's browser.
FROM node:22-bookworm-slim AS renderer
WORKDIR /build
RUN npm install --no-audit --no-fund --save-exact three@0.170.0 esbuild@0.25.10 @dimforge/rapier3d-compat@0.17.3
COPY web/engine/renderer.js web/engine/flashlight.js web/engine/physics.js web/engine/architecture.js web/engine/xr.js web/engine/room_decor.js web/engine/hotel_room.js web/engine/hotel_layout.json web/engine/hotel_reference.json web/engine/shotfx.js web/engine/impact_marks.js web/engine/display_prop.js web/engine/wall_layout.js web/engine/wall_mesh.js web/engine/hand_mesh.js web/engine/avatar_hands.js web/engine/portal_door.js web/engine/optional_asset.js web/engine/hotel_lobby.js web/engine/lobby_layout.js web/engine/lobby_layout.json web/engine/hotel_connections.js web/engine/character.js web/engine/character_options.json web/engine/realistic_character.js web/engine/rocketbox_look.js web/engine/rocketbox_manifest.json web/engine/room_customization.js web/engine/avatar_room_pose.js web/engine/free_world.js web/engine/village.js web/engine/village_damage.js web/engine/village_landscape.js web/engine/village_interior.js web/engine/free_weather.js web/engine/free_terrain.js web/engine/free_nature.js web/engine/free_world_layout.json ./
COPY web/engine/wall_layout.json /build/wall_layout.json
COPY scripts/physics_smoke.mjs scripts/visual_smoke.mjs scripts/realistic_avatar_smoke.mjs scripts/room_customization_smoke.mjs ./
COPY web/game.js web/index.html web/updater.js web/audio.js scripts/game_only_smoke.mjs ./
RUN node --check game.js && node --check updater.js && node game_only_smoke.mjs
# Rapier 0.17.3 advertises a CJS entry that esbuild may interpret as ESM.
# Bypass package entry resolution for both builds; use the same embedded-WASM ESM file.
RUN test -s node_modules/@dimforge/rapier3d-compat/rapier.es.js
RUN ./node_modules/.bin/esbuild physics_smoke.mjs --bundle --platform=node --format=esm --alias:@dimforge/rapier3d-compat=./node_modules/@dimforge/rapier3d-compat/rapier.es.js --outfile=/build/physics_smoke.bundle.mjs && node /build/physics_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild visual_smoke.mjs --bundle --platform=node --format=esm --outfile=/build/visual_smoke.bundle.mjs && node /build/visual_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild realistic_avatar_smoke.mjs --bundle --platform=node --format=esm --outfile=/build/realistic_avatar_smoke.bundle.mjs && node /build/realistic_avatar_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild room_customization_smoke.mjs --bundle --platform=node --format=esm --outfile=/build/room_customization_smoke.bundle.mjs && node /build/room_customization_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild renderer.js --bundle --platform=browser --format=esm --alias:@dimforge/rapier3d-compat=./node_modules/@dimforge/rapier3d-compat/rapier.es.js --target=es2020 --minify --outfile=/build/renderer.bundle.js && cp node_modules/three/LICENSE /build/THREE-LICENSE.txt

# Independently cached, pinned and integrity-checked finished Rocketbox GLBs.
FROM python:3.13-slim AS realistic-avatar
WORKDIR /build
COPY scripts/download_rocketbox.py ./download_rocketbox.py
COPY web/engine/rocketbox_manifest.json ./rocketbox_manifest.json
RUN python -u download_rocketbox.py --manifest rocketbox_manifest.json --output /build/rocketbox

FROM python:3.13-slim AS assets
WORKDIR /build
COPY scripts/download_assets.py ./download_assets.py
RUN python -u download_assets.py --output /build/polyhaven --core-only

# Optional imagery is isolated: a rate limit never invalidates the room cache.
FROM assets AS realism
COPY scripts/download_realism.py ./download_realism.py
RUN python -u download_realism.py --output /build/polyhaven

FROM realism AS decor
COPY scripts/download_decor.py ./download_decor.py
RUN python -u download_decor.py --output /build/polyhaven

FROM decor AS hotel-assets
COPY scripts/download_hotel_assets.py ./download_hotel_assets.py
RUN python -u download_hotel_assets.py /build/polyhaven

FROM hotel-assets AS photos
COPY optional-photos/ /build/optional-photos/
ARG SECOND_LIVE_PHOTO_REFRESH=0
ARG SECOND_LIVE_WIKIMEDIA_CONTACT=""
RUN echo "Photo refresh: ${SECOND_LIVE_PHOTO_REFRESH}" && SECOND_LIVE_WIKIMEDIA_CONTACT="${SECOND_LIVE_WIKIMEDIA_CONTACT}" python -u download_assets.py --output /build/polyhaven --photos-only --local-photos /build/optional-photos

FROM photos AS hands
COPY scripts/download_hands.py ./download_hands.py
COPY optional-hands/ /build/optional-hands/
RUN python -u download_hands.py --output /build/polyhaven --local /build/optional-hands

FROM hands AS gameprops
COPY scripts/download_m16.py ./download_m16.py
RUN python -u download_m16.py --output /build/polyhaven

FROM gameprops AS door
COPY scripts/download_door.py ./download_door.py
RUN python -u download_door.py --output /build/polyhaven

FROM door AS nature
COPY scripts/download_assets.py scripts/download_nature.py ./
RUN python -u download_nature.py /build/polyhaven

# Transcode optional Basis/KTX2 textures outside the browser, preserving meshopt geometry.
FROM renderer AS door-converted
COPY --from=nature /build/polyhaven /build/polyhaven
COPY scripts/convert_door.mjs scripts/door_texture_smoke.mjs ./
RUN node /build/door_texture_smoke.mjs && node /build/convert_door.mjs /build/polyhaven /build/node_modules/three/examples/jsm/libs/basis

FROM renderer AS avatar-check
COPY --from=hands /build/polyhaven/hands /build/hands
COPY scripts/avatar_smoke.mjs ./avatar_smoke.mjs
RUN ./node_modules/.bin/esbuild avatar_smoke.mjs --bundle --platform=node --format=esm --outfile=/build/avatar_smoke.bundle.mjs && node /build/avatar_smoke.bundle.mjs

# Game-only runtime; retained player identity uses the standard library.
FROM python:3.13-slim-bookworm
WORKDIR /app
COPY server.py updater_api.py wall_damage.py world_capture.py hotel_lobby.py game_accounts.py room_models.py free_world.py free_terrain.py village.py village_structure.py village_assets.py /app/
COPY --chmod=0644 scripts/game_only_smoke.py /app/game_only_smoke.py
COPY web/ /app/web/
COPY optional-village/ /tmp/second-live-village/
RUN python -c "from village_assets import bundle_village_assets; bundle_village_assets('/tmp/second-live-village','/app/web/assets/village')" \
    && rm -rf /tmp/second-live-village
RUN rm -f /app/web/scanner.html /app/web/panorama.html /app/web/capture.js /app/web/capture-flow.js /app/web/capture-quality.js /app/web/capture.css /app/web/panorama.js /app/web/panorama-flow.js /app/web/panorama.css /app/web/device-access.js /app/web/app.js /app/web/style.css /app/web/engine/capture-view.js
COPY --from=avatar-check /build/renderer.bundle.js /app/web/engine/renderer.bundle.js
COPY --from=renderer /build/THREE-LICENSE.txt /app/web/engine/THREE-LICENSE.txt
COPY --from=realistic-avatar /build/rocketbox/ /app/web/assets/avatars/data/
COPY docs/AVATAR-LICENSE.txt /app/web/assets/avatars/LICENSE.txt
COPY --from=door-converted /build/polyhaven /app/web/assets/polyhaven/
ARG SECOND_LIVE_REVISION=local
LABEL org.opencontainers.image.revision=${SECOND_LIVE_REVISION}
ENV SECOND_LIVE_REVISION=${SECOND_LIVE_REVISION}
ENV PYTHONUNBUFFERED=1 SECOND_LIVE_BIND=0.0.0.0 SECOND_LIVE_PORT=8765 SECOND_LIVE_DATA_DIR=/app/data
# Local Git checkouts can inherit umask 077 from sudo/start.sh. Docker COPY
# preserves source modes, so normalize only code and static assets in the image.
COPY scripts/runtime_permissions.py /app/runtime_permissions.py
RUN useradd -m appuser && mkdir -p /app/data && chown -R appuser:appuser /app/data \
    && python /app/runtime_permissions.py --normalize /app
USER appuser
# Fail the image build if the actual runtime UID cannot read code and assets.
RUN python /app/runtime_permissions.py --check /app && python -c "import server" && python -B /app/game_only_smoke.py
VOLUME ["/app/data"]
EXPOSE 8765
CMD ["python", "server.py"]
