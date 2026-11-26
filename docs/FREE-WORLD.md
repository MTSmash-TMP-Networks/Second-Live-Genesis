# Free World (0.14.6)

Enter through FREE WORLD at the north end of the hotel corridor (E). The shared grassland is 300 × 300 m with glacier cliffs, a protected entrance, a 24 m build ceiling and a half-metre construction grid (not drawn). A concealed sealed door is reserved for a future world.

| Control | Action |
|---|---|
| I | Shared inventory: weapons, building block and own 3D models |
| 1–3 / T | Select game weapon / reload |
| 4 / mouse wheel | Select reusable building block with configured size, shape and image; remains selected after new placement |
| E | Pick up own intact object or place held object |
| + / − | Model: 0.1 m increments (0.1–4 m); block: 0.5 m increments (0.5–4 m) |
| Q / F | Rotate held object by 90 degrees |
| B | Attach held model to aimed wall |
| G | Place held object |
| 0 | Holster weapon or cancel held preview |
| R / Delete | Repair / remove own aimed object |
| Left click | Use selected game weapon |
| E at HOTEL door / phone | Return to corridor |

All accounts in the same server share the same persisted construction space. Blocks snap to a grid and have collision; supported surfaces and stacked blocks can be used as platforms. Players can remove their own blocks only. The server protects the spawn area, bounds placement, prevents overlapping blocks and enforces 240 blocks/account and 1,200 total. The phone app accepts local PNG/JPEG/WebP up to 8 MiB, re-encodes to a JPEG with longest dimension at most 512 px and at most 256 KiB, and applies it to all faces of newly placed blocks. Images are visible to everyone in Free World. 8 images/account, 64 globally, delete unused own images. Texture and block data are stored in free_world.sqlite3 in the existing data volume. No external URL fetch. The existing game weapon models are selectable directly from the inventory with shared server-controlled game damage, health, respawn and cooldown; the private-room damage system is not used. Existing blocks keep their coordinates; the entrance and spawn move to the new outer wall. All Free World participants are vulnerable except during short spawn protection. No cross-world targets. Presence and scores are session-based; construction persists. Desktop and touch are supported; immersive XR is not enabled in this initial version. Account and admin permissions remain unchanged.

## Shared models, sky and damage (0.14.3)
Select a private GLB in the Free World phone app, or import a new one there. Placement explicitly copies the asset into shared storage; the private original is never published automatically. Model size is independent of the block grid; the selected metric size defines a conservative cubic collider. Four model placements per account, 16 globally, 128 MiB of shared model bytes. Removing the final public copy removes its shared bytes but never the private original. Blocks and model placements have persistent HP, use hotel game damage classes, and can be repaired or removed by their owners. Destroyed placements reserve their grid footprint but do not collide; R repairs and Delete removes them when aimed at their footprint. Model impacts use authoritative grid displacement rather than independent Rapier rigid-body simulation. The roof is open, the build height remains 24 m, and the 20-minute synchronized sky cycle includes sunrise, sunset, sun and moon. HUD controls appear briefly on entry or object selection; the phone retains all controls.

## Unified inventory (0.14.4)
There is no build/PvP mode toggle. All controls remain available in the shared world; taking an object holsters the selected weapon, and weapon selection cancels the held preview. Choose or import a GLB, then select **Modell aufnehmen**. Existing intact owned objects can be picked up and edited with E. Changes are committed atomically when placed, preserving the object ID, asset, health and texture. The original shared placement remains until the new location is accepted; both old and new locations must be within reach. Model positions and 90-degree rotations are stored independently of the grid, with revision checks for concurrent edits. Blocks remain snapped to the half-metre grid and preserve selected image textures. Shared models still use conservative box collisions and server-controlled impact displacement, not the full private-room rigid-body simulation.

## Wheel inventory and flashlight (0.14.6)
Mouse wheel cycles empty hand, three weapons and the reusable block in both directions. Rotating or resizing the new block updates the current preset. Existing objects and held GLB models still require deliberate cancellation. The smartphone flashlight app toggles a local, 28 m directional spotlight in the room, hotel corridor and Free World; it remains on when the phone is closed and across transitions. Other clients do not see the beam. Immersive VR does not use the lamp.
