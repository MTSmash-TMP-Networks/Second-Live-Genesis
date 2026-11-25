# Realistic player characters

Second Live uses Ara 3D Gen 0.16.0 and its matching locally served MakeHuman character dataset. The original 14 stored appearance settings remain valid. The default for new profiles is short dark hair, stubble, a dark jacket, grey shirt, dark jeans and light sneakers. Existing profiles keep their choices. Some clothing and glasses choices are approximations of the original editor labels.

The player model is generated locally in a background browser worker; no account identifiers or external avatar service are involved. Rigged GLB models are loaded with the existing Three.js loader. Idle, walk, run and crouch-idle animations play in place; crouched movement currently uses the crouch-idle pose. The concierge retains its legacy uniform and greeting rig. If generation fails in the game, the procedural emergency model remains available. The character studio never displays the old procedural fallback in the browser: it retains only the last completed realistic preview while the new one is loading, with a retry button and the actual error message on failure.

The npm generator and matching data are isolated in their own Docker stage; the existing CSP, account storage, movement and update mechanisms remain unchanged. The provider is loaded only when a browser needs a player character. Generation is queued, identical requests share their result, and the cache holds four generated GLBs. No external CDN requests are required at runtime.

## Verification

The normal Docker build checks the old avatar tests, all existing scene tests, the profile mapping against the pinned upstream schema and the upstream animation catalog. It also exports two genuine textured starter GLBs (current default and pre-0.11.6 default), validating their rig, embedded textures and all four animation clips. Both are served locally and bypass browser generation for the matching profiles. To test the real GLB in a running browser install Playwright and Chromium, then run:

    node scripts/realistic_avatar_browser_smoke.mjs http://127.0.0.1:8765

Verify both front/back views in the character studio, profile changes, two guests in the hotel and third-person walking, running and crouching. The browser smoke test checks the rig, animation count and absence of cross-origin HTTP requests.

## Licences

See AVATAR-LICENSE.txt. Upstream: https://github.com/olatunde85/3d-gen
Library guide: https://ara3dgen.com/docs/library/
