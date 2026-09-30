import { hash2 } from './pixels';

/**
 * Faces, painted: a head-and-shoulders bust in a three-quarter turn, in the same 32-bit painted style as the figures
 * (smooth shaded volumes, a warm key light from the upper left, a cool rim light in the person's colour from the
 * right, a soft dark outline). Built from the skull out: cranium and cheekbones, a jaw that's square or narrow, ears,
 * the neck and its shadow; eyes with lids, irises, pupils and a catch-light; brows; a nose with its bridge lit and
 * its shadow side; lips; then hair (crew cuts, side parts, long hair, ponytails, buns, curls and afros, mohawks,
 * shaved and bald) and the gear of the trade (a marine's helmet, an engineer's goggles, a driver's headset, a
 * scientist's glasses, a mechanic's cap, a medic's headband, an officer's cap). Beards and stubble, scars,
 * eyepatches, freckles and age lines come from the seed. For the comms screens a face can talk (the mouth opens),
 * look left or right, blink, grin or wince, like the face at the bottom of an old shooter's status bar.
 */

export interface FaceSpec {
  seed: number;
  role: string;
  roleColor: string;
  rarityColor: string;
  /** Champions have their own hair colour and an accent (a badge on the collar). */
  hair?: string;
  accent?: string;
}

export interface FaceMood {
  /** 0 shut .. 1 wide open (talking). */
  mouth?: number;
  /** Eyes to the left (-1) or right (1). */
  look?: number;
  blink?: boolean;
  grin?: boolean;
  /** Hurt (0..1): a wince, a cut, blood. */
  hurt?: number;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = (c: RGB, a = 1): string => `rgba(${Math.round(Math.max(0, Math.min(255, c[0])))},${Math.round(Math.max(0, Math.min(255, c[1])))},${Math.round(Math.max(0, Math.min(255, c[2])))},${a})`;
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Lit toward warm light, shaded toward a cool (or, for skin, a reddish) dark. */
const lit = (c: RGB, k: number): RGB => mix(c, [255, 240, 215], k * 0.55);
const shd = (c: RGB, k: number, warm = false): RGB => mix(mul(c, 1 - k * 0.6), warm ? [110, 40, 45] : [30, 34, 70], k * 0.25);

const SKINS = ['#f3cfae', '#eab991', '#d8a176', '#c08556', '#9c6641', '#7a4a2e', '#5a3421', '#f7dcc4'];
const HAIRS = ['#16120f', '#2f2119', '#4f3322', '#7a4e2a', '#a8753e', '#d8b06a', '#8a2a18', '#b8b4ac', '#e8e4dc'];
const IRIS = ['#5a3a20', '#3a5a8a', '#4a7a4a', '#7a5a2a', '#2a2a2a', '#6a8aa0'];

function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) | 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const cache = new Map<string, HTMLCanvasElement>();

/** A face `size` px square (drawn at three times the size and scaled down smooth). */
export function faceCanvas(spec: FaceSpec, size: number, mood: FaceMood = {}, panel = true): HTMLCanvasElement {
  const key = `${spec.seed}|${spec.role}|${spec.roleColor}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}|${size}|${mood.mouth ?? 0}|${mood.look ?? 0}|${mood.blink ? 1 : 0}|${mood.grin ? 1 : 0}|${mood.hurt ?? 0}|${panel ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 600) cache.clear();
  const R = 3;
  const big = document.createElement('canvas');
  big.width = big.height = 128 * R;
  const x = big.getContext('2d')!;
  x.scale(R, R);
  paint(x, spec, mood, panel);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(big, 0, 0, size, size);
  cache.set(key, c);
  return c;
}

const urls = new Map<string, string>();

/** The face as an image URL (for the HTML panels). */
export function faceURL(spec: FaceSpec, size = 128, mood: FaceMood = {}): string {
  const key = `${spec.seed}|${spec.role}|${spec.roleColor}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}|${size}|${JSON.stringify(mood)}`;
  let u = urls.get(key);
  if (!u) {
    u = faceCanvas(spec, size, mood).toDataURL();
    urls.set(key, u);
  }
  return u;
}

interface Look {
  skin: RGB;
  hair: RGB;
  iris: RGB;
  style: number;
  fem: boolean;
  jaw: number;
  width: number;
  nose: number;
  lips: number;
  age: number;
  beard: number;
  scar: boolean;
  patch: boolean;
  freckles: boolean;
  turn: number;
}

function lookOf(spec: FaceSpec): Look {
  const r = rng(spec.seed * 7 + 13);
  const fem = r() < 0.4;
  return {
    skin: hex(SKINS[Math.floor(r() * SKINS.length)]),
    hair: hex(spec.hair ?? HAIRS[Math.floor(r() * HAIRS.length)]),
    iris: hex(IRIS[Math.floor(r() * IRIS.length)]),
    style: Math.floor(r() * 10),
    fem,
    jaw: fem ? 0.2 + r() * 0.3 : 0.55 + r() * 0.45,
    width: 0.92 + r() * 0.16,
    nose: 0.85 + r() * 0.35,
    lips: fem ? 1 + r() * 0.3 : 0.75 + r() * 0.3,
    age: r(),
    beard: !fem && r() < 0.34 ? (r() < 0.5 ? 1 : 2) : 0,
    scar: r() < 0.16,
    patch: r() < 0.05,
    freckles: r() < 0.15,
    turn: 0.1 + r() * 0.12,
  };
}

function paint(x: CanvasRenderingContext2D, spec: FaceSpec, mood: FaceMood, panel: boolean): void {
  const L = lookOf(spec);
  const role = spec.role;
  const rc = hex(spec.roleColor), rar = hex(spec.rarityColor);
  const skin = L.skin, hair = L.hair;
  // Head geometry (128-unit canvas). The face turns a little to the viewer's left: its centre line sits left of the
  // skull's middle, the near (right) cheek is fuller.
  const cx = 64, top = 17, chin = 91 - (L.fem ? 2 : 0);
  const hw = 26 * L.width * (L.fem ? 0.95 : 1);
  const t = L.turn;
  const fx = cx - hw * t * 1.2;
  const X = (u: number): number => (u < 0 ? cx + u * hw * (1 - t * 0.5) : cx + u * hw * (1 + t * 0.25));
  // Panel.
  if (panel) {
    const bg = x.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, css(mix(mul(rc, 0.35), [12, 14, 22], 0.4)));
    bg.addColorStop(0.6, css([14, 16, 24]));
    bg.addColorStop(1, css([8, 9, 14]));
    x.fillStyle = bg;
    x.fillRect(0, 0, 128, 128);
    const glow = x.createRadialGradient(40, 36, 4, 40, 36, 90);
    glow.addColorStop(0, css(rc, 0.28));
    glow.addColorStop(1, css(rc, 0));
    x.fillStyle = glow;
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.04)';
    x.lineWidth = 0.5;
    for (let i = 0; i < 128; i += 8) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 128);
      x.moveTo(0, i);
      x.lineTo(128, i);
      x.stroke();
    }
  }
  // Long hair behind the head and shoulders.
  const bare = !['marine', 'gunner'].includes(role);
  const long = L.style === 3 || L.style === 7 || (L.fem && L.style === 0);
  if (bare && long) {
    x.fillStyle = grad(x, 40, 30, 100, 110, lit(hair, 0.15), shd(hair, 0.5));
    x.beginPath();
    x.moveTo(X(-1.05), 40);
    x.bezierCurveTo(X(-1.3), 70, X(-1.15), 100, X(-0.9), 116);
    x.lineTo(X(0.95), 116);
    x.bezierCurveTo(X(1.25), 96, X(1.3), 66, X(1.05), 40);
    x.closePath();
    x.fill();
  }
  // Shoulders and uniform.
  const uni: RGB = role === 'medic' ? [210, 214, 206] : mix(mul(rc, 0.45), [50, 56, 62], 0.55);
  x.fillStyle = grad(x, 20, 96, 110, 128, lit(uni, 0.2), shd(uni, 0.55));
  x.beginPath();
  x.moveTo(-4, 128);
  x.bezierCurveTo(-2, 108, 18, 98, 44, 95);
  x.lineTo(84, 95);
  x.bezierCurveTo(110, 98, 130, 108, 132, 128);
  x.closePath();
  x.fill();
  // Tactical vest or straps, the collar, the role's colour on the yoke.
  if (role === 'marine' || role === 'gunner') {
    x.fillStyle = grad(x, 30, 100, 100, 128, lit([70, 76, 62], 0.1), shd([60, 66, 52], 0.5));
    x.fillRect(30, 104, 68, 24);
    for (let k = 0; k < 3; k++) {
      x.fillStyle = css(shd([78, 86, 64], 0.2));
      x.fillRect(36 + k * 20, 112, 14, 12);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.fillRect(36 + k * 20, 112, 14, 2);
    }
  }
  x.fillStyle = css(rc, 0.85);
  x.fillRect(12, 106, 18, 3);
  x.fillRect(98, 106, 18, 3);
  // Neck, with the jaw's shadow on it.
  x.fillStyle = grad(x, cx - 14, 80, cx + 14, 100, lit(skin, 0.05), shd(skin, 0.45, true));
  x.beginPath();
  x.moveTo(fx - 12, 76);
  x.lineTo(fx - 13, 98);
  x.quadraticCurveTo(fx, 104, fx + 15, 98);
  x.lineTo(fx + 14, 76);
  x.closePath();
  x.fill();
  const ns = x.createLinearGradient(0, 80, 0, 92);
  ns.addColorStop(0, css(shd(skin, 0.7, true), 0.7));
  ns.addColorStop(1, css(shd(skin, 0.7, true), 0));
  x.fillStyle = ns;
  x.fillRect(fx - 14, 80, 30, 14);
  // Collar.
  x.fillStyle = css(shd(uni, 0.15));
  x.beginPath();
  x.moveTo(fx - 18, 93);
  x.lineTo(fx - 4, 108);
  x.lineTo(fx - 1, 97);
  x.closePath();
  x.moveTo(fx + 20, 93);
  x.lineTo(fx + 6, 108);
  x.lineTo(fx + 2, 97);
  x.closePath();
  x.fill();
  // Rank pip in the rarity's colour, a badge for champions.
  pip(x, fx + 26, 101, 2.6, rar);
  if (spec.accent) pip(x, fx - 26, 101, 3, hex(spec.accent));
  if (role === 'medic') {
    x.fillStyle = '#ffffff';
    x.fillRect(22, 110, 12, 12);
    x.fillStyle = '#d02020';
    x.fillRect(26, 111, 4, 10);
    x.fillRect(23, 114, 10, 4);
  }
  // Ears (the near one full, the far one behind the cheek).
  ear(x, X(1.02), 58, skin, 1);
  ear(x, X(-0.98), 58, skin, 0.7);
  // The head: cranium, temples, cheekbones, jaw, chin.
  const head = new Path2D();
  const jw = 0.55 + L.jaw * 0.25, jy = 76 + L.jaw * 3;
  head.moveTo(cx, top);
  head.bezierCurveTo(X(0.62), top, X(1), 26, X(1), 44);
  head.bezierCurveTo(X(1.02), 56, X(0.95), 66, X(jw + 0.18), jy);
  head.bezierCurveTo(X(jw), jy + 7, X(0.25), chin, fx + 2, chin);
  head.bezierCurveTo(X(-0.25), chin, X(-jw + 0.02), jy + 6, X(-jw - 0.14), jy);
  head.bezierCurveTo(X(-0.93), 66, X(-1), 56, X(-1), 44);
  head.bezierCurveTo(X(-1), 26, X(-0.62), top, cx, top);
  head.closePath();
  x.fillStyle = radial(x, fx - 6, 44, 4, 60, lit(skin, 0.25), skin, shd(skin, 0.4, true));
  x.fill(head);
  x.save();
  x.clip(head);
  // Shadow side (the far side from the light), the temple hollows, the cheekbone's light.
  const sg = x.createLinearGradient(fx + 4, 0, X(1.05), 0);
  sg.addColorStop(0, css(shd(skin, 0.5, true), 0));
  sg.addColorStop(1, css(shd(skin, 0.8, true), 0.55));
  x.fillStyle = sg;
  x.fillRect(fx, 0, 80, 128);
  blob(x, X(-0.55), 62, 9, 6, lit(skin, 0.5), 0.35);
  blob(x, X(0.6), 64, 8, 6, shd(skin, 0.4, true), 0.3);
  // Cheeks' colour, the chin and the jaw line in shade.
  blob(x, X(-0.5), 68, 8, 5, [220, 110, 100], 0.12);
  blob(x, X(0.55), 68, 7, 5, [220, 110, 100], 0.08);
  blob(x, fx + 2, chin - 4, 7, 4, lit(skin, 0.4), 0.25);
  const jg = x.createLinearGradient(0, jy - 4, 0, chin);
  jg.addColorStop(0, css(shd(skin, 0.3, true), 0));
  jg.addColorStop(1, css(shd(skin, 0.6, true), 0.35));
  x.fillStyle = jg;
  x.fillRect(0, jy - 4, 128, chin - jy + 8);
  // Stubble, or a beard.
  if (L.beard === 1) {
    for (let i = 0; i < 700; i++) {
      const a = hash2(i, spec.seed, 3) * Math.PI, rr = 0.55 + hash2(i, spec.seed, 5) * 0.45;
      const px = fx + Math.cos(a) * hw * 0.85 * rr, py = 66 + Math.sin(a) * 24 * rr;
      if (py < 70 && Math.abs(px - fx) < 9) continue;
      x.fillStyle = css(shd(hair, 0.3), 0.35);
      x.fillRect(px, py, 0.7, 0.7);
    }
  }
  // Age lines, freckles.
  if (L.age > 0.72) {
    x.strokeStyle = css(shd(skin, 0.5, true), 0.35);
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(fx - 7, 68);
    x.quadraticCurveTo(fx - 10, 74, fx - 8, 79);
    x.moveTo(fx + 9, 68);
    x.quadraticCurveTo(fx + 12, 74, fx + 10, 79);
    x.moveTo(fx - 8, 36);
    x.lineTo(fx + 8, 36);
    x.stroke();
  }
  if (L.freckles) {
    for (let i = 0; i < 40; i++) {
      x.fillStyle = css(shd(skin, 0.5, true), 0.35);
      x.beginPath();
      x.arc(fx - 16 + hash2(i, spec.seed, 7) * 32, 58 + hash2(i, spec.seed, 9) * 10, 0.5, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.restore();
  // Rim light in the person's colour down the shadowed edge.
  x.save();
  x.clip(head);
  x.strokeStyle = css(mix(rc, [255, 255, 255], 0.3), 0.55);
  x.lineWidth = 2.2;
  x.translate(1.6, 0);
  x.stroke(head);
  x.restore();
  // Features.
  const ey = 52;
  const eyeL = fx - 11 * L.width, eyeR = fx + 12 * L.width;
  const look = mood.look ?? 0;
  eye(x, eyeL, ey, 5.6 * (1 - t * 0.5), L, look, !!mood.blink, L.patch);
  eye(x, eyeR, ey, 6, L, look, !!mood.blink, false);
  // Brows (a frown when hurt).
  const hurt = mood.hurt ?? 0;
  brow(x, eyeL, ey - 7.5, -1, L, hurt);
  brow(x, eyeR, ey - 7.5, 1, L, hurt);
  // Nose: the bridge lit, the shadow side, the tip and nostrils.
  const nl = 15 * L.nose;
  x.fillStyle = css(shd(skin, 0.45, true), 0.5);
  x.beginPath();
  x.moveTo(fx + 1, ey + 2);
  x.quadraticCurveTo(fx + 6, ey + nl * 0.6, fx + 5, ey + nl);
  x.quadraticCurveTo(fx + 2, ey + nl + 2, fx, ey + nl);
  x.closePath();
  x.fill();
  x.strokeStyle = css(lit(skin, 0.6), 0.6);
  x.lineWidth = 1.1;
  x.beginPath();
  x.moveTo(fx - 1, ey + 1);
  x.lineTo(fx - 1.6, ey + nl - 2);
  x.stroke();
  blob(x, fx - 1, ey + nl - 1, 3, 2.4, lit(skin, 0.4), 0.5);
  for (const s of [-1, 1]) {
    x.fillStyle = css(shd(skin, 0.8, true), 0.7);
    x.beginPath();
    x.ellipse(fx + s * 3.4 + 0.5, ey + nl + 1, 1.5, 0.9, s * 0.3, 0, Math.PI * 2);
    x.fill();
  }
  // Mouth.
  mouth(x, fx + 1, ey + nl + 9, L, mood);
  // Beard over the jaw.
  if (L.beard === 2) {
    x.save();
    x.clip(head);
    const bp = new Path2D();
    bp.moveTo(X(-0.86), 60);
    bp.bezierCurveTo(X(-0.8), 80, X(-0.4), chin + 4, fx + 2, chin + 4);
    bp.bezierCurveTo(X(0.4), chin + 4, X(0.86), 80, X(0.92), 60);
    bp.lineTo(X(0.7), 64);
    bp.quadraticCurveTo(fx + 2, ey + nl + 18, X(-0.66), 64);
    bp.closePath();
    x.fillStyle = grad(x, 0, 60, 0, chin, lit(hair, 0.15), shd(hair, 0.4));
    x.fill(bp);
    x.strokeStyle = css(lit(hair, 0.3), 0.25);
    x.lineWidth = 0.5;
    for (let i = 0; i < 90; i++) {
      const px = fx - 20 + hash2(i, spec.seed, 11) * 42, py = 66 + hash2(i, spec.seed, 13) * 24;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + 0.6, py + 2.4);
      x.stroke();
    }
    x.restore();
    mouth(x, fx + 1, ey + nl + 9, L, mood);
  }
  if (L.scar) {
    x.strokeStyle = css(lit(skin, 0.5), 0.9);
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(eyeR - 2, ey - 14);
    x.lineTo(eyeR + 4, ey + 12);
    x.stroke();
    x.strokeStyle = css(shd(skin, 0.5, true), 0.6);
    x.lineWidth = 0.5;
    x.stroke();
  }
  if (hurt > 0) {
    x.strokeStyle = `rgba(160,20,20,${0.4 + hurt * 0.5})`;
    x.lineWidth = 1.4;
    x.beginPath();
    x.moveTo(fx - 18, 34);
    x.lineTo(fx - 12, 42);
    x.stroke();
    if (hurt > 0.5) blob(x, fx + 16, 78, 5, 3, [150, 20, 20], 0.5);
  }
  // Hair on top, then what's worn on the head.
  if (bare) hairTop(x, L, cx, top, fx, hw, X, role);
  gear(x, role, L, cx, top, fx, hw, X, eyeL, eyeR, ey, rc);
  // A soft dark outline round the head and shoulders.
  x.save();
  x.globalCompositeOperation = 'destination-over';
  x.restore();
}

function grad(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, a: RGB, b: RGB): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, css(a));
  g.addColorStop(1, css(b));
  return g;
}

function radial(x: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, a: RGB, b: RGB, c: RGB): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, r0, cx + 8, cy + 6, r1);
  g.addColorStop(0, css(a));
  g.addColorStop(0.55, css(b));
  g.addColorStop(1, css(c));
  return g;
}

function blob(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, c: RGB, a: number): void {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, css(c, a));
  g.addColorStop(1, css(c, 0));
  x.save();
  x.fillStyle = g;
  x.translate(cx, cy);
  x.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
  x.beginPath();
  x.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
  x.fill();
  x.restore();
}

function pip(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: RGB): void {
  const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  g.addColorStop(0, css(lit(c, 0.8)));
  g.addColorStop(0.6, css(c));
  g.addColorStop(1, css(shd(c, 0.6)));
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
}

function ear(x: CanvasRenderingContext2D, ex: number, ey: number, skin: RGB, k: number): void {
  x.fillStyle = radial(x, ex - 1, ey - 2, 1, 8, lit(skin, 0.1), shd(skin, 0.2, true), shd(skin, 0.5, true));
  x.beginPath();
  x.ellipse(ex, ey, 3.8 * k, 8, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = css(shd(skin, 0.6, true), 0.5);
  x.lineWidth = 0.8;
  x.beginPath();
  x.ellipse(ex, ey, 2 * k, 5, 0, -1.2, 1.6);
  x.stroke();
}

function eye(x: CanvasRenderingContext2D, ex: number, ey: number, w: number, L: Look, look: number, blink: boolean, patch: boolean): void {
  if (patch) {
    x.fillStyle = '#141414';
    x.beginPath();
    x.ellipse(ex, ey, w * 1.1, 5, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#141414';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(ex - w * 1.4, ey - 8);
    x.lineTo(ex + w * 3.5, ey - 14);
    x.stroke();
    return;
  }
  const skin = L.skin;
  // The socket's shade, the lid crease.
  blob(x, ex, ey - 1, w * 1.5, 5, shd(skin, 0.6, true), 0.35);
  if (blink) {
    x.strokeStyle = css(shd(skin, 0.8, true));
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(ex - w, ey);
    x.quadraticCurveTo(ex, ey + 1.6, ex + w, ey);
    x.stroke();
    return;
  }
  const almond = new Path2D();
  almond.moveTo(ex - w, ey);
  almond.bezierCurveTo(ex - w * 0.5, ey - 3.6, ex + w * 0.5, ey - 3.8, ex + w, ey - 0.4);
  almond.bezierCurveTo(ex + w * 0.5, ey + 2.6, ex - w * 0.5, ey + 2.8, ex - w, ey);
  x.fillStyle = '#f2ece4';
  x.fill(almond);
  x.save();
  x.clip(almond);
  const ix = ex + look * w * 0.35;
  const ir = 2.6;
  const g = x.createRadialGradient(ix, ey - 0.6, 0.2, ix, ey - 0.4, ir);
  g.addColorStop(0, css(lit(L.iris, 0.4)));
  g.addColorStop(0.7, css(L.iris));
  g.addColorStop(1, css(shd(L.iris, 0.6)));
  x.fillStyle = g;
  x.beginPath();
  x.arc(ix, ey - 0.4, ir, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#0c0a0a';
  x.beginPath();
  x.arc(ix, ey - 0.4, 1.15, 0, Math.PI * 2);
  x.fill();
  // The upper lid's shadow on the eyeball.
  const ls = x.createLinearGradient(0, ey - 4, 0, ey);
  ls.addColorStop(0, 'rgba(40,20,20,0.5)');
  ls.addColorStop(1, 'rgba(40,20,20,0)');
  x.fillStyle = ls;
  x.fillRect(ex - w, ey - 4, w * 2, 4);
  x.restore();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(ix - 0.9, ey - 1.4, 0.6, 0, Math.PI * 2);
  x.fill();
  // Lids: a strong upper line (lashes), a faint lower one.
  x.strokeStyle = css(shd(skin, 0.9, true));
  x.lineWidth = L.fem ? 1.3 : 1;
  x.beginPath();
  x.moveTo(ex - w - 0.4, ey + 0.2);
  x.bezierCurveTo(ex - w * 0.5, ey - 3.8, ex + w * 0.5, ey - 4, ex + w + 0.6, ey - 0.6);
  x.stroke();
  x.strokeStyle = css(shd(skin, 0.5, true), 0.45);
  x.lineWidth = 0.6;
  x.beginPath();
  x.moveTo(ex - w * 0.8, ey + 1.6);
  x.quadraticCurveTo(ex, ey + 3.4, ex + w * 0.9, ey + 1.2);
  x.stroke();
  // Crease above.
  x.strokeStyle = css(shd(skin, 0.6, true), 0.35);
  x.beginPath();
  x.moveTo(ex - w * 0.7, ey - 3.8);
  x.quadraticCurveTo(ex, ey - 6, ex + w * 0.8, ey - 4);
  x.stroke();
}

function brow(x: CanvasRenderingContext2D, ex: number, by: number, side: number, L: Look, hurt: number): void {
  const c = mix(L.hair, [30, 22, 18], 0.3);
  const w = L.fem ? 1.4 : 2.2;
  x.strokeStyle = css(c, 0.95);
  x.lineCap = 'round';
  const inner = ex - side * 6, outer = ex + side * 7;
  const lift = hurt * 2.5 * -1;
  x.lineWidth = w;
  x.beginPath();
  x.moveTo(inner, by + 1 + lift * -0.6);
  x.quadraticCurveTo(ex, by - 2.2 + lift, outer, by + 0.6);
  x.stroke();
  x.lineWidth = w * 0.5;
  x.beginPath();
  x.moveTo(inner, by + 1.6);
  x.quadraticCurveTo(ex, by - 1.2, outer, by + 1.4);
  x.stroke();
}

function mouth(x: CanvasRenderingContext2D, mx: number, my: number, L: Look, mood: FaceMood): void {
  const w = 9 * (L.fem ? 0.92 : 1);
  const open = Math.max(0, Math.min(1, mood.mouth ?? 0));
  const grin = !!mood.grin;
  const lipC: RGB = mix(L.skin, [170, 70, 70], L.fem ? 0.45 : 0.25);
  if (open > 0.05 || grin) {
    // Open: dark inside, teeth, lips round it.
    const h = 1.5 + open * 6;
    x.fillStyle = '#2a0e0e';
    x.beginPath();
    x.moveTo(mx - w, my);
    x.quadraticCurveTo(mx, my - 2, mx + w, my);
    x.quadraticCurveTo(mx, my + h * 1.4, mx - w, my);
    x.fill();
    x.fillStyle = '#ece6da';
    x.fillRect(mx - w * 0.7, my - 0.8, w * 1.4, grin ? 2.6 : 1.6);
    x.strokeStyle = css(lipC);
    x.lineWidth = 1.4 * L.lips;
    x.beginPath();
    x.moveTo(mx - w, my);
    x.quadraticCurveTo(mx, my - 2.2, mx + w, my);
    x.quadraticCurveTo(mx, my + h * 1.45, mx - w, my);
    x.stroke();
    return;
  }
  // Closed: the upper lip in shade, the lower one lit, the line between.
  x.fillStyle = css(shd(lipC, 0.25));
  x.beginPath();
  x.moveTo(mx - w, my);
  x.bezierCurveTo(mx - w * 0.5, my - 2.6 * L.lips, mx - 1, my - 1.6 * L.lips, mx, my - 1.2 * L.lips);
  x.bezierCurveTo(mx + 1, my - 1.6 * L.lips, mx + w * 0.5, my - 2.6 * L.lips, mx + w, my);
  x.closePath();
  x.fill();
  x.fillStyle = css(lit(lipC, 0.15));
  x.beginPath();
  x.moveTo(mx - w * 0.9, my + 0.2);
  x.quadraticCurveTo(mx, my + 4.2 * L.lips, mx + w * 0.9, my + 0.2);
  x.closePath();
  x.fill();
  blob(x, mx - 1, my + 1.8, 3, 1.2, lit(lipC, 0.6), 0.5);
  x.strokeStyle = css(shd(L.skin, 0.85, true));
  x.lineWidth = 0.9;
  x.beginPath();
  x.moveTo(mx - w, my + (grin ? -1 : 0.2));
  x.quadraticCurveTo(mx, my + 1.2, mx + w, my + (grin ? -1.2 : -0.2));
  x.stroke();
}

function hairTop(x: CanvasRenderingContext2D, L: Look, cx: number, top: number, fx: number, hw: number, X: (u: number) => number, role: string): void {
  const hair = L.hair;
  const style = L.style;
  const fill = (p: Path2D): void => {
    x.fillStyle = grad(x, cx - hw, top, cx + hw, top + 40, lit(hair, 0.28), shd(hair, 0.45));
    x.fill(p);
    // Strands.
    x.save();
    x.clip(p);
    x.strokeStyle = css(lit(hair, 0.45), 0.25);
    x.lineWidth = 0.5;
    for (let i = 0; i < 70; i++) {
      const px = cx - hw + hash2(i, style, 17) * hw * 2, py = top - 4 + hash2(i, style, 19) * 34;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + 3, py + 4, px + 1, py + 9);
      x.stroke();
    }
    x.restore();
  };
  if (style === 5) {
    // Bald: a shine on the crown.
    blob(x, cx - 8, top + 8, 10, 6, [255, 245, 230], 0.25);
    return;
  }
  if (style === 6) {
    // Shaved close: a shadow of hair over the skull.
    const p = new Path2D();
    p.moveTo(X(-1), 44);
    p.bezierCurveTo(X(-1), 24, X(-0.6), top - 1, cx, top - 1);
    p.bezierCurveTo(X(0.6), top - 1, X(1.02), 24, X(1.02), 44);
    p.quadraticCurveTo(X(0.7), 33, fx, 33);
    p.quadraticCurveTo(X(-0.7), 33, X(-1), 44);
    x.fillStyle = css(hair, 0.55);
    x.fill(p);
    return;
  }
  if (style === 8) {
    // Curls or an afro: a big round crown.
    const r = hw * 1.18;
    x.fillStyle = radial(x, cx - 10, top + 6, 2, r * 1.2, lit(hair, 0.2), hair, shd(hair, 0.5));
    x.beginPath();
    x.ellipse(cx, top + 16, r, r * 0.78, 0, Math.PI * 0.95, Math.PI * 2.05);
    x.fill();
    for (let i = 0; i < 80; i++) {
      const a = Math.PI + hash2(i, 3, 23) * Math.PI, rr = r * (0.6 + hash2(i, 4, 23) * 0.42);
      blob(x, cx + Math.cos(a) * rr, top + 16 + Math.sin(a) * rr * 0.78, 2.6, 2.6, lit(hair, 0.35), 0.3);
    }
    return;
  }
  // Everyone else: a cap of hair over the crown, the hairline across the forehead, sideburns.
  const hl = style === 1 ? 31 : style === 4 ? 30 : 29;
  const p = new Path2D();
  p.moveTo(X(-1.04), 58);
  p.bezierCurveTo(X(-1.14), 30, X(-0.68), top - 4, cx, top - 4);
  p.bezierCurveTo(X(0.7), top - 4, X(1.16), 30, X(1.05), 58);
  p.lineTo(X(0.92), 56);
  if (style === 2) {
    // A side part: the fringe swept across.
    p.bezierCurveTo(X(0.9), 38, X(0.4), hl + 4, fx + 6, hl - 2);
    p.bezierCurveTo(fx - 4, hl + 6, X(-0.6), hl + 2, X(-0.9), 56);
  } else {
    p.bezierCurveTo(X(0.9), 40, X(0.5), hl, fx, hl);
    p.bezierCurveTo(X(-0.5), hl, X(-0.9), 40, X(-0.93), 56);
  }
  p.closePath();
  fill(p);
  if (style === 9) {
    // A mohawk: a crest of hair down the middle, the sides shaved.
    const m = new Path2D();
    m.moveTo(cx - 6, top + 6);
    m.quadraticCurveTo(cx - 4, top - 14, cx + 2, top - 16);
    m.quadraticCurveTo(cx + 8, top - 12, cx + 7, top + 6);
    m.closePath();
    fill(m);
  }
  if (style === 7) {
    // A ponytail (or a bun, for the mechanics and marines).
    x.fillStyle = radial(x, X(1.1), top + 6, 1, 12, lit(hair, 0.25), hair, shd(hair, 0.5));
    x.beginPath();
    if (role === 'mechanic') x.ellipse(X(0.9), top + 6, 7, 6, 0, 0, Math.PI * 2);
    else x.ellipse(X(1.12), top + 26, 5, 14, -0.3, 0, Math.PI * 2);
    x.fill();
  }
}

function gear(x: CanvasRenderingContext2D, role: string, L: Look, cx: number, top: number, fx: number, hw: number, X: (u: number) => number, eyeL: number, eyeR: number, ey: number, rc: RGB): void {
  void L;
  switch (role) {
    case 'marine':
    case 'gunner': {
      // A combat helmet: the shell, its rim, a strap; the marine's visor pushed up and glowing.
      const shell: RGB = role === 'marine' ? [70, 84, 58] : [74, 78, 86];
      x.fillStyle = radial(x, cx - 12, top + 2, 2, hw * 1.6, lit(shell, 0.35), shell, shd(shell, 0.55));
      x.beginPath();
      x.moveTo(X(-1.16), 50);
      x.bezierCurveTo(X(-1.22), 20, X(-0.66), top - 9, cx, top - 9);
      x.bezierCurveTo(X(0.7), top - 9, X(1.24), 20, X(1.18), 50);
      x.quadraticCurveTo(fx, 34, X(-1.16), 50);
      x.fill();
      x.strokeStyle = css(shd(shell, 0.7));
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(X(-1.14), 49);
      x.quadraticCurveTo(fx, 33, X(1.16), 49);
      x.stroke();
      x.strokeStyle = 'rgba(20,20,20,0.8)';
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(X(-0.95), 52);
      x.quadraticCurveTo(X(-0.8), 80, fx - 4, 90);
      x.stroke();
      if (role === 'marine') {
        x.fillStyle = 'rgba(20,30,40,0.9)';
        x.fillRect(X(-0.8), 30, X(0.82) - X(-0.8), 6);
        x.fillStyle = css(mix(rc, [255, 255, 255], 0.3), 0.9);
        x.fillRect(X(-0.7), 32, X(0.7) - X(-0.7), 1.6);
      }
      break;
    }
    case 'engineer': {
      // Goggles on the forehead: strap, frames, lenses catching the light.
      x.fillStyle = '#2a2018';
      x.fillRect(X(-1.05), 31, X(1.07) - X(-1.05), 5);
      for (const gx of [eyeL, eyeR]) {
        x.fillStyle = '#3a3e46';
        x.beginPath();
        x.ellipse(gx, 33, 7, 5.6, 0, 0, Math.PI * 2);
        x.fill();
        const g = x.createRadialGradient(gx - 2, 31, 0.5, gx, 33, 5);
        g.addColorStop(0, '#d8fbff');
        g.addColorStop(0.4, '#4dd0e1');
        g.addColorStop(1, '#10505a');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(gx, 33, 5, 4, 0, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'driver': {
      // A headset: the band over the top, the cups, the boom mic.
      x.strokeStyle = '#2a2e38';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(X(-1.05), 56);
      x.bezierCurveTo(X(-1.1), top - 8, X(1.1), top - 8, X(1.08), 56);
      x.stroke();
      for (const [ex2, k] of [[X(1.08), 1], [X(-1.02), 0.7]] as [number, number][]) {
        x.fillStyle = radial(x, ex2 - 1, 56, 0.5, 8, [90, 96, 110], [48, 52, 62], [24, 26, 32]);
        x.beginPath();
        x.ellipse(ex2, 58, 5 * k, 8, 0, 0, Math.PI * 2);
        x.fill();
      }
      x.strokeStyle = '#2a2e38';
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(X(1.05), 64);
      x.quadraticCurveTo(X(0.9), 82, fx + 10, 80);
      x.stroke();
      x.fillStyle = '#1a1c22';
      x.beginPath();
      x.ellipse(fx + 10, 80, 2.4, 1.8, 0, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'scientist': {
      // Glasses: thin frames, lenses with a reflection.
      x.strokeStyle = '#c8ccd4';
      x.lineWidth = 1;
      for (const gx of [eyeL, eyeR]) {
        x.beginPath();
        x.roundRect(gx - 7, ey - 5, 14, 10, 3);
        x.stroke();
        x.fillStyle = 'rgba(190,230,255,0.18)';
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.5)';
        x.beginPath();
        x.moveTo(gx - 4, ey + 3);
        x.lineTo(gx + 1, ey - 4);
        x.stroke();
        x.strokeStyle = '#c8ccd4';
      }
      x.beginPath();
      x.moveTo(eyeL + 7, ey - 1);
      x.quadraticCurveTo(fx, ey - 3, eyeR - 7, ey - 1);
      x.stroke();
      break;
    }
    case 'mechanic':
    case 'quartermaster': {
      // A cap (a mechanic's worn backwards).
      const cc: RGB = role === 'mechanic' ? [184, 76, 34] : [80, 96, 112];
      x.fillStyle = radial(x, cx - 10, top, 1, hw * 1.4, lit(cc, 0.3), cc, shd(cc, 0.55));
      x.beginPath();
      x.moveTo(X(-1.08), 36);
      x.bezierCurveTo(X(-1.1), top - 6, X(1.1), top - 6, X(1.1), 36);
      x.quadraticCurveTo(fx, 30, X(-1.08), 36);
      x.fill();
      x.fillStyle = css(shd(cc, 0.4));
      if (role === 'mechanic') {
        x.beginPath();
        x.ellipse(X(0.95), 30, 9, 3, 0.4, 0, Math.PI * 2);
        x.fill();
      } else {
        x.beginPath();
        x.ellipse(fx - 4, 36, 18, 4, -0.08, 0, Math.PI);
        x.fill();
      }
      break;
    }
    case 'medic': {
      x.fillStyle = '#f0f0ea';
      x.fillRect(X(-1.04), 30, X(1.06) - X(-1.04), 6);
      x.fillStyle = '#d02020';
      x.fillRect(fx - 2, 29, 4, 8);
      x.fillRect(fx - 4, 31, 8, 4);
      break;
    }
    case 'scavenger': {
      // A scarf pulled down round the neck.
      x.fillStyle = grad(x, 30, 84, 100, 104, [150, 130, 100], [80, 66, 50]);
      x.beginPath();
      x.moveTo(fx - 26, 90);
      x.quadraticCurveTo(fx, 106, fx + 28, 90);
      x.lineTo(fx + 24, 102);
      x.quadraticCurveTo(fx, 114, fx - 22, 102);
      x.closePath();
      x.fill();
      break;
    }
    default:
  }
}
