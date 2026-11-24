# All external resources are fetched at build time, never in the player's browser.
FROM node:22-bookworm-slim AS renderer
WORKDIR /build
RUN npm install --no-audit --no-fund --save-exact three@0.170.0 esbuild@0.25.10 @dimforge/rapier3d-compat@0.17.3
COPY web/engine/renderer.js web/engine/physics.js web/engine/architecture.js web/engine/xr.js web/engine/room_decor.js web/engine/shotfx.js ./
COPY scripts/physics_smoke.mjs scripts/visual_smoke.mjs ./
# Rapier 0.17.3 advertises a CJS entry that esbuild may interpret as ESM.
# Bypass package entry resolution for both builds; use the same embedded-WASM ESM file.
RUN test -s node_modules/@dimforge/rapier3d-compat/rapier.es.js
RUN ./node_modules/.bin/esbuild physics_smoke.mjs --bundle --platform=node --format=esm --alias:@dimforge/rapier3d-compat=./node_modules/@dimforge/rapier3d-compat/rapier.es.js --outfile=/build/physics_smoke.bundle.mjs && node /build/physics_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild visual_smoke.mjs --bundle --platform=node --format=esm --outfile=/build/visual_smoke.bundle.mjs && node /build/visual_smoke.bundle.mjs
RUN ./node_modules/.bin/esbuild renderer.js --bundle --platform=browser --format=esm --alias:@dimforge/rapier3d-compat=./node_modules/@dimforge/rapier3d-compat/rapier.es.js --target=es2020 --minify --outfile=/build/renderer.bundle.js && cp node_modules/three/LICENSE /build/THREE-LICENSE.txt

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

FROM decor AS photos
COPY optional-photos/ /build/optional-photos/
ARG SECOND_LIVE_PHOTO_REFRESH=0
ARG SECOND_LIVE_WIKIMEDIA_CONTACT=""
RUN echo "Photo refresh: ${SECOND_LIVE_PHOTO_REFRESH}" && SECOND_LIVE_WIKIMEDIA_CONTACT="${SECOND_LIVE_WIKIMEDIA_CONTACT}" python -u download_assets.py --output /build/polyhaven --photos-only --local-photos /build/optional-photos

FROM python:3.13-slim
WORKDIR /app
COPY server.py updater_api.py /app/
COPY web/ /app/web/
COPY --from=renderer /build/renderer.bundle.js /app/web/engine/renderer.bundle.js
COPY --from=renderer /build/THREE-LICENSE.txt /app/web/engine/THREE-LICENSE.txt
COPY --from=photos /build/polyhaven /app/web/assets/polyhaven/
ARG SECOND_LIVE_REVISION=local
LABEL org.opencontainers.image.revision=${SECOND_LIVE_REVISION}
ENV SECOND_LIVE_REVISION=${SECOND_LIVE_REVISION}
ENV PYTHONUNBUFFERED=1 SECOND_LIVE_BIND=0.0.0.0 SECOND_LIVE_PORT=8765 SECOND_LIVE_DATA_DIR=/app/data
RUN useradd -m appuser && mkdir -p /app/data && chown -R appuser:appuser /app/data
USER appuser
VOLUME ["/app/data"]
EXPOSE 8765
CMD ["python", "server.py"]
