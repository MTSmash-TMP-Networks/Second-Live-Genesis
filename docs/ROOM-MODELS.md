# Private room model import

Open the in-game phone → 3D-Modelle. Use the [Poly Haven furniture link](https://polyhaven.com/models/furniture) to find CC0 objects; Sketchfab is an additional source where each model's licence must be checked. Download the file locally. For separate glTF files, unpack the archive, import the .gltf into Blender and export as glTF Binary (.glb), without compression, animation or cameras. Use 1K PNG/JPEG textures for best performance.

Importing a valid GLB saves it to your account and attempts to place it in front of your character. The model manager supports selecting an item, editing its X/Z coordinates, elevation, largest dimension and yaw, saving its placement, moving it in front of you, returning it to inventory or deleting it. Placement is saved across browser sessions and server updates. Solid collision is optional and uses an axis-aligned bounding box of the scaled, rotated model; it is not a detailed triangle collider. Imported objects are static furnishings, not new physics-test weapons, and do not have damage/repair or animations. Models are private and are intentionally not included in adjacent-room or lobby snapshots.

Limits: 16 MiB per GLB, 8 models and 64 MiB per account, 512 MiB total on the server; static triangle meshes, 200,000 triangles per model, embedded PNG/JPEG textures up to 2048 pixels per side and bounded combined pixels. No URL import, external resources, Draco, meshopt, animations, skins, or cameras. The server checks GLB structure, buffer bounds, embedded resources, ownership and quotas. Models are stored as SQLite BLOBs in /app/data/room_models.sqlite3; file names do not determine filesystem paths. Backup the normal data volume to preserve models.

## Mirror

The west wall has a framed, floor-length planar mirror. On the desktop and mobile browser, the current room and player avatar are rendered into a bounded reflection target when the mirror is visible. The first-person camera hides the local avatar during the main render and reveals it only for reflection. The weapon viewmodel is excluded. WebXR uses a reflective material without a separate planar rendering pass to avoid stereo artifacts. Mirrors and private imports are not cloned into neighbouring-room views.

## Hotel staff

The server publishes a shared patrol clock. A locally advanced phase avoids stopping at each network snapshot; short clock corrections adjust playback speed without going backwards. The attendant turns in place at each end of the hall. Native Rocketbox motion is retained, but horizontal hip/root translation is removed from staff locomotion clips and the vertical loop seam is stabilized.

## Verification

Docker checks upload authorization, malformed and external GLB resources, placement, storage limits, persistence, frontend phone elements, placement math, model normalization, reflection state restoration and patrol continuity. Actual rendering and importing a textured third-party model should be tested in a browser after installation.

### Local avatar reflection (0.12.3)
The room renderer receives the active furniture posture separately from camera yaw. It uses a joint-based cosmetic sitting pose or a horizontal bed pose and restores the base animation before the next frame. An equipped cosmetic game asset follows the avatar's hand; it is independent of the hidden camera viewmodel. No weapon logic or collisions are changed. These local poses are not sent to the shared corridor, which remains unarmed. The exact fit of individual Rocketbox models on furniture should be verified visually.
