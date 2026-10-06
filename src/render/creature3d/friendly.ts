import type { EnemyDef } from '../../game/enemyDefs';

/**
 * The Hangar's own people and machines, drawn from the same 3D pipeline as the enemies: everyone on the base in a
 * powered suit, clean white plates with a cyan visor like a Mantis or a Titanfall pilot (the troopers armed, the
 * crew and pilots lighter, the officers in dark plate with gold), the workers in yellow power-loader frames, and the
 * walkers, hover tanks and gunships in the base's white and cyan. Each entry is a pseudo-kind with the name the
 * model picker reads.
 */
const def = (name: string, color: string): EnemyDef => ({ name, color, faction: 'cyborg' }) as unknown as EnemyDef;

export const FRIENDLY = {
  trooper: { kind: 'f_exo_trooper', def: def('Exosuit Trooper', '#d8dee6'), size: 2.6 },
  loader: { kind: 'f_power_loader', def: def('Power Loader Exosuit', '#e0a020'), size: 3.4 },
  crew: { kind: 'f_exo_crew', def: def('Exosuit Crew', '#a8b4c2'), size: 2.3 },
  officer: { kind: 'f_exo_officer', def: def('Exosuit Officer', '#2c3644'), size: 2.5 },
  pilot: { kind: 'f_exo_pilot', def: def('Exosuit Pilot', '#3c4c5e'), size: 2.3 },
  mantis: { kind: 'escort_mantis', def: def('Mantis Walker Mech', '#d8dee6'), size: 9 },
  raptor: { kind: 'escort_raptor', def: def('Raptor Hover Tank', '#c8d0da'), size: 10 },
  wasp: { kind: 'escort_wasp', def: def('Wasp Gunship', '#cfd6de'), size: 8 },
} as const;

export type FriendlyKey = keyof typeof FRIENDLY;
