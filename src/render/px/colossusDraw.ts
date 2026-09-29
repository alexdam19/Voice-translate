import type { Game } from '../../game/game';
import { COLOSSI, colossusToWorld, type Colossus } from '../../game/systems/colossus';
import {
  behemothHull, behemothRack, behemothTurret, hiveBody, hiveGland, hiveLeg, hiveSac, leviathanGill, leviathanHead, leviathanSegment, leviathanTail,
  walkerCannon, walkerCoil, walkerCore, walkerHub, walkerLeg, type Spr,
} from './colossusArt';

/**
 * Draws the colossi in the tactical view: body sprites turned to their heading, legs stepping, the worm's segments
 * strung along its spine, turrets tracking you, weak points ringed with a pulsing reticle and a health bar (a burning
 * wreck once broken), and the core under its armour until it opens.
 */

export interface ColossusView {
  c: CanvasRenderingContext2D;
  /** World to screen. */
  sx(x: number, y: number): number;
  sy(x: number, y: number): number;
  /** The view's turn (added to world angles) and pixels per metre. */
  th: number;
  ppm: number;
  time: number;
}

/** A sprite centred at world (x, y), turned to world angle `a`, `k` times its painted size. */
function at(v: ColossusView, s: Spr, x: number, y: number, a: number, k = 1, alpha = 1): void {
  const c = v.c;
  const sc = v.ppm * s.mpp * k;
  const ang = a + v.th;
  c.setTransform(Math.cos(ang) * sc, Math.sin(ang) * sc, -Math.sin(ang) * sc, Math.cos(ang) * sc, Math.round(v.sx(x, y)), Math.round(v.sy(x, y)));
  c.imageSmoothingEnabled = sc < 0.9;
  if (alpha < 1) c.globalAlpha = alpha;
  c.drawImage(s.img, -s.img.width / 2, -s.img.height / 2);
  if (alpha < 1) c.globalAlpha = 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * A limb sprite laid from world point A to B: the sprite's units `u0`..`u1` along its x axis span the segment; `wk`
 * scales its thickness (1: as painted).
 */
function seg(v: ColossusView, s: Spr, ax: number, ay: number, bx: number, by: number, u0: number, u1: number, wk = 1): void {
  const len = Math.hypot(bx - ax, by - ay);
  const unitM = (s.mpp * s.img.width) / 32;
  const k = len / ((u1 - u0) * unitM);
  const mid = (u0 + u1) / 2;
  const a = Math.atan2(by - ay, bx - ax);
  // The sprite's centre sits (16 - mid) units past the segment's midpoint.
  const off = (16 - mid) * unitM * k;
  const x = (ax + bx) / 2 + Math.cos(a) * off, y = (ay + by) / 2 + Math.sin(a) * off;
  const c = v.c;
  const sx = v.ppm * s.mpp * k, sy = v.ppm * s.mpp * wk;
  const ang = a + v.th;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  c.setTransform(ca * sx, sa * sx, -sa * sy, ca * sy, Math.round(v.sx(x, y)), Math.round(v.sy(x, y)));
  c.imageSmoothingEnabled = Math.min(sx, sy) < 0.9;
  c.drawImage(s.img, -s.img.width / 2, -s.img.height / 2);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/** A soft dark footprint under the body (it stands on the ground; its bulk shades it). */
function shadow(v: ColossusView, x: number, y: number, rx: number, ry: number, a: number, alpha = 0.35): void {
  const c = v.c;
  const off = 8 * v.ppm;
  c.save();
  c.translate(v.sx(x, y) + off, v.sy(x, y) + off * 0.8);
  c.rotate(a + v.th);
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.beginPath();
  c.ellipse(0, 0, rx * v.ppm, ry * v.ppm, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** A weak point's reticle and health bar, or its burning wreck. */
function marker(v: ColossusView, x: number, y: number, r: number, frac: number, alive: boolean, core: boolean, shut: boolean, name: string): void {
  const c = v.c;
  const X = Math.round(v.sx(x, y)), Y = Math.round(v.sy(x, y));
  const R = Math.max(6, r * v.ppm);
  if (!alive) {
    // Wreckage: a scorched crater with flames licking up.
    c.fillStyle = 'rgba(20,10,6,0.7)';
    c.beginPath();
    c.arc(X, Y, R * 0.8, 0, Math.PI * 2);
    c.fill();
    for (let k = 0; k < 6; k++) {
      const fl = Math.sin(v.time * 11 + k * 2.3) * 0.5 + 0.5;
      c.fillStyle = k % 2 ? '#ff9100' : '#ffd740';
      c.fillRect(Math.round(X + Math.cos(k * 1.1) * R * 0.4), Math.round(Y + Math.sin(k * 1.7) * R * 0.4 - fl * R * 0.3), Math.max(2, R * 0.12), Math.max(2, R * 0.2 * fl));
    }
    return;
  }
  const pulse = 0.5 + 0.5 * Math.sin(v.time * 4 + x * 0.01);
  const col = shut ? '#8a8e96' : core ? '#ffea00' : '#ff5a2a';
  c.strokeStyle = col;
  c.globalAlpha = shut ? 0.55 : 0.55 + 0.4 * pulse;
  c.lineWidth = 2;
  // Four corner brackets.
  const q = R * (1.05 + 0.08 * pulse), l = Math.max(4, R * 0.35);
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    c.moveTo(X + sx * q, Y + sy * (q - l));
    c.lineTo(X + sx * q, Y + sy * q);
    c.lineTo(X + sx * (q - l), Y + sy * q);
  }
  c.stroke();
  c.globalAlpha = 1;
  // Health bar above, and the name when there's room.
  const bw = Math.max(26, R * 1.8);
  c.fillStyle = 'rgba(8,6,16,0.85)';
  c.fillRect(Math.round(X - bw / 2) - 1, Math.round(Y - q - 9), Math.round(bw) + 2, 5);
  c.fillStyle = shut ? '#6a6e76' : frac > 0.5 ? '#ff7a3a' : frac > 0.25 ? '#ffb030' : '#ff2a2a';
  c.fillRect(Math.round(X - bw / 2), Math.round(Y - q - 8), Math.round(bw * frac), 3);
  if (R > 14) {
    c.font = '9px Silkscreen, monospace';
    c.textAlign = 'center';
    c.fillStyle = shut ? '#9aa0aa' : '#ffe0c0';
    c.fillText(shut ? `${name.toUpperCase()} · ARMOURED` : name.toUpperCase(), X, Math.round(Y - q - 12));
  }
}

export function drawColossus(v: ColossusView, g: Game, col: Colossus): void {
  const d = COLOSSI[col.kind];
  const p = g.player;
  const aim = Math.atan2(p.y - col.y, p.x - col.x);
  const parts = col.parts.map((id) => g.enemies.find((e) => e.id === id));
  const alive = (i: number): boolean => !!parts[i] && parts[i]!.hp > 0 && col.dying <= 0;
  const posOf = (i: number): { x: number; y: number } => (parts[i] ? { x: parts[i]!.x, y: parts[i]!.y } : colossusToWorld(col, (d.weak[i].fx * d.L) / 2, (d.weak[i].fz * d.W) / 2));
  const fade = col.dying > 0 ? Math.max(0, 1 - col.dying / 4) : 1;
  switch (col.kind) {
    case 'behemoth': {
      shadow(v, col.x, col.y, d.L * 0.5, d.W * 0.48, col.rot);
      at(v, behemothHull(), col.x, col.y, col.rot, 1, fade);
      // Tread links rolling (bright grousers sliding aft along each belt).
      const run = (col.anim * 18) % 10;
      v.c.fillStyle = 'rgba(120,120,120,0.35)';
      for (const s of [-1, 1]) {
        for (let x = -d.L * 0.45 + run; x < d.L * 0.45; x += 10) {
          const w = colossusToWorld(col, x, s * d.W * 0.4);
          v.c.fillRect(Math.round(v.sx(w.x, w.y)), Math.round(v.sy(w.x, w.y)), Math.max(1, 2 * v.ppm), Math.max(1, 1.2 * v.ppm));
        }
      }
      if (alive(1)) at(v, behemothRack(), posOf(1).x, posOf(1).y, col.rot);
      if (alive(2)) at(v, behemothRack(), posOf(2).x, posOf(2).y, col.rot);
      if (alive(0)) at(v, behemothTurret(), posOf(0).x, posOf(0).y, aim);
      break;
    }
    case 'leviathan': {
      if (col.burrowed > 0) {
        // Under the sand: a travelling mound and a dust trail.
        for (let i = 0; i < col.spine.length; i += 2) shadow(v, col.spine[i].x, col.spine[i].y, d.W * 0.45, d.W * 0.45, 0, 0.25);
        break;
      }
      for (let i = 0; i < col.spine.length; i += 2) shadow(v, col.spine[i].x, col.spine[i].y, d.W * 0.5, d.W * 0.5, 0, 0.18);
      // Tail first, then the segments back to front, then the head (so the head sits on top).
      const sp = col.spine;
      const ang = (i: number): number => Math.atan2(sp[Math.max(0, i - 1)].y - sp[Math.min(sp.length - 1, i + 1)].y, sp[Math.max(0, i - 1)].x - sp[Math.min(sp.length - 1, i + 1)].x);
      at(v, leviathanTail(), sp[sp.length - 1].x, sp[sp.length - 1].y, ang(sp.length - 1), 1, fade);
      for (let i = sp.length - 2; i >= 1; i--) {
        const w = 1 - Math.max(0, (i - sp.length * 0.6) / (sp.length * 0.5)) * 0.45;
        at(v, leviathanSegment(i % 3), sp[i].x, sp[i].y, ang(i) + Math.sin(col.anim * 2 + i * 0.6) * 0.05, w, fade);
      }
      // Gill vents on their segments while they stand.
      for (const i of [1, 2]) if (alive(i)) at(v, leviathanGill(), posOf(i).x, posOf(i).y, ang(Math.round(((1 - d.weak[i].fx) / 2) * (sp.length - 1))));
      const open = col.atk?.key === 'erupt' || col.atk?.key === 'acid' ? 1 : 0;
      at(v, leviathanHead(open), sp[0].x, sp[0].y, ang(0), 1, fade);
      break;
    }
    case 'hivemother': {
      shadow(v, col.x, col.y, d.L * 0.55, d.W * 0.5, col.rot);
      // Six legs from the thorax: thigh out and forward or back, shin down to the foot, in a rippling gait.
      const legs: [number, number][] = [[0.2, -1], [0.14, -1], [0.08, -1], [0.2, 1], [0.14, 1], [0.08, 1]];
      legs.forEach(([fx, s], i) => {
        const hip = colossusToWorld(col, fx * d.L, s * d.W * 0.1);
        const swing = Math.sin(col.anim * 1.6 + i * 1.05 + (s > 0 ? Math.PI : 0)) * 0.22;
        // Front pair reaches forward, the back pair back, the middle straight out.
        const base = col.rot + s * (Math.PI / 2 - (fx - 0.14) * 9) + swing;
        const knee = { x: hip.x + Math.cos(base) * 70, y: hip.y + Math.sin(base) * 70 };
        const shinA = base + s * -0.55 + swing * 0.5;
        const foot = { x: knee.x + Math.cos(shinA) * 62, y: knee.y + Math.sin(shinA) * 62 };
        seg(v, hiveLeg(false), hip.x, hip.y, knee.x, knee.y, 3, 27);
        seg(v, hiveLeg(true), knee.x, knee.y, foot.x, foot.y, 3, 31);
      });
      at(v, hiveBody(), col.x, col.y, col.rot, 1, fade);
      for (const i of [0, 1]) if (alive(i)) at(v, hiveSac(), posOf(i).x, posOf(i).y, col.rot, 1 + 0.05 * Math.sin(v.time * 3 + i));
      if (alive(2)) at(v, hiveGland(), posOf(2).x, posOf(2).y, col.rot, 1 + 0.06 * Math.sin(v.time * 5));
      break;
    }
    case 'stormwalker': {
      // Three long legs from the hub, feet planted wide, swinging round as it strides.
      for (let k = 0; k < 3; k++) {
        const a = col.rot + (k * Math.PI * 2) / 3 + Math.sin(col.anim * 1.2 + k * 2.1) * 0.18;
        const hip = { x: col.x + Math.cos(a) * 45, y: col.y + Math.sin(a) * 45 };
        const foot = { x: col.x + Math.cos(a) * 170, y: col.y + Math.sin(a) * 170 };
        shadow(v, foot.x, foot.y, 16, 16, 0, 0.3);
        seg(v, walkerLeg(), hip.x, hip.y, foot.x, foot.y, 2, 31, 1.6);
      }
      shadow(v, col.x, col.y, 70, 70, 0, 0.3);
      at(v, walkerHub(), col.x, col.y, col.rot + v.time * 0.05, 1, fade);
      at(v, walkerCore(col.open), col.x, col.y, col.rot);
      if (alive(1)) at(v, walkerCoil(), posOf(1).x, posOf(1).y, v.time);
      if (alive(0)) at(v, walkerCannon(), posOf(0).x, posOf(0).y, aim);
      // Arcs crawling over the coil.
      if (alive(1) && Math.random() < 0.5) {
        const c = v.c;
        const q = posOf(1);
        c.strokeStyle = '#9fe8ff';
        c.lineWidth = 1;
        c.beginPath();
        let x = v.sx(q.x, q.y), y = v.sy(q.x, q.y);
        c.moveTo(x, y);
        for (let i = 0; i < 4; i++) {
          x += (Math.random() - 0.5) * 30 * v.ppm;
          y += (Math.random() - 0.5) * 30 * v.ppm;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    }
  }
  if (col.hitFlash > 0) {
    // A faint white flash over the whole thing when something lands.
    const c = v.c;
    c.globalAlpha = 0.08;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(v.sx(col.x, col.y), v.sy(col.x, col.y), Math.max(d.L, d.W) * 0.45 * v.ppm, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
  if (col.dying > 0 || (col.kind === 'leviathan' && col.burrowed > 0)) return;
  // Weak points on top.
  d.weak.forEach((w, i) => {
    const q = posOf(i);
    const e = parts[i];
    marker(v, q.x, q.y, w.r, e ? Math.max(0, e.hp / e.maxHp) : 0, alive(i), !!w.core, !!w.core && !col.open, w.name);
  });
}
