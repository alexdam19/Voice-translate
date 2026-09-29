import type { App } from '../app';
import { ENGINE_MAX, ENGINE_PARTS, engineBlocked, engineCap, engineCost, engineReadout, upgradeEngine, type EngineParts, type EnginePart } from '../game/systems/engine';
import { button, costHTML, esc, h } from './dom';

/**
 * The Engine Workshop, a tab of the shop: the Titan's drive drawn on the bench (its block, turbochargers, gearbox,
 * nitro rack and radiators, each bigger or more numerous as you build it up), the numbers it makes, and a card per
 * part to fit the next mark. Hovering a card previews what the next mark would do to the numbers.
 */
export function renderEngineShop(root: HTMLElement, app: App, rerender: () => void): void {
  const g = app.game;
  const p = g.player;
  const wrap = h('div', 'es');
  const cv = document.createElement('canvas');
  cv.className = 'es-art';
  cv.width = 256;
  cv.height = 124;
  const read = h('div', 'es-read');
  const top = h('div', 'es-top');
  top.append(cv, read);
  wrap.appendChild(top);
  const cap = engineCap(p.stats.cc);
  wrap.appendChild(h('div', 'd', `Bigger parts make her faster but hungrier. She is always slow off the mark and quick once rolling. Command Center L${p.stats.cc} fits parts up to Mk ${cap}.`));
  const show = (hover: EnginePart | null): void => {
    const next: EngineParts = { ...p.engine };
    if (hover && next[hover] < ENGINE_MAX) next[hover]++;
    paintEngine(cv, p.engine, hover);
    const a = engineReadout(p, p.engine);
    const b = hover ? engineReadout(p, next) : null;
    const row = (k: string, v: number, w: number | undefined, unit: string, better: 'up' | 'down', dec = 0): string => {
      const f = (n: number): string => n.toFixed(dec);
      const diff = w === undefined || Math.abs(w - v) < 0.05 ? '' : `<i class="${(w > v) === (better === 'up') ? 'good' : 'bad'}">→ ${f(w)}</i>`;
      return `<div class="es-kv"><span>${k}</span><b>${f(v)}<small>${unit}</small></b>${diff}</div>`;
    };
    read.innerHTML = `<div class="es-t">DRIVE</div>`
      + row('TOP SPEED', a.top, b?.top, ' km/h', 'up')
      + row('0 → CRUISE', a.zeroTo, b?.zeroTo, ' s', 'down', 1)
      + row('OVERDRIVE', a.od, b?.od, ' km/h', 'up')
      + row('OVERDRIVE FOR', a.odTime, b?.odTime, ' s', 'up')
      + row('FUEL AT FULL', a.burn, b?.burn, ' /min', 'down', 1)
      + row('REACTOR DRAW', a.power, b?.power, ' pwr', 'down');
  };
  const grid = h('div', 'es-parts');
  for (const d of ENGINE_PARTS) {
    const lvl = p.engine[d.key];
    const why = engineBlocked(g, d.key);
    const maxed = lvl >= ENGINE_MAX;
    const el = h('div', `es-part ${maxed ? 'max' : why ? 'blocked' : ''}`);
    const pips = Array.from({ length: ENGINE_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : i < cap ? '' : 'lock'}"></i>`).join('');
    el.innerHTML = `<div class="es-name"><span>${d.icon}</span> ${esc(d.name)} <small>Mk ${lvl}</small></div>
      <div class="es-stat">${esc(d.stat)}</div>
      <div class="es-pips">${pips}</div>
      <div class="es-what">${esc(d.what)}</div>
      <div class="es-per">${esc(d.per)} per mark</div>
      ${maxed ? '<div class="es-why">Fully built.</div>' : `<div class="es-cost">${costHTML(engineCost(d.key, lvl), [p.cargo])}</div>`}`;
    if (!maxed) {
      const b = button(why && why !== 'Not enough materials.' ? esc(why) : `FIT MK ${lvl + 1}`, () => {
        const r = upgradeEngine(g, d.key);
        if (r) {
          app.hud.toast(r, '#ff8a80');
          app.sound('error');
          return;
        }
        rerender();
      }, why ? 'small disabled' : 'small primary');
      el.appendChild(b);
    }
    el.addEventListener('mouseenter', () => show(d.key));
    el.addEventListener('mouseleave', () => show(null));
    grid.appendChild(el);
  }
  wrap.appendChild(grid);
  root.appendChild(wrap);
  show(null);
}

/* ---------------------------------------------------------------------- */
/* The engine on the bench                                                 */
/* ---------------------------------------------------------------------- */

const C = {
  bg: '#0d1015', grid: '#151a21', d0: '#07090c', d1: '#12161c', d2: '#1c222b', d3: '#2a313c', d4: '#3a4350', d5: '#4f5a6b', d6: '#6b788c', hi: '#9aa8bc',
  blue: '#3ab4ff', blueHi: '#b8e8ff', copper: '#c87a3a', copperHi: '#f0a868', red: '#ff3d2e', amber: '#ffb13a', hazard: '#e0b020',
};

/** Draws the engine (block, turbos, gearbox, nitro rack, radiators) at its current marks; `hl` outlines one part. */
export function paintEngine(cv: HTMLCanvasElement, e: EngineParts, hl: EnginePart | null): void {
  const x = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  x.imageSmoothingEnabled = false;
  x.fillStyle = C.bg;
  x.fillRect(0, 0, W, H);
  x.fillStyle = C.grid;
  for (let i = 0; i < W; i += 8) x.fillRect(i, 0, 1, H);
  for (let j = 0; j < H; j += 8) x.fillRect(0, j, W, 1);
  // The bench and its hazard edge.
  x.fillStyle = C.d2;
  x.fillRect(0, H - 14, W, 14);
  for (let i = 0; i < W; i += 8) {
    x.fillStyle = (i / 8) % 2 ? C.d0 : C.hazard;
    x.fillRect(i, H - 14, 8, 2);
  }
  const R = (a: number, b: number, w: number, hh: number, c: string): void => {
    x.fillStyle = c;
    x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(hh));
  };
  const box = (a: number, b: number, w: number, hh: number, face: string): void => {
    R(a - 1, b - 1, w + 2, hh + 2, C.d0);
    R(a, b, w, hh, face);
    R(a, b, w, 1, C.d6);
    R(a, b, 1, hh, C.d5);
    R(a, b + hh - 1, w, 1, C.d1);
  };
  const out: Partial<Record<EnginePart, [number, number, number, number]>> = {};

  // Radiators (left): a finned grille, wider with every mark, and fans.
  const rw = 18 + e.radiator * 3, rh = 60;
  const rx = 8, ry = H - 14 - rh - 4;
  box(rx, ry, rw, rh, C.d2);
  for (let j = ry + 3; j < ry + rh - 2; j += 3) R(rx + 2, j, rw - 4, 1, C.d5);
  const fans = 1 + Math.floor(e.radiator / 3);
  for (let k = 0; k < fans; k++) {
    const fy = ry + 10 + k * ((rh - 20) / Math.max(1, fans - 1 || 1));
    const fr = Math.min(8, rw / 2 - 2);
    x.fillStyle = C.d1;
    x.beginPath();
    x.arc(rx + rw / 2, fans === 1 ? ry + rh / 2 : fy, fr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = C.d6;
    x.lineWidth = 1;
    for (let b = 0; b < 4; b++) {
      const a = b * (Math.PI / 2) + k;
      x.beginPath();
      x.moveTo(rx + rw / 2, fans === 1 ? ry + rh / 2 : fy);
      x.lineTo(rx + rw / 2 + Math.cos(a) * (fr - 1), (fans === 1 ? ry + rh / 2 : fy) + Math.sin(a) * (fr - 1));
      x.stroke();
    }
  }
  out.radiator = [rx - 2, ry - 2, rw + 4, rh + 4];
  // Coolant pipes to the block.
  const bx0 = rx + rw + 8;

  // The block: longer and taller with displacement, a row of cylinders on top, exhaust stacks.
  const bw = 70 + e.block * 6, bh = 40 + e.block * 2.5;
  const by = H - 14 - bh - 2;
  R(rx + rw, by + bh * 0.4, 8, 3, C.copper);
  R(rx + rw, by + bh * 0.4, 8, 1, C.copperHi);
  box(bx0, by, bw, bh, C.d3);
  // Cylinder heads.
  const cyl = 4 + e.block;
  const cwid = (bw - 6) / cyl;
  for (let k = 0; k < cyl; k++) {
    const cx = bx0 + 3 + k * cwid;
    box(cx, by - 9, cwid - 2, 9, C.d4);
    R(cx + 1, by - 6, cwid - 4, 1, C.d2);
  }
  // Stacks.
  const stacks = 2 + Math.floor(e.block / 2);
  for (let k = 0; k < stacks; k++) {
    const sx = bx0 + 8 + k * ((bw - 16) / Math.max(1, stacks - 1));
    box(sx - 2, by - 22, 5, 13, C.d2);
    R(sx - 1, by - 22, 3, 2, C.amber);
  }
  // Panel lines, bolts, the number plate and a lit strip.
  for (let k = 1; k < 4; k++) R(bx0 + (bw * k) / 4, by + 3, 1, bh - 6, C.d1);
  for (let k = 0; k < 6; k++) R(bx0 + 4 + k * ((bw - 8) / 5), by + bh - 5, 2, 2, C.d6);
  box(bx0 + bw / 2 - 9, by + 8, 18, 9, C.d1);
  x.fillStyle = C.hi;
  x.font = '7px monospace';
  x.fillText('07', bx0 + bw / 2 - 5, by + 15);
  R(bx0 + 4, by + bh * 0.62, bw - 8, 1, C.blue);
  out.block = [bx0 - 2, by - 24, bw + 4, bh + 26];

  // Turbochargers bolted to the block's side: snail shells, one more every few marks.
  const tx0 = bx0 + bw + 4;
  const turbos = e.turbo ? 1 + Math.floor(e.turbo / 3) : 0;
  const tr = 7 + Math.min(5, e.turbo * 0.6);
  for (let k = 0; k < Math.max(1, turbos); k++) {
    const cx = tx0 + tr, cy = by + 6 + tr + k * (tr * 2 + 3);
    if (!turbos) {
      // An empty mount.
      x.strokeStyle = C.d5;
      x.setLineDash([2, 2]);
      x.strokeRect(cx - tr, cy - tr, tr * 2, tr * 2);
      x.setLineDash([]);
      continue;
    }
    x.fillStyle = C.d0;
    x.beginPath();
    x.arc(cx, cy, tr + 1, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = C.d4;
    x.beginPath();
    x.arc(cx, cy, tr, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = C.d1;
    x.beginPath();
    x.arc(cx, cy, tr * 0.55, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = C.hi;
    for (let b = 0; b < 6; b++) {
      const a = b * (Math.PI / 3);
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a) * tr * 0.5, cy + Math.sin(a) * tr * 0.5);
      x.stroke();
    }
    R(cx - tr - 4, cy - 1, 4, 3, C.copper);
  }
  out.turbo = [tx0 - 2, by + 4, tr * 2 + 4, Math.max(1, turbos) * (tr * 2 + 3) + 2];

  // The gearbox at the back: a housing and a big gear, more teeth and bulk each mark.
  const gx0 = tx0 + tr * 2 + 8;
  const gw = 26 + e.gearbox * 2, gh = 30 + e.gearbox * 2;
  const gy = H - 14 - gh - 2;
  R(tx0 + tr * 2, gy + gh / 2, 8, 4, C.d4);
  box(gx0, gy, gw, gh, C.d3);
  const gcx = gx0 + gw / 2, gcy = gy + gh / 2, gr = Math.min(gw, gh) / 2 - 3;
  const teeth = 10 + e.gearbox * 2;
  x.fillStyle = C.d6;
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2;
    x.fillRect(Math.round(gcx + Math.cos(a) * gr - 1), Math.round(gcy + Math.sin(a) * gr - 1), 2, 2);
  }
  x.fillStyle = C.d5;
  x.beginPath();
  x.arc(gcx, gcy, gr - 1.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = C.d1;
  x.beginPath();
  x.arc(gcx, gcy, gr * 0.35, 0, Math.PI * 2);
  x.fill();
  R(gcx - 1, gcy - 1, 2, 2, C.blue);
  out.gearbox = [gx0 - 2, gy - 2, gw + 4, gh + 4];

  // The nitro rack up top right: a bottle per mark, blue with red caps, lines down to the intake.
  const nx0 = gx0 - 4, ny0 = 6;
  box(nx0, ny0, 8 * 8 + 4, 26, C.d1);
  for (let k = 0; k < 8; k++) {
    const bx = nx0 + 3 + k * 8;
    if (k < e.nitro) {
      R(bx, ny0 + 6, 6, 17, '#1565c0');
      R(bx + 1, ny0 + 7, 1, 15, '#64b5f6');
      R(bx + 1, ny0 + 3, 4, 3, C.red);
    } else {
      R(bx, ny0 + 6, 6, 17, C.d2);
      R(bx, ny0 + 22, 6, 1, C.d4);
    }
  }
  if (e.nitro) {
    x.strokeStyle = '#1e88e5';
    x.beginPath();
    x.moveTo(nx0 + 4, ny0 + 26);
    x.lineTo(nx0 + 4, by - 12);
    x.lineTo(bx0 + bw - 6, by - 12);
    x.stroke();
  }
  out.nitro = [nx0 - 2, ny0 - 2, 8 * 8 + 8, 30];

  // The highlighted part: a blue frame and its name.
  if (hl && out[hl]) {
    const [a, b, w, hh] = out[hl]!;
    x.strokeStyle = C.blue;
    x.lineWidth = 1;
    x.strokeRect(Math.round(a) + 0.5, Math.round(b) + 0.5, Math.round(w), Math.round(hh));
    x.fillStyle = C.blueHi;
    x.font = '8px monospace';
    const name = ENGINE_PARTS.find((d) => d.key === hl)!.name.toUpperCase();
    x.fillText(name, Math.max(2, Math.min(W - name.length * 5 - 2, a)), Math.max(9, b - 2));
  }
}
