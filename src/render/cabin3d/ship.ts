import * as THREE from 'three';
import { MODULES } from '../../game/defs';
import type { Tank } from '../../game/tank';
import { WEAPONS } from '../../shared/weapons';
import { bodyOutline, crawlerRects, stackSpots, titanTop, topPalette } from '../px/titanTop';
import { facadeTex, glowTex, plateTex, treadTex } from './textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '../px/pixels';

/**
 * A Titan (yours or a rival's) as a solid model: the hull raised from its outline to the roof, the painted deck on
 * top, riveted plate down the flanks, eight crawler banks whose treads roll with the speed, the exhaust stacks,
 * the bridge at the bow, and every gun on the roof as a real turret turned where it's aiming, barrels recoiling.
 */

export interface ShipModel {
  group: THREE.Group;
  L: number;
  W: number;
  H: number;
  /** Turret pivots by module id. */
  turrets: Map<number, { yaw: THREE.Object3D; barrels: THREE.Object3D[]; reach: number }>;
  treads: THREE.Texture;
  stacks: THREE.Vector3[];
  key: string;
  /** The bridge at the bow (hidden while you're sitting in it). */
  cab: THREE.Object3D;
  /** Radar dishes (turned each frame). */
  radars: THREE.Object3D[];
  /** Where people stand and walk on the deck (ship-local): the nests' soldiers, the deckhands' beats. */
  posts: { lx: number; lz: number; face: number; kind: 'soldier' | 'crew' }[];
  beats: { ax: number; az: number; bx: number; bz: number }[];
  /** The searchlight on the bridge roof (the yoke turns, the drum tilts; the lens lights up). */
  search: { yoke: THREE.Object3D; drum: THREE.Object3D; lens: THREE.Object3D; glass: THREE.MeshBasicMaterial };
  /** Amber beacons (their domes and glows) and the deck's lamp posts, switched from the cab. */
  beacons: { mat: THREE.MeshBasicMaterial; glows: THREE.Sprite[] };
  lampMat: THREE.MeshBasicMaterial;
}

const steel = new THREE.MeshStandardMaterial({ color: '#8a929c', roughness: 0.45, metalness: 0.6 });
const concrete = new THREE.MeshStandardMaterial({ map: facadeTex('bunker'), color: '#8a9098', roughness: 0.8, metalness: 0.2 });
const tower = new THREE.MeshStandardMaterial({ map: facadeTex('concrete'), color: '#6a7482', roughness: 0.6, metalness: 0.35 });
const sandbag = new THREE.MeshStandardMaterial({ color: '#8a7a5a', roughness: 1 });
const cont = [new THREE.MeshStandardMaterial({ color: '#8a4a2a', roughness: 0.7, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: '#2a4a6a', roughness: 0.7, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: '#4a5a3a', roughness: 0.7, metalness: 0.3 })];
const skylight = new THREE.MeshStandardMaterial({ color: '#9ad0e0', roughness: 0.05, metalness: 0.4, emissive: '#1a3a48', emissiveIntensity: 0.8, transparent: true, opacity: 0.8 });
const shieldGlow = new THREE.MeshBasicMaterial({ color: '#40c4ff', transparent: true, opacity: 0.8, toneMapped: false });
const teslaGlow = new THREE.MeshBasicMaterial({ color: '#b0f0ff', toneMapped: false });
const redLamp = new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false });

function insidePoly(pts: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The roof as more than paint: the command tower mid-deck (two storeys of windows, a mast of aerials and a radar),
 * the Spine's skylight down the centreline glowing from below, railings and lamp posts round the edge, and in the
 * open cells vents, hatches, container stacks, crates and gas bottles, aerial masts with red lamps. Each roof
 * module gets its own shape: nests are sandbag rings, the radar a turning dish, the shield projector a glowing
 * sphere, the tesla coil its rings, the drone bay and jet hangar low sheds.
 */
function dressDeck(t: Tank, group: THREE.Group, H: number, L: number, W: number, outline: [number, number][], lampMat: THREE.Material): { radars: THREE.Object3D[]; posts: ShipModel['posts']; beats: ShipModel['beats'] } {
  const cell = t.cell, cols = t.cols, rows = t.rows;
  const occ = new Uint8Array(cols * rows);
  for (const m of t.modules) {
    if (m.deck !== 0) continue;
    const d = MODULES[m.key];
    for (let y = m.cy; y < m.cy + d.h; y++) for (let x = m.cx; x < m.cx + d.w; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) occ[y * cols + x] = 1;
  }
  const at = (cx: number, cy: number): [number, number] => [(rows / 2 - (cy + 0.5)) * cell, (cx + 0.5 - cols / 2) * cell];
  const inside = (lx: number, lz: number, pad = 3): boolean => insidePoly(outline, lx + pad, lz) && insidePoly(outline, lx - pad, lz) && insidePoly(outline, lx, lz + pad) && insidePoly(outline, lx, lz - pad);
  const steelG: THREE.BufferGeometry[] = [], darkG: THREE.BufferGeometry[] = [], brassG: THREE.BufferGeometry[] = [], lampG: THREE.BufferGeometry[] = [], redG: THREE.BufferGeometry[] = [];
  const contG: THREE.BufferGeometry[][] = [[], [], []];
  const radars: THREE.Object3D[] = [];
  const posts: ShipModel['posts'] = [];
  const beats: ShipModel['beats'] = [];
  const free: [number, number][] = [];
  // The command tower: the free 4 x 3 cells nearest a third of the way forward on the centreline.
  let tw: [number, number] | null = null;
  let best = 1e9;
  for (let cy = 0; cy + 3 <= rows; cy++) {
    for (let cx = 0; cx + 4 <= cols; cx++) {
      let ok = true;
      for (let y = cy; y < cy + 3 && ok; y++) for (let x = cx; x < cx + 4; x++) if (occ[y * cols + x]) ok = false;
      if (!ok) continue;
      const [lx, lz] = at(cx + 1.5, cy + 1);
      if (!inside(lx, lz, 10)) continue;
      const d = Math.abs(lx - L * 0.22) + Math.abs(lz) * 2;
      if (d < best) {
        best = d;
        tw = [cx, cy];
      }
    }
  }
  if (tw) {
    const [lx, lz] = at(tw[0] + 1.5, tw[1] + 1);
    for (let y = tw[1]; y < tw[1] + 3; y++) for (let x = tw[0]; x < tw[0] + 4; x++) occ[y * cols + x] = 2;
    const tw1 = new THREE.BoxGeometry(cell * 3, 6, cell * 3.6).translate(lx, H + 3, lz);
    const tw2 = new THREE.BoxGeometry(cell * 2.2, 5, cell * 2.6).translate(lx - cell * 0.3, H + 8.5, lz);
    for (const g of [tw1, tw2]) {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i));
    }
    const tm = new THREE.Mesh(mergeGeometries([tw1, tw2])!, tower);
    tm.castShadow = tm.receiveShadow = true;
    group.add(tm);
    darkG.push(new THREE.BoxGeometry(cell * 3.3, 0.6, cell * 3.9).translate(lx, H + 6.3, lz));
    darkG.push(new THREE.BoxGeometry(cell * 2.5, 0.6, cell * 2.9).translate(lx - cell * 0.3, H + 11.3, lz));
    // A mast of aerials with a red lamp, and the radar dish on the tower.
    darkG.push(new THREE.CylinderGeometry(0.2, 0.35, 16, 6).translate(lx - cell, H + 19, lz + cell * 0.6));
    redG.push(new THREE.SphereGeometry(0.5, 8, 6).translate(lx - cell, H + 27.2, lz + cell * 0.6));
    for (let k = 0; k < 3; k++) darkG.push(new THREE.BoxGeometry(0.15, 0.15, 5 - k).translate(lx - cell, H + 16 + k * 3, lz + cell * 0.6));
    const radar = new THREE.Group();
    radar.position.set(lx + cell * 0.4, H + 12.5, lz - cell * 0.5);
    const dish = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 8), steel);
    dish.position.y = 1.6;
    radar.add(dish, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8).translate(0, 0.8, 0), steel));
    group.add(radar);
    radars.push(radar);
  }
  // The Spine's skylight down the centreline, over whatever cells are free.
  const mid = Math.floor(cols / 2);
  for (let cy = 0; cy < rows; cy++) {
    for (const cx of [mid - 1, mid]) {
      if (cx < 0 || occ[cy * cols + cx]) continue;
      const [lx, lz] = at(cx, cy);
      if (lx > L * 0.12 || lx < -L * 0.36 || !inside(lx, lz, 4)) continue;
      occ[cy * cols + cx] = 3;
      steelG.push(new THREE.BoxGeometry(cell, 0.6, 0.4).translate(lx, H + 0.4, lz - cell / 2 + 0.2));
      steelG.push(new THREE.BoxGeometry(cell, 0.6, 0.4).translate(lx, H + 0.4, lz + cell / 2 - 0.2));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(cell - 0.4, 0.2, cell - 0.6), skylight);
      glass.position.set(lx, H + 0.6, lz);
      group.add(glass);
    }
  }
  // Roof modules without guns get their own shapes; nests get their soldiers.
  for (const m of t.modules) {
    if (m.deck !== 0 || !m.built) continue;
    const d = MODULES[m.key];
    const l = t.moduleLocal(m);
    const w = d.w * cell, dd = d.h * cell;
    if (d.nest) {
      const r = Math.min(w, dd) * 0.42;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.7, 6, 16).rotateX(Math.PI / 2), sandbag);
      ring.position.set(l.lx, H + 0.6, l.lz);
      ring.castShadow = true;
      group.add(ring);
      darkG.push(new THREE.BoxGeometry(1.2, 0.8, 0.8).translate(l.lx - r * 0.4, H + 0.4, l.lz));
      const out = Math.atan2(l.lz, l.lx);
      posts.push({ lx: l.lx + Math.cos(out + 0.6) * r * 0.45, lz: l.lz + Math.sin(out + 0.6) * r * 0.45, face: out, kind: 'soldier' });
      posts.push({ lx: l.lx + Math.cos(out - 0.6) * r * 0.45, lz: l.lz + Math.sin(out - 0.6) * r * 0.45, face: out, kind: 'soldier' });
    } else if (m.key === 'radar') {
      darkG.push(new THREE.CylinderGeometry(0.5, 0.9, 8, 8).translate(l.lx, H + 4, l.lz));
      const radar = new THREE.Group();
      radar.position.set(l.lx, H + 8, l.lz);
      radar.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 12), steel));
      group.add(radar);
      radars.push(radar);
    } else if (m.key === 'shield') {
      darkG.push(new THREE.CylinderGeometry(w * 0.3, w * 0.38, 3, 16).translate(l.lx, H + 1.5, l.lz));
      const orb = new THREE.Mesh(new THREE.SphereGeometry(w * 0.2, 20, 14), shieldGlow);
      orb.position.set(l.lx, H + 3 + w * 0.2, l.lz);
      group.add(orb);
      brassG.push(new THREE.TorusGeometry(w * 0.3, 0.3, 8, 24).rotateX(Math.PI / 2).translate(l.lx, H + 3.2, l.lz));
    } else if (m.key === 'tesla') {
      darkG.push(new THREE.CylinderGeometry(1, 1.6, 10, 12).translate(l.lx, H + 5, l.lz));
      for (let k = 0; k < 4; k++) brassG.push(new THREE.TorusGeometry(2.2 - k * 0.3, 0.35, 8, 20).rotateX(Math.PI / 2).translate(l.lx, H + 3 + k * 2.2, l.lz));
      const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), teslaGlow);
      top.position.set(l.lx, H + 11.5, l.lz);
      group.add(top);
    } else if (m.key === 'drone_bay' || m.key === 'jet_hangar') {
      const hg = new THREE.CylinderGeometry(dd * 0.4, dd * 0.4, w * 0.9, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
      const hm = new THREE.Mesh(hg, concrete);
      hm.position.set(l.lx, H, l.lz);
      hm.castShadow = true;
      group.add(hm);
    }
  }
  // Clutter in the open cells, and the deckhands' beats between them.
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (occ[cy * cols + cx]) continue;
      const [lx, lz] = at(cx, cy);
      if (!inside(lx, lz, 3) || lx > L / 2 - 14) continue;
      free.push([lx, lz]);
      const h = hash2(cx, cy, 331);
      const j = (k: number): number => (hash2(cx, cy, 340 + k) - 0.5) * cell * 0.5;
      if (h < 0.08) {
        for (let k = 0; k < 2; k++) {
          darkG.push(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10).translate(lx + j(k), H + 0.7, lz + j(k + 2)));
          steelG.push(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 10).translate(lx + j(k), H + 1.5, lz + j(k + 2)));
        }
      } else if (h < 0.14) {
        steelG.push(new THREE.BoxGeometry(3, 0.3, 3).translate(lx, H + 0.15, lz));
        darkG.push(new THREE.BoxGeometry(0.3, 0.3, 1.4).translate(lx + 1, H + 0.45, lz));
      } else if (h < 0.19 && Math.abs(lz) > W * 0.15) {
        const ci = Math.floor(hash2(cx, cy, 333) * 3);
        const n = 1 + Math.floor(hash2(cx, cy, 334) * 2);
        for (let k = 0; k < n; k++) contG[(ci + k) % 3].push(new THREE.BoxGeometry(6, 2.6, 2.4).translate(lx, H + 1.3 + k * 2.6, lz));
      } else if (h < 0.24) {
        for (let k = 0; k < 3; k++) steelG.push(new THREE.BoxGeometry(1.2, 1, 1.2).translate(lx + j(k), H + 0.5 + (k === 2 ? 1 : 0), lz + j(k + 3)));
      } else if (h < 0.27) {
        for (let k = 0; k < 4; k++) brassG.push(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 8).translate(lx + (k % 2) * 0.6, H + 0.8, lz + Math.floor(k / 2) * 0.6));
      } else if (h < 0.29) {
        darkG.push(new THREE.CylinderGeometry(0.12, 0.2, 10, 6).translate(lx, H + 5, lz));
        redG.push(new THREE.SphereGeometry(0.35, 8, 6).translate(lx, H + 10.2, lz));
      }
    }
  }
  for (let i = 0; i < 6 && free.length > 8; i++) {
    const a = free[Math.floor(hash2(i, 1, 337) * free.length)], b = free[Math.floor(hash2(i, 2, 337) * free.length)];
    beats.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1] });
  }
  // Railings and lamp posts round the edge.
  const edge = outline.map(([x, y]) => [x * 0.985, y * 0.97] as [number, number]);
  for (let i = 0; i < edge.length; i++) {
    const [ax, ay] = edge[i], [bx, by] = edge[(i + 1) % edge.length];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / 4));
    const ang = Math.atan2(by - ay, bx - ax);
    for (let k = 0; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n, py = ay + ((by - ay) * k) / n;
      darkG.push(new THREE.BoxGeometry(0.15, 1.3, 0.15).translate(px, H + 0.65, py));
      if (k % 5 === 0 && k > 0) {
        darkG.push(new THREE.CylinderGeometry(0.1, 0.12, 4.5, 6).translate(px, H + 2.25, py));
        lampG.push(new THREE.BoxGeometry(0.8, 0.3, 0.5).translate(px, H + 4.5, py));
      }
    }
    darkG.push(new THREE.BoxGeometry(len, 0.12, 0.12).rotateY(-ang).translate((ax + bx) / 2, H + 1.3, (ay + by) / 2));
    darkG.push(new THREE.BoxGeometry(len, 0.1, 0.1).rotateY(-ang).translate((ax + bx) / 2, H + 0.75, (ay + by) / 2));
  }
  const add = (list: THREE.BufferGeometry[], m: THREE.Material, shadow = true): void => {
    if (!list.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g))!, m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(steelG, steel);
  add(darkG, gunDark);
  add(brassG, brass);
  add(lampG, lampMat, false);
  add(redG, redLamp, false);
  contG.forEach((l, i) => add(l, cont[i]));
  return { radars, posts, beats };
}

const plate = new THREE.MeshStandardMaterial({ map: plateTex(), color: '#a0aab8', roughness: 0.55, metalness: 0.5 });
const plateDark = new THREE.MeshStandardMaterial({ map: plateTex(), color: '#5a6272', roughness: 0.6, metalness: 0.45 });
const gunMetal = new THREE.MeshStandardMaterial({ color: '#4a525e', roughness: 0.45, metalness: 0.65 });
const gunDark = new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 0.5, metalness: 0.6 });
const brass = new THREE.MeshStandardMaterial({ color: '#b08a3a', roughness: 0.35, metalness: 0.8 });
const glass = new THREE.MeshStandardMaterial({ color: '#1a2a3a', roughness: 0.05, metalness: 0.6, emissive: '#0a2030', emissiveIntensity: 0.6 });
const lamp = new THREE.MeshBasicMaterial({ color: '#ffe8b0', toneMapped: false });

/** Plate texture scaled to world metres on a mesh (its UVs are metres). */
function metresUV(g: THREE.BufferGeometry, k = 0.1): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
}

function turret(size: string, twin: boolean, key: string, reach: number): { base: THREE.Group; yaw: THREE.Object3D; barrels: THREE.Object3D[] } {
  const base = new THREE.Group();
  const big = key === 'main_gun';
  const r = big ? 9 : size === 'heavy' ? 4.6 : size === 'medium' ? 3.4 : 2.4;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.2, r * 0.35, 20), gunDark);
  ring.position.y = r * 0.17;
  base.add(ring);
  const yaw = new THREE.Group();
  yaw.position.y = r * 0.35;
  base.add(yaw);
  // The gun house: a faceted turret with a sloped front.
  const hs = new THREE.Shape();
  hs.moveTo(-r * 1.05, -r * 0.8);
  hs.lineTo(r * 0.55, -r * 0.8);
  hs.lineTo(r * 1.15, -r * 0.45);
  hs.lineTo(r * 1.15, r * 0.45);
  hs.lineTo(r * 0.55, r * 0.8);
  hs.lineTo(-r * 1.05, r * 0.8);
  hs.closePath();
  const hg = new THREE.ExtrudeGeometry(hs, { depth: r * (big ? 0.7 : 0.75), bevelEnabled: true, bevelSize: r * 0.08, bevelThickness: r * 0.1, bevelSegments: 1 });
  hg.rotateX(-Math.PI / 2);
  metresUV(hg, 0.12);
  const house = new THREE.Mesh(hg, plate);
  yaw.add(house);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.12, 12), gunMetal);
  hatch.position.set(-r * 0.4, r * 0.8, r * 0.3);
  yaw.add(hatch);
  const barrels: THREE.Object3D[] = [];
  const n = big ? 3 : twin ? 2 : 1;
  const br = big ? 0.9 : size === 'heavy' ? 0.55 : size === 'medium' ? 0.38 : 0.26;
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    const z = n === 1 ? 0 : (i - (n - 1) / 2) * br * 3;
    b.position.set(r * 0.9, r * 0.4, z);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(br * 0.8, br, reach, 12).rotateZ(-Math.PI / 2).translate(reach / 2, 0, 0), gunMetal);
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(br * 1.5, br * 1.5, reach * 0.18, 12).rotateZ(-Math.PI / 2).translate(reach * 0.09, 0, 0), gunDark);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(br * 1.25, br * 1.25, reach * 0.07, 10).rotateZ(-Math.PI / 2).translate(reach * 0.97, 0, 0), gunDark);
    b.add(tube, mantle, brake);
    yaw.add(b);
    barrels.push(b);
  }
  base.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return { base, yaw, barrels };
}

/** Builds (or rebuilds) the model for a Titan; `key` says when its shape or guns changed. */
export function buildShip(t: Tank, klass: string): ShipModel {
  const L = t.stats.length, W = t.stats.width, H = t.deckY(0);
  const group = new THREE.Group();
  const crawlH = Math.min(14, H * 0.3);
  // Hull: the outline raised from the top of the crawlers to the roof.
  const pts = bodyOutline(L, W);
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
  // (The bevel adds its thickness on top: the roof lands at H, where everything on the deck stands.)
  const hull = new THREE.ExtrudeGeometry(sh, { depth: H - crawlH * 0.55 - 1.2, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2 });
  hull.rotateX(-Math.PI / 2);
  hull.translate(0, crawlH * 0.55, 0);
  // The deck art on the top face, riveted plate (in metres) on the sides.
  const art = titanTop(L, W, topPalette(t.kind, klass, t.dead), `${t.kind}|${klass}|${t.dead}`, 3, t.modules.some((m) => m.key === 'main_gun' && m.cy > t.rows / 2), 8);
  const deckTex = new THREE.CanvasTexture(art.top);
  deckTex.colorSpace = THREE.SRGBColorSpace;
  deckTex.anisotropy = 8;
  const pos = hull.attributes.position as THREE.BufferAttribute;
  const nor = hull.attributes.normal as THREE.BufferAttribute;
  const uv = hull.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nor.getY(i) > 0.7) uv.setXY(i, (x - art.x0) / art.w, 1 - (z - art.y0) / art.h);
    else uv.setXY(i, (x + z) * 0.1, y * 0.1);
  }
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.7, metalness: 0.35 });
  const hullMesh = new THREE.Mesh(hull, [deckMat, plate]);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  group.add(hullMesh);
  // Crawlers: eight banks, each a tread loop over a housing.
  const treads = treadTex().clone();
  treads.needsUpdate = true;
  treads.wrapS = treads.wrapT = THREE.RepeatWrapping;
  const treadMat = new THREE.MeshStandardMaterial({ map: treads, roughness: 0.85, metalness: 0.4 });
  for (const c of crawlerRects(L, W)) {
    const len = c.x1 - c.x0, wid = c.y1 - c.y0;
    const g = new THREE.BoxGeometry(len, crawlH, wid);
    const u = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (len / 12.8), u.getY(i));
    const m = new THREE.Mesh(g, treadMat);
    m.position.set((c.x0 + c.x1) / 2, crawlH / 2, (c.y0 + c.y1) / 2);
    m.castShadow = true;
    group.add(m);
    // Road wheels showing along the outboard side.
    const side = c.y0 < 0 ? -1 : 1;
    for (let k = 0; k < 5; k++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(crawlH * 0.3, crawlH * 0.3, 0.8, 16).rotateX(Math.PI / 2), gunDark);
      w.position.set(c.x0 + len * ((k + 0.5) / 5), crawlH * 0.42, side > 0 ? c.y1 + 0.2 : c.y0 - 0.2);
      group.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(crawlH * 0.1, crawlH * 0.1, 1, 8).rotateX(Math.PI / 2), brass);
      hub.position.copy(w.position);
      group.add(hub);
    }
    const fender = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 1.2, wid + 1.5), plateDark);
    fender.position.set((c.x0 + c.x1) / 2, crawlH + 0.4, (c.y0 + c.y1) / 2);
    fender.castShadow = true;
    group.add(fender);
  }
  // Exhaust stacks.
  const stacks: THREE.Vector3[] = [];
  for (const s of stackSpots(L, W, 3)) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 9, 16), plateDark);
    st.position.set(s.x, H + 4.5, s.y);
    st.castShadow = true;
    group.add(st);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.3, 8, 16).rotateX(Math.PI / 2), brass);
    rim.position.set(s.x, H + 9, s.y);
    group.add(rim);
    stacks.push(new THREE.Vector3(s.x, H + 9.2, s.y));
  }
  // The bridge at the bow: the cab you sit in, with its windows and lamps.
  const cab = new THREE.Group();
  const cb = new THREE.Mesh(new THREE.BoxGeometry(10, 6, W * 0.36), plate);
  cb.position.set(L / 2 - 7, H + 3, 0);
  cab.add(cb);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, W * 0.32), glass);
  win.position.set(L / 2 - 1.9, H + 4, 0);
  cab.add(win);
  for (const z of [-W * 0.12, W * 0.12]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), lamp);
    l.position.set(L / 2 - 1.8, H + 1.2, z);
    cab.add(l);
  }
  cab.traverse((o) => (o.castShadow = true));
  group.add(cab);
  // Under the bridge, a plain steel floor over the deck paint's own drawing of it (seen when you sit in it).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L * 0.17, 0.3, W * 0.36), plateDark);
  floor.position.set(L * 0.455, H + 0.15, 0);
  floor.receiveShadow = true;
  group.add(floor);
  // The searchlight on the bridge roof: a drum on a yoke, its lens lit when it's on.
  const yoke = new THREE.Group();
  yoke.position.set(L / 2 - 8, H + 6, 0);
  yoke.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 12).translate(0, 0.25, 0), gunDark));
  for (const z of [-1.1, 1.1]) yoke.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.25).translate(0, 1.2, z), gunDark));
  const drum = new THREE.Group();
  drum.position.y = 1.7;
  drum.add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.7, 16).rotateZ(Math.PI / 2), gunMetal));
  drum.add(new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.1, 6, 16).rotateY(Math.PI / 2).translate(0.86, 0, 0), brass));
  const lensMat = new THREE.MeshBasicMaterial({ color: '#4a4a40', toneMapped: false });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.78, 16).rotateY(Math.PI / 2).translate(0.87, 0, 0), lensMat);
  drum.add(lens);
  yoke.add(drum);
  yoke.traverse((o) => (o.castShadow = true));
  group.add(yoke);
  // Amber beacons: two on the bridge roof, two at the stern rail.
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#5a3a10', toneMapped: false });
  const glows: THREE.Sprite[] = [];
  const beaconAt: [number, number, number][] = [[L / 2 - 11.5, H + 6.4, -W * 0.15], [L / 2 - 11.5, H + 6.4, W * 0.15]];
  for (const side of [-1, 1]) {
    let bx = -L * 0.47, bz = side * W * 0.4;
    for (let i = 0; i < 30 && !insidePoly(pts as [number, number][], bx, bz); i++) {
      bx *= 0.97;
      bz *= 0.97;
    }
    beaconAt.push([bx, H + 1.6, bz]);
  }
  for (const [bx, by, bz] of beaconAt) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat);
    dome.position.set(bx, by, bz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.3, 10), gunDark);
    base.position.set(bx, by - 0.15, bz);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffa020', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    glow.position.set(bx, by + 0.2, bz);
    glow.scale.setScalar(7);
    glow.visible = false;
    group.add(dome, base, glow);
    glows.push(glow);
  }
  // Guns.
  const turrets = new Map<number, { yaw: THREE.Object3D; barrels: THREE.Object3D[]; reach: number }>();
  for (const m of t.modules) {
    if (m.deck !== 0 || !m.built) continue;
    const d = MODULES[m.key];
    if (!m.weapon && m.key !== 'main_gun') {
      if (d?.nest) {
        // A sandbagged soldier nest.
        const l = t.moduleLocal(m);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.8, 6, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a7a5a', roughness: 1 }));
        ring.position.set(l.lx, H + 0.6, l.lz);
        group.add(ring);
      }
      continue;
    }
    const l = t.moduleLocal(m);
    const size = WEAPONS[m.weapon?.key ?? '']?.size ?? 'medium';
    const reach = t.muzzleReach(m);
    const tu = turret(size, !!m.weapon && !!WEAPONS[m.weapon.key]?.twin, m.key, reach);
    tu.base.position.set(l.lx, H, l.lz);
    group.add(tu.base);
    turrets.set(m.id, { yaw: tu.yaw, barrels: tu.barrels, reach });
  }
  const key = shipKey(t, klass);
  const lampMat = lamp.clone();
  const dress = dressDeck(t, group, H, L, W, pts as [number, number][], lampMat);
  return { group, L, W, H, turrets, treads, stacks, key, cab, ...dress, search: { yoke, drum, lens, glass: lensMat }, beacons: { mat: beaconMat, glows }, lampMat };
}

export function shipKey(t: Tank, klass: string): string {
  return `${t.stats.length}|${t.stats.width}|${t.stories}|${klass}|${t.kind}|${t.dead}|${t.modules.filter((m) => m.deck === 0 && m.built).map((m) => `${m.id}:${m.key}:${m.weapon?.key ?? ''}`).join(',')}`;
}

/** Places the model and turns its guns. */
export function poseShip(s: ShipModel, t: Tank, x: number, y: number, z: number, treadRoll: number): void {
  s.group.position.set(x, z, y);
  s.group.rotation.set(0, -t.rot, 0);
  s.treads.offset.x = -treadRoll / 12.8;
  for (const r of s.radars) r.rotation.y += 0.03;
  for (const m of t.modules) {
    const tu = s.turrets.get(m.id);
    if (!tu) continue;
    tu.yaw.rotation.y = -(m.aim - t.rot);
    const back = Math.min(1, m.recoil ?? 0) * tu.reach * 0.12;
    tu.barrels.forEach((b, i) => {
      b.position.x = (b.userData.x0 ??= b.position.x) - back * (i % 2 ? 0.6 : 1);
    });
  }
}
