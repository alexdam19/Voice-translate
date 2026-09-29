import { hash2 } from './pixels';
import { backWall, box, discAt, glowAt, mix, R, screen, sh } from './interiorArt';

/**
 * The rest of each deck: every stretch between the lifts that hasn't got one of your rooms in it is still a
 * furnished part of the ship, themed for its deck. Command has operations rooms and comms; Recreation a lounge,
 * a bar, a gym and an arcade; Residential washrooms, laundry and capsule berths; the Main Deck the armory and suit
 * bay; the Hangar a motor pool; Logistics the stores and conveyors; Engineering the pump, boiler and turbine
 * rooms. Sealed decks are the same spaces mothballed: lights out, sheets over everything, red emergency lamps.
 *
 * Each space is a row of set pieces ("vignettes") chosen for the deck, drawn in art pixels like the rooms.
 */

type Vignette = (c: CanvasRenderingContext2D, x: number, fl: number, top: number, t: number, s: number, col: string) => number;

/* ---------------------------------------------------------------- */
/* Command                                                           */
/* ---------------------------------------------------------------- */

const holoTable: Vignette = (c, x, fl, top, t, s, col) => {
  box(c, x + 3, fl - 8, 24, 3, '#2a323e');
  R(c, x + 6, fl - 5, 2, 5, '#1c2129');
  R(c, x + 22, fl - 5, 2, 5, '#1c2129');
  // The projection: a slowly turning wireframe of the terrain ahead.
  const cx = x + 15, cy = fl - 17;
  glowAt(c, cx, cy, 20, col, 0.35);
  for (let i = 0; i < 14; i++) {
    const a = t * 0.8 + (i / 14) * Math.PI * 2;
    const r = 5 + 4 * hash2(i, s, 3);
    R(c, cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 0.45 + (hash2(i, s) - 0.5) * 3, 1, 1, sh(col, 0.4));
  }
  R(c, cx - 1, cy - 1, 2, 2, '#ff4a3a');
  c.globalAlpha = 0.25;
  R(c, x + 5, fl - 9, 20, 1, col);
  c.globalAlpha = 1;
  void top;
  return 30;
};

const screenWall: Vignette = (c, x, fl, top, t, s, col) => {
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const sx = x + 2 + i * 9, sy = top + 2 + j * 8;
      const k = (i + j * 3 + s) % 3;
      if (k === 0) {
        // Radar sweep.
        R(c, sx - 1, sy - 1, 9, 7, '#0b0d11');
        R(c, sx, sy, 7, 5, '#04140c');
        const a = t * 2 + i;
        R(c, sx + 3 + Math.round(Math.cos(a) * 2), sy + 2 + Math.round(Math.sin(a) * 2), 1, 1, '#40ff70');
        R(c, sx + 3, sy + 2, 1, 1, '#1a8a40');
        if (hash2(i, j, Math.floor(t)) > 0.6) R(c, sx + 1 + (s % 5), sy + 1, 1, 1, '#ff4030');
      } else if (k === 1) {
        screen(c, sx, sy, 7, 5, col, t, i + j * 3 + s);
      } else {
        // Bar chart.
        R(c, sx - 1, sy - 1, 9, 7, '#0b0d11');
        R(c, sx, sy, 7, 5, '#0a0f18');
        for (let b = 0; b < 3; b++) {
          const hh = 1 + Math.round((Math.sin(t * 0.7 + b + i) * 0.5 + 0.5) * 3);
          R(c, sx + 1 + b * 2, sy + 5 - hh, 1, hh, '#ffb13a');
        }
      }
    }
  }
  // Consoles under it.
  box(c, x + 2, fl - 8, 26, 8, '#26303c');
  for (let k = 0; k < 6; k++) R(c, x + 4 + k * 4, fl - 6, 2, 1, Math.floor(t * 3 + k + s) % 4 ? '#40c0ff' : '#ffd040');
  return 30;
};

const desk: Vignette = (c, x, fl, top, t, s, col) => {
  box(c, x + 2, fl - 9, 18, 2, '#4a4038');
  R(c, x + 3, fl - 7, 1, 7, '#2a2420');
  R(c, x + 18, fl - 7, 1, 7, '#2a2420');
  screen(c, x + 6, fl - 16, 7, 5, col, t, s + 7);
  R(c, x + 9, fl - 10, 1, 1, '#3a4250');
  R(c, x + 15, fl - 11, 2, 2, '#e8e0d0');
  // The chair.
  R(c, x + 8, fl - 6, 5, 1, '#3a3a44');
  R(c, x + 12, fl - 12, 1, 6, '#3a3a44');
  R(c, x + 10, fl - 5, 1, 5, '#22262c');
  void top;
  return 22;
};

const commRack: Vignette = (c, x, fl, top, t, s) => {
  box(c, x + 2, top + 2, 12, fl - top - 2, '#1e242c');
  for (let j = 0; j < 7; j++) {
    for (let i = 0; i < 4; i++) {
      const on = hash2(i + j * 5, s, Math.floor(t * 4 + i)) > 0.45;
      R(c, x + 4 + i * 2, top + 5 + j * 4, 1, 1, on ? (j % 3 ? '#40ff70' : '#ffb13a') : '#16301e');
    }
  }
  // A headset on a hook, a coiled cable.
  R(c, x + 15, top + 8, 1, 3, '#6a7078');
  discAt(c, x + 16, top + 13, 2, '#2a2e34');
  R(c, x + 16, top + 14, 1, fl - top - 16, '#3a3e44');
  return 18;
};

const flag: Vignette = (c, x, fl, top, t, s, col) => {
  R(c, x + 2, top + 2, 10, 16, '#0b0d11');
  R(c, x + 3, top + 3, 8, 14, '#2a2e36');
  R(c, x + 3, top + 3, 8, 3, col);
  R(c, x + 5, top + 8, 4, 5, '#d8dee8');
  R(c, x + 6, top + 9, 2, 3, '#2a2e36');
  R(c, x + 3, top + 16, 8, 1, sh(col, -0.3));
  void fl;
  void t;
  void s;
  return 14;
};

/* ---------------------------------------------------------------- */
/* Recreation                                                        */
/* ---------------------------------------------------------------- */

const couchTV: Vignette = (c, x, fl, top, t, s) => {
  // The set on the wall: a picture that changes.
  R(c, x + 18, top + 3, 18, 12, '#0b0d11');
  const hue = Math.floor(t * 0.5 + s) % 3;
  R(c, x + 19, top + 4, 16, 10, ['#20406a', '#3a2a50', '#1a4a3a'][hue]);
  for (let i = 0; i < 5; i++) R(c, x + 20 + i * 3, top + 8 + Math.round(Math.sin(t * 3 + i) * 2), 2, 2, ['#ffd060', '#60d0ff', '#ff7060'][(i + hue) % 3]);
  glowAt(c, x + 27, top + 9, 22, '#80b0ff', 0.25);
  // The couch, and a lamp.
  box(c, x + 3, fl - 7, 26, 5, '#7a3a34');
  R(c, x + 3, fl - 10, 26, 3, '#8a4a40');
  R(c, x + 1, fl - 9, 3, 7, '#6a3028');
  R(c, x + 28, fl - 9, 3, 7, '#6a3028');
  R(c, x + 8, fl - 8, 5, 1, '#a0605a');
  R(c, x + 34, fl - 16, 1, 16, '#4a4038');
  R(c, x + 32, fl - 19, 5, 3, '#e8d8a0');
  glowAt(c, x + 34, fl - 17, 12, '#ffe0a0', 0.4);
  return 40;
};

const poolTable: Vignette = (c, x, fl, top, t, s) => {
  R(c, x + 3, fl - 9, 26, 1, '#5a3a20');
  R(c, x + 4, fl - 10, 24, 2, '#2a7a3a');
  R(c, x + 5, fl - 8, 2, 8, '#4a3020');
  R(c, x + 25, fl - 8, 2, 8, '#4a3020');
  for (let k = 0; k < 5; k++) R(c, x + 8 + k * 4 + Math.round(hash2(k, s) * 2), fl - 11, 1, 1, ['#ffffff', '#ff4030', '#ffd040', '#3060ff', '#1a1a1a'][k]);
  // The cue, and the lamp over it.
  R(c, x + 28, fl - 20, 1, 12, '#c8a070');
  R(c, x + 16, top, 1, 6, '#2a2e34');
  R(c, x + 10, top + 6, 13, 2, '#1e5a2a');
  glowAt(c, x + 16, fl - 12, 20, '#fff0c0', 0.35);
  void t;
  return 32;
};

const arcade: Vignette = (c, x, fl, top, t, s) => {
  const hue = ['#ff40c0', '#40e0ff', '#ffd040'][s % 3];
  box(c, x + 2, fl - 26, 10, 26, '#2a1e3a');
  R(c, x + 2, fl - 26, 10, 3, hue);
  glowAt(c, x + 7, fl - 25, 12, hue, 0.5);
  R(c, x + 4, fl - 21, 6, 6, '#06060e');
  for (let k = 0; k < 4; k++) R(c, x + 4 + ((Math.floor(t * 6) + k * 2) % 6), fl - 20 + k, 1, 1, ['#ff4030', '#40ff70', '#ffd040', '#40c0ff'][k]);
  glowAt(c, x + 7, fl - 18, 10, '#8080ff', 0.35);
  R(c, x + 3, fl - 13, 8, 2, '#4a3a5a');
  R(c, x + 5, fl - 14, 1, 1, '#e0e0e0');
  R(c, x + 8, fl - 13, 1, 1, '#ff4030');
  void top;
  return 14;
};

const bar: Vignette = (c, x, fl, top, t, s) => {
  // Bottles on the back shelf, a neon sign.
  R(c, x + 3, top + 12, 30, 1, '#5a4030');
  for (let k = 0; k < 12; k++) {
    const bh = 3 + Math.floor(hash2(k, s) * 3);
    R(c, x + 4 + k * 2.4, top + 12 - bh, 1, bh, ['#3a8a3a', '#8a5a2a', '#c0c0d0', '#8a2a2a'][k % 4]);
  }
  const on = Math.floor(t * 1.3 + s) % 7 !== 0;
  if (on) {
    R(c, x + 10, top + 2, 14, 5, '#3a0a2a');
    for (const [dx, w] of [[11, 3], [15, 3], [19, 4]] as const) R(c, x + dx, top + 3, w, 3, '#ff4fd8');
    glowAt(c, x + 17, top + 4, 18, '#ff4fd8', 0.5);
  }
  // The counter and stools.
  box(c, x + 3, fl - 12, 30, 12, '#6a4428');
  R(c, x + 3, fl - 12, 30, 1, '#9a6a40');
  for (let k = 0; k < 3; k++) {
    R(c, x + 6 + k * 10, fl - 6, 5, 1, '#8a2a2a');
    R(c, x + 8 + k * 10, fl - 5, 1, 5, '#2a2a2e');
  }
  R(c, x + 12, fl - 14, 2, 2, '#e8c040');
  return 36;
};

const gym: Vignette = (c, x, fl, top, t, s) => {
  // Treadmill with its belt running.
  R(c, x + 3, fl - 3, 16, 3, '#1e2226');
  for (let k = 0; k < 16; k += 3) R(c, x + 3 + ((k + Math.floor(t * 10)) % 16), fl - 3, 1, 1, '#3a3e44');
  R(c, x + 16, fl - 14, 1, 11, '#5a6068');
  R(c, x + 14, fl - 15, 5, 2, '#3a4250');
  // Bench and barbell.
  R(c, x + 22, fl - 5, 10, 2, '#2a3a5a');
  R(c, x + 23, fl - 3, 1, 3, '#1e2226');
  R(c, x + 30, fl - 3, 1, 3, '#1e2226');
  R(c, x + 20, fl - 12, 14, 1, '#8a929c');
  R(c, x + 20, fl - 14, 2, 5, '#1a1a1e');
  R(c, x + 32, fl - 14, 2, 5, '#1a1a1e');
  // A heavy bag, swinging.
  const sw = Math.round(Math.sin(t * 1.8 + s) * 2);
  R(c, x + 38, top, 1, 6, '#5a5a5a');
  box(c, x + 36 + sw, top + 6, 5, 14, '#8a2a24');
  void fl;
  return 44;
};

const plant: Vignette = (c, x, fl, top, t, s) => {
  box(c, x + 2, fl - 6, 6, 6, '#8a5a3a');
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k - 4) * 0.35 + Math.sin(t * 0.8 + k) * 0.05;
    const len = 5 + hash2(k, s) * 6;
    for (let d = 1; d < len; d++) R(c, x + 5 + Math.cos(a) * d, fl - 6 + Math.sin(a) * d, 1, 1, d > len - 2 ? '#7ad050' : '#4a9a38');
  }
  void top;
  return 10;
};

/* ---------------------------------------------------------------- */
/* Residential                                                       */
/* ---------------------------------------------------------------- */

const lockers: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 4; k++) {
    const lx = x + 2 + k * 7;
    box(c, lx, top + 4, 6, fl - top - 4, ['#4a5a6a', '#3a4a5a'][k % 2]);
    for (let v = 0; v < 3; v++) R(c, lx + 1, top + 7 + v * 2, 4, 1, '#1e2630');
    R(c, lx + 4, top + 16, 1, 2, '#c0c8d0');
    R(c, lx + 1, top + 20, 2, 1, '#e8e0c8');
    // One stands open.
    if ((k + s) % 5 === 0) {
      R(c, lx, top + 4, 6, fl - top - 4, '#12161c');
      R(c, lx + 1, top + 8, 4, 6, '#5a6a3a');
    }
  }
  void t;
  return 30;
};

const washroom: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 2; k++) {
    const wx = x + 3 + k * 10;
    R(c, wx, top + 4, 8, 7, '#8ab0c0');
    R(c, wx, top + 4, 8, 1, '#d0e8f0');
    R(c, wx + 1, fl - 12, 6, 2, '#d8dce0');
    R(c, wx + 3, fl - 10, 2, 10, '#a0a8b0');
    R(c, wx + 3, fl - 13, 1, 1, '#c0c8d0');
  }
  // A shower stall with steam.
  const sx = x + 24;
  R(c, sx, top + 2, 12, fl - top - 2, '#3a5a6a');
  R(c, sx + 1, top + 3, 10, fl - top - 4, '#5a8090');
  R(c, sx + 5, top + 4, 3, 1, '#c0c8d0');
  for (let k = 0; k < 6; k++) {
    const yy = top + 6 + ((t * 14 + k * 5) % (fl - top - 10));
    R(c, sx + 3 + (k % 3) * 2, yy, 1, 2, 'rgba(200,230,255,0.55)');
  }
  R(c, sx + 9, top + 3, 2, fl - top - 4, '#e8c8d8');
  glowAt(c, sx + 6, top + 10, 12, '#c0e8ff', 0.25);
  void s;
  return 38;
};

const laundry: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 2; k++) {
    const mx = x + 2 + k * 12;
    box(c, mx, fl - 14, 11, 14, '#d8dce0');
    R(c, mx + 1, fl - 13, 9, 2, '#a0a8b0');
    discAt(c, mx + 5.5, fl - 6, 4, '#3a4250');
    discAt(c, mx + 5.5, fl - 6, 3, '#6a90b0');
    const a = t * 6 + k;
    R(c, mx + 5 + Math.cos(a) * 2, fl - 6 + Math.sin(a) * 2, 2, 1, ['#d04040', '#40a0d0'][(k + s) % 2]);
  }
  // A basket of laundry and a line with shirts.
  box(c, x + 26, fl - 5, 7, 5, '#a08050');
  R(c, x + 27, fl - 7, 5, 2, '#e0d8c8');
  R(c, x + 1, top + 6, 32, 1, '#6a6a6a');
  for (let k = 0; k < 3; k++) R(c, x + 5 + k * 9, top + 7, 5, 6, ['#d05050', '#e8e8e8', '#5070c0'][k]);
  return 34;
};

const capsules: Vignette = (c, x, fl, top, t, s) => {
  const hh = Math.floor((fl - top - 4) / 2);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const cx = x + 2 + i * 16, cy = top + 3 + j * (hh + 1);
      box(c, cx, cy, 15, hh, '#3a4452');
      const lit = hash2(i + j * 2, s, Math.floor(t * 0.2)) > 0.35;
      R(c, cx + 2, cy + 2, 11, hh - 4, lit ? '#e8d8a0' : '#1a1e26');
      if (lit) {
        R(c, cx + 3, cy + hh - 5, 6, 2, '#6a8aba');
        R(c, cx + 3, cy + hh - 6, 2, 1, '#e8e4d8');
        glowAt(c, cx + 7, cy + hh / 2, 10, '#ffe0a0', 0.25);
      }
      R(c, cx + 11, cy + 2, 2, hh - 4, '#6a4a8a');
    }
  }
  return 34;
};

/* ---------------------------------------------------------------- */
/* Main Deck                                                         */
/* ---------------------------------------------------------------- */

const rifleRack: Vignette = (c, x, fl, top, t, s) => {
  box(c, x + 2, top + 4, 22, 22, '#2a2e24');
  for (let k = 0; k < 6; k++) {
    const rx = x + 4 + k * 3.3;
    R(c, rx, top + 6, 1, 17, '#1a1c1a');
    R(c, rx, top + 10, 2, 3, '#4a3a2a');
    R(c, rx, top + 20, 2, 3, '#3a3020');
  }
  R(c, x + 2, top + 24, 22, 1, '#5a6040');
  // Ammo cans under it.
  for (let k = 0; k < 3; k++) box(c, x + 3 + k * 7, fl - 5, 6, 5, '#4a5a2a');
  void t;
  void s;
  return 26;
};

const suitFrame: Vignette = (c, x, fl, top, t, s) => {
  R(c, x + 2, top + 2, 1, fl - top - 2, '#4a4f58');
  R(c, x + 15, top + 2, 1, fl - top - 2, '#4a4f58');
  R(c, x + 2, top + 2, 14, 1, '#4a4f58');
  // A suit of power armour hanging in it, visor lit.
  box(c, x + 6, top + 4, 6, 5, '#5a6a4a');
  R(c, x + 7, top + 6, 4, 1, (s + Math.floor(t)) % 5 ? '#40e0ff' : '#1a4a5a');
  box(c, x + 5, top + 10, 8, 10, '#4a5a3a');
  R(c, x + 3, top + 11, 2, 8, '#4a5a3a');
  R(c, x + 13, top + 11, 2, 8, '#4a5a3a');
  R(c, x + 6, top + 21, 2, fl - top - 22, '#3a4a2a');
  R(c, x + 10, top + 21, 2, fl - top - 22, '#3a4a2a');
  R(c, x + 7, top + 13, 4, 2, '#e0b020');
  return 18;
};

const crates: Vignette = (c, x, fl, top, t, s) => {
  const cols = ['#4a5a2a', '#5a4a2a', '#3a4a5a'];
  let k = 0;
  for (let cx = x + 2; cx < x + 22; cx += 10, k++) {
    const n = 1 + Math.floor(hash2(k, s) * 3);
    for (let j = 0; j < n; j++) {
      const col = cols[(k + j + s) % cols.length];
      box(c, cx, fl - 9 * (j + 1), 9, 8, col);
      R(c, cx + 2, fl - 9 * (j + 1) + 3, 5, 1, sh(col, 0.35));
      R(c, cx + 1, fl - 9 * (j + 1) + 1, 1, 6, sh(col, -0.3));
    }
  }
  void top;
  void t;
  return 24;
};

const workbench: Vignette = (c, x, fl, top, t, s) => {
  // Pegboard with tools.
  R(c, x + 2, top + 4, 22, 12, '#3a3a34');
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) R(c, x + 4 + i * 3.5, top + 6 + j * 4, 1, 1, '#22221e');
  R(c, x + 5, top + 6, 1, 7, '#a0a8b4');
  R(c, x + 9, top + 6, 3, 2, '#c04030');
  R(c, x + 14, top + 7, 1, 6, '#e0b020');
  R(c, x + 18, top + 6, 3, 3, '#8a929c');
  // The bench, a vise, sparks from a grinder.
  box(c, x + 2, fl - 9, 22, 3, '#6a5040');
  R(c, x + 3, fl - 6, 1, 6, '#3a2e24');
  R(c, x + 22, fl - 6, 1, 6, '#3a2e24');
  box(c, x + 5, fl - 12, 4, 3, '#4a5566');
  if (Math.sin(t * 7 + s) > 0.3) {
    for (let k = 0; k < 3; k++) R(c, x + 18 + k, fl - 11 - k, 1, 1, '#ffd060');
    glowAt(c, x + 18, fl - 11, 8, '#ffb040', 0.5);
  }
  return 26;
};

const hatch: Vignette = (c, x, fl, top, t, s) => {
  // A ladder up to the roof, the hatch lit red when it's closed.
  R(c, x + 6, top, 1, fl - top, '#6a707a');
  R(c, x + 11, top, 1, fl - top, '#6a707a');
  for (let yy = top + 3; yy < fl; yy += 4) R(c, x + 6, yy, 6, 1, '#8a929c');
  R(c, x + 3, top, 12, 2, '#e0b020');
  R(c, x + 3, top, 3, 2, '#1a1a1a');
  R(c, x + 9, top, 3, 2, '#1a1a1a');
  const open = Math.floor(t * 0.2 + s) % 3 === 0;
  R(c, x + 15, top + 4, 2, 2, open ? '#40ff70' : '#ff3020');
  glowAt(c, x + 16, top + 5, 6, open ? '#40ff70' : '#ff3020', 0.5);
  return 18;
};

/* ---------------------------------------------------------------- */
/* Hangar                                                            */
/* ---------------------------------------------------------------- */

const buggy: Vignette = (c, x, fl, top, t, s) => {
  const col = ['#8a6a2a', '#5a6a3a', '#6a3a2a'][s % 3];
  // Roll cage, body, big wheels, a spare on the back.
  R(c, x + 8, fl - 17, 1, 8, '#2a2a2e');
  R(c, x + 20, fl - 17, 1, 8, '#2a2a2e');
  R(c, x + 8, fl - 17, 13, 1, '#2a2a2e');
  box(c, x + 4, fl - 10, 26, 5, col);
  R(c, x + 22, fl - 12, 7, 2, sh(col, -0.2));
  R(c, x + 26, fl - 10, 3, 2, '#ffe080');
  discAt(c, x + 9, fl - 4, 4, '#141416');
  discAt(c, x + 25, fl - 4, 4, '#141416');
  discAt(c, x + 9, fl - 4, 1.5, '#6a707a');
  discAt(c, x + 25, fl - 4, 1.5, '#6a707a');
  discAt(c, x + 3, fl - 11, 3, '#1c1c1e');
  // The lift under it, hazard striped.
  for (let k = 0; k < 32; k += 4) R(c, x + 1 + k, fl - 1, 2, 1, '#e0b020');
  void top;
  void t;
  return 34;
};

const fuelPump: Vignette = (c, x, fl, top, t, s) => {
  box(c, x + 2, fl - 20, 8, 20, '#8a2a24');
  R(c, x + 3, fl - 18, 6, 4, '#0b1a10');
  R(c, x + 4, fl - 17, 4, 1, '#40ff70');
  R(c, x + 4 + (Math.floor(t * 4 + s) % 4), fl - 16, 1, 1, '#40ff70');
  R(c, x + 10, fl - 14, 1, 10, '#1a1a1a');
  R(c, x + 9, fl - 5, 3, 2, '#2a2a2a');
  void top;
  return 14;
};

const crane: Vignette = (c, x, fl, top, t, s) => {
  R(c, x, top, 30, 2, '#4a4f58');
  R(c, x, top + 2, 30, 1, '#e0b020');
  const hx = x + 15 + Math.sin(t * 0.5 + s) * 9;
  R(c, hx - 2, top + 3, 5, 3, '#6a707a');
  R(c, hx, top + 6, 1, 12, '#8a929c');
  box(c, hx - 5, top + 18, 11, 8, '#46607a');
  R(c, hx - 4, top + 21, 9, 1, '#2a3a4a');
  void fl;
  return 30;
};

const drums: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 3; k++) {
    const col = ['#b03a2a', '#e0b020', '#3a6a9a'][(k + s) % 3];
    box(c, x + 2 + k * 5, fl - 9, 5, 9, col);
    R(c, x + 2 + k * 5, fl - 6, 5, 1, sh(col, -0.35));
    R(c, x + 2 + k * 5, fl - 3, 5, 1, sh(col, -0.35));
  }
  box(c, x + 5, fl - 18, 5, 9, '#5a5a5a');
  void top;
  void t;
  return 18;
};

const tires: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 4; k++) {
    R(c, x + 2, fl - 4 - k * 4, 10, 4, '#161618');
    R(c, x + 3, fl - 3 - k * 4, 8, 1, '#2a2a2e');
    R(c, x + 5, fl - 4 - k * 4, 4, 1, '#0a0a0c');
  }
  void top;
  void t;
  void s;
  return 14;
};

/* ---------------------------------------------------------------- */
/* Logistics                                                         */
/* ---------------------------------------------------------------- */

const palletRack: Vignette = (c, x, fl, top, t, s) => {
  R(c, x + 2, top + 2, 1, fl - top - 2, '#3a6a9a');
  R(c, x + 29, top + 2, 1, fl - top - 2, '#3a6a9a');
  for (let lv = 0; lv < 3; lv++) {
    const ly = fl - 2 - lv * 12;
    R(c, x + 2, ly, 28, 1, '#e0a020');
    for (let k = 0; k < 3; k++) {
      if (hash2(k + lv * 3, s) < 0.2) continue;
      const col = ['#8a6a4a', '#6a7a4a', '#5a6a8a', '#8a5a4a'][(k + lv + s) % 4];
      box(c, x + 4 + k * 8.5, ly - 9, 7, 9, col);
      R(c, x + 5 + k * 8.5, ly - 6, 5, 1, '#e8e0c8');
    }
  }
  void t;
  return 32;
};

const conveyor: Vignette = (c, x, fl, top, t, s) => {
  R(c, x + 2, fl - 9, 38, 3, '#2a2e34');
  R(c, x + 2, fl - 9, 38, 1, '#5a6068');
  for (let k = 0; k < 38; k += 4) R(c, x + 2 + ((k + Math.floor(t * 12)) % 38), fl - 8, 1, 1, '#16181c');
  for (let k = 0; k < 4; k++) R(c, x + 4 + k * 11, fl - 6, 1, 6, '#3a3e44');
  for (let k = 0; k < 3; k++) {
    const bx = x + 2 + ((t * 8 + k * 13 + s * 5) % 34);
    box(c, bx, fl - 15, 6, 6, ['#8a6a4a', '#6a7a8a', '#9a8a5a'][k]);
  }
  // A scanner arch over the belt.
  R(c, x + 30, fl - 20, 1, 11, '#4a4f58');
  R(c, x + 36, fl - 20, 1, 11, '#4a4f58');
  R(c, x + 30, fl - 20, 7, 2, '#4a4f58');
  R(c, x + 31, fl - 18, 5, 1, Math.floor(t * 3) % 2 ? '#ff3030' : '#601010');
  void top;
  return 42;
};

const forklift: Vignette = (c, x, fl, top, t, s) => {
  const fx = x + 3 + Math.round((Math.sin(t * 0.3 + s) + 1) * 3);
  box(c, fx, fl - 10, 12, 7, '#e0a020');
  R(c, fx + 2, fl - 16, 1, 6, '#2a2a2a');
  R(c, fx + 9, fl - 16, 1, 6, '#2a2a2a');
  R(c, fx + 2, fl - 16, 8, 1, '#2a2a2a');
  R(c, fx + 13, fl - 18, 1, 16, '#4a4f58');
  R(c, fx + 13, fl - 5, 5, 1, '#6a707a');
  discAt(c, fx + 3, fl - 2, 2, '#141416');
  discAt(c, fx + 10, fl - 2, 2, '#141416');
  void top;
  return 22;
};

const container: Vignette = (c, x, fl, top, t, s) => {
  const col = ['#8a3a2a', '#2a5a7a', '#5a7a3a', '#a07a2a'][s % 4];
  const ch = Math.min(22, fl - top - 4);
  box(c, x + 2, fl - ch, 34, ch, col);
  for (let k = x + 4; k < x + 34; k += 3) R(c, k, fl - ch + 2, 1, ch - 4, sh(col, -0.25));
  R(c, x + 30, fl - ch + 3, 1, ch - 6, '#c0c8d0');
  R(c, x + 10, fl - ch + 4, 9, 4, '#e8e0c8');
  R(c, x + 11, fl - ch + 5, 7, 2, sh(col, -0.4));
  void t;
  return 38;
};

const coldStore: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 2; k++) {
    const cx = x + 2 + k * 12;
    box(c, cx, top + 3, 11, fl - top - 3, '#b8c8d8');
    R(c, cx + 1, top + 5, 9, 8, '#8ab0d0');
    R(c, cx + 9, top + 15, 1, 5, '#6a707a');
    for (let f = 0; f < 4; f++) R(c, cx + 1 + ((f * 3 + s) % 9), top + 4, 1, 1, '#ffffff');
    glowAt(c, cx + 5, top + 9, 10, '#a0e0ff', 0.3);
  }
  void t;
  return 26;
};

/* ---------------------------------------------------------------- */
/* Engineering                                                       */
/* ---------------------------------------------------------------- */

const pipes: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 3; k++) {
    const py = top + 4 + k * 8;
    const col = ['#6a4a3a', '#4a5a6a', '#5a6a4a'][(k + s) % 3];
    R(c, x, py, 32, 4, col);
    R(c, x, py, 32, 1, sh(col, 0.35));
    R(c, x, py + 3, 32, 1, sh(col, -0.35));
    for (let f = x + 6; f < x + 32; f += 10) R(c, f, py - 1, 2, 6, sh(col, -0.2));
  }
  // A valve wheel and a gauge, and a drip.
  discAt(c, x + 12, fl - 10, 4, '#b03a2a');
  discAt(c, x + 12, fl - 10, 2, '#2a1a18');
  R(c, x + 12, fl - 14, 1, 4, '#4a5566');
  discAt(c, x + 24, fl - 12, 3, '#d8d0b8');
  const an = -2.2 + Math.sin(t * 0.8 + s) * 0.9;
  R(c, x + 24 + Math.cos(an) * 2, fl - 12 + Math.sin(an) * 2, 1, 1, '#c01010');
  const dy = (t * 12 + s * 3) % 12;
  R(c, x + 18, top + 28 + dy, 1, 1, '#80c0ff');
  return 32;
};

const boiler: Vignette = (c, x, fl, top, t, s) => {
  const bw = 16;
  box(c, x + 3, top + 2, bw, fl - top - 2, '#6a3a2e');
  for (let yy = top + 5; yy < fl - 2; yy += 5) {
    R(c, x + 3, yy, bw, 1, '#4a2a22');
    for (let k = 0; k < 4; k++) R(c, x + 5 + k * 4, yy - 1, 1, 1, '#9a6a5a');
  }
  // The firebox glowing, the pressure gauge twitching.
  R(c, x + 6, fl - 9, 10, 6, '#1a0e0a');
  R(c, x + 7, fl - 8, 8, 4, Math.sin(t * 7 + s) > 0 ? '#ff9030' : '#ff6010');
  glowAt(c, x + 11, fl - 6, 16, '#ff8030', 0.55);
  discAt(c, x + 11, top + 8, 3, '#d8d0b8');
  const an = -0.6 + Math.sin(t * 5 + s) * 0.25;
  R(c, x + 11 + Math.cos(an) * 2, top + 8 + Math.sin(an) * 2, 1, 1, '#c01010');
  R(c, x + 20, top + 4, 3, fl - top - 4, '#4a5566');
  return 24;
};

const turbine: Vignette = (c, x, fl, top, t, s, col) => {
  const cx = x + 14, cy = fl - 14, r = Math.min(11, (fl - top) / 2 - 3);
  box(c, x + 2, cy - r - 2, 24, r * 2 + 4, '#2a323c');
  discAt(c, cx, cy, r, '#0b0d11');
  discAt(c, cx, cy, r - 1, '#1a2028');
  const spin = t * 9 + s;
  for (let b = 0; b < 8; b++) {
    const a = spin + (b * Math.PI) / 4;
    for (let d = 2; d < r - 1; d++) R(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1, '#8a929c');
  }
  discAt(c, cx, cy, 2, '#c0c8d0');
  glowAt(c, cx, cy, r * 2, col, 0.25);
  R(c, x + 2, fl - 2, 24, 2, '#e0b020');
  return 28;
};

const switchgear: Vignette = (c, x, fl, top, t, s) => {
  for (let k = 0; k < 3; k++) {
    const sx = x + 2 + k * 8;
    box(c, sx, top + 3, 7, fl - top - 3, '#3a4a3a');
    for (let j = 0; j < 4; j++) {
      R(c, sx + 2, top + 6 + j * 5, 3, 3, '#1a221a');
      const on = hash2(k, j, s) > 0.3;
      R(c, sx + 3, top + (on ? 6 : 8) + j * 5, 1, 1, on ? '#c0c8d0' : '#8a929c');
    }
    R(c, sx + 1, top + 4, 1, 1, Math.floor(t * 2 + k) % 2 ? '#40ff70' : '#ff3020');
  }
  // Now and then, a spark.
  if (hash2(Math.floor(t * 3), s, 7) > 0.85) {
    R(c, x + 12, top + 2, 2, 2, '#fff8a0');
    glowAt(c, x + 13, top + 3, 10, '#fff8a0', 0.8);
  }
  R(c, x + 2, top, 22, 2, '#e0b020');
  return 26;
};

const coolant: Vignette = (c, x, fl, top, t, s) => {
  const tx = x + 3, tw = 10;
  box(c, tx, top + 2, tw, fl - top - 2, '#3a4250');
  R(c, tx + 1, top + 4, tw - 2, fl - top - 8, '#0a2a2a');
  const lvl = top + 8 + Math.sin(t * 0.3 + s) * 2;
  R(c, tx + 1, lvl, tw - 2, fl - 4 - lvl, '#20c0a0');
  for (let k = 0; k < 4; k++) {
    const by = fl - 5 - ((t * 10 + k * 6) % (fl - 5 - lvl));
    R(c, tx + 2 + ((k * 3) % (tw - 3)), by, 1, 1, '#a0fff0');
  }
  glowAt(c, tx + tw / 2, (lvl + fl) / 2, 14, '#20e0c0', 0.35);
  return 16;
};

/* ---------------------------------------------------------------- */
/* Decks                                                             */
/* ---------------------------------------------------------------- */

interface DeckTheme {
  names: string[];
  set: Vignette[];
  /** The space's own light. */
  light: string;
}

const THEMES: Record<number, DeckTheme> = {
  1: { names: ['OPERATIONS', 'COMMS ROOM', 'WAR ROOM', "OFFICERS' WARDROOM"], set: [holoTable, screenWall, desk, commRack, flag, desk], light: '#60d0ff' },
  2: { names: ['CREW LOUNGE', 'THE CANTEEN BAR', 'GYM', 'ARCADE'], set: [couchTV, bar, gym, arcade, poolTable, plant, arcade], light: '#ffd080' },
  3: { names: ['WASHROOMS', 'LAUNDRY', 'CAPSULE BERTHS', 'LOCKER ROOM'], set: [washroom, laundry, capsules, lockers, plant], light: '#fff0c0' },
  4: { names: ['ARMORY', 'SUIT BAY', 'BOARDING ROOM', 'QUARTERMASTER'], set: [rifleRack, suitFrame, crates, workbench, hatch, suitFrame], light: '#ffb070' },
  5: { names: ['MOTOR POOL', 'FUEL STATION', 'VEHICLE LIFT'], set: [buggy, fuelPump, crane, drums, tires, buggy], light: '#d0d8e0' },
  6: { names: ['STORES', 'CONVEYOR HALL', 'COLD STORAGE', 'CONTAINER BAY'], set: [palletRack, conveyor, forklift, container, coldStore, palletRack], light: '#c0b0ff' },
  7: { names: ['PUMP ROOM', 'BOILER ROOM', 'TURBINE HALL', 'SWITCHGEAR'], set: [pipes, boiler, turbine, switchgear, coolant, turbine], light: '#ff9060' },
};

/**
 * Draws a deck's own space into an empty stretch (x0..x0+w, one deck high) and returns its name. `seed` makes
 * each stretch its own room; `open` false draws it mothballed.
 */
export function drawService(c: CanvasRenderingContext2D, deck: number, x0: number, y0: number, w: number, h: number, t: number, seed: number, tint: string, open: boolean): string {
  const th = THEMES[deck] ?? THEMES[4];
  backWall({ c, x0, y0, w, h }, mix(tint, th.light, 0.3));
  const fl = y0 + h - 3, top = y0 + 7;
  // Lead with the room's signature piece, then fill with the rest of the deck's set, never the same one twice
  // running.
  const first = seed % th.set.length;
  let x = x0 + 3, k = 0, last = -1;
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  while (x < x0 + w - 12 && k < 12) {
    let i = k === 0 ? first : Math.floor(hash2(seed, k, deck) * th.set.length);
    if (i === last) i = (i + 1) % th.set.length;
    const used = th.set[i](c, x, fl, top, t, seed * 7 + k, th.light);
    last = i;
    x += used + 2;
    k++;
  }
  c.restore();
  if (!open) mothball(c, x0, y0, w, h, t, seed);
  return th.names[seed % th.names.length];
}

/** A sealed deck: the lights off, dust sheets over everything, red emergency lamps, tape across the doors. */
function mothball(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, t: number, seed: number): void {
  c.fillStyle = 'rgba(4,5,8,0.72)';
  c.fillRect(x0, y0, w, h);
  const fl = y0 + h - 3;
  // Dust sheets: pale lumps over the furniture.
  for (let k = 0; k < Math.floor(w / 26); k++) {
    const sx = x0 + 6 + k * 26 + hash2(k, seed) * 6, sw = 14 + hash2(seed, k) * 8, shh = 8 + hash2(k, seed, 2) * 12;
    c.fillStyle = 'rgba(120,124,132,0.35)';
    c.beginPath();
    c.moveTo(sx, fl);
    c.quadraticCurveTo(sx + sw / 2, fl - shh * 2, sx + sw, fl);
    c.fill();
  }
  // Emergency lamps.
  const blink = Math.floor(t * 1.2 + seed) % 2 === 0;
  for (let px = x0 + 12; px < x0 + w - 6; px += 48) {
    R(c, px, y0 + 6, 3, 2, blink ? '#ff2a1a' : '#5a0a06');
    if (blink) glowAt(c, px + 1, y0 + 8, 18, '#ff2a1a', 0.35);
  }
  // Hazard tape at each end.
  for (const ex of [x0 + 1, x0 + w - 5]) for (let yy = y0 + 8; yy < fl; yy += 6) R(c, ex, yy, 4, 3, (yy / 6) % 2 ? '#e0b020' : '#141414');
}
