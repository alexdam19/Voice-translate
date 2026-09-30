import type { App } from '../app';
import { ENGINES, ENGINE_MAX, ENGINE_PARTS, engineBlocked, engineCap, engineCost, engineDef, engineReadout, engineWhy, installEngine, upgradeEngine, type EngineKey, type EngineParts, type EnginePart } from '../game/systems/engine';
import { drum, gauge, gear, MAT, paintEngineRoom, plate, wheel } from './engineArt';
import { button, costHTML, esc, h } from './dom';

/**
 * The Engine Workshop, a tab of the shop. At the top, the engine room drawn to scale: whichever power plant you point
 * at, on its bed under the crane, beside a 25 m blue whale. Then the engine catalog (every engine, its size, how long
 * it takes to charge, its speed, thirst, overdrive stages and perks; buy one and the crane swaps it in), the numbers
 * the drive makes now (and what the engine or part under the pointer would change), and a card per component, the
 * engine's own and the running gear, to fit the next mark.
 */
export function renderEngineShop(root: HTMLElement, app: App, rerender: () => void): void {
  const g = app.game;
  const p = g.player;
  const wrap = h('div', 'es');
  const room = document.createElement('canvas');
  room.className = 'es-room';
  room.width = 720;
  room.height = 230;
  const cv = document.createElement('canvas');
  cv.className = 'es-art';
  cv.width = 256;
  cv.height = 124;
  const read = h('div', 'es-read');
  const top = h('div', 'es-top');
  const left = h('div', 'es-left');
  left.append(room, cv);
  top.append(left, read);
  wrap.appendChild(top);
  const cap = engineCap(p.stats.cc);
  const show = (hover: EnginePart | null, eng: EngineKey | null = null): void => {
    const next: EngineParts = { ...p.engine };
    if (hover && next[hover] < ENGINE_MAX) next[hover]++;
    paintEngineRoom(room, eng ?? p.engineKey);
    paintEngine(cv, p.engine, hover);
    const a = engineReadout(p, p.engine);
    const b = hover ? engineReadout(p, next) : eng && eng !== p.engineKey ? engineReadout(p, p.engine, eng) : null;
    const row = (k: string, v: number, w: number | undefined, unit: string, better: 'up' | 'down', dec = 0): string => {
      const f = (n: number): string => n.toFixed(dec);
      const diff = w === undefined || Math.abs(w - v) < 0.05 ? '' : `<i class="${(w > v) === (better === 'up') ? 'good' : 'bad'}">→ ${f(w)}</i>`;
      return `<div class="es-kv"><span>${k}</span><b>${f(v)}<small>${unit}</small></b>${diff}</div>`;
    };
    const cur = engineDef(p.engineKey);
    const vs = eng && eng !== p.engineKey ? `<div class="es-vs">vs ${esc(engineDef(eng).name)}</div>` : '';
    read.innerHTML = `<div class="es-t">DRIVE · ${esc(cur.name.toUpperCase())}</div>${vs}`
      + row('CHARGE-UP', a.charge, b?.charge, ' s', 'down', 1)
      + row('TOP SPEED', a.top, b?.top, ' km/h', 'up')
      + row('0 → CRUISE', a.zeroTo, b?.zeroTo, ' s', 'down', 1)
      + row('OVERDRIVE I', a.od, b?.od, ' km/h', 'up')
      + row(`OVERDRIVE ${['I', 'II', 'III'][Math.max(0, a.stages - 1)]} (TOP)`, a.od3, b?.od3, ' km/h', 'up')
      + row('OD STAGES', a.stages, b?.stages, '', 'up')
      + row('OVERDRIVE FOR', a.odTime, b?.odTime, ' s', 'up')
      + row('FUEL AT FULL', a.burn, b?.burn, ' /min', 'down', 1)
      + row('REACTOR DRAW', a.power, b?.power, ' pwr', 'down');
  };

  // The engine catalog.
  wrap.appendChild(h('div', 'es-h', 'ENGINE ROOM · POWER PLANTS'));
  wrap.appendChild(h('div', 'd', 'Every engine is the size of a whale. The bigger and stronger it is, the longer it takes to charge up (like a locomotive raising steam) and the bigger the flames out of the stern. Buy one and the yard crane swaps it in; engines you own can be swapped back for free. Your components (below) carry over to whichever engine is fitted.'));
  const cat = h('div', 'es-cat');
  for (const d of ENGINES) {
    const owned = p.enginesOwned.includes(d.key);
    const fitted = p.engineKey === d.key;
    const why = engineWhy(g, d.key);
    const locked = !owned && (g.commander.level < d.unlock || p.stats.cc < d.cc);
    const el = h('div', `es-eng ${fitted ? 'fitted' : owned ? 'owned' : locked ? 'locked' : ''}`);
    const chg = Math.min(1, d.charge / 20);
    el.innerHTML = `<div class="es-name">${esc(d.name)} <small>${esc(d.kind)}</small></div>
      <div class="es-dims">${d.len} m · ${d.mass.toLocaleString()} t · ${d.mw} MW · ${d.flame.jets} stacks</div>
      <div class="es-bars">
        <div><span>CHARGE</span><i style="--w:${Math.round(chg * 100)}%"></i><b>${d.charge} s</b></div>
        <div><span>SPEED</span><i style="--w:${Math.round(Math.min(1, d.top / 1.5) * 100)}%"></i><b>${Math.round(d.top * 100)}%</b></div>
        <div><span>FUEL</span><i class="hot" style="--w:${Math.round(Math.min(1, d.fuel / 2) * 100)}%"></i><b>${Math.round(d.fuel * 100)}%</b></div>
        <div><span>OVERDRIVE</span><i style="--w:${Math.round((d.od / 3) * 100)}%"></i><b>${['I', 'I-II', 'I-III'][d.od - 1]}</b></div>
      </div>
      <ul class="es-perks">${d.perks.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      <div class="es-what">${esc(d.desc)}</div>
      ${fitted ? '<div class="es-tag">INSTALLED</div>' : owned ? '<div class="es-tag own">OWNED · swap free</div>' : locked ? `<div class="es-why">Needs Commander L${d.unlock} and Command Center L${d.cc}.</div>` : `<div class="es-cost">${Object.keys(d.cost).length ? costHTML(d.cost, [p.cargo]) : 'Free'}</div>`}`;
    if (!fitted && !locked) {
      const label = why && why !== 'Not enough materials.' ? esc(why) : owned ? 'SWAP IN' : 'BUY & INSTALL';
      el.appendChild(button(label, () => {
        const r = installEngine(g, d.key);
        if (r) {
          app.hud.toast(r, '#ff8a80');
          app.sound('error');
          return;
        }
        rerender();
      }, why ? 'small disabled' : 'small primary'));
    }
    el.addEventListener('mouseenter', () => show(null, d.key));
    el.addEventListener('mouseleave', () => show(null));
    cat.appendChild(el);
  }
  wrap.appendChild(cat);

  // The components, the engine's own and the running gear.
  for (const [grp, title, note] of [
    ['engine', 'ENGINE COMPONENTS', `Bolted to whichever engine is fitted. Bigger parts make her faster but hungrier. Command Center L${p.stats.cc} fits parts up to Mk ${cap}.`],
    ['gear', 'RUNNING GEAR', 'The crawler banks, their tracks, axles and differentials: grip, ride, turning and how hard she shoves.'],
  ] as const) {
    wrap.appendChild(h('div', 'es-h', title));
    wrap.appendChild(h('div', 'd', note));
    const grid = h('div', 'es-parts');
    for (const d of ENGINE_PARTS.filter((k) => k.group === grp)) {
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
  }
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
  // The workshop wall behind the bench: riveted plates, a copper line along it, a gauge.
  const wg = x.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, '#0c1014');
  wg.addColorStop(1, '#171c22');
  x.fillStyle = wg;
  x.fillRect(0, 0, W, H);
  for (let j = 0, row = 0; j < H; j += 24, row++) {
    for (let i = (row % 2) * 18 - 36; i < W; i += 36) {
      x.fillStyle = '#07090c';
      x.fillRect(i, j, 36, 1);
      x.fillRect(i, j, 1, 24);
      x.fillStyle = '#232a33';
      x.fillRect(i + 1, j + 1, 35, 1);
      x.fillStyle = '#34404c';
      x.fillRect(i + 3, j + 3, 1, 1);
      x.fillRect(i + 32, j + 3, 1, 1);
    }
  }
  drum(x, 0, H - 44, W, 4, 'copper', true, false);
  gauge(x, W - 14, H - 56, 6, 0.55);
  // The bench: diamond plate, a brass edge, the hazard stripe.
  x.fillStyle = '#1c2229';
  x.fillRect(0, H - 14, W, 14);
  x.fillStyle = '#2c343e';
  for (let j = H - 11; j < H; j += 4) for (let i = (j >> 2) % 2 ? 2 : 0; i < W; i += 4) x.fillRect(i, j, 2, 1);
  x.fillStyle = MAT.brass[4];
  x.fillRect(0, H - 14, W, 1);
  for (let i = 0; i < W; i += 8) {
    x.fillStyle = (i / 8) % 2 ? C.d0 : C.hazard;
    x.fillRect(i, H - 13, 8, 2);
  }
  const R = (a: number, b: number, w: number, hh: number, c: string): void => {
    x.fillStyle = c;
    x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(hh));
  };
  const out: Partial<Record<EnginePart, [number, number, number, number]>> = {};

  // Radiators (left): a finned grille, wider with every mark, and fans.
  const rw = 18 + e.radiator * 3, rh = 60;
  const rx = 8, ry = H - 14 - rh - 4;
  plate(x, rx, ry, rw, rh, 'brass');
  for (let j = ry + 3; j < ry + rh - 2; j += 3) R(rx + 2, j, rw - 4, 1, MAT.brass[1]);
  const fans = 1 + Math.floor(e.radiator / 3);
  for (let k = 0; k < fans; k++) {
    const fy = ry + 10 + k * ((rh - 20) / Math.max(1, fans - 1 || 1));
    const fr = Math.min(8, rw / 2 - 2);
    x.fillStyle = MAT.iron[1];
    x.beginPath();
    x.arc(rx + rw / 2, fans === 1 ? ry + rh / 2 : fy, fr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = MAT.brass[4];
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
  drum(x, rx + rw, by + bh * 0.4, 8, 3, 'copper', true, false);
  plate(x, bx0, by, bw, bh, 'blued');
  // Cylinder heads.
  const cyl = 4 + e.block;
  const cwid = (bw - 6) / cyl;
  for (let k = 0; k < cyl; k++) {
    const cx = bx0 + 3 + k * cwid;
    plate(x, cx, by - 9, cwid - 2, 9, 'brass', false);
    R(cx + 1, by - 5, cwid - 4, 1, MAT.brass[1]);
  }
  // Stacks.
  const stacks = 2 + Math.floor(e.block / 2);
  for (let k = 0; k < stacks; k++) {
    const sx = bx0 + 8 + k * ((bw - 16) / Math.max(1, stacks - 1));
    drum(x, sx - 2, by - 22, 5, 13, 'copper', false, false);
    R(sx - 3, by - 23, 7, 2, MAT.brass[4]);
    R(sx - 1, by - 22, 3, 1, C.amber);
  }
  // Panel lines, bolts, the number plate and a lit strip.
  for (let k = 1; k < 4; k++) R(bx0 + (bw * k) / 4, by + 3, 1, bh - 6, MAT.blued[0]);
  for (let k = 0; k < 6; k++) R(bx0 + 4 + k * ((bw - 8) / 5), by + bh - 5, 2, 2, MAT.brass[4]);
  plate(x, bx0 + bw / 2 - 9, by + 8, 18, 9, 'brass', false);
  gauge(x, bx0 + bw - 12, by + 14, 5, 0.5 + e.block * 0.04);
  x.fillStyle = MAT.brass[0];
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
    wheel(x, cx, cy, tr, 'copper', 6);
    R(cx - tr - 4, cy - 1, 4, 3, MAT.copper[3]);
  }
  out.turbo = [tx0 - 2, by + 4, tr * 2 + 4, Math.max(1, turbos) * (tr * 2 + 3) + 2];

  // The gearbox at the back: a housing and a big gear, more teeth and bulk each mark.
  const gx0 = tx0 + tr * 2 + 8;
  const gw = 26 + e.gearbox * 2, gh = 30 + e.gearbox * 2;
  const gy = H - 14 - gh - 2;
  drum(x, tx0 + tr * 2, gy + gh / 2, 8, 4, 'steel', true, false);
  plate(x, gx0, gy, gw, gh, 'iron');
  const gcx = gx0 + gw / 2, gcy = gy + gh / 2, gr = Math.min(gw, gh) / 2 - 3;
  R(gx0 + 3, gy + 3, gw - 6, gh - 6, '#0e1014');
  gear(x, gcx, gcy, gr, e.gearbox > 4 ? 'brass' : 'copper');
  if (e.gearbox > 2) gear(x, gcx + gr * 0.8, gcy - gr * 0.7, gr * 0.4, 'steel');
  out.gearbox = [gx0 - 2, gy - 2, gw + 4, gh + 4];

  // The nitro rack up top right: a bottle per mark, blue with red caps, lines down to the intake.
  const nx0 = gx0 - 4, ny0 = 6;
  plate(x, nx0, ny0, 8 * 8 + 4, 26, 'steel');
  for (let k = 0; k < 8; k++) {
    const bx = nx0 + 3 + k * 8;
    if (k < e.nitro) {
      drum(x, bx, ny0 + 6, 6, 17, 'blued', false, false);
      R(bx + 1, ny0 + 7, 1, 15, '#64b5f6');
      R(bx + 1, ny0 + 3, 4, 3, C.red);
      R(bx + 2, ny0 + 2, 2, 1, MAT.brass[4]);
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
