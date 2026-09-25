import { TILE } from '../shared/constants';
import { RNG } from '../shared/rng';
import { mixRGB, rgb, smoothstep, type RGB } from '../shared/types';
import type { ZoneDef } from '../shared/zones';
import type { Camera } from '../game/camera';

const LAYER_W = 1024;
const LAYER_H = 380;
const PARALLAX = [0.05, 0.14, 0.3];

/** 0 at midnight .. 1 at noon, with soft dawn/dusk. */
export function daylight(dayTime: number): number {
  // dayTime: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
  const s = Math.sin((dayTime - 0.25) * Math.PI * 2);
  return smoothstep((s + 0.35) / 0.9);
}

function mk(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = LAYER_W;
  c.height = LAYER_H;
  return [c, c.getContext('2d')!];
}

function ridge(ctx: CanvasRenderingContext2D, rng: RNG, base: number, amp: number, freq: number, color: string, jag = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, LAYER_H);
  const phase = rng.range(0, 100);
  const p2 = rng.range(0, 100);
  for (let x = 0; x <= LAYER_W; x += 4) {
    const t = (x / LAYER_W) * Math.PI * 2;
    let y = base - Math.sin(t * freq + phase) * amp * 0.6 - Math.sin(t * freq * 2.3 + p2) * amp * 0.3 - Math.sin(t * freq * 5 + phase) * amp * 0.1;
    if (jag) y -= Math.abs(Math.sin(t * freq * 7 + p2)) * jag;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(LAYER_W, LAYER_H);
  ctx.closePath();
  ctx.fill();
}

function skyline(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string, windows: string[], minH: number, maxH: number, broken: number): void {
  let x = 0;
  while (x < LAYER_W) {
    const w = rng.int(18, 54);
    const h = rng.int(minH, maxH);
    const top = base - h;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, top + (rng.chance(broken) ? rng.int(4, 20) : 0));
    const steps = rng.int(1, 3);
    for (let i = 1; i <= steps; i++) ctx.lineTo(x + (w * i) / steps, top + (rng.chance(broken) ? rng.int(0, 30) : 0));
    ctx.lineTo(x + w, base);
    ctx.fill();
    if (rng.chance(0.4)) ctx.fillRect(x + w / 2 - 1, top - rng.int(8, 26), 2, 26);
    for (let wy = top + 6; wy < base - 4; wy += 6) {
      for (let wx = x + 3; wx < x + w - 3; wx += 5) {
        if (rng.chance(0.12)) {
          ctx.fillStyle = rng.pick(windows);
          ctx.fillRect(wx, wy, 2, 2);
        }
      }
    }
    x += w + rng.int(-6, 10);
  }
}

function pylons(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  let prev: [number, number] | null = null;
  for (let x = rng.int(20, 80); x < LAYER_W + 100; x += rng.int(140, 240)) {
    const h = rng.int(60, 110);
    ctx.fillRect(x - 2, base - h, 4, h);
    ctx.fillRect(x - 14, base - h + 6, 28, 3);
    ctx.fillRect(x - 10, base - h + 18, 20, 2);
    ctx.lineWidth = 1;
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev[0] + 12, prev[1] + 7);
      ctx.quadraticCurveTo((prev[0] + x) / 2, Math.max(prev[1], base - h) + 30, x - 12, base - h + 7);
      ctx.stroke();
    }
    prev = [x, base - h];
  }
}

function wrecks(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string, n: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, LAYER_W - 60);
    const w = rng.int(30, 70), h = rng.int(10, 22);
    ctx.fillRect(x, base - h, w, h);
    ctx.fillRect(x + w * 0.2, base - h - 8, w * 0.4, 8);
    ctx.beginPath();
    ctx.arc(x + 8, base, 7, 0, Math.PI * 2);
    ctx.arc(x + w - 8, base, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function spires(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string, minH: number, maxH: number): void {
  ctx.fillStyle = color;
  for (let x = 0; x < LAYER_W; x += rng.int(10, 40)) {
    const h = rng.int(minH, maxH);
    const w = rng.int(8, 24);
    ctx.beginPath();
    ctx.moveTo(x - w, base);
    ctx.lineTo(x + rng.int(-4, 4), base - h);
    ctx.lineTo(x + w, base);
    ctx.fill();
  }
}

function towers(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string, glow: string): void {
  for (let x = rng.int(30, 100); x < LAYER_W; x += rng.int(160, 280)) {
    const w = rng.int(50, 80), h = rng.int(90, 150);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + w * 0.2, base - h * 0.5, x + w * 0.1, base - h);
    ctx.lineTo(x + w * 0.9 - rng.int(0, 20), base - h + rng.int(0, 30));
    ctx.quadraticCurveTo(x + w * 0.8, base - h * 0.5, x + w, base);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.fillRect(x + w * 0.3, base - h * 0.4, 3, 3);
  }
}

function volcano(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string): void {
  for (let x = rng.int(80, 200); x < LAYER_W; x += rng.int(300, 460)) {
    const w = rng.int(160, 260), h = rng.int(120, 180);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.lineTo(x - 18, base - h);
    ctx.lineTo(x + 18, base - h);
    ctx.lineTo(x + w / 2, base);
    ctx.fill();
    const g = ctx.createRadialGradient(x, base - h, 2, x, base - h, 60);
    g.addColorStop(0, 'rgba(255,140,40,0.8)');
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, base - h - 60, 120, 120);
    ctx.fillStyle = 'rgba(255,120,40,0.7)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 10 + rng.int(-6, 6), base - h + i * 12 + rng.int(0, 6), 2, 10);
  }
}

function colossusHead(ctx: CanvasRenderingContext2D, rng: RNG, base: number, color: string, eye: string): void {
  for (let x = rng.int(100, 300); x < LAYER_W; x += rng.int(420, 600)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + 10, base - 70);
    ctx.lineTo(x + 40, base - 96);
    ctx.lineTo(x + 100, base - 90);
    ctx.lineTo(x + 124, base - 50);
    ctx.lineTo(x + 130, base);
    ctx.fill();
    ctx.fillStyle = eye;
    ctx.fillRect(x + 36, base - 70, 18, 6);
    ctx.fillRect(x + 76, base - 68, 18, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x + 150, base - 40, 12, 40);
    ctx.fillRect(x + 166, base - 56, 10, 56);
    ctx.fillRect(x + 180, base - 48, 10, 48);
  }
}

function paintZone(z: ZoneDef): HTMLCanvasElement[] {
  const rng = new RNG(z.key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const hz = z.haze, sil = z.silhouette;
  const far = rgb(mixRGB(sil, hz, 0.62));
  const mid = rgb(mixRGB(sil, hz, 0.35));
  const near = rgb(mixRGB(sil, [0, 0, 0], 0.2));
  const [c0, x0] = mk();
  const [c1, x1] = mk();
  const [c2, x2] = mk();
  const neonWin = ['#ffd180', '#80deea', '#ff80ab', '#b388ff'];
  switch (z.key) {
    case 'rustbelt':
      ridge(x0, rng, 300, 60, 2, far);
      skyline(x0, rng, 320, far, ['#a1887f'], 40, 120, 0.3);
      skyline(x1, rng, 340, mid, neonWin, 50, 170, 0.5);
      pylons(x2, rng, 370, near);
      wrecks(x2, rng, 372, near, 5);
      break;
    case 'dunes':
      ridge(x0, rng, 290, 40, 3, far);
      ridge(x1, rng, 330, 40, 2, mid);
      colossusHead(x1, rng, 336, mid, '#ffab40');
      ridge(x2, rng, 368, 22, 4, near);
      break;
    case 'glass':
      ridge(x0, rng, 280, 50, 1, far);
      towers(x1, rng, 340, mid, '#c6ff00');
      skyline(x1, rng, 350, mid, ['#c6ff00'], 20, 60, 0.8);
      spires(x2, rng, 372, near, 6, 28);
      break;
    case 'cryo':
      spires(x0, rng, 330, far, 60, 200);
      spires(x1, rng, 350, mid, 40, 140);
      spires(x2, rng, 376, near, 10, 60);
      break;
    case 'magma':
      ridge(x0, rng, 300, 60, 2, far, 20);
      volcano(x1, rng, 350, mid);
      ridge(x2, rng, 370, 16, 5, near, 12);
      break;
    case 'acid':
      ridge(x0, rng, 300, 30, 2, far);
      skyline(x1, rng, 350, mid, ['#69f0ae', '#b2ff59'], 40, 110, 0.6);
      towers(x1, rng, 350, mid, '#69f0ae');
      wrecks(x2, rng, 372, near, 3);
      pylons(x2, rng, 374, near);
      break;
    default: // dead zone
      ridge(x0, rng, 300, 40, 2, far);
      skyline(x0, rng, 320, far, ['#ff80ab'], 60, 150, 0.2);
      skyline(x1, rng, 350, mid, neonWin, 80, 220, 0.5);
      wrecks(x2, rng, 372, near, 6);
      pylons(x2, rng, 374, near);
  }
  return [c0, c1, c2];
}

export class Backdrop {
  private layers = new Map<string, HTMLCanvasElement[]>();
  private stars: { x: number; y: number; s: number }[] = [];

  constructor() {
    const rng = new RNG(4242);
    for (let i = 0; i < 180; i++) this.stars.push({ x: rng.next(), y: rng.next() * 0.7, s: rng.chance(0.1) ? 2 : 1 });
  }

  private get(z: ZoneDef): HTMLCanvasElement[] {
    let l = this.layers.get(z.key);
    if (!l) {
      l = paintZone(z);
      this.layers.set(z.key, l);
    }
    return l;
  }

  /** Draws sky + parallax in screen space. `blend` crossfades toward a neighbouring zone. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, a: ZoneDef, b: ZoneDef | null, blend: number, dayTime: number, time: number, horizonWorldY: number): void {
    const W = cam.viewW, H = cam.viewH;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    const day = daylight(dayTime);
    const skyOf = (z: ZoneDef): { top: RGB; mid: RGB; low: RGB } => ({
      top: mixRGB(z.night.top, z.sky.top, day),
      mid: mixRGB(mixRGB(z.night.top, z.night.low, 0.5), z.sky.mid, day),
      low: mixRGB(z.night.low, z.sky.low, day),
    });
    let sky = skyOf(a);
    if (b && blend > 0) {
      const sb = skyOf(b);
      sky = { top: mixRGB(sky.top, sb.top, blend), mid: mixRGB(sky.mid, sb.mid, blend), low: mixRGB(sky.low, sb.low, blend) };
    }
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(sky.top));
    grad.addColorStop(0.55, rgb(sky.mid));
    grad.addColorStop(1, rgb(sky.low));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    if (day < 0.6) {
      ctx.fillStyle = '#ffffff';
      for (const s of this.stars) {
        ctx.globalAlpha = (0.6 - day) * (0.6 + 0.4 * Math.sin(time * 2 + s.x * 50));
        ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }
    // Aurora over the Cryo Spires at night
    if ((a.key === 'cryo' || b?.key === 'cryo') && day < 0.5) {
      const k = (a.key === 'cryo' ? 1 - blend : blend) * (0.5 - day) * 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = k * 0.35;
        const gy = H * (0.12 + i * 0.07);
        const ag = ctx.createLinearGradient(0, gy - 40, 0, gy + 60);
        ag.addColorStop(0, 'rgba(0,255,170,0)');
        ag.addColorStop(0.5, i % 2 ? 'rgba(120,80,255,0.8)' : 'rgba(0,255,170,0.8)');
        ag.addColorStop(1, 'rgba(0,255,170,0)');
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, gy + Math.sin(x * 0.006 + time * 0.3 + i) * 30);
        ctx.lineTo(W, gy + 80);
        ctx.lineTo(0, gy + 80);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Sun / moon on an arc
    const ang = (dayTime - 0.25) * Math.PI * 2;
    const sx = W * 0.5 - Math.cos(ang) * W * 0.42;
    const sy = H * 0.75 - Math.sin(ang) * H * 0.62;
    if (Math.sin(ang) > -0.2) {
      const sun = a.sun;
      const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120);
      sg.addColorStop(0, rgb(sun, 0.9));
      sg.addColorStop(0.15, rgb(sun, 0.45));
      sg.addColorStop(1, rgb(sun, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 120, sy - 120, 240, 240);
      ctx.fillStyle = rgb(mixRGB(sun, [255, 255, 255], 0.5));
      ctx.beginPath();
      ctx.arc(sx, sy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    const mx = W * 0.5 + Math.cos(ang) * W * 0.42;
    const my = H * 0.75 + Math.sin(ang) * H * 0.62;
    if (-Math.sin(ang) > -0.2) {
      ctx.fillStyle = 'rgba(230,230,255,0.85)';
      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath();
      ctx.arc(mx + 5, my - 3, 11, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parallax layers
    const scale = Math.max(1, H / 520);
    const drawLayers = (z: ZoneDef, alpha: number): void => {
      if (alpha <= 0) return;
      const L = this.get(z);
      const dim = 0.35 + 0.65 * day;
      for (let i = 0; i < 3; i++) {
        const f = PARALLAX[i];
        const lw = LAYER_W * scale;
        const off = -((cam.left * cam.zoom * f) % lw) - (cam.left < 0 ? lw : 0);
        const horizonScreen = (horizonWorldY - cam.top) * cam.zoom;
        // Far layers hover near mid-screen; near layers track the real ground line.
        const base = H * 0.5 + (horizonScreen - H * 0.5) * [0.35, 0.6, 0.85][i];
        const y = base - LAYER_H * scale + 6 * scale;
        ctx.globalAlpha = alpha;
        for (let x = off - lw; x < W + lw; x += lw) ctx.drawImage(L[i], Math.floor(x), Math.floor(y), lw, LAYER_H * scale);
        // fill below the layer so it never shows sky underneath
        ctx.fillStyle = i === 2 ? rgb(mixRGB(z.silhouette, [0, 0, 0], 0.2)) : rgb(mixRGB(z.silhouette, z.haze, i === 0 ? 0.62 : 0.35));
        ctx.fillRect(0, Math.floor(y + LAYER_H * scale - 1), W, H);
        ctx.globalAlpha = alpha * (1 - dim) * 0.8;
        ctx.fillStyle = '#05060c';
        ctx.fillRect(0, Math.floor(y), W, H);
      }
      ctx.globalAlpha = 1;
    };
    drawLayers(a, 1);
    if (b) drawLayers(b, blend);

    // Haze
    const haze = b ? mixRGB(a.haze, b.haze, blend) : a.haze;
    const hg = ctx.createLinearGradient(0, H * 0.3, 0, H);
    hg.addColorStop(0, rgb(haze, 0));
    hg.addColorStop(1, rgb(haze, 0.25 * (0.3 + 0.7 * day)));
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
  }

  static horizonFor(surfaceTile: number): number {
    return surfaceTile * TILE;
  }
}
