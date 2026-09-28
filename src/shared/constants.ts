/**
 * The open world, The Crater, is a square of MAP_SIZE x MAP_SIZE tiles (one tile is one metre): 140 km across,
 * streamed in chunks around you.
 */
export const MAP_SIZE = 140000;
export const CENTER = MAP_SIZE / 2;

/** Terrain chunk size in tiles (renderer). */
export const CHUNK = 32;

export const DEFAULT_PORT = 8787;

/** Hard cap on people aboard the main fortress. Past this you need an Outrider. */
export const MAX_BASE_CREW = 15;
/** Repair kit hotkey (cards use 1-4). */
export const KIT_KEY = 'Digit5';

/** The Dead Zone arena, in tiles. */
/** The Dead Zone is scaled up so Titan Crawlers (200 m) can fight in it. */
export const ARENA_SCALE = 6;
export const ARENA_SIZE = 160 * ARENA_SCALE;
