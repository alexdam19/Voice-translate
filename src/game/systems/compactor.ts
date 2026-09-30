import { crushable, OBS_COLOR } from '../../shared/map';
import { ENEMIES } from '../enemyDefs';
import type { Game } from '../game';
import { damageEnemy } from './damage';

/**
 * The compactor: with the PLOUGH switch thrown the bow's jaws open into a mouth as wide as the hull, and she eats
 * whatever she drives into. Buildings, walls, wrecks, trees and rock go down its throat whole (anything but cliffs and
 * the Mega Hangar's own walls), and small creatures with them; big ones get mauled. It's all ground down, pressed into
 * bales and spat out of the stern, where the crew hook them aboard as scrap. The open mouth costs a tenth of her
 * top speed and a little fuel.
 */

/** How far ahead of the bow the mouth reaches (m), plus a little more at speed. */
export const MOUTH_REACH = 16;
/** Tonnes of rubble to a bale, and the scrap in one. */
const BALE = 14;
const BALE_SCRAP = 4;

export function updateCompactor(g: Game, dt: number): void {
  const p = g.player;
  const hm = g.helm;
  if (!p.fortress || p.dead) {
    hm.mouth = 0;
    return;
  }
  // The jaws take a second and a half to open or shut.
  hm.mouth = Math.max(0, Math.min(1, hm.mouth + (hm.plow ? dt : -dt) / 1.5));
  if (hm.mouth < 0.85) return;
  hm.biteT -= dt;
  if (hm.biteT > 0) return;
  hm.biteT = 0.12;
  const map = g.map;
  const L = p.stats.length / 2, W = p.stats.width / 2;
  const fwd = p.speed >= -0.2;
  const reach = MOUTH_REACH + Math.min(20, Math.abs(p.speed) * 0.6);
  const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
  let eaten = 0;
  // Everything in the mouth: a box across the bow (the stern if she's backing into something).
  for (let a = 0; a <= reach; a += 1) {
    const lx = (L - 2 + a) * (fwd ? 1 : -1);
    for (let b = -W * 0.92; b <= W * 0.92; b += 1) {
      const x = p.x + ca * lx - sa * b, y = p.y + sa * lx + ca * b;
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!map.inside(tx, ty)) continue;
      const o = map.getObs(tx, ty);
      if (!o || !crushable(o)) continue;
      const h = map.getOh(tx, ty);
      if (!map.crush(tx, ty)) continue;
      g.markDirty(tx, ty);
      g.navDirty = true;
      eaten += 1 + h * 0.25;
      if (Math.random() < 0.08) g.fx.push({ t: 'debris', x: tx + 0.5, y: ty + 0.5, h: Math.max(1, h * 0.4), color: OBS_COLOR[o] ?? '#8a8680', n: 2, fx: x + ca * 30, fy: y + sa * 30, push: 2 });
      if (Math.random() < 0.05) g.fx.push({ t: 'dust', x: tx + 0.5, y: ty + 0.5, color: '#9e9480' });
    }
  }
  // Creatures in the mouth: the small ones are swallowed, the big ones mauled.
  const mx = p.x + ca * (L + reach / 2) * (fwd ? 1 : -1), my = p.y + sa * (L + reach / 2) * (fwd ? 1 : -1);
  for (const e of g.enemiesNear(mx, my, Math.max(W, reach))) {
    if (e.hp <= 0 || e.flying || e.latch || e.colossus) continue;
    const l = p.toLocal(e.x, e.y);
    const along = l.lx * (fwd ? 1 : -1);
    if (along < L - 3 || along > L + reach || Math.abs(l.lz) > W * 0.95) continue;
    const size = ENEMIES[e.kind]?.size ?? e.r * 2;
    if (size < 7 && !e.boss) {
      damageEnemy(g, e, e.hp + 1, { silent: true });
      eaten += 0.6;
      if (Math.random() < 0.3) g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#b71c1c', n: 4 });
    } else damageEnemy(g, e, e.maxHp * 0.02, { silent: true });
  }
  if (eaten <= 0) return;
  hm.bale += eaten;
  hm.eaten += eaten;
  // Pressed into bales and spat out of the stern.
  while (hm.bale >= BALE) {
    hm.bale -= BALE;
    hm.bales++;
    const back = (fwd ? -1 : 1) * (L + 6);
    const side = (Math.random() - 0.5) * W;
    const ex = p.x + ca * back - sa * side, ey = p.y + sa * back + ca * side;
    g.fx.push({ t: 'debris', x: ex, y: ey, h: 6, color: '#7a6a52', n: 3, fx: p.x, fy: p.y, push: 6 });
    g.fx.push({ t: 'dust', x: ex, y: ey, color: '#8a7a62' });
    g.give('scrap', BALE_SCRAP, true);
    if (hm.bales % 10 === 1) g.hooks.toast(`COMPACTOR: bale ${hm.bales} out the stern (+${BALE_SCRAP} scrap each).`, '#ffd740');
  }
}
