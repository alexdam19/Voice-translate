import { CENTER } from '../../shared/constants';
import type { Game } from '../game';
import { updateEnemies, updateEnemyTank, updateTelegraphs } from './ai';
import { updateAllies } from './allies';
import { updateArsenal } from './arsenal';
import { healPlayer, injureRandomCrew } from './damage';
import { updateBuffs, updateCrew, updateZones } from './crewsys';
import { driveTank, manualDrive, separateTanks } from './movement';
import { updateFocus, updateInteract } from './orders';
import { outriderDestroyed, updateOutrider } from './outrider';
import { updateProjectiles } from './projectiles';
import { updateSpawns } from './spawns';
import { updateTankWeapons } from './weapons';
import { respawnNodes, updateHarvest, updateHazards, updateOutposts, updatePickups, updateRunes, updateSites, updateVision } from './world';

export const RESPAWN_TIME = 8;

export function installHandlers(g: Game): void {
  g.onPlayerDestroyed = () => {
    g.stats.deaths++;
    g.respawnIn = RESPAWN_TIME;
    g.resetOrders();
    g.player.speed = 0;
    const scrap = g.player.cargo.count('scrap');
    const lost = Math.floor(scrap * 0.25);
    if (lost > 0) {
      g.player.cargo.take('scrap', lost);
      g.dropStacks(g.player.x, g.player.y, [{ id: 'scrap', n: lost }]);
    }
    injureRandomCrew(g, 30, 'was wounded when the fortress went down');
    g.hooks.died();
  };
  g.onOutriderDestroyed = () => outriderDestroyed(g);
}

function respawn(g: Game): void {
  const p = g.player;
  p.dead = false;
  p.x = g.gen.spawn.x;
  p.y = g.gen.spawn.y;
  p.rot = -Math.PI / 2;
  p.hp = p.stats.maxHp * 0.5;
  p.shield = 0;
  p.buffs.clear();
  for (const m of p.modules) m.aim = p.rot;
  if (g.outrider && !g.outrider.dead) {
    const b = p.toWorld(-p.stats.length / 2 - 3, 0);
    g.outrider.x = b.x;
    g.outrider.y = b.y;
    g.outriderOrder = { mode: 'follow' };
  }
  g.hooks.toast('Your fortress was towed back to camp.', '#ffd740');
}

/** One fixed simulation step of the open world. */
export function stepWorld(g: Game, dt: number): void {
  g.newWorldTimeUpdate(dt);
  const p = g.player;
  updateCrew(g, dt);
  updateBuffs(g, dt);
  if (p.dead) {
    g.respawnIn -= dt;
    if (g.respawnIn <= 0 && g.mode === 'world') respawn(g);
  } else {
    const di = g.driveInput;
    if (di.active) {
      // WASD overrides right-click paths.
      p.path = [];
      p.goal = null;
      g.interact = null;
    } else {
      updateFocus(g, dt);
      updateInteract(g);
    }
    const nitro = p.buff('nitro');
    const chill = p.buff('chill');
    const mult = (1 + (nitro?.v ?? 0)) * (1 - (chill?.v ?? 0));
    driveTank(g, p, dt, mult, di.active ? manualDrive(p, di.x, di.y, g.tankControls) : undefined);
    if (nitro && Math.random() < dt * 20) {
      const b = p.toWorld(-p.stats.length / 2, (Math.random() - 0.5) * p.stats.width);
      g.fx.push({ t: 'dust', x: b.x, y: b.y, color: '#18ffff' });
    }
    healPlayer(g, p.stats.repair * dt, false);
    p.shieldDelay -= dt;
    if (p.shieldDelay <= 0 && p.shield < p.stats.shield) p.shield = Math.min(p.stats.shield, p.shield + p.stats.shieldRegen * dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    if (p.speed > 1 && Math.random() < dt * p.speed * 0.8) {
      const b = p.toWorld(-p.stats.length / 2, (Math.random() < 0.5 ? -1 : 1) * p.stats.width * 0.45);
      g.fx.push({ t: 'dust', x: b.x, y: b.y, color: '#a1887f' });
    }
  }
  updateOutrider(g, dt);
  for (const t of g.tanks) if (t.kind !== 'remote') updateEnemyTank(g, t, dt);
  separateTanks(g);
  updateEnemies(g, dt);
  updateTelegraphs(g, dt);
  updateAllies(g, dt);
  if (!p.dead) updateTankWeapons(g, p, dt);
  if (g.outrider && !g.outrider.dead) updateTankWeapons(g, g.outrider, dt);
  for (const t of g.tanks) if (!t.dead && t.kind !== 'remote') updateTankWeapons(g, t, dt);
  updateProjectiles(g, dt);
  updateZones(g, dt);
  updateArsenal(g, dt);
  if (g.mode === 'world') {
    if (!p.dead) {
      updateHarvest(g, dt);
      updateSites(g, dt);
      updateRunes(g, dt);
      updateHazards(g, dt);
    }
    updateOutposts(g);
    updatePickups(g, dt);
    updateSpawns(g, dt);
    g.timers.vision -= dt;
    if (g.timers.vision <= 0) {
      g.timers.vision = 0.2;
      updateVision(g);
      respawnNodes(g);
    }
  }
  for (let i = g.floats.length - 1; i >= 0; i--) {
    const f = g.floats[i];
    f.t += dt;
    f.z += dt * 1.6;
    if (f.t > 1.1) g.floats.splice(i, 1);
  }
  g.tanks = g.tanks.filter((t) => !t.dead || t.kind === 'raider' || t.kind === 'remote');
  void CENTER;
}
