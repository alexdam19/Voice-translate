import type { Cost } from '../../shared/inventory';
import { NODE_INFO } from '../../shared/mapgen';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { buildOutrider } from '../templates';
import { driveTank, planPath } from './movement';
import { SITE_RADIUS, spawnFor } from './world';

export const OUTRIDER_COST: Cost = { iron_plate: 30, titanium_alloy: 4, circuit: 4 };
export const OUTRIDER_UPGRADE: Cost[] = [
  { iron_plate: 20, circuit: 6, titanium_alloy: 6 },
  { titanium_alloy: 14, uranium_rod: 2, circuit: 10 },
];

const ai = { repath: 0, harvestT: 0, siteT: 0, wave: 0 };

/** Creates (or rebuilds) the Outrider next to the fortress. */
export function launchOutrider(g: Game): Tank {
  const t = buildOutrider(Math.max(1, g.outriderLevel));
  const p = g.player;
  const back = p.toWorld(-p.stats.length / 2 - 3, 0);
  t.x = back.x;
  t.y = back.y;
  t.rot = p.rot;
  g.outrider = t;
  g.outriderOrder = { mode: 'follow' };
  applyOutriderCrew(g);
  t.hp = t.stats.maxHp;
  return t;
}

/** Side crew aboard make the Outrider tougher, faster and better at gathering. */
export function applyOutriderCrew(g: Game): void {
  const t = g.outrider;
  if (!t) return;
  const crew = g.outriderCrew();
  const b = t.crew;
  b.dmg = 0;
  b.hp = 0;
  b.speed = 0;
  b.harvest = 0;
  b.regen = 0;
  for (const c of crew) {
    const q = c.level * (1 + 0.15 * c.rarity);
    b.hp += 0.1 + 0.02 * q;
    if (c.role === 'gunner') b.dmg += 0.08 * q;
    if (c.role === 'driver') b.speed += 0.05 * q;
    if (c.role === 'scavenger' || c.role === 'quartermaster') b.harvest += 0.15 * q;
    if (c.role === 'mechanic') b.regen += 0.6 * q;
  }
  b.speed = Math.min(0.5, b.speed);
  t.hull.hp = 1 + (g.outriderLevel - 1) * 0.5;
  t.recalc();
}

export function outriderCargoCap(g: Game): number {
  return 8 + g.outriderLevel * 4;
}

export function sendOutrider(g: Game, kind: 'node' | 'site', id: number): boolean {
  const t = g.outrider;
  if (!t || t.dead) return false;
  if (!g.outriderCrew().length) {
    g.hooks.toast('The Outrider has no crew. Assign side crew in CREW > Outrider.', '#ff8a80');
    return false;
  }
  if (kind === 'node') {
    const n = g.gen.nodes.find((k) => k.id === id);
    if (!n || n.respawnAt > 0) return false;
    if (NODE_INFO[n.type].tier > 1 + Math.floor(g.outriderLevel / 2)) {
      g.hooks.toast(`The Outrider's drill can't cut ${NODE_INFO[n.type].name}. Upgrade it at the Garage.`, '#ff8a80');
      return false;
    }
    if (!planPath(g, t, n.x, n.y)) return false;
  } else {
    const s = g.gen.sites.find((k) => k.id === id);
    if (!s || s.readyAt > g.time) {
      g.hooks.toast('That loot area was scavenged recently.', '#ff8a80');
      return false;
    }
    if (!planPath(g, t, s.x, s.y)) return false;
  }
  g.outriderOrder = { mode: 'expedition', kind, id, phase: 'going', t: 0 };
  ai.siteT = 0;
  ai.wave = 0;
  g.hooks.toast(`Outrider sent out. Its crew may not come back...`, '#ffd740');
  return true;
}

export function updateOutrider(g: Game, dt: number): void {
  const t = g.outrider;
  if (g.outriderLevel > 0 && !t && g.outriderRebuild > 0) g.outriderRebuild = Math.max(0, g.outriderRebuild - dt);
  if (!t || t.dead) return;
  t.hitFlash = Math.max(0, t.hitFlash - dt);
  if (t.stats.repair > 0 || t.crew.regen > 0) t.hp = Math.min(t.stats.maxHp, t.hp + (t.crew.regen + 1) * dt);
  const p = g.player;
  const o = g.outriderOrder;
  ai.repath -= dt;
  if (o.mode === 'follow') {
    const spot = p.toWorld(-p.stats.length / 2 - t.stats.length / 2 - 2.5, p.stats.width * 0.4);
    const d = Math.hypot(spot.x - t.x, spot.y - t.y);
    if (d > 4 && ai.repath <= 0) {
      ai.repath = 0.8;
      planPath(g, t, spot.x, spot.y);
    } else if (d < 2.5) {
      t.path = [];
    }
    depositCargo(g, t);
  } else if (o.mode === 'hold') {
    if (ai.repath <= 0 && Math.hypot(o.x - t.x, o.y - t.y) > 3) {
      ai.repath = 2;
      planPath(g, t, o.x, o.y);
    }
  } else {
    o.t += dt;
    if (o.phase === 'going') {
      const target = o.kind === 'node' ? g.gen.nodes.find((k) => k.id === o.id) : g.gen.sites.find((k) => k.id === o.id);
      if (!target) {
        o.phase = 'returning';
      } else {
        const d = Math.hypot(target.x - t.x, target.y - t.y);
        if ((o.kind === 'node' && t.edgeDist(target.x, target.y) < 2.2) || (o.kind === 'site' && d < SITE_RADIUS - 1)) {
          o.phase = 'working';
          t.path = [];
          t.goal = null;
        } else if (!t.path.length && ai.repath <= 0) {
          ai.repath = 2;
          if (!planPath(g, t, target.x, target.y)) o.phase = 'returning';
        }
      }
    } else if (o.phase === 'working') {
      if (o.kind === 'node') {
        const n = g.gen.nodes.find((k) => k.id === o.id);
        const cap = outriderCargoCap(g);
        const load = t.cargo.stacks().reduce((s, k) => s + k.n, 0);
        if (!n || n.respawnAt > 0 || load >= cap * 10) o.phase = 'returning';
        else {
          ai.harvestT += dt * (0.8 + t.crew.harvest);
          if (Math.random() < dt * 6) g.fx.push({ t: 'spark', x: n.x, y: n.y, color: NODE_INFO[n.type].color, n: 1 });
          if (ai.harvestT >= 0.8) {
            ai.harvestT = 0;
            const info = NODE_INFO[n.type];
            const amt = Math.min(n.amount, 2);
            n.amount -= amt;
            t.cargo.add(info.item, amt);
            if (n.amount <= 0) {
              n.respawnAt = g.time + 360;
              o.phase = 'returning';
            }
          }
        }
      } else {
        const s = g.gen.sites.find((k) => k.id === o.id);
        if (!s || s.readyAt > g.time) o.phase = 'returning';
        else {
          ai.siteT += dt;
          const waves = [1, 6, 11];
          if (ai.wave < waves.length && ai.siteT >= waves[ai.wave]) {
            ai.wave++;
            const n = 2 + Math.floor(s.threat * 0.8);
            for (let i = 0; i < n; i++) {
              const a = Math.random() * Math.PI * 2;
              spawnFor(g, s.x + Math.cos(a) * 17, s.y + Math.sin(a) * 17, s.threat, s.zone, true);
            }
          }
          if (ai.siteT >= 14) {
            s.readyAt = g.time + 420;
            g.dropLoot(t.x, t.y, `site_${s.kind}`, 3 + Math.floor(s.threat / 2));
            if (Math.random() < 0.3) g.dropPickup(t.x, t.y, { kind: 'chest', chest: 'choice', chestThreat: s.threat });
            // Hoover up the drops into the Outrider hold.
            for (const k of g.pickups) {
              if (Math.hypot(k.x - t.x, k.y - t.y) > 8) continue;
              if (k.kind === 'stack' && k.stack) {
                t.cargo.add(k.stack.id, k.stack.n);
                k.life = 0;
              }
            }
            g.hooks.toast(`Outrider scavenged ${s.name}. Heading home.`, '#76ff03');
            o.phase = 'returning';
          }
        }
      }
    }
    if (o.phase === 'returning') {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < p.stats.length / 2 + 6) {
        depositCargo(g, t);
        g.outriderOrder = { mode: 'follow' };
        g.hooks.toast('Outrider is back and unloaded its hold.', '#76ff03');
        for (const c of g.outriderCrew()) {
          c.xp += 15;
        }
      } else if (ai.repath <= 0) {
        ai.repath = 1.5;
        planPath(g, t, p.x, p.y);
      }
    }
  }
  driveTank(g, t, dt, 1);
}

function depositCargo(g: Game, t: Tank): void {
  if (t.cargo.isEmpty()) return;
  if (Math.hypot(g.player.x - t.x, g.player.y - t.y) > g.player.stats.length / 2 + 8) return;
  for (const s of t.cargo.stacks()) {
    const left = g.give(s.id, s.n, true);
    t.cargo.take(s.id, s.n - left);
    if (s.n - left > 0) g.float(g.player.x, g.player.y, `+${s.n - left}`, '#ffe082');
  }
}

/** The Outrider was destroyed: each side crew member aboard may die. */
export function outriderDestroyed(g: Game): void {
  const t = g.outrider;
  if (!t) return;
  const crew = g.outriderCrew();
  const medics = crew.filter((c) => c.role === 'medic').length;
  const survive = Math.min(0.75, 0.35 + medics * 0.15);
  const dead: string[] = [];
  for (const c of crew) {
    if (Math.random() < survive) {
      c.loc = 'away';
      c.returnIn = 60 + Math.hypot(t.x - g.player.x, t.y - g.player.y) * 0.8;
      c.injured = 40;
    } else dead.push(c.name);
  }
  g.crew = g.crew.filter((c) => !dead.includes(c.name) || c.loc !== 'outrider');
  g.dropStacks(t.x, t.y, t.cargo.stacks());
  g.outrider = null;
  g.outriderRebuild = 45;
  g.outriderOrder = { mode: 'follow' };
  g.hooks.toast(dead.length ? `The Outrider was destroyed. Lost: ${dead.join(', ')}.` : 'The Outrider was destroyed, but its crew escaped on foot.', '#ff5252');
  g.hooks.sound('alarm');
}
