import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../../game/game';
import { COMPOUND, FRONT_GUNS, FRONT_STRUCTS, GATE_TOWER_H, HANGAR_APEX, HANGAR_EAVE, HELIPADS, PADS, PAD_L, PAD_W, STRUCTS, TOWERS, TOWER_H, visualHeight, WALL_H, type Struct } from '../../shared/compound';
import { HANGAR } from '../../shared/mapgen';
import { PARKED } from '../px/compound2d';
import { groundLevel } from '../px/terrain2d';
import { facadeTex, plateTex, roofTex, type Facade, type Roof } from './textures';

/**
 * The Mega Hangar's base as solid buildings for the cab's 3D view: the great hangar (700 m of wall under an arched
 * roof on steel trusses, rows of lamps, gantry cranes riding the bays, the 300 m door), the fortified wall with its
 * walkway and towers (their guns turning to targets), and every building by what it is: fuel tanks, barracks with
 * pitched roofs, workshops and garages with roller doors, the command post with its radar and aerials, Quonset huts
 * in their streets, the water tower, the radio mast, earth-covered ammo bunkers, the clinic, the mess with its
 * chimneys, the flag on its pole. Outside the gate, the front: bunkers with twin guns, tanks dug in behind sandbags,
 * the sandbag line, rows of tank traps and searchlight masts. Helipads with the gunships, the motor pool's vehicles
 * in their rows, and the docking pads.
 */

const mat = {
  concrete: new THREE.MeshStandardMaterial({ map: facadeTex('bunker'), color: '#b8b8b0', roughness: 0.92 }),
  concreteV: new THREE.MeshStandardMaterial({ map: facadeTex('concrete'), color: '#c8c4bc', roughness: 0.9, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardMaterial({ map: plateTex(), color: '#7a828c', roughness: 0.55, metalness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2e34', roughness: 0.6, metalness: 0.5 }),
  truss: new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.6, metalness: 0.6 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#d8a020', roughness: 0.5, metalness: 0.4 }),
  roof: new THREE.MeshStandardMaterial({ map: roofTex('sheet'), color: '#9aa0a8', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: '#fff0c0', toneMapped: false }),
  red: new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false }),
  olive: new THREE.MeshStandardMaterial({ color: '#5a6040', roughness: 0.8, metalness: 0.2 }),
  sand: new THREE.MeshStandardMaterial({ color: '#b8a070', roughness: 1 }),
  earth: new THREE.MeshStandardMaterial({ color: '#7a6a4a', roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: '#a8d0c8', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.45 }),
  white: new THREE.MeshStandardMaterial({ color: '#e8e8e0', roughness: 0.7 }),
  flag: new THREE.MeshStandardMaterial({ color: '#b02020', roughness: 0.9, side: THREE.DoubleSide }),
  paint: new THREE.MeshBasicMaterial({ color: '#e8c030', transparent: true, opacity: 0.85 }),
};
const facadeM = new Map<string, THREE.MeshStandardMaterial>();
function facade(k: Facade, tint: string): THREE.MeshStandardMaterial {
  const key = `${k}|${tint}`;
  let m = facadeM.get(key);
  if (!m) facadeM.set(key, (m = new THREE.MeshStandardMaterial({ map: facadeTex(k), color: tint, roughness: 0.88 })));
  return m;
}
const roofM = new Map<string, THREE.MeshStandardMaterial>();
function roofMat(k: Roof, tint: string): THREE.MeshStandardMaterial {
  const key = `${k}|${tint}`;
  let m = roofM.get(key);
  if (!m) roofM.set(key, (m = new THREE.MeshStandardMaterial({ map: roofTex(k), color: tint, roughness: 0.7, metalness: k === 'sheet' ? 0.4 : 0, side: THREE.DoubleSide })));
  return m;
}

/** A box with world-metre UVs (so facade textures tile at their real size: 8 m wide, 7 m to a pair of floors). */
function wallBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const su = ny > 0.5 ? w / 8 : nx > 0.5 ? d / 8 : w / 8;
    const sv = ny > 0.5 ? d / 8 : h / 7;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export class Compound3D {
  readonly root = new THREE.Group();
  private built = false;
  private towerGuns: THREE.Object3D[] = [];
  private frontGuns: THREE.Object3D[] = [];
  private cranes: { o: THREE.Object3D; trolley: THREE.Object3D; bx: number; i: number }[] = [];
  private flag: THREE.Mesh | null = null;
  private gunships: THREE.Group[] = [];
  private frontWorks: { o: THREE.Object3D; x: number; y: number }[] = [];
  private editSeen = -1;
  hx = 0;
  hy = 0;

  /** Places the base against the scene origin and moves what moves. */
  update(g: Game, ox: number, oz: number, time: number): void {
    const h = g.mode === 'world' ? g.gen.hangar : null;
    if (!h) {
      this.root.visible = false;
      return;
    }
    if (!this.built || h.x !== this.hx || h.y !== this.hy) this.build(h.x, h.y);
    this.root.visible = true;
    this.root.position.set(h.x - ox, 0, h.y - oz);
    const cs = g.compound;
    this.towerGuns.forEach((t, i) => {
      t.rotation.y = -(cs.towers[i]?.aim ?? Math.PI / 2);
    });
    this.frontGuns.forEach((t, i) => {
      t.rotation.y = -(cs.front[i]?.aim ?? Math.PI / 2);
    });
    for (const c of this.cranes) {
      const D = HANGAR.d / 2;
      c.o.position.z = Math.max(-D + 40, Math.min(D - 70, -20 + 140 * Math.sin(time * 0.04 + c.i * 2.1)));
      c.trolley.position.x = 62 * Math.sin(time * 0.07 + c.i * 1.3);
    }
    if (this.flag) {
      const p = this.flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin(x * 0.5 - time * 5) * x * 0.12);
      }
      p.needsUpdate = true;
    }
    // Gunships where they are (landed, lifting, out on station).
    cs.air.forEach((a, i) => {
      const gs = this.gunships[i];
      if (!gs) return;
      gs.position.set(a.x, groundLevel(h.x + a.x, h.y + a.y) + a.z + 1.5, a.y);
      gs.rotation.y = -a.rot;
      const rotor = gs.getObjectByName('rotor');
      if (rotor) rotor.rotation.y = time * (a.state === 'parked' ? 0.5 : 30);
    });
    // Sandbags and tank traps a Titan has flattened are gone.
    if (g.editCount !== this.editSeen) {
      this.editSeen = g.editCount;
      for (const f of this.frontWorks) f.o.visible = g.map.getObs(Math.floor(h.x + f.x), Math.floor(h.y + f.y)) !== 0;
    }
  }

  private build(hx: number, hy: number): void {
    this.root.clear();
    this.towerGuns = [];
    this.frontGuns = [];
    this.cranes = [];
    this.gunships = [];
    this.frontWorks = [];
    this.hx = hx;
    this.hy = hy;
    this.built = true;
    const gl = (x: number, y: number): number => groundLevel(hx + x, hy + y);
    this.hangar(gl);
    this.walls(gl);
    for (const s of STRUCTS) this.struct(s, gl);
    this.front(gl);
    this.pads(gl);
  }

  /** The great hangar: walls, the arched roof on trusses, lamps, the gantry cranes, the door frame. */
  private hangar(gl: (x: number, y: number) => number): void {
    const W = HANGAR.w / 2, D = HANGAR.d / 2, eave = HANGAR_EAVE, apex = HANGAR_APEX;
    const base = gl(0, 0) - 1;
    const g = new THREE.Group();
    g.position.y = base;
    const wallH = eave + 1;
    const add = (m: THREE.Object3D): void => {
      g.add(m);
    };
    // Walls (the south one either side of the door) with buttresses.
    add(mesh(wallBox(8, wallH, HANGAR.d), mat.concrete, -W, wallH / 2, 0));
    add(mesh(wallBox(8, wallH, HANGAR.d), mat.concrete, W, wallH / 2, 0));
    add(mesh(wallBox(HANGAR.w + 8, wallH, 8), mat.concrete, 0, wallH / 2, -D));
    const side = (HANGAR.w - HANGAR.door) / 2;
    for (const s of [-1, 1]) add(mesh(wallBox(side, wallH, 8), mat.concrete, s * (HANGAR.door / 2 + side / 2), wallH / 2, D));
    // Over the door: the lintel, with the hangar number and hazard stripes.
    add(mesh(wallBox(HANGAR.door + 8, 14, 10), mat.steel, 0, eave - 6, D));
    for (let i = 0; i < 20; i++) add(mesh(new THREE.BoxGeometry(HANGAR.door / 20 - 2, 2.4, 0.3), i & 1 ? mat.dark : mat.yellow, -HANGAR.door / 2 + (i + 0.5) * (HANGAR.door / 20), eave - 12, D + 5.2));
    for (let k = 0; k < 9; k++) {
      for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(10, wallH * 0.85, 6), mat.concrete, s * (W + 6), wallH * 0.42, -D + 20 + k * (HANGAR.d - 40) / 8));
    }
    // The arched roof: a barrel vault from wall to wall, sheet metal on the outside.
    const segs = 24;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = -W - 4 + t * (HANGAR.w + 8);
      const y = eave + (apex - eave) * Math.sin(t * Math.PI);
      pts.push(new THREE.Vector2(x, y));
    }
    const roofG = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      for (const z of [-D - 4, D + 6]) {
        pos.push(pts[i].x, pts[i].y, z);
        uv.push((i / segs) * (HANGAR.w / 8), (z + D) / 8);
      }
    }
    for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    roofG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roofG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    roofG.setIndex(idx);
    roofG.computeVertexNormals();
    add(mesh(roofG, roofMat('sheet', '#6e9054'), 0, 0, 0));
    // The gable ends (north full, south over the door).
    for (const z of [-D - 4, D + 5]) {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0].x, eave);
      for (const p of pts) shape.lineTo(p.x, p.y);
      shape.lineTo(pts[segs].x, eave);
      shape.closePath();
      add(mesh(new THREE.ShapeGeometry(shape), mat.concreteV, 0, 0, z));
    }
    // Trusses every 30 m across the span, and lamps hanging from them.
    const truss: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    for (let z = -D + 15; z < D; z += 30) {
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        truss.push(new THREE.BoxGeometry(len, 1.2, 1.2).rotateZ(Math.atan2(b.y - a.y, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 1, z));
        // Web members down to the tie beam.
        if (i % 2 === 0) truss.push(new THREE.BoxGeometry(0.6, a.y - eave + 0.5, 0.6).translate(a.x, (a.y + eave) / 2, z));
      }
      truss.push(new THREE.BoxGeometry(HANGAR.w, 1.2, 1.2).translate(0, eave, z));
      for (let x = -W + 35; x < W; x += 70) lamps.push(new THREE.BoxGeometry(6, 0.8, 2.5).translate(x, eave - 2, z));
    }
    const tm = new THREE.Mesh(mergeGeometries(truss)!, mat.truss);
    tm.castShadow = true;
    add(tm);
    add(new THREE.Mesh(mergeGeometries(lamps)!, mat.lamp));
    // Gantry cranes on rails down the three bays.
    [-HANGAR.w * 0.3, 0, HANGAR.w * 0.3].forEach((bx, i) => {
      for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(1.6, 1.6, HANGAR.d - 20), mat.dark, bx + s * 104, eave - 8, 0));
      const beam = new THREE.Group();
      beam.add(mesh(new THREE.BoxGeometry(212, 4, 5), mat.yellow, bx, eave - 8, 0));
      for (let k = 0; k < 10; k++) beam.add(mesh(new THREE.BoxGeometry(1.2, 4.2, 5.2), mat.dark, bx - 100 + k * 22, eave - 8, 0));
      const trolley = new THREE.Group();
      trolley.add(mesh(new THREE.BoxGeometry(10, 5, 8), mat.steel, 0, eave - 12, 0));
      trolley.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 30, 4), mat.dark, 0, eave - 29, 0));
      trolley.add(mesh(new THREE.BoxGeometry(3, 2, 3), mat.yellow, 0, eave - 45, 0));
      trolley.position.x = 0;
      const tg = new THREE.Group();
      tg.position.x = bx;
      tg.add(trolley);
      beam.add(tg);
      add(beam);
      this.cranes.push({ o: beam, trolley, bx, i });
    });
    this.root.add(g);
  }

  /** The outer wall with its walkway and crenels, the towers and their guns, the gate's frame. */
  private walls(gl: (x: number, y: number) => number): void {
    const C = COMPOUND, H = WALL_H;
    const g = new THREE.Group();
    const b = gl(0, 400) - 1.5;
    const seg = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const a = Math.atan2(z1 - z0, x1 - x0);
      const m = mesh(wallBox(len, H, C.wall), mat.concrete, (x0 + x1) / 2, b + H / 2, (z0 + z1) / 2, -a);
      g.add(m);
      // Crenellations along the top.
      const cren: THREE.BufferGeometry[] = [];
      for (let t = 2; t < len - 2; t += 6) cren.push(new THREE.BoxGeometry(3, 2, C.wall + 0.6).translate(-len / 2 + t, H / 2 + 1, 0));
      if (cren.length) {
        const cm = mesh(mergeGeometries(cren)!, mat.concrete, (x0 + x1) / 2, b + H / 2, (z0 + z1) / 2, -a);
        g.add(cm);
      }
    };
    const w = C.wall / 2;
    seg(C.x0, C.y0 + w, C.x1, C.y0 + w);
    seg(C.x0 + w, C.y0, C.x0 + w, C.y1);
    seg(C.x1 - w, C.y0, C.x1 - w, C.y1);
    seg(C.x0, C.y1 - w, -C.gateHalf, C.y1 - w);
    seg(C.gateHalf, C.y1 - w, C.x1, C.y1 - w);
    // Towers: the gate's two bastions with a gun on each; along the wall, watchtowers: a plinth, a slim shaft, a
    // glazed cabin with its gun and a peaked roof.
    for (const t of TOWERS) {
      let th = GATE_TOWER_H;
      if (t.gate) {
        g.add(mesh(wallBox(t.half * 2, th, t.half * 2), mat.concrete, t.x, b + th / 2, t.y));
        g.add(mesh(new THREE.BoxGeometry(t.half * 2 + 2, 1.5, t.half * 2 + 2), mat.dark, t.x, b + th + 0.7, t.y));
      } else {
        th = TOWER_H.shaft;
        g.add(mesh(wallBox(t.half * 2, WALL_H, t.half * 2), mat.concrete, t.x, b + WALL_H / 2, t.y));
        g.add(mesh(wallBox(9, TOWER_H.shaft - WALL_H, 9), mat.concrete, t.x, b + (WALL_H + TOWER_H.shaft) / 2, t.y));
        g.add(mesh(new THREE.BoxGeometry(22, 1, 22), mat.dark, t.x, b + TOWER_H.shaft, t.y));
        g.add(mesh(new THREE.BoxGeometry(17, TOWER_H.cabin - TOWER_H.shaft - 1, 17), mat.glass, t.x, b + (TOWER_H.shaft + TOWER_H.cabin) / 2, t.y));
        g.add(mesh(new THREE.ConeGeometry(17.5, TOWER_H.peak - TOWER_H.cabin, 4).rotateY(Math.PI / 4), mat.olive, t.x, b + (TOWER_H.cabin + TOWER_H.peak) / 2, t.y));
      }
      const gun = new THREE.Group();
      gun.position.set(t.x, b + th + 1.4, t.y);
      gun.add(mesh(new THREE.CylinderGeometry(2.4, 2.8, 2, 12), mat.olive, 0, 1, 0));
      gun.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 9, 8).rotateZ(-Math.PI / 2).translate(4.5, 1.6, 0), mat.dark, 0, 0, 0));
      g.add(gun);
      this.towerGuns.push(gun);
      g.add(mesh(new THREE.SphereGeometry(0.7, 8, 6), mat.red, t.x, b + (t.gate ? th + 2.5 : TOWER_H.peak + 0.5), t.y));
    }
    this.root.add(g);
  }

  private struct(s: Struct, gl: (x: number, y: number) => number): void {
    const cx = (s.x0 + s.x1) / 2, cz = (s.y0 + s.y1) / 2, w = s.x1 - s.x0, d = s.y1 - s.y0, h = visualHeight(s);
    const b = gl(cx, cz) - 0.6;
    const g = new THREE.Group();
    const flat = (fac: Facade, tint: string, roof: Roof, rtint: string): void => {
      g.add(mesh(wallBox(w, h, d), facade(fac, tint), cx, b + h / 2, cz));
      g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat(roof, rtint), cx, b + h + 0.3, cz));
      g.add(mesh(new THREE.BoxGeometry(w + 0.6, 1, 0.5), mat.concreteV, cx, b + h + 0.8, s.y0 - 0.1));
      g.add(mesh(new THREE.BoxGeometry(w + 0.6, 1, 0.5), mat.concreteV, cx, b + h + 0.8, s.y1 + 0.1));
    };
    const pitched = (fac: Facade, tint: string, roof: Roof, rtint: string): void => {
      g.add(mesh(wallBox(w, h * 0.7, d), facade(fac, tint), cx, b + (h * 0.7) / 2, cz));
      const along = w >= d;
      const span = along ? d : w, len = along ? w : d;
      const rise = Math.min(span * 0.35, h * 0.5);
      const sh = new THREE.Shape([new THREE.Vector2(-span / 2 - 0.8, 0), new THREE.Vector2(0, rise), new THREE.Vector2(span / 2 + 0.8, 0)]);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 1.6, bevelEnabled: false });
      rg.translate(0, 0, -(len + 1.6) / 2);
      if (along) rg.rotateY(Math.PI / 2);
      const uvs = rg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) / 8, uvs.getY(i) / 8);
      g.add(mesh(rg, roofMat(roof, rtint), cx, b + h * 0.7, cz));
    };
    switch (s.kind) {
      case 'tank': {
        // A fuel tank: a steel drum with a shallow dome, a ladder and a walkway round the top.
        const r = Math.min(w, d) / 2 - 1;
        g.add(mesh(new THREE.CylinderGeometry(r, r, h, 28), mat.steel, cx, b + h / 2, cz));
        g.add(mesh(new THREE.SphereGeometry(r, 28, 8, 0, Math.PI * 2, 0, 0.5), mat.steel, cx, b + h - r * 0.88, cz));
        g.add(mesh(new THREE.TorusGeometry(r + 0.4, 0.2, 6, 32).rotateX(Math.PI / 2), mat.dark, cx, b + h + 0.2, cz));
        g.add(mesh(new THREE.BoxGeometry(0.8, h, 0.4), mat.dark, cx + r + 0.3, b + h / 2, cz));
        break;
      }
      case 'quonset': {
        // A Quonset hut: a half-round of corrugated iron with a door and windows at the end.
        const along = w >= d, len = along ? w : d, r = (along ? d : w) / 2;
        const cg = new THREE.CylinderGeometry(r, r, len, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
        if (!along) cg.rotateY(Math.PI / 2);
        const uvs = cg.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * (len / 8), uvs.getY(i) * 3);
        g.add(mesh(cg, roofMat('sheet', '#b0b4a8'), cx, b + 0.4, cz));
        for (const e of [-1, 1]) {
          const ec = new THREE.CircleGeometry(r, 20, 0, Math.PI);
          const m = mesh(ec, mat.concreteV, along ? cx + e * len / 2 : cx, b + 0.4, along ? cz : cz + e * len / 2, along ? Math.PI / 2 : 0);
          g.add(m);
          g.add(mesh(new THREE.BoxGeometry(along ? 0.3 : 2.4, 2.6, along ? 2.4 : 0.3), mat.dark, along ? cx + e * (len / 2 + 0.1) : cx, b + 1.7, along ? cz : cz + e * (len / 2 + 0.1)));
        }
        break;
      }
      case 'barracks':
      case 'home':
        pitched('planks', '#c8c0a8', 'sheet', '#8a9098');
        break;
      case 'workshop':
      case 'garage':
      case 'warehouse': {
        flat('iron', '#b8bcc0', 'sheet', '#a0a4a8');
        // Roller doors along the long side.
        const n = Math.max(1, Math.floor(w / 24));
        for (let i = 0; i < n; i++) g.add(mesh(new THREE.BoxGeometry(12, Math.min(9, h * 0.8), 0.4), mat.dark, s.x0 + (i + 0.5) * (w / n), b + Math.min(9, h * 0.8) / 2, s.y1 + 0.2));
        break;
      }
      case 'armory':
      case 'depot':
      case 'store':
      case 'gatehouse':
        flat('bunker', '#c8c4b8', 'tar', '#9a9890');
        break;
      case 'command': {
        flat('concrete', '#d0ccc4', 'tar', '#8a8880');
        g.add(mesh(new THREE.SphereGeometry(6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.white, cx + w * 0.2, b + h + 0.5, cz));
        for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, 18 + i * 6, 6), mat.dark, s.x0 + 8 + i * 10, b + h + 9 + i * 3, s.y0 + 8));
        break;
      }
      case 'clinic':
        flat('plaster', '#f0f0ea', 'tar', '#c8c8c0');
        g.add(mesh(new THREE.BoxGeometry(10, 2.5, 0.2), new THREE.MeshBasicMaterial({ color: '#d02020' }), cx, b + h * 0.6, s.y1 + 0.2));
        g.add(mesh(new THREE.BoxGeometry(2.5, 10, 0.2), new THREE.MeshBasicMaterial({ color: '#d02020' }), cx, b + h * 0.6, s.y1 + 0.25));
        break;
      case 'mess':
      case 'bar':
        flat('brick', '#ffffff', 'tar', '#8a8680');
        for (let j = 0; j < 3; j++) g.add(mesh(new THREE.CylinderGeometry(1, 1.2, 8, 10), mat.dark, s.x0 + w * (0.25 + j * 0.25), b + h + 4, s.y0 + d * 0.3));
        break;
      case 'greenhouse':
        g.add(mesh(new THREE.BoxGeometry(w, h, d), mat.glass, cx, b + h / 2, cz));
        break;
      case 'ammo': {
        // Earth-covered magazine: a turfed mound with a concrete front and steel doors.
        const r = Math.min(w, d) / 2;
        const mg = new THREE.CylinderGeometry(r, r, w, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
        g.add(mesh(mg, mat.earth, cx, b, cz));
        g.add(mesh(wallBox(w, h * 0.8, 1.5), mat.concrete, cx, b + h * 0.4, s.y1));
        g.add(mesh(new THREE.BoxGeometry(6, h * 0.55, 0.3), mat.olive, cx, b + h * 0.28, s.y1 + 0.8));
        break;
      }
      case 'watertower': {
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, h * 0.7, 6), mat.dark, cx + lx * w * 0.3, b + h * 0.35, cz + lz * d * 0.3));
        g.add(mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.45, h * 0.3, 20), mat.steel, cx, b + h * 0.85, cz));
        g.add(mesh(new THREE.ConeGeometry(w * 0.48, h * 0.08, 20), mat.steel, cx, b + h * 1.04, cz));
        break;
      }
      case 'plant': {
        flat('iron', '#a8acb0', 'sheet', '#8a8e92');
        for (const fx of [0.2, 0.32]) g.add(mesh(new THREE.CylinderGeometry(2.2, 2.6, 52 - h, 12), mat.dark, s.x0 + w * fx, b + h + (52 - h) / 2, s.y0 + d * 0.3));
        break;
      }
      case 'stack': {
        // A cooling tower: a waisted concrete shell.
        const r0 = Math.min(w, d) / 2 - 1, H = 84;
        const prof: THREE.Vector2[] = [];
        for (let k = 0; k <= 12; k++) {
          const z = (H * k) / 12;
          prof.push(new THREE.Vector2(r0 * (1 - 0.32 * Math.sin(Math.min(1, z / (H * 0.8)) * Math.PI * 0.62) + Math.max(0, z / H - 0.8) * 0.3), z));
        }
        g.add(mesh(new THREE.LatheGeometry(prof, 28), mat.concreteV, cx, b, cz));
        break;
      }
      case 'radar': {
        g.add(mesh(wallBox(w, 14, d), facade('concrete', '#c8c4bc'), cx, b + 7, cz));
        g.add(mesh(new THREE.SphereGeometry(Math.min(w, d) / 2 - 3, 24, 16), mat.white, cx, b + 14 + (Math.min(w, d) / 2 - 3) * 0.25, cz));
        break;
      }
      case 'antenna':
      case 'mast': {
        g.add(mesh(new THREE.CylinderGeometry(0.3, 1.2, h, 4), mat.dark, cx, b + h / 2, cz));
        for (let k = 1; k < 6; k++) g.add(mesh(new THREE.SphereGeometry(0.5, 6, 4), mat.red, cx, b + (h * k) / 5, cz));
        break;
      }
      case 'flagpole': {
        g.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, h, 8), mat.white, cx, b + h / 2, cz));
        const fg = new THREE.PlaneGeometry(9, 5.5, 12, 4).translate(4.5, 0, 0);
        this.flag = mesh(fg, mat.flag, cx, b + h - 3.5, cz);
        g.add(this.flag);
        break;
      }
      case 'statue':
        g.add(mesh(new THREE.BoxGeometry(w, h * 0.3, d), mat.concreteV, cx, b + h * 0.15, cz));
        g.add(mesh(new THREE.CylinderGeometry(w * 0.15, w * 0.25, h * 0.7, 8), mat.steel, cx, b + h * 0.65, cz));
        break;
      default:
        flat('concrete', '#c8c4bc', 'tar', '#8a8880');
    }
    this.root.add(g);
  }

  /** The front outside the gate. */
  private front(gl: (x: number, y: number) => number): void {
    const g = new THREE.Group();
    const bagG = new THREE.SphereGeometry(1, 8, 5).scale(0.7, 0.28, 0.4);
    FRONT_STRUCTS.forEach((s) => {
      const cx = (s.x0 + s.x1) / 2, cz = (s.y0 + s.y1) / 2, w = s.x1 - s.x0, d = s.y1 - s.y0;
      const b = gl(cx, cz) - 0.3;
      if (s.kind === 'sandbag') {
        // Sandbags laid in courses.
        const along = w >= d, len = along ? w : d;
        const bags: THREE.BufferGeometry[] = [];
        for (let row = 0; row < 3; row++) for (let t = 0.7 + (row & 1) * 0.7; t < len - 0.5; t += 1.4) {
          const g2 = bagG.clone().rotateY(along ? 0 : Math.PI / 2).translate(along ? -len / 2 + t : 0, row * 0.5 + 0.28, along ? 0 : -len / 2 + t);
          bags.push(g2);
        }
        const m = mesh(mergeGeometries(bags)!, mat.sand, cx, b, cz);
        g.add(m);
        this.frontWorks.push({ o: m, x: cx, y: cz });
      } else if (s.kind === 'hedgehog') {
        // A Czech hedgehog: three steel beams crossed.
        const parts = [0, 1, 2].map((i) => new THREE.BoxGeometry(0.35, 3.4, 0.35).rotateZ(i === 0 ? 0.95 : i === 1 ? -0.95 : 0).rotateX(i === 2 ? 0.95 : 0).rotateY(i * 1.05).translate(0, 1.1, 0));
        const m = mesh(mergeGeometries(parts)!, mat.dark, cx, b, cz);
        g.add(m);
        this.frontWorks.push({ o: m, x: cx, y: cz });
      } else if (s.kind === 'bunker') {
        g.add(mesh(wallBox(w, s.h * 0.5, d), mat.concrete, cx, b + (s.h * 0.5) / 2, cz));
        g.add(mesh(new THREE.BoxGeometry(w * 0.7, 0.8, 0.4), mat.dark, cx, b + s.h * 0.35, s.y1 + 0.1));
      } else if (s.kind === 'searchlight') {
        g.add(mesh(new THREE.CylinderGeometry(0.2, 0.5, s.h * 0.5, 6), mat.dark, cx, b + s.h * 0.25, cz));
        g.add(mesh(new THREE.CylinderGeometry(1.2, 0.9, 1.6, 12).rotateX(Math.PI / 2 - 0.4), mat.steel, cx, b + s.h * 0.5 + 0.6, cz));
        g.add(mesh(new THREE.CircleGeometry(1.1, 12).rotateX(-0.4), mat.lamp, cx, b + s.h * 0.5 + 0.9, cz + 0.8));
      }
    });
    // The guns: twin guns on the bunkers, tanks dug in behind the sandbags.
    FRONT_GUNS.forEach((gn) => {
      const b = gl(gn.x, gn.y);
      const tur = new THREE.Group();
      if (gn.kind === 'tank') {
        const hull = mesh(new THREE.BoxGeometry(9, 2.4, 4.4), mat.olive, gn.x, b + 1.6, gn.y);
        g.add(hull);
        g.add(mesh(new THREE.BoxGeometry(9.4, 1.4, 1.2), mat.dark, gn.x, b + 0.8, gn.y - 2.4));
        g.add(mesh(new THREE.BoxGeometry(9.4, 1.4, 1.2), mat.dark, gn.x, b + 0.8, gn.y + 2.4));
        tur.position.set(gn.x, b + 2.8, gn.y);
        tur.add(mesh(new THREE.CylinderGeometry(2, 2.3, 1.4, 12), mat.olive, 0, 0.7, 0));
        tur.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 7, 8).rotateZ(-Math.PI / 2).translate(4, 0.9, 0), mat.dark, 0, 0, 0));
      } else {
        tur.position.set(gn.x, b + 6.3, gn.y);
        tur.add(mesh(new THREE.BoxGeometry(4.5, 1.8, 4.5), mat.olive, 0, 0.9, 0));
        for (const z of [-0.8, 0.8]) tur.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 6, 8).rotateZ(-Math.PI / 2).translate(4.5, 1.2, z), mat.dark, 0, 0, 0));
      }
      g.add(tur);
      this.frontGuns.push(tur);
    });
    this.root.add(g);
  }

  /** Helipads with gunships, the motor pool's rows, the docking pads' markings. */
  private pads(gl: (x: number, y: number) => number): void {
    const g = new THREE.Group();
    for (const p of HELIPADS) {
      const b = gl(p.x, p.y);
      g.add(mesh(new THREE.CylinderGeometry(20, 20, 0.3, 40), mat.concreteV, p.x, b + 0.15, p.y));
      g.add(mesh(new THREE.RingGeometry(17, 18.2, 40).rotateX(-Math.PI / 2), mat.paint, p.x, b + 0.32, p.y));
      for (const [w, d, x] of [[1.6, 14, -4], [1.6, 14, 4], [8, 1.6, 0]] as [number, number, number][]) g.add(mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat.paint, p.x + x, b + 0.33, p.y));
    }
    // Gunships (moved each frame).
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Group();
      s.add(mesh(new THREE.CapsuleGeometry(1.8, 9, 6, 12).rotateZ(Math.PI / 2), mat.olive, 0, 0, 0));
      s.add(mesh(new THREE.BoxGeometry(6, 0.3, 1.2), mat.olive, -6, 0.5, 0));
      s.add(mesh(new THREE.BoxGeometry(1.6, 2.4, 0.3), mat.olive, -8.6, 1.4, 0));
      s.add(mesh(new THREE.BoxGeometry(2.4, 1.2, 2.6), mat.glass, 4.2, 0.5, 0));
      for (const z of [-2.6, 2.6]) s.add(mesh(new THREE.BoxGeometry(3, 0.4, 2), mat.dark, 0.5, -0.6, z));
      const rotor = new THREE.Group();
      rotor.name = 'rotor';
      rotor.position.y = 2.4;
      for (let k = 0; k < 4; k++) rotor.add(mesh(new THREE.BoxGeometry(14, 0.12, 0.6).rotateY((k * Math.PI) / 4), mat.dark, 0, 0, 0));
      s.add(rotor);
      g.add(s);
      this.gunships.push(s);
    }
    // The motor pool's vehicles in their rows.
    for (const pk of PARKED) {
      const b = gl(pk.x, pk.y);
      const len = pk.kind === 'truck' ? 9 : pk.kind === 'jeep' ? 4.5 : pk.kind === 'artillery' ? 10 : 8;
      const col = pk.kind === 'truck' || pk.kind === 'jeep' ? mat.olive : mat.olive;
      g.add(mesh(new THREE.BoxGeometry(len, 2.2, len * 0.45), col, pk.x, b + 1.5, pk.y, -Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(len * 0.9, 1, len * 0.5), mat.dark, pk.x, b + 0.5, pk.y, -Math.PI / 2));
      if (pk.kind === 'tank' || pk.kind === 'artillery') {
        g.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.2, 12), col, pk.x, b + 3.1, pk.y));
        g.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, pk.kind === 'artillery' ? 9 : 6, 8).rotateX(Math.PI / 2).translate(0, 3.3, pk.kind === 'artillery' ? 4.5 : 3), mat.dark, pk.x, b, pk.y));
      } else if (pk.kind === 'truck') g.add(mesh(new THREE.BoxGeometry(len * 0.45, 1.4, len * 0.6), mat.earth, pk.x, b + 3.2, pk.y - len * 0.2));
    }
    // Docking pads: yellow borders.
    for (const p of PADS) {
      const b = gl(p.x, p.y);
      for (const [w, d, x, z] of [[PAD_W, 1.5, 0, -PAD_L / 2], [PAD_W, 1.5, 0, PAD_L / 2], [1.5, PAD_L, -PAD_W / 2, 0], [1.5, PAD_L, PAD_W / 2, 0]] as [number, number, number, number][]) {
        g.add(mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat.paint, p.x + x, b + 0.2, p.y + z));
      }
    }
    this.root.add(g);
  }
}
