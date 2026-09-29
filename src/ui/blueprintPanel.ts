import { TER, TERRAIN, TRACTION } from '../shared/map';
import { WEAPONS } from '../shared/weapons';
import { assess, coverage, mountDps, rating } from '../game/analysis';
import { batteryLocal, chassisForCC, DRIVE_INFO, MODULES, TITAN_DECK_INFO } from '../game/defs';
import { TOROIDS } from '../game/systems/titan';
import { hullCells, traceBlueprint } from '../render/px/blueprintArt';
import { shipArtFor, shipView, TOP_PX } from '../render/px/shipArt';
import { TOROID_SHEET } from '../render/px/toroids';
import type { Game } from '../game/game';
import type { Tank } from '../game/tank';
import { button, clickWord, esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * The blueprint: a technical drawing of the whole fortress (top view and side profile) with every building
 * and weapon mount, plus an analysis of what it can do and where it's weak.
 */

const INK = '#d8f1ff';
const FAINT = 'rgba(160, 215, 255, 0.28)';
const PAPER = '#0c2f52';

let selected = 0;
/** Which deck the top view shows (0 roof .. 7 engineering). */
let bpDeck = 0;
const cellCache = new Map<string, boolean[][]>();

export function renderBlueprint(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const s = p.stats;
  const wrap = h('div', 'bp-wrap');
  const sheet = h('div', 'bp-sheet');
  // A Titan's drawing is traced from its own art; the tabs pick which deck's plan is laid over it.
  const titan = p.fortress && !!shipArtFor(p.kind, null, false);
  if (titan) {
    const tabs = h('div', 'bp-decks');
    TITAN_DECK_INFO.forEach((d, i) => {
      if (i > 0 && !p.deckOpen(i)) return;
      const b = h('button', `bp-dk ${i === bpDeck ? 'on' : ''}`, `${d.level === 'Roof' ? 'ROOF' : d.level} <small>${d.name}</small>`);
      b.style.setProperty('--dc', d.color);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        bpDeck = i;
        selected = 0;
        ctx.rerender();
      });
      tabs.appendChild(b);
    });
    sheet.appendChild(tabs);
  }
  const top = h('canvas', 'bp-top');
  const side = h('canvas', 'bp-side');
  sheet.append(top, side);
  const info = h('div', 'bp-info');
  wrap.append(sheet, info);
  ctx.body.appendChild(wrap);
  // Size the drawing to the panel.
  const avail = Math.max(260, Math.min(sheet.clientWidth || 520, 640));
  const L = s.length, W = s.width;
  const scale = titan
    ? Math.min((avail - 90) / (W * 1.25), ((window.innerHeight * 0.66) - 90) / (L * 1.1))
    : Math.min((avail - 60) / (W + 6), ((window.innerHeight * 0.62) - 30) / (L + 6));
  top.width = titan ? Math.round(W * 1.25 * scale + 90) : Math.round((W + 8) * scale + 40);
  top.height = titan ? Math.round(L * 1.1 * scale + 80) : Math.round((L + 6) * scale + 40);
  side.width = titan ? Math.max(top.width, 360) : top.width;
  side.height = Math.round(side.width * (titan ? 0.36 : 0.3));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [top, side]) {
    c.style.width = `${c.width}px`;
    c.style.height = `${c.height}px`;
    c.width *= dpr;
    c.height *= dpr;
  }
  const tc = top.getContext('2d')!;
  tc.scale(dpr, dpr);
  const hit = titan ? drawTopTitan(tc, p, g, scale, top.width / dpr, top.height / dpr) : drawTop(tc, p, scale, top.width / dpr, top.height / dpr);
  const scx = side.getContext('2d')!;
  scx.scale(dpr, dpr);
  if (titan) drawSideTitan(scx, p, side.width / dpr, side.height / dpr);
  else drawSide(scx, p, side.width / dpr, side.height / dpr);
  top.addEventListener('click', (e) => {
    const r = top.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const m = hit.find((k) => x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1);
    selected = m ? m.id : 0;
    ctx.rerender();
  });
  // Analysis
  const ch = chassisForCC(s.cc);
  const cells = p.cols * p.rows;
  const used = p.modules.reduce((a, m) => a + MODULES[m.key].w * MODULES[m.key].h, 0);
  const dps = p.weapons().reduce((a, m) => a + mountDps(m), 0);
  const sel = selected ? p.moduleById(selected) : undefined;
  if (sel) {
    const d = MODULES[sel.key];
    const w = sel.weapon;
    info.appendChild(h('div', 'bp-card', `<div class="bp-h">${esc(d.name)} <small>L${sel.lvl}${sel.built ? '' : ' · building'}</small></div><div class="d">${esc(d.desc)}</div>${w && sel.stats ? `<div>${esc(WEAPONS[w.key].name)} ${'★'.repeat(w.rarity + 1)} · ${Math.round(mountDps(sel))} DPS · range ${Math.round(sel.stats.range)}</div>` : ''}<div class="d">Deck cells ${sel.cx},${sel.cy} · ${d.w}×${d.h}</div>`));
    info.lastElementChild!.appendChild(button('Open in base', () => {
      ctx.app.panels.close();
      ctx.app.setVillage(true);
      ctx.app.villageUI.select(sel.id);
    }, 'small'));
  } else info.appendChild(h('div', 'd', `${clickWord(true)} a building on the drawing for its details.`));
  const cov = coverage(p);
  const rose = h('canvas', 'bp-rose');
  rose.width = rose.height = 128 * dpr;
  rose.style.width = rose.style.height = '128px';
  const rc = rose.getContext('2d')!;
  rc.scale(dpr, dpr);
  drawRose(rc, cov);
  const sec = (title: string, rows: [string, string][]): HTMLElement => h('div', 'bp-sec', `<div class="bp-h">${title}</div>${rows.map(([k, v]) => `<div class="bp-row"><span>${k}</span><b>${v}</b></div>`).join('')}`);
  info.appendChild(h('div', 'bp-rating', `COMBAT RATING <b>${rating(g)}</b>`));
  info.appendChild(sec('HULL', [
    ['Class', `${esc(ch.name)} (Command Center L${s.cc})`],
    ['Size', `${s.length.toFixed(0)} × ${s.width.toFixed(0)} · deck ${p.cols}×${p.rows}`],
    ['Deck used', `${used}/${cells} cells (${Math.round((used / cells) * 100)}%)`],
    ['Hull / armor', `${s.maxHp} · ${Math.round(s.armor * 100)}%`],
    ['Shield', s.shield ? `${s.shield} (+${Math.round(s.shieldRegen)}/s)` : 'none'],
    ['Repairs', `${s.repair.toFixed(1)}/s`],
  ]));
  const fire = h('div', 'bp-sec');
  fire.innerHTML = `<div class="bp-h">FIREPOWER · ${Math.round(dps)} DPS</div>`;
  const fr = h('div', 'bp-fire');
  fr.appendChild(rose);
  const list = p.weapons().sort((a, b) => mountDps(b) - mountDps(a)).map((m) => `<div class="bp-row"><span>${esc(WEAPONS[m.weapon!.key].name)} <small>${'★'.repeat(m.weapon!.rarity + 1)}</small></span><b>${Math.round(mountDps(m))} · r${Math.round(m.stats?.range ?? 0)}</b></div>`).join('');
  fr.appendChild(h('div', 'bp-wl', list || '<div class="d">No weapons mounted.</div>'));
  fire.appendChild(fr);
  info.appendChild(fire);
  info.appendChild(sec('DRIVE', [
    ['Engines', `thrust ${Math.round(s.thrust)} for mass ${Math.round(s.mass)}`],
    ['Top speed', `${s.topSpeed.toFixed(1)} · ${esc(DRIVE_INFO[p.drive].name)}${g.autoDrive ? ' (AUTO)' : ''}`],
  ]));
  const terr: [number, string][] = [[TER.ROAD, 'Road'], [TER.RUST, 'Rust'], [TER.SAND, 'Sand'], [TER.DUNE, 'Dunes'], [TER.SNOW, 'Snow'], [TER.ICE, 'Ice'], [TER.MUD, 'Mud'], [TER.LAVA, 'Lava'], [TER.ACID, 'Acid']];
  const here = g.map.terAt(p.x, p.y);
  const bars = terr.map(([t, n]) => {
    const v = TRACTION[p.drive][t] || 0.35;
    const hurt = (t === TER.LAVA && p.drive !== 'magma' && p.drive !== 'hover') || (t === TER.ACID && p.drive !== 'hover');
    return `<div class="bp-tr ${t === here ? 'here' : ''}"><span>${n}</span><div class="bp-bar"><div style="width:${Math.min(100, v * 83)}%;background:${hurt ? '#ff5252' : v >= 0.9 ? '#69f0ae' : v >= 0.6 ? '#ffd740' : '#ff9100'}"></div></div><b>${(s.topSpeed * (TRACTION[p.drive][t] || 0.35)).toFixed(1)}${hurt ? ' ☠' : ''}</b></div>`;
  }).join('');
  info.lastElementChild!.insertAdjacentHTML('beforeend', `<div class="bp-terr">${bars}</div><div class="d">Speed on each ground with the current drive train. ☠ = the hull burns or corrodes there. Now on: ${esc(TERRAIN[here]?.name ?? '')}.</div>`);
  info.appendChild(sec('CREW & CARGO', [
    ['Crew', `${g.mainCrew().length} / ${s.crewCap}`],
    ['Cargo', `${p.cargo.stacks().length} / ${s.cargo} slots`],
    ['Vision / radar', `${Math.round(s.vision)} / ${Math.round(s.radar) || '—'}`],
    ['Drill', `tier ${s.drill}`],
  ]));
  const ass = h('div', 'bp-sec');
  ass.innerHTML = `<div class="bp-h">ASSESSMENT</div>${assess(g).map((k) => `<div class="bp-f ${k.good ? 'good' : 'bad'}">${k.good ? '✔' : '⚠'} ${esc(k.text)}</div>`).join('')}`;
  info.appendChild(ass);
}

function drawGrid(c: CanvasRenderingContext2D, w: number, hgt: number): void {
  c.fillStyle = PAPER;
  c.fillRect(0, 0, w, hgt);
  c.strokeStyle = 'rgba(120, 190, 255, 0.12)';
  c.lineWidth = 1;
  for (let x = 0; x < w; x += 12) {
    c.beginPath();
    c.moveTo(x + 0.5, 0);
    c.lineTo(x + 0.5, hgt);
    c.stroke();
  }
  for (let y = 0; y < hgt; y += 12) {
    c.beginPath();
    c.moveTo(0, y + 0.5);
    c.lineTo(w, y + 0.5);
    c.stroke();
  }
  c.strokeStyle = 'rgba(160, 215, 255, 0.5)';
  c.strokeRect(4.5, 4.5, w - 9, hgt - 9);
}

type HitBox = { id: number; x0: number; y0: number; x1: number; y1: number };

/**
 * A Titan from above, bow up, traced from its own top-view art (so the outline, sponsons, turret barbette and
 * engine pods are exactly the ship's), with the chosen deck's plan laid over it: the cells that lie inside the
 * hull, every building on that deck, the main batteries, the four toroids and the eight crawlers, and dimensions.
 */
function drawTopTitan(c: CanvasRenderingContext2D, t: Tank, g: Game, k: number, w: number, hgt: number): HitBox[] {
  drawGrid(c, w, hgt);
  const art = shipArtFor(t.kind, null, false)!;
  const L = t.stats.length, W = t.stats.width;
  const kx = (L * TOP_PX.over) / TOP_PX.w, ky = (W * TOP_PX.wide) / TOP_PX.h;
  const cx = w / 2, cy = hgt / 2 + 8;
  // Hull metres (forward, starboard) to the drawing, bow up.
  const X = (lz: number): number => cx + lz * k;
  const Y = (lx: number): number => cy - lx * k;
  // The tracing.
  const tr = traceBlueprint(art.top);
  c.save();
  c.translate(cx, cy);
  c.rotate(-Math.PI / 2);
  c.imageSmoothingEnabled = true;
  c.drawImage(tr, -TOP_PX.cx * kx * k, -TOP_PX.cy * ky * k, TOP_PX.w * kx * k, TOP_PX.h * ky * k);
  c.restore();
  // The deck plan: the cells inside the hull's real outline.
  const key = `${t.kind}|${L}|${W}|${t.cols}|${t.rows}`;
  let cells = cellCache.get(key);
  if (!cells) {
    cells = hullCells(art.top, L, W, t.cols, t.rows, t.cell);
    cellCache.set(key, cells);
  }
  const dcol = TITAN_DECK_INFO[bpDeck]?.color ?? INK;
  c.strokeStyle = 'rgba(160, 215, 255, 0.16)';
  c.lineWidth = 1;
  for (let r = 0; r < t.rows; r++) {
    for (let q = 0; q < t.cols; q++) {
      if (!cells[r]?.[q]) continue;
      const lx0 = (t.rows / 2 - r) * t.cell, lz0 = (q - t.cols / 2) * t.cell;
      c.strokeRect(Math.round(X(lz0)) + 0.5, Math.round(Y(lx0)) + 0.5, Math.round(t.cell * k), Math.round(t.cell * k));
    }
  }
  const hits: HitBox[] = [];
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const m of t.modules) {
    if (m.deck !== bpDeck) continue;
    const d = MODULES[m.key];
    const on = m.id === selected;
    if (m.key === 'main_gun') {
      const [lx, lz] = batteryLocal(L, W, m.cy > t.rows / 2);
      const r = W * 0.13 * k * (m.cy > t.rows / 2 ? 0.72 : 1);
      c.strokeStyle = on ? '#ffd740' : '#ff9e80';
      c.lineWidth = on ? 2 : 1.5;
      c.beginPath();
      c.arc(X(lz), Y(lx), r, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(X(lz) - 3, Y(lx));
      c.lineTo(X(lz) - 3, Y(lx) - r * 2.6);
      c.moveTo(X(lz) + 3, Y(lx));
      c.lineTo(X(lz) + 3, Y(lx) - r * 2.6);
      c.stroke();
      c.font = '9px Silkscreen, monospace';
      c.fillStyle = on ? '#ffe57f' : '#ffccbc';
      c.fillText('MAIN BATTERY', X(lz), Y(lx) + r + 8);
      hits.push({ id: m.id, x0: X(lz) - r, y0: Y(lx) - r, x1: X(lz) + r, y1: Y(lx) + r });
      continue;
    }
    const lxTop = (t.rows / 2 - m.cy) * t.cell, lzL = (m.cx - t.cols / 2) * t.cell;
    const mx = X(lzL) + 1, my = Y(lxTop) + 1, mw = d.w * t.cell * k - 2, mh = d.h * t.cell * k - 2;
    c.fillStyle = on ? 'rgba(255, 215, 64, 0.28)' : d.hardpoint ? 'rgba(255, 110, 64, 0.2)' : `${dcol}2a`;
    c.fillRect(mx, my, mw, mh);
    c.strokeStyle = on ? '#ffd740' : d.hardpoint ? '#ff9e80' : dcol;
    c.lineWidth = on ? 2 : 1;
    c.setLineDash(m.built ? [] : [3, 3]);
    c.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    c.setLineDash([]);
    if (d.hardpoint) {
      const r = Math.min(mw, mh) * 0.3;
      c.beginPath();
      c.arc(mx + mw / 2, my + mh / 2, r, 0, Math.PI * 2);
      c.stroke();
    }
    const fs = Math.max(7, Math.min(9, t.cell * k * 0.5));
    c.font = `${fs}px Silkscreen, monospace`;
    c.fillStyle = on ? '#ffe57f' : INK;
    const label = mw >= 40 ? d.name : d.name.split(' ').map((s) => s[0]).join('');
    if (mw >= 12 && mh >= 9) c.fillText(label.slice(0, Math.max(2, Math.floor(mw / (fs * 0.62)))), mx + mw / 2, my + mh / 2);
    hits.push({ id: m.id, x0: mx, y0: my, x1: mx + mw, y1: my + mh });
  }
  // The toroids, with their state.
  c.font = '9px Silkscreen, monospace';
  TOROIDS.forEach((tor, i) => {
    const [px, py] = TOROID_SHEET[i];
    const lx = (px - TOP_PX.cx) * kx, lz = (py - TOP_PX.cy) * ky;
    const hp = t === g.player ? g.titan.toroids[i] : 1;
    const col = hp > 0.8 ? '#18ffff' : hp > 0.35 ? '#ffd740' : '#ff5252';
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(X(lz), Y(lx), 14 * kx * k, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(X(lz), Y(lx), 7 * kx * k, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = col;
    c.fillText(tor.short, X(lz) + (lz < 0 ? -1 : 1) * (14 * kx * k + 12), Y(lx));
  });
  // Crawlers along each side.
  c.fillStyle = FAINT;
  for (let i = 0; i < 4; i++) {
    const lx = L * (0.36 - i * 0.24);
    const hp = t === g.player ? [g.titan.crawlers[i], g.titan.crawlers[4 + i]] : [1, 1];
    for (const s of [0, 1]) {
      c.fillStyle = hp[s] > 0.6 ? 'rgba(160,215,255,0.6)' : hp[s] > 0.1 ? '#ffd740' : '#ff5252';
      c.fillText(`${s ? 'R' : 'L'}${i + 1}`, X((s ? 1 : -1) * (W / 2 + 7)), Y(lx));
    }
  }
  // Dimensions.
  c.strokeStyle = FAINT;
  c.fillStyle = INK;
  c.font = '9px Silkscreen, monospace';
  const yb = Y(-L * 0.54) + 14;
  c.beginPath();
  c.moveTo(X(-W / 2), yb);
  c.lineTo(X(W / 2), yb);
  c.moveTo(X(-W / 2), yb - 4);
  c.lineTo(X(-W / 2), yb + 4);
  c.moveTo(X(W / 2), yb - 4);
  c.lineTo(X(W / 2), yb + 4);
  c.stroke();
  c.fillText(`${W.toFixed(0)} m`, cx, yb + 9);
  const xr = X(W / 2) + 34;
  c.beginPath();
  c.moveTo(xr, Y(L / 2));
  c.lineTo(xr, Y(-L / 2));
  c.stroke();
  c.save();
  c.translate(xr + 9, cy);
  c.rotate(Math.PI / 2);
  c.fillText(`${L.toFixed(0)} m`, 0, 0);
  c.restore();
  c.fillStyle = dcol;
  c.fillText(`▲ BOW · ${TITAN_DECK_INFO[bpDeck]?.name.toUpperCase() ?? ''} DECK`, cx, 16);
  return hits;
}

/** A Titan side on, traced from its side-view art (bow to the left, as drawn), with the decks marked. */
function drawSideTitan(c: CanvasRenderingContext2D, t: Tank, w: number, hgt: number): void {
  drawGrid(c, w, hgt);
  const img = shipView('side', t.kind);
  if (!img) return;
  const tr = traceBlueprint(img);
  const k = Math.min((w - 40) / img.width, (hgt - 30) / img.height);
  const dw = img.width * k, dh = img.height * k;
  const x0 = (w - dw) / 2, y0 = (hgt - dh) / 2 + 6;
  c.imageSmoothingEnabled = true;
  c.drawImage(tr, x0, y0, dw, dh);
  // The deck lines through the hull (roof to the bottom of Engineering).
  c.font = '8px Silkscreen, monospace';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const y = y0 + dh * (0.14 + i * 0.1);
    c.strokeStyle = i === bpDeck ? (TITAN_DECK_INFO[i]?.color ?? INK) : 'rgba(160,215,255,0.18)';
    c.lineWidth = i === bpDeck ? 1.5 : 1;
    c.setLineDash(i === bpDeck ? [] : [2, 3]);
    c.beginPath();
    c.moveTo(x0 + dw * 0.06, y);
    c.lineTo(x0 + dw * 0.96, y);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = i === bpDeck ? (TITAN_DECK_INFO[i]?.color ?? INK) : FAINT;
    c.fillText(TITAN_DECK_INFO[i]?.level ?? '', x0 + dw * 0.05, y);
  }
  c.textAlign = 'left';
  c.fillStyle = INK;
  c.fillText('◀ BOW · SIDE', 10, 12);
}

/** Top view, front up. Returns the clickable rectangles of the buildings. */
function drawTop(c: CanvasRenderingContext2D, t: Tank, k: number, w: number, hgt: number): { id: number; x0: number; y0: number; x1: number; y1: number }[] {
  drawGrid(c, w, hgt);
  const cx = w / 2, cy = hgt / 2 + 6;
  const cols = t.cols, rows = t.rows;
  const deckW = cols * k, deckL = rows * k;
  const x0 = cx - deckW / 2, y0 = cy - deckL / 2;
  c.lineWidth = 1.5;
  c.strokeStyle = INK;
  // Tracks: three bands a side.
  for (const s of [-1, 1]) {
    for (let b = 0; b < 3; b++) {
      const bx = s < 0 ? x0 - (b + 1) * 0.35 * k - 0.05 * k : x0 + deckW + b * 0.35 * k + 0.05 * k;
      c.strokeStyle = FAINT;
      c.strokeRect(bx, y0 - 0.3 * k, 0.3 * k, deckL + 0.6 * k);
    }
  }
  // Hull outline with the wedge nose and the tail.
  c.strokeStyle = INK;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x0 + 0.25 * k, y0 - 1.4 * k);
  c.lineTo(x0 + deckW - 0.25 * k, y0 - 1.4 * k);
  c.lineTo(x0 + deckW, y0);
  c.lineTo(x0 + deckW, y0 + deckL);
  c.lineTo(x0 + deckW * 0.74, y0 + deckL);
  c.lineTo(x0 + deckW * 0.74, y0 + deckL + 1.2 * k);
  c.lineTo(x0 + deckW * 0.26, y0 + deckL + 1.2 * k);
  c.lineTo(x0 + deckW * 0.26, y0 + deckL);
  c.lineTo(x0, y0 + deckL);
  c.closePath();
  c.stroke();
  // Deck cells.
  c.strokeStyle = 'rgba(160, 215, 255, 0.1)';
  c.lineWidth = 1;
  for (let i = 1; i < cols; i++) {
    c.beginPath();
    c.moveTo(x0 + i * k, y0);
    c.lineTo(x0 + i * k, y0 + deckL);
    c.stroke();
  }
  for (let j = 1; j < rows; j++) {
    c.beginPath();
    c.moveTo(x0, y0 + j * k);
    c.lineTo(x0 + deckW, y0 + j * k);
    c.stroke();
  }
  const hits: { id: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const m of t.modules) {
    const d = MODULES[m.key];
    const mx = x0 + m.cx * k + 1, my = y0 + m.cy * k + 1, mw = d.w * k - 2, mh = d.h * k - 2;
    const on = m.id === selected;
    c.fillStyle = on ? 'rgba(255, 215, 64, 0.25)' : d.hardpoint ? 'rgba(255, 110, 64, 0.16)' : 'rgba(120, 190, 255, 0.1)';
    c.fillRect(mx, my, mw, mh);
    c.strokeStyle = on ? '#ffd740' : d.hardpoint ? '#ff9e80' : INK;
    c.lineWidth = on ? 2 : 1;
    c.setLineDash(m.built ? [] : [3, 3]);
    c.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    c.setLineDash([]);
    if (d.hardpoint) {
      // Mount ring and barrel.
      const r = Math.min(mw, mh) * 0.32;
      c.beginPath();
      c.arc(mx + mw / 2, my + mh / 2, r, 0, Math.PI * 2);
      c.stroke();
      if (m.weapon) {
        c.beginPath();
        c.moveTo(mx + mw / 2, my + mh / 2);
        c.lineTo(mx + mw / 2, my + mh / 2 - r * (m.key === 'main_gun' ? 3 : 1.8));
        c.stroke();
      }
    }
    const label = d.w * k >= 34 ? d.name.replace('Turret Mount', 'Mount').replace('Main Battery Turret', 'Main Battery') : d.name.split(' ').map((s) => s[0]).join('');
    const fs = Math.max(7, Math.min(10, k * 0.55));
    c.font = `${fs}px Silkscreen, monospace`;
    c.fillStyle = on ? '#ffe57f' : INK;
    if (d.w * k >= 14 && d.h * k >= 10) c.fillText(label.slice(0, Math.max(2, Math.floor(mw / (fs * 0.62)))), mx + mw / 2, my + mh - fs * 0.8);
    hits.push({ id: m.id, x0: mx, y0: my, x1: mx + mw, y1: my + mh });
  }
  // Dimension lines.
  c.strokeStyle = FAINT;
  c.fillStyle = INK;
  c.font = '9px Silkscreen, monospace';
  c.beginPath();
  c.moveTo(x0, y0 + deckL + 2.2 * k);
  c.lineTo(x0 + deckW, y0 + deckL + 2.2 * k);
  c.stroke();
  c.fillText(`${t.stats.width.toFixed(0)} u`, cx, y0 + deckL + 2.2 * k + 8);
  c.save();
  c.translate(x0 + deckW + 2.2 * k, cy);
  c.rotate(Math.PI / 2);
  c.fillText(`${t.stats.length.toFixed(0)} u`, 0, -8);
  c.restore();
  c.fillText('▲ FRONT', cx, y0 - 1.4 * k - 10);
  return hits;
}

/** Side profile, front to the right: tracks, hull, nose, fins and the height of every building. */
function drawSide(c: CanvasRenderingContext2D, t: Tank, w: number, hgt: number): void {
  drawGrid(c, w, hgt);
  const L = t.stats.length;
  const k = (w - 50) / L;
  const ground = hgt - 16;
  const x0 = 25;
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  // Tracks: a long rounded run with road wheels.
  const tr = 1.2 * k;
  c.beginPath();
  c.moveTo(x0 + 1.5 * k, ground);
  c.lineTo(x0 + (L - 2.5) * k, ground);
  c.quadraticCurveTo(x0 + (L - 1.4) * k, ground, x0 + (L - 1.2) * k, ground - tr);
  c.lineTo(x0 + 0.8 * k, ground - tr);
  c.quadraticCurveTo(x0 + 0.6 * k, ground, x0 + 1.5 * k, ground);
  c.stroke();
  for (let x = 2; x < L - 2; x += 2) {
    c.beginPath();
    c.arc(x0 + x * k, ground - tr / 2, tr * 0.32, 0, Math.PI * 2);
    c.stroke();
  }
  // Hull and wedge nose.
  const deck = ground - 1.56 * t.cell * k * 1.1;
  c.beginPath();
  c.moveTo(x0 + 0.6 * k, ground - tr);
  c.lineTo(x0 + 0.6 * k, deck);
  c.lineTo(x0 + (L - 1.6) * k, deck);
  c.lineTo(x0 + L * k, ground - tr * 0.6);
  c.lineTo(x0 + (L - 1.2) * k, ground - tr);
  c.stroke();
  // Fins at the back.
  c.beginPath();
  c.moveTo(x0 + 0.6 * k, deck);
  c.lineTo(x0 + 0.4 * k, deck - 1.9 * k);
  c.lineTo(x0 + 1.6 * k, deck - 1.9 * k);
  c.lineTo(x0 + 2.4 * k, deck);
  c.stroke();
  // Buildings along the length (front is to the right).
  c.lineWidth = 1;
  for (const m of t.modules) {
    const d = MODULES[m.key];
    const l = t.moduleLocal(m);
    const len = d.h * t.cell;
    const xm = x0 + (L / 2 + l.lx - len / 2) * k;
    const hh = (m.key === 'main_gun' ? 1.8 : d.hardpoint ? 0.9 : d.height * 1.5) * k;
    c.strokeStyle = m.id === selected ? '#ffd740' : d.hardpoint ? '#ff9e80' : FAINT;
    c.strokeRect(xm + 1, deck - hh, len * k - 2, hh);
    if (m.key === 'main_gun' && m.weapon) {
      c.beginPath();
      c.moveTo(xm + len * k - 2, deck - hh * 0.6);
      c.lineTo(xm + len * k + 5 * k, deck - hh * 0.6);
      c.stroke();
    }
  }
  c.fillStyle = INK;
  c.font = '9px Silkscreen, monospace';
  c.textAlign = 'right';
  c.fillText('SIDE ▶ FRONT', w - 10, 14);
}

/** Coverage rose: how much firepower reaches each side (front at the top). */
function drawRose(c: CanvasRenderingContext2D, cov: number[]): void {
  const R = 54, cx = 64, cy = 64;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, 128, 128);
  const max = Math.max(1, ...cov);
  c.strokeStyle = FAINT;
  for (const r of [R / 3, (R * 2) / 3, R]) {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.beginPath();
  cov.forEach((v, i) => {
    // Direction i: 0 = front (up), clockwise.
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    const r = 6 + (v / max) * (R - 6);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  c.closePath();
  c.fillStyle = 'rgba(255, 145, 0, 0.35)';
  c.fill();
  c.strokeStyle = '#ffab40';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = INK;
  c.font = '8px Silkscreen, monospace';
  c.textAlign = 'center';
  c.fillText('FRONT', cx, 8);
  c.fillText('REAR', cx, 125);
}
