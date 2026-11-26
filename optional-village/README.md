# Village model bank

Prepared village buildings use the original modular geometry and embedded textures
from Quaternius – Downtown City MegaKit Standard (CC0 1.0).
https://quaternius.com/packs/downtowncitymegakit.html

## Automatic build-time installation (0.15.12+)

The repository expects the original prepared archive at this exact path:

`optional-village/Second-Live-Quaternius-Village-Models.zip`

Original archive size: 11,550,906 bytes.
SHA-256: `e120add63a04ea6fae2e929ce8288f411e3a5e5bdaf58b8e0730adc768b8e09c`.

Once this ZIP is committed, every normal Docker build and in-game GitHub update
automatically checks and installs the four bundled GLBs. A corrupt or modified
archive fails the build instead of replacing the current working game. The
ZIP must contain the four exact filenames at its root:

- house-a.glb
- house-b.glb
- shop-a.glb
- shop-b.glb

The original package also includes LICENSE-Quaternius.txt and ASSET-REPORT.json,
which are installed with the models. The original large Standard archive is
**not** the prepared ZIP. All models must pass the existing static GLB validator.
The build does not download third-party models or expose the ZIP in the game UI.

Existing manually installed model banks in the persistent data volume take
precedence over bundled files. They are never overwritten by an update.

If the ZIP is absent, the build still accepts individually supplied GLBs in
this directory; missing models use the original procedural facades.

## Optional administrator import

To install a custom prepared model bank, open Smartphone → System →
Dorfmodelle → Eigenes Modellpaket importieren (optional). Select a ZIP with
the four root filenames above and reload the game after installation.

ZIP maximum 24 MiB; GLBs maximum 16 MiB each, self-contained static uncompressed
glTF 2.0, up to 200,000 triangles per model, up to 16 embedded textures and
the existing room-model validation limits. No arbitrary paths or archive
extraction to disk. All four models are validated before atomic installation.
Model files persist in village_assets.sqlite3 in the existing Docker data volume.
The manifest and assets are served from fixed same-origin paths; upload
requires the activated administrator account.

Doors face local +Z before placement. The renderer rotates the buildings
toward the street and fits them to existing collision footprints.
The prepared assets are modular assemblies of the free Standard source,
not the paid Source project; engine-specific custom shaders are not included.
