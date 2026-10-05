import * as THREE from 'three';

/**
 * The Crater's creatures and machines as jointed 3D models, each with a walk (or crawl, slither, flap, roll) cycle and
 * an attack. A model is built in units of the creature's footprint radius (1 = how wide it stands), facing +X, Y up,
 * and posed by `pose(phase, attack)`: phase runs 0-1 round its gait, attack 0-1 through its blow.
 *
 * - Bipeds: the dead shuffling with their arms out, raiders and cyborgs with rifles, bare-boned skeletons, robed
 *   necromancers, hulking brutes and stone guardians, knuckle-walkers.
 * - Quadrupeds: rats, dogs and wolves, boars with tusks, spined stalkers, chrome hounds, goats, lizards, and the
 *   behemoths under their shells of plate.
 * - Bugs: beetles, spiders, scorpions with their tails up, leapers on great hind legs, spitters with a glowing sac,
 *   the brood queen with her egg sac.
 * - Serpents: worms with ring mouths, finned wyrms, leviathans, fish.
 * - Flyers: bats and dragons on beating wings, drones and gunships on spinning rotors; wraiths floating in tattered
 *   cloaks; the overmind's brain on its tentacles.
 * - Machines: buggies, bikes, trucks, war rigs and barges on turning wheels, tanks, tracked sentry bots, reverse-
 *   jointed walker mechs.
 * - Elementals: a burning core in a ring of orbiting shards, two shard fists; the Spire's crystal eye; the Devourer.
 */

export type Rig = 'biped' | 'quad' | 'bug' | 'serpent' | 'bat' | 'rotor' | 'dragon' | 'wraith' | 'vehicle' | 'mech' | 'treadbot' | 'elemental' | 'brain' | 'maw' | 'crystal';

export interface Spec {
  rig: Rig;
  body: string;
  dark: string;
  accent: string;
  glow: string;
  skin: string;
  build: 'thin' | 'normal' | 'hulk' | 'knuckle';
  head: 'human' | 'skull' | 'helmet' | 'hood' | 'visor' | 'horned' | 'mohawk' | 'crown' | 'gasmask' | 'stone';
  weapon: 'rifle' | 'blade' | 'staff' | 'axe' | 'cannon' | 'hammer' | 'claws' | 'none' | 'plasma' | 'rocket' | 'bow' | 'flamer';
  zombie: boolean;
  bones: boolean;
  robe: boolean;
  armor: 'none' | 'light' | 'heavy' | 'chrome' | 'stone' | 'fur';
  spikes: boolean;
  heads: number;
  shield: boolean;
  quad: 'dog' | 'boar' | 'beast' | 'rat' | 'goat' | 'behemoth' | 'hound' | 'lizard';
  bug: 'beetle' | 'spider' | 'scorpion' | 'leaper' | 'spitter' | 'queen' | 'crawler';
  serpent: 'worm' | 'wyrm' | 'fish' | 'eel';
  veh: 'buggy' | 'bike' | 'truck' | 'rig' | 'barge' | 'tank';
  rotor: 'drone' | 'gunship' | 'reaver';
  /** Elemental flavour: fire, frost, storm, water, sand. */
  elem: string;
  /** How many walk frames its cycle reads best in, and whether it floats (no ground contact). */
  float: boolean;
}

export interface Built {
  root: THREE.Group;
  pose: (phase: number, atk: number) => void;
}

const matCache = new Map<string, THREE.Material>();
function std(color: string, opts: { metal?: number; rough?: number; emissive?: string; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `s|${color}|${opts.metal ?? 0.1}|${opts.rough ?? 0.8}|${opts.emissive ?? ''}|${opts.flat ?? true}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: opts.metal ?? 0.1, roughness: opts.rough ?? 0.8, flatShading: opts.flat ?? true, emissive: opts.emissive ?? '#000000' });
    matCache.set(key, m);
  }
  return m;
}
function glowM(color: string): THREE.MeshBasicMaterial {
  const key = `g|${color}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    matCache.set(key, m);
  }
  return m;
}
function ghostM(color: string, op: number): THREE.MeshBasicMaterial {
  const key = `t|${color}|${op}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, toneMapped: false, depthWrite: false });
    matCache.set(key, m);
  }
  return m;
}

function M(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.frustumCulled = false;
  return o;
}

/** A limb segment hanging down from its joint (length `len`, radius `r`). */
function limb(len: number, r: number, m: THREE.Material, r2 = r): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r2, len, 7).translate(0, -len / 2, 0);
  const me = M(g, m);
  const cap = M(new THREE.SphereGeometry(r * 1.05, 7, 5), m);
  me.add(cap);
  return me;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ bipeds

function biped(s: Spec): Built {
  const root = new THREE.Group();
  const hulk = s.build === 'hulk' || s.build === 'knuckle';
  const thin = s.build === 'thin' || s.bones;
  const lt = hulk ? 0.75 : 0.85, ls = hulk ? 0.72 : 0.85, hipY = lt + ls + 0.12;
  const th = hulk ? 1.5 : 1.15, cw = hulk ? 1.9 : thin ? 0.75 : 0.95, cd = hulk ? 1.1 : 0.55;
  const limbR = hulk ? 0.26 : thin ? 0.08 : 0.13;
  const body = s.bones ? std('#d8d0b8', { rough: 0.6 }) : s.armor === 'stone' ? std(s.body, { rough: 0.95 }) : s.armor === 'chrome' ? std(s.body, { metal: 0.8, rough: 0.3 }) : std(s.body);
  const dark = std(s.dark);
  const skin = s.bones ? body : std(s.skin);
  const acc = std(s.accent, { metal: 0.5, rough: 0.5 });
  const eye = glowM(s.glow);

  const pelvis = at(new THREE.Group(), 0, hipY, 0);
  root.add(pelvis);
  pelvis.add(M(new THREE.BoxGeometry(cd * 0.9, 0.32, cw * 0.8), dark));
  // Legs.
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const sd of [-1, 1]) {
    const hip = at(new THREE.Group(), 0, -0.05, sd * cw * 0.26);
    const thigh = limb(lt, limbR * 1.2, s.robe ? dark : s.bones ? body : dark, limbR);
    hip.add(thigh);
    const knee = at(new THREE.Group(), 0, -lt, 0);
    knee.add(limb(ls, limbR, s.bones ? body : dark, limbR * 0.8));
    knee.add(at(M(new THREE.BoxGeometry(0.42 * (hulk ? 1.6 : 1), 0.16, 0.26 * (hulk ? 1.6 : 1)), std(s.zombie ? s.skin : '#2a2622')), 0.1, -ls - 0.04, 0));
    hip.add(knee);
    pelvis.add(hip);
    legs.push({ hip, knee });
  }
  // A robe hides the legs: a long cone of cloth.
  if (s.robe) pelvis.add(at(M(new THREE.ConeGeometry(cw * 0.75, hipY + 0.2, 9, 1, true), std(s.body, { rough: 1 })), 0, -hipY / 2 + 0.25, 0));
  // Torso, leaning.
  const torso = new THREE.Group();
  pelvis.add(torso);
  if (s.bones) {
    torso.add(at(M(new THREE.CylinderGeometry(0.07, 0.07, th, 5), body), 0, th / 2, 0));
    for (let k = 0; k < 4; k++) torso.add(at(M(new THREE.TorusGeometry(0.3 - k * 0.03, 0.035, 4, 10, Math.PI * 1.4).rotateY(Math.PI / 2).rotateX(Math.PI / 2), body), 0.05, th * 0.45 + k * 0.17, 0));
  } else {
    torso.add(at(M(new THREE.BoxGeometry(cd, th, cw), body), 0, th / 2, 0));
    if (s.armor === 'heavy' || s.armor === 'chrome' || s.armor === 'stone') torso.add(at(M(new THREE.BoxGeometry(cd * 1.15, th * 0.45, cw * 1.08), s.armor === 'chrome' ? std(s.accent, { metal: 0.8, rough: 0.3 }) : acc), 0.02, th * 0.72, 0));
    if (s.armor === 'fur') torso.add(at(M(new THREE.SphereGeometry(cw * 0.55, 7, 5), std(s.dark, { rough: 1 })), -0.1, th * 0.85, 0));
    if (s.zombie) torso.add(at(M(new THREE.BoxGeometry(cd * 0.5, th * 0.3, cw * 0.4), std('#6a1a14')), cd * 0.3, th * 0.45, cw * 0.15));
  }
  if (s.spikes) for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) torso.add(at(M(new THREE.ConeGeometry(0.1 * (hulk ? 1.8 : 1), 0.45 * (hulk ? 1.6 : 1), 5).rotateX(sd * -0.9), std('#e8dcc0')), -0.1 + k * 0.15, th * 0.95, sd * cw * 0.5));
  if (s.robe) torso.add(at(M(new THREE.CylinderGeometry(cw * 0.45, cw * 0.6, th, 8), std(s.body, { rough: 1 })), 0, th / 2, 0));
  // Head(s).
  const heads: THREE.Group[] = [];
  for (let hk = 0; hk < Math.max(1, s.heads); hk++) {
    const hz = s.heads > 1 ? (hk - (s.heads - 1) / 2) * cw * 0.45 : 0;
    const head = at(new THREE.Group(), hulk ? cd * 0.2 : 0.02, th + (hulk ? 0.05 : 0.32), hz);
    const hr = hulk ? 0.34 : 0.3;
    if (s.head === 'skull' || s.bones) {
      head.add(M(new THREE.SphereGeometry(hr, 8, 6), std('#e4dcc8', { rough: 0.6 })));
      for (const sd of [-1, 1]) head.add(at(M(new THREE.SphereGeometry(hr * 0.24, 5, 4), glowM(s.glow)), hr * 0.75, 0.04, sd * hr * 0.35));
      head.add(at(M(new THREE.BoxGeometry(hr * 0.7, hr * 0.4, hr * 1.1), std('#c8c0a8')), hr * 0.45, -hr * 0.55, 0));
    } else if (s.head === 'hood') {
      head.add(M(new THREE.ConeGeometry(hr * 1.4, hr * 3, 8), std(s.dark, { rough: 1 })));
      head.add(at(M(new THREE.SphereGeometry(hr * 0.75, 7, 5), std('#08060a')), hr * 0.45, -0.1, 0));
      for (const sd of [-1, 1]) head.add(at(M(new THREE.SphereGeometry(hr * 0.16, 5, 4), eye), hr * 1.05, -0.05, sd * hr * 0.32));
    } else if (s.head === 'stone') {
      head.add(M(new THREE.BoxGeometry(hr * 1.6, hr * 1.4, hr * 1.6), body));
      head.add(at(M(new THREE.BoxGeometry(0.06, hr * 0.3, hr * 1.1), eye), hr * 0.82, 0.05, 0));
    } else {
      head.add(M(new THREE.SphereGeometry(hr, 9, 7), skin));
      for (const sd of [-1, 1]) head.add(at(M(new THREE.SphereGeometry(hr * 0.13, 5, 4), s.zombie || s.armor === 'chrome' || hulk ? eye : std('#141414')), hr * 0.86, 0.05, sd * hr * 0.36));
      if (s.head === 'helmet') head.add(at(M(new THREE.SphereGeometry(hr * 1.12, 9, 6, 0, TAU, 0, Math.PI * 0.55), acc), 0, 0.03, 0));
      if (s.head === 'visor') {
        head.add(at(M(new THREE.SphereGeometry(hr * 1.1, 9, 6), std(s.accent, { metal: 0.8, rough: 0.3 })), 0, 0.02, 0));
        head.add(at(M(new THREE.BoxGeometry(0.08, hr * 0.32, hr * 1.4), eye), hr * 0.98, 0.06, 0));
      }
      if (s.head === 'gasmask') {
        head.add(at(M(new THREE.CylinderGeometry(hr * 0.35, hr * 0.42, hr * 0.6, 7).rotateZ(Math.PI / 2), dark), hr * 0.9, -hr * 0.25, 0));
        for (const sd of [-1, 1]) head.add(at(M(new THREE.SphereGeometry(hr * 0.22, 6, 4), glowM('#ffcc60')), hr * 0.8, hr * 0.15, sd * hr * 0.38));
      }
      if (s.head === 'mohawk') for (let k = 0; k < 5; k++) head.add(at(M(new THREE.ConeGeometry(0.07, 0.3, 4), std('#d02020')), -hr * 0.6 + k * hr * 0.3, hr * 0.95, 0));
      if (s.head === 'horned') for (const sd of [-1, 1]) head.add(at(M(new THREE.ConeGeometry(hr * 0.22, hr * 1.6, 6).rotateX(sd * -0.6).rotateZ(-0.5), std('#e8dcc0')), 0, hr * 0.7, sd * hr * 0.7));
      if (s.head === 'crown') for (let k = 0; k < 5; k++) head.add(at(M(new THREE.ConeGeometry(0.06, 0.3, 4), std('#e0b030', { metal: 0.9, rough: 0.3 })), Math.cos((k / 5) * TAU) * hr * 0.8, hr * 0.85, Math.sin((k / 5) * TAU) * hr * 0.8));
    }
    torso.add(head);
    heads.push(head);
  }
  // Arms.
  const armLen = hulk ? (s.build === 'knuckle' ? 1.35 : 1.15) : 0.72;
  const arms: { sh: THREE.Group; el: THREE.Group }[] = [];
  for (const sd of [-1, 1]) {
    const sh = at(new THREE.Group(), 0, th * 0.9, sd * (cw / 2 + limbR * 0.6));
    sh.add(limb(armLen, limbR * (hulk ? 1.3 : 1), s.bones ? body : s.robe ? std(s.body) : body, limbR));
    const el = at(new THREE.Group(), 0, -armLen, 0);
    el.add(limb(armLen * (hulk ? 1 : 0.95), limbR * (hulk ? 1.15 : 0.9), skin, limbR * 0.8));
    // A fist (huge for the hulks).
    el.add(at(M(new THREE.SphereGeometry(limbR * (hulk ? 1.9 : 1.2), 7, 5), hulk ? dark : skin), 0, -armLen * (hulk ? 1 : 0.95), 0));
    if (s.weapon === 'claws' || (s.zombie && hulk)) for (let k = -1; k <= 1; k++) el.add(at(M(new THREE.ConeGeometry(0.05 * (hulk ? 2 : 1), 0.35 * (hulk ? 2 : 1), 4).rotateZ(-Math.PI / 2 - 0.4), std('#e8e0c8')), 0.12, -armLen - 0.1, k * 0.08 * (hulk ? 2 : 1)));
    sh.add(el);
    torso.add(sh);
    arms.push({ sh, el });
  }
  if (s.shield) {
    const sh = at(M(new THREE.BoxGeometry(0.2, 1.8, 1.3), std(s.accent, { metal: 0.6, rough: 0.5 })), 0.35, -armLen * 1.4, 0);
    sh.add(at(M(new THREE.BoxGeometry(0.06, 1, 0.1), eye), 0.12, 0, 0));
    arms[0].el.add(sh);
  }
  // The weapon in the right hand.
  const wHand = arms[1].el;
  let flash: THREE.Object3D | null = null;
  const tip = -armLen * (hulk ? 1 : 0.95);
  const wm = std('#2a2c30', { metal: 0.6, rough: 0.4 });
  if (s.weapon === 'rifle' || s.weapon === 'plasma' || s.weapon === 'rocket' || s.weapon === 'flamer') {
    const gun = at(new THREE.Group(), 0.05, tip, 0);
    const len = s.weapon === 'rocket' ? 1.3 : 1.15;
    gun.add(at(M(new THREE.BoxGeometry(len, s.weapon === 'rocket' ? 0.24 : 0.14, s.weapon === 'rocket' ? 0.24 : 0.12), wm), len / 2 - 0.15, 0, 0));
    if (s.weapon === 'plasma') gun.add(at(M(new THREE.BoxGeometry(0.4, 0.1, 0.14), glowM(s.glow)), 0.45, 0.06, 0));
    flash = at(M(new THREE.SphereGeometry(0.22, 6, 4), glowM(s.weapon === 'plasma' ? s.glow : s.weapon === 'flamer' ? '#ff8a20' : '#fff0a0')), len, 0, 0);
    gun.add(flash);
    gun.rotation.z = Math.PI / 2;
    wHand.add(gun);
  } else if (s.weapon === 'blade' || s.weapon === 'axe' || s.weapon === 'hammer') {
    const w = at(new THREE.Group(), 0, tip, 0);
    w.add(at(M(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), std('#4a3a2a')), 0, -0.5, 0));
    if (s.weapon === 'blade') w.add(at(M(new THREE.BoxGeometry(0.06, 1.1, 0.16), std('#b8bcc4', { metal: 0.8, rough: 0.3 })), 0, -1.3, 0));
    if (s.weapon === 'axe') w.add(at(M(new THREE.BoxGeometry(0.08, 0.6, 0.55), std('#9aa0aa', { metal: 0.8, rough: 0.35 })), 0, -1.1, 0.22));
    if (s.weapon === 'hammer') w.add(at(M(new THREE.BoxGeometry(0.5, 0.45, 0.8), std('#5a5e66', { metal: 0.6, rough: 0.5 })), 0, -1.15, 0));
    w.scale.setScalar(hulk ? 1.8 : 1);
    wHand.add(w);
  } else if (s.weapon === 'staff') {
    const w = at(new THREE.Group(), 0, tip, 0);
    w.add(at(M(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 5), std('#3a2a1a')), 0, -0.2, 0));
    w.add(at(M(new THREE.SphereGeometry(0.2, 7, 5), glowM(s.glow)), 0, 1, 0));
    wHand.add(w);
  } else if (s.weapon === 'cannon') {
    const w = at(new THREE.Group(), 0.1, tip, 0);
    w.add(at(M(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 8).rotateZ(Math.PI / 2), wm), 0.7, 0, 0));
    flash = at(M(new THREE.SphereGeometry(0.35, 6, 4), glowM('#fff0a0')), 1.55, 0, 0);
    w.add(flash);
    w.rotation.z = Math.PI / 2;
    wHand.add(w);
  } else if (s.weapon === 'bow') {
    const w = at(new THREE.Group(), 0, tip, 0);
    w.add(M(new THREE.TorusGeometry(0.55, 0.03, 4, 12, Math.PI).rotateY(Math.PI / 2), std('#4a3a2a')));
    wHand.add(w);
  }
  const ranged = s.weapon === 'rifle' || s.weapon === 'plasma' || s.weapon === 'rocket' || s.weapon === 'flamer' || s.weapon === 'bow' || s.weapon === 'cannon';
  const lean = s.build === 'knuckle' ? 0.7 : hulk ? 0.2 : s.zombie ? 0.28 : 0.05;
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      const amp = s.zombie ? 0.38 : hulk ? 0.45 : 0.55;
      const sw = Math.sin(w);
      legs[0].hip.rotation.z = sw * amp;
      legs[1].hip.rotation.z = -sw * amp;
      legs[0].knee.rotation.z = -Math.max(0, Math.cos(w)) * 0.85;
      legs[1].knee.rotation.z = -Math.max(0, -Math.cos(w)) * 0.85;
      pelvis.position.y = hipY + Math.abs(Math.sin(w)) * 0.06 - (hulk ? 0.05 : 0);
      torso.rotation.z = -lean - (atk > 0 && !ranged ? Math.sin(atk * Math.PI) * 0.3 : 0);
      torso.rotation.x = s.zombie ? Math.sin(w) * 0.08 : 0;
      for (const hd of heads) hd.rotation.z = s.zombie ? 0.25 : s.build === 'knuckle' ? lean * 0.8 : 0;
      // Arms: swinging, out in front (the dead), down to the ground (knuckle-walkers), or holding the gun up.
      for (let k = 0; k < 2; k++) {
        const a = arms[k], sd = k === 0 ? 1 : -1;
        if (s.zombie && !hulk) {
          a.sh.rotation.z = 1.35 + Math.sin(w + k) * 0.12;
          a.el.rotation.z = 0.15;
        } else if (s.build === 'knuckle') {
          a.sh.rotation.z = 0.5 + Math.sin(w + (k ? Math.PI : 0)) * 0.45;
          a.el.rotation.z = 0.2;
        } else if (ranged) {
          a.sh.rotation.z = 1.25 - (k === 1 ? atk * 0.25 : 0);
          a.sh.rotation.x = k === 0 ? -0.6 : 0.1;
          a.el.rotation.z = k === 0 ? 0.9 : 0.25;
        } else {
          a.sh.rotation.z = -sd * sw * 0.5;
          a.el.rotation.z = 0.3;
        }
      }
      // The blow: the weapon arm raised and brought down (or the gun's flash).
      if (atk > 0 && !ranged) {
        // Raised high, then brought down hard.
        const up = atk < 0.45 ? atk / 0.45 : 1 - (atk - 0.45) / 0.55;
        arms[1].sh.rotation.z = 0.5 + up * 2.3;
        arms[1].el.rotation.z = 0.2 + up * 0.5;
        if (hulk) arms[0].sh.rotation.z = 0.5 + up * 2;
      }
      if (flash) flash.visible = atk > 0.3 && atk < 0.9;
    },
  };
}

// ------------------------------------------------------------------------------------------------ quadrupeds

function quad(s: Spec): Built {
  const root = new THREE.Group();
  const v = s.quad;
  const big = v === 'behemoth', bulky = v === 'boar' || big, low = v === 'lizard' || v === 'rat';
  const bl = v === 'rat' ? 1.5 : big ? 2.2 : v === 'boar' ? 1.6 : 1.7, br = bulky ? 0.62 : v === 'rat' ? 0.35 : 0.42;
  const legH = low ? 0.45 : big ? 1.05 : bulky ? 0.7 : 0.85;
  const metal = v === 'hound';
  const bodyM = metal ? std(s.body, { metal: 0.8, rough: 0.3 }) : std(s.body, { rough: v === 'boar' || v === 'beast' ? 1 : 0.8 });
  const dark = std(s.dark);
  const eye = glowM(s.glow);
  const horn = std('#e4d8bc', { rough: 0.6 });
  const body = at(new THREE.Group(), 0, legH + br * 0.6, 0);
  root.add(body);
  body.add(M(new THREE.CapsuleGeometry(br, bl - br * 2, 4, 9).rotateZ(Math.PI / 2), bodyM));
  // Shell plates (behemoth), spines (beast, lizard), bristles (boar), chrome ribs (hound).
  if (big) for (let k = 0; k < 4; k++) body.add(at(M(new THREE.SphereGeometry(br * 0.9, 8, 5, 0, TAU, 0, Math.PI * 0.45), std(s.accent, { metal: 0.3, rough: 0.6 })), -bl * 0.42 + k * bl * 0.28, br * 0.35, 0));
  if (v === 'beast' || v === 'lizard' || big) for (let k = 0; k < 6; k++) body.add(at(M(new THREE.ConeGeometry(0.07 * (big ? 2 : 1), 0.38 * (big ? 1.6 : 1), 4).rotateZ(0.5), horn), -bl * 0.45 + k * bl * 0.17, br * (big ? 1.25 : 0.95), 0));
  if (v === 'boar') for (let k = 0; k < 8; k++) body.add(at(M(new THREE.ConeGeometry(0.06, 0.25, 3).rotateZ(0.7), dark), -bl * 0.4 + k * bl * 0.1, br * 0.95, 0));
  if (metal) for (let k = 0; k < 4; k++) body.add(at(M(new THREE.TorusGeometry(br * 1.02, 0.03, 4, 12).rotateY(Math.PI / 2), glowM(s.glow)), -bl * 0.3 + k * bl * 0.2, 0, 0));
  // Neck and head; the jaw opens on the bite.
  const neck = at(new THREE.Group(), bl * 0.48, br * (low ? 0 : 0.35), 0);
  body.add(neck);
  const hs = big ? 0.7 : bulky ? 0.5 : v === 'rat' ? 0.28 : 0.36;
  const head = at(new THREE.Group(), hs * 0.9, 0, 0);
  neck.add(head);
  head.add(M(new THREE.BoxGeometry(hs * 1.4, hs * 1.1, hs * 1.15), bodyM));
  head.add(at(M(new THREE.BoxGeometry(hs * (v === 'boar' ? 0.9 : 1.1), hs * 0.5, hs * 0.75), bodyM), hs * 1.1, -hs * 0.12, 0));
  const jaw = at(new THREE.Group(), hs * 0.3, -hs * 0.35, 0);
  jaw.add(at(M(new THREE.BoxGeometry(hs * 1.3, hs * 0.22, hs * 0.65), dark), hs * 0.6, 0, 0));
  for (let k = 0; k < 3; k++) jaw.add(at(M(new THREE.ConeGeometry(0.03 * hs * 4, 0.1 * hs * 4, 3), std('#f0ead8')), hs * (0.8 + k * 0.18), 0.12 * hs, (k - 1) * hs * 0.18));
  head.add(jaw);
  for (const sd of [-1, 1]) {
    head.add(at(M(new THREE.SphereGeometry(hs * 0.13, 5, 4), eye), hs * 0.6, hs * 0.25, sd * hs * 0.45));
    if (v === 'dog' || v === 'hound' || v === 'rat') head.add(at(M(new THREE.ConeGeometry(hs * 0.2, hs * 0.55, 4), metal ? bodyM : dark), -hs * 0.2, hs * 0.75, sd * hs * 0.35));
    if (v === 'boar') head.add(at(M(new THREE.ConeGeometry(hs * 0.09, hs * 0.75, 5).rotateZ(-1.1).rotateX(sd * 0.3), horn), hs * 1.3, -hs * 0.1, sd * hs * 0.38));
    if (v === 'goat' || big || v === 'beast') head.add(at(M(new THREE.ConeGeometry(hs * 0.16, hs * (big ? 1.6 : 1.2), 6).rotateZ(big ? -1.2 : 0.9).rotateX(sd * -0.5), horn), hs * (big ? 0.5 : -0.2), hs * 0.6, sd * hs * 0.45));
  }
  // Tail.
  const tail = at(new THREE.Group(), -bl * 0.5, br * 0.2, 0);
  const tl = v === 'rat' ? 1.3 : v === 'lizard' ? 1.4 : big ? 1 : bulky ? 0.25 : 0.8;
  tail.add(at(M(new THREE.CylinderGeometry(0.02 + br * 0.15, br * (v === 'lizard' ? 0.5 : 0.22), tl, 6).rotateZ(Math.PI / 2 + 0.4), v === 'rat' ? std('#c89a90') : bodyM), -tl * 0.45, -tl * 0.15, 0));
  if (big) tail.add(at(M(new THREE.SphereGeometry(0.3, 6, 4), horn), -tl * 0.9, -tl * 0.35, 0));
  body.add(tail);
  // Legs: hip, knee, paw.
  const legs: { hip: THREE.Group; knee: THREE.Group; ph: number }[] = [];
  const lr = big ? 0.24 : bulky ? 0.16 : v === 'rat' ? 0.06 : 0.1;
  for (const [fx, sd, ph] of [[0.36, -1, 0], [0.36, 1, 0.5], [-0.36, -1, 0.5], [-0.36, 1, 0]] as const) {
    const hip = at(new THREE.Group(), fx * bl, -br * 0.35, sd * br * (low ? 1.05 : 0.7));
    if (low) hip.rotation.x = sd * -0.6;
    const ul = legH * 0.55 + br * 0.3, sl = legH * 0.55;
    hip.add(limb(ul, lr * 1.25, metal ? std(s.accent, { metal: 0.7, rough: 0.4 }) : bodyM, lr));
    const knee = at(new THREE.Group(), 0, -ul, 0);
    knee.add(limb(sl, lr, metal ? bodyM : dark, lr * 0.75));
    knee.add(at(M(new THREE.BoxGeometry(lr * 3, lr * 1.2, lr * 2.6), dark), lr, -sl, 0));
    hip.add(knee);
    body.add(hip);
    legs.push({ hip, knee, ph });
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      for (const l of legs) {
        const s2 = Math.sin(w + l.ph * TAU);
        l.hip.rotation.z = s2 * (big ? 0.35 : 0.55);
        l.knee.rotation.z = (l.hip.position.x < 0 ? -1 : 1) * Math.max(0, Math.cos(w + l.ph * TAU)) * 0.7;
      }
      body.position.y = legH + br * 0.6 + Math.abs(Math.sin(w * 2)) * 0.05;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      body.position.x = k * 0.35;
      neck.rotation.z = -k * 0.35;
      jaw.rotation.z = -k * 0.7 - 0.05;
      tail.rotation.y = Math.sin(w) * 0.4;
    },
  };
}

// ------------------------------------------------------------------------------------------------ bugs

function bug(s: Spec): Built {
  const root = new THREE.Group();
  const v = s.bug;
  const shell = std(s.body, { metal: 0.2, rough: 0.45 });
  const dark = std(s.dark, { metal: 0.2, rough: 0.5 });
  const eye = glowM(s.glow);
  const n = v === 'spider' ? 8 : 6;
  const queen = v === 'queen';
  const bodyY = v === 'spider' ? 0.75 : queen ? 1 : 0.55;
  const body = at(new THREE.Group(), 0, bodyY, 0);
  root.add(body);
  const thR = queen ? 0.65 : 0.42;
  body.add(M(new THREE.SphereGeometry(thR, 9, 6).scale(1.2, 0.8, 1), shell));
  // The abdomen: a fat sac (glowing for spitters, eggs for the queen), a segmented tail (scorpions).
  const abd = at(new THREE.Group(), -thR * 1.5, 0.05, 0);
  body.add(abd);
  if (v === 'spitter') {
    abd.add(M(new THREE.SphereGeometry(0.62, 9, 7).scale(1.2, 0.95, 1), ghostM(s.glow, 0.85)));
    abd.add(M(new THREE.SphereGeometry(0.4, 7, 5), glowM(s.glow)));
  } else if (queen) {
    abd.position.x = -thR * 2.4;
    abd.add(M(new THREE.SphereGeometry(1.3, 10, 7).scale(1.4, 0.8, 1), std('#d8c8a0', { rough: 0.6 })));
    for (let k = 0; k < 8; k++) abd.add(at(M(new THREE.SphereGeometry(0.22, 6, 4), std('#f0e4c0')), -0.8 + (k % 4) * 0.5, 0.75, (Math.floor(k / 4) - 0.5) * 0.6));
    for (const sd of [-1, 1]) body.add(at(M(new THREE.SphereGeometry(1, 8, 4).scale(1.4, 0.05, 0.5), ghostM('#c0d8e0', 0.5)), -1.4, 0.6, sd * 0.6));
  } else if (v !== 'scorpion') {
    abd.add(M(new THREE.SphereGeometry(v === 'spider' ? 0.65 : 0.5, 9, 6).scale(1.3, 0.85, 1), v === 'crawler' ? dark : shell));
  }
  const tail: THREE.Group[] = [];
  if (v === 'scorpion') {
    let parent: THREE.Object3D = abd;
    for (let k = 0; k < 5; k++) {
      const seg = at(new THREE.Group(), k === 0 ? 0 : -0.3, 0, 0);
      seg.add(M(new THREE.SphereGeometry(0.2 - k * 0.015, 6, 4), shell));
      parent.add(seg);
      parent = seg;
      tail.push(seg);
    }
    (parent as THREE.Group).add(at(M(new THREE.ConeGeometry(0.1, 0.4, 5).rotateZ(Math.PI / 2 + 0.6), std('#2a1a10')), -0.15, -0.15, 0));
  }
  // Head, mandibles, eyes.
  const head = at(new THREE.Group(), thR * 1.25, 0, 0);
  body.add(head);
  head.add(M(new THREE.SphereGeometry(thR * 0.6, 7, 5), dark));
  const mand: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const m = at(new THREE.Group(), thR * 0.45, -0.05, sd * thR * 0.25);
    m.add(at(M(new THREE.ConeGeometry(0.05 * (queen ? 2 : 1), 0.35 * (queen ? 2 : 1), 4).rotateZ(-Math.PI / 2).rotateY(sd * 0.5), std('#2a1a14')), 0.15, 0, 0));
    head.add(m);
    mand.push(m);
    for (let k = 0; k < (v === 'spider' ? 3 : 1); k++) head.add(at(M(new THREE.SphereGeometry(0.06 * (queen ? 2 : 1), 5, 4), eye), thR * 0.45, 0.12 + k * 0.06, sd * (0.1 + k * 0.05)));
  }
  // Pincers for scorpions.
  const pincers: THREE.Group[] = [];
  if (v === 'scorpion') {
    for (const sd of [-1, 1]) {
      const pg = at(new THREE.Group(), thR * 0.8, 0, sd * thR * 0.7);
      pg.add(at(M(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 5).rotateZ(Math.PI / 2), shell), 0.35, 0, 0));
      pg.add(at(M(new THREE.BoxGeometry(0.45, 0.16, 0.3), shell), 0.85, 0, 0));
      body.add(pg);
      pincers.push(pg);
    }
  }
  // Legs: each a femur up and out, a tibia down to the ground.
  const legs: { hip: THREE.Group; ph: number }[] = [];
  const ll = (v === 'spider' ? 1.15 : v === 'leaper' ? 0.7 : 0.75) * (queen ? 1.4 : 1);
  for (let i = 0; i < n / 2; i++) {
    for (const sd of [-1, 1]) {
      const fx = (i / (n / 2 - 1) - 0.5) * thR * 1.6;
      const hip = at(new THREE.Group(), fx, 0, sd * thR * 0.7);
      hip.rotation.y = sd * -(fx / thR) * 0.6;
      const fem = new THREE.Group();
      fem.rotation.x = sd * 0.9;
      fem.add(limb(ll, 0.045 * (queen ? 1.6 : 1), dark));
      const tib = at(new THREE.Group(), 0, -ll, 0);
      tib.rotation.x = sd * -1.9;
      const hind = v === 'leaper' && i === 0;
      tib.add(limb(ll * (hind ? 1.8 : 1.15), 0.035 * (queen ? 1.6 : 1), shell));
      if (hind) fem.scale.setScalar(1.6);
      fem.add(tib);
      hip.add(fem);
      body.add(hip);
      legs.push({ hip, ph: (i + (sd > 0 ? 1 : 0)) % 2 ? 0.5 : 0 });
    }
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      for (const l of legs) {
        const s2 = Math.sin(w + l.ph * TAU);
        l.hip.rotation.z = s2 * 0.35;
        l.hip.position.y = Math.max(0, Math.cos(w + l.ph * TAU)) * 0.08;
      }
      body.position.y = bodyY + Math.abs(Math.sin(w * 2)) * 0.03;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      mand[0].rotation.y = 0.2 + k * 0.6;
      mand[1].rotation.y = -0.2 - k * 0.6;
      body.position.x = k * (v === 'leaper' ? 0.6 : 0.2);
      if (v === 'spitter') abd.scale.setScalar(1 + k * 0.15);
      // The scorpion's tail curls up over its back and strikes forward.
      tail.forEach((sg, i) => {
        sg.rotation.z = -(i === 0 ? 0.9 : 0.55) - k * 0.25 * (i / 4);
      });
      pincers.forEach((pg, i) => {
        pg.rotation.y = (i ? -1 : 1) * (0.2 + Math.sin(w) * 0.1 + k * 0.3);
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------ serpents

function serpent(s: Spec): Built {
  const root = new THREE.Group();
  const v = s.serpent;
  const n = v === 'fish' ? 5 : 11;
  const len = v === 'fish' ? 1.8 : 3;
  const r0 = v === 'worm' ? 0.42 : v === 'fish' ? 0.38 : 0.34;
  const skin = std(s.body, { rough: v === 'worm' ? 0.9 : 0.5, metal: v === 'wyrm' ? 0.2 : 0.05 });
  const dark = std(s.dark);
  const segs: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = r0 * (v === 'fish' ? 1 - Math.abs(t - 0.3) * 0.9 : 1 - t * 0.65);
    const sg = new THREE.Group();
    sg.add(M(new THREE.SphereGeometry(r, 8, 6).scale(1.2, 0.95, 1), i % 2 ? skin : dark));
    if (v === 'worm') sg.add(M(new THREE.TorusGeometry(r * 0.95, r * 0.12, 4, 10).rotateY(Math.PI / 2), dark));
    if ((v === 'wyrm' || v === 'fish') && i % 2 === 0 && i > 0) sg.add(at(M(new THREE.ConeGeometry(r * 0.35, r * 1.2, 4).rotateZ(-0.4), std(s.accent)), 0, r * 0.9, 0));
    root.add(sg);
    segs.push(sg);
  }
  // The head: a ring of teeth (worms) or a horned, jawed wedge (wyrms, eels, fish).
  const head = new THREE.Group();
  root.add(head);
  const hr = r0 * 1.15;
  const jaw = new THREE.Group();
  if (v === 'worm') {
    head.add(M(new THREE.CylinderGeometry(hr, hr * 1.1, hr * 0.9, 12).rotateZ(Math.PI / 2), skin));
    head.add(at(M(new THREE.CircleGeometry(hr * 0.8, 12).rotateY(Math.PI / 2), std('#3a0a10')), hr * 0.46, 0, 0));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      head.add(at(M(new THREE.ConeGeometry(0.05, hr * 0.6, 3).rotateZ(-Math.PI / 2 - 0.0), std('#f0e8d0')), hr * 0.5, Math.sin(a) * hr * 0.7, Math.cos(a) * hr * 0.7));
    }
  } else {
    head.add(M(new THREE.BoxGeometry(hr * 2.2, hr * 0.9, hr * 1.3), skin));
    jaw.position.set(hr * 0.2, -hr * 0.35, 0);
    jaw.add(at(M(new THREE.BoxGeometry(hr * 1.9, hr * 0.28, hr * 1.1), dark), hr * 0.9, 0, 0));
    for (let k = 0; k < 4; k++) jaw.add(at(M(new THREE.ConeGeometry(0.04, hr * 0.4, 3), std('#f0e8d0')), hr * (0.6 + k * 0.35), hr * 0.25, (k % 2 ? 1 : -1) * hr * 0.4));
    head.add(jaw);
    for (const sd of [-1, 1]) {
      head.add(at(M(new THREE.SphereGeometry(hr * 0.16, 5, 4), glowM(s.glow)), hr * 0.5, hr * 0.38, sd * hr * 0.5));
      if (v === 'wyrm') head.add(at(M(new THREE.ConeGeometry(hr * 0.18, hr * 1.4, 5).rotateZ(1.2).rotateX(sd * -0.4), std('#e8dcc0')), -hr * 0.6, hr * 0.5, sd * hr * 0.5));
    }
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      const amp = v === 'fish' ? 0.3 : 0.5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = len / 2 - t * len;
        const z = Math.sin(t * 5 - w) * amp * t;
        const r = r0 * (1 - t * 0.6);
        segs[i].position.set(x - k * 0.4 * (1 - t), r * (v === 'worm' ? 0.75 : 0.9) + (i === 0 ? k * 0.4 : 0), z);
      }
      head.position.set(len / 2 + hr * 0.9 + k * 0.5, r0 + k * 0.35, Math.sin(-w) * 0.05);
      head.rotation.z = k * 0.4;
      jaw.rotation.z = -k * 0.7 - 0.1;
    },
  };
}

// ------------------------------------------------------------------------------------------------ flyers

function bat(s: Spec, dragon: boolean): Built {
  const root = new THREE.Group();
  const skin = std(s.body, { rough: 0.85 });
  const dark = std(s.dark);
  const mem = new THREE.MeshStandardMaterial({ color: s.dark, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const body = at(new THREE.Group(), 0, 0.6, 0);
  root.add(body);
  body.add(M(new THREE.SphereGeometry(dragon ? 0.5 : 0.38, 9, 6).scale(dragon ? 2.2 : 1.4, 0.8, 0.9), skin));
  const head = at(new THREE.Group(), dragon ? 1.6 : 0.55, dragon ? 0.25 : 0.05, 0);
  head.add(M(new THREE.BoxGeometry(dragon ? 0.8 : 0.3, dragon ? 0.4 : 0.28, dragon ? 0.4 : 0.3), skin));
  for (const sd of [-1, 1]) {
    head.add(at(M(new THREE.SphereGeometry(0.06, 5, 4), glowM(s.glow)), dragon ? 0.25 : 0.12, 0.1, sd * 0.12));
    head.add(at(M(new THREE.ConeGeometry(0.07, dragon ? 0.5 : 0.3, 4).rotateZ(dragon ? 1.2 : 0.2), dragon ? std('#e8dcc0') : dark), -0.05, dragon ? 0.25 : 0.2, sd * 0.12));
  }
  if (dragon) {
    body.add(at(M(new THREE.CylinderGeometry(0.18, 0.32, 1, 7).rotateZ(-1.1), skin), 1.05, 0.15, 0));
    const tail = at(M(new THREE.ConeGeometry(0.3, 2.4, 6).rotateZ(Math.PI / 2), skin), -2.1, -0.05, 0);
    body.add(tail);
  }
  body.add(head);
  // Wings: a membrane on bony fingers, hinged at the shoulder.
  const wings: THREE.Group[] = [];
  const span = dragon ? 2.6 : 1.4;
  for (const sd of [-1, 1]) {
    const wg = at(new THREE.Group(), dragon ? 0.4 : 0.05, 0.15, sd * 0.25);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span * 0.35, span * 0.25);
    shape.lineTo(-span * 0.05, span);
    shape.lineTo(-span * 0.3, span * 0.75);
    shape.lineTo(-span * 0.45, span * 0.85);
    shape.lineTo(-span * 0.55, span * 0.35);
    shape.lineTo(-span * 0.4, 0);
    const g = new THREE.ShapeGeometry(shape).rotateX(sd * Math.PI / 2);
    wg.add(M(g, mem));
    wg.add(at(M(new THREE.CylinderGeometry(0.03, 0.03, span, 4).rotateX(sd * Math.PI / 2), dark), 0, 0, sd * span * 0.5));
    body.add(wg);
    wings.push(wg);
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      const flap = Math.sin(w) * (dragon ? 0.6 : 0.9);
      wings[0].rotation.x = flap;
      wings[1].rotation.x = -flap;
      body.position.y = 0.6 - Math.sin(w) * 0.12;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      body.rotation.z = -k * 0.4;
      head.rotation.z = -k * 0.3;
    },
  };
}

function rotor(s: Spec): Built {
  const root = new THREE.Group();
  const v = s.rotor;
  const hullM = std(s.body, { metal: 0.6, rough: 0.4 });
  const dark = std(s.dark, { metal: 0.5, rough: 0.5 });
  const eye = glowM(s.glow);
  const body = at(new THREE.Group(), 0, 0.5, 0);
  root.add(body);
  const props: THREE.Object3D[] = [];
  let flash: THREE.Object3D | null = null;
  if (v === 'drone') {
    body.add(M(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 8), hullM));
    body.add(at(M(new THREE.SphereGeometry(0.16, 7, 5), eye), 0.42, -0.05, 0));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      body.add(at(M(new THREE.BoxGeometry(0.9, 0.06, 0.08).rotateY(-a), dark), Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45));
      const pr = at(new THREE.Group(), Math.cos(a) * 0.85, 0.16, Math.sin(a) * 0.85);
      pr.add(M(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 12), ghostM('#d8dce0', 0.35)));
      pr.add(M(new THREE.BoxGeometry(0.62, 0.02, 0.06), dark));
      body.add(pr);
      props.push(pr);
    }
    flash = at(M(new THREE.SphereGeometry(0.15, 5, 4), glowM('#fff0a0')), 0.6, -0.15, 0);
    body.add(flash);
  } else {
    // Gunship (and the angular Reaver): a fuselage, a canopy, stub wings with pods, a tail boom, the rotor.
    const reaver = v === 'reaver';
    body.add(M(new THREE.CapsuleGeometry(0.32, 1.2, 4, 8).rotateZ(Math.PI / 2), hullM));
    body.add(at(M(new THREE.SphereGeometry(0.28, 7, 5).scale(1.3, 0.8, 0.9), std('#203040', { metal: 0.9, rough: 0.1, emissive: s.glow })), 0.65, 0.12, 0));
    body.add(at(M(new THREE.BoxGeometry(1.5, 0.1, 0.12), hullM), -1.2, 0.12, 0));
    body.add(at(M(new THREE.BoxGeometry(0.3, 0.4, 0.06), hullM), -1.9, 0.3, 0));
    for (const sd of [-1, 1]) {
      body.add(at(M(new THREE.BoxGeometry(0.35, 0.06, reaver ? 1.5 : 0.9), dark), 0, -0.05, sd * 0.4));
      body.add(at(M(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6).rotateZ(Math.PI / 2), dark), 0.1, -0.12, sd * (reaver ? 0.9 : 0.75)));
    }
    if (!reaver) {
      const pr = at(new THREE.Group(), 0, 0.45, 0);
      pr.add(M(new THREE.CylinderGeometry(1.4, 1.4, 0.02, 16), ghostM('#c8ccd0', 0.22)));
      pr.add(M(new THREE.BoxGeometry(2.8, 0.03, 0.12), dark));
      pr.add(M(new THREE.BoxGeometry(0.12, 0.03, 2.8), dark));
      body.add(pr);
      props.push(pr);
    }
    flash = at(M(new THREE.SphereGeometry(0.2, 5, 4), glowM('#fff0a0')), 1.05, -0.2, 0);
    body.add(flash);
  }
  return {
    root,
    pose: (p, atk) => {
      for (const pr of props) pr.rotation.y = p * TAU * 3;
      body.position.y = 0.5 + Math.sin(p * TAU) * 0.06;
      body.rotation.z = -0.12;
      if (flash) flash.visible = atk > 0.3 && atk < 0.8;
    },
  };
}

function wraith(s: Spec): Built {
  const root = new THREE.Group();
  const cloak = std(s.body, { rough: 1 });
  const dark = std(s.dark, { rough: 1 });
  const bone = std('#e4dcc8', { rough: 0.6 });
  const eye = glowM(s.glow);
  const body = at(new THREE.Group(), 0, 1.2, 0);
  root.add(body);
  // A tattered cone of cloak, hem torn into points.
  const cone = new THREE.ConeGeometry(0.85, 2.4, 10, 2, true);
  const pos = cone.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -1.1) pos.setY(i, pos.getY(i) - (i % 2) * 0.35);
  cone.computeVertexNormals();
  body.add(at(M(cone, cloak), 0, -0.3, 0));
  body.add(at(M(new THREE.SphereGeometry(0.4, 8, 6), dark), 0.05, 0.85, 0));
  body.add(at(M(new THREE.SphereGeometry(0.28, 7, 5), std('#06040a')), 0.22, 0.78, 0));
  for (const sd of [-1, 1]) body.add(at(M(new THREE.SphereGeometry(0.07, 5, 4), eye), 0.42, 0.82, sd * 0.11));
  // Wisps trailing behind.
  for (let k = 0; k < 4; k++) body.add(at(M(new THREE.SphereGeometry(0.4 - k * 0.07, 6, 4), ghostM(s.glow, 0.18)), -0.6 - k * 0.45, -0.6 - k * 0.1, (k % 2 ? 1 : -1) * 0.15));
  const arms: THREE.Group[] = [];
  for (const sd of [-1, 1]) {
    const a = at(new THREE.Group(), 0.1, 0.45, sd * 0.45);
    a.add(at(M(new THREE.CylinderGeometry(0.05, 0.04, 1.1, 5).rotateZ(-Math.PI / 2 + 0.25), bone), 0.5, -0.12, 0));
    for (let k = -1; k <= 1; k++) a.add(at(M(new THREE.ConeGeometry(0.03, 0.35, 3).rotateZ(-Math.PI / 2 - 0.3), bone), 1.15, -0.28, k * 0.06));
    body.add(a);
    arms.push(a);
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      body.position.y = 1.2 + Math.sin(w) * 0.12;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      arms.forEach((a, i) => {
        a.rotation.z = -0.2 + Math.sin(w + i) * 0.12 + k * 0.4;
        a.position.x = 0.1 + k * 0.4;
      });
      body.rotation.z = -0.15 - k * 0.2;
    },
  };
}

function brain(s: Spec): Built {
  const root = new THREE.Group();
  const body = at(new THREE.Group(), 0, 1.4, 0);
  root.add(body);
  const g = new THREE.SphereGeometry(1, 16, 12);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + Math.sin(x * 9 + y * 7) * 0.05 + Math.sin(z * 11 - y * 5) * 0.05 - (Math.abs(z) < 0.08 ? 0.12 : 0);
    pos.setXYZ(i, x * k * 1.15, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  body.add(M(g, std('#d890a8', { rough: 0.5, flat: false })));
  body.add(M(new THREE.SphereGeometry(1.35, 12, 8), ghostM(s.glow, 0.12)));
  for (const [x, y, z] of [[1.05, 0, 0], [0.85, 0.35, -0.35], [0.85, 0.35, 0.35]]) {
    body.add(at(M(new THREE.SphereGeometry(0.16, 6, 5), std('#f0ead8')), x, y, z));
    body.add(at(M(new THREE.SphereGeometry(0.08, 5, 4), glowM(s.glow)), x + 0.12, y, z));
  }
  const tent: THREE.Group[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const t = at(new THREE.Group(), Math.cos(a) * 0.6, -0.55, Math.sin(a) * 0.6);
    let par: THREE.Group = t;
    for (let j = 0; j < 4; j++) {
      const sg = at(new THREE.Group(), 0, -0.28, 0);
      sg.add(M(new THREE.SphereGeometry(0.12 - j * 0.02, 5, 4), std(s.dark)));
      par.add(sg);
      par = sg;
    }
    body.add(t);
    tent.push(t);
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      body.position.y = 1.4 + Math.sin(w) * 0.1;
      tent.forEach((t, i) => {
        t.rotation.x = Math.sin(w + i) * 0.4;
        t.rotation.z = Math.cos(w + i * 0.7) * 0.4 + atk * 0.3;
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------ machines

function vehicle(s: Spec): Built {
  const root = new THREE.Group();
  const v = s.veh;
  const hullM = std(s.body, { metal: 0.5, rough: 0.55 });
  const dark = std(s.dark, { metal: 0.4, rough: 0.6 });
  const rust = std('#6a4a32', { rough: 0.9 });
  const L = v === 'bike' ? 1.6 : v === 'barge' ? 2.8 : v === 'rig' ? 2.6 : v === 'tank' ? 2.2 : v === 'truck' ? 2.2 : 1.9;
  const Wd = v === 'bike' ? 0.4 : v === 'barge' ? 1.6 : 1.3;
  const wheels: THREE.Object3D[] = [];
  const wr = v === 'bike' ? 0.32 : v === 'barge' ? 0.36 : 0.3;
  const axles = v === 'bike' ? [L * 0.4, -L * 0.4] : v === 'rig' || v === 'barge' ? [L * 0.4, L * 0.1, -L * 0.2, -L * 0.42] : [L * 0.34, -L * 0.34];
  let turret: THREE.Group | null = null;
  let flash: THREE.Object3D | null = null;
  if (v === 'tank') {
    for (const sd of [-1, 1]) {
      root.add(at(M(new THREE.BoxGeometry(L, 0.45, 0.38), std('#1c1c1e')), 0, 0.25, sd * (Wd / 2 - 0.1)));
      for (let k = 0; k < 4; k++) {
        const w = at(new THREE.Group(), -L * 0.36 + k * L * 0.24, 0.22, sd * (Wd / 2 + 0.1));
        w.add(M(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8).rotateX(Math.PI / 2), dark));
        root.add(w);
        wheels.push(w);
      }
    }
    root.add(at(M(new THREE.BoxGeometry(L * 0.95, 0.4, Wd * 0.75), hullM), 0, 0.62, 0));
    turret = at(new THREE.Group(), -0.1, 0.84, 0);
    turret.add(M(new THREE.CylinderGeometry(0.42, 0.5, 0.32, 8), hullM));
    turret.add(at(M(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 6).rotateZ(Math.PI / 2), dark), 0.85, 0.02, 0));
    flash = at(M(new THREE.SphereGeometry(0.2, 5, 4), glowM('#fff0a0')), 1.55, 0.02, 0);
    turret.add(flash);
    root.add(turret);
  } else {
    for (const x of axles) {
      for (const sd of v === 'bike' ? [0] : [-1, 1]) {
        const w = at(new THREE.Group(), x, wr, sd * (Wd / 2 + 0.02));
        w.add(M(new THREE.CylinderGeometry(wr, wr, v === 'bike' ? 0.12 : 0.22, 10).rotateX(Math.PI / 2), std('#141416')));
        w.add(M(new THREE.CylinderGeometry(wr * 0.5, wr * 0.5, v === 'bike' ? 0.14 : 0.24, 6).rotateX(Math.PI / 2), dark));
        w.add(M(new THREE.BoxGeometry(wr * 1.4, 0.06, 0.25), dark));
        root.add(w);
        wheels.push(w);
      }
    }
    if (v === 'bike') {
      root.add(at(M(new THREE.BoxGeometry(L * 0.7, 0.25, 0.25), hullM), 0, wr * 1.6, 0));
      // The rider.
      const rider = at(new THREE.Group(), -0.05, wr * 2, 0);
      rider.add(at(M(new THREE.BoxGeometry(0.3, 0.55, 0.36), std(s.accent)), 0, 0.3, 0));
      rider.add(at(M(new THREE.SphereGeometry(0.16, 7, 5), std('#2a2a2a', { metal: 0.6 })), 0.06, 0.68, 0));
      rider.rotation.z = -0.4;
      root.add(rider);
    } else {
      // Chassis, armoured cab, spikes and scrap plate, a gun up top.
      root.add(at(M(new THREE.BoxGeometry(L, 0.3, Wd * 0.9), dark), 0, wr * 1.5, 0));
      const cab = v === 'buggy' ? 0.55 : 0.75;
      root.add(at(M(new THREE.BoxGeometry(L * 0.35, cab, Wd * 0.85), hullM), L * 0.28, wr * 1.5 + cab / 2 + 0.15, 0));
      root.add(at(M(new THREE.BoxGeometry(0.06, cab * 0.4, Wd * 0.7), std('#1a2a3a', { metal: 0.9, rough: 0.1 })), L * 0.46, wr * 1.5 + cab * 0.65, 0));
      if (v === 'buggy') for (const sd of [-1, 1]) root.add(at(M(new THREE.BoxGeometry(L * 0.5, 0.05, 0.05), std('#c8a060', { metal: 0.6 })), 0, wr * 1.5 + 0.75, sd * Wd * 0.4));
      else root.add(at(M(new THREE.BoxGeometry(L * 0.6, v === 'barge' ? 0.9 : 0.45, Wd * 0.9), v === 'barge' ? rust : hullM), -L * 0.18, wr * 1.5 + 0.4, 0));
      for (let k = 0; k < (v === 'barge' ? 6 : 3); k++) root.add(at(M(new THREE.ConeGeometry(0.06, 0.4, 4).rotateZ(-Math.PI / 2), std('#c8c8c0', { metal: 0.7 })), L * 0.5 + 0.15, wr * 1.3, (k / ((v === 'barge' ? 6 : 3) - 1) - 0.5) * Wd * 0.8));
      if (v === 'barge') for (const sd of [-1, 1]) root.add(at(M(new THREE.BoxGeometry(0.04, 1.6, L * 0.4).rotateY(Math.PI / 2), ghostM('#c8b090', 0.8)), -L * 0.2, wr * 1.5 + 1.6, sd * 0.1));
      turret = at(new THREE.Group(), v === 'buggy' ? -0.1 : -L * 0.15, wr * 1.5 + (v === 'buggy' ? 0.85 : v === 'barge' ? 1.05 : 0.8), 0);
      turret.add(M(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 6), dark));
      turret.add(at(M(new THREE.CylinderGeometry(0.04, 0.05, v === 'rig' || v === 'barge' ? 1.2 : 0.8, 5).rotateZ(Math.PI / 2), dark), 0.45, 0.05, 0));
      flash = at(M(new THREE.SphereGeometry(0.14, 5, 4), glowM('#fff0a0')), v === 'rig' || v === 'barge' ? 1.1 : 0.85, 0.05, 0);
      turret.add(flash);
      root.add(turret);
    }
  }
  return {
    root,
    pose: (p, atk) => {
      for (const w of wheels) w.rotation.z = -p * TAU;
      root.position.y = Math.sin(p * TAU * 2) * 0.015;
      if (flash) flash.visible = atk > 0.3 && atk < 0.8;
    },
  };
}

function treadbot(s: Spec): Built {
  const root = new THREE.Group();
  const hullM = std(s.body, { metal: 0.6, rough: 0.4 });
  const dark = std(s.dark, { metal: 0.5, rough: 0.5 });
  for (const sd of [-1, 1]) root.add(at(M(new THREE.BoxGeometry(1.4, 0.4, 0.35), std('#1a1a1c')), 0, 0.22, sd * 0.5));
  root.add(at(M(new THREE.BoxGeometry(1, 0.35, 0.8), dark), 0, 0.5, 0));
  const top = at(new THREE.Group(), 0, 0.7, 0);
  top.add(M(new THREE.SphereGeometry(0.42, 9, 6, 0, TAU, 0, Math.PI / 2), hullM));
  top.add(at(M(new THREE.BoxGeometry(0.06, 0.12, 0.5), glowM(s.glow)), 0.38, 0.18, 0));
  for (const sd of [-1, 1]) top.add(at(M(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6).rotateZ(Math.PI / 2), dark), 0.45, 0.1, sd * 0.45));
  const flash = at(M(new THREE.SphereGeometry(0.12, 5, 4), glowM('#fff0a0')), 0.9, 0.1, 0.45);
  top.add(flash);
  root.add(top);
  return {
    root,
    pose: (p, atk) => {
      top.rotation.y = Math.sin(p * TAU) * 0.15;
      flash.visible = atk > 0.3 && atk < 0.8;
    },
  };
}

/** A walker mech on reverse-jointed legs: hips, a cockpit with its visor, guns on both shoulders. */
function mech(s: Spec): Built {
  const root = new THREE.Group();
  const hullM = std(s.body, { metal: 0.6, rough: 0.45 });
  const dark = std(s.dark, { metal: 0.5, rough: 0.5 });
  const hipY = 1.5;
  const hips = at(new THREE.Group(), 0, hipY, 0);
  root.add(hips);
  hips.add(M(new THREE.BoxGeometry(0.6, 0.35, 0.9), dark));
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const sd of [-1, 1]) {
    const hip = at(new THREE.Group(), 0, 0, sd * 0.55);
    const th = new THREE.Group();
    th.rotation.z = 0.6;
    th.add(limb(0.85, 0.13, hullM));
    hip.add(th);
    const knee = at(new THREE.Group(), 0, -0.85, 0);
    knee.rotation.z = -1.4;
    knee.add(limb(0.95, 0.1, dark));
    knee.add(at(M(new THREE.BoxGeometry(0.6, 0.12, 0.35), dark), 0.15, -0.95, 0));
    th.add(knee);
    hips.add(hip);
    legs.push({ hip, knee });
  }
  const cab = at(new THREE.Group(), 0, 0.45, 0);
  hips.add(cab);
  cab.add(M(new THREE.BoxGeometry(1.2, 0.75, 1.1), hullM));
  cab.add(at(M(new THREE.BoxGeometry(0.06, 0.18, 0.75), glowM(s.glow)), 0.61, 0.08, 0));
  cab.add(at(M(new THREE.BoxGeometry(0.4, 0.15, 0.5), dark), -0.3, 0.45, 0));
  const flashes: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const pod = at(new THREE.Group(), 0.1, 0.05, sd * 0.75);
    pod.add(M(new THREE.BoxGeometry(0.6, 0.3, 0.3), dark));
    pod.add(at(M(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6).rotateZ(Math.PI / 2), dark), 0.65, 0, 0));
    const f = at(M(new THREE.SphereGeometry(0.14, 5, 4), glowM('#fff0a0')), 1.1, 0, 0);
    pod.add(f);
    flashes.push(f);
    cab.add(pod);
  }
  return {
    root,
    pose: (p, atk) => {
      const w = p * TAU;
      legs.forEach((l, i) => {
        const s2 = Math.sin(w + i * Math.PI);
        l.hip.rotation.z = s2 * 0.35;
        l.knee.rotation.z = -1.4 - Math.max(0, Math.cos(w + i * Math.PI)) * 0.3;
      });
      hips.position.y = hipY + Math.abs(Math.sin(w)) * 0.06;
      cab.rotation.y = Math.sin(w) * 0.05;
      for (const f of flashes) f.visible = atk > 0.3 && atk < 0.8;
    },
  };
}

// ------------------------------------------------------------------------------------------------ elementals and oddities

function elemental(s: Spec): Built {
  const root = new THREE.Group();
  const core = glowM(s.glow);
  const shard = std(s.body, { metal: 0.2, rough: 0.6 });
  const body = at(new THREE.Group(), 0, 1.6, 0);
  root.add(body);
  body.add(M(new THREE.IcosahedronGeometry(0.55, 1), core));
  body.add(M(new THREE.SphereGeometry(0.95, 10, 8), ghostM(s.glow, 0.18)));
  const ring = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    const sh = at(M(new THREE.OctahedronGeometry(0.32 + (k % 3) * 0.08, 0).scale(1, 2.2, 1), shard), Math.cos(a) * 1.25, (k % 2) * 0.3 - 0.15, Math.sin(a) * 1.25);
    sh.rotation.z = 0.4;
    ring.add(sh);
  }
  body.add(ring);
  const fists: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const f = at(M(new THREE.DodecahedronGeometry(0.42, 0), shard), 1.2, -0.3, sd * 1);
    fists.push(f);
    body.add(f);
  }
  return {
    root,
    pose: (p, atk) => {
      ring.rotation.y = p * TAU;
      body.position.y = 1.6 + Math.sin(p * TAU) * 0.1;
      const k = Math.sin(Math.min(1, atk) * Math.PI);
      fists.forEach((f, i) => {
        f.position.x = 1.2 + k * 0.8;
        f.position.y = -0.3 + Math.sin(p * TAU + i) * 0.12;
      });
    },
  };
}

function maw(s: Spec): Built {
  const root = new THREE.Group();
  const flesh = std(s.body, { rough: 0.7 });
  const body = at(new THREE.Group(), 0, 1.1, 0);
  root.add(body);
  body.add(M(new THREE.SphereGeometry(1.1, 12, 9), flesh));
  body.add(at(M(new THREE.CircleGeometry(0.8, 14).rotateY(Math.PI / 2), std('#2a0408')), 1.02, 0.05, 0));
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    body.add(at(M(new THREE.ConeGeometry(0.06, 0.4 - ring * 0.1, 3).rotateZ(-Math.PI / 2), std('#f0e8d0')), 1 - ring * 0.12, Math.sin(a) * (0.75 - ring * 0.25), Math.cos(a) * (0.75 - ring * 0.25)));
  }
  body.add(at(M(new THREE.SphereGeometry(0.16, 6, 4), glowM(s.glow)), 0.9, 0, 0));
  const legs: THREE.Group[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const l = at(new THREE.Group(), Math.cos(a) * 0.8, -0.5, Math.sin(a) * 0.8);
    l.rotation.y = -a;
    l.add(at(M(new THREE.CylinderGeometry(0.1, 0.18, 1.4, 6).rotateZ(Math.PI / 2 + 0.6), std(s.dark)), 0.6, -0.35, 0));
    body.add(l);
    legs.push(l);
  }
  return {
    root,
    pose: (p, atk) => {
      legs.forEach((l, i) => (l.rotation.z = Math.sin(p * TAU + i) * 0.25));
      body.scale.setScalar(1 + Math.sin(Math.min(1, atk) * Math.PI) * 0.08);
    },
  };
}

function crystal(s: Spec): Built {
  const root = new THREE.Group();
  const body = at(new THREE.Group(), 0, 1.4, 0);
  root.add(body);
  const shardM = std(s.body, { metal: 0.3, rough: 0.2 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    const sh = at(M(new THREE.ConeGeometry(0.22, 1.8 + (k % 3) * 0.4, 5), shardM), Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7);
    sh.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    body.add(sh);
  }
  body.add(M(new THREE.SphereGeometry(0.6, 10, 8), std('#f0e8f8', { rough: 0.3 })));
  body.add(at(M(new THREE.SphereGeometry(0.3, 8, 6), glowM(s.glow)), 0.42, 0.05, 0));
  body.add(at(M(new THREE.SphereGeometry(0.13, 6, 4), std('#100618')), 0.66, 0.05, 0));
  return {
    root,
    pose: (p) => {
      body.rotation.y = Math.sin(p * TAU) * 0.2;
    },
  };
}

export function buildRig(s: Spec): Built {
  switch (s.rig) {
    case 'biped': return biped(s);
    case 'quad': return quad(s);
    case 'bug': return bug(s);
    case 'serpent': return serpent(s);
    case 'bat': return bat(s, false);
    case 'dragon': return bat(s, true);
    case 'rotor': return rotor(s);
    case 'wraith': return wraith(s);
    case 'vehicle': return vehicle(s);
    case 'treadbot': return treadbot(s);
    case 'mech': return mech(s);
    case 'elemental': return elemental(s);
    case 'brain': return brain(s);
    case 'maw': return maw(s);
    case 'crystal': return crystal(s);
  }
}
