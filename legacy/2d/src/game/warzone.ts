import { getItem } from '../shared/items';
import type { C2S, S2C } from '../shared/protocol';
import { generateWarzone } from '../shared/warzoneGen';
import { Minimap } from '../render/minimap';
import { Sim, type RemotePlayer } from './entities';
import type { Game } from './game';

/**
 * Client side of the Dead Zone. The server owns health, deaths and loot
 * crates; clients own their own movement and report hits they land.
 */
export class WarzoneClient {
  private ws: WebSocket;
  id = -1;
  status: 'connecting' | 'in' | 'closed' = 'connecting';
  extractT = 0;
  private extractSent = false;
  private sendT = 0;
  private invT = 0;
  private lastInv = '';
  private ended = false;
  players = 0;

  constructor(
    private g: Game,
    url: string,
  ) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      const p = g.player;
      this.send({ t: 'join', name: g.settings.name.slice(0, 16) || 'Drifter', inv: p.inv.snapshot(), suit: p.suit, hp: p.hp, maxHp: p.maxHp, armor: p.armor });
    };
    this.ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as S2C);
      } catch (e) {
        console.error('bad message', e);
      }
    };
    this.ws.onerror = () => {
      if (this.status === 'connecting') g.toast(`Could not reach the Dead Zone server at ${url}. Is it running? (npm run dev)`, '#ff5252');
    };
    this.ws.onclose = () => {
      const wasIn = this.status === 'in';
      this.status = 'closed';
      if (!this.ended) {
        if (wasIn) {
          // The server drops your pack when you vanish mid-raid; mirror that locally.
          this.g.player.inv.clear();
          this.finish('Connection lost. Your pack stayed behind in the Dead Zone.', '#ff5252');
        } else {
          // Never got in: nothing was at risk, so restore the normal save.
          this.g.warzone = null;
          this.g.save();
        }
      }
    };
  }

  private send(m: C2S): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private onMessage(m: S2C): void {
    const g = this.g;
    const p = g.player;
    switch (m.t) {
      case 'welcome': {
        this.id = m.id;
        this.status = 'in';
        const map = generateWarzone(m.seed);
        for (const [i, t] of m.edits) map.world.tiles[i] = t;
        map.world.finalize();
        const sim = new Sim('warzone', map.world);
        sim.extracts = map.extracts;
        for (const c of m.crates) sim.crates.set(c.id, c);
        for (const np of m.players) if (np.id !== this.id) sim.remotes.set(np.id, this.toRemote(np));
        g.returnPos = { x: p.x, y: p.y };
        g.openWorld = g.sim;
        g.sim = sim;
        g.minimap = new Minimap(map.world, true);
        p.driving = null;
        p.mining = null;
        p.x = m.spawn.x - p.w / 2;
        p.y = m.spawn.y - p.h - 2;
        p.vx = p.vy = 0;
        p.hp = m.hp;
        p.maxHp = m.maxHp;
        p.invuln = 0;
        g.setPanel(null);
        g.camera.snap(p.cx, p.cy);
        g.ui.zoneBanner(null);
        g.toast('Inserted into THE DEAD ZONE. Reach an extraction point to keep your loot.', '#ff1744');
        break;
      }
      case 'snap': {
        const seen = new Set<number>();
        for (const np of m.players) {
          if (np.id === this.id) continue;
          seen.add(np.id);
          const r = g.sim.remotes.get(np.id);
          if (r) {
            r.tx = np.x;
            r.ty = np.y;
            r.vx = np.vx;
            r.vy = np.vy;
            r.facing = np.facing;
            r.aim = np.aim;
            r.weapon = np.weapon;
            r.hp = np.hp;
            r.maxHp = np.maxHp;
            r.suit = np.suit;
            r.anim = np.anim;
          } else {
            g.sim.remotes.set(np.id, this.toRemote(np));
          }
        }
        for (const id of [...g.sim.remotes.keys()]) if (!seen.has(id)) g.sim.remotes.delete(id);
        this.players = m.players.filter((x) => !x.bot).length;
        break;
      }
      case 'shot': {
        if (m.id === this.id) break;
        const def = getItem(m.w);
        const w = def.weapon;
        if (!w) break;
        for (let i = 0; i < w.pellets; i++) {
          g.spawnProjectile({
            x: m.x, y: m.y, angle: m.a + (Math.random() - 0.5) * w.spread * 2, speed: w.speed, dmg: 0, team: 'remote', kind: w.kind,
            life: w.life, explosive: w.explosive, gravity: w.gravity, color: w.color, visual: true,
          });
        }
        const d = Math.hypot(m.x - p.cx, m.y - p.cy);
        if (d < 1200) g.audio.play(w.sound, Math.max(0.15, 1 - d / 1200));
        break;
      }
      case 'hp': {
        if (m.id === this.id) {
          if (m.hp < p.hp) {
            p.hurtFlash = 0.25;
            g.audio.play('hurt');
            g.camera.addShake(4);
          }
          p.hp = m.hp;
        } else {
          const r = g.sim.remotes.get(m.id);
          if (r) {
            if (m.hp < r.hp) r.hurtFlash = 0.15;
            r.hp = m.hp;
          }
        }
        break;
      }
      case 'killed':
        g.toast(`${m.killerName} eliminated ${m.victimName}`, '#ff8a80');
        if (m.victim !== this.id) {
          const r = g.sim.remotes.get(m.victim);
          if (r) g.sim.particles.burst(r.x + 7, r.y + 15, 26, { color: '#c62828', speed: 200, life: 0.8, gravity: 500, size: 3 });
        }
        break;
      case 'you_died': {
        this.ended = true;
        p.inv.clear();
        p.hp = 0;
        p.dead = true;
        g.stats.deaths++;
        g.ui.warzoneDeath(m.by, m.lost);
        break;
      }
      case 'crate':
        g.sim.crates.set(m.crate.id, m.crate);
        g.ui.refreshLoot();
        break;
      case 'crate_gone':
        g.sim.crates.delete(m.id);
        g.ui.refreshLoot();
        break;
      case 'took': {
        const left = p.inv.add(m.stack.id, m.stack.n);
        if (left > 0) g.toast('Pack full: some items were lost.', '#ffab40');
        g.ui.pickupNote(m.stack.id, m.stack.n - left);
        g.audio.play('pickup');
        this.pushInv();
        break;
      }
      case 'tile':
        g.sim.world.set(m.x, m.y, m.tile);
        break;
      case 'extracted':
        this.ended = true;
        g.stats.extracts++;
        this.finish('EXTRACTED. Everything you carried out is yours.', '#69f0ae');
        break;
      case 'msg':
        g.toast(m.text, m.color ?? '#e0e0e0');
        break;
      case 'left':
        g.sim.remotes.delete(m.id);
        break;
    }
  }

  private toRemote(np: { id: number; name: string; x: number; y: number; vx: number; vy: number; facing: number; aim: number; weapon: string; hp: number; maxHp: number; suit: string | null; bot: boolean; anim: number }): RemotePlayer {
    return { ...np, tx: np.x, ty: np.y, w: 14, h: 30, hurtFlash: 0 };
  }

  update(dt: number): void {
    const g = this.g;
    if (this.status !== 'in' || g.sim.kind !== 'warzone') return;
    const p = g.player;
    for (const r of g.sim.remotes.values()) {
      const k = Math.min(1, dt * 14);
      r.tx += r.vx * dt;
      r.ty += r.vy * dt;
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      r.hurtFlash -= dt;
    }
    this.sendT -= dt;
    if (this.sendT <= 0 && !p.dead) {
      this.sendT = 0.05;
      const held = p.held();
      this.send({ t: 'state', x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), facing: p.facing, aim: +p.aim.toFixed(3), weapon: held?.id ?? '', anim: +p.anim.toFixed(2) });
    }
    this.invT -= dt;
    if (this.invT <= 0) {
      this.invT = 0.3;
      this.pushInv();
    }
  }

  private pushInv(): void {
    const snap = this.g.player.inv.snapshot();
    const j = JSON.stringify(snap);
    if (j !== this.lastInv) {
      this.lastInv = j;
      this.send({ t: 'inv', inv: snap });
    }
  }

  sendShoot(x: number, y: number, a: number, w: string): void {
    this.send({ t: 'shoot', x: Math.round(x), y: Math.round(y), a: +a.toFixed(3), w });
  }

  reportHit(target: number, dmg: number, w: string): void {
    this.send({ t: 'hit', target, dmg: Math.round(dmg * 10) / 10, w });
  }

  sendTile(x: number, y: number, tile: number): void {
    this.send({ t: 'tile', x, y, tile });
  }

  sendHeal(amount: number): void {
    this.send({ t: 'heal', amount });
  }

  take(crate: number, index: number): void {
    this.send({ t: 'take', crate, index });
  }

  requestExtract(): void {
    if (this.extractSent) return;
    this.extractSent = true;
    this.pushInv();
    this.send({ t: 'extract' });
  }

  /** Leaves the raid by dying on purpose (your pack drops). */
  abandon(): void {
    this.ended = true;
    this.g.player.inv.clear();
    this.ws.close();
    this.finish('You abandoned the raid. Your pack stays in the Dead Zone.', '#ff5252');
  }

  /** Returns to the open world. */
  finish(msg: string, color: string): void {
    const g = this.g;
    this.ended = true;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
    if (g.openWorld) {
      g.sim = g.openWorld;
      g.openWorld = null;
    }
    g.minimap = g.worldMinimap;
    const p = g.player;
    if (g.returnPos) {
      p.x = g.returnPos.x;
      p.y = g.returnPos.y;
    }
    p.dead = false;
    p.maxHp = 100;
    p.hp = Math.max(p.hp, 50);
    p.invuln = 2;
    p.vx = p.vy = 0;
    g.warzone = null;
    g.panel = null;
    g.ui.onPanel(null);
    g.camera.snap(p.cx, p.cy);
    g.toast(msg, color);
    g.save();
  }

  get extractProgress(): number {
    return this.extractT;
  }

  static defaultUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }
}

