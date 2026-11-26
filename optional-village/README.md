# Optional village models

The desired art source is **Quaternius - Downtown City MegaKit** (CC0):
https://quaternius.com/packs/downtowncitymegakit.html
https://quaternius.itch.io/downtown-city-megakit

The free Standard archive contains a subset of the modular meshes. Download it directly
from its author. Assemble the house/storefront modules in Blender as desired (or use
the prebuilt buildings if included in your edition), then export four self-contained,
static, uncompressed glTF 2.0 Binary files with embedded textures:

- house-a.glb
- house-b.glb
- shop-a.glb
- shop-b.glb

Place them in this directory before a Docker build. Maximum 32 MiB each for the
host updater's local art copy. The fixed-size building footprints remain the same
on all clients; the renderer fits each imported model to its assigned footprint.
All four models are optional. Missing or invalid files leave the built-in facades
visible. The original Quaternius files are NOT included in the repository at this
stage. Engine-specific Source shaders are not imported.

No ZIP downloads or external model requests are made by the game. The Docker image
generates a manifest of the local GLBs. Host updates preserve these four filenames
from the root installation's optional-village directory on a fresh release checkout.
A new build is needed after changing local GLBs.
