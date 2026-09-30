import * as THREE from 'three';
import { MODULES } from '../../game/defs';
import type { Tank } from '../../game/tank';
import { WEAPONS } from '../../shared/weapons';
import { bodyOutline, crawlerRects, stackSpots, titanTop, topPalette } from '../px/titanTop';
import { plateTex, treadTex } from './textures';

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
}

const plate = new THREE.MeshStandardMaterial({ map: plateTex(), color: '#6a7282', roughness: 0.62, metalness: 0.45 });
const plateDark = new THREE.MeshStandardMaterial({ map: plateTex(), color: '#3a404c', roughness: 0.7, metalness: 0.4 });
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
  const hull = new THREE.ExtrudeGeometry(sh, { depth: H - crawlH * 0.55, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2 });
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
  return { group, L, W, H, turrets, treads, stacks, key, cab };
}

export function shipKey(t: Tank, klass: string): string {
  return `${t.stats.length}|${t.stats.width}|${t.stories}|${klass}|${t.kind}|${t.dead}|${t.modules.filter((m) => m.deck === 0 && m.built).map((m) => `${m.id}:${m.key}:${m.weapon?.key ?? ''}`).join(',')}`;
}

/** Places the model and turns its guns. */
export function poseShip(s: ShipModel, t: Tank, x: number, y: number, z: number, treadRoll: number): void {
  s.group.position.set(x, z, y);
  s.group.rotation.set(0, -t.rot, 0);
  s.treads.offset.x = -treadRoll / 12.8;
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
