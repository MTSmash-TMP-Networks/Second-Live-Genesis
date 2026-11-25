# Rocketbox player characters

Second Live uses the 20 prepared Microsoft Rocketbox characters from [Avatar Studio](https://github.com/memoriesrohit/avatar-studio) at revision `2fd9ec82fbe1613d40ae38aadcca3f410725f740`. They carry professionally modelled faces, textured clothing, rigged meshes, facial morph targets and native idle/walk motion capture. They are downloaded only at Docker build time, with each original Git blob hash, size, rig, embedded textures, outfit parts and animation clips verified.

The same local GLB loader serves the character studio, the player's third-person view and other guests. The studio uses the original Poly Haven studio HDRI, neutral lighting and soft shadows. Selecting an outfit or colour on the same model updates the already loaded materials, without downloading the model again. The browser caches at most four GLB byte buffers.

## Profile compatibility

Existing 14 numeric appearance fields are preserved in stored profiles; a new optional model index defaults to the standard identity (Ryan, or Emma for the old curvy body preset). The server accepts both old and new profile shapes. The studio exposes the 20 actual identities, height, original outfit, business suit, shirt, T-shirt and fabric colours. Hair, face, skin, eyes, beard, glasses and shoes are part of the chosen identity rather than independent sliders. Trousers can be separately tinted with shirt or T-shirt; the original and business outfits are combined garments. Older appearance values remain stored but do not all affect the new identity.

Native idle and walk clips are used; the supplied GLBs do not include dedicated run and crouch motion capture. Sprint uses faster walk playback, and crouch uses a slower walk or idle until dedicated clips are added. Gameplay movement and collision states are unchanged. The concierge remains on its existing separate uniform rig.

## Verification

Docker checks the pinned assets and all existing server/client smoke tests. To test browser GLB loading and outfit changes in a built server, install Playwright and Chromium and run:

    node scripts/realistic_avatar_browser_smoke.mjs http://127.0.0.1:8765

Verify both studio views, actual colour rendering, multiplayer avatars and mobile performance in a real browser. The old procedural avatar is retained only as a game emergency fallback, never as the studio preview.

## Licenses

See AVATAR-LICENSE.txt (Rohit Biradar MIT, Microsoft Rocketbox MIT, Poly Haven CC0). The prior Ara/MakeHuman generator is no longer built or used.
