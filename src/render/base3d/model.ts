import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  COMPOUND, FRONT_GUNS, FRONT_STRUCTS, GATE, GATE_TOWER_H, HANGAR_EAVE, HELIPADS, PAD_L, PAD_W, PADS, PINES, STRUCTS, TOWERS, TOWER_H, WALL_H,
  visualHeight, type Struct,
} from '../../shared/compound';
import { HANGAR } from '../../shared/mapgen';
import { hash2 } from '../../shared/rng';
import { basic, box, chamfer, hazardTexture, hull, mesh, plateTexture, prism, ventTexture } from '../ship3d/model';

/**
 * The Mega Hangar's compound as a fortress from the future, built in 3D and drawn through the same oblique lens as
 * the ships: a 30 m armoured wall with a sloped glacis, buttresses, a crenellated parapet and a line of light along
 * it, auto-turrets on the walkway; octagonal gun towers with turrets that track what they shoot at; the gate towers
 * bridged high over the gate with the base's name lit across it, the blast doors sliding into the wall; the Hangar's
 * armoured vault with light strips down its ridge (lifted away while you're inside, the gantry cranes running over
 * the bays); and inside the walls, the garrison's buildings as dark armoured blocks with lit window bands and roof
 * plant, fuel tanks, hab pods, cooling towers, the radar dome and its dish, signal pylons, a tower crane swinging
 * over the supply yard, missile batteries and shield pylons at the corners; outside the gate, pillboxes with twin
 * guns, barriers and tank traps; round it all, the pines. Metres from the Hangar's centre: X east, Z south, Y up.
 */

export interface BaseRig {
  root: THREE.Group;
  /** The gate's two blast doors, sliding outward (their closed X). */
  doors: { obj: THREE.Object3D; x0: number; dir: number }[];
  /** Turrets that track: on the towers (index into compound towers), the front's guns, the wall's auto-turrets. */
  turrets: { yaw: THREE.Object3D; kind: 'tower' | 'front' | 'wall'; i: number }[];
  dishes: THREE.Object3D[];
  /** The Hangar's gantry cranes (bridge, trolley), the tower crane's jib. */
  gantries: { bridge: THREE.Object3D; trolley: THREE.Object3D; x: number; i: number }[];
  jibs: THREE.Object3D[];
  /** The Hangar's roof (and its materials, which fade). */
  roof: THREE.Group;
  roofMats: THREE.Material[];
  beacons: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  lines: THREE.LineBasicMaterial;
}

/** Lit lettering on a dark band, for the sign over the gate. */
function signTexture(text: string, color: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.font = 'bold 150px "Silkscreen", "Courier New", monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = color;
  c.shadowBlur = 24;
  c.fillStyle = color;
  c.fillText(text, 512, 136, 980);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.6, flatShading: true, ...p });

export function buildBase(): BaseRig {
  const root = new THREE.Group();
  const C = COMPOUND;
  const armor = std({ color: '#ffffff', map: plateTexture('#2b3038') });
  const armorL = std({ color: '#ffffff', map: plateTexture('#3a4049'), roughness: 0.5 });
  const concrete = std({ color: '#ffffff', map: plateTexture('#4a4c50'), roughness: 0.85, metalness: 0.15 });
  const hullW = std({ color: '#ffffff', map: plateTexture('#8c939c'), roughness: 0.5 });
  const dark = std({ color: '#0e1014', roughness: 0.85 });
  const trim = std({ color: '#5a626e', metalness: 0.6, roughness: 0.4 });
  const steel = std({ color: '#3a3e44', metalness: 0.7, roughness: 0.35 });
  const pineM = std({ color: '#1e3424', roughness: 0.9, metalness: 0 });
  const hazard = std({ map: hazardTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const vent = std({ map: ventTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, flatShading: false });
  const glow = basic('#3fd8ff');
  const glowDim = basic('#1f7a96');
  const win = basic('#a8e8ff');
  const winWarm = basic('#ffc070');
  const beacons = basic('#ff2a1a');
  const amber = basic('#ffb02a');
  const holo = new THREE.MeshBasicMaterial({ color: '#40d8ff', transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
  const lines = new THREE.LineBasicMaterial({ color: '#0a2a36', transparent: true, opacity: 0.6 });
  const rig: BaseRig = { root, doors: [], turrets: [], dishes: [], gantries: [], jibs: [], roof: new THREE.Group(), roofMats: [], beacons, glow, lines };
  const statics = new THREE.Group();
  root.add(statics);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, to: THREE.Object3D = statics): THREE.Mesh => {
    const me = mesh(g, m, !(m instanceof THREE.MeshBasicMaterial));
    to.add(me);
    return me;
  };
  const lamp = (m: THREE.Material, s: number, x: number, y: number, z: number, to?: THREE.Object3D): void => {
    add(new THREE.BoxGeometry(s, s, s).translate(x, y, z), m, to);
  };
  const H = (n: number, salt: number): number => hash2(Math.floor(n), salt, 7331);

  // ============================================================================================ the wall
  // Each side a long prism: a sloped glacis outside, a sheer inner face, the walkway along the top; a crenellated
  // parapet on the outer edge, a buttress every 40 m, a line of light under the parapet, red lamps along it.
  const wallRun = (a0: number, a1: number, alongX: boolean, inner: number, outSign: number): void => {
    // `inner`: the wall's inner face coordinate; the wall runs outward from it by C.wall (and the glacis beyond).
    const u = (k: number): number => inner + outSign * k; // k metres outward from the inner face
    const P = (a: number, k: number, y: number): [number, number, number] => (alongX ? [a, y, u(k)] : [u(k), y, a]);
    const W = C.wall;
    add(hull([
      P(a0, 0, 0), P(a1, 0, 0), P(a0, W + 4, 0), P(a1, W + 4, 0),
      P(a0, 0, WALL_H), P(a1, 0, WALL_H), P(a0, W - 0.5, WALL_H), P(a1, W - 0.5, WALL_H),
      P(a0, W + 1.2, WALL_H - 6), P(a1, W + 1.2, WALL_H - 6),
    ]), armor);
    // The parapet: merlons every 7 m on the outer edge.
    const merlons: THREE.BufferGeometry[] = [];
    for (let a = a0 + 2; a < a1 - 4; a += 7) {
      const c = P(a + 2.25, W - 1.2, WALL_H + 1.6);
      merlons.push(alongX ? new THREE.BoxGeometry(4.5, 3.2, 1.8).translate(c[0], c[1], c[2]) : new THREE.BoxGeometry(1.8, 3.2, 4.5).translate(c[0], c[1], c[2]));
    }
    if (merlons.length) add(mergeGeometries(merlons)!, armorL);
    // The light line under the parapet, outside; a dimmer one along the inner face.
    const l0 = P(a0, W + 1.25, WALL_H - 6.6), l1 = P(a1, W + 1.25, WALL_H - 6.6);
    add(alongX ? new THREE.BoxGeometry(a1 - a0, 0.7, 0.4).translate((l0[0] + l1[0]) / 2, l0[1], l0[2]) : new THREE.BoxGeometry(0.4, 0.7, a1 - a0).translate(l0[0], l0[1], (l0[2] + l1[2]) / 2), glow);
    const i0 = P(a0, -0.15, WALL_H - 3), i1 = P(a1, -0.15, WALL_H - 3);
    add(alongX ? new THREE.BoxGeometry(a1 - a0, 0.5, 0.3).translate((i0[0] + i1[0]) / 2, i0[1], i0[2]) : new THREE.BoxGeometry(0.3, 0.5, a1 - a0).translate(i0[0], i0[1], (i0[2] + i1[2]) / 2), glowDim);
    // Buttresses on the glacis, and lamps and auto-turrets along the walkway.
    const butts: THREE.BufferGeometry[] = [];
    for (let a = a0 + 20; a < a1 - 10; a += 40) {
      butts.push(hull([P(a - 2.5, W + 4, 0), P(a + 2.5, W + 4, 0), P(a - 2.5, W + 9, 0), P(a + 2.5, W + 9, 0), P(a - 2, W + 1, WALL_H - 8), P(a + 2, W + 1, WALL_H - 8)]));
      const lp = P(a, W - 1.2, WALL_H + 3.6);
      lamp(beacons, 0.9, lp[0], lp[1], lp[2]);
    }
    if (butts.length) add(mergeGeometries(butts)!, armorL);
  };
  wallRun(C.x0, C.x1, true, C.y0 + C.wall, -1);
  wallRun(C.x0, -C.gateHalf, true, C.y1 - C.wall, 1);
  wallRun(C.gateHalf, C.x1, true, C.y1 - C.wall, 1);
  wallRun(C.y0, C.y1, false, C.x0 + C.wall, -1);
  wallRun(C.y0, C.y1, false, C.x1 - C.wall, 1);
  // Auto-turrets on the walkway, midway between the towers.
  const wallGuns: [number, number, number][] = [];
  for (let x = C.x0 + 80; x < C.x1 - 40; x += 160) {
    wallGuns.push([x, C.y0 + 4, -Math.PI / 2]);
    if (Math.abs(x) > C.gateHalf + 40) wallGuns.push([x, C.y1 - 4, Math.PI / 2]);
  }
  for (let y = C.y0 + 80; y < C.y1 - 40; y += 160) {
    wallGuns.push([C.x0 + 4, y, Math.PI]);
    wallGuns.push([C.x1 - 4, y, 0]);
  }
  wallGuns.forEach(([x, z, a], i) => {
    const base = new THREE.Group();
    base.position.set(x, WALL_H, z);
    base.add(mesh(new THREE.CylinderGeometry(2, 2.4, 1.2, 8).translate(0, 0.6, 0), steel));
    const yaw = new THREE.Group();
    yaw.position.y = 1.2;
    yaw.rotation.y = -a;
    yaw.add(mesh(chamfer(-2, 2, 0, 2, -1.8, 1.8, 0.5), armorL));
    for (const s of [-0.6, 0.6]) yaw.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 5, 6).rotateZ(-Math.PI / 2).translate(4, 1.1, s), dark));
    yaw.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(-1.9, 1.6, 0), beacons, false));
    base.add(yaw);
    root.add(base);
    rig.turrets.push({ yaw, kind: 'wall', i });
  });

  // ============================================================================================ the towers
  // Octagonal gun towers: a battered shaft, a glazed ring with its light band, the gun deck and a twin turret that
  // tracks; the gate towers bigger and bridged high over the gate.
  const oct = (r: number): [number, number][] => Array.from({ length: 8 }, (_, k) => [Math.cos(((k + 0.5) / 8) * Math.PI * 2) * r, Math.sin(((k + 0.5) / 8) * Math.PI * 2) * r] as [number, number]);
  TOWERS.forEach((t, i) => {
    const r = t.half * 1.25, top = t.gate ? GATE_TOWER_H : TOWER_H.cabin;
    const shaft = t.gate ? 60 : TOWER_H.shaft;
    add(hull([...oct(r * 1.18).map(([x, z]) => [t.x + x, 0, t.y + z] as [number, number, number]), ...oct(r * 0.92).map(([x, z]) => [t.x + x, shaft, t.y + z] as [number, number, number])]), armor);
    // The glazed ring and the deck over it.
    add(prism(oct(r * 1.02).map(([x, z]) => [t.x + x, t.y + z] as [number, number]), shaft, shaft + 4.5), dark);
    add(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 1, 8).translate(t.x, shaft + 2.2, t.y), win, statics);
    add(prism(oct(r * 1.12).map(([x, z]) => [t.x + x, t.y + z] as [number, number]), shaft + 4.5, top, 1.2), armorL);
    add(new THREE.CylinderGeometry(r * 1.13, r * 1.13, 0.6, 8).translate(t.x, top - 1.6, t.y), glow);
    for (let k = 0; k < 4; k++) lamp(beacons, 1, t.x + Math.cos((k / 4) * Math.PI * 2 + 0.4) * r * 1.1, top + 0.4, t.y + Math.sin((k / 4) * Math.PI * 2 + 0.4) * r * 1.1);
    // Vertical light seams down the shaft.
    for (const k of [0, 4]) {
      const [x, z] = oct(r * 1.19)[k];
      add(new THREE.BoxGeometry(0.5, shaft * 0.7, 0.5).translate(t.x + x, shaft * 0.45, t.y + z), glowDim);
    }
    const s = t.gate ? 1.8 : 1.2;
    const base = new THREE.Group();
    base.position.set(t.x, top, t.y);
    base.add(mesh(new THREE.CylinderGeometry(3.2 * s, 3.6 * s, 1.2, 10).translate(0, 0.6, 0), steel));
    const yaw = new THREE.Group();
    yaw.position.y = 1.2;
    yaw.add(mesh(prism([[3.4 * s, -1.6 * s], [3.4 * s, 1.6 * s], [1.4 * s, 2.8 * s], [-2.8 * s, 2.6 * s], [-3.4 * s, 0], [-2.8 * s, -2.6 * s], [1.4 * s, -2.8 * s]], 0, 2.6 * s, 0.6 * s), armorL));
    for (const sd of [-0.9, 0.9]) yaw.add(mesh(new THREE.CylinderGeometry(0.4 * s, 0.48 * s, 9 * s, 8).rotateZ(-Math.PI / 2).translate(7.5 * s, 1.4 * s, sd * s), dark));
    yaw.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 2.8 * s).translate(3.45 * s, 1.9 * s, 0), glow, false));
    base.add(yaw);
    root.add(base);
    rig.turrets.push({ yaw, kind: 'tower', i });
  });
  // The bridge over the gate between the gate towers, the base's name lit along it.
  {
    const gx = C.gateHalf + C.gateTowerHalf, z = C.y1 - C.wall / 2;
    add(chamfer(-gx, gx, 54, 66, z - 7, z + 7, 1.5, 0), armor);
    add(box(gx * 2 - 6, 1.2, 0.6, 0, 56, z + 7.1), glow);
    add(box(gx * 2 - 6, 1.2, 0.6, 0, 56, z - 7.1), glow);
    const sign = new THREE.MeshBasicMaterial({ map: signTexture('MEGA HANGAR', '#7ae8ff'), transparent: true, toneMapped: false, depthWrite: false });
    add(new THREE.PlaneGeometry(120, 30).translate(0, 60.5, z + 7.3), sign);
    for (let x = -gx + 8; x < gx; x += 16) lamp(beacons, 1.1, x, 67, z);
  }

  // ============================================================================================ the gate
  {
    const z = GATE.y, half = C.gateHalf;
    for (const dir of [-1, 1]) {
      const leaf = new THREE.Group();
      const x0 = (dir * half) / 2;
      leaf.position.set(x0, 0, z);
      leaf.add(mesh(chamfer(-half / 2, half / 2, 0, 28, -3, 3, 0.8), armorL));
      for (let x = -half / 2 + 8; x < half / 2; x += 16) leaf.add(mesh(new THREE.BoxGeometry(1.2, 24, 0.6).translate(x, 13, 3.1), armor));
      leaf.add(mesh(new THREE.PlaneGeometry(10, 26).translate(-dir * (half / 2 - 5.2), 13, 3.15), hazard, false));
      leaf.add(mesh(new THREE.BoxGeometry(half - 4, 0.8, 0.4).translate(0, 25, 3.2), glow, false));
      leaf.add(mesh(new THREE.BoxGeometry(1, 1, 1).translate(-dir * (half / 2 - 1.5), 29, 0), beacons, false));
      root.add(leaf);
      rig.doors.push({ obj: leaf, x0, dir });
    }
  }

  // ============================================================================================ the Hangar
  // Three sheer armoured walls, the open south face framed by its pillars and header, under an angular vault with
  // light strips down its ridge; inside, the gantry cranes over the bays.
  {
    const hw = HANGAR.w / 2, hd = HANGAR.d / 2, E = HANGAR_EAVE;
    add(chamfer(-hw, hw, 0, E, -hd - 4, -hd + 4, 1.2, 0), armor);
    add(chamfer(-hw - 4, -hw + 4, 0, E, -hd, hd, 1.2, 0), armor);
    add(chamfer(hw - 4, hw + 4, 0, E, -hd, hd, 1.2, 0), armor);
    // Ribs down the outer walls, a light band at their foot and near the top.
    for (let x = -hw + 35; x < hw; x += 70) add(box(3, E - 4, 2.4, x, (E - 4) / 2, -hd - 5), armorL);
    for (let z = -hd + 35; z < hd; z += 70) for (const sx of [-1, 1]) add(box(2.4, E - 4, 3, sx * (hw + 5), (E - 4) / 2, z), armorL);
    for (const sx of [-1, 1]) add(box(0.5, 1, hd * 2, sx * (hw + 4.3), E - 6, 0), glow);
    add(box(hw * 2, 1, 0.5, 0, E - 6, -hd - 4.3), glow);
    // The south face: corner pillars, the header beam, the door's lit frame, hazard bands.
    for (const sx of [-1, 1]) add(chamfer(sx * hw - 10, sx * hw + 10, 0, E + 4, hd - 6, hd + 8, 2, 2), armorL);
    add(chamfer(-hw, hw, E - 14, E + 2, hd - 6, hd + 6, 1.5, 0), armor);
    add(box(hw * 2 - 20, 1.2, 0.6, 0, E - 13, hd + 6.2), glow);
    add(new THREE.PlaneGeometry(hw * 2 - 24, 5).translate(0, E - 7, hd + 6.3), hazard);
    for (let x = -hw + 20; x < hw; x += 40) lamp(amber, 1.4, x, E - 15, hd + 6.5);
    // The roof: a faceted vault (its own materials so it can fade when you're inside).
    const roofM = std({ color: '#ffffff', map: plateTexture('#262b32'), transparent: true });
    const roofG = basic('#3fd8ff');
    roofG.transparent = true;
    rig.roofMats.push(roofM, roofG);
    const prof: [number, number][] = [[-hw - 6, E], [-hw * 0.72, E + 26], [-hw * 0.36, E + 46], [0, E + 55], [hw * 0.36, E + 46], [hw * 0.72, E + 26], [hw + 6, E]];
    for (let k = 0; k < prof.length - 1; k++) {
      const [x0, y0] = prof[k], [x1, y1] = prof[k + 1];
      const g = hull([[x0, y0, -hd - 6], [x1, y1, -hd - 6], [x0, y0, hd + 6], [x1, y1, hd + 6], [x0, y0 - 2, -hd - 6], [x1, y1 - 2, -hd - 6], [x0, y0 - 2, hd + 6], [x1, y1 - 2, hd + 6]]);
      rig.roof.add(mesh(g, roofM));
    }
    // Light strips along the ridge and the facets' edges, skylight panels.
    for (const k of [1, 2, 3, 4, 5]) {
      const [x, y] = prof[k];
      rig.roof.add(mesh(new THREE.BoxGeometry(1.2, 0.8, hd * 2 + 8).translate(x, y + 0.5, 0), roofG, false));
    }
    for (let z = -hd + 30; z < hd; z += 60) for (const sx of [-1, 1]) rig.roof.add(mesh(new THREE.BoxGeometry(30, 0.6, 18).rotateZ(sx * 0.48).translate(sx * hw * 0.54, E + 37, z), roofG, false));
    root.add(rig.roof);
    // The gantry cranes over the bays.
    [-HANGAR.w * 0.3, 0, HANGAR.w * 0.3].forEach((bx, i) => {
      const bridge = new THREE.Group();
      bridge.position.set(bx, 52, 0);
      bridge.add(mesh(new THREE.BoxGeometry(205, 3, 5).translate(0, 0, 0), std({ color: '#d89a1c', metalness: 0.5, roughness: 0.4 })));
      bridge.add(mesh(new THREE.BoxGeometry(205, 0.5, 0.4).translate(0, 1.6, 2.6), amber, false));
      const trolley = new THREE.Group();
      trolley.add(mesh(new THREE.BoxGeometry(10, 4, 8).translate(0, -1, 0), dark));
      trolley.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 30, 4).translate(0, -18, 0), steel));
      trolley.add(mesh(new THREE.BoxGeometry(6, 2, 6).translate(0, -33, 0), hazard));
      bridge.add(trolley);
      root.add(bridge);
      rig.gantries.push({ bridge, trolley, x: bx, i });
    });
  }

  // ============================================================================================ the buildings
  STRUCTS.forEach((s, i) => building(s, i));
  FRONT_STRUCTS.forEach((s, i) => frontWork(s, i));

  function building(s: Struct, i: number): void {
    const h = visualHeight(s);
    const w = s.x1 - s.x0, d = s.y1 - s.y0, cx = (s.x0 + s.x1) / 2, cz = (s.y0 + s.y1) / 2;
    const r = Math.min(w, d) / 2;
    switch (s.kind) {
      case 'tank': {
        add(new THREE.CylinderGeometry(r * 0.96, r, h, 18).translate(cx, h / 2, cz), hullW);
        add(new THREE.SphereGeometry(r * 0.96, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(cx, h, cz), hullW);
        for (const y of [h * 0.3, h * 0.7]) add(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.6, 18).translate(cx, y, cz), glowDim);
        lamp(beacons, 0.8, cx, h + r * 0.36, cz);
        return;
      }
      case 'quonset': {
        // A hab pod: a rounded shell on a plinth, a lit window strip and a door, a sensor on top.
        add(box(w, 1.2, d, cx, 0.6, cz), dark);
        const pod = new THREE.CylinderGeometry(d / 2, d / 2, w - 2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, (h - 1.2) / (d / 2), 1).translate(cx, 1.2, cz);
        add(pod, i % 3 ? armorL : armor);
        add(box(1.6, 0.5, d * 0.6, cx, h + 0.1, cz), glowDim);
        add(box(w - 6, 0.6, 0.3, cx, h * 0.55, s.y1 - 0.3), i % 4 ? win : winWarm);
        add(box(2.6, 3.2, 0.4, s.x0 + 4, 2.8, s.y1 + 0.1), dark);
        return;
      }
      case 'ammo': {
        add(chamfer(s.x0, s.x1, 0, h, s.y0, s.y1, 2.5, 3), armor);
        add(new THREE.PlaneGeometry(w * 0.5, 1.6).translate(cx, h * 0.45, s.y1 + 0.05), hazard);
        lamp(amber, 0.7, s.x0 + 2, h + 0.4, s.y1 - 2);
        return;
      }
      case 'flagpole': {
        add(new THREE.CylinderGeometry(0.25, 0.35, h, 6).translate(cx, h / 2, cz), steel);
        add(new THREE.PlaneGeometry(14, 8).translate(cx + 7.2, h - 5, cz), holo);
        lamp(beacons, 0.6, cx, h + 0.4, cz);
        return;
      }
      case 'watertower': {
        for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) add(box(1, h * 0.7, 1, cx + ox, h * 0.35, cz + oz), steel);
        add(new THREE.SphereGeometry(8, 16, 10).translate(cx, h * 0.72 + 6, cz), hullW);
        add(new THREE.CylinderGeometry(8.05, 8.05, 0.6, 16).translate(cx, h * 0.72 + 6, cz), glow);
        lamp(beacons, 0.8, cx, h * 0.72 + 14.4, cz);
        return;
      }
      case 'mast':
      case 'antenna': {
        add(new THREE.CylinderGeometry(0.6, 3, h, 4).translate(cx, h / 2, cz), steel);
        for (let y = 20; y < h; y += 26) {
          add(box(10 - y / 30, 0.5, 0.5, cx, y, cz), trim);
          lamp(beacons, 0.9, cx, y + 1, cz);
        }
        lamp(beacons, 1.2, cx, h + 0.6, cz);
        return;
      }
      case 'stack': {
        const pts: THREE.Vector2[] = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          pts.push(new THREE.Vector2(r * (0.62 + 0.38 * Math.pow(Math.abs(t - 0.62) / 0.62, 1.6)), t * h));
        }
        add(new THREE.LatheGeometry(pts, 20).translate(cx, 0, cz), concrete);
        add(new THREE.TorusGeometry(r * 0.99, 0.5, 4, 24).rotateX(Math.PI / 2).translate(cx, h, cz), glow);
        lamp(beacons, 1, cx + r, h + 0.6, cz);
        return;
      }
      case 'radar': {
        add(chamfer(s.x0 + 6, s.x1 - 6, 0, 10, s.y0 + 6, s.y1 - 6, 1.5), armor);
        add(new THREE.SphereGeometry(r * 0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx - r * 0.2, 10, cz), hullW);
        const dish = new THREE.Group();
        dish.position.set(cx + r * 0.6, 10, cz + r * 0.5);
        dish.add(mesh(new THREE.CylinderGeometry(0.8, 1.2, 8, 6).translate(0, 4, 0), steel));
        dish.add(mesh(new THREE.SphereGeometry(7, 14, 6, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(Math.PI / 2).translate(0, 10, 2), std({ color: '#c8d0d8', metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide })));
        root.add(dish);
        rig.dishes.push(dish);
        return;
      }
      default: {
        // An armoured block: the top edges cut back, window bands by the floor on its south and side faces, a door,
        // a lit strip along the roof edge, roof plant; the command post and the power plant with their extras.
        const ch = Math.min(3, h * 0.12);
        add(chamfer(s.x0, s.x1, 0, h, s.y0, s.y1, ch, ch), H(i, 1) < 0.5 ? armor : armorL);
        add(box(w - 2 * ch, 0.6, 0.4, cx, h - ch - 0.6, s.y1 + 0.05), s.kind === 'command' || s.kind === 'gatehouse' ? glow : glowDim);
        // A thin line of light round the roof's edge: the base's Tron trim.
        const tm = H(i, 3) < 0.25 ? amber : glowDim;
        add(box(w - 2 * ch, 0.35, 0.35, cx, h + 0.1, s.y0 + ch), tm);
        add(box(w - 2 * ch, 0.35, 0.35, cx, h + 0.1, s.y1 - ch), tm);
        add(box(0.35, 0.35, d - 2 * ch, s.x0 + ch, h + 0.1, cz), tm);
        add(box(0.35, 0.35, d - 2 * ch, s.x1 - ch, h + 0.1, cz), tm);
        const wm = H(i, 2) < 0.6 ? win : winWarm;
        for (let y = 3; y < h - ch - 2; y += 4.2) {
          add(box(w * 0.78, 0.9, 0.3, cx, y, s.y1 + 0.05), wm);
          if (d > 16) {
            add(box(0.3, 0.9, d * 0.7, s.x1 + 0.05, y, cz), wm);
            add(box(0.3, 0.9, d * 0.7, s.x0 - 0.05, y, cz), wm);
          }
        }
        add(box(Math.min(10, w * 0.3), Math.min(6, h * 0.4), 0.6, s.x0 + Math.min(10, w * 0.3) / 2 + 3, Math.min(6, h * 0.4) / 2, s.y1 + 0.2), dark);
        // Roof plant.
        const n = Math.max(1, Math.min(4, Math.floor((w * d) / 1800)));
        for (let k = 0; k < n; k++) {
          const px = s.x0 + ch + 4 + H(i, 10 + k) * Math.max(1, w - 2 * ch - 8), pz = s.y0 + ch + 4 + H(i, 20 + k) * Math.max(1, d - 2 * ch - 8);
          add(chamfer(px - 3, px + 3, h, h + 2.4, pz - 2.5, pz + 2.5, 0.4), trim);
          add(new THREE.PlaneGeometry(4.4, 3.6).rotateX(-Math.PI / 2).translate(px, h + 2.45, pz), vent);
        }
        lamp(beacons, 0.7, s.x1 - ch - 1, h + 0.4, s.y0 + ch + 1);
        if (s.kind === 'command') {
          add(chamfer(cx - w * 0.2, cx + w * 0.2, h, h + 18, cz - d * 0.2, cz + d * 0.2, 1.5), armorL);
          add(box(w * 0.42, 1.2, d * 0.42, cx, h + 14, cz), win);
          add(new THREE.CylinderGeometry(0.4, 0.6, 22, 5).translate(cx, h + 29, cz), steel);
          lamp(beacons, 1, cx, h + 40.5, cz);
          const dish = new THREE.Group();
          dish.position.set(cx + w * 0.3, h, cz - d * 0.25);
          dish.add(mesh(new THREE.CylinderGeometry(0.5, 0.8, 4, 6).translate(0, 2, 0), steel));
          dish.add(mesh(new THREE.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(Math.PI / 2.4).translate(0, 6, 1.5), std({ color: '#c8d0d8', side: THREE.DoubleSide })));
          root.add(dish);
          rig.dishes.push(dish);
        }
        if (s.kind === 'plant') {
          for (let k = 0; k < 3; k++) {
            const px = s.x0 + w * (0.25 + k * 0.25);
            add(new THREE.CylinderGeometry(4, 4, 6, 12).translate(px, h + 3, cz), steel);
            add(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 12).translate(px, h + 6.1, cz), amber);
          }
        }
        if (s.kind === 'armory' || s.kind === 'gatehouse') {
          // A twin gun on the roof.
          add(new THREE.CylinderGeometry(2.2, 2.6, 1, 8).translate(cx, h + 0.5, cz), steel);
          add(chamfer(cx - 2, cx + 2, h + 1, h + 3, cz - 1.8, cz + 1.8, 0.4), armorL);
          for (const sd of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.22, 0.25, 6, 6).rotateX(Math.PI / 2).translate(cx + sd, h + 2.2, cz + 4), dark);
        }
      }
    }
  }

  function frontWork(s: Struct, i: number): void {
    const w = s.x1 - s.x0, d = s.y1 - s.y0, cx = (s.x0 + s.x1) / 2, cz = (s.y0 + s.y1) / 2;
    if (s.kind === 'sandbag') {
      // Concrete barriers, sloped both sides.
      const along = w > d;
      add(hull(along
        ? [[s.x0, 0, cz - 1.6], [s.x1, 0, cz - 1.6], [s.x0, 0, cz + 1.6], [s.x1, 0, cz + 1.6], [s.x0, 2.4, cz - 0.5], [s.x1, 2.4, cz - 0.5], [s.x0, 2.4, cz + 0.5], [s.x1, 2.4, cz + 0.5]]
        : [[cx - 1.6, 0, s.y0], [cx - 1.6, 0, s.y1], [cx + 1.6, 0, s.y0], [cx + 1.6, 0, s.y1], [cx - 0.5, 2.4, s.y0], [cx - 0.5, 2.4, s.y1], [cx + 0.5, 2.4, s.y0], [cx + 0.5, 2.4, s.y1]]), concrete);
      return;
    }
    if (s.kind === 'hedgehog') {
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) add(new THREE.BoxGeometry(5, 0.6, 0.6).rotateY(a).rotateZ(0.6).translate(cx, 1.6, cz), steel);
      return;
    }
    if (s.kind === 'searchlight') {
      add(new THREE.CylinderGeometry(0.5, 1.2, 24, 6).translate(cx, 12, cz), steel);
      add(box(3, 2, 3, cx, 24.5, cz), dark);
      add(box(2.4, 1.4, 0.3, cx, 24.5, cz + 1.6), win);
      lamp(beacons, 0.7, cx, 26, cz);
      return;
    }
    // A pillbox: a low armoured octagon, its gun slit lit, the twin gun on top (it tracks; see FRONT_GUNS).
    add(prism(oct(Math.max(w, d) / 2 * 1.1).map(([x, z]) => [cx + x, cz + z] as [number, number]), 0, 5.5, 1.2), armor);
    add(box(w * 0.7, 0.5, 0.3, cx, 3.2, s.y1 + 0.9), amber);
    void i;
  }
  FRONT_GUNS.forEach((gn, i) => {
    const base = new THREE.Group();
    base.position.set(gn.x, gn.kind === 'bunker' ? 5.5 : 0, gn.y);
    if (gn.kind === 'tank') {
      // A dug-in hover tank in a revetment.
      base.add(mesh(chamfer(-6, 6, 0, 3, -3.5, 3.5, 0.8), armorL));
    }
    const yaw = new THREE.Group();
    yaw.position.y = gn.kind === 'tank' ? 3 : 0;
    yaw.add(mesh(chamfer(-2.6, 2.6, 0, 2.2, -2.2, 2.2, 0.6), armorL));
    for (const sd of [-0.7, 0.7]) yaw.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 7, 6).rotateZ(-Math.PI / 2).translate(5.5, 1.2, gn.kind === 'tank' ? 0 : sd), dark));
    yaw.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(-2.4, 1.8, 0), beacons, false));
    base.add(yaw);
    root.add(base);
    rig.turrets.push({ yaw, kind: 'front', i });
  });

  // ============================================================================================ pads, pylons, batteries
  for (const hp of HELIPADS) {
    add(new THREE.CylinderGeometry(19, 20, 1.2, 24).translate(hp.x, 0.6, hp.y), dark);
    add(new THREE.TorusGeometry(16, 0.5, 4, 32).rotateX(Math.PI / 2).translate(hp.x, 1.3, hp.y), glow);
    for (let k = 0; k < 8; k++) lamp(amber, 0.6, hp.x + Math.cos((k / 8) * Math.PI * 2) * 19, 1.5, hp.y + Math.sin((k / 8) * Math.PI * 2) * 19);
  }
  for (const p of PADS) {
    // A docking cradle: rails down both long sides with light strips, gantry arms over the bow and the stern.
    for (const sx of [-1, 1]) {
      const x = p.x + sx * (PAD_W / 2 + 3);
      add(chamfer(x - 3, x + 3, 0, 6, p.y - PAD_L / 2, p.y + PAD_L / 2, 1), armorL);
      add(box(0.4, 0.6, PAD_L - 6, x - sx * 3.1, 4.5, p.y), glow);
    }
    for (const sz of [-1, 1]) {
      const z = p.y + sz * (PAD_L / 2 - 20);
      for (const sx of [-1, 1]) add(box(3, 34, 3, p.x + sx * (PAD_W / 2 + 3), 17, z), steel);
      add(box(PAD_W + 10, 3, 4, p.x, 34, z), std({ color: '#d89a1c', metalness: 0.5, roughness: 0.4 }));
      lamp(amber, 1, p.x, 36, z);
    }
  }
  // Shield pylons at the four corners, inside the wall.
  for (const [x, z] of [[C.x0 + 40, C.y0 + 40], [C.x1 - 40, C.y0 + 40], [C.x0 + 40, C.y1 - 40], [C.x1 - 40, C.y1 - 40]]) {
    add(hull([[x - 5, 0, z - 5], [x + 5, 0, z - 5], [x - 5, 0, z + 5], [x + 5, 0, z + 5], [x - 1.5, 52, z - 1.5], [x + 1.5, 52, z - 1.5], [x - 1.5, 52, z + 1.5], [x + 1.5, 52, z + 1.5]]), armor);
    add(new THREE.OctahedronGeometry(3.4).translate(x, 57, z), glow);
    for (const y of [14, 28, 42]) add(box(10.5 - y / 7, 0.6, 10.5 - y / 7, x, y, z), glowDim);
  }
  // Missile batteries by the airfield and the armoury.
  for (const [x, z] of [[740 - 30, 186 + 10], [740 - 30, 600], [-360, 980 - 60]]) {
    add(chamfer(x - 8, x + 8, 0, 3, z - 6, z + 6, 0.8), armor);
    add(hull([[x - 7, 3, z - 5], [x + 7, 3, z - 5], [x - 7, 3, z + 5], [x + 7, 3, z + 5], [x - 7, 12, z - 2], [x + 7, 12, z - 2], [x - 7, 9, z + 5], [x + 7, 9, z + 5]]), armorL);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) lamp(beacons, 0.9, x - 5 + a * 3.3, 9.5 + b * 1.6, z + 3.2 - b * 2.6);
  }
  // A tower crane swinging over the supply yard.
  {
    const x = 578, z = 600;
    add(box(3, 70, 3, x, 35, z), std({ color: '#d89a1c', metalness: 0.5, roughness: 0.4 }));
    const jib = new THREE.Group();
    jib.position.set(x, 70, z);
    jib.add(mesh(new THREE.BoxGeometry(80, 2.5, 2.5).translate(22, 0, 0), std({ color: '#d89a1c', metalness: 0.5, roughness: 0.4 })));
    jib.add(mesh(new THREE.BoxGeometry(8, 5, 5).translate(-16, -1, 0), dark));
    jib.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 30, 4).translate(50, -15, 0), steel));
    jib.add(mesh(new THREE.BoxGeometry(6, 3, 6).translate(50, -31, 0), hazard));
    jib.add(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(61, 1.6, 0), beacons, false));
    root.add(jib);
    rig.jibs.push(jib);
  }

  // ============================================================================================ the pines
  {
    const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(cone, pineM, PINES.length);
    const m4 = new THREE.Matrix4();
    PINES.forEach((t, k) => {
      m4.makeScale(t.r, t.h, t.r).setPosition(t.x, 0, t.y);
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    root.add(im);
  }

  merge(statics, lines);
  return rig;
}

/** Merges a group's meshes by material (fewer draw calls), outlining the solid ones. */
function merge(g: THREE.Group, lines: THREE.LineBasicMaterial): void {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const ch of [...g.children]) {
    if (!(ch instanceof THREE.Mesh) || Array.isArray(ch.material)) continue;
    ch.updateMatrix();
    const geo = (ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone()).applyMatrix4(ch.matrix);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const list = by.get(ch.material) ?? [];
    list.push(geo);
    by.set(ch.material, list);
    g.remove(ch);
  }
  for (const [mat, list] of by) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const basicM = mat instanceof THREE.MeshBasicMaterial;
    const me = mesh(merged, mat, !basicM);
    if (!basicM && !(mat as THREE.MeshStandardMaterial).polygonOffset) me.add(new THREE.LineSegments(new THREE.EdgesGeometry(merged, 30), lines));
    g.add(me);
  }
}
