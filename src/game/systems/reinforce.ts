import type { Ally, AllyKind, Enemy } from '../entities';
import type { Game } from '../game';
import { makeAlly } from './allies';

/**
 * War XP and reinforcements. Every kill earns war XP (on top of the commander XP that levels you), shown on the top
 * bar; spend it at any time to call reinforcements down from the Hangar's airlift: escorts that stay at the Titan's
 * side for good, keeping pace with her however fast she drives and fighting whatever comes near, until they're
 * destroyed. The more commander levels, the bigger the escort you can keep.
 */

export type EscortKind = 'warden' | 'wasp' | 'raptor' | 'mantis';

export interface EscortDef {
  key: EscortKind;
  name: string;
  /** War XP to call it in. */
  cost: number;
  ally: AllyKind;
  /** Bodies it brings (a fireteam is four). */
  count: number;
  hp: number;
  dmg: number;
  range: number;
  desc: string;
}

export const ESCORTS: Record<EscortKind, EscortDef> = {
  warden: {
    key: 'warden', name: 'Warden Fireteam', cost: 120, ally: 'heavy', count: 4, hp: 520, dmg: 24, range: 14,
    desc: 'Four troopers in powered armour with heavy rifles. Cheap, and they soak a lot.',
  },
  wasp: {
    key: 'wasp', name: 'Wasp Gunship', cost: 180, ally: 'drone', count: 1, hp: 900, dmg: 46, range: 20,
    desc: 'A heavy gunship drone flying top cover, burning down whatever closes on the hull.',
  },
  raptor: {
    key: 'raptor', name: 'Raptor Hover Tank', cost: 260, ally: 'minitank', count: 1, hp: 2400, dmg: 120, range: 24,
    desc: 'A fast hover tank with a long cannon that runs alongside and breaks up packs before they reach you.',
  },
  mantis: {
    key: 'mantis', name: 'Mantis Walker', cost: 380, ally: 'mech', count: 1, hp: 4200, dmg: 160, range: 22,
    desc: 'A Halo-style assault walker: a cannon and a rocket pod. The heaviest thing the Hangar will lend you.',
  },
};

export const ESCORT_ORDER: EscortKind[] = ['warden', 'wasp', 'raptor', 'mantis'];

/** How many escort units (a fireteam counts as one) you can keep at once. */
export function escortCap(g: Game): number {
  return 2 + Math.floor(g.commander.level / 4);
}

/** The escort units you have now (a fireteam is one unit while any of it lives). */
export function escortUnits(g: Game): { kind: EscortKind; group: number; hp: number; maxHp: number }[] {
  const by = new Map<number, { kind: EscortKind; group: number; hp: number; maxHp: number }>();
  for (const a of g.allies) {
    if (!a.escort) continue;
    const u = by.get(a.owner) ?? { kind: a.escort, group: a.owner, hp: 0, maxHp: 0 };
    u.hp += Math.max(0, a.hp);
    u.maxHp += a.maxHp;
    by.set(a.owner, u);
  }
  return [...by.values()];
}

/** A kill's war XP. */
export function warXpFor(g: Game, e: Enemy): void {
  if (g.mode !== 'world') return;
  g.warXp += e.xp * (0.8 + 0.2 * e.threat);
}

let groups = 1;

function spawnEscort(g: Game, k: EscortKind, x: number, y: number): void {
  const d = ESCORTS[k];
  const group = -1000 - groups++;
  const lvl = 1 + g.commander.level * 0.04;
  const used = new Set(g.allies.filter((a) => a.escort).map((a) => a.slot));
  let slot = 0;
  for (let i = 0; i < d.count; i++) {
    while (used.has(slot)) slot++;
    used.add(slot);
    const o: Partial<Ally> = {
      hp: d.hp * lvl, maxHp: d.hp * lvl, dmg: d.dmg * lvl, range: d.range, life: 1e9, heavy: d.ally === 'heavy', squad: 'escort', slot, owner: group, escort: k,
      cd: 0.5 + Math.random(), cd2: 2, tx: x, ty: y,
    };
    if (d.ally === 'drone') o.z = 3.2;
    const a = makeAlly(d.ally, x + (i % 2) * 2 - 1, y + Math.floor(i / 2) * 2 - 1, o);
    g.allies.push(a);
  }
}

/** Spends war XP on an escort: it's dropped behind the hull and falls in. */
export function callEscort(g: Game, k: EscortKind): { ok: boolean; msg: string } {
  const d = ESCORTS[k];
  const p = g.player;
  if (p.dead || g.mode !== 'world') return { ok: false, msg: 'Not now.' };
  if (escortUnits(g).length >= escortCap(g)) return { ok: false, msg: `Your escort is full (${escortCap(g)} units; more with commander levels).` };
  if (g.warXp < d.cost) return { ok: false, msg: `Needs ${d.cost} war XP (you have ${Math.floor(g.warXp)}).` };
  g.warXp -= d.cost;
  const bx = p.x - Math.cos(p.rot) * (p.stats.length / 2 + 12), by = p.y - Math.sin(p.rot) * (p.stats.length / 2 + 12);
  spawnEscort(g, k, bx, by);
  g.fx.push({ t: 'boom', x: bx, y: by, r: 4, color: '#80d8ff' });
  g.hooks.sound('levelup');
  return { ok: true, msg: `${d.name.toUpperCase()} inbound from the Hangar: falling in at your side.` };
}

/** For the save: the escorts alive (one entry a unit). */
export function escortSave(g: Game): EscortKind[] {
  return escortUnits(g).map((u) => u.kind);
}

/** From a save: the escorts back at the hull, fresh. */
export function escortLoad(g: Game, list: string[] | undefined): void {
  const p = g.player;
  for (const k of list ?? []) {
    if (!(k in ESCORTS)) continue;
    spawnEscort(g, k as EscortKind, p.x - Math.cos(p.rot) * (p.stats.length / 2 + 10), p.y - Math.sin(p.rot) * (p.stats.length / 2 + 10));
  }
}
