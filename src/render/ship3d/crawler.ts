import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  basic, belt, box, chamfer, grilleTexture, hatchTexture, hull, mergeChildren, mesh, meshTexture, numberTexture, placeProps, plateTexture, ribTexture,
  treadTexture, turret, ventTexture, wheelTexture, type BuildOpts, type ShipRig,
} from './model';

/**
 * The bigger hulls, built after the "TITAN CRAWLER / Mobile Fortress" sheet: three hulls abreast, each running out
 * ahead into a long wedge prow that slopes to the ground (the outer two swept back along their outer edge, the middle
 * one blunt and set back), white LED strips low on the prows' flanks, the outer hulls' tops a walkway for the guns
 * along a sharp crease, the superstructure stepped up from blocks on every hull to a spine, a gun deck and the
 * battleship command tower with its mast and aerials, red marker lights everywhere, a crawler unit every few metres
 * down each side under a boxy armour skirt (five a side on the Titan Crawler, six on the Dreadnought), and at the stern
 * the vehicle ramp between two pairs of tall red light strips, swinging down to the ground when she stops. Matte
 * black like the sheet; the class gives the accent light colour. Same axes as the Shark: X forward, Y up, Z starboard.
 */
export function buildCrawler(o: BuildOpts): ShipRig {
  const { L, W, H, klass, look, cc } = o;
  const dread = o.frame === 'dread';
  const hw = W / 2, k = L / 100;
  /** Along the hull from the nose (0) to the stern (1); across from the keel (0) to the side (1); up (1 = the roof). */
  const X = (f: number): number => L / 2 - f * L;
  const Z = (w: number): number => w * hw;
  const Y = (h: number): number => h * H;
  const root = new THREE.Group();

  const std = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.55, flatShading: true, ...p });
  const hullM = std({ color: '#ffffff', map: plateTexture(look.hull) });
  const plateM = std({ color: '#ffffff', map: plateTexture(look.plate), roughness: 0.45 });
  const deckM = std({ color: '#c8ccd2', map: plateTexture(look.hull), roughness: 0.75 });
  const darkM = std({ color: look.dark, roughness: 0.8 });
  const trimM = std({ color: look.trim, metalness: 0.55, roughness: 0.4 });
  const glowM = basic(look.glow);
  const glowDim = basic(new THREE.Color(look.glow).multiplyScalar(0.5));
  const ledM = basic('#f2fbff');
  const redM = basic('#ff2414');
  const redDim = basic('#a8140c');
  const amberM = basic('#ffc35a');
  const winM = basic('#e8a456');
  const rearM = basic(look.rear);
  const bayM = basic('#5a4030');
  const decal = (map: THREE.Texture, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => std({ map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, flatShading: false, ...p });
  const grilleM = decal(grilleTexture());
  const ribM = decal(ribTexture());
  const meshM = decal(meshTexture());
  const ventM = decal(ventTexture());
  const hatchM = decal(hatchTexture());
  const numM = decal(numberTexture(o.number, '#d8dee8'), { transparent: true, depthWrite: false });
  const lines = new THREE.LineBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(0.16), transparent: true, opacity: 0.7 });
  const rig: ShipRig = {
    root, treads: [[], []], wheels: [[], []], wheelFaces: [], turrets: new Map(), fans: [], cores: [], flames: [], radar: null,
    glow: [glowM, glowDim, rearM], hullMats: [hullM, plateM, trimM, deckM], lines, roofAt: () => H, key: '',
  };
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh => {
    const me = mesh(g, m, cast);
    root.add(me);
    return me;
  };
  const lay = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number, yaw = 0): void => {
    add(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, y + 0.05, z), m, false);
  };
  /** A decal on a wall facing `face` (+1: +Z, -1: -Z, 2: +X, -2: -X). */
  const wall = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, face: number): void => {
    const g = new THREE.PlaneGeometry(w, h);
    if (face === -1) g.rotateY(Math.PI);
    if (face === 2) g.rotateY(Math.PI / 2);
    if (face === -2) g.rotateY(-Math.PI / 2);
    const e = 0.06;
    add(g.translate(x + (face === 2 ? e : face === -2 ? -e : 0), y, z + (face === 1 ? e : face === -1 ? -e : 0)), m, false);
  };
  const lamp = (m: THREE.Material, s: number, x: number, y: number, z: number): void => {
    add(new THREE.BoxGeometry(s, s, s).translate(x, y, z), m, false);
  };
  const bar = (m: THREE.Material, a: [number, number, number], b: [number, number, number], t = 0.3 * k): void => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const me = mesh(new THREE.BoxGeometry(va.distanceTo(vb), t, t), m, false);
    me.position.copy(va).add(vb).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vb.sub(va).normalize());
    root.add(me);
  };
  const sides = [-1, 1];
  /**
   * An armoured block: the front face raked back by `rake` of its height, the top edges cut back by `ch`. `f0` is
   * its front, `f1` its back (fractions of the length), `w0..w1` across (signed), `h0..h1` up.
   */
  const block = (f0: number, f1: number, z0: number, z1: number, y0: number, y1: number, rake = 0.35, ch = 0.6 * k, rakeBack = 0.12): THREE.BufferGeometry => {
    const xf = X(f0), xr = X(f1), s = (y1 - y0) * rake, sb = (y1 - y0) * rakeBack;
    return hull([
      [xf, y0, z0], [xf, y0, z1], [xr, y0, z0], [xr, y0, z1],
      [xf - s, y1 - ch, z0], [xf - s, y1 - ch, z1], [xr + sb, y1 - ch, z0], [xr + sb, y1 - ch, z1],
      [xf - s - ch, y1, z0 + ch], [xf - s - ch, y1, z1 - ch], [xr + sb + ch, y1, z0 + ch], [xr + sb + ch, y1, z1 - ch],
    ]);
  };

  // ================================================================================== running gear
  // A crawler unit every few metres down each side: the belt round two big end wheels, road wheels and return rollers,
  // its middle hidden behind a boxy armour skirt with panel seams and marker lamps.
  const N = dread ? 6 : 5;
  const trackTop = Y(0.31), tw = Z(0.16), zIn = hw - tw, beltT = 0.5 * k;
  const treadBase = treadTexture();
  const faces = new Map<string, THREE.Material>();
  const faceMat = (side: number, r: number): THREE.Material => {
    const key = `${side}|${r.toFixed(3)}`;
    let m = faces.get(key);
    if (!m) {
      const t = wheelTexture().clone();
      t.center.set(0.5, 0.5);
      t.needsUpdate = true;
      rig.wheelFaces.push({ tex: t, r, side });
      m = std({ color: '#ffffff', map: t, flatShading: false });
      faces.set(key, m);
    }
    return m;
  };
  const fa = 0.125, fb = 0.985, gap = 0.024;
  const ul = (fb - fa - gap * (N - 1)) / N;
  const units: [number, number][] = [];
  for (let i = 0; i < N; i++) units.push([fa + i * (ul + gap), fa + i * (ul + gap) + ul]);
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? -1 : 1;
    for (const [u0, u1] of units) {
      const x1 = X(u0), x0 = X(u1);
      const rI = trackTop * 0.45, rW = trackTop * 0.16, rR = trackTop * 0.07;
      const circles: [number, number, number][] = [[x1 - rI, rI + 0.2 * k, rI], [x0 + rI, rI + 0.2 * k, rI]];
      const n = Math.max(3, Math.round((x1 - x0 - 2.2 * rI) / (2 * rW + 0.4 * k)));
      const roads: number[] = [];
      for (let i = 0; i < n; i++) roads.push(x0 + rI * 1.2 + ((x1 - x0 - rI * 2.4) * i) / Math.max(1, n - 1));
      for (const x of roads) circles.push([x, rW, rW]);
      const rollers = [x0 + (x1 - x0) * 0.35, x0 + (x1 - x0) * 0.65];
      for (const x of rollers) circles.push([x, trackTop - rR, rR]);
      const b = belt(circles, sd < 0 ? -hw : zIn, sd < 0 ? -zIn : hw, 8.8 * k, beltT);
      const tt = treadBase.clone();
      tt.needsUpdate = true;
      tt.userData.k = 1 / (8.8 * k);
      rig.treads[s].push(tt);
      const tm = new THREE.MeshStandardMaterial({ map: tt, color: '#9aa0a8', metalness: 0.55, roughness: 0.6 });
      add(b.band, tm);
      add(b.rims, tm);
      add(box(x1 - x0 - rI * 2, trackTop * 0.55, tw - 1.4 * k, (x0 + x1) / 2, trackTop * 0.5, sd * (hw - tw / 2 - 0.2 * k)), darkM);
      const wheel = (x: number, y: number, r: number, segs: number): void => {
        const z = sd * (hw - 0.5 * k);
        add(new THREE.CylinderGeometry(r, r, 0.9 * k, segs, 1, true).rotateX(Math.PI / 2).translate(x, y, z), darkM);
        const face = new THREE.CircleGeometry(r, segs);
        if (sd < 0) face.rotateY(Math.PI);
        add(face.translate(x, y, z + sd * 0.46 * k), faceMat(s, r));
      };
      wheel(x1 - rI, rI + 0.2 * k, rI - beltT, 20);
      wheel(x0 + rI, rI + 0.2 * k, rI - beltT, 20);
      for (const x of roads) wheel(x, rW, rW - beltT, 12);
      // The skirt over the middle of the unit: a thick armour box, panel seams, a lamp at its top corners.
      const sa = x0 + (x1 - x0) * 0.2, sb2 = x1 - (x1 - x0) * 0.2;
      const zo = sd * (hw + (klass === 'bastion' ? 1.3 : 0.6) * k), zi = sd * (hw - tw * 0.55);
      add(chamfer(sa, sb2, Y(0.09), trackTop + Y(0.03), Math.min(zo, zi), Math.max(zo, zi), 0.45 * k, 0.6 * k), plateM);
      const seams = Math.max(2, Math.round((sb2 - sa) / (3 * k)));
      for (let i = 1; i < seams; i++) add(box(0.22 * k, trackTop * 0.7, 0.2 * k, sa + ((sb2 - sa) * i) / seams, Y(0.19), zo + sd * 0.05 * k), darkM, false);
      add(box(sb2 - sa - 0.8 * k, 0.22 * k, 0.2 * k, (sa + sb2) / 2, Y(0.24), zo + sd * 0.05 * k), darkM, false);
      lamp(redM, 0.42 * k, sb2 - 0.6 * k, trackTop + Y(0.01), zo + sd * 0.05 * k);
      lamp(amberM, 0.3 * k, sa + 0.6 * k, trackTop + Y(0.01), zo + sd * 0.05 * k);
      if (cc >= 3) add(box(sb2 - sa - 1.4 * k, 0.6 * k, 0.6 * k, (sa + sb2) / 2, Y(0.12), zo + sd * 0.3 * k), trimM);
    }
  }

  // ================================================================================== the belly
  add(box(X(0.1) - X(0.985), Y(0.3), 2 * (zIn - 0.2 * k), (X(0.1) + X(0.985)) / 2, Y(0.25), 0), darkM);

  // ================================================================================== the three hulls
  // The outer hulls: a vertical flank, then a sharp crease and a raked upper facet up to the walkway; built in
  // segments that stand a little proud of each other. The stern segment slopes down to the stern.
  const OW0 = 0.3, OW1 = 0.97, OTOP = 0.72, CW = 0.26, CTOP = 0.78;
  const outerTop = (f: number): number => (f < 0.24 ? Y(0.2) + (Y(OTOP) - Y(0.2)) * (f / 0.24) : f > 0.955 ? Y(OTOP) - (Y(OTOP) - Y(0.6)) * Math.min(1, (f - 0.955) / 0.03) : Y(OTOP));
  const profile = (x: number, sd: number, top: number, wo = OW1): [number, number, number][] => [
    [x, Y(0.33), sd * Z(OW0)], [x, Y(0.33), sd * Z(wo)], [x, Y(0.56), sd * Z(wo)], [x, top - Y(0.07), sd * Z(wo - 0.045)], [x, top, sd * Z(wo - 0.1)], [x, top, sd * Z(OW0 + 0.02)], [x, top - Y(0.03), sd * Z(OW0)],
  ];
  const SEG = [0.24, 0.37, 0.45, 0.6, 0.69, 0.84, 0.955];
  for (const sd of sides) {
    for (let i = 0; i < SEG.length - 1; i++) {
      const proud = i % 2 === 1;
      const wo = proud ? OW1 + 0.02 : OW1;
      const top = Y(OTOP + (proud ? 0.015 : 0));
      add(hull([...profile(X(SEG[i]) - 0.05 * k, sd, top, wo), ...profile(X(SEG[i + 1]) + 0.05 * k, sd, top, wo)]), proud ? plateM : hullM);
    }
    // The stern: the walkway slopes down, the rear face rakes in.
    add(hull([...profile(X(0.955), sd, Y(OTOP)), ...profile(X(0.985), sd, Y(0.6)).map(([x, y, z]) => [x, y, z] as [number, number, number])]), hullM);
    // The prow: a long wedge from the walkway's front down to a blade at the ground, swept back along its outer edge,
    // a ridge along its top so it reads as two facets.
    const back = profile(X(0.24), sd, Y(OTOP));
    add(hull([
      ...back,
      [X(0), Y(0.2), sd * Z(0.34)], [X(0), Y(0.2), sd * Z(0.55)], [X(0.012), Y(0.06), sd * Z(0.36)], [X(0.012), Y(0.06), sd * Z(0.53)],
      [X(0.12), Y(0.485), sd * Z(0.62)],
    ]), plateM);
    // The stacked cap on the prow's back half, its blunt face lit by two red eyes.
    add(hull([
      [X(0.33), Y(OTOP) - 0.3 * k, sd * Z(0.36)], [X(0.33), Y(OTOP) - 0.3 * k, sd * Z(0.76)], [X(0.33), Y(OTOP + 0.075), sd * Z(0.38)], [X(0.33), Y(OTOP + 0.075), sd * Z(0.74)],
      [X(0.085), Y(0.36), sd * Z(0.4)], [X(0.085), Y(0.36), sd * Z(0.6)], [X(0.085), Y(0.43), sd * Z(0.41)], [X(0.085), Y(0.43), sd * Z(0.59)],
    ]), hullM);
    lamp(redM, 0.5 * k, X(0.085) + 0.2 * k, Y(0.405), sd * Z(0.45));
    lamp(redM, 0.5 * k, X(0.085) + 0.2 * k, Y(0.405), sd * Z(0.55));
    // The LED fang: a white strip low along the prow's outer flank, and a shorter one on its inner flank.
    const flank = (u: number, v: number): [number, number, number] => {
      // The outer flank's corners: tip bottom, back bottom, back top, tip top.
      const A = [X(0.012), Y(0.06), Z(0.53)], B = [X(0.24), Y(0.33), Z(OW1)], C = [X(0.24), Y(OTOP - 0.07), Z(OW1 - 0.045)], D = [X(0), Y(0.2), Z(0.55)];
      const p = [0, 1, 2].map((j) => (A[j] + (B[j] - A[j]) * u) * (1 - v) + (D[j] + (C[j] - D[j]) * u) * v);
      return [p[0], p[1], sd * (p[2] + 0.35 * k)];
    };
    bar(ledM, flank(0.06, 0.42), flank(0.62, 0.3), 0.42 * k);
    bar(ledM, [X(0.03), Y(0.15), sd * (Z(0.34) - 0.3 * k)], [X(0.11), Y(0.27), sd * (Z(0.3) - 0.3 * k)], 0.3 * k);
    // The class's light along the prow's ridge and the walkway's crease: a hard line of light down the whole flank.
    bar(glowM, [X(0.02), Y(0.24), sd * Z(0.5)], [X(0.12), Y(0.5), sd * Z(0.62)], 0.22 * k);
    bar(glowDim, [X(0.25), Y(OTOP) - 0.12 * k, sd * (Z(OW1 - 0.1) + 0.1 * k)], [X(0.95), Y(OTOP) - 0.12 * k, sd * (Z(OW1 - 0.1) + 0.1 * k)], 0.2 * k);
    // The front gun shoulder: the flank's top running forward and down over the first crawler to a flat gun pad at the
    // corner, its face raked like the prows', a white light along its jaw.
    add(hull([
      [X(0.245), Y(0.33), sd * Z(0.74)], [X(0.245), Y(0.33), sd * Z(OW1)], [X(0.245), Y(OTOP) - 0.4 * k, sd * Z(0.76)], [X(0.245), Y(OTOP - 0.07), sd * Z(OW1 - 0.045)],
      [X(0.1), Y(0.3), sd * Z(0.74)], [X(0.1), Y(0.3), sd * Z(OW1)], [X(0.1), Y(0.44), sd * Z(0.76)], [X(0.1), Y(0.44), sd * Z(OW1 - 0.03)],
    ]), hullM);
    add(hull([
      [X(0.105), Y(0.12), sd * Z(0.75)], [X(0.105), Y(0.12), sd * Z(0.99)], [X(0.105), Y(0.44), sd * Z(0.76)], [X(0.105), Y(0.44), sd * Z(0.97)],
      [X(0.0), Y(0.12), sd * Z(0.78)], [X(0.0), Y(0.12), sd * Z(0.96)], [X(0.02), Y(0.36), sd * Z(0.79)], [X(0.02), Y(0.36), sd * Z(0.95)],
      [X(0.03), Y(0.44), sd * Z(0.8)], [X(0.03), Y(0.44), sd * Z(0.94)],
    ]), plateM);
    bar(ledM, [X(0.0) + 0.1 * k, Y(0.17), sd * Z(0.8)], [X(0.0) + 0.1 * k, Y(0.17), sd * Z(0.95)], 0.36 * k);
    lamp(redM, 0.45 * k, X(0.03), Y(0.45), sd * Z(0.98));
    // Armour panels hung on the flank in a staggered run, a slot between each.
    {
      let f = 0.255, i = 0;
      while (f < 0.94) {
        const len = [0.07, 0.11, 0.05, 0.09, 0.13, 0.06][i % 6];
        const f1 = Math.min(0.945, f + len);
        const out = (i % 3 === 1 ? 0.75 : 0.45) * k, zb = Z(OW1 + (i % 2 ? 0.02 : 0));
        add(chamfer(X(f1), X(f), Y(0.355), Y(i % 2 ? 0.545 : 0.52), sd < 0 ? -zb - out : zb - 0.2 * k, sd < 0 ? -zb + 0.2 * k : zb + out, 0.25 * k, 0.35 * k), i % 2 ? hullM : plateM);
        if (i % 3 === 2) wall(ventM, (f1 - f) * L * 0.6, 1.2 * k, X((f + f1) / 2), Y(0.43), sd * (zb + out), sd);
        f = f1 + 0.008;
        i++;
      }
    }
    // The flank: the hull number, a row of red marker lamps, slotted vents, the "exterior walkway" rail lights.
    wall(numM, 6.5 * k, 3.2 * k, X(0.53), Y(0.62), sd * (Z(OW1 + 0.02) + 0.05 * k), sd);
    for (let f = 0.29; f < 0.95; f += 0.085) lamp(redM, 0.36 * k, X(f), Y(0.6), sd * (Z(OW1) + 0.3 * k));
    for (let f = 0.27; f < 0.95; f += 0.045) lamp(amberM, 0.22 * k, X(f), Y(OTOP) + 0.3 * k, sd * Z(0.9));
  }
  // The middle hull and its blunt prow, set back from the outer blades: an LED bar across its nose, a grille under it.
  add(hull([
    [X(0.22), Y(0.33), -Z(CW)], [X(0.22), Y(0.33), Z(CW)], [X(0.985), Y(0.33), -Z(CW)], [X(0.985), Y(0.33), Z(CW)],
    [X(0.22), Y(CTOP) - 0.7 * k, -Z(CW)], [X(0.22), Y(CTOP) - 0.7 * k, Z(CW)], [X(0.985), Y(CTOP) - 0.7 * k, -Z(CW)], [X(0.985), Y(CTOP) - 0.7 * k, Z(CW)],
    [X(0.22), Y(CTOP), -Z(CW) + 0.7 * k], [X(0.22), Y(CTOP), Z(CW) - 0.7 * k], [X(0.985), Y(CTOP), -Z(CW) + 0.7 * k], [X(0.985), Y(CTOP), Z(CW) - 0.7 * k],
  ]), deckM);
  add(hull([
    [X(0.23), Y(0.1), -Z(CW)], [X(0.23), Y(0.1), Z(CW)], [X(0.23), Y(CTOP), -Z(CW) + 0.7 * k], [X(0.23), Y(CTOP), Z(CW) - 0.7 * k],
    [X(0.035), Y(0.1), -Z(0.16)], [X(0.035), Y(0.1), Z(0.16)], [X(0.035), Y(0.44), -Z(0.16)], [X(0.035), Y(0.44), Z(0.16)],
    [X(0.06), Y(0.5), -Z(0.13)], [X(0.06), Y(0.5), Z(0.13)], [X(0.13), Y(0.66), 0],
  ]), plateM);
  add(box(0.4 * k, 0.55 * k, Z(0.3), X(0.035) + 0.2 * k, Y(0.38), 0), ledM, false);
  wall(grilleM, Z(0.28), Y(0.2), X(0.035), Y(0.21), 0, 2);
  for (const sd of sides) {
    bar(ledM, [X(0.06), Y(0.3), sd * (Z(0.2) + 0.3 * k)], [X(0.17), Y(0.44), sd * (Z(0.25) + 0.3 * k)], 0.3 * k);
    lamp(redM, 0.45 * k, X(0.06), Y(0.52), sd * Z(0.1));
  }
  bar(glowM, [X(0.065), Y(0.5) + 0.2 * k, 0], [X(0.13), Y(0.66) + 0.2 * k, 0], 0.22 * k);

  // ================================================================================== the superstructure
  // Blocks along each outer hull (the walkway left clear outboard for the guns), the spine blocks on the middle hull,
  // the gun deck on the spine, and the command tower aft of the main battery.
  const OUTB: [number, number, number][] = [[0.28, 0.4, 0.9], [0.47, 0.585, 0.97], [0.605, 0.72, 0.94], [0.79, 0.93, 0.88]];
  const OB0 = 0.34, OB1 = 0.72;
  for (const sd of sides) {
    OUTB.forEach(([f0, f1, top], i) => {
      add(block(f0, f1, sd < 0 ? -Z(OB1) : Z(OB0), sd < 0 ? -Z(OB0) : Z(OB1), Y(OTOP) - 0.2 * k, Y(top), i === 0 ? 0.7 : 0.35), i % 2 ? plateM : hullM);
      const xm = (X(f0) + X(f1)) / 2, len = X(f0) - X(f1);
      // Lit windows along the outer face, red lamps at the front corners, a hatch and vents on top.
      add(box(len * 0.55, 0.32 * k, 0.15 * k, xm - len * 0.05, Y(top) - 1.3 * k, sd * (Z(OB1) + 0.04 * k)), winM, false);
      lamp(redM, 0.4 * k, X(f0) - (Y(top) - Y(OTOP)) * (i === 0 ? 0.7 : 0.35) - 0.4 * k, Y(top) - 0.1 * k, sd * Z(OB1 - 0.03));
      lamp(redM, 0.4 * k, X(f1) + 0.4 * k, Y(top) - 0.1 * k, sd * Z(OB1 - 0.03));
      lay(hatchM, 2.4 * k, 2.4 * k, xm - len * 0.2, Y(top), sd * Z(0.6));
      lay(ventM, 3.4 * k, 1.5 * k, xm + len * 0.15, Y(top), sd * Z(0.46), Math.PI / 2);
      bar(glowDim, [X(f1) + 0.8 * k, Y(top) - 0.62 * k, sd * (Z(OB1) + 0.05 * k)], [xm + len * 0.2, Y(top) - 0.62 * k, sd * (Z(OB1) + 0.05 * k)], 0.16 * k);
      if (i === 2) {
        // A second storey on the third block, its windows lit.
        add(block(f0 + 0.02, f1 - 0.025, sd < 0 ? -Z(0.66) : Z(0.4), sd < 0 ? -Z(0.4) : Z(0.66), Y(top) - 0.2 * k, Y(top + 0.08), 0.5, 0.4 * k), darkM);
        add(box(len * 0.4, 0.3 * k, 0.12 * k, xm, Y(top + 0.055), sd * (Z(0.66) + 0.04 * k)), winM, false);
      }
    });
    // A cupola with an aerial on the second block, a sensor mast on the last.
    add(chamfer(X(0.54), X(0.505), Y(0.935) - 0.2 * k, Y(1.03), sd < 0 ? -Z(0.62) : Z(0.44), sd < 0 ? -Z(0.44) : Z(0.62), 0.4 * k), darkM);
    add(box(X(0.505) - X(0.54) - 0.8 * k, 0.4 * k, 0.15 * k, (X(0.54) + X(0.505)) / 2, Y(1.0), sd * (Z(0.62) + 0.05 * k)), winM, false);
    add(new THREE.CylinderGeometry(0.1 * k, 0.16 * k, Y(0.4), 5).translate(X(0.52), Y(1.03) + Y(0.2), sd * Z(0.58)), trimM);
    lamp(redM, 0.36 * k, X(0.52), Y(1.43), sd * Z(0.58));
    add(new THREE.CylinderGeometry(0.1 * k, 0.14 * k, Y(0.36), 5).translate(X(0.86), Y(0.86) + Y(0.18), sd * Z(0.6)), trimM);
    lamp(redM, 0.32 * k, X(0.86), Y(1.22), sd * Z(0.6));
    // The four toroid fans in the walkway gaps between the blocks.
  }
  const fanAt: [number, number][] = [[0.435, -1], [0.435, 1], [0.755, -1], [0.755, 1]];
  for (const [f, sd] of fanAt) {
    const x = X(f), z = sd * Z(0.53), y = Y(OTOP), rr = Math.min(3.4 * k, (X(0.4) - X(0.47)) * 0.42);
    add(new THREE.CylinderGeometry(rr, rr, 0.5 * k, 18).translate(x, y + 0.05 * k, z), darkM);
    add(new THREE.TorusGeometry(rr, 0.22 * k, 5, 22).rotateX(Math.PI / 2).translate(x, y + 0.32 * k, z), trimM);
    const coreM = basic(look.glow);
    add(new THREE.CylinderGeometry(rr * 0.32, rr * 0.32, 0.4 * k, 12).translate(x, y + 0.35 * k, z), coreM, false);
    rig.cores.push(coreM);
    const fan = new THREE.Group();
    fan.position.set(x, y + 0.45 * k, z);
    fan.add(mesh(mergeGeometries([0, 1, 2].map((i) => new THREE.BoxGeometry(rr * 1.85, 0.12 * k, 0.45 * k).rotateY((i * Math.PI) / 3)), false)!, trimM, false));
    root.add(fan);
    rig.fans.push(fan);
  }
  // The spine on the middle hull.
  const SP0 = 0.245, SPIN: [number, number, number, number][] = [[0.24, 0.37, SP0, 0.93], [0.385, 0.755, 0.25, 0.99], [0.77, 0.955, 0.24, 0.93]];
  SPIN.forEach(([f0, f1, w, top], i) => {
    add(block(f0, f1, -Z(w), Z(w), Y(CTOP) - 0.3 * k, Y(top), i === 0 ? 0.9 : 0.3, 0.7 * k), i === 1 ? plateM : hullM);
    for (const sd of sides) {
      add(box((X(f0) - X(f1)) * 0.5, 0.3 * k, 0.15 * k, (X(f0) + X(f1)) / 2 - 1 * k, Y(top) - 1.4 * k, sd * (Z(w) + 0.04 * k)), winM, false);
      lamp(redM, 0.4 * k, X(f1) + 0.5 * k, Y(top) - 0.1 * k, sd * Z(w - 0.03));
    }
  });
  lay(numM, 6 * k, 3 * k, (X(0.24) + X(0.37)) / 2 - 1.5 * k, Y(0.93), 0, Math.PI / 2);
  lay(meshM, 3.6 * k, Z(0.3), X(0.935), Y(0.93), 0);
  if (cc >= 2) {
    // Missile cells on the forward spine block.
    for (const sd of sides) {
      add(chamfer(X(0.355), X(0.3), Y(0.93) - 0.2 * k, Y(0.93) + 1.6 * k, sd < 0 ? -Z(0.2) : Z(0.05), sd < 0 ? -Z(0.05) : Z(0.2), 0.3 * k), darkM);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) lamp(redDim, 0.5 * k, X(0.315) - i * 1.3 * k, Y(0.93) + 1.65 * k, sd * Z(0.09 + j * 0.07));
    }
  }
  // The gun deck: the main battery sits on its front.
  const GD: [number, number, number] = [0.41, 0.735, 0.19];
  add(block(GD[0], GD[1], -Z(GD[2]), Z(GD[2]), Y(0.99) - 0.3 * k, Y(1.1), 0.6, 0.6 * k), hullM);
  for (const sd of sides) bar(glowDim, [X(0.44), Y(1.1) - 0.7 * k, sd * (Z(GD[2]) + 0.05 * k)], [X(0.72), Y(1.1) - 0.7 * k, sd * (Z(GD[2]) + 0.05 * k)], 0.18 * k);
  // The command tower: stacked blocks narrowing upward, the bridge's window band, the mast with its yard, aerials.
  const T0 = 0.56, T1 = 0.7;
  add(block(T0, T1, -Z(0.16), Z(0.16), Y(1.1) - 0.2 * k, Y(1.26), 0.25, 0.5 * k), plateM);
  add(block(T0 + 0.015, T1 - 0.015, -Z(0.125), Z(0.125), Y(1.26) - 0.2 * k, Y(1.4), 0.3, 0.4 * k), hullM);
  add(block(T0 + 0.035, T1 - 0.035, -Z(0.085), Z(0.085), Y(1.4) - 0.2 * k, Y(1.47), 0.2, 0.3 * k), darkM);
  for (const sd of sides) add(box(X(T0 + 0.03) - X(T1 - 0.03), Y(0.08), Z(0.06), X((T0 + T1) / 2), Y(1.2), sd * Z(0.19)), darkM);
  {
    const yb = Y(1.345), x0 = X(T1 - 0.015) + 0.6 * k, x1 = X(T0 + 0.015) - (Y(1.4) - Y(1.26)) * 0.3 * 0.55;
    for (const sd of sides) add(box(x1 - x0, 0.5 * k, 0.15 * k, (x0 + x1) / 2, yb, sd * (Z(0.125) + 0.06 * k)), winM, false);
    add(box(0.15 * k, 0.5 * k, Z(0.2), x1 + 0.08 * k, yb, 0), winM, false);
    add(box(0.15 * k, 0.5 * k, Z(0.2), x0 - 0.08 * k, yb, 0), winM, false);
    const xm = X((T0 + T1) / 2);
    add(new THREE.CylinderGeometry(0.22 * k, 0.45 * k, Y(0.4), 6).translate(xm, Y(1.47) + Y(0.2), 0), trimM);
    add(box(0.35 * k, 0.35 * k, Z(0.28), xm, Y(1.72), 0), trimM);
    add(box(0.3 * k, 0.3 * k, Z(0.16), xm + 0.6 * k, Y(1.62), 0), trimM);
    lamp(redM, 0.5 * k, xm, Y(1.88), 0);
    for (const sd of sides) {
      lamp(redM, 0.36 * k, xm, Y(1.72), sd * Z(0.14));
      add(new THREE.CylinderGeometry(0.08 * k, 0.12 * k, Y(0.3), 5).translate(X(T1 - 0.02), Y(1.4) + Y(0.15), sd * Z(0.09)), trimM);
      lamp(redM, 0.3 * k, X(T1 - 0.02), Y(1.71), sd * Z(0.09));
      add(new THREE.CylinderGeometry(0.08 * k, 0.12 * k, Y(0.24), 5).translate(X(T0 + 0.03), Y(1.4) + Y(0.12), sd * Z(0.1)), trimM);
    }
    if (cc >= 4) {
      const r = new THREE.Group();
      r.position.set(X(T1 - 0.05), Y(1.47), 0);
      r.add(mesh(new THREE.CylinderGeometry(0.3 * k, 0.4 * k, 1.4 * k, 6).translate(0, 0.7 * k, 0), trimM));
      r.add(mesh(new THREE.BoxGeometry(0.5 * k, 1.1 * k, 6 * k).translate(0, 1.8 * k, 0), darkM));
      r.add(mesh(new THREE.BoxGeometry(0.2 * k, 0.8 * k, 5.2 * k).translate(0.35 * k, 1.8 * k, 0), glowDim, false));
      root.add(r);
      rig.radar = r;
    }
  }
  // Three spires over the stern block, the rear view's crown.
  for (const [z, h] of [[-Z(0.09), 0.3], [0, 0.42], [Z(0.09), 0.3]] as const) {
    add(new THREE.ConeGeometry(0.55 * k, Y(h), 5).translate(X(0.9), Y(0.93) + Y(h) / 2, z), darkM);
    lamp(redM, 0.3 * k, X(0.9), Y(0.93) + Y(h) * 0.7, z + 0.4 * k);
  }
  if (cc >= 5 || dread) {
    // Searchlights and more aerials.
    for (const sd of sides) {
      add(box(1.4 * k, 1 * k, 1.6 * k, X(0.395), Y(0.99) + 0.5 * k, sd * Z(0.16)), darkM);
      lamp(ledM, 0.6 * k, X(0.395) + 0.75 * k, Y(0.99) + 0.5 * k, sd * Z(0.16));
      add(new THREE.CylinderGeometry(0.08 * k, 0.12 * k, Y(0.5), 5).translate(X(0.65), Y(0.9) + Y(0.25), sd * Z(0.66)), trimM);
    }
  }
  if (dread) {
    // The Dreadnought's second tower over the stern block, and a citadel of armour on each outer hull's bow.
    add(block(0.8, 0.9, -Z(0.13), Z(0.13), Y(0.93) - 0.2 * k, Y(1.18), 0.3, 0.5 * k), plateM);
    for (const sd of sides) add(box(X(0.8) - X(0.9) - 2 * k, 0.45 * k, 0.15 * k, X(0.85), Y(1.1), sd * (Z(0.13) + 0.05 * k)), winM, false);
    add(new THREE.CylinderGeometry(0.18 * k, 0.3 * k, Y(0.4), 6).translate(X(0.85), Y(1.18) + Y(0.2), 0), trimM);
    lamp(redM, 0.45 * k, X(0.85), Y(1.6), 0);
  }

  // ================================================================================== the stern
  // The vehicle bay between the outer hulls' red-lit faces, its ramp, the exhaust nozzles in the outer faces.
  const xs = X(0.985);
  add(box(0.2 * k, Y(0.4), Z(0.36), xs - 0.05 * k, Y(0.42), 0), bayM, false);
  {
    const len = Y(0.42), hy = Y(0.2);
    const ramp = new THREE.Group();
    ramp.position.set(xs - 0.25 * k, hy, 0);
    ramp.add(mesh(new THREE.BoxGeometry(len, 0.5 * k, Z(0.38)).translate(-len / 2, 0.25 * k, 0), plateM));
    ramp.add(mesh(new THREE.PlaneGeometry(len * 0.92, Z(0.32)).rotateX(-Math.PI / 2).translate(-len / 2, 0.52 * k, 0), ribM, false));
    for (const sd of sides) for (let i = 0; i < 4; i++) ramp.add(mesh(new THREE.BoxGeometry(0.3 * k, 0.3 * k, 0.3 * k).translate(-len * (0.15 + i * 0.22), 0.6 * k, sd * Z(0.17)), amberM, false));
    mergeChildren(ramp, lines);
    ramp.userData.open = Math.asin(Math.min(1, (hy - 0.1 * k) / len));
    ramp.userData.shut = -Math.PI / 2;
    ramp.rotation.z = ramp.userData.shut;
    root.add(ramp);
    rig.ramp = ramp;
  }
  for (const sd of sides) {
    // The tall red strips either side of the bay, upper and lower, and the nozzles outboard of them.
    for (const [y0, y1] of [[0.35, 0.47], [0.5, 0.62]]) add(box(0.3 * k, Y(y1 - y0), 0.8 * k, xs - 0.1 * k, Y((y0 + y1) / 2), sd * Z(0.36)), redM, false);
    for (const [y0, y1] of [[0.37, 0.47], [0.5, 0.58]]) add(box(0.3 * k, Y(y1 - y0), 0.55 * k, xs - 0.1 * k, Y((y0 + y1) / 2), sd * Z(0.86)), redDim, false);
    for (const y of [Y(0.41), Y(0.53)]) {
      const z = sd * Z(0.62);
      add(new THREE.CylinderGeometry(1.15 * k, 1.3 * k, 1.6 * k, 14).rotateZ(Math.PI / 2).translate(xs - 0.8 * k, y, z), darkM);
      add(new THREE.TorusGeometry(1.1 * k, 0.15 * k, 6, 16).rotateY(Math.PI / 2).translate(xs - 1.62 * k, y, z), trimM);
      add(new THREE.CylinderGeometry(0.85 * k, 0.85 * k, 0.1 * k, 14).rotateZ(Math.PI / 2).translate(xs - 1.42 * k, y, z), rearM, false);
      const f = new THREE.Group();
      f.position.set(xs - 1.7 * k, y, z);
      f.rotation.z = Math.PI / 2;
      f.add(mesh(new THREE.ConeGeometry(0.85 * k, 4.6 * k, 10).translate(0, 2.3 * k, 0), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), false));
      f.add(mesh(new THREE.ConeGeometry(0.45 * k, 3 * k, 8).translate(0, 1.5 * k, 0), new THREE.MeshBasicMaterial({ color: '#fff0b0', toneMapped: false }), false));
      root.add(f);
      rig.flames.push(f);
    }
    // The stern fin over each outer hull, reaching back past the stern.
    add(hull([
      [X(0.9), Y(0.86), sd * Z(0.5)], [X(0.9), Y(0.86), sd * Z(0.56)], [X(1.03), Y(0.8), sd * Z(0.52)], [X(1.03), Y(0.84), sd * Z(0.54)], [X(0.93), Y(0.98), sd * Z(0.53)],
    ]), darkM);
    lamp(redM, 0.4 * k, X(1.03) - 0.2 * k, Y(0.82), sd * Z(0.53));
    lamp(redM, 0.4 * k, xs - 0.2 * k, Y(0.66), sd * Z(0.9));
  }

  // ================================================================================== class and refit extras
  if (klass === 'dredge') {
    add(hull([
      [X(0) + 1 * k, 0.4 * k, -hw * 0.98], [X(0) + 1 * k, 0.4 * k, hw * 0.98], [X(0) + 4 * k, 0.4 * k, -hw * 0.94], [X(0) + 4 * k, 0.4 * k, hw * 0.94],
      [X(0) + 1.4 * k, Y(0.3), -hw * 0.98], [X(0) + 1.4 * k, Y(0.3), hw * 0.98], [X(0) + 2.6 * k, Y(0.32), -hw * 0.94], [X(0) + 2.6 * k, Y(0.32), hw * 0.94],
    ]), trimM);
  } else if (klass === 'ark') {
    const domeM = new THREE.MeshStandardMaterial({ color: '#7ad8a8', emissive: '#1d6a46', transparent: true, opacity: 0.8, metalness: 0.2, roughness: 0.15 });
    for (const sd of sides) add(new THREE.SphereGeometry(3 * k, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(X(0.86), Y(0.86), sd * Z(0.53)), domeM);
  } else if (klass === 'nightrunner') {
    for (const sd of sides) for (const f of [0.33, 0.52, 0.66]) add(hull([[X(f), Y(0.9), sd * Z(0.7)], [X(f + 0.06), Y(0.88), sd * Z(0.7)], [X(f + 0.055), Y(1.08), sd * Z(0.72)], [X(f), Y(0.9), sd * Z(0.74)], [X(f + 0.06), Y(0.88), sd * Z(0.74)]]), darkM);
  }
  if (cc >= 6) {
    // Spikes along the prows' blades.
    for (const sd of sides) for (let i = 0; i < 3; i++) {
      const f = 0.03 + i * 0.05, y = Y(0.2) + (Y(OTOP) - Y(0.2)) * (f / 0.24) * 0.9;
      add(hull([[X(f), y, sd * Z(0.44) - 0.8 * k], [X(f), y, sd * Z(0.44) + 0.8 * k], [X(f) - 2 * k, y, sd * Z(0.44)], [X(f) + 2.5 * k, y + 1.8 * k, sd * Z(0.44)]]), trimM);
    }
  }

  // ================================================================================== the roof plan and the guns
  /** How high the roof stands at a local point: what a turret, a prop or a climbing creature stands on. */
  const inBlock = (x: number, f0: number, f1: number): boolean => x <= X(f0) && x >= X(f1);
  function roofHeight(x: number, z: number): number {
    const az = Math.abs(z), w = az / hw;
    const f = (L / 2 - x) / L;
    if (inBlock(x, T0, T1) && w < 0.16) return Y(1.26);
    if (inBlock(x, GD[0], GD[1]) && w < GD[2]) return Y(1.1);
    for (const [f0, f1, ww, top] of SPIN) if (inBlock(x, f0, f1) && w < ww) return Y(top);
    if (w < CW) return f < 0.22 ? Math.max(Y(0.1), Y(0.44) + (Y(CTOP) - Y(0.44)) * Math.max(0, (f - 0.035) / 0.19)) : Y(CTOP);
    if (w >= OB0 && w <= OB1) for (const [f0, f1, top] of OUTB) if (inBlock(x, f0, f1)) return Y(top);
    if (f < 0.105 && w > 0.74) return Y(0.44);
    if (f < 0.245 && w > 0.74) return Y(0.44) + (Y(OTOP) - Y(0.44)) * ((f - 0.1) / 0.145);
    if (w < OW1) return f < 0.24 ? Math.max(Y(0.2), outerTop(f) - (w > 0.6 ? Y(0.05) : 0)) : outerTop(f);
    return trackTop + Y(0.03);
  }
  placeProps(o, rig, k, roofHeight, { hullM, darkM, trimM, plateM, glowM, glowDim, hatchM });
  for (const m of o.mounts) rig.turrets.set(m.id, turret(root, m, roofHeight(m.x, m.z), k, { trimM, darkM, plateM, hullM, glowM, redM }, lines));
  rig.roofAt = roofHeight;
  return rig;
}
