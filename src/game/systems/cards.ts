import { nearestClear } from '../../shared/motion';
import { CARD_AREA, CARDS, type CardDef } from '../cards';
import { eid, type Projectile } from '../entities';
import type { Game } from '../game';
import { layMines, spawnDragon, spawnDrones, spawnJet, spawnMarines, spawnMech } from './allies';
import { damageEnemy, damageTank, explode } from './damage';
import { resolveTank, tankNav } from './movement';
import { skyStrike } from './weapons';
import { revealFeatures } from './world';

/**
 * Battle cards in play. Drag a card from your hand onto the battlefield (or tap it, then tap the ground):
 * area cards land where you drop them, self cards affect your fortress. Energy refills over time.
 */

/** How far from the fortress an area card can land (a Titan reaches anywhere on screen). */
export const CAST_RANGE = 70;
export const castRange = (g: Game): number => (g.player.fortress ? 1400 : CAST_RANGE);

export type PlayResult = { ok: true } | { ok: false; msg: string };

/** Energy regen and the long-running card effects (Time Stop, Orbital Laser, Cataclysm). */
export function updateCards(g: Game, dt: number): void {
  const p = g.player;
  if (!p.dead) g.energy = Math.min(g.maxEnergy(), g.energy + g.energyRate() * dt);
  if (g.phoenixCd > 0) g.phoenixCd = Math.max(0, g.phoenixCd - dt);
  if (g.timeStop > 0) g.timeStop = Math.max(0, g.timeStop - dt);
  updateOrbital(g, dt);
  updateStorm(g, dt);
}

/** Why a hand card can't be played right now (null = playable). */
export function cardBlock(g: Game, slot: number): string | null {
  const id = g.hand[slot];
  if (!id || !CARDS[id]) return 'No card there.';
  if (g.player.dead) return 'Your fortress is being towed back to camp.';
  const cost = g.cardCost(id);
  if (g.energy < cost) return `Needs ${cost} energy.`;
  return null;
}

/** Clamps a target point to the cast range around the fortress. */
export function clampCast(g: Game, x: number, y: number): [number, number] {
  const p = g.player;
  const d = Math.hypot(x - p.x, y - p.y);
  const range = castRange(g);
  if (d <= range) return [x, y];
  const k = range / d;
  return [p.x + (x - p.x) * k, p.y + (y - p.y) * k];
}

/** Plays the card in hand slot `slot` at world point (x, y). */
export function playCard(g: Game, slot: number, x: number, y: number): PlayResult {
  const block = cardBlock(g, slot);
  if (block) return { ok: false, msg: block };
  const id = g.hand[slot];
  const d = CARDS[id];
  [x, y] = clampCast(g, x, y);
  if (d.target === 'self') {
    x = g.player.x;
    y = g.player.y;
  }
  const P = g.cardPower(id);
  if (!runCard(g, d, x, y, P)) return { ok: false, msg: 'No room to land there.' };
  g.energy -= g.cardCost(id);
  g.cycleCard(slot);
  if (g.crewFx.blitz > 0) {
    g.player.addBuff('blitz', 5, 0.3);
    g.applyCrew();
  }
  g.hooks.sound('card');
  g.float(g.player.x, g.player.y - 0.6, d.name.toUpperCase(), '#ffe57f', true);
  g.objectiveCounters.cards = (g.objectiveCounters.cards ?? 0) + 1;
  return { ok: true };
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function lob(g: Game, kind: Projectile['kind'], x0: number, y0: number, x: number, y: number, flight: number, dmg: number, splash: number, color: string, size: number, z0 = 1.4): void {
  g.projectiles.push({
    id: eid(), x: x0, y: y0, z: z0, vx: (x - x0) / flight, vy: (y - y0) / flight, vz: (9.8 * flight) / 2 - z0 / flight, team: 'player', kind, dmg, splash, pierce: 0,
    life: 0, maxLife: flight, color, homing: 0, targetId: 0, arc: true, tx: x, ty: y, burn: 0, crit: false, lifesteal: 0, srcTank: g.player.id, hit: [], flyer: 0,
    interceptable: false, hp: 1, size,
  });
}

/** A purely visual body falling from the sky (nuke, meteors, drop pods). */
function fallFromSky(g: Game, kind: Projectile['kind'], x: number, y: number, t: number, color: string, size: number, z0 = 36): void {
  const ox = x - 4, oy = y - 6;
  g.projectiles.push({
    id: eid(), x: ox, y: oy, z: z0, vx: (x - ox) / t, vy: (y - oy) / t, vz: (4.9 * t * t - z0) / t, team: 'player', kind, dmg: 0, splash: 0, pierce: 0,
    life: 0, maxLife: t, color, homing: 0, targetId: 0, arc: true, tx: x, ty: y, burn: 0, crit: false, lifesteal: 0, srcTank: g.player.id, hit: [], flyer: 0,
    interceptable: false, hp: 1, size, visual: true,
  });
}

/** A delayed blast with a warning circle on the ground. */
function strikeAt(g: Game, x: number, y: number, r: number, delay: number, dmg: number, color: string, quiet = false, extra?: () => void): void {
  g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r, a: 0, len: 0, t: 0, total: delay, color, team: 'player', dmg,
    onDone: () => {
      explode(g, x, y, r, dmg, 'player', { srcTank: g.player.id }, color, quiet);
      extra?.();
    } });
}

function enemiesIn(g: Game, x: number, y: number, r: number) {
  return g.enemies.filter((e) => e.hp > 0 && !e.burrowed && Math.hypot(e.x - x, e.y - y) <= r + e.r);
}

function tanksIn(g: Game, x: number, y: number, r: number) {
  return g.tanks.filter((t) => !t.dead && t.team === 'enemy' && t.edgeDist(x, y) <= r);
}

/* ---------------------------------------------------------------------- */
/* Card effects                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Returns false if the card fizzled (it isn't spent). Everything is at Titan scale: areas are CARD_AREA times the
 * old base size and damage is four times what it was, so a card clears a real piece of a horde.
 */
function runCard(g: Game, d: CardDef, x: number, y: number, P: number): boolean {
  const p = g.player;
  const heal = (frac: number, over: number): void => p.addBuff('regen', over, (p.stats.maxHp * frac) / over);
  const R = d.radius;
  const A = CARD_AREA;
  // Card damage scale. Cards are a lever, not the whole fight: guns and the hull do the heavy lifting.
  const K = 1.5;
  const scatter = (r: number): [number, number] => {
    const a = Math.random() * Math.PI * 2, k = Math.sqrt(Math.random()) * r;
    return [x + Math.cos(a) * k, y + Math.sin(a) * k];
  };
  switch (d.id) {
    /* ---------------- Iron ---------------- */
    case 'artillery':
      for (let i = 0; i < 18; i++) {
        const [sx, sy] = scatter(R);
        strikeAt(g, sx, sy, 2.2 * A * 0.7, 0.8 + i * 0.09, 60 * K * P, '#ffab40', i % 3 !== 0);
      }
      g.hooks.sound('mortar', x, y, 1);
      break;
    case 'salvo':
      for (let i = 0; i < 30; i++) {
        const [sx, sy] = scatter(R);
        lob(g, 'missile', p.x, p.y, sx, sy, 0.9 + i * 0.04, 40 * K * P, 1.8 * A * 0.6, '#ff9100', 0.5, 12);
      }
      g.hooks.sound('rocket', p.x, p.y, 1);
      break;
    case 'fireball':
      lob(g, 'fireball', p.x, p.y, x, y, 1, 0, 0, '#ff3d00', 3, 12);
      strikeAt(g, x, y, R, 1, 220 * K * P, '#ff3d00', false, () => g.zones.push({ id: eid(), x, y, r: R, t: 6, kind: 'fire', dps: 30 * K * P, team: 'player' }));
      break;
    case 'carpet_bomb': {
      const n = Math.round(30 * Math.min(1.6, P));
      const a = Math.atan2(y - p.y, x - p.x);
      const len = 18 * A;
      const x0 = x - Math.cos(a) * len / 2, y0 = y - Math.sin(a) * len / 2;
      spawnJet(g, x0 - Math.cos(a) * 12 * A, y0 - Math.sin(a) * 12 * A, a, x0 + Math.cos(a) * 70 * A, y0 + Math.sin(a) * 70 * A, 0, 3);
      for (let i = 0; i < n; i++) {
        const k = (i / Math.max(1, n - 1)) * len;
        const bx = x0 + Math.cos(a) * k + (Math.random() - 0.5) * 1.5 * A, by = y0 + Math.sin(a) * k + (Math.random() - 0.5) * 1.5 * A;
        strikeAt(g, bx, by, 2.4 * A * 0.7, 0.9 + i * 0.05, 90 * K * P, '#ff6e40', i % 3 !== 0);
      }
      break;
    }
    case 'barrage':
      p.addBuff('barrage', 6, 0.5 * P);
      break;
    case 'meltdown':
      p.shield = p.stats.shield;
      p.addBuff('meltdown', 7, 0.8 * P);
      break;
    case 'jets': {
      const n = Math.round(6 * Math.min(1.7, P));
      const a = Math.atan2(y - p.y, x - p.x);
      for (let i = 0; i < n; i++) spawnJet(g, p.x, p.y, a + (i - (n - 1) / 2) * 0.3, x, y, 40 * K * P, 14);
      break;
    }
    case 'meteor': {
      const n = Math.round(30 * Math.min(1.8, P));
      for (let i = 0; i < n; i++) {
        const [mx, my] = scatter(R);
        const t = 0.8 + (i / n) * 4;
        fallFromSky(g, 'meteor', mx, my, t, '#ff9100', 3, 26 * A);
        strikeAt(g, mx, my, 3 * A * 0.6, t, 240 * K * P, '#ff6d00', i % 2 === 1, () => {
          if (i % 3 === 0) g.zones.push({ id: eid(), x: mx, y: my, r: 2.2 * A * 0.6, t: 4, kind: 'fire', dps: 40 * K * P, team: 'player' });
        });
      }
      break;
    }
    case 'nuke': {
      const dmg = 5000 * P;
      g.hooks.toast('☢ NUCLEAR LAUNCH DETECTED ☢', '#ffea00');
      g.hooks.sound('alarm');
      setTimeout(() => g.hooks.sound('alarm'), 900);
      fallFromSky(g, 'nuke', x, y, 3.2, '#eceff1', 4, 48 * A);
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 3.2, color: '#ffea00', team: 'player', dmg: 0,
        onDone: () => {
          g.fx.push({ t: 'nuke', x, y, r: R });
          g.fx.push({ t: 'shake', amt: 2.5 });
          g.hooks.sound('bigboom');
          explode(g, x, y, R, dmg, 'player', { srcTank: p.id, burn: 60 * K * P }, '#ffea00');
          g.zones.push({ id: eid(), x, y, r: R * 0.8, t: 12, kind: 'rad', dps: 60 * K * P, team: 'player' });
        } });
      break;
    }

    /* ---------------- Volt ---------------- */
    case 'emp': {
      g.fx.push({ t: 'ring', x, y, r: R, color: '#ea80fc' });
      g.fx.push({ t: 'ring', x, y, r: R * 0.6, color: '#ea80fc' });
      g.hooks.sound('tesla', x, y, 1);
      for (const e of enemiesIn(g, x, y, R)) {
        e.stun = Math.max(e.stun, Math.min(4, 2 * P) * (e.titan ? 0.4 : 1));
        damageEnemy(g, e, 40 * K * P, { srcTank: p.id });
      }
      for (const t of tanksIn(g, x, y, R)) {
        t.addBuff('stun', 2 * P);
        t.shield = 0;
      }
      break;
    }
    case 'lightning': {
      const n = Math.round(24 * Math.min(1.7, P));
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const pool = [...enemiesIn(g, x, y, R).map((e) => ({ x: e.x, y: e.y })), ...tanksIn(g, x, y, R).map((t) => ({ x: t.x, y: t.y }))];
          const tgt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { x: x + (Math.random() - 0.5) * R * 2, y: y + (Math.random() - 0.5) * R * 2 };
          skyStrike(g, 'player', tgt.x, tgt.y, 120 * K * P, { srcTank: p.id, fx: { slow: 0, stun: 0.35, stunTime: 1.2, knock: 0, split: 0, pull: false, execute: false, volatile: false, specials: [], base: 120 * K * P } }, '#82b1ff', 1.8 * A * 0.6);
        }, i * 110);
      }
      break;
    }
    case 'orbital': {
      const dmg = 600 * K * P;
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 1.2, color: '#ff3d00', team: 'player', dmg,
        onDone: () => {
          g.fx.push({ t: 'beam', x0: x, y0: y - 0.01, x1: x, y1: y, color: '#ff3d00', w: 3 * A, life: 0.6 });
          explode(g, x, y, R, dmg, 'player', { srcTank: p.id }, '#ff3d00');
          g.zones.push({ id: eid(), x, y, r: R * 0.8, t: 5, kind: 'fire', dps: 40 * K * P, team: 'player' });
        } });
      g.hooks.sound('rail');
      break;
    }
    case 'orbital_laser':
      g.orbital = { x, y, t: 7, dps: 350 * K * P };
      g.hooks.sound('rail');
      break;
    case 'timestop': {
      const dur = 3 * Math.min(1.4, P);
      const reach = 45 * A;
      g.timeStop = dur;
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < reach) e.stun = Math.max(e.stun, dur);
      for (const t of g.tanks) if (!t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < reach) t.addBuff('stun', dur);
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: reach, color: '#18ffff' });
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: reach * 0.5, color: '#18ffff' });
      g.hooks.toast('Time stands still...', '#18ffff');
      break;
    }
    case 'blink': {
      const need = Math.max(0.8, p.stats.radius * 0.85);
      // A go-anywhere hull lands on whatever is there (and crushes it); others need clear ground.
      const spot = p.crush ? (g.map.inside(Math.floor(x), Math.floor(y)) ? [Math.floor(x), Math.floor(y)] : null) : nearestClear(g.map, Math.floor(x), Math.floor(y), need, tankNav(p), 12);
      if (!spot) return false;
      g.fx.push({ t: 'teleport', x: p.x, y: p.y });
      p.x = spot[0] + 0.5;
      p.y = spot[1] + 0.5;
      resolveTank(g, p);
      p.path = [];
      p.goal = null;
      g.fx.push({ t: 'teleport', x: p.x, y: p.y });
      const r = p.stats.length / 2 + 5 * A;
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < r + e.r) e.stun = Math.max(e.stun, 1.5 * P * (e.titan ? 0.3 : 1));
      explode(g, p.x, p.y, r, 80 * K * P, 'player', { srcTank: p.id }, '#18ffff');
      break;
    }
    case 'drones':
      spawnDrones(g, Math.round(8 * Math.min(1.8, P)), 22 * K * P, 18, 120 * K * P, x, y);
      break;
    case 'cataclysm':
      g.storm = { t: 10, P, cd: 0 };
      g.hooks.toast('The sky splits open!', '#82b1ff');
      g.fx.push({ t: 'shake', amt: 1 });
      break;
    case 'nitro':
      p.addBuff('nitro', 4 * p.nitroMult, 0.7 * P);
      break;

    /* ---------------- Rust ---------------- */
    case 'weld':
      heal(0.05 * P, 20);
      g.fx.push({ t: 'heal', x: p.x, y: p.y });
      break;
    case 'nanite':
      heal(0.08 * P, 20);
      p.addBuff('armorUp', 6, 0.2);
      g.fx.push({ t: 'heal', x: p.x, y: p.y });
      break;
    case 'acid_rain':
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI * 2, r = i === 0 ? 0 : R * 0.6;
        g.zones.push({ id: eid(), x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, r: R * 0.45, t: 6, kind: 'acid', dps: 30 * K * P, team: 'player' });
      }
      break;
    case 'magnet':
      p.addBuff('magnet', 1.5, 30 * A);
      p.addBuff('harvestUp', 8, 0.6 * P);
      break;
    case 'frenzy':
      p.addBuff('frenzy', 45, 1 * P);
      g.applyCrew();
      break;
    case 'mines':
      layMines(g, Math.round(24 * Math.min(1.8, P)), 120 * K * P, x, y, R);
      break;
    case 'kraken':
      g.fx.push({ t: 'ring', x, y, r: R, color: '#26a69a' });
      for (const e of enemiesIn(g, x, y, R)) {
        e.stun = Math.max(e.stun, 3 * Math.min(1.6, P) * (e.titan ? 0.3 : 1));
        damageEnemy(g, e, 80 * K * P, { srcTank: p.id });
        g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#26a69a', n: 6 });
      }
      for (const t of tanksIn(g, x, y, R)) {
        t.addBuff('stun', 2.5);
        damageTank(g, t, 80 * K * P, { srcTank: p.id });
      }
      g.hooks.sound('roar', x, y, 0.5);
      break;

    /* ---------------- Void ---------------- */
    case 'singularity':
      g.zones.push({ id: eid(), x, y, r: R * 1.4, t: 3, kind: 'well', dps: 60 * K * P, team: 'player' });
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 3, color: '#d500f9', team: 'player', dmg: 250 * K * P,
        onDone: () => explode(g, x, y, R, 250 * K * P, 'player', { srcTank: p.id }, '#d500f9') });
      break;
    case 'soul_harvest':
      p.addBuff('soul', 10, 0.03 * P);
      break;
    case 'dragon':
      spawnDragon(g, x, y, P * K);
      g.hooks.toast('A dragon answers the call!', '#ff3d00');
      break;
    case 'void_rift':
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 0.8, color: '#b388ff', team: 'player', dmg: 700 * K * P,
        onDone: () => {
          explode(g, x, y, R, 700 * K * P, 'player', { srcTank: p.id }, '#b388ff');
          for (const e of enemiesIn(g, x, y, R)) {
            if (e.hp > 0 && !e.colossus && e.hp < e.maxHp * (e.titan ? 0.03 : 0.1)) {
              g.float(e.x, e.y + 0.5, 'ERASED', '#b388ff', true);
              damageEnemy(g, e, e.hp + 1, { srcTank: p.id, silent: true });
            }
          }
        } });
      break;
    case 'scholar':
      p.addBuff('scholar', 60, 1 * P);
      break;
    case 'deadeye':
      p.addBuff('deadeye', 6 * Math.min(1.6, P));
      break;

    /* ---------------- Aegis ---------------- */
    case 'shield_surge':
      p.buffs.set('barrier', { t: 6, v: p.stats.maxHp * 0.07 * P });
      g.onHeal?.(0, p.stats.maxHp * 0.07 * P);
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: p.stats.length * 0.7, color: '#40c4ff' });
      break;
    case 'dome':
      p.addBuff('dome', 3 * Math.min(1.4, P));
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: p.stats.length * 0.8, color: '#69f0ae' });
      break;
    case 'squad':
      spawnMarines(g, Math.round(9 * Math.min(1.7, P)) + p.crew.extraMarines, false, 20, P * K, x, y);
      fallFromSky(g, 'boulder', x, y, 0.6, '#90a4ae', 3, 20 * A);
      break;
    case 'legion':
      spawnMarines(g, Math.round(15 * Math.min(1.6, P)) + p.crew.extraMarines, true, 25, P * K, x, y);
      fallFromSky(g, 'boulder', x, y, 0.6, '#90a4ae', 4, 20 * A);
      break;
    case 'mech':
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 1.2, color: '#ffab40', team: 'player', dmg: 0, onDone: () => spawnMech(g, x, y, P * K) });
      fallFromSky(g, 'boulder', x, y, 1.2, '#ffab40', 5, 30 * A);
      break;
    case 'miracle':
      p.addBuff('invuln', 1.5 * Math.min(1.4, P));
      heal(0.06, 20);
      for (const k of g.crew) k.injured = 0;
      p.buffs.delete('stun');
      p.buffs.delete('burn');
      p.buffs.delete('chill');
      g.applyCrew();
      g.fx.push({ t: 'heal', x: p.x, y: p.y });
      break;
    case 'treasure':
      p.addBuff('magnet', 2, 60 * A);
      g.chestBonus = Math.max(g.chestBonus, 1);
      revealFeatures(g);
      g.hooks.toast('Every loot area and rune is now on your map (M). The next chest is one rarity better.', '#ffd23f');
      break;
    case 'charge': {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.rot = Math.atan2(dy, dx);
      const steps = Math.ceil(d / 1);
      const hit = new Set<number>();
      const wide = p.stats.width / 2 + 3 * A;
      for (let i = 0; i < steps; i++) {
        p.x += dx / d;
        p.y += dy / d;
        if (resolveTank(g, p)) break;
        for (const e of g.enemies) {
          if (hit.has(e.id) || p.edgeDist(e.x, e.y) > e.r + 3 * A * 0.3) continue;
          hit.add(e.id);
          damageEnemy(g, e, 150 * K * P, { srcTank: p.id, knock: 14 * 3, kx: -dy / d, ky: dx / d });
        }
        for (const t of g.tanks) {
          if (hit.has(t.id) || t.dead || Math.hypot(t.x - p.x, t.y - p.y) > wide + t.stats.radius) continue;
          hit.add(t.id);
          explode(g, t.x, t.y, 1, 150 * K * P, 'player', { srcTank: p.id });
        }
        if (i % 8 === 0) g.fx.push({ t: 'dust', x: p.x, y: p.y, color: '#18ffff' });
      }
      p.path = [];
      p.goal = null;
      g.fx.push({ t: 'shake', amt: 0.6 });
      break;
    }
    case 'smoke':
      p.addBuff('smoke', 5 * Math.min(1.6, P));
      g.zones.push({ id: eid(), x: p.x, y: p.y, r: p.stats.length * 0.8, t: 5, kind: 'smoke', dps: 0, team: 'player' });
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 30 * A) e.aggro = false;
      break;
    default:
      return false;
  }
  return true;
}

/* ---------------------------------------------------------------------- */
/* Long-running effects                                                    */
/* ---------------------------------------------------------------------- */

function updateOrbital(g: Game, dt: number): void {
  const o = g.orbital;
  if (!o) return;
  o.t -= dt;
  if (o.t <= 0 || g.player.dead) {
    g.orbital = null;
    return;
  }
  // The beam drifts toward the cursor.
  const dx = g.aim.x - o.x, dy = g.aim.y - o.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, 9 * CARD_AREA * dt);
  if (d > 0.01) {
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
  }
  const r = 3.5 * CARD_AREA;
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed || Math.hypot(e.x - o.x, e.y - o.y) > r + e.r) continue;
    damageEnemy(g, e, o.dps * dt, { srcTank: g.player.id, silent: Math.random() > dt * 4, burn: 30 });
  }
  for (const t of g.tanks) {
    if (t.dead || t.team !== 'enemy' || t.edgeDist(o.x, o.y) > r) continue;
    damageTank(g, t, o.dps * dt, { srcTank: g.player.id, silent: Math.random() > dt * 4 });
  }
  g.fx.push({ t: 'beam', x0: o.x, y0: o.y, x1: o.x, y1: o.y, color: '#ff1744', w: 2.2 * CARD_AREA, life: 0.06 });
  if (Math.random() < dt * 6) g.zones.push({ id: eid(), x: o.x, y: o.y, r: 2 * CARD_AREA, t: 2.5, kind: 'fire', dps: 100, team: 'player' });
  if (Math.random() < dt * 20) g.fx.push({ t: 'spark', x: o.x + (Math.random() - 0.5) * 3 * CARD_AREA, y: o.y + (Math.random() - 0.5) * 3 * CARD_AREA, color: '#ff5252', n: 3 });
}

function updateStorm(g: Game, dt: number): void {
  const s = g.storm;
  if (!s) return;
  s.t -= dt;
  s.cd -= dt;
  if (s.t <= 0 || g.player.dead) {
    g.storm = null;
    return;
  }
  const p = g.player;
  const reach = p.stats.length / 2 + 200;
  while (s.cd <= 0) {
    s.cd += 1 / 14;
    const near = g.enemies.filter((e) => e.hp > 0 && !e.burrowed && Math.hypot(e.x - p.x, e.y - p.y) < reach);
    const tanks = g.tanks.filter((t) => !t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < reach + 2);
    const pool = [...near.map((e) => ({ x: e.x, y: e.y })), ...tanks.map((t) => ({ x: t.x, y: t.y }))];
    const tgt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { x: p.x + (Math.random() - 0.5) * reach * 2, y: p.y + (Math.random() - 0.5) * reach * 2 };
    skyStrike(g, 'player', tgt.x, tgt.y, 300 * s.P, { srcTank: p.id, fx: { slow: 0, stun: 0.3, stunTime: 1, knock: 0, split: 0, pull: false, execute: false, volatile: false, specials: [], base: 300 * s.P } }, '#82b1ff', 1.8 * CARD_AREA * 0.6);
  }
}
