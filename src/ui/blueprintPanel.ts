import { TER, TERRAIN, TRACTION } from '../shared/map';
import { WEAPONS } from '../shared/weapons';
import { assess, coverage, mountDps, rating } from '../game/analysis';
import { chassisForCC, DRIVE_INFO, MODULES } from '../game/defs';
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

export function renderBlueprint(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const s = p.stats;
  const wrap = h('div', 'bp-wrap');
  const sheet = h('div', 'bp-sheet');
  const top = h('canvas', 'bp-top');
  const side = h('canvas', 'bp-side');
  sheet.append(top, side);
  const info = h('div', 'bp-info');
  wrap.append(sheet, info);
  ctx.body.appendChild(wrap);
  // Size the drawing to the panel.
  const avail = Math.max(260, Math.min(sheet.clientWidth || 520, 640));
  const L = s.length, W = s.width;
  const scale = Math.min((avail - 60) / (W + 6), ((window.innerHeight * 0.62) - 30) / (L + 6));
  top.width = Math.round((W + 8) * scale + 40);
  top.height = Math.round((L + 6) * scale + 40);
  side.width = top.width;
  side.height = Math.round(top.width * 0.3);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [top, side]) {
    c.style.width = `${c.width}px`;
    c.style.height = `${c.height}px`;
    c.width *= dpr;
    c.height *= dpr;
  }
  const tc = top.getContext('2d')!;
  tc.scale(dpr, dpr);
  const hit = drawTop(tc, p, scale, top.width / dpr, top.height / dpr);
  const scx = side.getContext('2d')!;
  scx.scale(dpr, dpr);
  drawSide(scx, p, side.width / dpr, side.height / dpr);
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
