/**
 * Hull classes: the choice you make at the start of a run. Every class is a land cruiser of the same size and
 * stature; they differ in what they're for. You can refit to another class at the Mothership.
 */

export type HullClass = 'juggernaut' | 'bastion' | 'ark' | 'nightrunner' | 'dredge';

export interface ClassMods {
  hp: number;
  armor: number;
  speed: number;
  /** Turn-rate multiplier. */
  turn: number;
  /** Weapon range multiplier. */
  range: number;
  /** Weapon damage multiplier. */
  dmg: number;
  /** Main battery damage multiplier (on top of dmg). */
  mainDmg: number;
  /** Troop bunks multiplier. */
  bunks: number;
  /** Roof soldiers' damage multiplier. */
  soldierDmg: number;
  cargo: number;
  harvest: number;
  /** Flat hull repair per second. */
  repair: number;
  /** Ram: how hard the hull throws creatures clear when it runs into them (and how few get a grip to climb). */
  ram: number;
  /** Nitro strength and duration multiplier. */
  nitro: number;
}

export interface ClassDef {
  key: HullClass;
  name: string;
  /** What it is, in two or three words. */
  role: string;
  desc: string;
  /** The class's signature, in one line. */
  perk: string;
  /** Pros and cons for the picker. */
  good: string[];
  bad: string[];
  color: string;
  /** Model: nose shape and glow color. */
  nose: 'ram' | 'prow' | 'box' | 'bat' | 'scoop';
  glow: 'glow_red' | 'glow_yellow' | 'glow_green' | 'glow_purple' | 'glow_orange';
  mods: ClassMods;
  /** Extra buildings it starts with (key, deck; placed wherever they fit). */
  starter: [string, number][];
}

const BASE: ClassMods = { hp: 1, armor: 0, speed: 1, turn: 1, range: 1, dmg: 1, mainDmg: 1, bunks: 1, soldierDmg: 1, cargo: 1, harvest: 1, repair: 0, ram: 1, nitro: 1 };
const mods = (m: Partial<ClassMods>): ClassMods => ({ ...BASE, ...m });

export const CLASSES: Record<HullClass, ClassDef> = {
  juggernaut: {
    key: 'juggernaut', name: 'Juggernaut', role: 'Assault breaker', color: '#ff5252', nose: 'ram', glow: 'glow_red',
    desc: 'A battering ram the size of a warship. Built to plough straight through a horde and anything standing behind it.',
    perk: 'Ram: creatures you plough into are thrown clear three times as hard, stay down longer, and few get a grip to climb aboard.',
    good: ['+35% hull', '+6% armor', '3x ram shove, fewer boarders'], bad: ['-8% speed'],
    mods: mods({ hp: 1.35, armor: 0.06, speed: 0.92, ram: 3 }),
    starter: [['armor', 0], ['armor', 0], ['armor', 0], ['armor', 0]],
  },
  bastion: {
    key: 'bastion', name: 'Bastion', role: 'Siege artillery', color: '#ffd740', nose: 'prow', glow: 'glow_yellow',
    desc: 'A rolling gun line. Out-ranges everything in the wasteland and turns its main batteries into siege guns.',
    perk: 'Siege Guns: +25% weapon range and +30% main battery damage.',
    good: ['+25% weapon range', '+30% main battery damage', '+10% weapon damage'], bad: ['-10% speed', 'Turns slower'],
    mods: mods({ range: 1.25, mainDmg: 1.3, dmg: 1.1, speed: 0.9, turn: 0.85 }),
    starter: [['hp_light', 0]],
  },
  ark: {
    key: 'ark', name: 'Ark', role: 'Troop carrier', color: '#76ff03', nose: 'box', glow: 'glow_green',
    desc: 'A barracks on treads. Bunks for a small army and a roof bristling with riflemen and grenadiers.',
    perk: 'Garrison: +60% troop bunks and roof soldiers deal +30% damage.',
    good: ['+60% troop bunks', 'Roof soldiers +30% damage', 'Starts with an extra nest'], bad: ['-10% hull'],
    mods: mods({ bunks: 1.6, soldierDmg: 1.3, hp: 0.9 }),
    starter: [['nest_grenade', 0], ['quarters', 1]],
  },
  nightrunner: {
    key: 'nightrunner', name: 'Nightrunner', role: 'Interceptor', color: '#b388ff', nose: 'bat', glow: 'glow_purple',
    desc: 'The bat-winged one. A land cruiser that drives like a sports car: outruns hordes, shakes off climbers and hunts rivals.',
    perk: 'Afterburners: +30% speed, much sharper turns, and Nitro lasts 50% longer.',
    good: ['+30% speed', '+40% turning', 'Nitro +50%'], bad: ['-18% hull'],
    mods: mods({ speed: 1.3, turn: 1.4, nitro: 1.5, hp: 0.82 }),
    starter: [['engine', 1]],
  },
  dredge: {
    key: 'dredge', name: 'Dredge', role: 'Harvester forge', color: '#ffab40', nose: 'scoop', glow: 'glow_orange',
    desc: 'A mining city. Strips resource nodes bare, hauls twice the cargo and patches itself up on the move.',
    perk: 'Strip Miner: +60% harvesting, +40% cargo and +3 hull repair per second.',
    good: ['+60% harvest speed', '+40% cargo', '+3 repair/s'], bad: ['-10% weapon damage'],
    mods: mods({ harvest: 1.6, cargo: 1.4, repair: 3, dmg: 0.9 }),
    starter: [['cargo', 1]],
  },
};

export const CLASS_LIST: ClassDef[] = Object.values(CLASSES);

export function classDef(k: string | undefined): ClassDef {
  return CLASSES[(k ?? '') as HullClass] ?? CLASSES.juggernaut;
}

/** Class upgrades bought at the Mothership make the class's strengths stronger (Mk I-III). */
export function classMods(k: HullClass, mk: number): ClassMods {
  const m = { ...CLASSES[k].mods };
  if (mk <= 1) return m;
  const f = mk - 1;
  const grow = (v: number, base: number): number => base + (v - base) * (1 + 0.5 * f);
  return {
    ...m,
    hp: m.hp > 1 ? grow(m.hp, 1) : m.hp,
    armor: m.armor * (1 + 0.5 * f),
    speed: m.speed > 1 ? grow(m.speed, 1) : m.speed,
    turn: m.turn > 1 ? grow(m.turn, 1) : m.turn,
    range: m.range > 1 ? grow(m.range, 1) : m.range,
    mainDmg: m.mainDmg > 1 ? grow(m.mainDmg, 1) : m.mainDmg,
    dmg: m.dmg > 1 ? grow(m.dmg, 1) : m.dmg,
    bunks: m.bunks > 1 ? grow(m.bunks, 1) : m.bunks,
    soldierDmg: m.soldierDmg > 1 ? grow(m.soldierDmg, 1) : m.soldierDmg,
    cargo: m.cargo > 1 ? grow(m.cargo, 1) : m.cargo,
    harvest: m.harvest > 1 ? grow(m.harvest, 1) : m.harvest,
    repair: m.repair * (1 + 0.5 * f),
    ram: m.ram > 1 ? grow(m.ram, 1) : m.ram,
    nitro: m.nitro > 1 ? grow(m.nitro, 1) : m.nitro,
  };
}
