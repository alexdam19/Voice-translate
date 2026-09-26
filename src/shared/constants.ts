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
/**
 * Officers (main crew) are the ones with active abilities, bound to these keys. W A S D drive.
 * The first 4 seats are open from the start; Z and X unlock through Personnel research (COMMAND).
 */
export const OFFICER_KEYS = ['KeyQ', 'KeyE', 'KeyF', 'KeyG', 'KeyZ', 'KeyX'] as const;
export const OFFICER_LABELS = ['Q', 'E', 'F', 'G', 'Z', 'X'] as const;
export const OFFICER_SLOTS = OFFICER_KEYS.length;
export const BASE_OFFICER_SEATS = 4;
/** Arsenal actives from deck modules. */
export const ACTIVE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const;
export const ACTIVE_SLOTS = ACTIVE_KEYS.length;
export const ULT_KEY = 'KeyR';
export const KIT_KEY = 'Digit5';

/** The Dead Zone arena, in tiles. */
export const ARENA_SIZE = 160;
