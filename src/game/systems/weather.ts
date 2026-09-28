import { ZONE } from '../../shared/map';
import type { Game } from '../game';
import { damageEnemy, damageTank } from './damage';

/**
 * Storms roll over the wasteland. Each biome has its own: sandstorms in the dunes, acid storms over the marsh,
 * blizzards in the north, ion storms over the glass and firestorms in the magma west. Every storm drives the soldiers
 * off the roof (the nests go quiet) and cuts how far you can see; the worst ones eat at the hull.
 */

export type StormKind = 'dust' | 'sand' | 'acid' | 'blizzard' | 'ion' | 'fire';

export const STORMS: Record<StormKind, { name: string; color: string; vision: number; speed: number; desc: string; protect: string | null }> = {
  dust: { name: 'Dust Storm', color: '#a1887f', vision: 0.65, speed: 1, protect: null, desc: 'Dust everywhere. Soldiers go inside; you see less.' },
  sand: { name: 'Sandstorm', color: '#e0b060', vision: 0.45, speed: 0.85, protect: null, desc: 'A wall of sand. Soldiers go inside; you see much less and drive slower.' },
  acid: { name: 'Acid Storm', color: '#8aff4a', vision: 0.55, speed: 1, protect: 'toxic', desc: 'Acid rain eats the hull (Sealant Pumps stop it) and burns anything out in it.' },
  blizzard: { name: 'Blizzard', color: '#d0ecff', vision: 0.5, speed: 0.8, protect: 'cold', desc: 'Whiteout. Soldiers go inside; the cold slows everything.' },
  ion: { name: 'Ion Storm', color: '#b388ff', vision: 0.7, speed: 1, protect: null, desc: 'Lightning strikes the ground around you (and whatever stands there). Shields drain.' },
  fire: { name: 'Firestorm', color: '#ff6a28', vision: 0.6, speed: 1, protect: 'heat', desc: 'Burning embers rain down (a Thermal Regulator protects the hull) and set creatures alight.' },
};

const BY_ZONE: Record<number, StormKind> = {
  [ZONE.VERDANT]: 'dust', [ZONE.ASH]: 'dust', [ZONE.SCORCHED]: 'fire', [ZONE.FROST]: 'blizzard', [ZONE.WRAITH]: 'blizzard', [ZONE.DUNES]: 'sand',
  [ZONE.LAKE]: 'acid', [ZONE.SPIRES]: 'ion', [ZONE.PASS]: 'dust', [ZONE.RUSTBOLT]: 'dust', [ZONE.DIVOT]: 'ion',
};

export interface Storm {
  kind: StormKind | null;
  phase: 'none' | 'warning' | 'active';
  t: number;
  /** Seconds until the next storm. */
  next: number;
  strikeT: number;
}

export const newStorm = (): Storm => ({ kind: null, phase: 'none', t: 0, next: 240, strikeT: 0 });

/** How far you see during the current storm (1 = clear). */
export function stormVision(g: Game): number {
  const s = g.weather;
  return s.phase === 'active' && s.kind ? STORMS[s.kind].vision : 1;
}

export function stormSpeed(g: Game): number {
  const s = g.weather;
  return s.phase === 'active' && s.kind ? STORMS[s.kind].speed : 1;
}

export function updateWeather(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const s = g.weather;
  const p = g.player;
  if (s.phase === 'none') {
    s.next -= dt;
    if (s.next > 0 || p.dead) return;
    const z = g.map.zoneAt(p.x, p.y);
    s.kind = BY_ZONE[z] ?? 'dust';
    s.phase = 'warning';
    s.t = 15;
    g.hooks.toast(`${STORMS[s.kind].name.toUpperCase()} in 15s: ${STORMS[s.kind].desc}`, STORMS[s.kind].color);
    g.hooks.sound('alarm');
    return;
  }
  s.t -= dt;
  if (s.phase === 'warning') {
    if (s.t > 0) return;
    s.phase = 'active';
    s.t = 60 + Math.random() * 60;
    setIndoors(g, true);
    g.hooks.toast(`${STORMS[s.kind!].name}! Everyone off the roof: the soldier nests are empty until it passes.`, STORMS[s.kind!].color);
    return;
  }
  // Active.
  if (s.t <= 0 || p.dead) {
    s.phase = 'none';
    s.kind = null;
    s.next = 200 + Math.random() * 200;
    setIndoors(g, false);
    if (!p.dead) g.hooks.toast('The storm has passed. Soldiers back to the roof.', '#b0bec5');
    return;
  }
  const k = s.kind!;
  const def = STORMS[k];
  const safe = def.protect ? p.stats.protects.has(def.protect as never) : false;
  if (k === 'acid' || k === 'fire') {
    if (!safe) damageTank(g, p, p.stats.maxHp * (k === 'acid' ? 0.004 : 0.003) * dt, { silent: true, acid: k === 'acid', zone: 'roof' });
    // It hits them too.
    for (const e of g.enemiesNear(p.x, p.y, 40)) {
      if (e.titan) continue;
      damageEnemy(g, e, e.maxHp * 0.02 * dt, { silent: true });
      if (k === 'fire' && Math.random() < dt) e.burn = Math.max(e.burn, 2);
    }
  } else if (k === 'ion') {
    p.shield = Math.max(0, p.shield - p.stats.shield * 0.05 * dt);
    s.strikeT -= dt;
    if (s.strikeT <= 0) {
      s.strikeT = 0.8 + Math.random() * 1.2;
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 30;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      g.telegraphs.push({
        id: -1, x, y, shape: 'circle', r: 3, a: 0, len: 0, t: 0, total: 1, color: '#b388ff', team: 'enemy', dmg: 0,
        onDone: () => {
          g.fx.push({ t: 'strike', x, y, color: '#b388ff' });
          g.hooks.sound('tesla', x, y, 0.6);
          for (const e of g.enemiesNear(x, y, 3.5)) if (Math.hypot(e.x - x, e.y - y) < 3 + e.r) damageEnemy(g, e, 90, {});
          if (p.edgeDist(x, y) < 3) damageTank(g, p, p.stats.maxHp * 0.02, { at: { x, y } });
        },
      });
    }
  } else if (k === 'blizzard' && !safe) p.addBuff('chill', 0.3, 0.2);
}

function setIndoors(g: Game, on: boolean): void {
  const p = g.player;
  if (p.indoors === on) return;
  p.indoors = on;
  p.version++;
  p.recalc();
}
