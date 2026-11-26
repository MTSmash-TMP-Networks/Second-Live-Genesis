# Village model bank

The prepared village models use the original modular geometry and textures from
Quaternius – Downtown City MegaKit Standard (CC0 1.0).
https://quaternius.com/packs/downtowncitymegakit.html

## Recommended: in-game administrator import (0.15.1+)

1. Install game version 0.15.1 or later and reload the browser.
2. Open the virtual smartphone → System → Dorfmodelle importieren.
3. Select the separately supplied prepared ZIP:
   `Second-Live-Quaternius-Village-Models.zip`.
4. Install, then reload the game.

The binary model package is supplied separately, not committed to Git.
The original large Standard archive is **not** the prepared ZIP.

The prepared ZIP contains the four exact filenames at its root:

- house-a.glb
- house-b.glb
- shop-a.glb
- shop-b.glb

Optional metadata: LICENSE-Quaternius.txt and ASSET-REPORT.json.
ZIP maximum 24 MiB; GLBs maximum 16 MiB each, self-contained static uncompressed
glTF 2.0, up to 200,000 triangles per model, up to 16 embedded textures and
the existing room-model validation limits. No arbitrary paths or archive
extraction to disk. All four models are validated before atomic installation.
Model files persist in village_assets.sqlite3 in the existing Docker data volume.
The model manifest and assets are served from fixed same-origin paths; upload
requires the activated administrator account. Doors face local +Z before
placement. The renderer rotates the buildings toward the street and fits them
to the existing collision footprints. The game still has exterior-only buildings.

## Optional build-time fallback

Place the same four GLBs in this directory before a Docker build. Locally uploaded
models in the persistent data volume take precedence over bundled files.
Absent or invalid art leaves the original procedural facades available.
No external downloads are needed.

The prepared assets are modular assemblies of the free Standard source,
not the paid Source project; engine-specific custom shaders are not included.
