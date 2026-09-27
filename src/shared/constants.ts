/**
 * The open world is a square of MAP_SIZE x MAP_SIZE tiles (one tile is one world unit). It's streamed in chunks,
 * so it can be huge: crossing it takes the best part of half an hour at a fortress's pace.
 */
export const MAP_SIZE = 10240;
export const CENTER = MAP_SIZE / 2;

/** Terrain chunk size in tiles (renderer). */
export const CHUNK = 32;

export const DEFAULT_PORT = 8787;

/** Hard cap on people aboard the main fortress. Past this you need an Outrider. */
export const MAX_BASE_CREW = 15;
/** Repair kit hotkey (cards use 1-4). */
export const KIT_KEY = 'Digit5';

/** The Dead Zone arena, in tiles. */
export const ARENA_SIZE = 160;
