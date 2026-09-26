import { rollDropRarity, rollLoot, rollWeaponKey } from '../shared/loot';
import { CARDS, PACK_INFO, rollPack } from './cards';
import { clampRarity, rarityName, type Rarity } from '../shared/rarity';
import { EXCLUSIVE_WEAPONS, WEAPONS } from '../shared/weapons';
import { CHAMPIONS, EXCLUSIVES, makeChampion, makeCrew, makeExclusive, randomRole, ROLES, signatureCard } from './crew';
import type { ChestKind, Reward } from './entities';
import type { Game } from './game';
import { newWeapon } from './templates';

export const CHEST_INFO: Record<ChestKind, { name: string; color: string; desc: string }> = {
  supply: { name: 'Supply Chest', color: '#bcaaa4', desc: 'Materials and maybe a weapon.' },
  rune: { name: 'Rune Chest', color: '#b388ff', desc: 'A chance at an exclusive weapon, an exclusive character or a champion.' },
  choice: { name: 'This-or-That Chest', color: '#ffd23f', desc: 'Pick one of two rewards.' },
  titan: { name: 'Titan Hoard', color: '#ffab40', desc: 'Spoils from a giant.' },
  pack: { name: PACK_INFO.pack.name, color: PACK_INFO.pack.color, desc: PACK_INFO.pack.desc },
  rare_pack: { name: PACK_INFO.rare_pack.name, color: PACK_INFO.rare_pack.color, desc: PACK_INFO.rare_pack.desc },
  epic_pack: { name: PACK_INFO.epic_pack.name, color: PACK_INFO.epic_pack.color, desc: PACK_INFO.epic_pack.desc },
  legendary_pack: { name: PACK_INFO.legendary_pack.name, color: PACK_INFO.legendary_pack.color, desc: PACK_INFO.legendary_pack.desc },
};

function luck(g: Game, threat: number, base: number): number {
  return base + Math.max(0, threat - 1) * 0.25 + g.player.crew.chestLuck;
}

function takeBonus(g: Game): number {
  const b = g.chestBonus;
  g.chestBonus = 0;
  return b;
}

function weaponReward(g: Game, threat: number, luckBase: number, min: Rarity, bonus: number): Reward {
  const r = clampRarity(rollDropRarity(() => g.rng.next(), threat, luck(g, threat, luckBase), min) + bonus);
  return { type: 'weapon', item: newWeapon(rollWeaponKey(() => g.rng.next()), r, () => g.rng.next()) };
}

function crewReward(g: Game, threat: number, min: Rarity, bonus: number): Reward {
  const r = clampRarity(Math.min(3, rollDropRarity(() => g.rng.next(), threat, 0.6, min) + bonus));
  const c = makeCrew(randomRole(() => g.rng.next()), r, 1 + Math.floor(g.rng.next() * 3), () => g.rng.next());
  return { type: 'crew', crew: c };
}

function itemsReward(g: Game, table: string, rolls: number): Reward {
  return { type: 'items', stacks: rollLoot(table, () => g.rng.next(), rolls) };
}

/** Rolls the contents of a chest. Choice chests return exactly two options. */
export function rollChest(g: Game, kind: ChestKind, threat: number): Reward[] {
  const rnd = (): number => g.rng.next();
  const bonus = takeBonus(g);
  if (kind === 'pack' || kind === 'rare_pack' || kind === 'epic_pack' || kind === 'legendary_pack') {
    return rollPack(rnd, kind, g.player.crew.chestLuck + bonus * 0.8).map((id) => ({ type: 'card', id }));
  }
  if (kind === 'rune') {
    const roll = rnd() - g.player.crew.chestLuck * 0.03 - bonus * 0.05;
    const out: Reward[] = [];
    const ownedChamps = new Set(g.crew.map((c) => c.champion).filter(Boolean));
    const ownedEx = new Set(g.crew.map((c) => c.exclusive).filter(Boolean));
    if (roll < 0.07) {
      const pool = CHAMPIONS.filter((c) => !ownedChamps.has(c.id));
      if (pool.length) out.push({ type: 'crew', crew: makeChampion(pool[Math.floor(rnd() * pool.length)].id, rnd) });
    } else if (roll < 0.2) {
      const pool = EXCLUSIVES.filter((c) => !ownedEx.has(c.id));
      if (pool.length) out.push({ type: 'crew', crew: makeExclusive(pool[Math.floor(rnd() * pool.length)].id, rnd) });
    } else if (roll < 0.33) {
      const d = EXCLUSIVE_WEAPONS[Math.floor(rnd() * EXCLUSIVE_WEAPONS.length)];
      out.push({ type: 'weapon', item: newWeapon(d.key, 4, rnd) });
    }
    if (!out.length) out.push(weaponReward(g, threat, 1.2, 1, bonus));
    out.push(itemsReward(g, 'rune', 3));
    return out;
  }
  if (kind === 'choice') {
    // Two different kinds of reward, both decent.
    const opts: (() => Reward)[] = [
      () => weaponReward(g, threat, 0.8, 1, bonus),
      () => crewReward(g, threat, 1, bonus),
      () => itemsReward(g, rnd() < 0.5 ? 'outpost' : 'rune', 4),
      () => ({ type: 'tech', n: 3 + Math.floor(threat) + bonus * 2 }),
    ];
    const a = Math.floor(rnd() * opts.length);
    let b = Math.floor(rnd() * (opts.length - 1));
    if (b >= a) b++;
    return [opts[a](), opts[b]()];
  }
  if (kind === 'titan') return [weaponReward(g, threat, 1.2, 2, bonus), itemsReward(g, 'titan', 3), { type: 'tech', n: 2 + Math.floor(threat / 2) }];
  // supply
  const out: Reward[] = [itemsReward(g, 'outpost', 2)];
  if (rnd() < 0.5 + bonus * 0.25) out.push(weaponReward(g, threat, 0.3, 0, bonus));
  return out;
}

/** Applies a reward. Returns a line describing it. */
export function grantReward(g: Game, r: Reward): string {
  switch (r.type) {
    case 'items': {
      for (const s of r.stacks) {
        const left = g.give(s.id, s.n, true);
        if (left > 0) g.dropStacks(g.player.x, g.player.y, [{ id: s.id, n: left }]);
      }
      return `${r.stacks.length} kinds of materials`;
    }
    case 'weapon':
      g.addWeapon(r.item);
      return `${rarityName(r.item.rarity)} ${WEAPONS[r.item.key].name}`;
    case 'crew': {
      const card = signatureCard(r.crew);
      if (CARDS[card]) g.ownCard(card);
      const ok = g.addCrew(r.crew);
      if (!ok) {
        // No room: they wait at camp and join when you have space.
        r.crew.loc = 'away';
        r.crew.returnIn = 1;
        g.crew.push(r.crew);
        g.hooks.toast(`${r.crew.name} is waiting for a bunk. Build crew space (BASE).`, '#ffd740');
      }
      return `${r.crew.name}, ${ROLES[r.crew.role].name}`;
    }
    case 'tech':
      g.give('tech_parts', r.n, true);
      return `${r.n} Salvaged Tech`;
    case 'card': {
      const got = g.ownCard(r.id);
      return `${CARDS[r.id]?.name ?? r.id}${got === 'dupe' ? ' (copy)' : ' (new!)'}`;
    }
  }
}
