# Free World (0.14.0)

Enter through FREE WORLD at the north end of the hotel corridor (E). The shared white room is 80 × 80 × 24 m, with a protected entrance and half-metre construction grid.

| Control | Action |
|---|---|
| B | Toggle build / PvP tool |
| 1–4 | 0.5 / 1 / 2 / 4 m |
| Q | Cube, wall panels or floor slab |
| E / right click | Place block |
| G / left click in build mode | Remove own block |
| Left click in PvP mode | Abstract game pulse |
| I / phone Free World app | Choose size, shape, texture and tool |
| E at HOTEL door / phone | Return to corridor |

All accounts in the same server share the same persisted construction space. Blocks snap to a grid and have collision; supported surfaces and stacked blocks can be used as platforms. Players can remove their own blocks only. The server protects the spawn area, bounds placement, prevents overlapping blocks and enforces 240 blocks/account and 1,200 total. The phone app accepts local PNG/JPEG/WebP up to 8 MiB, re-encodes to a JPEG with longest dimension at most 512 px and at most 256 KiB, and applies it to all faces of newly placed blocks. Images are visible to everyone in Free World. 8 images/account, 64 globally, delete unused own images. Texture and block data are stored in free_world.sqlite3 in the existing data volume. No external URL fetch. The PvP tool is a fictional pulse with server-controlled health and respawn, not the private-room weapon simulation. All Free World participants are vulnerable except during short spawn protection. No cross-world targets. Presence and scores are session-based; construction persists. Desktop and touch are supported; immersive XR is not enabled in this initial version. Account and admin permissions remain unchanged.
