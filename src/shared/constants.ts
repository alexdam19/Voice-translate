/** Open world is a square of MAP_SIZE x MAP_SIZE tiles; one tile is one world unit. */
export const MAP_SIZE = 640;
export const CENTER = MAP_SIZE / 2;

/** Size of one deck cell on a tank, in world units. */
export const CELL = 0.5;

/** Terrain chunk size in tiles (renderer). */
export const CHUNK = 32;

export const DEFAULT_PORT = 8787;

/** Hard cap on people aboard the main fortress. Past this you need an Outrider. */
export const MAX_BASE_CREW = 15;
/** Officers (main crew) are the ones with active abilities, bound to these keys. */
export const OFFICER_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF'] as const;
export const OFFICER_LABELS = ['Q', 'W', 'E', 'R', 'D', 'F'] as const;
export const OFFICER_SLOTS = OFFICER_KEYS.length;

/** The Dead Zone arena, in tiles. */
export const ARENA_SIZE = 160;
