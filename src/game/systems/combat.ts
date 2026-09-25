import { TILE } from '../../shared/constants';
import { TILES } from '../../shared/tiles';
import type { Projectile } from '../entities';
import type { Game } from '../game';
import type { Rig } from '../rig';
import { breakTile } from './player';

function shieldContains(r: Rig, x: number, y: number): boolean {
  const rx = r.widthPx / 2 + 20, ry = r.heightPx / 2 + 34;
  const dx = (x - r.cx) / rx, dy = (y - (r.cy + 10)) / ry;
  return dx * dx + dy * dy <= 1;
}

export function updateProjectiles(g: Game, dt: number): void {
  const s = g.sim;
  for (const pr of s.projectiles) {
    if (pr.dead) continue;
    pr.life -= dt;
    if (pr.life <= 0) {
      pr.dead = true;
      if (pr.explosive > 0) g.explode(pr.x, pr.y, pr.explosive, pr.dmg, pr.team, pr.tileDmg, pr.visual);
      continue;
    }
    if (pr.homing) {
      const want = Math.atan2(pr.homing.y - pr.y, pr.homing.x - pr.x);
      const cur = Math.atan2(pr.vy, pr.vx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = Math.max(-3 * dt, Math.min(3 * dt, d));
      const sp = Math.hypot(pr.vx, pr.vy) * (1 + dt * 0.8);
      pr.vx = Math.cos(cur + turn) * sp;
      pr.vy = Math.sin(cur + turn) * sp;
      if (Math.random() < 0.6) s.particles.add({ x: pr.x, y: pr.y, vx: -pr.vx * 0.05, vy: -pr.vy * 0.05, life: 0.5, size: 3, color: 'rgba(120,120,120,0.6)', shrink: false });
    }
    if (pr.kind === 'rocket' && Math.random() < 0.7) s.particles.add({ x: pr.x, y: pr.y, life: 0.4, size: 3, color: 'rgba(140,130,120,0.5)', shrink: false, vy: -20 });
    pr.vy += pr.gravity * dt;
    const dist = Math.hypot(pr.vx, pr.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 6));
    const sx = (pr.vx * dt) / steps, sy = (pr.vy * dt) / steps;
    for (let i = 0; i < steps && !pr.dead; i++) {
      const px = pr.x, py = pr.y;
      pr.x += sx;
      pr.y += sy;
      step(g, pr, px, py);
    }
  }
  s.projectiles = s.projectiles.filter((p) => !p.dead);
}

function impactFx(g: Game, pr: Projectile): void {
  g.sim.particles.burst(pr.x, pr.y, pr.kind === 'rail' ? 10 : 4, { color: pr.color, speed: 120, life: 0.2, glow: true, size: 2 });
}

function step(g: Game, pr: Projectile, px: number, py: number): void {
  const s = g.sim;
  const tile = s.world.get(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE));
  if (TILES[tile].solid) {
    if (pr.kind === 'grenade') {
      // bounce
      const hitX = TILES[s.world.get(Math.floor(pr.x / TILE), Math.floor(py / TILE))].solid;
      pr.x = px;
      pr.y = py;
      if (hitX) pr.vx *= -0.45;
      else pr.vy *= -0.4;
      pr.vx *= 0.8;
      return;
    }
    pr.dead = true;
    if (pr.explosive > 0) g.explode(px, py, pr.explosive, pr.dmg, pr.team, pr.tileDmg, pr.visual);
    else impactFx(g, pr);
    return;
  }

  for (const r of s.rigs) {
    if (r.team === pr.team) continue;
    if (r.wrecked && pr.kind !== 'grenade') continue;
    if (!pr.visual && r.shield > 0 && shieldContains(r, pr.x, pr.y) && !shieldContains(r, px, py)) {
      r.shield = Math.max(0, r.shield - pr.dmg);
      r.shieldDelay = 3;
      r.shieldFlash = 0.35;
      pr.dead = true;
      s.particles.burst(pr.x, pr.y, 6, { color: '#b388ff', speed: 100, life: 0.3, glow: true, size: 2 });
      g.audio.play('shield', 0.5);
      return;
    }
    if (pr.x < r.x || pr.x >= r.x + r.widthPx || pr.y < r.y || pr.y >= r.y + r.heightPx) continue;
    if (pr.kind === 'grenade') continue;
    if (pr.visual) {
      const { tx, ty } = r.toTile(pr.x, pr.y);
      if (r.moduleAt(tx, ty) || r.cell(tx, ty, 'x') === 1) {
        pr.dead = true;
        impactFx(g, pr);
        return;
      }
      continue;
    }
    if (pr.hits?.has(r)) continue;
    if (r.damageAt(pr.x, pr.y, pr.explosive > 0 ? pr.dmg * 0.4 : pr.dmg)) {
      if (pr.explosive > 0) {
        pr.dead = true;
        g.explode(pr.x, pr.y, pr.explosive, pr.dmg, pr.team, pr.tileDmg);
        return;
      }
      impactFx(g, pr);
      g.audio.play('clank', 0.4);
      if (pr.pierce > 0 && pr.hits) {
        pr.pierce--;
        pr.hits.add(r);
      } else {
        pr.dead = true;
        return;
      }
    }
  }

  if (pr.visual) return;

  if (pr.team !== 'hostile') {
    for (const e of s.enemies) {
      if (e.dead || pr.hits?.has(e)) continue;
      if (pr.x > e.x - 2 && pr.x < e.x + e.w + 2 && pr.y > e.y - 2 && pr.y < e.y + e.h + 2) {
        if (pr.explosive > 0) {
          pr.dead = true;
          g.explode(pr.x, pr.y, pr.explosive, pr.dmg, pr.team, pr.tileDmg);
          return;
        }
        g.damageEnemy(e, pr.dmg, Math.sign(pr.vx) * pr.knock);
        g.audio.play('hit', 0.5);
        if (pr.pierce > 0 && pr.hits) {
          pr.pierce--;
          pr.hits.add(e);
        } else {
          pr.dead = true;
          return;
        }
      }
    }
    if (s.kind === 'warzone' && g.warzone) {
      for (const r of s.remotes.values()) {
        if (pr.hits?.has(r)) continue;
        if (pr.x > r.x - 2 && pr.x < r.x + r.w + 2 && pr.y > r.y - 2 && pr.y < r.y + r.h + 2) {
          if (pr.explosive > 0) {
            pr.dead = true;
            g.explode(pr.x, pr.y, pr.explosive, pr.dmg, pr.team, pr.tileDmg);
            return;
          }
          g.warzone.reportHit(r.id, pr.dmg, pr.weapon);
          r.hurtFlash = 0.15;
          impactFx(g, pr);
          if (pr.pierce > 0 && pr.hits) {
            pr.pierce--;
            pr.hits.add(r);
          } else {
            pr.dead = true;
            return;
          }
        }
      }
    }
  }
  if (pr.team === 'hostile') {
    const p = g.player;
    if (!p.dead && pr.x > p.x && pr.x < p.x + p.w && pr.y > p.y && pr.y < p.y + p.h) {
      pr.dead = true;
      if (pr.explosive > 0) g.explode(pr.x, pr.y, pr.explosive, pr.dmg, pr.team, pr.tileDmg);
      else g.hurtPlayer(pr.dmg, 'shot', Math.sign(pr.vx) * pr.knock * 0.6);
    }
  }
}

export function explodeAt(g: Game, x: number, y: number, radius: number, dmg: number, team: string, tileDmg: number, visual: boolean): void {
  const s = g.sim;
  s.particles.explosion(x, y, radius);
  const camDist = Math.hypot(x - g.camera.x, y - g.camera.y);
  g.audio.play('explode', Math.max(0.15, 1 - camDist / 1600));
  g.camera.addShake(Math.max(0, 10 - camDist / 80));
  if (visual) return;

  if (team !== 'hostile') {
    for (const e of s.enemies) {
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d < radius + 8) g.damageEnemy(e, dmg * (1 - (d / (radius + 8)) * 0.6), Math.sign(e.cx - x) * 200, -200);
    }
    if (s.kind === 'warzone' && g.warzone) {
      for (const r of s.remotes.values()) {
        const d = Math.hypot(r.x + r.w / 2 - x, r.y + r.h / 2 - y);
        if (d < radius + 8) g.warzone.reportHit(r.id, dmg * (1 - (d / (radius + 8)) * 0.6), 'explosive');
      }
    }
  }
  const p = g.player;
  const pd = Math.hypot(p.cx - x, p.cy - y);
  if (pd < radius + 8 && s.kind === 'world') {
    const f = team === 'hostile' ? 1 : 0.35;
    g.hurtPlayer(dmg * f * (1 - (pd / (radius + 8)) * 0.6), 'explosion', Math.sign(p.cx - x) * 250);
  }

  for (const r of s.rigs) {
    if (r.team === team || r.wrecked) continue;
    if (x < r.x - radius || x > r.x + r.widthPx + radius || y < r.y - radius || y > r.y + r.heightPx + radius) continue;
    if (r.shield > 0 && !shieldContains(r, x, y)) {
      r.shield = Math.max(0, r.shield - dmg);
      r.shieldDelay = 3;
      r.shieldFlash = 0.35;
      continue;
    }
    r.explode(x, y, radius, dmg);
  }

  if (tileDmg > 0) {
    const tr = Math.ceil((radius * 0.7) / TILE);
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - tr; ty <= cy + tr; ty++) {
      for (let tx = cx - tr; tx <= cx + tr; tx++) {
        if (Math.hypot(tx + 0.5 - x / TILE, ty + 0.5 - y / TILE) > tr) continue;
        const t = s.world.get(tx, ty);
        const d = TILES[t];
        if (!d.solid || d.indestructible || d.hardness > tileDmg) continue;
        if (g.rigAt((tx + 0.5) * TILE, (ty + 0.5) * TILE)) continue;
        breakTile(g, tx, ty, Math.random() < 0.35);
      }
    }
  }
}
