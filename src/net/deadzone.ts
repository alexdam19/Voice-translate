import type { App } from '../app';
import { generateArena } from '../shared/arena';
import { getItem } from '../shared/items';
import type { Slot } from '../shared/inventory';
import { WarzoneServer } from '../shared/dzServer';
import { NET_TICK_MS, type Blueprint, type C2S, type RosterEntry, type S2C } from '../shared/protocol';
import { RARITIES } from '../shared/rarity';
import { WEAPONS, type WeaponItem } from '../shared/weapons';
import { eid, type Projectile } from '../game/entities';
import { Game } from '../game/game';
import { serialize, SAVE_KEY, saveGame } from '../game/save';
import { installHandlers, stepWorld } from '../game/systems/step';
import { Tank } from '../game/tank';
import { button, esc, h } from '../ui/dom';

interface Transport {
  send(m: C2S): void;
  close(): void;
}

const REMOTE = 1_000_000;
const CRATE = 2_000_000;

/** Dead Zone client: runs the raid as its own Game and syncs it with the server. */
export class DeadZoneClient {
  private world: Game;
  raid: Game | null = null;
  private tr: Transport | null = null;
  private myId = 0;
  private remotes = new Map<number, Tank>();
  private targets = new Map<number, { x: number; y: number; rot: number }>();
  private roster = new Map<number, RosterEntry>();
  private sendT = 0;
  private lootT = new Map<number, number>();
  private healAcc = { hp: 0, shield: 0 };
  private shotBudget = 0;
  private extractOn = false;
  private ended = false;
  offline = false;
  private local: { server: WarzoneServer; timer: number } | null = null;
  private lastCargoKey = '';
  private status: HTMLDivElement | null = null;

  constructor(private app: App) {
    this.world = app.game;
  }

  /* ---------------------------------------------------------------- */

  private blueprint(t: Tank): Blueprint {
    return { chassis: t.chassis, drive: t.drive, modules: t.modules.map((m) => ({ key: m.key, cx: m.cx, cy: m.cy, weapon: m.weapon })) };
  }

  /** Saves a copy of the world with everything at risk removed, so quitting mid-raid can't duplicate loot. */
  private saveAtRisk(): void {
    try {
      const d = serialize(this.world);
      const vault = this.world.player.stats.vault;
      d.tank.cargo = d.tank.cargo.map((s, i) => (i < vault ? s : null));
      d.armory = [];
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }

  async start(): Promise<void> {
    this.app.hud.toast('Connecting to the Dead Zone...', '#ff8a80');
    this.saveAtRisk();
    const onMsg = (m: S2C): void => this.onMessage(m);
    this.tr = await this.connectWs(onMsg);
    if (!this.tr) {
      this.offline = true;
      this.tr = this.connectLocal(onMsg);
      this.app.hud.toast('No Dead Zone server found: playing an offline raid against bots.', '#ffd740');
    }
    const p = this.world.player;
    this.tr.send({
      t: 'hello', name: 'Commander', bp: this.blueprint(p), maxHp: p.stats.maxHp, armor: p.stats.armor, shield: p.stats.shield, vault: p.stats.vault,
      cargo: p.cargo.snapshot(), spare: this.world.armory,
    });
  }

  private connectWs(onMsg: (m: S2C) => void): Promise<Transport | null> {
    return new Promise((resolve) => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return resolve(null);
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      } catch {
        return resolve(null);
      }
      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 2500);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve({ send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), close: () => ws.close() });
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      ws.onmessage = (e) => {
        try {
          onMsg(JSON.parse(String(e.data)) as S2C);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (this.raid && !this.ended) this.app.hud.toast('Lost connection to the Dead Zone.', '#ff5252');
      };
    });
  }

  private connectLocal(onMsg: (m: S2C) => void): Transport {
    const server = new WarzoneServer(Math.floor(Math.random() * 1e9), 5);
    const session = server.connect({ send: (m) => queueMicrotask(() => onMsg(JSON.parse(JSON.stringify(m)) as S2C)), close: () => {} });
    const timer = window.setInterval(() => {
      server.tick(NET_TICK_MS / 1000);
      server.broadcastSnapshot();
    }, NET_TICK_MS);
    this.local = { server, timer };
    return { send: (m) => session.message(JSON.parse(JSON.stringify(m)) as C2S), close: () => session.close() };
  }

  /* ---------------------------------------------------------------- */

  private onMessage(m: S2C): void {
    if (this.ended && m.t !== 'died') return;
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        this.begin(m.seed, m.spawn);
        for (const r of m.roster) if (r.id !== m.id) this.addRemote(r);
        break;
      case 'roster':
        if (m.add && m.add.id !== this.myId) this.addRemote(m.add);
        if (m.remove !== undefined) this.removeRemote(m.remove);
        break;
      case 'snap':
        this.applySnap(m);
        break;
      case 'shot':
        this.remoteShot(m);
        break;
      case 'loot':
        this.gotLoot(m.stacks, m.weapons);
        break;
      case 'died':
        this.died(m.by, m.dropped);
        break;
      case 'extracted':
        this.extracted();
        break;
      case 'event':
        this.app.hud.toast(m.text, m.color);
        break;
    }
  }

  private begin(seed: number, spawn: { x: number; y: number }): void {
    const arena = generateArena(seed);
    const w = this.world;
    const raid = new Game(seed, arena.gen);
    raid.mode = 'raid';
    raid.revealAll = true;
    raid.player = Tank.deserialize(w.player.serialize(), 'player', 'main', 'Fortress');
    raid.player.x = spawn.x;
    raid.player.y = spawn.y;
    raid.crew = w.crew;
    raid.tech = w.tech;
    raid.armory = [...w.armory];
    raid.autoFire = w.autoFire;
    raid.runeBuff = w.runeBuff;
    raid.extracts = arena.extracts;
    raid.applyCrew();
    raid.player.hp = raid.player.stats.maxHp;
    raid.player.shield = raid.player.stats.shield;
    installHandlers(raid);
    raid.hooks = { ...w.hooks, died: () => {}, enterDeadZone: () => {}, chest: () => {} };
    raid.onPlayerDestroyed = () => {
      raid.player.dead = false; // the server decides
      raid.player.hp = 1;
    };
    raid.onRemoteHit = (t, dmg, o) => {
      this.tr?.send({ t: 'hit', target: t.id - REMOTE, dmg, key: o.wkey ?? '', rarity: o.wr ?? 0 });
    };
    raid.onHeal = (hp, shield) => {
      this.healAcc.hp += hp;
      this.healAcc.shield += shield;
    };
    raid.onFire = (kind, x, y, a, color, speed, range, pellets) => {
      if (this.shotBudget <= 0) return;
      this.shotBudget--;
      this.tr?.send({ t: 'shot', kind, x, y, a, color, speed, range, pellets });
    };
    this.raid = raid;
    this.app.game = raid;
    this.app.view.setWorld(raid);
    this.app.centerOnPlayer();
    this.app.camLocked = true;
    this.showStatus();
    this.app.hud.toast(`Welcome to the Dead Zone${this.offline ? ' (offline)' : ''}. Loot crates, survive, and extract at a green beacon.`, '#ff8a80');
  }

  private addRemote(r: RosterEntry): void {
    if (this.remotes.has(r.id) || !this.raid) {
      this.roster.set(r.id, r);
      if (!this.raid) return;
      if (this.remotes.has(r.id)) return;
    }
    this.roster.set(r.id, r);
    const t = new Tank('enemy', 'remote', r.bp.chassis, r.bot ? r.name : r.name);
    t.id = REMOTE + r.id;
    t.drive = r.bp.drive;
    for (const m of r.bp.modules) {
      try {
        t.addModule(m.key, m.cx, m.cy, m.weapon && WEAPONS[m.weapon.key] ? m.weapon : null);
      } catch {
        /* skip bad module */
      }
    }
    t.recalc();
    t.stats.maxHp = r.maxHp;
    t.hp = r.maxHp;
    t.threat = 4;
    this.remotes.set(r.id, t);
    this.raid.tanks.push(t);
  }

  private removeRemote(id: number): void {
    const t = this.remotes.get(id);
    this.remotes.delete(id);
    this.targets.delete(id);
    this.roster.delete(id);
    if (t && this.raid) this.raid.tanks = this.raid.tanks.filter((k) => k !== t);
  }

  private applySnap(m: Extract<S2C, { t: 'snap' }>): void {
    const raid = this.raid;
    if (!raid) return;
    // Late roster entries (welcome arrives before begin() builds the raid).
    for (const [id, r] of this.roster) if (!this.remotes.has(id) && id !== this.myId) this.addRemote(r);
    for (const row of m.tanks) {
      const [id, x, y, rot, hp, sh, dead, ...aims] = row;
      if (id === this.myId) {
        raid.player.hp = Math.min(raid.player.stats.maxHp, hp);
        raid.player.shield = sh;
        continue;
      }
      const t = this.remotes.get(id);
      if (!t) continue;
      if (!this.targets.has(id)) {
        t.x = x;
        t.y = y;
        t.rot = rot;
      }
      this.targets.set(id, { x, y, rot });
      if (hp < t.hp) t.hitFlash = 0.1;
      t.hp = hp;
      t.shield = sh;
      t.dead = dead === 1;
      let k = 0;
      for (const mod of t.modules) if (mod.weapon) mod.aim = aims[k++] ?? t.rot;
    }
    // Crates as chest pickups.
    const want = new Set(m.crates.map((c) => CRATE + c.id));
    raid.pickups = raid.pickups.filter((p) => p.id < CRATE || want.has(p.id));
    for (const c of m.crates) {
      if (raid.pickups.some((p) => p.id === CRATE + c.id)) continue;
      raid.pickups.push({ id: CRATE + c.id, x: c.x, y: c.y, kind: 'chest', chest: c.kind === 'supply' ? 'titan' : c.kind === 'wreck' ? 'rune' : 'supply', life: 1e9, delay: 0, vx: 0, vy: 0, z: 0, vz: 0 });
    }
    raid.extractProgress = m.extracting;
  }

  private remoteShot(m: Extract<S2C, { t: 'shot' }>): void {
    const raid = this.raid;
    if (!raid) return;
    const hitscan = m.speed === 0 || m.kind === 'laser' || m.kind === 'rail' || m.kind === 'beam' || m.kind === 'tesla';
    const x1 = m.hit ? m.hit.x : m.x + Math.cos(m.a) * m.range, y1 = m.hit ? m.hit.y : m.y + Math.sin(m.a) * m.range;
    raid.fx.push({ t: 'muzzle', x: m.x, y: m.y, a: m.a, color: m.color, size: 1 });
    if (hitscan) {
      if (m.kind === 'tesla') raid.fx.push({ t: 'bolt', pts: [{ x: m.x, y: m.y }, { x: x1, y: y1 }], color: m.color });
      else raid.fx.push({ t: 'beam', x0: m.x, y0: m.y, x1, y1, color: m.color, w: m.kind === 'rail' ? 0.35 : 0.14, life: 0.15 });
      if (m.hit) raid.fx.push({ t: 'spark', x: x1, y: y1, color: m.color, n: 4 });
      return;
    }
    for (let i = 0; i < Math.min(4, m.pellets); i++) {
      const a = m.a + (Math.random() - 0.5) * 0.2 * (m.pellets > 1 ? 1 : 0.2);
      const sp = Math.max(10, m.speed);
      const p: Projectile = {
        id: eid(), x: m.x, y: m.y, z: 1.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, team: 'enemy', kind: m.kind as Projectile['kind'], dmg: 0, splash: 0,
        pierce: 0, life: 0, maxLife: Math.max(0.1, m.range / sp), color: m.color, homing: 0, targetId: 0, arc: m.kind === 'mortar', tx: x1, ty: y1, burn: 0, crit: false,
        lifesteal: 0, srcTank: 0, hit: [], flyer: 0, interceptable: false, hp: 1, size: 0.2, visual: true,
      };
      if (p.arc) {
        const flight = Math.max(0.5, m.range / sp);
        p.maxLife = flight;
        p.vx = (x1 - m.x) / flight;
        p.vy = (y1 - m.y) / flight;
        p.vz = (9.8 * flight) / 2;
      }
      raid.projectiles.push(p);
    }
    this.app.sound(m.kind === 'shell' ? 'cannon' : m.kind === 'missile' ? 'rocket' : 'enemyshot', m.x, m.y, 0.6);
  }

  private gotLoot(stacks: { id: string; n: number }[], weapons: WeaponItem[]): void {
    const raid = this.raid;
    if (!raid) return;
    const parts: string[] = [];
    for (const s of stacks) {
      const left = raid.player.cargo.add(s.id, s.n);
      if (s.n - left > 0) parts.push(`${s.n - left} ${getItem(s.id).name}`);
      if (left > 0) this.app.hud.toast(`No room for ${left} ${getItem(s.id).name}!`, '#ff8a80');
    }
    for (const w of weapons) {
      raid.armory.push(w);
      parts.push(`${RARITIES[w.rarity].name} ${WEAPONS[w.key].name}`);
    }
    this.app.hud.toast(`Looted: ${parts.join(', ') || 'nothing'}`, '#ffd740');
    this.app.sound(weapons.some((w) => w.rarity >= 3) ? 'legendary' : 'chest');
    this.sendCargo(true);
  }

  private sendCargo(force = false): void {
    const raid = this.raid;
    if (!raid) return;
    const cargo: Slot[] = raid.player.cargo.snapshot();
    const key = JSON.stringify(cargo) + raid.armory.length;
    if (!force && key === this.lastCargoKey) return;
    this.lastCargoKey = key;
    this.tr?.send({ t: 'cargo', cargo, spare: raid.armory, mounted: raid.player.weapons().map((m) => m.weapon!) });
  }

  /* ---------------------------------------------------------------- */

  step(dt: number): void {
    const raid = this.raid;
    if (!raid) return;
    stepWorld(raid, dt);
    // Smooth remote tanks toward their last known state.
    for (const [id, t] of this.remotes) {
      const tg = this.targets.get(id);
      if (!tg) continue;
      const k = Math.min(1, dt * 10);
      const dx = tg.x - t.x, dy = tg.y - t.y;
      t.x += dx * k;
      t.y += dy * k;
      t.speed = Math.hypot(dx, dy) * 10;
      let dr = tg.rot - t.rot;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      t.rot += dr * k;
      t.treadPhase += t.speed * dt * 0.3;
      t.hitFlash = Math.max(0, t.hitFlash - dt);
    }
    if (this.ended) return;
    const p = raid.player;
    // Crates: drive over them.
    for (const k of raid.pickups) {
      if (k.id < CRATE) continue;
      if (p.edgeDist(k.x, k.y) < 2.5 && (this.lootT.get(k.id) ?? 0) < raid.time) {
        this.lootT.set(k.id, raid.time + 1);
        this.tr?.send({ t: 'loot', crate: k.id - CRATE });
      }
    }
    // Extraction
    const inZone = raid.extracts.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < e.r);
    if (inZone !== this.extractOn) {
      this.extractOn = inZone;
      this.tr?.send({ t: 'extract', on: inZone });
      if (inZone) this.app.hud.toast('Extracting... hold position!', '#76ff03');
    }
    if (!inZone) raid.extractProgress = 0;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 15;
      this.shotBudget = Math.min(6, this.shotBudget + 2);
      this.tr?.send({ t: 'state', x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, rot: Math.round(p.rot * 100) / 100, aims: p.weapons().map((m) => Math.round(m.aim * 100) / 100) });
      if (this.healAcc.hp > 0 || this.healAcc.shield > 0) {
        this.tr?.send({ t: 'heal', hp: this.healAcc.hp, shield: this.healAcc.shield });
        this.healAcc = { hp: 0, shield: 0 };
      }
      this.sendCargo();
    }
    this.updateStatus();
  }

  /* ---------------------------------------------------------------- */

  private showStatus(): void {
    this.status?.remove();
    this.status = h('div', 'dz-status');
    document.getElementById('ui')!.appendChild(this.status);
  }

  private updateStatus(): void {
    const raid = this.raid;
    if (!this.status || !raid) return;
    const players = [...this.roster.values()].filter((r) => !r.bot).length + 1;
    const bots = [...this.roster.values()].filter((r) => r.bot).length;
    const loot = raid.player.cargo.stacks().length;
    const txt = `<b>DEAD ZONE</b>${this.offline ? ' <small>(offline)</small>' : ''}<br>${players} commander${players === 1 ? '' : 's'} · ${bots} raiders<br><span class="d">At risk: ${loot} cargo stacks, ${raid.armory.length} spare weapons</span>${raid.extractProgress > 0 ? `<br><span class="good">EXTRACTING ${Math.round((raid.extractProgress / 6) * 100)}%</span>` : '<br><span class="d">Extract at a green beacon</span>'}`;
    if (this.status.innerHTML !== txt) this.status.innerHTML = txt;
  }

  private finish(apply: (w: Game, raid: Game) => void): void {
    const raid = this.raid;
    this.ended = true;
    this.tr?.send({ t: 'leave' });
    this.tr?.close();
    if (this.local) clearInterval(this.local.timer);
    this.status?.remove();
    const w = this.world;
    if (raid) apply(w, raid);
    // Park at the gate.
    w.player.x = w.gen.gate.x;
    w.player.y = w.gen.gate.y + 12;
    w.player.rot = Math.PI / 2;
    w.player.dead = false;
    w.player.path = [];
    for (const m of w.player.modules) m.aim = w.player.rot;
    w.applyCrew();
    this.app.game = w;
    this.app.endRaid();
    this.app.centerOnPlayer();
    saveGame(w);
  }

  private extracted(): void {
    this.app.sound('legendary');
    this.finish((w, raid) => {
      const hpFrac = raid.player.hp / raid.player.stats.maxHp;
      w.player = Tank.deserialize(raid.player.serialize(), 'player', 'main', 'Fortress');
      w.armory = raid.armory;
      w.applyCrew();
      w.player.hp = Math.max(1, w.player.stats.maxHp * hpFrac);
    });
    this.app.panels.notice('EXTRACTED!', 'You made it out of the Dead Zone with everything you found.', 'Back to the wasteland');
  }

  private died(by: string, dropped: { stacks: { id: string; n: number }[]; weapons: WeaponItem[] }): void {
    if (this.ended) return;
    const raid = this.raid;
    if (raid) raid.player.dead = true;
    this.app.sound('bigboom');
    const lost = [...dropped.stacks.map((s) => `${s.n} ${getItem(s.id).name}`), ...dropped.weapons.map((w) => `${RARITIES[w.rarity].name} ${WEAPONS[w.key].name}`)];
    this.finish((w, r) => {
      const vault = r.player.stats.vault;
      const keep = r.player.cargo.snapshot().map((s, i) => (i < vault ? s : null));
      w.player = Tank.deserialize(r.player.serialize(), 'player', 'main', 'Fortress');
      w.player.cargo.clear();
      keep.forEach((s, i) => {
        if (s) w.player.cargo.slots[i] = s;
      });
      const lostUids = new Set(dropped.weapons.map((k) => k.uid));
      for (const m of w.player.modules) if (m.weapon && lostUids.has(m.weapon.uid)) m.weapon = null;
      w.player.version++;
      w.armory = [];
      w.applyCrew();
      w.player.hp = w.player.stats.maxHp * 0.3;
    });
    const box = h('div', 'dz-dead');
    box.innerHTML = `<h2>DESTROYED</h2><p>${esc(by)} got you. Other players can now loot your wreck:</p><div class="lost">${lost.map((l) => `<span>${esc(l)}</span>`).join('') || '<span>nothing (your vault held)</span>'}</div>`;
    box.appendChild(button('Return to the wasteland', () => box.remove(), 'primary'));
    document.getElementById('ui')!.appendChild(box);
  }
}
