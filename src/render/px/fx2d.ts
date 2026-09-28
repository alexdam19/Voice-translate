/**
 * Effects for the pixel-art view: particles (sparks, fire, smoke, dust, debris), and transients (flashes, rings,
 * beams, lightning, light pillars, scorch marks). Everything lives in world metres; the view hands in the
 * world-to-screen mapping when it draws.
 */

export interface ScreenMap {
  /** World -> buffer pixel. */
  sx(x: number, y: number): number;
  sy(x: number, y: number): number;
  ppm: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  add: boolean;
  grav: number;
  alpha: number;
}

type Trans =
  | { k: 'flash'; x: number; y: number; r: number; color: string; t: number; max: number }
  | { k: 'ring'; x: number; y: number; r: number; color: string; t: number; max: number }
  | { k: 'beam'; x0: number; y0: number; x1: number; y1: number; w: number; color: string; t: number; max: number }
  | { k: 'bolt'; pts: { x: number; y: number }[]; color: string; t: number; max: number }
  | { k: 'pillar'; x: number; y: number; w: number; color: string; t: number; max: number }
  | { k: 'scorch'; x: number; y: number; r: number; t: number; max: number };

export class Fx2D {
  private ps: Particle[] = [];
  private tr: Trans[] = [];
  private cap: number;

  constructor(cap = 3500) {
    this.cap = cap;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, opts: { add?: boolean; grav?: number; grow?: number; alpha?: number } = {}): void {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push({ x, y, z, vx, vy, vz, life, max: life, size, grow: opts.grow ?? 0, color, add: opts.add ?? false, grav: opts.grav ?? 0, alpha: opts.alpha ?? 1 });
  }

  flash(x: number, y: number, r: number, color: string, life: number): void {
    this.tr.push({ k: 'flash', x, y, r, color, t: life, max: life });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.45): void {
    this.tr.push({ k: 'ring', x, y, r, color, t: life, max: life });
  }

  beam(x0: number, y0: number, x1: number, y1: number, w: number, color: string, life: number): void {
    this.tr.push({ k: 'beam', x0, y0, x1, y1, w, color, t: life, max: life });
  }

  bolt(pts: { x: number; y: number }[], color: string): void {
    this.tr.push({ k: 'bolt', pts, color, t: 0.2, max: 0.2 });
  }

  pillar(x: number, y: number, w: number, color: string, life: number): void {
    this.tr.push({ k: 'pillar', x, y, w, color, t: life, max: life });
  }

  scorch(x: number, y: number, r: number): void {
    if (this.tr.length > 600) return;
    this.tr.push({ k: 'scorch', x, y, r, t: 18, max: 18 });
  }

  update(dt: number): void {
    const ps = this.ps;
    let k = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      p.vz -= p.grav * dt;
      const drag = Math.pow(0.35, dt);
      p.vx *= drag;
      p.vy *= drag;
      p.size = Math.max(0.05, p.size + p.grow * dt);
      ps[k++] = p;
    }
    ps.length = k;
    let j = 0;
    for (const t of this.tr) {
      t.t -= dt;
      if (t.t > 0) this.tr[j++] = t;
    }
    this.tr.length = j;
  }

  /** Scorch marks go under everything else. */
  drawGround(c: CanvasRenderingContext2D, m: ScreenMap): void {
    for (const t of this.tr) {
      if (t.k !== 'scorch') continue;
      const a = Math.min(1, t.t / 4) * 0.45;
      const r = Math.max(1, t.r * m.ppm);
      c.globalAlpha = a;
      c.fillStyle = '#140e0a';
      const x = m.sx(t.x, t.y), y = m.sy(t.x, t.y);
      c.fillRect(Math.round(x - r), Math.round(y - r * 0.7), Math.round(r * 2), Math.round(r * 1.4));
      c.fillRect(Math.round(x - r * 0.7), Math.round(y - r), Math.round(r * 1.4), Math.round(r * 2));
    }
    c.globalAlpha = 1;
  }

  draw(c: CanvasRenderingContext2D, m: ScreenMap, w: number, h: number): void {
    const ppm = m.ppm;
    // Particles: smoke and dust normally, fire and sparks additively. Height lifts them up the screen a little.
    for (const pass of [false, true]) {
      c.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.ps) {
        if (p.add !== pass) continue;
        const s = Math.max(1, Math.round(p.size * ppm));
        const x = Math.round(m.sx(p.x, p.y) - s / 2), y = Math.round(m.sy(p.x, p.y) - p.z * ppm * 0.6 - s / 2);
        if (x < -s || y < -s || x > w || y > h) continue;
        c.globalAlpha = Math.min(1, (p.life / p.max) * 1.4) * p.alpha;
        c.fillStyle = p.color;
        c.fillRect(x, y, s, s);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'lighter';
    for (const t of this.tr) {
      const f = t.t / t.max;
      switch (t.k) {
        case 'flash': {
          const r = Math.max(1, t.r * ppm * (1.2 - f * 0.4));
          const x = m.sx(t.x, t.y), y = m.sy(t.x, t.y);
          c.globalAlpha = f * 0.8;
          c.fillStyle = t.color;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = f;
          c.fillStyle = '#ffffff';
          c.beginPath();
          c.arc(x, y, r * 0.4, 0, Math.PI * 2);
          c.fill();
          break;
        }
        case 'ring': {
          const r = Math.max(1, t.r * ppm * (1 - f * 0.85));
          c.globalAlpha = f;
          c.strokeStyle = t.color;
          c.lineWidth = Math.max(1, 2 * f + 1);
          c.beginPath();
          c.arc(m.sx(t.x, t.y), m.sy(t.x, t.y), r, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        case 'beam':
          c.globalAlpha = Math.min(1, f * 1.5);
          c.strokeStyle = t.color;
          c.lineWidth = Math.max(1, t.w * ppm * 1.4);
          c.beginPath();
          c.moveTo(m.sx(t.x0, t.y0), m.sy(t.x0, t.y0));
          c.lineTo(m.sx(t.x1, t.y1), m.sy(t.x1, t.y1));
          c.stroke();
          c.strokeStyle = '#ffffff';
          c.lineWidth = Math.max(1, t.w * ppm * 0.5);
          c.stroke();
          break;
        case 'bolt':
          c.globalAlpha = f;
          c.strokeStyle = t.color;
          c.lineWidth = 1.5;
          c.beginPath();
          t.pts.forEach((p, i) => (i ? c.lineTo(m.sx(p.x, p.y), m.sy(p.x, p.y)) : c.moveTo(m.sx(p.x, p.y), m.sy(p.x, p.y))));
          c.stroke();
          break;
        case 'pillar': {
          const x = m.sx(t.x, t.y), y = m.sy(t.x, t.y);
          const ww = Math.max(2, t.w * ppm);
          c.globalAlpha = f * 0.7;
          c.fillStyle = t.color;
          c.fillRect(Math.round(x - ww / 2), 0, Math.round(ww), Math.round(y));
          c.globalAlpha = f;
          c.fillStyle = '#ffffff';
          c.fillRect(Math.round(x - ww / 6), 0, Math.max(1, Math.round(ww / 3)), Math.round(y));
          break;
        }
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}
