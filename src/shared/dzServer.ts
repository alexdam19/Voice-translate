import { generateArena, type ArenaGen } from './arena';
import { mergeStacks, type Slot, type Stack } from './inventory';
import { rollDropRarity, rollLoot, rollWeaponKey } from './loot';
import { losClear, moveCircle } from './motion';
import { EXTRACT_SECONDS, type Blueprint, type C2S, type NetCrate, type RosterEntry, type S2C } from './protocol';
import { rollRarity } from './rarity';
import { maxHitDamage, makeWeapon, WEAPONS, weaponStats, type WeaponItem } from './weapons';

/**
 * The Dead Zone simulation. Transport-agnostic: the Node server wires it to
 * WebSockets, and the browser can run it locally (bots only) when offline.
 */

export interface Conn {
  send(msg: S2C): void;
  close(): void;
}

interface BotState {
  think: number;
  goal: { x: number; y: number } | null;
  targetId: number;
  cds: number[];
  lastPos: { x: number; y: number; t: number };
  strafe: number;
}

interface SPlayer {
  id: number;
  conn: Conn | null;
  name: string;
  bp: Blueprint;
  maxHp: number;
  armor: number;
  maxShield: number;
  hp: number;
  shield: number;
  shieldDelay: number;
  x: number;
  y: number;
  rot: number;
  aims: number[];
  dead: boolean;
  deadAt: number;
  bot: BotState | null;
  radius: number;
  cargo: Slot[];
  spare: WeaponItem[];
  vault: number;
  dmgWindow: { t: number; dmg: number };
  healWindow: { t: number; hp: number; shield: number };
  lastState: number;
  lastAccept: number;
  extractT: number;
  extractOn: boolean;
  safeUntil: number;
  dpsCap: number;
}

interface SCrate extends NetCrate {
  stacks: Stack[];
  weapons: WeaponItem[];
}

const BOT_NAMES = ['Scav-117', 'Rattler', 'Hollow Jack', 'Grinder', 'Mother Rust', 'Voltface', 'Nine-Toes', 'Carrion', 'Dust Baron', 'Gutterking'];
const SPAWN_PROTECTION = 5;
const CELL = 0.5;

function sizeOf(bp: Blueprint): { radius: number } {
  const dims: Record<string, [number, number]> = { crawler: [7, 10], assault: [8, 12], siege: [10, 14], dread: [11, 17], colossus: [13, 21], scout: [5, 7], outrider: [4, 6], outpost: [12, 12] };
  const [c] = dims[bp.chassis] ?? [7, 10];
  return { radius: (c * CELL + 1) / 2 };
}

function weaponsOf(bp: Blueprint): WeaponItem[] {
  return bp.modules.map((m) => m.weapon).filter((w): w is WeaponItem => !!w && !!WEAPONS[w.key]);
}

function dpsOf(bp: Blueprint): number {
  let s = 0;
  for (const w of weaponsOf(bp)) {
    const st = weaponStats(w);
    s += st.dmg * st.pellets * st.rate * (1 + st.splash * 0.3 + st.chain * 0.5) + st.burn;
  }
  return s;
}

export class WarzoneServer {
  readonly arena: ArenaGen;
  readonly seed: number;
  private players = new Map<number, SPlayer>();
  private crates = new Map<number, SCrate>();
  private nextId = 1;
  private nextUid = 900000;
  time = 0;
  private supplyT = 60;
  private crateRespawn: { at: number; x: number; y: number }[] = [];
  private rng: () => number;

  constructor(seed: number, botCount = 5, rng: () => number = Math.random) {
    this.seed = seed;
    this.rng = rng;
    this.arena = generateArena(seed);
    for (const c of this.arena.crates) this.spawnCrate(c.x, c.y, 'crate');
    for (let i = 0; i < botCount; i++) this.spawnBot(BOT_NAMES[i % BOT_NAMES.length]);
  }

  get humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  /* ---------------- crates ---------------- */

  private uid(): number {
    return this.nextUid++;
  }

  private spawnCrate(x: number, y: number, kind: SCrate['kind'], stacks?: Stack[], weapons?: WeaponItem[]): SCrate {
    const r = this.rng;
    let st = stacks ?? [];
    let ws = weapons ?? [];
    if (!stacks) {
      if (kind === 'supply') {
        st = rollLoot('dz_supply', r, 3);
        ws = [makeWeapon(this.uid(), rollWeaponKey(r), rollRarity(r, 1.8, 2), r)];
      } else {
        st = rollLoot('dz_crate', r, 2);
        if (r() < 0.35) ws = [makeWeapon(this.uid(), rollWeaponKey(r), rollDropRarity(r, 4, 0.4), r)];
      }
    }
    const c: SCrate = { id: this.nextId++, x, y, kind, stacks: st, weapons: ws };
    this.crates.set(c.id, c);
    return c;
  }

  /* ---------------- players ---------------- */

  private spawnPoint(): { x: number; y: number } {
    const s = this.arena.spawns;
    // Pick the spawn furthest from other living tanks.
    let best = s[0], bd = -1;
    for (const p of s) {
      let d = Infinity;
      for (const o of this.players.values()) if (!o.dead) d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y));
      d += this.rng() * 8;
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    return { x: best.x, y: best.y };
  }

  private botBlueprint(): Blueprint {
    const r = this.rng;
    const heavy = r() < 0.5;
    const modules: Blueprint['modules'] = [
      { key: 'bridge', cx: 3, cy: 4, weapon: null },
      { key: 'hp_light', cx: 0, cy: 1, weapon: makeWeapon(this.uid(), rollWeaponKey(r, (d) => d.size === 'light'), rollRarity(r, 0.8), r) },
      { key: 'hp_light', cx: 6, cy: 1, weapon: makeWeapon(this.uid(), rollWeaponKey(r, (d) => d.size === 'light'), rollRarity(r, 0.8), r) },
      heavy
        ? { key: 'hp_heavy', cx: 2, cy: 1, weapon: makeWeapon(this.uid(), rollWeaponKey(r, (d) => d.size === 'heavy'), rollRarity(r, 0.8), r) }
        : { key: 'hp_medium', cx: 2, cy: 1, weapon: makeWeapon(this.uid(), rollWeaponKey(r, (d) => d.size === 'medium'), rollRarity(r, 0.8), r) },
      { key: 'reactor', cx: 0, cy: 7, weapon: null },
      { key: 'engine', cx: 5, cy: 7, weapon: null },
    ];
    return { chassis: 'crawler', drive: 'tracks', modules };
  }

  private spawnBot(name: string): SPlayer {
    const bp = this.botBlueprint();
    const sp = this.spawnPoint();
    const p: SPlayer = {
      id: this.nextId++, conn: null, name, bp, maxHp: 900, armor: 0.08, maxShield: 0, hp: 900, shield: 0, shieldDelay: 0, x: sp.x, y: sp.y, rot: 0,
      aims: bp.modules.filter((m) => m.weapon).map(() => 0), dead: false, deadAt: 0,
      bot: { think: 0, goal: null, targetId: 0, cds: bp.modules.map(() => this.rng()), lastPos: { x: sp.x, y: sp.y, t: 0 }, strafe: this.rng() < 0.5 ? 1 : -1 },
      radius: sizeOf(bp).radius, cargo: [], spare: [], vault: 0, dmgWindow: { t: 0, dmg: 0 }, healWindow: { t: 0, hp: 0, shield: 0 }, lastState: 0, lastAccept: 0,
      extractT: 0, extractOn: false, safeUntil: this.time + SPAWN_PROTECTION, dpsCap: 0,
    };
    this.players.set(p.id, p);
    this.broadcast({ t: 'roster', add: this.rosterOf(p) });
    return p;
  }

  private rosterOf(p: SPlayer): RosterEntry {
    return { id: p.id, name: p.name, bp: p.bp, maxHp: p.maxHp, bot: !!p.bot };
  }

  connect(conn: Conn): { message(msg: C2S): void; close(): void } {
    let me: SPlayer | null = null;
    return {
      message: (msg) => {
        if (msg.t === 'hello') {
          if (me) return;
          const bp = sanitizeBlueprint(msg.bp);
          const sp = this.spawnPoint();
          me = {
            id: this.nextId++, conn, name: String(msg.name || 'Commander').slice(0, 24), bp, maxHp: clampNum(msg.maxHp, 100, 20000), armor: clampNum(msg.armor, 0, 0.6),
            maxShield: clampNum(msg.shield, 0, 5000), hp: 0, shield: 0, shieldDelay: 0, x: sp.x, y: sp.y, rot: 0, aims: [], dead: false, deadAt: 0, bot: null,
            radius: sizeOf(bp).radius, cargo: Array.isArray(msg.cargo) ? msg.cargo.slice(0, 200) : [], spare: Array.isArray(msg.spare) ? msg.spare.slice(0, 200) : [],
            vault: clampNum(msg.vault, 0, 40), dmgWindow: { t: 0, dmg: 0 }, healWindow: { t: 0, hp: 0, shield: 0 }, lastState: this.time, lastAccept: this.time, extractT: 0, extractOn: false,
            safeUntil: this.time + SPAWN_PROTECTION, dpsCap: 0,
          };
          me.hp = me.maxHp;
          me.shield = me.maxShield;
          me.dpsCap = dpsOf(bp) * 3 + 900;
          this.players.set(me.id, me);
          conn.send({ t: 'welcome', id: me.id, seed: this.seed, spawn: { x: me.x, y: me.y }, roster: [...this.players.values()].map((p) => this.rosterOf(p)) });
          this.broadcast({ t: 'roster', add: this.rosterOf(me) }, me.id);
          this.broadcast({ t: 'event', text: `${me.name} entered the Dead Zone.`, color: '#ff8a80' });
          return;
        }
        if (!me) return;
        this.handle(me, msg);
      },
      close: () => {
        if (!me) return;
        this.players.delete(me.id);
        this.broadcast({ t: 'roster', remove: me.id });
        me = null;
      },
    };
  }

  private handle(p: SPlayer, msg: C2S): void {
    switch (msg.t) {
      case 'state': {
        if (p.dead) return;
        // Accept moves no faster than 30 units/s since the last accepted one (dashes catch up a moment later).
        const dt = Math.max(0.05, this.time - p.lastAccept);
        const d = Math.hypot(msg.x - p.x, msg.y - p.y);
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y) && d <= 30 * dt + 2) {
          p.x = msg.x;
          p.y = msg.y;
          p.lastAccept = this.time;
        }
        p.rot = Number(msg.rot) || 0;
        p.aims = Array.isArray(msg.aims) ? msg.aims.slice(0, 40).map((a) => Number(a) || 0) : [];
        p.lastState = this.time;
        return;
      }
      case 'shot':
        if (p.dead) return;
        this.broadcast({ t: 'shot', from: p.id, kind: String(msg.kind), x: p.x, y: p.y, a: Number(msg.a) || 0, color: String(msg.color).slice(0, 9), speed: clampNum(msg.speed, 0, 80), range: clampNum(msg.range, 0, 60), pellets: clampNum(msg.pellets, 1, 12) }, p.id);
        return;
      case 'hit': {
        if (p.dead) return;
        const target = this.players.get(msg.target);
        if (!target || target.dead || target === p || target.safeUntil > this.time) return;
        const w = weaponsOf(p.bp).find((k) => k.key === msg.key && k.rarity === msg.rarity);
        const cap = w ? maxHitDamage(w.key, w.rarity) : 700; // abilities have no weapon key
        const dmg = Math.min(clampNum(msg.dmg, 0, 5000), cap);
        const range = w ? weaponStats(w).range * 1.6 : 45;
        if (Math.hypot(target.x - p.x, target.y - p.y) > range + target.radius + 6) return;
        if (this.time - p.dmgWindow.t > 1) p.dmgWindow = { t: this.time, dmg: 0 };
        if (p.dmgWindow.dmg + dmg > p.dpsCap) return;
        p.dmgWindow.dmg += dmg;
        this.damage(target, dmg, p.name);
        return;
      }
      case 'heal': {
        if (p.dead) return;
        if (this.time - p.healWindow.t > 10) p.healWindow = { t: this.time, hp: 0, shield: 0 };
        const hp = Math.min(clampNum(msg.hp, 0, 1e5), p.maxHp * 0.6 - p.healWindow.hp);
        const sh = Math.min(clampNum(msg.shield, 0, 1e5), p.maxHp * 0.4 - p.healWindow.shield);
        if (hp > 0) {
          p.healWindow.hp += hp;
          p.hp = Math.min(p.maxHp, p.hp + hp);
        }
        if (sh > 0) {
          p.healWindow.shield += sh;
          p.shield = Math.min(p.maxShield + p.maxHp * 0.4, p.shield + sh);
        }
        return;
      }
      case 'cargo':
        if (p.dead) return;
        p.cargo = Array.isArray(msg.cargo) ? msg.cargo.slice(0, 200) : p.cargo;
        p.spare = Array.isArray(msg.spare) ? msg.spare.slice(0, 200) : p.spare;
        return;
      case 'loot': {
        if (p.dead) return;
        const c = this.crates.get(msg.crate);
        if (!c || Math.hypot(c.x - p.x, c.y - p.y) > p.radius + 4) return;
        this.crates.delete(c.id);
        p.conn?.send({ t: 'loot', crate: c.id, stacks: c.stacks, weapons: c.weapons });
        if (c.kind === 'crate') this.crateRespawn.push({ at: this.time + 60, x: c.x, y: c.y });
        return;
      }
      case 'extract':
        p.extractOn = !!msg.on;
        return;
      case 'leave':
        this.players.delete(p.id);
        this.broadcast({ t: 'roster', remove: p.id });
        return;
    }
  }

  private damage(t: SPlayer, dmg: number, by: string): void {
    let d = dmg;
    if (t.shield > 0) {
      const s = Math.min(t.shield, d);
      t.shield -= s;
      d -= s;
    }
    d *= 1 - t.armor;
    t.hp -= d;
    t.shieldDelay = 4;
    if (t.hp <= 0) this.kill(t, by);
  }

  private kill(t: SPlayer, by: string): void {
    if (t.dead) return;
    t.dead = true;
    t.deadAt = this.time;
    t.hp = 0;
    let stacks: Stack[] = [];
    let weapons: WeaponItem[] = [];
    if (t.bot) {
      stacks = rollLoot('dz_crate', this.rng, 2);
      for (const m of t.bp.modules) if (m.weapon && this.rng() < 0.35) weapons.push(m.weapon);
    } else {
      // Cargo outside the vault, all spare weapons and one mounted weapon.
      stacks = mergeStacks(t.cargo.slice(t.vault).filter((s): s is Stack => !!s));
      weapons = [...t.spare];
      const mounted = weaponsOf(t.bp).filter((w) => w.rarity < 4 && !WEAPONS[w.key].exclusive);
      if (mounted.length) weapons.push(mounted[Math.floor(this.rng() * mounted.length)]);
      t.conn?.send({ t: 'died', by, dropped: { stacks, weapons } });
    }
    if (stacks.length || weapons.length) this.spawnCrate(t.x, t.y, 'wreck', stacks, weapons);
    this.broadcast({ t: 'event', text: `${t.name} was destroyed by ${by}.`, color: '#ff5252' });
  }

  /* ---------------- simulation ---------------- */

  tick(dt: number): void {
    this.time += dt;
    for (const p of [...this.players.values()]) {
      if (p.dead) {
        if (p.bot && this.time - p.deadAt > 20) {
          this.players.delete(p.id);
          this.broadcast({ t: 'roster', remove: p.id });
          this.spawnBot(p.name);
        } else if (!p.bot && this.time - p.deadAt > 5) {
          this.players.delete(p.id);
          this.broadcast({ t: 'roster', remove: p.id });
        }
        continue;
      }
      p.shieldDelay -= dt;
      if (p.shieldDelay <= 0 && p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + p.maxShield * 0.05 * dt);
      if (p.bot) this.botThink(p, dt);
      else {
        const inZone = this.arena.extracts.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < e.r + 1);
        if (p.extractOn && inZone) {
          p.extractT += dt;
          if (p.extractT >= EXTRACT_SECONDS) {
            p.conn?.send({ t: 'extracted' });
            this.broadcast({ t: 'event', text: `${p.name} extracted with their loot.`, color: '#76ff03' }, p.id);
            this.players.delete(p.id);
            this.broadcast({ t: 'roster', remove: p.id });
          }
        } else p.extractT = 0;
        // Dropped connections time out.
        if (this.time - p.lastState > 30) {
          this.kill(p, 'the void');
        }
      }
    }
    this.supplyT -= dt;
    if (this.supplyT <= 0) {
      this.supplyT = 75;
      const C = this.arena.gen.map.size / 2;
      this.spawnCrate(C + (this.rng() - 0.5) * 12, C + (this.rng() - 0.5) * 12, 'supply');
      this.broadcast({ t: 'event', text: 'Supply drop landed in the plaza!', color: '#ffd740' });
    }
    for (let i = this.crateRespawn.length - 1; i >= 0; i--) {
      const r = this.crateRespawn[i];
      if (this.time >= r.at) {
        this.crateRespawn.splice(i, 1);
        this.spawnCrate(r.x, r.y, 'crate');
      }
    }
  }

  private botThink(b: SPlayer, dt: number): void {
    const s = b.bot!;
    const map = this.arena.gen.map;
    s.think -= dt;
    // Pick a target.
    let target: SPlayer | null = null;
    let td = 46;
    for (const o of this.players.values()) {
      if (o === b || o.dead || o.safeUntil > this.time) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < td) {
        td = d;
        target = o;
      }
    }
    s.targetId = target?.id ?? 0;
    if (s.think <= 0) {
      s.think = 1.5 + this.rng();
      if (target) {
        const a = Math.atan2(b.y - target.y, b.x - target.x) + s.strafe * 0.6;
        s.goal = { x: target.x + Math.cos(a) * 14, y: target.y + Math.sin(a) * 14 };
      } else {
        let best: SCrate | null = null;
        let bd = 60;
        for (const c of this.crates.values()) {
          const d = Math.hypot(c.x - b.x, c.y - b.y);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best) s.goal = { x: best.x, y: best.y };
        else if (!s.goal || Math.hypot(s.goal.x - b.x, s.goal.y - b.y) < 3) {
          const C = map.size / 2;
          s.goal = { x: C + (this.rng() - 0.5) * 100, y: C + (this.rng() - 0.5) * 100 };
        }
      }
      // Unstick.
      if (Math.hypot(b.x - s.lastPos.x, b.y - s.lastPos.y) < 0.8 && this.time - s.lastPos.t > 2) {
        const a = this.rng() * Math.PI * 2;
        s.goal = { x: b.x + Math.cos(a) * 15, y: b.y + Math.sin(a) * 15 };
        s.strafe *= -1;
      }
      s.lastPos = { x: b.x, y: b.y, t: this.time };
    }
    if (s.goal) {
      const dx = s.goal.x - b.x, dy = s.goal.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const want = Math.atan2(dy, dx);
        let diff = want - b.rot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        b.rot += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
        const sp = (Math.abs(diff) > 1 ? 0.5 : 4.2) * dt;
        const r = moveCircle(map, b.x, b.y, b.radius * 0.8, Math.cos(b.rot) * sp, Math.sin(b.rot) * sp, 'ground');
        b.x = r.x;
        b.y = r.y;
      }
    }
    // Loot crates it drives over.
    for (const c of this.crates.values()) {
      if (Math.hypot(c.x - b.x, c.y - b.y) < b.radius + 1) {
        this.crates.delete(c.id);
        if (c.kind === 'crate') this.crateRespawn.push({ at: this.time + 60, x: c.x, y: c.y });
      }
    }
    // Shoot.
    let wi = 0;
    b.bp.modules.forEach((m, k) => {
      if (!m.weapon) return;
      const idx = wi++;
      const st = weaponStats(m.weapon);
      s.cds[k] -= dt;
      if (!target) {
        b.aims[idx] = b.rot;
        return;
      }
      const a = Math.atan2(target.y - b.y, target.x - b.x);
      b.aims[idx] = a;
      if (s.cds[k] > 0 || td > st.range + target.radius) return;
      s.cds[k] = 1 / st.rate;
      const d = WEAPONS[m.weapon.key];
      if (!d.arc && !losClear(map, b.x, b.y, target.x, target.y)) return;
      const chance = Math.max(0.35, 0.85 - td / 60);
      const hit = this.rng() < chance;
      const dmg = st.dmg * st.pellets * 0.55;
      this.broadcast({ t: 'shot', from: b.id, kind: d.kind, x: b.x, y: b.y, a, color: d.color, speed: st.speed, range: Math.min(td, st.range), pellets: Math.min(4, st.pellets), hit: hit ? { x: target.x, y: target.y } : undefined });
      if (hit) this.damage(target, dmg, b.name);
    });
  }

  /* ---------------- networking ---------------- */

  private broadcast(msg: S2C, except = -1): void {
    for (const p of this.players.values()) if (p.conn && p.id !== except) p.conn.send(msg);
  }

  broadcastSnapshot(): void {
    const tanks = [...this.players.values()].map((p) => [p.id, round(p.x), round(p.y), round(p.rot), Math.round(p.hp), Math.round(p.shield), p.dead ? 1 : 0, ...p.aims.map(round)]);
    const crates: NetCrate[] = [...this.crates.values()].map((c) => ({ id: c.id, x: round(c.x), y: round(c.y), kind: c.kind }));
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      p.conn.send({ t: 'snap', time: round(this.time), tanks, crates, extracting: round(p.extractT) });
    }
  }

  /* ---------------- test helpers ---------------- */

  debugPlayer(id: number): { hp: number; dead: boolean; x: number; y: number; extractT: number } | null {
    const p = this.players.get(id);
    return p ? { hp: p.hp, dead: p.dead, x: p.x, y: p.y, extractT: p.extractT } : null;
  }

  debugCrates(): SCrate[] {
    return [...this.crates.values()];
  }

  debugPlayers(): { id: number; bot: boolean; dead: boolean }[] {
    return [...this.players.values()].map((p) => ({ id: p.id, bot: !!p.bot, dead: p.dead }));
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function clampNum(v: unknown, a: number, b: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function sanitizeBlueprint(bp: Blueprint): Blueprint {
  const out: Blueprint = { chassis: String(bp?.chassis ?? 'crawler'), drive: bp?.drive ?? 'wheels', modules: [] };
  for (const m of (bp?.modules ?? []).slice(0, 300)) {
    const w = m.weapon && WEAPONS[m.weapon.key] ? { uid: Number(m.weapon.uid) || 0, key: m.weapon.key, rarity: Math.max(0, Math.min(4, Math.round(m.weapon.rarity))) as WeaponItem['rarity'], affixes: (m.weapon.affixes ?? []).slice(0, 4) } : null;
    out.modules.push({ key: String(m.key), cx: Number(m.cx) || 0, cy: Number(m.cy) || 0, weapon: w });
  }
  return out;
}
