import { MODULES, type NestKind } from '../defs';
import type { Enemy } from '../entities';
import type { Game, Target } from '../game';
import type { ModuleInst, Tank } from '../tank';
import { damageEnemy, damageTank } from './damage';
import { launch } from './weapons';

/**
 * Soldiers on the roof. Each nest holds two; manned soldiers fight with what the nest is for:
 * riflemen pick off climbers and chargers, grenadiers lob into crowds, rocketeers go for the big things and
 * flamers hose the hull edges. They all hit harder with nest levels and the Ark's Garrison perk.
 */
export interface NestDef {
  name: string;
  range: number;
  /** Seconds between shots per soldier. */
  cd: number;
  dmg: number;
  splash: number;
  color: string;
}

export const NESTS: Record<NestKind, NestDef> = {
  rifle: { name: 'Riflemen', range: 14, cd: 0.42, dmg: 7, splash: 0, color: '#ffe082' },
  grenade: { name: 'Grenadiers', range: 15, cd: 1.8, dmg: 24, splash: 2.4, color: '#ffab40' },
  rocket: { name: 'Rocketeers', range: 22, cd: 2.6, dmg: 70, splash: 1.5, color: '#ff5252' },
  flame: { name: 'Flamers', range: 6.5, cd: 0.25, dmg: 6, splash: 0, color: '#ff6d00' },
};

/** Soldier damage multiplier for a nest. */
export function nestMult(t: Tank, m: ModuleInst): number {
  return (1 + 0.2 * (m.lvl - 1)) * t.soldierDmg * (1 + t.crew.dmg);
}

/** Damage per second a nest puts out, fully manned (for the blueprint). */
export function nestDps(t: Tank, m: ModuleInst): number {
  const d = MODULES[m.key];
  if (!d.nest) return 0;
  const n = NESTS[d.nest];
  return ((n.dmg * (d.soldiers ?? 2)) / n.cd) * nestMult(t, m) * (d.nest === 'flame' ? 1.6 : 1);
}

/** Where each soldier of a nest stands, in world space. */
export function soldierSpots(t: Tank, m: ModuleInst): { x: number; y: number }[] {
  const l = t.moduleLocal(m);
  const n = Math.max(1, MODULES[m.key].soldiers ?? 2);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push(t.toWorld(l.lx + (i % 2 ? -0.35 : 0.35), l.lz + (i < 2 ? (i ? 0.4 : -0.4) : 0)));
  return out;
}

function pick(g: Game, t: Tank, kind: NestKind, x: number, y: number, range: number): Target | null {
  const near = g.enemiesNear(x, y, range + 1);
  let best: Enemy | null = null;
  let bs = Infinity;
  for (const e of near) {
    if (e.hp <= 0 || e.burrowed) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > range + e.r) continue;
    let score = d;
    // Boarders first: nothing gets to chew on the hull while soldiers stand on it.
    if (e.latch?.tank === t.id) score -= 30;
    if (kind === 'rocket') score -= e.maxHp / 30 + (e.elite ? 10 : 0) + (e.titan ? 40 : 0);
    // Grenades want company, not something standing on your own deck.
    if (kind === 'grenade' && (e.latch || d < 3)) score += 20;
    if (score < bs) {
      bs = score;
      best = e;
    }
  }
  if (kind === 'rocket') {
    for (const k of g.tanks) {
      if (k.dead || k.team === t.team) continue;
      const d = Math.hypot(k.x - x, k.y - y) - Math.min(k.stats.width, k.stats.length) / 2;
      if (d <= range && d - 40 < bs) return { id: k.id, x: k.x, y: k.y, r: Math.min(k.stats.width, k.stats.length) / 2, flying: false };
    }
  }
  return best ? { id: best.id, x: best.x, y: best.y, r: best.r, flying: best.flying || !!best.latch } : null;
}

/** Fires the roof soldiers of a tank (yours, or a rival's). */
export function updateSoldiers(g: Game, t: Tank, dt: number): void {
  if (t.dead || t.hasBuff('stun')) return;
  const roof = t.deckY(0) + 0.55;
  for (const m of t.modules) {
    const d = MODULES[m.key];
    if (!d.nest || !m.built) continue;
    const crew = t.kind === 'main' ? m.crew : d.soldiers ?? 2;
    if (crew <= 0) continue;
    const n = NESTS[d.nest];
    m.cd -= dt;
    if (m.cd > 0) continue;
    const spots = soldierSpots(t, m);
    const who = m.shots++ % crew;
    const at = spots[who] ?? spots[0];
    const tgt = pick(g, t, d.nest, at.x, at.y, n.range);
    if (!tgt) {
      m.cd = 0.3;
      continue;
    }
    // Soldiers take turns, so a full nest fires twice as often.
    m.cd = n.cd / crew;
    const dmg = n.dmg * nestMult(t, m) * (t.team === 'player' ? 1 : t.dmgScale);
    const a = Math.atan2(tgt.y - at.y, tgt.x - at.x);
    m.aim = a;
    const dist = Math.hypot(tgt.x - at.x, tgt.y - at.y);
    switch (d.nest) {
      case 'rifle': {
        const p = launch(g, t, 'bullet', at.x, at.y, a + (Math.random() - 0.5) * 0.05, 36, dmg, 0, 0, 0, tgt, n.range, 0, undefined, undefined, undefined, n.color, 0.1);
        p.z = roof;
        p.vz = -(roof - (tgt.flying ? 1.6 : 0.5)) / Math.max(0.1, dist / 36);
        g.fx.push({ t: 'muzzle', x: at.x, y: at.y, a, color: n.color, size: 0.35 });
        if (Math.random() < 0.35) g.hooks.sound('smg', at.x, at.y, 0.18);
        break;
      }
      case 'grenade': {
        const p = launch(g, t, 'grenade', at.x, at.y, a, 12, dmg, n.splash, 0, 0, tgt, n.range, 0, undefined, undefined, undefined, n.color, 0.2);
        const flight = Math.max(0.5, dist / 12);
        p.arc = true;
        p.tx = tgt.x + (Math.random() - 0.5) * 1.2;
        p.ty = tgt.y + (Math.random() - 0.5) * 1.2;
        p.maxLife = flight;
        p.vx = (p.tx - at.x) / flight;
        p.vy = (p.ty - at.y) / flight;
        p.vz = (9.8 * flight) / 2;
        p.z = roof;
        break;
      }
      case 'rocket': {
        const p = launch(g, t, 'missile', at.x, at.y, a, 17, dmg, n.splash, 0, 2.4, tgt, n.range * 1.3, 0, undefined, undefined, undefined, n.color, 0.22);
        p.z = roof;
        g.fx.push({ t: 'muzzle', x: at.x, y: at.y, a, color: '#ffab40', size: 0.6 });
        g.hooks.sound('rocket', at.x, at.y, 0.35);
        break;
      }
      case 'flame': {
        // A short cone of fire: everything in it burns, boarders on the deck included.
        g.fx.push({ t: 'wave', x: at.x, y: at.y, a, r: n.range, spread: 0.5, color: n.color });
        for (const e of g.enemiesNear(at.x, at.y, n.range + 1)) {
          if (e.hp <= 0 || e.burrowed) continue;
          const dx = e.x - at.x, dy = e.y - at.y;
          const dd = Math.hypot(dx, dy);
          if (dd > n.range + e.r) continue;
          let da = Math.abs(Math.atan2(dy, dx) - a);
          if (da > Math.PI) da = Math.PI * 2 - da;
          if (da > 0.5 && dd > 1.2) continue;
          damageEnemy(g, e, dmg, { srcTank: t.id, silent: true });
          e.burn = Math.max(e.burn, 2);
          e.burnDps = Math.max(e.burnDps, dmg * 0.8);
        }
        if (t.team !== 'player' && tgt) {
          const k = g.tankById(tgt.id);
          if (k) damageTank(g, k, dmg, { srcTank: t.id, silent: true });
        }
        if (Math.random() < 0.3) g.hooks.sound('flak', at.x, at.y, 0.15);
        break;
      }
    }
  }
}
