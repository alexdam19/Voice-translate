import { rollRarity, type Rarity } from '../shared/rarity';

/**
 * Battle cards, loosely in the spirit of Magic: The Gathering. Each card belongs to a school (its colour),
 * has a type, an energy cost and a fixed rarity. You carry a deck of 8, hold a hand of 4, and drag a card
 * onto the battlefield to play it. Energy refills over time. Relics are permanent cards you slot for
 * always-on effects. Duplicates from packs level cards up.
 */

export type CardType = 'spell' | 'summon' | 'enchant' | 'relic';
export type School = 'iron' | 'volt' | 'rust' | 'void' | 'aegis';

export const SCHOOLS: Record<School, { name: string; color: string; dark: string; desc: string }> = {
  iron: { name: 'Iron', color: '#ff7043', dark: '#4a1a10', desc: 'Explosions, artillery and fire.' },
  volt: { name: 'Volt', color: '#40c4ff', dark: '#0c2c44', desc: 'Lightning, orbit and time.' },
  rust: { name: 'Rust', color: '#9ccc65', dark: '#1e3410', desc: 'Repair, acid and salvage.' },
  void: { name: 'Void', color: '#b388ff', dark: '#26143e', desc: 'Gravity, drain and monsters.' },
  aegis: { name: 'Aegis', color: '#ffd740', dark: '#3e3208', desc: 'Shields and troops.' },
};

export const CARD_TYPE_NAME: Record<CardType, string> = { spell: 'Spell', summon: 'Summon', enchant: 'Enchantment', relic: 'Relic' };

export type RelicStat = 'energy' | 'lifesteal' | 'loot' | 'chestLuck' | 'titanDmg' | 'cmdXp' | 'armor' | 'maxEnergy' | 'phoenix' | 'discount' | 'eliteDmg' | 'harvest';

export interface CardDef {
  id: string;
  name: string;
  school: School;
  type: CardType;
  /** Energy cost (0 for relics). */
  cost: number;
  rarity: Rarity;
  /** 'area': drag onto a spot. 'self': drop anywhere, affects your fortress. */
  target: 'area' | 'self';
  radius: number;
  /** Rules text; numbers in {braces} grow with the card's level. */
  text: string;
  flavor: string;
  relic?: { stat: RelicStat; value: number };
}

/** Cards work at the scale of a 200 m Titan and a horde of hundreds: every area is this many times the base radius. */
export const CARD_AREA = 8;
const C = (d: Omit<CardDef, 'radius' | 'target'> & { radius?: number; target?: CardDef['target'] }): CardDef => ({ target: 'area', ...d, radius: (d.radius ?? 0) * CARD_AREA });

export const CARDS: Record<string, CardDef> = {};
const add = (d: CardDef): void => {
  CARDS[d.id] = d;
};

/* ---------------- Iron ---------------- */
add(C({ id: 'artillery', name: 'Artillery Call', school: 'iron', type: 'spell', cost: 3, rarity: 0, radius: 4, text: 'Eighteen shells rain on the area for {240} damage each.', flavor: '"Coordinates received. Duck."' }));
add(C({ id: 'salvo', name: 'Rocket Salvo', school: 'iron', type: 'spell', cost: 3, rarity: 0, radius: 4, text: '30 rockets slam the area for {160} damage each.', flavor: 'Aim is optional.' }));
add(C({ id: 'fireball', name: 'Fireball', school: 'iron', type: 'spell', cost: 4, rarity: 1, radius: 3, text: 'Explodes for {900} damage and leaves the ground burning.', flavor: 'Napalm, lovingly hand-rolled.' }));
add(C({ id: 'carpet_bomb', name: 'Carpet Bomb', school: 'iron', type: 'spell', cost: 5, rarity: 2, radius: 3, text: 'A bomber drops {30} bombs in a line to the target ({360} each).', flavor: 'The ground rearranged itself.' }));
add(C({ id: 'barrage', name: 'Barrage', school: 'iron', type: 'enchant', cost: 3, rarity: 0, target: 'self', text: 'Your guns fire {50%} faster for 6s.', flavor: 'Feed the belts. All of them.' }));
add(C({ id: 'meltdown', name: 'Meltdown Core', school: 'iron', type: 'enchant', cost: 6, rarity: 3, target: 'self', text: 'Refill your shields. Your guns fire {80%} faster for 7s.', flavor: 'Old Brass swears it is stable.' }));
add(C({ id: 'jets', name: 'Scramble Fighters', school: 'iron', type: 'summon', cost: 5, rarity: 2, radius: 3, text: '{6} fighter jets strafe and bomb the area for 14s.', flavor: 'Wheels up in thirty seconds.' }));
add(C({ id: 'meteor', name: 'Meteor Storm', school: 'iron', type: 'spell', cost: 8, rarity: 4, radius: 10, text: '{30} meteors rain down for {900} damage each and set the ground on fire.', flavor: 'The sky has had enough.' }));
add(C({ id: 'nuke', name: 'Nuclear Launch', school: 'iron', type: 'spell', cost: 9, rarity: 5, radius: 13, text: 'After a 3s siren, a warhead hits for {12000} damage and leaves a radiation zone.', flavor: 'Launch codes accepted.' }));

/* ---------------- Volt ---------------- */
add(C({ id: 'emp', name: 'EMP Pulse', school: 'volt', type: 'spell', cost: 3, rarity: 1, radius: 10, text: 'Stun everything in the area for {2s} and deal 160 damage. Shields drop.', flavor: 'Lights out.' }));
add(C({ id: 'lightning', name: 'Lightning Storm', school: 'volt', type: 'spell', cost: 5, rarity: 2, radius: 8, text: '{24} bolts strike enemies in the area for {480} each, stunning some.', flavor: 'Forecast: violent.' }));
add(C({ id: 'orbital', name: 'Orbital Lance', school: 'volt', type: 'spell', cost: 6, rarity: 3, radius: 6, text: 'A beam from orbit hits for {2400} damage and burns the ground.', flavor: 'Marshal Hale still has the codes.' }));
add(C({ id: 'orbital_laser', name: 'Orbital Laser', school: 'volt', type: 'spell', cost: 8, rarity: 4, radius: 3.5, text: 'Steer a laser from orbit with your mouse for 7s ({1400} per second).', flavor: 'Point and delete.' }));
add(C({ id: 'timestop', name: 'Time Stop', school: 'volt', type: 'spell', cost: 8, rarity: 4, target: 'self', text: 'Every enemy within 360 m freezes for {6s}. Your guns fire 50% faster.', flavor: 'Tick. Tick. ...' }));
add(C({ id: 'blink', name: 'Blink Drive', school: 'volt', type: 'spell', cost: 3, rarity: 1, radius: 6, text: 'Teleport your whole fortress there and stun enemies where you land.', flavor: 'A facility, displaced.' }));
add(C({ id: 'drones', name: 'Drone Swarm', school: 'volt', type: 'summon', cost: 4, rarity: 1, radius: 3, text: '{8} laser drones hunt around the target for 18s.', flavor: 'They never blink.' }));
add(C({ id: 'cataclysm', name: 'Cataclysm', school: 'volt', type: 'spell', cost: 9, rarity: 5, target: 'self', text: 'For 10s lightning strikes every enemy within 300 m for {800} per bolt.', flavor: 'The sky splits open.' }));
add(C({ id: 'nitro', name: 'Nitro', school: 'volt', type: 'enchant', cost: 2, rarity: 0, target: 'self', text: '+{70%} speed for 4s. Creatures in the way are thrown clear and boarders shaken off.', flavor: 'Floor it.' }));

/* ---------------- Rust ---------------- */
add(C({ id: 'weld', name: 'Weld Crew', school: 'rust', type: 'spell', cost: 3, rarity: 0, target: 'self', text: 'Repair {15%} of max hull over 15s.', flavor: 'Duct tape is structural.' }));
add(C({ id: 'nanite', name: 'Nanite Cloud', school: 'rust', type: 'spell', cost: 5, rarity: 2, target: 'self', text: 'Repair {25%} hull over 20s and gain +30% armor for 8s.', flavor: 'Doc Rivet\'s little helpers.' }));
add(C({ id: 'acid_rain', name: 'Acid Rain', school: 'rust', type: 'spell', cost: 4, rarity: 1, radius: 6, text: 'Acid pools cover the area and eat through armor ({120} per second).', flavor: 'Bring an umbrella. A thick one.' }));
add(C({ id: 'magnet', name: 'Magnet Sweep', school: 'rust', type: 'spell', cost: 2, rarity: 0, target: 'self', text: 'Pull in all loot within 240 m and harvest {60%} faster for 8s.', flavor: 'Everything metal comes home.' }));
add(C({ id: 'frenzy', name: 'Salvage Frenzy', school: 'rust', type: 'enchant', cost: 3, rarity: 1, target: 'self', text: '+{100%} loot and harvest yield for 45s.', flavor: 'Strip it all.' }));
add(C({ id: 'mines', name: 'Minefield', school: 'rust', type: 'summon', cost: 2, rarity: 0, radius: 4, text: 'Scatter {24} proximity mines ({480} damage each).', flavor: 'Mind your step.' }));
add(C({ id: 'kraken', name: 'Kraken\'s Grasp', school: 'rust', type: 'spell', cost: 4, rarity: 2, radius: 5, text: 'Tentacles root everything in the area for {3s} and deal 320 damage.', flavor: 'Something lives under the mud.' }));

/* ---------------- Void ---------------- */
add(C({ id: 'singularity', name: 'Singularity', school: 'void', type: 'spell', cost: 5, rarity: 2, radius: 5, text: 'A gravity well drags enemies in for 3s, then detonates for {1000}.', flavor: 'Nova Six likes to watch.' }));
add(C({ id: 'soul_harvest', name: 'Soul Harvest', school: 'void', type: 'enchant', cost: 4, rarity: 1, target: 'self', text: 'Your guns heal you for {10%} of their damage for 10s.', flavor: 'Waste not.' }));
add(C({ id: 'dragon', name: 'Summon Dragon', school: 'void', type: 'summon', cost: 9, rarity: 5, radius: 4, text: 'A dragon fights for 25s, breathing fire for about {1600} damage per second.', flavor: 'It answers the call.' }));
add(C({ id: 'void_rift', name: 'Void Rift', school: 'void', type: 'spell', cost: 6, rarity: 3, radius: 4, text: '{2800} damage to everything in the area. Anything left under 20% health is erased.', flavor: 'Reality, torn along the dotted line.' }));
add(C({ id: 'scholar', name: 'Scholar\'s Insight', school: 'void', type: 'enchant', cost: 2, rarity: 1, target: 'self', text: '+{100%} commander XP for 60s.', flavor: 'Learn from their mistakes. Loudly.' }));
add(C({ id: 'deadeye', name: 'Deadeye Salvo', school: 'void', type: 'enchant', cost: 5, rarity: 3, target: 'self', text: 'For {6s} every shot is a critical hit and pierces one extra target.', flavor: 'Vex Morrow never misses twice.' }));

/* ---------------- Aegis ---------------- */
add(C({ id: 'shield_surge', name: 'Shield Surge', school: 'aegis', type: 'spell', cost: 3, rarity: 0, target: 'self', text: 'Gain a barrier worth {18%} of max hull for 6s.', flavor: 'Not today.' }));
add(C({ id: 'dome', name: 'Aegis Dome', school: 'aegis', type: 'spell', cost: 5, rarity: 2, target: 'self', text: 'An energy dome blocks 90% of damage for {4s}.', flavor: 'Knock knock. No.' }));
add(C({ id: 'squad', name: 'Drop Squad', school: 'aegis', type: 'summon', cost: 3, rarity: 0, radius: 3, text: 'Drop {9} marines at the target. They fight for 20s.', flavor: 'Boots on the ground.' }));
add(C({ id: 'legion', name: 'Iron Legion', school: 'aegis', type: 'summon', cost: 6, rarity: 3, radius: 4, text: 'Drop {15} heavy marines for 25s.', flavor: 'Warden Sol\'s finest.' }));
add(C({ id: 'mech', name: 'Mech Drop', school: 'aegis', type: 'summon', cost: 7, rarity: 4, radius: 4, text: 'A battle mech with {12000} hull drops from orbit and fights for 30s.', flavor: 'Some assembly required. Already done.' }));
add(C({ id: 'miracle', name: 'Miracle Protocol', school: 'aegis', type: 'spell', cost: 7, rarity: 4, target: 'self', text: 'Invulnerable for {3s}, repair 20% over 20s, revive and cleanse your crew.', flavor: 'Mother Kess does not lose patients.' }));
add(C({ id: 'treasure', name: 'Treasure Sense', school: 'aegis', type: 'spell', cost: 4, rarity: 3, target: 'self', text: 'Pull in loot within 480 m, reveal every loot area and rune, and the next chest is one rarity better.', flavor: 'Magpie can smell gold.' }));
add(C({ id: 'charge', name: 'Juggernaut Charge', school: 'aegis', type: 'spell', cost: 4, rarity: 2, radius: 3, text: 'Dash your fortress to the target, crushing everything in the way for {600}.', flavor: 'Grit Taggart does not brake.' }));
add(C({ id: 'smoke', name: 'Smoke Screen', school: 'aegis', type: 'enchant', cost: 2, rarity: 0, target: 'self', text: 'Halve incoming damage for {5s}. Enemies lose track of you.', flavor: 'Now you see us.' }));

/* ---------------- Relics (permanent) ---------------- */
const R = (id: string, name: string, school: School, rarity: Rarity, stat: RelicStat, value: number, text: string, flavor: string): void =>
  add({ id, name, school, type: 'relic', cost: 0, rarity, target: 'self', radius: 0, text, flavor, relic: { stat, value } });
R('war_drums', 'War Drums', 'iron', 1, 'energy', 0.15, 'Energy refills {15%} faster.', 'Keep time. Keep firing.');
R('vampire_fang', 'Vampire Fang', 'void', 2, 'lifesteal', 0.03, 'Your guns heal you for {3%} of their damage.', 'Found in a titan\'s jaw.');
R('salvager_charm', 'Salvager\'s Charm', 'rust', 0, 'loot', 0.2, '+{20%} loot.', 'Shiny things find you.');
R('lucky_coin', 'Lucky Coin', 'aegis', 2, 'chestLuck', 0.6, 'Chests and packs roll better rarities.', 'Heads you win. Tails you win.');
R('titan_bane', 'Titan Bane', 'iron', 3, 'titanDmg', 0.4, '+{40%} damage to titans.', 'The bigger they are.');
R('scholar_tome', 'Scholar\'s Tome', 'void', 1, 'cmdXp', 0.25, '+{25%} commander XP.', 'Annotated in the margins.');
R('iron_hide', 'Iron Hide', 'aegis', 0, 'armor', 0.05, '+{5%} armor.', 'Bolted on, welded twice.');
R('overcharged_core', 'Overcharged Core', 'volt', 3, 'maxEnergy', 2, '+{2} maximum energy.', 'Humming, always humming.');
R('phoenix_feather', 'Phoenix Feather', 'iron', 4, 'phoenix', 0.3, 'Once every 3 minutes, a lethal hit leaves you at {30%} hull instead.', 'Warm to the touch.');
R('mana_crystal', 'Mana Crystal', 'volt', 5, 'discount', 1, 'Every card costs 1 less energy (minimum 1).', 'Pure, crystallised intent.');
R('hunters_mark', 'Hunter\'s Mark', 'rust', 1, 'eliteDmg', 0.2, '+{20%} damage to elites.', 'Painted on the hull, in red.');
R('dowsing_rod', 'Dowsing Rod', 'rust', 0, 'harvest', 0.25, '+{25%} harvest speed.', 'It twitches near ore.');

export const CARD_LIST: readonly CardDef[] = Object.values(CARDS);

/** The 8 commons every commander starts with. */
export const STARTER_DECK = ['artillery', 'salvo', 'weld', 'nitro', 'barrage', 'squad', 'mines', 'shield_surge'];

/** Starting deck slots; more open up the longer you play (see `deckSlots`). */
export const DECK_SIZE = 8;
export const MAX_DECK = 16;

/** Deck slots: 8, +1 every 4 commander levels and +1 every 4 hordes survived (up to 16). */
export function deckSlots(level: number, hordes: number): number {
  return Math.min(MAX_DECK, DECK_SIZE + Math.floor((level - 1) / 4) + Math.min(4, Math.floor(hordes / 4)));
}
export const HAND_SIZE = 4;
export const MAX_CARD_LEVEL = 10;
export const BASE_MAX_ENERGY = 10;
/** Energy per second before bonuses. */
export const ENERGY_REGEN = 1 / 2.6;

export interface OwnedCard {
  level: number;
  shards: number;
}

/** Duplicates needed to reach the next level. Rarer cards need fewer. */
export function shardsNeeded(d: CardDef, level: number): number {
  return Math.ceil(level * [4, 3, 2, 2, 1, 1][d.rarity]);
}

export function upgradeCost(d: CardDef, level: number): Record<string, number> {
  return { scrap: 25 * level * (d.rarity + 1), ...(level >= 4 ? { tech_parts: Math.ceil(level / 2) } : {}) };
}

/** Card power from its level. */
export const levelPower = (level: number): number => 1 + 0.1 * (Math.max(1, level) - 1);

/** Replaces {n} placeholders with numbers scaled by power. */
export function cardText(d: CardDef, P: number): string {
  return d.text.replace(/\{([^}]+)\}/g, (_m, v: string) => {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return v;
    const unit = v.replace(/[\d.]/g, '');
    const x = n * P;
    const str = unit === 's' || (x < 10 && !Number.isInteger(x)) ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x));
    return `<b>${str}${unit}</b>`;
  });
}

/* ---------------------------------------------------------------------- */
/* Card packs                                                              */
/* ---------------------------------------------------------------------- */

export type PackKind = 'pack' | 'rare_pack' | 'epic_pack' | 'legendary_pack';

export const PACK_INFO: Record<PackKind, { name: string; color: string; count: number; min: Rarity; desc: string }> = {
  pack: { name: 'Card Pack', color: '#90a4ae', count: 3, min: 0, desc: '3 cards.' },
  rare_pack: { name: 'Rare Card Pack', color: '#45a6ff', count: 4, min: 2, desc: '4 cards, at least one Rare.' },
  epic_pack: { name: 'Epic Card Pack', color: '#c45cff', count: 5, min: 3, desc: '5 cards, at least one Epic.' },
  legendary_pack: { name: 'Legendary Card Pack', color: '#ffa726', count: 6, min: 4, desc: '6 cards, at least one Legendary.' },
};

/** Rolls the card ids in a pack. The first card is guaranteed the pack's minimum rarity. */
export function rollPack(rng: () => number, kind: PackKind, luck: number): string[] {
  const info = PACK_INFO[kind];
  const out: string[] = [];
  for (let i = 0; i < info.count; i++) {
    const r = i === 0 ? rollRarity(rng, luck, info.min, 5) : rollRarity(rng, luck, 0, 5);
    // Relics are rarer than battle cards.
    const wantRelic = rng() < 0.18;
    let pool = CARD_LIST.filter((c) => c.rarity === r && (c.type === 'relic') === wantRelic);
    if (!pool.length) pool = CARD_LIST.filter((c) => c.rarity === r);
    if (!pool.length) pool = CARD_LIST.filter((c) => c.rarity <= r);
    out.push(pool[Math.floor(rng() * pool.length)].id);
  }
  return out;
}
