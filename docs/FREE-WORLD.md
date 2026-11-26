# Free World (0.14.2)

Enter through FREE WORLD at the north end of the hotel corridor (E). The shared room with a matte stone-gray floor and white walls is 300 × 300 × 24 m, with a protected entrance and half-metre construction grid.

| Control | Action |
|---|---|
| B | Toggle build / PvP tool |
| 1–4 in build mode | 0.5 / 1 / 2 / 4 m |
| 1–3 in PvP mode | Choose existing game weapon model |
| I in PvP mode | Weapon inventory |
| 0 / T in PvP mode | Holster / reload |
| Q | Cube, wall panels or floor slab |
| E / right click | Place block |
| G / left click in build mode | Remove own block |
| Left click in PvP mode | Selected game weapon |
| I / phone Free World app | Choose size, shape, texture and tool |
| E at HOTEL door / phone | Return to corridor |

All accounts in the same server share the same persisted construction space. Blocks snap to a grid and have collision; supported surfaces and stacked blocks can be used as platforms. Players can remove their own blocks only. The server protects the spawn area, bounds placement, prevents overlapping blocks and enforces 240 blocks/account and 1,200 total. The phone app accepts local PNG/JPEG/WebP up to 8 MiB, re-encodes to a JPEG with longest dimension at most 512 px and at most 256 KiB, and applies it to all faces of newly placed blocks. Images are visible to everyone in Free World. 8 images/account, 64 globally, delete unused own images. Texture and block data are stored in free_world.sqlite3 in the existing data volume. No external URL fetch. The existing game weapon models are selectable in PvP with shared server-controlled game damage, health, respawn and cooldown; the private-room damage system is not used. Existing blocks keep their coordinates; the entrance and spawn move to the new outer wall. All Free World participants are vulnerable except during short spawn protection. No cross-world targets. Presence and scores are session-based; construction persists. Desktop and touch are supported; immersive XR is not enabled in this initial version. Account and admin permissions remain unchanged.

## Shared models, sky and damage (0.14.3)
Select a private GLB in the Free World phone app, or import a new one there. Placement explicitly copies the asset into shared storage; the private original is never published automatically. The selected build size defines a conservative cubic collider. Four model placements per account, 16 globally, 128 MiB of shared model bytes. Removing the final public copy removes its shared bytes but never the private original. Blocks and model placements have persistent HP, use hotel game damage classes, and can be repaired or removed by their owners. Destroyed placements reserve their grid footprint but do not collide; R repairs and G removes them when aimed at their footprint. Model impacts use authoritative grid displacement rather than independent Rapier rigid-body simulation. The roof is open, the build height remains 24 m, and the 20-minute synchronized sky cycle includes sunrise, sunset, sun and moon. HUD controls appear briefly on entry or mode change; the phone retains all controls.
