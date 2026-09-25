import { GRAVITY, MAX_FALL, TILE } from '../src/shared/constants';
import type { Slot, Stack } from '../src/shared/inventory';
import { getItem, hasItem } from '../src/shared/items';
import { rollLoot } from '../src/shared/loot';
import { makeBody, moveBody, type Body } from '../src/shared/physics';
import type { C2S, NetCrate, NetPlayer, S2C } from '../src/shared/protocol';
import { TILES, T } from '../src/shared/tiles';
import { generateWarzone, type WarzoneMap } from '../src/shared/warzoneGen';

export interface Conn {
  send(msg: S2C): void;
  close(): void;
}

interface Bot {
  dir: number;
  fireCd: number;
  jumpCd: number;
  think: number;
  weapon: string;
}

interface SPlayer {
  id: number;
  conn: Conn | null;
  name: string;
  body: Body;
  facing: number;
  aim: number;
  weapon: string;
  anim: number;
  hp: number;
  maxHp: number;
  armor: number;
  suit: string | null;
  inv: Slot[];
  dead: boolean;
  bot: Bot | null;
  dmgWindow: { t: number; dmg: number };
  lastShot: number;
  respawnAt: number;
  /** Spawn protection: no damage (and bots ignore you) until this time. */
  safeUntil: number;
}

interface SProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  owner: number;
}

const BOT_NAMES = ['Scav-117', 'Rattler', 'Hollow Jack', 'Grinder', 'Mother Rust', 'Voltface', 'Nine-Toes', 'Carrion'];
const PLAYER_W = 14;
const PLAYER_H = 30;
const SPAWN_PROTECTION = 5;

export class WarzoneServer {
  readonly map: WarzoneMap;
  readonly seed: number;
  private players = new Map<number, SPlayer>();
  private crates = new Map<number, NetCrate & { born: number }>();
  private edits = new Map<number, number>();
  private projectiles: SProjectile[] = [];
  private nextId = 1;
  private time = 0;
  private supplyT = 45;
  private rng: () => number;

  constructor(seed: number, botCount = 5, rng: () => number = Math.random) {
    this.seed = seed;
    this.rng = rng;
    this.map = generateWarzone(seed);
    for (let i = 0; i < botCount; i++) this.spawnBot(BOT_NAMES[i % BOT_NAMES.length]);
  }

  get humanCount(): number {
    return [...this.players.values()].filter((p) => !p.bot).length;
  }

  /* ------------------------------------------------------------------ */
  /* Connections                                                          */
  /* ------------------------------------------------------------------ */

  connect(conn: Conn): { message(m: C2S): void; close(): void } {
    let player: SPlayer | null = null;
    return {
      message: (m) => {
        if (m.t === 'join') {
          if (player) return;
          player = this.join(conn, m);
          return;
        }
        if (!player || !this.players.has(player.id)) return;
        this.handle(player, m);
      },
      close: () => {
        if (player && this.players.has(player.id)) {
          // Logging out mid-raid drops your pack, just like dying.
          if (!player.dead) this.dropPack(player, `${player.name}'s abandoned pack`);
          this.players.delete(player.id);
          this.broadcast({ t: 'left', id: player.id });
          this.broadcast({ t: 'msg', text: `${player.name} vanished from the Dead Zone.`, color: '#b0bec5' });
        }
      },
    };
  }

  private join(conn: Conn, m: Extract<C2S, { t: 'join' }>): SPlayer {
    const spawn = this.map.spawns[Math.floor(this.rng() * this.map.spawns.length)];
    const p: SPlayer = {
      id: this.nextId++,
      conn,
      name: String(m.name || 'Drifter').slice(0, 16),
      body: makeBody(spawn.x - PLAYER_W / 2, spawn.y - PLAYER_H - 2, PLAYER_W, PLAYER_H, 'p'),
      facing: 1, aim: 0, weapon: '', anim: 0,
      hp: Math.max(50, Math.min(100, Number(m.hp) || 100)),
      maxHp: 100,
      armor: Math.max(0, Math.min(14, Number(m.armor) || 0)),
      suit: m.suit && hasItem(m.suit) ? m.suit : null,
      inv: sanitizeInv(m.inv),
      dead: false, bot: null, dmgWindow: { t: 0, dmg: 0 }, lastShot: 0, respawnAt: 0, safeUntil: this.time + SPAWN_PROTECTION,
    };
    this.players.set(p.id, p);
    conn.send({
      t: 'welcome', id: p.id, seed: this.seed, spawn, players: this.snapshot(), crates: [...this.crates.values()].map(stripCrate),
      edits: [...this.edits], hp: p.hp, maxHp: p.maxHp,
    });
    this.broadcast({ t: 'msg', text: `${p.name} entered the Dead Zone.`, color: '#ff8a80' }, p.id);
    return p;
  }

  private handle(p: SPlayer, m: C2S): void {
    switch (m.t) {
      case 'state': {
        if (p.dead) return;
        const W = this.map.world;
        p.body.x = clampNum(m.x, 0, W.w * TILE - PLAYER_W);
        p.body.y = clampNum(m.y, -400, W.h * TILE);
        p.body.vx = clampNum(m.vx, -2000, 2000);
        p.body.vy = clampNum(m.vy, -2000, 2000);
        p.facing = m.facing >= 0 ? 1 : -1;
        p.aim = Number(m.aim) || 0;
        p.weapon = hasItem(m.weapon) ? m.weapon : '';
        p.anim = Number(m.anim) || 0;
        break;
      }
      case 'inv':
        p.inv = sanitizeInv(m.inv);
        break;
      case 'shoot': {
        if (p.dead || !hasItem(m.w)) return;
        this.broadcast({ t: 'shot', id: p.id, x: m.x, y: m.y, a: m.a, w: m.w }, p.id);
        break;
      }
      case 'hit':
        this.applyHit(p, m.target, m.dmg, m.w);
        break;
      case 'tile': {
        const W = this.map.world;
        if (!W.inBounds(m.x, m.y) || !(m.tile in TILES)) return;
        const cur = W.get(m.x, m.y);
        if (cur === T.BEDROCK) return;
        W.set(m.x, m.y, m.tile);
        this.edits.set(m.y * W.w + m.x, m.tile);
        this.broadcast({ t: 'tile', x: m.x, y: m.y, tile: m.tile }, p.id);
        break;
      }
      case 'take': {
        const c = this.crates.get(m.crate);
        if (!c || p.dead) return;
        const dist = Math.hypot(c.x - (p.body.x + PLAYER_W / 2), c.y - (p.body.y + PLAYER_H / 2));
        if (dist > 90) return;
        const st = c.items[m.index];
        if (!st) return;
        c.items.splice(m.index, 1);
        p.conn?.send({ t: 'took', crate: c.id, stack: st });
        if (c.items.length === 0) {
          this.crates.delete(c.id);
          this.broadcast({ t: 'crate_gone', id: c.id });
        } else {
          this.broadcast({ t: 'crate', crate: stripCrate(c) });
        }
        break;
      }
      case 'heal': {
        if (p.dead) return;
        p.hp = Math.min(p.maxHp, p.hp + clampNum(m.amount, 0, 60));
        this.broadcast({ t: 'hp', id: p.id, hp: p.hp });
        break;
      }
      case 'extract': {
        if (p.dead) return;
        const cx = p.body.x + PLAYER_W / 2, cy = p.body.y + PLAYER_H / 2;
        const inside = this.map.extracts.some((e) => cx > e.x - 8 && cx < e.x + e.w + 8 && cy > e.y - 8 && cy < e.y + e.h + 8);
        if (!inside) {
          p.conn?.send({ t: 'msg', text: 'Extraction failed: you are not in an extraction zone.', color: '#ff5252' });
          return;
        }
        p.conn?.send({ t: 'extracted' });
        this.players.delete(p.id);
        this.broadcast({ t: 'left', id: p.id });
        this.broadcast({ t: 'msg', text: `${p.name} extracted.`, color: '#69f0ae' });
        break;
      }
      case 'chat':
        this.broadcast({ t: 'msg', text: `${p.name}: ${String(m.msg).slice(0, 120)}` });
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Combat                                                               */
  /* ------------------------------------------------------------------ */

  private applyHit(shooter: SPlayer, targetId: number, dmgIn: number, weapon: string): void {
    const target = this.players.get(targetId);
    if (!target || target.dead || shooter.dead || target === shooter) return;
    let cap = 100;
    if (weapon !== 'explosive' && hasItem(weapon)) cap = (getItem(weapon).weapon?.dmg ?? 30) * 1.05;
    const dmg = clampNum(dmgIn, 0, cap);
    const d = Math.hypot(target.body.x - shooter.body.x, target.body.y - shooter.body.y);
    if (d > 2600) return;
    // Rate limit: a single shooter can't deal more than ~450 dps.
    const w = shooter.dmgWindow;
    if (this.time - w.t > 1) {
      w.t = this.time;
      w.dmg = 0;
    }
    if (w.dmg > 450) return;
    w.dmg += dmg;
    this.damage(target, dmg, shooter);
  }

  private damage(target: SPlayer, raw: number, by: SPlayer | null): void {
    if (target.safeUntil > this.time) return;
    const dmg = raw * (20 / (20 + target.armor));
    target.hp -= dmg;
    this.broadcast({ t: 'hp', id: target.id, hp: Math.max(0, Math.round(target.hp)) });
    if (target.hp <= 0) this.kill(target, by);
  }

  private kill(victim: SPlayer, killer: SPlayer | null): void {
    victim.dead = true;
    victim.hp = 0;
    const lost = this.dropPack(victim, `${victim.name}'s pack`);
    const killerName = killer ? killer.name : 'the Dead Zone';
    this.broadcast({ t: 'killed', victim: victim.id, victimName: victim.name, killerName });
    if (victim.bot) {
      victim.respawnAt = this.time + 20;
    } else {
      victim.conn?.send({ t: 'you_died', by: killerName, lost });
      this.players.delete(victim.id);
      this.broadcast({ t: 'left', id: victim.id }, victim.id);
    }
  }

  private dropPack(p: SPlayer, label: string): Stack[] {
    const items = p.inv.filter((s): s is Stack => !!s && s.n > 0).map((s) => ({ ...s }));
    p.inv = [];
    if (!items.length) return [];
    const c = { id: this.nextId++, x: p.body.x + PLAYER_W / 2, y: p.body.y + PLAYER_H, items, kind: 'body' as const, label, born: this.time };
    this.crates.set(c.id, c);
    this.broadcast({ t: 'crate', crate: stripCrate(c) });
    return items;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                           */
  /* ------------------------------------------------------------------ */

  private spawnBot(name: string): void {
    const spawn = this.map.spawns[Math.floor(this.rng() * this.map.spawns.length)];
    const weapon = this.rng() < 0.5 ? 'scrap_smg' : 'rivet_pistol';
    const loot = rollLoot('deadzone_scav', this.rng, 3);
    const p: SPlayer = {
      id: this.nextId++, conn: null, name,
      body: makeBody(spawn.x + (this.rng() - 0.5) * 200, spawn.y - PLAYER_H - 4, PLAYER_W, PLAYER_H, 'bot'),
      facing: 1, aim: 0, weapon, anim: 0, hp: 70, maxHp: 70, armor: 3, suit: 'scav_jacket',
      inv: [{ id: weapon, n: 1 }, ...loot], dead: false,
      bot: { dir: this.rng() < 0.5 ? -1 : 1, fireCd: 1, jumpCd: 0, think: 0, weapon },
      dmgWindow: { t: 0, dmg: 0 }, lastShot: 0, respawnAt: 0, safeUntil: 0,
    };
    this.players.set(p.id, p);
  }

  tick(dt: number): void {
    this.time += dt;
    const W = this.map.world;
    for (const p of [...this.players.values()]) {
      if (!p.bot) continue;
      if (p.dead) {
        if (this.time >= p.respawnAt) {
          this.players.delete(p.id);
          this.spawnBot(p.name);
        }
        continue;
      }
      this.botThink(p, dt);
      p.body.vy = Math.min(p.body.vy + GRAVITY * dt, MAX_FALL);
      const x0 = p.body.x;
      moveBody(p.body, dt, [W]);
      p.anim += dt * (Math.abs(p.body.vx) / 40);
      if (p.bot.dir !== 0 && Math.abs(p.body.x - x0) < 0.1 && p.body.grounded && p.bot.jumpCd <= 0) {
        p.body.vy = -500;
        p.bot.jumpCd = 0.6;
      }
      if (p.body.y > W.h * TILE) this.kill(p, null);
    }
    this.updateProjectiles(dt);

    this.supplyT -= dt;
    if (this.supplyT <= 0) {
      this.supplyT = 90;
      const supplies = [...this.crates.values()].filter((c) => c.kind === 'supply').length;
      if (supplies < 3) {
        const tx = this.map.dropSites[Math.floor(this.rng() * this.map.dropSites.length)];
        const c = { id: this.nextId++, x: (tx + 0.5) * TILE, y: W.skyTop[tx] * TILE, items: rollLoot('supply_drop', this.rng, 4), kind: 'supply' as const, label: 'Supply drop', born: this.time };
        this.crates.set(c.id, c);
        this.broadcast({ t: 'crate', crate: stripCrate(c) });
        this.broadcast({ t: 'msg', text: `SUPPLY DROP landed at X ${tx}. It will not stay unclaimed for long.`, color: '#ff1744' });
      }
    }
    for (const c of [...this.crates.values()]) {
      if (this.time - c.born > 600) {
        this.crates.delete(c.id);
        this.broadcast({ t: 'crate_gone', id: c.id });
      }
    }
  }

  private botThink(p: SPlayer, dt: number): void {
    const b = p.bot!;
    b.fireCd -= dt;
    b.jumpCd -= dt;
    b.think -= dt;
    const cx = p.body.x + PLAYER_W / 2, cy = p.body.y + 10;
    let target: SPlayer | null = null;
    let best = 30 * TILE;
    for (const o of this.players.values()) {
      if (o === p || o.dead || o.bot || o.safeUntil > this.time) continue;
      const d = Math.hypot(o.body.x - p.body.x, o.body.y - p.body.y);
      if (d < best && this.lineOfSight(cx, cy, o.body.x + PLAYER_W / 2, o.body.y + 12)) {
        best = d;
        target = o;
      }
    }
    if (target) {
      const dx = target.body.x - p.body.x;
      const adx = Math.abs(dx) / TILE;
      p.facing = dx > 0 ? 1 : -1;
      b.dir = adx > 14 ? p.facing : adx < 7 ? -p.facing : 0;
      const tx = target.body.x + PLAYER_W / 2, ty = target.body.y + 14;
      p.aim = Math.atan2(ty - cy, tx - cx);
      if (b.fireCd <= 0) {
        b.fireCd = b.weapon === 'scrap_smg' ? 0.35 : 0.8;
        const w = getItem(b.weapon).weapon!;
        const a = p.aim + (this.rng() - 0.5) * 0.14;
        this.projectiles.push({ x: cx, y: cy, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.life, dmg: w.dmg * 0.8, owner: p.id });
        this.broadcast({ t: 'shot', id: p.id, x: Math.round(cx), y: Math.round(cy), a: +a.toFixed(3), w: b.weapon });
      }
    } else if (b.think <= 0) {
      b.think = 2 + this.rng() * 3;
      b.dir = this.rng() < 0.2 ? 0 : this.rng() < 0.5 ? -1 : 1;
      if (b.dir) p.facing = b.dir;
      p.aim = p.facing > 0 ? 0 : Math.PI;
    }
    const want = b.dir * 140;
    p.body.vx += (want - p.body.vx) * Math.min(1, dt * 8);
  }

  private lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const W = this.map.world;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let i = 1; i < steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      if (TILES[W.get(Math.floor(x / TILE), Math.floor(y / TILE))].solid) return false;
    }
    return true;
  }

  private updateProjectiles(dt: number): void {
    const W = this.map.world;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * dt) / 8));
      for (let i = 0; i < steps && pr.life > 0; i++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (TILES[W.get(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE))].solid) {
          pr.life = 0;
          break;
        }
        for (const p of this.players.values()) {
          if (p.id === pr.owner || p.dead || p.bot) continue;
          const b = p.body;
          if (pr.x > b.x && pr.x < b.x + PLAYER_W && pr.y > b.y && pr.y < b.y + PLAYER_H) {
            pr.life = 0;
            this.damage(p, pr.dmg, this.players.get(pr.owner) ?? null);
            break;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  snapshot(): NetPlayer[] {
    const out: NetPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.dead) continue;
      out.push({
        id: p.id, name: p.name, x: Math.round(p.body.x), y: Math.round(p.body.y), vx: Math.round(p.body.vx), vy: Math.round(p.body.vy),
        facing: p.facing, aim: +p.aim.toFixed(3), weapon: p.weapon, hp: Math.round(p.hp), maxHp: p.maxHp, suit: p.suit, bot: !!p.bot, anim: +p.anim.toFixed(2),
      });
    }
    return out;
  }

  broadcastSnapshot(): void {
    if (this.humanCount === 0) return;
    this.broadcast({ t: 'snap', players: this.snapshot() });
  }

  private broadcast(m: S2C, except = -1): void {
    for (const p of this.players.values()) if (p.conn && p.id !== except) p.conn.send(m);
  }

  /** Test helpers. */
  debugPlayer(id: number): { hp: number; dead: boolean; inv: Slot[] } | null {
    const p = this.players.get(id);
    return p ? { hp: p.hp, dead: p.dead, inv: p.inv } : null;
  }

  debugCrates(): NetCrate[] {
    return [...this.crates.values()].map(stripCrate);
  }

  debugMove(id: number, x: number, y: number): void {
    const p = this.players.get(id);
    if (p) {
      p.body.x = x;
      p.body.y = y;
    }
  }
}

function stripCrate(c: NetCrate & { born?: number }): NetCrate {
  return { id: c.id, x: c.x, y: c.y, items: c.items.map((s) => ({ ...s })), kind: c.kind, label: c.label };
}

function clampNum(v: unknown, a: number, b: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return n < a ? a : n > b ? b : n;
}

function sanitizeInv(inv: unknown): Slot[] {
  if (!Array.isArray(inv)) return [];
  return inv.slice(0, 60).map((s) => {
    if (!s || typeof s !== 'object') return null;
    const st = s as Stack;
    if (typeof st.id !== 'string' || !hasItem(st.id)) return null;
    const n = Math.floor(Number(st.n));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { id: st.id, n: Math.min(n, getItem(st.id).maxStack) };
  });
}
