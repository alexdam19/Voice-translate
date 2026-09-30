import { cap, ell, eye, line, paintSprite, plate, tint, type Painter } from './creaturesHD';
import { hash2, rgb, type RGB } from './pixels';

/**
 * People as detailed pixel-art figures, the way a clipart pixel artist paints them: every part a lit volume (light
 * from the upper left) snapped to a hue-shifted ramp with dithering, a dark rim round each part, and a clean dark
 * outline round the whole figure. Heroic proportions (a head about a quarter of the height), a three-quarter view
 * facing right, and the kit of the job:
 *
 *  - Rifleman (combat helmet with goggles, tactical vest with pouches, backpack and radio, rifle), power-armoured
 *    marine (full helmet with a glowing visor, plate over everything), heavy gunner (pauldrons, a rotary gun and its
 *    ammo box), sniper (hood, long rifle and scope), officer (peaked cap, long coat, gold epaulettes, medals, a
 *    pistol on the hip), engineer (hard hat, hi-vis vest, tool belt, wrench), mechanic (cap on backwards, overalls),
 *    medic (red-cross cap and armband, med bag), pilot (flight suit, helmet with the visor up, life vest), flag
 *    signaller (ear defenders, hi-vis, a flag in each hand), cook (whites and a chef's hat), deckhand (hoodie, jeans
 *    and trainers), firefighter (helmet and bunker coat with reflective bands), trader (head wrap and poncho).
 *  - Poses: standing (armed ones at port arms), a four-frame walk, aiming, waving flags, working with a tool,
 *    carrying a crate, saluting, sitting, typing, hosing, welding, cheering, looking through binoculars, asleep.
 *
 * Painted on a 32-unit grid at the size it's shown and cached. A skin tone, hair style and colour, and face come
 * from the person's seed; the uniform from their department (muted, with the department's own colour on the
 * shoulder patch so they still read).
 */

export type HeroRole =
  | 'rifleman' | 'marine' | 'heavy' | 'sniper' | 'officer' | 'engineer' | 'mechanic' | 'medic' | 'pilot' | 'signal'
  | 'cook' | 'deckhand' | 'firefighter' | 'trader' | 'crew';

export type HeroPose = 'stand' | 'walk' | 'aim' | 'wave' | 'work' | 'carry' | 'salute' | 'sit' | 'sleep' | 'hose' | 'weld' | 'type' | 'cheer' | 'look';

export interface HeroSpec {
  role: HeroRole;
  seed: number;
  /** Department or unit colour (the uniform is a muted version of it; the shoulder patch shows it as is). */
  color?: string;
}

type Head = 'helmet' | 'marine' | 'hardhat' | 'cap' | 'capback' | 'peaked' | 'beret' | 'hood' | 'chef' | 'medic' | 'pilot' | 'firehelm' | 'earmuff' | 'wrap' | 'none';
type Torso = 'jacket' | 'vest' | 'armor' | 'hivis' | 'coat' | 'overalls' | 'apron' | 'hoodie' | 'flight' | 'bunker' | 'poncho';
type Legs = 'cargo' | 'jeans' | 'suit' | 'dark';
type Feet = 'boots' | 'sneakers';
type Held = 'rifle' | 'minigun' | 'sniper' | 'pistol' | 'wrench' | 'medkit' | 'flags' | 'clipboard' | 'none';

interface Kit {
  head: Head;
  torso: Torso;
  legs: Legs;
  feet: Feet;
  held: Held;
  pack?: 'pack' | 'ammo' | 'tank' | 'bag';
  uni: string;
  glow?: string;
}

const KITS: Record<HeroRole, Kit> = {
  rifleman: { head: 'helmet', torso: 'vest', legs: 'cargo', feet: 'boots', held: 'rifle', pack: 'pack', uni: '#5a6a3a' },
  marine: { head: 'marine', torso: 'armor', legs: 'suit', feet: 'boots', held: 'rifle', uni: '#3e4a56', glow: '#ff9a30' },
  heavy: { head: 'helmet', torso: 'armor', legs: 'cargo', feet: 'boots', held: 'minigun', pack: 'ammo', uni: '#4e5a3a' },
  sniper: { head: 'hood', torso: 'jacket', legs: 'cargo', feet: 'boots', held: 'sniper', pack: 'pack', uni: '#4a4a3a' },
  officer: { head: 'peaked', torso: 'coat', legs: 'dark', feet: 'boots', held: 'none', uni: '#3a4a3a' },
  engineer: { head: 'hardhat', torso: 'hivis', legs: 'cargo', feet: 'boots', held: 'wrench', uni: '#e87a1a' },
  mechanic: { head: 'capback', torso: 'overalls', legs: 'suit', feet: 'boots', held: 'wrench', uni: '#3a5a8a' },
  medic: { head: 'medic', torso: 'jacket', legs: 'cargo', feet: 'boots', held: 'medkit', pack: 'bag', uni: '#e8e8e0' },
  pilot: { head: 'pilot', torso: 'flight', legs: 'suit', feet: 'boots', held: 'none', uni: '#6a7a5a' },
  signal: { head: 'earmuff', torso: 'hivis', legs: 'cargo', feet: 'boots', held: 'flags', uni: '#f0c020' },
  cook: { head: 'chef', torso: 'apron', legs: 'dark', feet: 'boots', held: 'none', uni: '#f0f0e8' },
  deckhand: { head: 'none', torso: 'hoodie', legs: 'jeans', feet: 'sneakers', held: 'none', uni: '#8a2a3a' },
  firefighter: { head: 'firehelm', torso: 'bunker', legs: 'suit', feet: 'boots', held: 'none', pack: 'tank', uni: '#3a3226' },
  trader: { head: 'wrap', torso: 'poncho', legs: 'dark', feet: 'boots', held: 'none', uni: '#8a5a3a' },
  crew: { head: 'none', torso: 'jacket', legs: 'cargo', feet: 'boots', held: 'none', uni: '#4a5a6a' },
};

const SKINS = ['#f2c9a0', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0785a', '#6b4430'];
const HAIRS = ['#1a1612', '#3e2a20', '#6a4a30', '#b07a3a', '#d8c8a0', '#8e2a1e', '#2a2a2e', '#c8c8c8'];

const C = (h: string): RGB => rgb(h);
const mute = (h: string, k = 0.45): RGB => {
  const c = rgb(h);
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k].map((v) => v * 0.85) as RGB;
};

interface J {
  x: number;
  y: number;
}

interface Skel {
  head: J;
  chest: J;
  hip: J;
  sh: [J, J];
  el: [J, J];
  ha: [J, J];
  kn: [J, J];
  ft: [J, J];
  /** A long gun held across the body: stock and muzzle. */
  gun?: [J, J];
  sit?: boolean;
}

const j = (x: number, y: number): J => ({ x, y });

/** Where the joints are for a pose and frame (back limb first, front limb second). */
function skeleton(pose: HeroPose, f: number, longGun: boolean): Skel {
  const s: Skel = {
    head: j(12.6, 6.9), chest: j(12, 13.9), hip: j(12, 18.9),
    sh: [j(8.9, 11.4), j(15.2, 11.5)], el: [j(8.3, 15.4), j(15.9, 15.5)], ha: [j(8.5, 19), j(16, 19.2)],
    kn: [j(10.6, 24.6), j(13.6, 24.6)], ft: [j(10.4, 29.8), j(14, 29.8)],
  };
  const armedCarry = (): void => {
    // Port arms: the gun across the body, muzzle up to the right.
    s.gun = [j(9.6, 18.2), j(20.4, 10.2)];
    s.el = [j(12.6, 13.6), j(12.6, 16.8)];
    s.ha = [j(16.6, 13.4), j(12.4, 16.4)];
  };
  switch (pose) {
    case 'walk': {
      const st = [1, 0, -1, 0][f & 3];
      const bob = f & 1 ? -0.45 : 0;
      for (const k of [s.head, s.chest, s.hip, ...s.sh]) k.y += bob;
      s.ft = [j(11.2 - 2.4 * st, 29.8 - (f === 1 ? 0.9 : 0)), j(13.2 + 2.4 * st, 29.8 - (f === 3 ? 0.9 : 0))];
      s.kn = [j(11.6 - 1 * st, 24.4 + bob), j(13 + 1.2 * st + 0.4, 24.4 + bob)];
      if (longGun) armedCarry();
      else {
        s.el = [j(8.4 + 0.8 * st, 15.3 + bob), j(15.8 - 0.8 * st, 15.4 + bob)];
        s.ha = [j(8.8 + 2 * st, 18.9 + bob), j(15.6 - 2 * st, 19 + bob)];
      }
      break;
    }
    case 'aim':
      s.head = j(13.4, 7.2);
      s.chest = j(12.4, 14);
      s.sh = [j(9.6, 11.4), j(15.3, 11.6)];
      s.el = [j(14.8, 13.8), j(13.4, 16.4)];
      s.ha = [j(18.6, 13.9), j(15.2, 14.6)];
      s.kn = [j(10.2, 24.4), j(15, 24.2)];
      s.ft = [j(9.2, 29.8), j(15.6, 29.8)];
      s.gun = [j(11.4, 13.1), j(24.6, 13.6)];
      break;
    case 'wave':
      if (f & 1) {
        s.el = [j(7.2, 12.4), j(17.6, 10.2)];
        s.ha = [j(5, 12.6), j(20.4, 8.6)];
      } else {
        s.el = [j(8.2, 15.4), j(16.4, 8.6)];
        s.ha = [j(7, 18.2), j(17.4, 5.2)];
      }
      s.kn = [j(10.6, 24.6), j(13.6, 24.6)];
      s.ft = [j(10, 29.8), j(14.4, 29.8)];
      break;
    case 'salute':
      s.el = [j(9.1, 15.3), j(17.2, 11.2)];
      s.ha = [j(9.3, 18.9), j(15.2, 6.2)];
      break;
    case 'work':
    case 'weld':
      s.el = [j(12.8, 15.2), j(16.4, 14.8)];
      s.ha = [j(16.8, 16.2), j(19.4 + (f & 1) * 0.7, 15.4 - (f & 1) * 0.4)];
      s.head = j(13, 7.1);
      break;
    case 'carry':
      s.el = [j(10.8, 15.4), j(15.8, 15.2)];
      s.ha = [j(13.4, 16.6), j(17.4, 16.4)];
      break;
    case 'hose':
      s.el = [j(13.6, 15.6), j(14.2, 16.8)];
      s.ha = [j(18.4, 15), j(16, 16.2)];
      s.kn = [j(10.2, 24.4), j(14.6, 24.4)];
      s.ft = [j(9.4, 29.8), j(15.4, 29.8)];
      break;
    case 'cheer':
      s.el = [j(8, 8.8), j(16.6, 8.6)];
      s.ha = [j(7.6, 4.8), j(17.6, 4.6)];
      break;
    case 'look':
      s.el = [j(12.2, 12.2), j(16.2, 12.4)];
      s.ha = [j(15.2, 7.6), j(16, 8)];
      break;
    case 'sit':
    case 'type': {
      const d = 3;
      for (const k of [s.head, s.chest, s.hip, ...s.sh]) k.y += d;
      s.kn = [j(15, 21.8), j(16.2, 22)];
      s.ft = [j(14.8, 29.8), j(16.4, 29.8)];
      s.el = [j(10.4, 18.4), j(15.6, 18.6)];
      s.ha = pose === 'type' ? [j(17.6 + (f & 1) * 0.5, 19.8), j(19.2 - (f & 1) * 0.5, 20.2)] : [j(14.6, 21.2), j(16.6, 21.4)];
      s.sit = true;
      break;
    }
    default:
      if (longGun) armedCarry();
  }
  return s;
}

/** A dark pixel dot at unit coordinates (for faces and tiny details). */
function dot(p: Painter, x: number, y: number, c: RGB, w = 1, h = 1): void {
  const X = Math.floor(x * p.u), Y = Math.floor(y * p.u);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const px = X + xx, py = Y + yy;
      if (px < 0 || py < 0 || px >= p.S || py >= p.S) continue;
      const q = (py * p.S + px) * 4;
      p.d[q] = c[0];
      p.d[q + 1] = c[1];
      p.d[q + 2] = c[2];
      p.d[q + 3] = 255;
    }
  }
}

/** A long gun from stock to muzzle: stock, receiver, magazine, barrel; a scope on the sniper's. */
function longGun(p: Painter, a: J, b: J, kind: 'rifle' | 'sniper' | 'minigun'): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const at = (t: number, off = 0): J => j(a.x + dx * t - uy * off, a.y + dy * t + ux * off);
  const metal = C('#2e3238'), wood = C('#6a4a2a');
  if (kind === 'minigun') {
    const s0 = at(0), s1 = at(0.45);
    cap(p, s0.x, s0.y, s1.x, s1.y, 1.5, 1.4, C('#3a3e44'), 'metal');
    const m0 = at(0.42), m1 = at(1);
    for (const o of [-0.55, 0, 0.55]) {
      const q0 = j(m0.x - uy * o, m0.y + ux * o), q1 = j(m1.x - uy * o, m1.y + ux * o);
      line(p, q0.x, q0.y, q1.x, q1.y, o === 0 ? C('#8a929c') : C('#4a5058'));
    }
    const r = at(0.72);
    ell(p, r.x, r.y, 0.9, 1.2, C('#5a6068'), 'metal');
    const m = at(0.95);
    ell(p, m.x, m.y, 0.8, 1.1, C('#3a3e44'), 'metal');
    return;
  }
  // Stock, receiver, barrel.
  const st1 = at(0.22), rc1 = at(kind === 'sniper' ? 0.55 : 0.6);
  cap(p, a.x, a.y, st1.x, st1.y, 0.75, 0.6, kind === 'sniper' ? wood : metal, kind === 'sniper' ? 'cloth' : 'metal');
  cap(p, st1.x, st1.y, rc1.x, rc1.y, 0.7, 0.62, metal, 'metal');
  line(p, rc1.x, rc1.y, b.x, b.y, C('#4a5058'));
  line(p, rc1.x, rc1.y + 0.35, b.x - ux * 1.2, b.y + 0.35, C('#22262a'));
  // Magazine and grip hanging below.
  const mg = at(kind === 'sniper' ? 0.42 : 0.46);
  cap(p, mg.x, mg.y, mg.x + 0.4, mg.y + 1.8, 0.45, 0.4, C('#1e2226'), 'metal');
  if (kind === 'sniper') {
    const sc0 = at(0.34, -0.9), sc1 = at(0.52, -0.9);
    cap(p, sc0.x, sc0.y, sc1.x, sc1.y, 0.5, 0.5, C('#1a1e22'), 'metal');
    dot(p, sc1.x + 0.3, sc1.y - 0.2, C('#8ad8ff'));
  }
}

const ctxKey = new Map<string, HTMLCanvasElement>();

/** Where a figure painted `S` px stands in its canvas: the point between its feet (pixels). */
export function heroFoot(S: number): { x: number; y: number } {
  return { x: Math.round(12.4 * (S / 32)) + 1, y: Math.round(30.9 * (S / 32)) + 1 };
}

/** A person painted `S` pixels square (the figure fills most of the height), facing right. */
export function hero(spec: HeroSpec, pose: HeroPose, frame: number, S: number): HTMLCanvasElement {
  const nf = pose === 'walk' ? 4 : pose === 'wave' || pose === 'work' || pose === 'weld' || pose === 'type' ? 2 : 1;
  const f = ((frame % nf) + nf) % nf;
  const key = `${spec.role}|${spec.seed & 255}|${spec.color ?? ''}|${pose}|${f}|${S}`;
  const hit = ctxKey.get(key);
  if (hit) return hit;
  if (ctxKey.size > 2400) ctxKey.clear();
  let c: HTMLCanvasElement;
  if (pose === 'sleep') {
    // Asleep: the standing figure laid on its back.
    const up = hero({ ...spec, role: spec.role === 'marine' || spec.role === 'heavy' ? 'crew' : spec.role }, 'stand', 0, S);
    const W = up.width, H = Math.ceil(up.width * 0.46);
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    // Image (u, v) lands at (v, H + off - u): feet to the right, the body centred in the strip.
    const off = W * 0.4 - H / 2;
    x.translate(0, H + off);
    x.rotate(-Math.PI / 2);
    x.drawImage(up, 0, 0);
  } else c = paintSprite(S, spec.seed & 1023, (p) => paintHero(p, spec, pose, f));
  ctxKey.set(key, c);
  return c;
}

function paintHero(p: Painter, spec: HeroSpec, pose: HeroPose, f: number): void {
  const kit = KITS[spec.role];
  const sd = spec.seed;
  const r = (k: number): number => hash2(sd, k, 911);
  const skin = C(SKINS[Math.floor(r(1) * SKINS.length)]);
  const hair = C(HAIRS[Math.floor(r(2) * HAIRS.length)]);
  const hairStyle = Math.floor(r(3) * 6);
  const beard = r(4) < 0.22 && spec.role !== 'medic';
  const dept = spec.color ? C(spec.color) : null;
  // The uniform: the kit's own colour, or the department's toned down.
  const uni: RGB = spec.color && (kit.torso === 'jacket' || kit.torso === 'overalls' || kit.torso === 'hoodie' || kit.torso === 'flight') ? mute(spec.color) : C(kit.uni);
  const uniD = tint(uni, -0.25);
  const long = kit.held === 'rifle' || kit.held === 'sniper' || kit.held === 'minigun';
  const sk = skeleton(pose, f, long && pose !== 'aim');
  const heavyGun = kit.held === 'minigun';
  if (heavyGun && pose !== 'sit' && pose !== 'type') {
    // A rotary gun is carried at the hip.
    sk.gun = [j(9.4, 16.6), j(24, 15.6)];
    sk.el = [j(12.4, 15.2), j(14.2, 17)];
    sk.ha = [j(16.4, 15.6), j(12.8, 17.4)];
  }
  const legCol: RGB = kit.legs === 'jeans' ? C('#3a5a8a') : kit.legs === 'suit' ? uni : kit.legs === 'dark' ? C('#2a2c32') : tint(uni, -0.18);
  const bootCol: RGB = kit.feet === 'sneakers' ? C('#e8e8e0') : C('#2a2018');
  const sleeve: RGB = kit.torso === 'hivis' || kit.torso === 'apron' ? (kit.torso === 'apron' ? C('#e8e8e0') : C('#4a5a3a')) : kit.torso === 'armor' ? tint(uni, -0.1) : kit.torso === 'bunker' ? C('#3a3226') : uni;

  const leg = (i: 0 | 1): void => {
    const hx = sk.hip.x + (i ? 1.4 : -1.4), hy = sk.hip.y + 0.3;
    const kn = sk.kn[i], ft = sk.ft[i];
    const col = i ? legCol : tint(legCol, -0.12);
    cap(p, hx, hy, kn.x, kn.y, 1.8, 1.5, col, 'cloth');
    cap(p, kn.x, kn.y, ft.x, ft.y - 0.8, 1.5, 1.3, col, 'cloth');
    if (kit.legs === 'cargo' && !sk.sit) plate(p, (hx + kn.x) / 2 + 0.2, (hy + kn.y) / 2 - 0.6, 1.4, 1.8, tint(col, -0.1), 'cloth');
    if (kit.torso === 'armor' || spec.role === 'rifleman') ell(p, kn.x + 0.2, kn.y, 1.1, 0.9, C('#2a2e34'), 'metal', 0.8);
    // Boot.
    ell(p, ft.x + 0.6, ft.y, 2.1, 1.1, bootCol, kit.feet === 'sneakers' ? 'none' : 'skin', 0.8);
    if (kit.feet === 'sneakers') ell(p, ft.x + 0.6, ft.y + 0.4, 1.8, 0.45, C('#b8b8b0'), 'none', 0.5, 0, false);
    else cap(p, ft.x - 0.2, ft.y - 1.5, ft.x + 0.2, ft.y - 0.6, 1.45, 1.35, bootCol, 'skin');
  };
  const arm = (i: 0 | 1): void => {
    const shp = sk.sh[i], el = sk.el[i], ha = sk.ha[i];
    const col = i ? sleeve : tint(sleeve, -0.12);
    cap(p, shp.x, shp.y, el.x, el.y, 1.45, 1.25, col, 'cloth');
    cap(p, el.x, el.y, ha.x, ha.y, 1.25, 1.05, col, 'cloth');
    const glove = kit.torso === 'armor' || spec.role === 'rifleman' || spec.role === 'engineer' || spec.role === 'firefighter';
    ell(p, ha.x, ha.y, 1.05, 1, glove ? C('#2e2a26') : skin, glove ? 'cloth' : 'skin');
    // Shoulder: a pauldron on armour, a patch in the department's colour otherwise.
    if (kit.torso === 'armor') ell(p, shp.x, shp.y, 2.2, 1.8, tint(uni, 0.1), 'metal', 1.1);
    else if (i === 1 && dept) ell(p, shp.x + 0.2, shp.y + 1.2, 0.7, 0.6, dept, 'none', 0.8);
    if (i === 1 && spec.role === 'medic') {
      ell(p, (shp.x + el.x) / 2, (shp.y + el.y) / 2, 1.2, 0.8, C('#f4f4ee'), 'none', 0.6);
      dot(p, (shp.x + el.x) / 2 - 0.2, (shp.y + el.y) / 2 - 0.4, C('#d02020'), 1, 2);
    }
  };

  // Behind everything: the pack, the air tank, the ammo box.
  const cx = sk.chest.x, cy = sk.chest.y;
  if (kit.pack === 'pack') {
    plate(p, cx - 5.2, cy - 3, 3.4, 6.4, C('#4a4a32'), 'cloth');
    line(p, cx - 4.2, cy - 3, cx - 5.6, cy - 9.2, C('#1a1a1a'));
  } else if (kit.pack === 'ammo') plate(p, cx - 5.6, cy - 2.6, 3.6, 5.6, C('#4a5a3a'), 'metal');
  else if (kit.pack === 'tank') cap(p, cx - 4.2, cy - 3.2, cx - 4.2, cy + 3.2, 1.4, 1.4, C('#c0c4c8'), 'metal');

  // Back arm and leg, then the torso.
  arm(0);
  leg(0);
  if (kit.torso === 'coat' && !sk.sit) {
    // The coat's skirt, over both thighs.
    ell(p, sk.hip.x + 0.3, sk.hip.y + 2.6, 4.2, 4.2, tint(uni, -0.08), 'cloth', 0.8);
  }
  leg(1);
  // Torso.
  const tCol: RGB = kit.torso === 'hivis' ? C(kit.uni) : kit.torso === 'apron' ? C('#e8e8e0') : kit.torso === 'bunker' ? C('#3a3226') : uni;
  ell(p, cx, cy, 4.1, 4.7, tCol, kit.torso === 'armor' ? 'metal' : 'cloth', 1);
  if (kit.torso === 'coat' && !sk.sit) ell(p, sk.hip.x + 0.3, sk.hip.y + 1.8, 3.2, 3.2, tint(uni, -0.02), 'cloth', 0.7, 0, false);
  // Belt.
  plate(p, cx - 3.6, sk.hip.y - 1.2, 7.2, 1.3, C('#2e2418'), 'none');
  dot(p, cx + 0.6, sk.hip.y - 0.9, C('#c8a048'), 2, 1);
  switch (kit.torso) {
    case 'vest':
      plate(p, cx - 3.4, cy - 2.8, 6.8, 6.2, C('#3e4630'), 'cloth');
      for (let k = 0; k < 3; k++) plate(p, cx - 3.2 + k * 2.2, cy + 1.2, 1.9, 2, C('#4e5838'), 'cloth');
      line(p, cx - 2, cy - 4.2, cx - 1.4, cy - 2.6, C('#2a2e20'));
      line(p, cx + 2, cy - 4.2, cx + 1.4, cy - 2.6, C('#2a2e20'));
      break;
    case 'armor':
      ell(p, cx + 0.2, cy - 1, 3, 2.6, tint(uni, 0.12), 'metal', 1.1);
      plate(p, cx - 2.4, cy + 1.6, 4.8, 1.2, tint(uni, -0.05), 'metal');
      plate(p, cx - 2.2, cy + 2.8, 4.4, 1.1, tint(uni, -0.1), 'metal');
      if (kit.glow) eye(p, cx + 1.4, cy - 1.4, C(kit.glow), 0.35);
      break;
    case 'hivis':
      plate(p, cx - 3, cy + 0.2, 6, 0.7, C('#d8dde0'), 'none');
      plate(p, cx - 3, cy + 2.2, 6, 0.7, C('#d8dde0'), 'none');
      plate(p, cx - 1.6, cy - 3.6, 0.7, 4, C('#d8dde0'), 'none');
      plate(p, cx + 1.2, cy - 3.6, 0.7, 4, C('#d8dde0'), 'none');
      break;
    case 'coat':
      for (let k = 0; k < 3; k++) {
        dot(p, cx + 0.6, cy - 2 + k * 1.6, C('#e0c060'));
        dot(p, cx + 2, cy - 2 + k * 1.6, C('#e0c060'));
      }
      plate(p, cx - 2.6, cy - 2.2, 2, 1, C('#b02020'), 'none');
      plate(p, cx - 2.6, cy - 1.2, 2, 0.6, C('#e0c060'), 'none');
      ell(p, sk.sh[1].x, sk.sh[1].y - 0.3, 1.6, 0.8, C('#e0c060'), 'metal', 0.6);
      ell(p, sk.sh[0].x, sk.sh[0].y - 0.3, 1.4, 0.7, C('#c0a040'), 'metal', 0.6);
      break;
    case 'overalls':
      plate(p, cx - 1.8, cy - 1.6, 3.6, 2.8, tint(uni, 0.08), 'cloth');
      line(p, cx - 1.6, cy - 4.2, cx - 1.6, cy - 1.6, tint(uni, -0.3));
      line(p, cx + 1.6, cy - 4.2, cx + 1.6, cy - 1.6, tint(uni, -0.3));
      dot(p, cx - 0.4, cy - 0.6, C('#1a1a1a'), 2, 1);
      break;
    case 'apron':
      plate(p, cx - 2.4, cy - 2.4, 4.8, 8.6, C('#f4f4ee'), 'cloth');
      break;
    case 'hoodie':
      ell(p, cx - 1.6, cy - 4.4, 2.6, 1.4, tint(uni, -0.15), 'cloth', 0.8);
      plate(p, cx - 1.8, cy + 1.2, 3.8, 1.8, tint(uni, -0.12), 'cloth');
      line(p, cx + 0.4, cy - 3.6, cx + 0.4, cy - 1.8, C('#e8e8e0'));
      line(p, cx + 1.4, cy - 3.6, cx + 1.4, cy - 2.2, C('#e8e8e0'));
      break;
    case 'flight':
      plate(p, cx - 2.6, cy - 3.2, 1.4, 5.6, C('#d8a020'), 'cloth');
      plate(p, cx + 1.2, cy - 3.2, 1.4, 5.6, C('#d8a020'), 'cloth');
      if (dept) plate(p, cx - 0.4, cy - 2.4, 1.2, 1, dept, 'none');
      break;
    case 'bunker':
      plate(p, cx - 3.2, cy + 0.4, 6.4, 0.8, C('#e8e040'), 'none');
      plate(p, cx - 3.2, cy + 1.2, 6.4, 0.4, C('#c8ccd0'), 'none');
      plate(p, cx - 3.2, cy + 3, 6.4, 0.8, C('#e8e040'), 'none');
      break;
    case 'poncho':
      ell(p, cx, cy - 0.6, 4.6, 4, tint(uni, 0.05), 'cloth', 0.7);
      for (let k = 0; k < 4; k++) plate(p, cx - 4 + k * 2, cy + 1.2, 1.2, 0.5, C('#d8b050'), 'none');
      break;
    default:
      line(p, cx + 0.8, cy - 3.8, cx + 0.8, cy + 3.4, tint(uni, -0.3));
      plate(p, cx + 1.3, cy - 2.4, 1.4, 1.2, tint(uni, -0.08), 'cloth');
  }
  if (kit.pack === 'bag') {
    line(p, cx - 2.6, cy - 4, cx + 2.8, cy + 3.8, C('#4a3a2a'));
    plate(p, cx + 1.6, sk.hip.y - 1.2, 2.8, 2.4, C('#f0f0ea'), 'cloth');
    dot(p, cx + 2.8, sk.hip.y - 0.8, C('#d02020'), 1, 2);
  }
  if (spec.role === 'engineer' || spec.role === 'mechanic') {
    // Tool belt: pouches and a hammer.
    plate(p, cx - 2.8, sk.hip.y - 0.4, 1.6, 1.6, C('#6a4a2a'), 'cloth');
    plate(p, cx + 1.6, sk.hip.y - 0.4, 1.6, 1.6, C('#6a4a2a'), 'cloth');
    line(p, cx + 2.4, sk.hip.y + 1, cx + 2.4, sk.hip.y + 2.8, C('#8a929c'));
  }
  if (spec.role === 'officer') {
    // Medals and a holstered pistol.
    for (let k = 0; k < 3; k++) dot(p, cx - 2.2 + k * 0.7, cy - 0.2, [C('#d04040'), C('#40a0d0'), C('#e0c060')][k], 1, 2);
    plate(p, cx + 2, sk.hip.y - 0.6, 1.2, 2, C('#2a2018'), 'none');
  }

  // Neck and head.
  const hx = sk.head.x, hy = sk.head.y;
  cap(p, cx + 0.3, cy - 4, hx - 0.1, hy + 2.4, 1.35, 1.2, tint(skin, -0.12), 'skin');
  const full = kit.head === 'marine';
  const hairBack = !full && (kit.head === 'none' || kit.head === 'capback' || kit.head === 'beret') && (hairStyle === 2 || hairStyle === 5);
  if (hairBack) ell(p, hx - 1.4, hy + 1.6, 1.8, 3, hair, 'fur', 0.8);
  if (full) {
    // Power armour helmet: no face, a glowing visor.
    ell(p, hx, hy - 0.1, 3.1, 3.2, tint(uni, 0.12), 'metal', 1.1);
    ell(p, hx + 1.2, hy + 0.2, 1.9, 1, C('#1a1e24'), 'none', 0.6);
    eye(p, hx + 1.5, hy + 0.1, C(kit.glow ?? '#40c4ff'), 0.5);
    line(p, hx - 1.4, hy + 1.8, hx + 2.4, hy + 1.9, tint(uni, -0.3));
  } else {
    ell(p, hx - 1.9, hy + 0.3, 0.8, 1.1, tint(skin, -0.14), 'skin');
    ell(p, hx, hy, 3.1, 3.3, skin, 'skin', 1.05);
    // Face: eye, brow, nose, mouth; a beard sometimes.
    const big = p.u >= 1.6;
    const ex = hx + 1.3, ey = hy - 0.1;
    if (big) {
      dot(p, ex - 0.4, ey, C('#f4f0e8'), 2, 1);
      dot(p, ex + 0.3, ey, C('#1e1a1a'));
      dot(p, ex - 1.2, ey - 0.8, tint(hair, -0.2), 3, 1);
      dot(p, hx + 2.5, hy + 0.9, tint(skin, -0.28));
      dot(p, hx + 1.2, hy + 1.9, tint(skin, -0.38), 2, 1);
    } else {
      dot(p, ex, ey, C('#f0ece4'));
      dot(p, ex + 0.9, ey, C('#141012'));
      dot(p, hx + 1.4, hy + 1.9, tint(skin, -0.3));
    }
    if (beard) ell(p, hx + 0.8, hy + 2, 2, 1.3, hair, 'fur', 0.7);
    // Hair (under whatever is on top).
    const hood = kit.head === 'hood';
    if (!hood) {
      switch (kit.head === 'none' || kit.head === 'capback' || kit.head === 'beret' ? hairStyle : 0) {
        case 1:
          ell(p, hx - 0.4, hy - 2, 2.9, 1.5, hair, 'fur', 1);
          break;
        case 2:
          ell(p, hx - 0.3, hy - 1.7, 3, 1.9, hair, 'fur', 1);
          break;
        case 3:
          ell(p, hx - 0.2, hy - 2.6, 1.2, 1.4, hair, 'fur', 1);
          ell(p, hx - 0.6, hy - 1.7, 2.6, 1.1, hair, 'fur', 1);
          break;
        case 4:
          eye(p, hx - 0.8, hy - 1.8, tint(skin, 0.4), 0.3);
          break;
        default:
          ell(p, hx - 0.5, hy - 1.8, 2.9, 1.7, hair, 'fur', 1);
          ell(p, hx - 1.9, hy - 0.4, 1, 1.4, hair, 'fur', 0.8);
      }
    }
    switch (kit.head) {
      case 'helmet':
        ell(p, hx - 0.2, hy - 1.5, 3.3, 2.3, C('#4e5a36'), 'metal', 1.1);
        plate(p, hx - 3.4, hy - 0.4, 6.8, 0.6, C('#3a4228'), 'none');
        ell(p, hx + 0.4, hy - 2.1, 1.8, 0.6, C('#2a2e22'), 'none', 0.6);
        eye(p, hx + 1.4, hy - 2.1, C('#8ad0ff'), 0.25);
        line(p, hx - 1.6, hy - 0.2, hx - 0.6, hy + 2.4, C('#2a2e20'));
        break;
      case 'hardhat':
        ell(p, hx - 0.1, hy - 1.7, 2.9, 1.9, C('#f0c020'), 'none', 1.1);
        plate(p, hx - 2.8, hy - 0.6, 6.4, 0.6, C('#c09010'), 'none');
        break;
      case 'cap':
        ell(p, hx - 0.2, hy - 1.8, 2.8, 1.5, uniD, 'cloth', 1);
        plate(p, hx + 1.6, hy - 1.2, 2.2, 0.5, tint(uniD, -0.2), 'none');
        break;
      case 'capback':
        ell(p, hx - 0.2, hy - 1.8, 2.8, 1.5, C('#b03a2a'), 'cloth', 1);
        plate(p, hx - 3.8, hy - 1.2, 2, 0.5, C('#8a2a1e'), 'none');
        break;
      case 'peaked':
        ell(p, hx - 0.1, hy - 2.2, 3.4, 1.4, uni, 'cloth', 0.9);
        plate(p, hx - 2.6, hy - 1.6, 5.2, 0.7, C('#1a1a1a'), 'none');
        plate(p, hx - 2.4, hy - 1.7, 4.8, 0.3, C('#e0c060'), 'none');
        plate(p, hx + 1, hy - 1, 2.6, 0.5, C('#141414'), 'none');
        eye(p, hx, hy - 2.4, C('#f0d070'), 0.25);
        break;
      case 'beret':
        ell(p, hx - 0.6, hy - 2.1, 3.1, 1.2, C('#6a1a1a'), 'cloth', 0.9, -0.2);
        break;
      case 'hood':
        ell(p, hx - 0.6, hy - 0.5, 3.4, 3.6, uniD, 'cloth', 1);
        ell(p, hx + 0.9, hy + 0.5, 1.9, 2.2, tint(skin, -0.25), 'skin', 0.9, 0, false);
        dot(p, hx + 1.3, hy - 0.1, C('#101010'));
        break;
      case 'chef':
        cap(p, hx - 0.2, hy - 1.6, hx - 0.4, hy - 5.2, 2.2, 2.4, C('#f8f8f4'), 'cloth');
        break;
      case 'medic':
        ell(p, hx - 0.2, hy - 1.9, 2.8, 1.5, C('#f4f4ee'), 'none', 1);
        dot(p, hx - 0.2, hy - 2.6, C('#d02020'), 1, 2);
        dot(p, hx - 0.6, hy - 2.2, C('#d02020'), 2, 1);
        break;
      case 'pilot':
        ell(p, hx - 0.2, hy - 1, 3.3, 2.9, C('#c8ccd0'), 'metal', 1.1);
        ell(p, hx + 0.2, hy - 2.4, 2.2, 0.9, C('#3a6a9a'), 'glow', 0.5);
        ell(p, hx + 0.8, hy + 0.6, 1.8, 1.8, skin, 'skin', 0.9, 0, false);
        dot(p, hx + 1.3, hy - 0.1, C('#1e1a1a'));
        line(p, hx - 0.8, hy + 1.2, hx + 2.2, hy + 2.2, C('#1a1a1a'));
        break;
      case 'firehelm':
        ell(p, hx - 0.4, hy - 1.6, 3.4, 2.2, C('#d8b020'), 'metal', 1.1);
        plate(p, hx - 4, hy - 0.6, 3.2, 0.8, C('#a88010'), 'none');
        break;
      case 'earmuff':
        ell(p, hx - 0.2, hy - 1.9, 2.8, 1.4, C('#f0c020'), 'none', 1);
        ell(p, hx - 1.7, hy + 0.3, 1.1, 1.4, C('#e05a1a'), 'none', 0.9);
        break;
      case 'wrap':
        ell(p, hx - 0.4, hy - 1.5, 3.1, 2, C('#c8a060'), 'cloth', 1);
        ell(p, hx - 2.4, hy + 1.2, 1, 2, C('#b08a50'), 'cloth', 0.8);
        break;
      default:
    }
  }

  // What's in the hands, then the front arm over it.
  if (sk.gun && long) longGun(p, sk.gun[0], sk.gun[1], kit.held === 'sniper' ? 'sniper' : heavyGun ? 'minigun' : 'rifle');
  if (heavyGun && sk.gun) {
    // The ammo belt from the box to the gun.
    line(p, cx - 4, cy + 1, sk.gun[0].x + 2.4, sk.gun[0].y + 0.4, C('#c8a040'));
  }
  arm(1);
  const hand = sk.ha[1], back = sk.ha[0];
  switch (pose) {
    case 'wave': {
      // A signal flag in each hand.
      const flag = (hx0: number, hy0: number, tx: number, ty: number, col: string): void => {
        line(p, hx0, hy0 + 1.2, tx, ty, C('#6a5a3a'));
        const w = 4.6, h = 3.2;
        const fx = tx < hx0 ? tx - w : tx;
        plate(p, fx, ty, w, h, C(col), 'cloth');
        plate(p, fx + (tx < hx0 ? 0 : w * 0.5), ty + h * 0.5, w * 0.5, h * 0.5, C('#f4f4ee'), 'none');
      };
      if (f & 1) {
        flag(hand.x, hand.y, hand.x + 3.2, hand.y - 5.6, '#e83a1a');
        flag(back.x, back.y, back.x - 2.6, back.y - 5, '#e8c020');
      } else {
        flag(hand.x, hand.y, hand.x + 0.6, hand.y - 5.6, '#e83a1a');
        flag(back.x, back.y, back.x - 1.2, back.y + 4.2, '#e8c020');
      }
      break;
    }
    case 'carry':
      plate(p, hand.x - 5, hand.y - 5.2, 6.2, 5, C('#8a6a40'), 'cloth');
      line(p, hand.x - 5, hand.y - 2.8, hand.x + 1.2, hand.y - 2.8, C('#5a4028'));
      break;
    case 'look':
      plate(p, hand.x - 0.4, hand.y - 1.4, 2.6, 1.6, C('#1a1e22'), 'metal');
      eye(p, hand.x + 2, hand.y - 0.8, C('#6ab8ff'), 0.2);
      break;
    case 'hose':
      line(p, back.x, back.y, back.x + 4, back.y - 0.4, C('#c02020'));
      plate(p, back.x + 3, back.y - 0.8, 1.6, 0.9, C('#c8ccd0'), 'metal');
      line(p, hand.x, hand.y, hand.x - 3, hand.y + 5, C('#c02020'));
      break;
    case 'weld':
      line(p, hand.x, hand.y, hand.x + 2, hand.y + 0.8, C('#8a929c'));
      eye(p, hand.x + 2.2, hand.y + 0.9, C('#bfe8ff'), 0.5);
      break;
    case 'aim':
      if (kit.held === 'pistol' || kit.held === 'none' || kit.held === 'wrench' || kit.held === 'medkit' || kit.held === 'clipboard' || kit.held === 'flags') {
        // A sidearm.
        plate(p, hand.x + 0.4, hand.y - 0.8, 2.6, 0.9, C('#26292e'), 'metal');
      }
      break;
    default:
      if (kit.held === 'wrench' && pose !== 'sit' && pose !== 'type') {
        line(p, hand.x, hand.y, hand.x + (pose === 'work' ? 2.8 : 0.4), hand.y + (pose === 'work' ? -1.6 : 3), C('#9aa2ac'));
        dot(p, hand.x + (pose === 'work' ? 2.8 : 0.4), hand.y + (pose === 'work' ? -1.8 : 3), C('#c8ccd0'), 2, 1);
      } else if (kit.held === 'medkit' && pose !== 'sit') {
        plate(p, hand.x - 1.2, hand.y + 0.4, 2.6, 2, C('#f4f4ee'), 'cloth');
        dot(p, hand.x, hand.y + 0.8, C('#d02020'), 1, 2);
      } else if (kit.held === 'flags' && (pose === 'stand' || pose === 'walk')) {
        line(p, hand.x, hand.y, hand.x + 0.6, hand.y + 3.2, C('#6a5a3a'));
        plate(p, hand.x + 0.4, hand.y + 1.6, 1.6, 2, C('#e83a1a'), 'cloth');
      } else if (kit.held === 'clipboard') plate(p, hand.x - 0.4, hand.y - 1.2, 1.8, 2.4, C('#c8b890'), 'none');
  }
}

/** The kit of a crew member aboard for what they're doing and their department's colour. */
export function roleForAct(act: string, id: number): HeroRole {
  switch (act) {
    case 'gun': return 'rifleman';
    case 'soldier': return id % 5 === 0 ? 'heavy' : id % 7 === 0 ? 'marine' : 'rifleman';
    case 'engine': case 'build': case 'drill': case 'haul': return 'engineer';
    case 'weld': case 'mechanic': return 'mechanic';
    case 'console': return id % 4 === 0 ? 'officer' : 'crew';
    case 'cook': return 'cook';
    case 'medic': return 'medic';
    case 'hose': case 'pump': case 'fix': return 'firefighter';
    default: return id % 6 === 0 ? 'deckhand' : 'crew';
  }
}
