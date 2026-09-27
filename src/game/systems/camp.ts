import { OBS } from '../../shared/map';
import type { Game } from '../game';

/**
 * Setting up camp. Park, deploy, and the fortress digs in: barricades go up in a ring around it, the crew rest in
 * earnest, builders work twice as fast, new crew sign on quickly, the hull patches itself, and if you're destroyed
 * this is where you're towed back to. It can't move while deployed: pack up (quicker than setting up) when it gets
 * too dangerous.
 */

export type DeployState = 'mobile' | 'deploying' | 'up' | 'packing';

export interface Deploy {
  state: DeployState;
  t: number;
  x: number;
  y: number;
  /** Barricade tiles it raised. */
  walls: [number, number][];
  /** Where you respawn (your last camp), if you've made one. */
  home: { x: number; y: number } | null;
}

export const newDeploy = (): Deploy => ({ state: 'mobile', t: 0, x: 0, y: 0, walls: [], home: null });

const DEPLOY_TIME = 6;
const PACK_TIME = 3.5;

export function canDeploy(g: Game): string | null {
  const p = g.player;
  if (g.mode !== 'world' || p.dead) return 'Not now.';
  if (g.deploy.state !== 'mobile') return null;
  if (Math.abs(p.speed) > 0.6) return 'Stop the fortress first.';
  if (g.campaign.finale === 'active') return 'No time to dig in!';
  return null;
}

/** Deploy (or pack up if deployed). */
export function toggleDeploy(g: Game): string {
  const d = g.deploy;
  if (d.state === 'up') {
    d.state = 'packing';
    d.t = PACK_TIME;
    g.hooks.sound('build');
    return 'Packing up camp...';
  }
  if (d.state === 'deploying') {
    d.state = 'mobile';
    g.player.anchored = false;
    g.player.recalc();
    return 'Deployment cancelled.';
  }
  if (d.state === 'packing') return 'Already packing up.';
  const why = canDeploy(g);
  if (why) return why;
  d.state = 'deploying';
  d.t = DEPLOY_TIME;
  d.x = g.player.x;
  d.y = g.player.y;
  g.player.anchored = true;
  g.player.path = [];
  g.player.goal = null;
  g.player.recalc();
  g.hooks.sound('build');
  return 'Setting up camp: stabilisers down, barricades going up...';
}

export function updateCamp(g: Game, dt: number): void {
  const d = g.deploy;
  const p = g.player;
  if (d.state === 'mobile') return;
  if (p.dead) {
    tearDown(g);
    d.state = 'mobile';
    return;
  }
  if (d.state === 'deploying' || d.state === 'packing') {
    d.t -= dt;
    if (Math.random() < dt * 6) g.fx.push({ t: 'dust', x: p.x + (Math.random() - 0.5) * p.stats.width, y: p.y + (Math.random() - 0.5) * p.stats.length, color: '#a1887f' });
    if (d.t > 0) return;
    if (d.state === 'deploying') {
      d.state = 'up';
      raiseWalls(g);
      d.home = { x: p.x, y: p.y };
      g.hooks.toast('CAMP SET UP. Crew rest, builders work twice as fast, recruits sign on and the hull patches itself. You respawn here. Pack up (T) to move.', '#76ff03');
      g.hooks.sound('levelup');
    } else {
      d.state = 'mobile';
      tearDown(g);
      p.anchored = false;
      p.recalc();
      g.hooks.toast('Packed up. Rolling out.', '#b0bec5');
    }
    return;
  }
  // Camp life: the hull patches itself.
  p.hp = Math.min(p.stats.maxHp, p.hp + (4 + p.stats.maxHp * 0.002) * dt);
}

/** A ring of barricades around the hull, with four gaps. */
function raiseWalls(g: Game): void {
  const d = g.deploy;
  const p = g.player;
  const R = p.stats.length / 2 + 7;
  d.walls = [];
  for (let a = 0; a < Math.PI * 2; a += 0.6 / R) {
    const rel = (((a - p.rot) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (rel < 0.28) continue;
    const tx = Math.floor(p.x + Math.cos(a) * R), ty = Math.floor(p.y + Math.sin(a) * R);
    if (g.map.getObs(tx, ty)) continue;
    const ter = g.map.getTer(tx, ty);
    if (ter === 9 || ter === 13) continue;
    g.map.set(tx, ty, { obs: OBS.WALL, oh: 3 });
    g.map.chunkAtTile(tx, ty).touched = true;
    d.walls.push([tx, ty]);
    g.markDirty(tx, ty);
  }
  g.map.invalidateNav(true);
}

function tearDown(g: Game): void {
  const d = g.deploy;
  for (const [tx, ty] of d.walls) {
    if (g.map.getObs(tx, ty) === OBS.WALL) {
      g.map.set(tx, ty, { obs: 0, oh: 0 });
      g.markDirty(tx, ty);
    }
  }
  d.walls = [];
  g.map.invalidateNav(true);
}

/** Multipliers while camped. */
export function campBonus(g: Game): { build: number; train: number } {
  return g.deploy.state === 'up' ? { build: 2, train: 3 } : { build: 1, train: 1 };
}
