import { hash2 } from '../render/px/pixels';

/**
 * The windscreen as glass, drawn at the screen's full resolution over the 3D view: a faint green-grey tint, the cab's
 * lamps and the sky reflected in soft streaks, grime gathered at the edges and corners (sand in the dunes, ash in the
 * ash lands, salt in the frost), fine scratches and pitting that catch the light, rain beading and running (the wiper
 * clears its arc), frost creeping in from the frame, the sun's glare and flare when you look into it, and cracks
 * spreading from impacts when the hull is battered.
 */

export interface GlassState {
  time: number;
  /** Zone key (grime and weather colour). */
  zone: string;
  /** Storm 0..1 and whether it rains, snows or blows sand. */
  storm: number;
  weather: 'rain' | 'snow' | 'sand' | 'ash' | 'none';
  /** The sun on the glass (CSS px), if in view. */
  sun: { x: number; y: number } | null;
  /** Wiper angle from its pivot at the foot of the glass (radians, -PI/2 straight up) and whether it's running. */
  wiper: number;
  wiping: boolean;
  /** Hull 0..1 (cracks below a third). */
  hull: number;
  /** A hit just now (0..1): the glass shivers. */
  hit: number;
  /** Speed (m/s): drops run sideways and back at speed. */
  speed: number;
  /** Outside the cab (orbit camera): no glass. */
  outside: boolean;
  /** The security monitor is up: its screen, not the windscreen (static 0..1 while it switches cameras). */
  crt?: { static: number; rect: { x: number; y: number; w: number; h: number } } | null;
  /** Washer running (0..1); how dirty the glass is (0..1) and how misted or frosted over (0..1). */
  wash?: number;
  grime?: number;
  mist?: number;
  /** The cab lights are on: the glass reflects the cab more. */
  cabLights?: boolean;
}

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  life: number;
}

export class Glass {
  readonly canvas = document.createElement('canvas');
  private x = this.canvas.getContext('2d')!;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private base: HTMLCanvasElement | null = null;
  private baseKey = '';
  private drops: Drop[] = [];
  private cracks: { x: number; y: number; seed: number; n: number }[] = [];
  private lastHull = 1;

  constructor() {
    this.canvas.className = 'cabglass';
  }

  resize(w: number, h: number, dpr: number): void {
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.baseKey = '';
  }

  /** The glass's fixed character for a zone: tint, grime, scratches and pits, painted once. */
  private baseFor(zone: string): HTMLCanvasElement {
    const key = `${zone}|${this.canvas.width}|${this.canvas.height}`;
    if (this.base && key === this.baseKey) return this.base;
    this.baseKey = key;
    const W = this.canvas.width, H = this.canvas.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    // Tint, heavier at the top where the glass is thickest.
    const tg = x.createLinearGradient(0, 0, 0, H);
    tg.addColorStop(0, 'rgba(30,50,55,0.22)');
    tg.addColorStop(0.18, 'rgba(30,50,55,0.06)');
    tg.addColorStop(1, 'rgba(30,50,55,0.04)');
    x.fillStyle = tg;
    x.fillRect(0, 0, W, H);
    // Grime creeping in from the frame.
    const grime = zone === 'dunes' || zone === 'pass' ? '150,110,60' : zone === 'ash' || zone === 'scorched' ? '70,66,62' : zone === 'frost' ? '220,230,240' : zone === 'lake' ? '60,80,50' : '110,90,60';
    const d = Math.min(W, H);
    for (const [cx, cy] of [[0, H], [W, H], [0, 0], [W, 0]]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, d * 0.55);
      g.addColorStop(0, `rgba(${grime},${zone === 'frost' ? 0.5 : 0.42})`);
      g.addColorStop(0.35, `rgba(${grime},0.14)`);
      g.addColorStop(1, `rgba(${grime},0)`);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }
    const eg = x.createLinearGradient(0, H, 0, H * 0.7);
    eg.addColorStop(0, `rgba(${grime},0.32)`);
    eg.addColorStop(1, `rgba(${grime},0)`);
    x.fillStyle = eg;
    x.fillRect(0, H * 0.7, W, H * 0.3);
    // Specks of dirt and pits in the glass.
    const n = Math.round((W * H) / 1400);
    for (let i = 0; i < n; i++) {
      const px = hash2(i, 1, 71) * W, py = hash2(i, 2, 71) * H;
      const edge = Math.min(px, W - px, py, H - py) / (d * 0.5);
      if (hash2(i, 3, 71) < edge * 0.9) continue;
      const r = (0.4 + hash2(i, 4, 71) * 1.4) * this.dpr;
      x.fillStyle = hash2(i, 5, 71) > 0.7 ? 'rgba(255,255,255,0.18)' : `rgba(${grime},0.4)`;
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      x.fill();
    }
    // Fine scratches from the wiper and the sand.
    x.lineWidth = 0.6 * this.dpr;
    for (let i = 0; i < 26; i++) {
      const cx = W * 0.5, cy = H;
      const rr = H * (0.25 + hash2(i, 6, 73) * 0.65);
      const a0 = -Math.PI * (0.15 + hash2(i, 7, 73) * 0.7), a1 = a0 - 0.05 - hash2(i, 8, 73) * 0.25;
      x.strokeStyle = `rgba(255,255,255,${0.035 + hash2(i, 9, 73) * 0.05})`;
      x.beginPath();
      x.arc(cx, cy, rr, a1, a0);
      x.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const px = hash2(i, 10, 73) * W, py = hash2(i, 11, 73) * H;
      x.strokeStyle = 'rgba(255,255,255,0.05)';
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (hash2(i, 12, 73) - 0.5) * 60 * this.dpr, py + (hash2(i, 13, 73) - 0.5) * 18 * this.dpr);
      x.stroke();
    }
    // Frost feathers from the frame in the cold.
    if (zone === 'frost') {
      x.strokeStyle = 'rgba(235,245,255,0.35)';
      x.lineWidth = 1 * this.dpr;
      for (let i = 0; i < 220; i++) {
        const side = i % 4;
        let px = side === 0 ? 0 : side === 1 ? W : hash2(i, 14, 75) * W;
        let py = side === 2 ? 0 : side === 3 ? H : hash2(i, 15, 75) * H;
        let a = side === 0 ? 0 : side === 1 ? Math.PI : side === 2 ? Math.PI / 2 : -Math.PI / 2;
        a += (hash2(i, 16, 75) - 0.5) * 1.2;
        const len = (10 + hash2(i, 17, 75) * 50) * this.dpr;
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 5; k++) {
          px += Math.cos(a) * len / 5;
          py += Math.sin(a) * len / 5;
          x.lineTo(px, py);
          a += (hash2(i, k, 77) - 0.5) * 0.9;
        }
        x.stroke();
      }
    }
    this.base = c;
    return c;
  }

  /** The security monitor's screen: a CRT's scanlines, grain and roll, the tube's vignette, static on switching. */
  private drawCRT(s: GlassState, c: { static: number; rect: { x: number; y: number; w: number; h: number } }): void {
    const x = this.x, k = this.dpr;
    const R = { x: c.rect.x * k, y: c.rect.y * k, w: c.rect.w * k, h: c.rect.h * k };
    x.save();
    x.beginPath();
    x.roundRect(R.x, R.y, R.w, R.h, 14 * k);
    x.clip();
    // A green-grey phosphor cast.
    x.fillStyle = 'rgba(40,90,60,0.12)';
    x.fillRect(R.x, R.y, R.w, R.h);
    // Scanlines.
    x.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = R.y; y < R.y + R.h; y += 3 * k) x.fillRect(R.x, y, R.w, 1.2 * k);
    // Grain.
    const n = Math.round((R.w * R.h) / (900 * k * k));
    for (let i = 0; i < n; i++) {
      const px = R.x + hash2(i, Math.floor(s.time * 30), 97) * R.w, py = R.y + hash2(i, Math.floor(s.time * 30), 99) * R.h;
      x.fillStyle = hash2(i, 5, Math.floor(s.time * 30)) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)';
      x.fillRect(px, py, 1.4 * k, 1.4 * k);
    }
    // A slow rolling bar.
    const by = R.y + ((s.time * 0.25) % 1) * R.h;
    const bg = x.createLinearGradient(0, by - 30 * k, 0, by + 30 * k);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = bg;
    x.fillRect(R.x, by - 30 * k, R.w, 60 * k);
    // Static while it switches.
    if (c.static > 0) {
      const m = Math.round((R.w * R.h) / (60 * k * k) * c.static);
      for (let i = 0; i < m; i++) {
        const v = Math.floor(hash2(i, Math.floor(s.time * 60), 101) * 255);
        x.fillStyle = `rgba(${v},${v},${v},${0.8 * c.static})`;
        x.fillRect(R.x + hash2(i, 7, Math.floor(s.time * 60)) * R.w, R.y + hash2(i, 9, Math.floor(s.time * 60)) * R.h, 2 * k, 2 * k);
      }
    }
    // The tube's vignette and curve.
    const vg = x.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, Math.min(R.w, R.h) * 0.35, R.x + R.w / 2, R.y + R.h / 2, Math.max(R.w, R.h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    x.fillStyle = vg;
    x.fillRect(R.x, R.y, R.w, R.h);
    // Glare on the glass of the tube.
    const gl = x.createLinearGradient(R.x, R.y, R.x + R.w * 0.6, R.y + R.h * 0.6);
    gl.addColorStop(0, 'rgba(255,255,255,0.08)');
    gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    x.fillStyle = gl;
    x.fillRect(R.x, R.y, R.w, R.h);
    x.restore();
  }

  draw(s: GlassState, dt: number): void {
    const x = this.x;
    const W = this.canvas.width, H = this.canvas.height, k = this.dpr;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, H);
    if (s.crt) {
      this.drawCRT(s, s.crt);
      return;
    }
    if (s.outside) return;
    x.globalAlpha = Math.min(1, 0.25 + (s.grime ?? 0.4) * 0.9);
    x.drawImage(this.baseFor(s.zone), 0, 0);
    x.globalAlpha = 1;
    if ((s.mist ?? 0) > 0.02) {
      // Mist (or frost) over the glass, thickest round the frame, a clearer patch where the vents blow.
      const m = s.mist!;
      const g = x.createRadialGradient(W / 2, H * 0.62, Math.min(W, H) * 0.12, W / 2, H * 0.62, Math.max(W, H) * 0.72);
      g.addColorStop(0, `rgba(214,222,228,${m * 0.3})`);
      g.addColorStop(0.6, `rgba(214,222,228,${m * 0.62})`);
      g.addColorStop(1, `rgba(222,230,236,${m * 0.85})`);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }
    if (s.cabLights) {
      // Lit from inside: the dash and the cab's lamps reflected, the view a touch washed out.
      const cg = x.createLinearGradient(0, H, 0, 0);
      cg.addColorStop(0, 'rgba(255,190,110,0.16)');
      cg.addColorStop(0.5, 'rgba(255,190,110,0.06)');
      cg.addColorStop(1, 'rgba(255,190,110,0.03)');
      x.fillStyle = cg;
      x.fillRect(0, 0, W, H);
    }
    if ((s.wash ?? 0) > 0) {
      // Washer fluid: jets up the glass, then a sheet running down.
      const wv = s.wash!;
      x.fillStyle = `rgba(200,225,255,${0.18 * wv})`;
      x.fillRect(0, 0, W, H);
      x.strokeStyle = `rgba(220,240,255,${0.5 * wv})`;
      x.lineWidth = 1.5 * k;
      for (let i = 0; i < 40; i++) {
        const px = hash2(i, 1, 95) * W, ph = (s.time * 1.6 + hash2(i, 2, 95)) % 1;
        const py = H * (1 - ph);
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + 2 * k, py + 30 * k);
        x.stroke();
      }
      if (wv > 0.5) this.drops.length = 0;
    }
    // Reflections: two soft bright bands across the panes, and the dash's glow at the bottom.
    x.save();
    x.globalCompositeOperation = 'screen';
    for (const [ox, wd, a] of [[0.14, 0.09, 0.05], [0.56, 0.05, 0.035], [0.83, 0.07, 0.045]]) {
      const g = x.createLinearGradient(W * ox, 0, W * (ox + wd), H * 0.35);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,250,235,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(W * ox, 0);
      x.lineTo(W * (ox + wd), 0);
      x.lineTo(W * (ox + wd - 0.12), H);
      x.lineTo(W * (ox - 0.12), H);
      x.fill();
    }
    const dg = x.createLinearGradient(0, H, 0, H * 0.82);
    dg.addColorStop(0, 'rgba(255,170,60,0.07)');
    dg.addColorStop(1, 'rgba(255,170,60,0)');
    x.fillStyle = dg;
    x.fillRect(0, H * 0.82, W, H * 0.18);
    x.restore();
    // The sun: glare over everything near it, a flare of rings across the glass, the dirt lit up.
    if (s.sun) {
      const sx = s.sun.x * k, sy = s.sun.y * k;
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,248,225,0.55)');
      g.addColorStop(0.08, 'rgba(255,236,190,0.22)');
      g.addColorStop(0.4, 'rgba(255,220,160,0.05)');
      g.addColorStop(1, 'rgba(255,220,160,0)');
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (const [t, r, col] of [[0.4, 18, '255,200,120'], [0.8, 40, '140,200,255'], [1.3, 12, '255,160,90'], [1.7, 64, '180,255,200']] as [number, number, string][]) {
        const fx = sx + (cx - sx) * t, fy = sy + (cy - sy) * t;
        const fg = x.createRadialGradient(fx, fy, 0, fx, fy, r * k);
        fg.addColorStop(0, `rgba(${col},0.12)`);
        fg.addColorStop(0.7, `rgba(${col},0.05)`);
        fg.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = fg;
        x.fillRect(fx - r * k, fy - r * k, r * 2 * k, r * 2 * k);
      }
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = 0.5;
      x.drawImage(this.baseFor(s.zone), 0, 0);
      x.restore();
    }
    // Weather on the glass.
    const wet = s.weather === 'rain' ? s.storm : 0;
    if (wet > 0.05 || this.drops.length) {
      const want = Math.round(wet * 260);
      while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, r: (1 + Math.random() * 3.2) * k, vy: 0, life: 4 + Math.random() * 10 });
      const side = Math.max(-1, Math.min(1, s.speed / 40));
      const wa = s.wiper;
      for (const d of this.drops) {
        d.life -= dt * (wet > 0.05 ? 1 : 4);
        // Big drops run; at speed the wind drags them back and aside.
        if (d.r > 2.6 * k || Math.abs(s.speed) > 12) d.vy = Math.min(90 * k, d.vy + dt * 40 * k);
        d.y += d.vy * dt * (1 - Math.abs(side) * 0.5);
        d.x += side * 30 * k * dt * (d.r / (3 * k));
        // The wiper sweeps them off.
        if (s.wiping) {
          const ang = Math.atan2(d.y - H, d.x - W / 2);
          if (Math.abs(ang - wa) < 0.12 && Math.hypot(d.x - W / 2, d.y - H) < H * 0.9) d.life = 0;
        }
      }
      this.drops = this.drops.filter((d) => d.life > 0 && d.y < H + 10);
      for (const d of this.drops) {
        if (d.vy > 10 * k) {
          x.strokeStyle = 'rgba(200,220,235,0.22)';
          x.lineWidth = d.r * 0.6;
          x.beginPath();
          x.moveTo(d.x, d.y - d.vy * 0.25);
          x.lineTo(d.x, d.y);
          x.stroke();
        }
        const g = x.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.35, 'rgba(210,225,235,0.15)');
        g.addColorStop(0.85, 'rgba(20,30,40,0.25)');
        g.addColorStop(1, 'rgba(20,30,40,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        x.fill();
      }
    }
    if ((s.weather === 'snow' || s.weather === 'sand' || s.weather === 'ash') && s.storm > 0.05) {
      // Flakes or grit hitting the glass: specks that stay a moment.
      const col = s.weather === 'snow' ? '240,245,255' : s.weather === 'sand' ? '210,170,110' : '120,116,110';
      const n = Math.round(s.storm * 180);
      for (let i = 0; i < n; i++) {
        const t = Math.floor(s.time * 6 + hash2(i, 3, 79) * 6);
        const px = hash2(i, t, 81) * W, py = hash2(i, t, 83) * H;
        x.fillStyle = `rgba(${col},${0.25 + hash2(i, t, 85) * 0.4})`;
        x.fillRect(px, py, (1 + hash2(i, t, 87) * 2) * k, (1 + hash2(i, t, 89) * 2) * k);
      }
      if (s.weather === 'sand') {
        x.fillStyle = `rgba(200,150,90,${s.storm * 0.12})`;
        x.fillRect(0, 0, W, H);
      }
    }
    // Cracks: a new star where it gets hit when the hull's low.
    if (s.hull < 0.34 && this.lastHull >= s.hull + 0.02 && this.cracks.length < 6) {
      this.cracks.push({ x: (0.15 + Math.random() * 0.7) * W, y: (0.1 + Math.random() * 0.6) * H, seed: Math.random() * 1000, n: 6 + Math.floor(Math.random() * 6) });
    }
    if (s.hull > 0.6) this.cracks.length = 0;
    this.lastHull = s.hull;
    for (const cr of this.cracks) {
      x.lineWidth = 0.8 * k;
      for (let i = 0; i < cr.n; i++) {
        let a = (i / cr.n) * Math.PI * 2 + hash2(i, cr.seed, 91) * 0.5;
        let px = cr.x, py = cr.y;
        const len = (40 + hash2(i, cr.seed, 93) * 110) * k;
        x.strokeStyle = 'rgba(255,255,255,0.55)';
        x.beginPath();
        x.moveTo(px, py);
        for (let s2 = 0; s2 < 6; s2++) {
          px += (Math.cos(a) * len) / 6;
          py += (Math.sin(a) * len) / 6;
          x.lineTo(px, py);
          a += (hash2(i, s2, cr.seed) - 0.5) * 0.6;
        }
        x.stroke();
      }
      // Rings round the impact.
      x.strokeStyle = 'rgba(255,255,255,0.3)';
      for (const rr of [8, 18]) {
        x.beginPath();
        x.arc(cr.x, cr.y, rr * k, 0, Math.PI * 2);
        x.stroke();
      }
      const g = x.createRadialGradient(cr.x, cr.y, 0, cr.x, cr.y, 10 * k);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(cr.x - 10 * k, cr.y - 10 * k, 20 * k, 20 * k);
    }
    // A hit: the glass flashes pale for a moment.
    if (s.hit > 0) {
      x.fillStyle = `rgba(255,240,220,${s.hit * 0.12})`;
      x.fillRect(0, 0, W, H);
    }
  }
}
