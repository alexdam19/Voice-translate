import { updateStory } from '../story';
import { updateCompound } from './compound';
import { updateComms } from './comms';
import { updateNav } from './nav';
import { updateCompactor } from './compactor';
import { updateRobots } from './robots';
import { recordTelemetry } from '../telemetry';
import type { Game } from '../game';
import { updateEnemies, updateEnemyTank, updateTelegraphs } from './ai';
import { updateAllies } from './allies';
import { updateArsenal } from './arsenal';
import { updateBuilds } from './builds';
import { updateCards } from './cards';
import { healPlayer, injureRandomCrew, refillHeal } from './damage';
import { updateBuffs, updateCrew, updateZones } from './crewsys';
import { updateSquads } from './squads';
import { driveTank, manualDrive, separateTanks, updateCollapses, type ManualDrive } from './movement';
import { driveSpec, odStage } from './engine';
import { updateAirlift } from './airlift';
import { updateFocus, updateInteract } from './orders';
import { outriderDestroyed, updateOutrider } from './outrider';
import { updateProjectiles } from './projectiles';
import { updateSpawns } from './spawns';
import { updateTankWeapons } from './weapons';
import { updateAutoDrive } from './drives';
import { updateWaves } from './waves';
import { updateCampaign } from '../campaign';
import { updateStations } from '../stations';
import { updateTesla } from './tesla';
import { updateSoldiers } from './soldiers';
import { updateTroops } from './troops';
import { updateCrewLife } from './crewlife';
import { FUEL_MAX, newTitanState, updateTitan, WATER_MAX } from './titan';
import { updateCamp } from './camp';
import { setDrill, updateFuel } from './fuel';
import { updateHelm, updateHelmGear } from './helm';
import { updateTeams } from './crewops';
import { updateOrders } from './workorders';
import { updateColossi } from './colossus';
import { stormSpeed, updateWeather } from './weather';
import { respawnNodes, updateHarvest, updateHazards, updateOutposts, updatePickups, updateRunes, updateSites, updateVision } from './world';

export const RESPAWN_TIME = 6;

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

/**
 * A Titan's helm: W/S (or the stick) move the throttle lever, which stays where it's left (cruise control); it
 * stops on the 0% detent on the way down, so stopping is one press. A/D steer. A path (right-click) flies on
 * autopilot with the lever at zero. Other hulls and screen-relative controls drive directly.
 */
export function helmDrive(g: Game, dt: number): ManualDrive | undefined {
  const p = g.player;
  const di = g.driveInput;
  const helm = g.helm;
  if (!p.fortress || !g.tankControls) return di.active ? manualDrive(p, di.x, di.y, g.tankControls) : undefined;
  if (p.path.length && !di.active) {
    helm.lever = 0;
    return undefined;
  }
  // The brake handle: holding S with the lever on zero works it on; opening the throttle lets it off.
  // ALL STOP sets it hard and it stays set until the throttle opens again.
  if (helm.lever > 0) {
    helm.brake = 0;
    helm.brakeSet = false;
  } else if (di.active && di.y > 0 && helm.lever === 0 && helm.detent) helm.brake = Math.min(1, helm.brake + dt * 0.8);
  else if (!helm.brakeSet) helm.brake = Math.max(0, helm.brake - dt * 1.5);
  if (di.active && di.y) {
    const was = helm.lever;
    const next = Math.max(-0.5, Math.min(1, was - di.y * dt * 0.8));
    // The detent: coming down (or up) through zero stops there until you let go.
    if (!helm.detent && ((was > 0 && next <= 0) || (was < 0 && next >= 0))) {
      helm.lever = 0;
      helm.detent = true;
    } else if (!helm.detent) helm.lever = next;
  } else helm.detent = false;
  return { throttle: helm.lever, wantRot: p.rot, turn: di.active ? Math.max(-1, Math.min(1, di.x)) : 0, brake: helm.brake };
}

function respawn(g: Game): void {
  const p = g.player;
  p.dead = false;
  // Towed back to your last camp if you made one, else to where you started.
  const home = g.deploy.home ?? g.gen.spawn;
  p.x = home.x;
  p.y = home.y;
  p.rot = g.deploy.home ? -Math.PI / 2 : g.gen.spawnRot ?? -Math.PI / 2;
  p.anchored = false;
  // Every respawn comes back at full health, repaired and fires out (with at least a third of a tank of fuel and water).
  const t = newTitanState();
  t.fuel = Math.max(g.titan.fuel, FUEL_MAX / 3);
  t.water = Math.max(g.titan.water, WATER_MAX / 3);
  g.titan = t;
  g.reserves += g.teams.reduce((a, k) => a + k.reserve, 0);
  g.teams = [];
  g.orders = [];
  p.detached = 0;
  p.titanMods = { power: 1, speed: 1, steering: 1, weapons: 1, sensors: 1, pull: 0 };
  p.recalc();
  p.hp = p.stats.maxHp;
  p.shield = p.stats.shield;
  p.buffs.clear();
  for (const m of p.modules) m.aim = p.rot;
  if (g.outrider && !g.outrider.dead) {
    const b = p.toWorld(-p.stats.length / 2 - 3, 0);
    g.outrider.x = b.x;
    g.outrider.y = b.y;
    g.outriderOrder = { mode: 'follow' };
  }
  g.energy = Math.max(g.energy, g.maxEnergy() * 0.5);
  g.hooks.toast('Your fortress was towed back to camp and fully repaired.', '#ffd740');
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
    const helm = g.helm;
    if (di.active) {
      // WASD overrides right-click paths.
      p.path = [];
      p.goal = null;
      g.interact = null;
    } else {
      helm.detent = false;
      updateFocus(g, dt);
      updateInteract(g);
    }
    const nitro = p.buff('nitro');
    const chill = p.buff('chill');
    const ds = driveSpec(g, p);
    // Eco and crawl modes have no overdrive; nor does an empty tank.
    if (helm.overdrive && (g.titan.fuel <= 0 || !p.titan || ds.odStages <= 0)) helm.overdrive = false;
    // Overdrive heats the engine (each stage much faster); at the red line it trips out and won't relight until it has
    // cooled. Stage III run hot also hurts the drive.
    const od = helm.overdrive ? odStage(ds, helm.odStage) : null;
    if (od) {
      helm.odStage = od.stage;
      helm.heat = Math.min(1, helm.heat + ds.heat * od.heat * dt);
      if (od.stage === 3 && helm.heat > 0.75 && Math.random() < dt * 0.6) g.titan.systems.propulsion = Math.max(0, g.titan.systems.propulsion - 0.004);
      if (helm.heat >= 1) {
        helm.overdrive = false;
        helm.overheat = true;
        g.hooks.toast(`ENGINE OVERHEAT: overdrive ${['I', 'II', 'III'][od.stage - 1]} tripped. Let it cool (Radiators, Intercooler and Governor in the Engine Workshop help).`, '#ff5252');
        g.hooks.sound('alarm');
      }
    } else {
      helm.heat = Math.max(0, helm.heat - ds.cool * dt);
      if (helm.overheat && helm.heat < ds.relight) helm.overheat = false;
    }
    updateHelmGear(g, dt, ds, od?.stage ?? 0);
    if (p.aimPoint && (p.aimPoint.t -= dt) <= 0) p.aimPoint = null;
    p.crushMul = ds.crush;
    // The drill string down: she's pinned to the spot. Opening the throttle has the crew raise it first.
    if (g.titan.drill > 0 || g.titan.drillWant) {
      const wants = helm.lever !== 0 || (di.active && (di.y !== 0 || di.x !== 0)) || p.path.length > 0;
      if (wants && g.titan.drillWant) {
        setDrill(g, false);
        g.hooks.toast('DRILL: raising the string before she moves.', '#ffab40');
      }
      p.speed = 0;
    }
    const mult = (1 + (nitro?.v ?? 0)) * (1 - (chill?.v ?? 0)) * stormSpeed(g) * ds.modeTop * (od ? od.speed : 1);
    if (g.titan.drill <= 0 && !g.titan.drillWant) driveTank(g, p, dt, mult, helmDrive(g, dt), od ? od.kick : 1);
    if (nitro && Math.random() < dt * 20) {
      const b = p.toWorld(-p.stats.length / 2, (Math.random() - 0.5) * p.stats.width);
      g.fx.push({ t: 'dust', x: b.x, y: b.y, color: '#18ffff' });
    }
    refillHeal(g, dt);
    healPlayer(g, p.stats.repair * dt, false);
    p.shieldDelay -= dt;
    // With the shield generator's power diverted to the drive, the shield bleeds away instead of recharging.
    if (helm.divert) p.shield = Math.max(0, p.shield - p.stats.shield * 0.25 * dt);
    else if (p.shieldDelay <= 0 && p.shield < p.stats.shield) p.shield = Math.min(p.stats.shield, p.shield + p.stats.shieldRegen * dt);
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
  if (!p.dead) {
    // The master arm switch in the cabin: SAFE holds the ship's guns.
    if (!g.helm.safe) updateTankWeapons(g, p, dt);
    updateTesla(g, p, dt);
    updateSoldiers(g, p, dt);
  }
  if (g.outrider && !g.outrider.dead) updateTankWeapons(g, g.outrider, dt);
  for (const t of g.tanks) {
    if (t.dead || t.kind === 'remote') continue;
    updateTankWeapons(g, t, dt);
    if (t.kind === 'rival') updateSoldiers(g, t, dt);
  }
  updateProjectiles(g, dt);
  updateCollapses(g);
  updateZones(g, dt);
  updateArsenal(g, dt);
  updateCards(g, dt);
  updateSquads(g, dt);
  updateBuilds(g, dt);
  // Flattened obstacles change the paths of everything that can't crush them.
  g.timers.nav -= dt;
  if (g.navDirty && g.timers.nav <= 0) {
    g.timers.nav = 3;
    g.navDirty = false;
    g.map.invalidateNav(true);
  }
  if (g.mode === 'world') {
    if (!p.dead) {
      updateHarvest(g, dt);
      updateSites(g, dt);
      updateRunes(g, dt);
      updateHazards(g, dt);
      updateAutoDrive(g, dt);
      updateTroops(g, dt);
      updateCrewLife(g, dt);
      updateStations(g, dt);
      updateTitan(g, dt);
      updateFuel(g, dt);
      updateComms(g, dt);
      updateStory(g, dt);
      updateNav(g, dt);
      updateCompactor(g, dt);
      updateRobots(g, dt);
      updateHelm(g, dt);
      recordTelemetry(g, dt);
      updateTeams(g, dt);
      updateOrders(g, dt);
    }
    updateAirlift(g, dt);
    updateCompound(g, dt);
    updateCamp(g, dt);
    updateWeather(g, dt);
    updateOutposts(g);
    updatePickups(g, dt);
    updateSpawns(g, dt);
    if (g.campaign.finale !== 'active') updateWaves(g, dt);
    updateColossi(g, dt);
    updateCampaign(g, dt);
    g.timers.vision -= dt;
    if (g.timers.vision <= 0) {
      g.timers.vision = 0.2;
      // The world streams in around the fortress (features by sector, terrain by chunk).
      g.gen.focus(p.x, p.y);
      updateVision(g);
      respawnNodes(g);
    }
    g.timers.evict -= dt;
    if (g.timers.evict <= 0) {
      g.timers.evict = 6;
      g.map.evict(p.x, p.y, 480);
    }
  }
  for (let i = g.floats.length - 1; i >= 0; i--) {
    const f = g.floats[i];
    f.t += dt;
    f.z += dt * 1.6;
    if (f.t > 1.1) g.floats.splice(i, 1);
  }
  g.tanks = g.tanks.filter((t) => !t.dead || t.kind === 'raider' || t.kind === 'remote');
}

/** Why cruise warp can't run right now (null = it can): anything hostile close, a horde, the last stand. */
export function warpBlocked(g: Game): string | null {
  const p = g.player;
  if (g.mode !== 'world') return 'not in the Dead Zone';
  if (p.dead) return 'the Titan is down';
  if (g.campaign.finale === 'active') return 'the last stand';
  if (g.wave.phase !== 'calm') return 'a horde is coming';
  for (const e of g.enemies) if (e.hp > 0 && (e.aggro || e.boss || e.titan) && p.edgeDist(e.x, e.y) < 650) return `${e.name} nearby`;
  for (const t of g.tanks) if (!t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < 900) return 'an enemy hull nearby';
  return null;
}
