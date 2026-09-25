export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  glow: boolean;
  shrink: boolean;
}

const MAX = 2500;

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({
      vx: 0, vy: 0, life: 0.5, max: p.life ?? 0.5, size: 2, color: '#fff', gravity: 0, drag: 0, glow: false, shrink: true,
      ...p,
    });
  }

  burst(x: number, y: number, n: number, o: Partial<Particle> & { speed?: number; spread?: number; angle?: number } = {}): void {
    const speed = o.speed ?? 120;
    const spread = o.spread ?? Math.PI * 2;
    const angle = o.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = (o.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      this.add({ ...o, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life });
    }
  }

  explosion(x: number, y: number, r: number): void {
    this.burst(x, y, 26, { speed: r * 6, life: 0.5, color: '#ffd180', size: 3, glow: true, drag: 3 });
    this.burst(x, y, 18, { speed: r * 3, life: 0.9, color: '#ff6e40', size: 4, glow: true, drag: 2 });
    this.burst(x, y, 16, { speed: r * 2, life: 1.6, color: 'rgba(40,36,40,0.7)', size: 7, drag: 2, gravity: -40, shrink: false });
    this.burst(x, y, 10, { speed: r * 7, life: 0.8, color: '#3a3430', size: 2, gravity: 600 });
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      l[w++] = p;
    }
    l.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, glow: boolean, view: { left: number; top: number; right: number; bottom: number }): void {
    for (const p of this.list) {
      if (p.glow !== glow) continue;
      if (p.x < view.left - 20 || p.x > view.right + 20 || p.y < view.top - 20 || p.y > view.bottom + 20) continue;
      const t = p.life / p.max;
      const s = p.shrink ? p.size * t : p.size;
      ctx.globalAlpha = p.shrink ? 1 : Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
