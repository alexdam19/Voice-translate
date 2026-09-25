/** Size of one tile in world pixels. */
export const TILE = 16;

/** Open world dimensions in tiles. Six zones of ZONE_W tiles each. */
export const WORLD_W = 4800;
export const WORLD_H = 400;
export const ZONE_W = 800;

/** Chunk size (tiles) used by the renderer's tile cache. */
export const CHUNK = 32;

export const GRAVITY = 1500;
export const MAX_FALL = 980;

/** Seconds for a full day/night cycle. */
export const DAY_LENGTH = 720;

/** The Dead Zone (multiplayer warzone) map, in tiles. */
export const WARZONE_W = 1100;
export const WARZONE_H = 240;

export const DEFAULT_PORT = 8787;

export const INV_SLOTS = 40;
export const HOTBAR = 10;
/** Slots in the secure pouch: items here survive death in the Warzone. */
export const SECURE_SLOTS = 3;
