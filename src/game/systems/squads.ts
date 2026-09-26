import { mergeStacks } from '../../shared/inventory';
import { getItem } from '../../shared/items';
import { NODE_INFO } from '../../shared/mapgen';
import { levelMult } from '../defs';
import type { Ally } from '../entities';
import type { Game } from '../game';
import type { ModuleInst } from '../tank';
import { carryCap, newSquad, SQUADS, squadSize, type SquadOrder, type SquadType } from '../squads';
import { makeAlly } from './allies';

/**
 * Squads live in the buildings that train them. Every unit that dies is replaced after a while.
 * Orders: follow the fortress, guard a spot you drag them onto, or scavenge ahead (collect loot drops
 * and harvest resource nodes, then drive the haul home).
 */

/** How far from the fortress scavengers will go looking for work. */
export const SCAVENGE_RANGE = 70;

/** The building that trains a squad type (the highest-level one, if you somehow have several). */
export function squadBuilding(g: Game, type: SquadType): ModuleInst | null {
  const key = SQUADS[type].building;
  let best: ModuleInst | null = null;
  for (const m of g.player.modules) if (m.key === key && m.built && (!best || m.lvl > best.lvl)) best = m;
  return best;
}

export function squadUnits(g: Game, type: SquadType): Ally[] {
  return g.allies.filter((a) => a.squad === type);
}

/** Squads you currently have (buildings built). */
export function activeSquads(g: Game): SquadType[] {
  return (Object.keys(SQUADS) as SquadType[]).filter((t) => squadBuilding(g, t));
}

export function setSquadOrder(g: Game, type: SquadType, order: SquadOrder, x = 0, y = 0): string | null {
  const sq = g.squads[type];
  if (!sq) return 'You have no such squad yet.';
  if (order === 'scavenge' && !SQUADS[type].canScavenge) return `${SQUADS[type].name} can't scavenge. Marines and Scout Buggies can.`;
  sq.order = order;
  sq.target = null;
  sq.phase = 'going';
  sq.work = 0;
  if (order === 'guard') {
    sq.gx = x;
    sq.gy = y;
  }
  g.objectiveCounters[`squad_${order}`] = (g.objectiveCounters[`squad_${order}`] ?? 0) + 1;
  return null;
}

function unitStats(g: Game, type: SquadType, level: number): { hp: number; dmg: number } {
  const d = SQUADS[type];
  const f = levelMult(level);
  const crew = g.player.crew;
  return { hp: d.hp * f * (1 + crew.hp * 0.5), dmg: d.dmg * f * (1 + crew.dmg) };
}

function spawnUnit(g: Game, type: SquadType, slot: number, level: number): void {
  const d = SQUADS[type];
  const p = g.player;
  const { hp, dmg } = unitStats(g, type, level);
  // Units roll out of the back of the fortress.
  const door = p.toWorld(-p.stats.length / 2 - 1, (Math.random() - 0.5) * p.stats.width * 0.6);
  const flying = d.unit === 'jet' || d.unit === 'drone';
  const a = makeAlly(d.unit, door.x, door.y, {
    hp: d.unit === 'jet' ? 1 : hp, maxHp: d.unit === 'jet' ? 1 : hp, dmg, range: d.range, life: Infinity, squad: type, slot, rot: p.rot + Math.PI,
    z: d.unit === 'jet' ? 1.2 : d.unit === 'drone' ? 1.8 : 0, cd: 0.5, cd2: 2, heavy: false, tx: door.x, ty: door.y,
  });
  if (flying) a.rot = p.rot;
  g.allies.push(a);
}

/** Keeps squads staffed, levelled, and working. */
export function updateSquads(g: Game, dt: number): void {
  const p = g.player;
  for (const type of Object.keys(SQUADS) as SquadType[]) {
    const b = squadBuilding(g, type);
    const units = squadUnits(g, type);
    if (!b || g.mode !== 'world') {
      // Building gone (or you're in the Dead Zone): the squad stands down.
      if (units.length) g.allies = g.allies.filter((a) => a.squad !== type);
      if (!b) delete g.squads[type];
      continue;
    }
    let sq = g.squads[type];
    if (!sq) {
      sq = g.squads[type] = newSquad(type);
      g.hooks.toast(`${SQUADS[type].name} ready! Drag its badge onto the map to guard a spot${SQUADS[type].canScavenge ? ', or tap SCAVENGE' : ''}.`, SQUADS[type].color);
    }
    const d = SQUADS[type];
    const size = squadSize(d, b.lvl);
    // Keep stats in line with the building's level.
    const { hp, dmg } = unitStats(g, type, b.lvl);
    for (const a of units) {
      if (a.kind !== 'jet' && Math.abs(a.maxHp - hp) > 1) {
        a.hp = (a.hp / a.maxHp) * hp;
        a.maxHp = hp;
      }
      a.dmg = dmg;
    }
    if (units.length > size) {
      const extra = units.slice(size);
      g.allies = g.allies.filter((a) => !extra.includes(a));
    } else if (units.length < size && !p.dead) {
      sq.respawn -= dt;
      if (sq.respawn <= 0) {
        const used = new Set(units.map((a) => a.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        spawnUnit(g, type, slot, b.lvl);
        sq.respawn = d.respawn / size;
      }
    } else sq.respawn = Math.min(sq.respawn, d.respawn / size);
    if (sq.order === 'scavenge') scavenge(g, type, squadUnits(g, type), b.lvl, dt);
  }
}

/* ---------------------------------------------------------------------- */
/* Scavenging                                                              */
/* ---------------------------------------------------------------------- */

function carried(g: Game, type: SquadType): number {
  return (g.squads[type]?.carry ?? []).reduce((s, k) => s + k.n, 0);
}

function pickTarget(g: Game, type: SquadType, lead: Ally) {
  const p = g.player;
  const taken = new Set<string>();
  for (const [k, s] of Object.entries(g.squads)) if (k !== type && s?.target) taken.add(`${s.target.kind}${s.target.id}`);
  // Loot lying on the ground first (from kills), then resource nodes.
  let best: { kind: 'node' | 'loot'; id: number; x: number; y: number } | null = null;
  let bd = Infinity;
  for (const k of g.pickups) {
    if (k.kind !== 'stack' || k.delay > 0) continue;
    const dp = Math.hypot(k.x - p.x, k.y - p.y);
    if (dp > SCAVENGE_RANGE || p.edgeDist(k.x, k.y) < 5) continue;
    const d = Math.hypot(k.x - lead.x, k.y - lead.y) * 0.6;
    if (d < bd && !taken.has(`loot${k.id}`)) {
      bd = d;
      best = { kind: 'loot', id: k.id, x: k.x, y: k.y };
    }
  }
  for (const n of g.gen.nodes) {
    if (n.respawnAt > 0 || NODE_INFO[n.type].tier > p.stats.drill) continue;
    if (Math.abs(n.x - p.x) > SCAVENGE_RANGE || Math.abs(n.y - p.y) > SCAVENGE_RANGE) continue;
    if (g.harvestId === n.id || taken.has(`node${n.id}`)) continue;
    const d = Math.hypot(n.x - lead.x, n.y - lead.y);
    if (d < bd) {
      bd = d;
      best = { kind: 'node', id: n.id, x: n.x, y: n.y };
    }
  }
  return best;
}

function scavenge(g: Game, type: SquadType, units: Ally[], level: number, dt: number): void {
  const sq = g.squads[type]!;
  const p = g.player;
  if (!units.length) return;
  const lead = units[0];
  const cap = carryCap(level) * (type === 'buggies' ? 1.5 : 1);
  const setGoal = (x: number, y: number, spread: number): void => {
    units.forEach((a, i) => {
      const k = i * 2.39996;
      a.tx = x + Math.cos(k) * spread * Math.min(1, i);
      a.ty = y + Math.sin(k) * spread * Math.min(1, i);
    });
  };
  if (sq.phase === 'returning') {
    const home = p.toWorld(-p.stats.length / 2 - 1.5, 0);
    setGoal(home.x, home.y, 1.2);
    const near = units.some((a) => p.edgeDist(a.x, a.y) < 3);
    if (near || p.dead) {
      if (!p.dead && sq.carry.length) {
        const parts: string[] = [];
        for (const s of sq.carry) {
          const left = g.give(s.id, s.n, true);
          if (s.n - left > 0) parts.push(`${s.n - left} ${getItem(s.id).name}`);
          if (left > 0) g.dropStacks(p.x, p.y, [{ id: s.id, n: left }]);
        }
        if (parts.length) {
          g.float(p.x, p.y, `+${parts.join(', ')}`, SQUADS[type].color);
          g.hooks.sound('pickup');
        }
        g.objectiveCounters.scavenged = (g.objectiveCounters.scavenged ?? 0) + 1;
      }
      sq.carry = [];
      sq.phase = 'going';
      sq.target = null;
    }
    return;
  }
  // Validate the target.
  if (sq.target) {
    const t = sq.target;
    const ok = t.kind === 'node' ? g.gen.nodes.some((n) => n.id === t.id && n.respawnAt === 0) : g.pickups.some((k) => k.id === t.id);
    if (!ok || Math.hypot(t.x - p.x, t.y - p.y) > SCAVENGE_RANGE + 15) {
      sq.target = null;
      sq.phase = 'going';
    }
  }
  if (!sq.target) {
    if (carried(g, type) > 0) {
      sq.phase = 'returning';
      return;
    }
    sq.target = pickTarget(g, type, lead);
    sq.phase = 'going';
    if (!sq.target) {
      // Nothing to do: wait by the fortress.
      const f = p.toWorld(-p.stats.length / 2 - 3, 0);
      setGoal(f.x, f.y, 2);
      return;
    }
  }
  const t = sq.target;
  setGoal(t.x, t.y, sq.phase === 'working' ? 1.4 : 0.8);
  const at = units.some((a) => Math.hypot(a.x - t.x, a.y - t.y) < 2.2);
  if (!at) return;
  sq.phase = 'working';
  if (t.kind === 'loot') {
    // Pick up the loot drop.
    const i = g.pickups.findIndex((k) => k.id === t.id);
    if (i >= 0) {
      const k = g.pickups[i];
      if (k.stack) sq.carry = mergeStacks([...sq.carry, k.stack]);
      g.pickups.splice(i, 1);
    }
    sq.target = null;
    sq.phase = carried(g, type) >= cap ? 'returning' : 'going';
    return;
  }
  const n = g.gen.nodes.find((k) => k.id === t.id);
  if (!n) return;
  sq.work += dt * units.length * 0.9 * (type === 'buggies' ? 1.3 : 1) * p.stats.harvest;
  if (Math.random() < dt * 6) g.fx.push({ t: 'spark', x: n.x, y: n.y, color: NODE_INFO[n.type].color, n: 1 });
  if (sq.work < 1.2) return;
  sq.work = 0;
  const amt = Math.min(n.amount, 2);
  n.amount -= amt;
  sq.carry = mergeStacks([...sq.carry, { id: NODE_INFO[n.type].item, n: amt }]);
  g.stats.harvested += amt;
  if (n.amount <= 0) {
    n.respawnAt = g.time + 360;
    sq.target = null;
  }
  if (carried(g, type) >= cap) sq.phase = 'returning';
}

/** For the HUD: what a squad is doing. */
export function squadStatus(g: Game, type: SquadType): string {
  const sq = g.squads[type];
  if (!sq) return '';
  if (sq.order === 'follow') return 'Following';
  if (sq.order === 'guard') return 'Guarding';
  if (sq.phase === 'returning') return `Hauling ${carried(g, type)} home`;
  if (!sq.target) return 'Looking for work';
  return sq.phase === 'working' ? (sq.target.kind === 'node' ? 'Harvesting' : 'Collecting') : 'Heading out';
}

