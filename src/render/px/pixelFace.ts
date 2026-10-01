/**
 * Portraits as true pixel art: a 64 x 64 head-and-shoulders, built pixel by pixel. Every material (skin, hair, cloth,
 * metal) gets a five-step ramp that shifts cool and purple into its shadows and warm into its lights; volumes are lit
 * from the upper left and posterised onto the ramp, a rim of the person's colour catches them from the right, and
 * each shape is outlined in the darkest step of its own ramp where it meets what's behind it (a selective outline).
 *
 * The head is a skull and a jaw (square, round or narrow), ears, a neck; eyes with lids, irises, pupils and a glint;
 * brows that frown or lift; a nose by its shadow; lips that talk, grin or grimace. Hair in ten cuts (crew cut, side
 * part, long, ponytail, bun, mohawk, afro, bald, buzz, curls), beards, moustaches, goatees and stubble, scars,
 * eyepatches, cybernetic eyes, freckles, war paint, and the gear of the trade: a marine's helmet, a gunner's goggled
 * helmet, an engineer's goggles, a driver's headset, a scientist's glasses, a mechanic's cap, a medic's headband, an
 * officer's peaked cap, a quartermaster's beret, a scavenger's hood. Story characters can set any of it, and can be
 * machines (a steel skull with burning eyes), hooded figures (a shadow under the cowl, two lights in it) or ghouls.
 */

export type HairStyle = 'crew' | 'part' | 'long' | 'pony' | 'bun' | 'mohawk' | 'afro' | 'bald' | 'buzz' | 'curls';
export type Gear = 'none' | 'helmet' | 'gunhelm' | 'goggles' | 'headset' | 'glasses' | 'cap' | 'band' | 'officer' | 'beret' | 'hood';
export type Beard = 'none' | 'stubble' | 'full' | 'moustache' | 'goatee';

export interface PixelLook {
  kind: 'human' | 'machine' | 'hooded' | 'ghoul';
  skin: string;
  hair: string;
  eye: string;
  style: HairStyle;
  jaw: 'square' | 'round' | 'narrow';
  beard: Beard;
  gear: Gear;
  scar: boolean;
  patch: boolean;
  cyber: boolean;
  freckles: boolean;
  /** War paint colour, or none. */
  paint: string | null;
  /** Brows: -1 scowling .. 1 raised. */
  brow: number;
  age: number;
  /** Clothes colour (defaults to the role colour, darkened). */
  cloth?: string;
}

export interface PixelFaceSpec {
  seed: number;
  role: string;
  roleColor: string;
  rarityColor: string;
  hair?: string;
  accent?: string;
  look?: Partial<PixelLook>;
}

export interface PixelMood {
  mouth?: number;
  look?: number;
  blink?: boolean;
  grin?: boolean;
  hurt?: number;
}

export const FACE_PX = 64;

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const css = (c: RGB): string => `rgb(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A five-step ramp: outline, shadow, base, light, highlight (hue-shifted: cool shadows, warm lights). */
function ramp(base: string, warm = false): string[] {
  const b = hex(base);
  const dark: RGB = warm ? [70, 22, 40] : [22, 18, 48];
  const lite: RGB = [255, 236, 190];
  return [css(mix(b, dark, 0.78)), css(mix(b, dark, 0.38)), css(b), css(mix(b, lite, 0.28)), css(mix(b, lite, 0.55))];
}

function rng(seed: number): () => number {
  let s = (Math.abs(seed) * 9301 + 49297) | 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const SKINS = ['#f2c9a4', '#e8b38a', '#d49a6c', '#b97a4e', '#94603c', '#734428', '#583220', '#f6d8bf'];
const HAIRS = ['#1a1412', '#33231a', '#563824', '#7e5130', '#b07a40', '#dcb468', '#8e2c18', '#a8a49c', '#e4e0d8', '#2a2a40'];
const EYES = ['#5a3a1e', '#3a62a0', '#3e7a46', '#7a5a2a', '#2e2e34', '#5a8aa8'];
const STYLES: HairStyle[] = ['crew', 'part', 'long', 'pony', 'bun', 'mohawk', 'afro', 'bald', 'buzz', 'curls'];
const ROLE_GEAR: Record<string, Gear> = {
  marine: 'helmet', gunner: 'gunhelm', engineer: 'goggles', driver: 'headset', scientist: 'glasses', mechanic: 'cap', medic: 'band', officer: 'officer', quartermaster: 'beret', scavenger: 'hood',
};

/** What a person looks like, from their seed and role (anything set in the spec wins). */
export function lookFor(spec: PixelFaceSpec): PixelLook {
  const r = rng(spec.seed * 7 + 13);
  const fem = r() < 0.42;
  const style = fem ? (['long', 'pony', 'bun', 'part', 'curls', 'afro', 'crew', 'buzz'] as HairStyle[])[Math.floor(r() * 8)] : STYLES[Math.floor(r() * STYLES.length)];
  const beardRoll = r();
  const look: PixelLook = {
    kind: 'human',
    skin: SKINS[Math.floor(r() * SKINS.length)],
    hair: spec.hair ?? HAIRS[Math.floor(r() * HAIRS.length)],
    eye: EYES[Math.floor(r() * EYES.length)],
    style,
    jaw: fem ? (r() < 0.6 ? 'narrow' : 'round') : (['square', 'square', 'round', 'narrow'] as const)[Math.floor(r() * 4)],
    beard: fem ? 'none' : beardRoll < 0.45 ? 'none' : beardRoll < 0.65 ? 'stubble' : beardRoll < 0.8 ? 'full' : beardRoll < 0.9 ? 'moustache' : 'goatee',
    gear: ROLE_GEAR[spec.role] ?? 'none',
    scar: r() < 0.16,
    patch: r() < 0.06,
    cyber: r() < 0.06,
    freckles: r() < 0.15,
    paint: null,
    brow: (r() - 0.5) * 1.2,
    age: r(),
  };
  if (r() < 0.25 && look.gear !== 'none' && spec.role !== 'officer') look.gear = 'none';
  return { ...look, ...spec.look };
}

/** Paints a 64 x 64 portrait. */
export function paintPixelFace(spec: PixelFaceSpec, mood: PixelMood = {}, panel = true): HTMLCanvasElement {
  const N = FACE_PX;
  const L = lookFor(spec);
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const x = cv.getContext('2d')!;
  // The picture is built in a colour buffer and a layer buffer (for the outlines).
  const col: (string | null)[] = new Array(N * N).fill(null);
  const lay = new Int8Array(N * N).fill(-1);
  const rampOf: string[][] = [];
  const set = (px: number, py: number, c: string, layer = -2): void => {
    px = Math.round(px);
    py = Math.round(py);
    if (px < 0 || py < 0 || px >= N || py >= N) return;
    col[py * N + px] = c;
    if (layer !== -2) lay[py * N + px] = layer;
  };
  const get = (px: number, py: number): number => (px < 0 || py < 0 || px >= N || py >= N ? -1 : lay[py * N + px]);
  // A lit volume: `inside` says whether a pixel is in it and gives its local normal (nx, ny in -1..1).
  const volume = (layer: number, rp: string[], inside: (px: number, py: number) => [number, number] | null, rim = 0, tex?: (px: number, py: number) => number): void => {
    rampOf[layer] = rp;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const n = inside(px, py);
        if (!n) continue;
        let I = 0.62 - n[0] * 0.42 - n[1] * 0.32 + (tex ? tex(px, py) : 0);
        const t = I > 0.98 ? 4 : I > 0.66 ? 3 : I > 0.3 ? 2 : 1;
        let c = rp[t];
        if (rim && n[0] > 0.9 && n[1] < 0.7 && t >= 2) c = rimC;
        set(px, py, c, layer);
      }
    }
  };
  const r = rng(spec.seed * 31 + 7);
  const role = hex(spec.roleColor);
  const rimC = css(mix(role, [255, 240, 220], 0.2));
  const skinR = L.kind === 'ghoul' ? ramp('#9aa88a', true) : L.kind === 'machine' ? ramp('#7a8494') : ramp(L.skin, true);
  const hairR = ramp(L.hair);
  const clothBase = L.cloth ?? css(mix(role, [74, 78, 90], 0.58));
  const clothR = ramp(clothBase);
  const metalR = ramp('#6a7484');
  const look = mood.look ?? 0;

  /* ---- Background panel: the role's colour in bands, scanlines, a vignette ---- */
  if (panel) {
    for (let py = 0; py < N; py++) {
      const t = py / N;
      const band = t < 0.34 ? 0.34 : t < 0.68 ? 0.26 : 0.18;
      for (let px = 0; px < N; px++) {
        const v = Math.hypot((px - 32) / 40, (py - 28) / 40);
        let c = mix([10, 12, 20], role, band * (1 - v * 0.5));
        if (py % 2) c = mix(c, [0, 0, 0], 0.12);
        set(px, py, css(c));
      }
    }
  }

  /* ---- Head geometry ---- */
  const cx = 32 + Math.round(look * 0.6);
  const top = 9, cheek = 27, chin = L.jaw === 'narrow' ? 46 : 45;
  const rx = L.kind === 'machine' ? 15 : 13 + (L.jaw === 'square' ? 1 : 0);
  const jawK = L.jaw === 'square' ? 0.8 : L.jaw === 'round' ? 0.64 : 0.46;
  const halfW = (py: number): number => {
    if (py < top || py > chin) return -1;
    if (py <= cheek) {
      const t = (py - cheek) / (cheek - top);
      return rx * Math.sqrt(Math.max(0, 1 - t * t));
    }
    const t = (py - cheek) / (chin - cheek);
    let w = rx * (1 - (1 - jawK) * Math.pow(t, 1.4));
    if (py > chin - 3) w *= 1 - (py - (chin - 3)) * 0.18;
    return w;
  };
  const inHead = (px: number, py: number): [number, number] | null => {
    const w = halfW(py);
    if (w <= 0) return null;
    const dx = px + 0.5 - cx;
    if (Math.abs(dx) > w) return null;
    return [dx / w, (py - 26) / 19];
  };

  /* ---- Long hair, afros and hoods behind the head ---- */
  const hairTex = (px: number, py: number): number => ((px * 7 + Math.floor(py / 3) * 3) % 5 === 0 ? -0.22 : 0) + (r() - 0.5) * 0.05;
  if (L.kind === 'hooded') {
    volume(1, ramp('#2a2430'), (px, py) => {
      const dx = (px - cx) / 18, dy = (py - 30) / 24;
      if (dx * dx + dy * dy > 1 || py > 56) return null;
      return [dx, dy];
    });
  } else if (L.style === 'long' || L.style === 'curls') {
    volume(1, hairR, (px, py) => {
      if (py < top || py > 50) return null;
      const w = (halfW(Math.min(py, cheek)) || rx) + 3 + (L.style === 'curls' ? Math.sin(py * 1.3) * 1.2 : 0);
      const dx = px + 0.5 - cx;
      if (Math.abs(dx) > w) return null;
      return [dx / w, (py - 30) / 22];
    }, 0, hairTex);
  } else if (L.style === 'afro') {
    volume(1, hairR, (px, py) => {
      const dx = (px + 0.5 - cx) / 18, dy = (py - 22) / 15;
      const bump = Math.sin(Math.atan2(dy, dx) * 9) * 0.05;
      return dx * dx + dy * dy <= 1 + bump ? [dx, dy] : null;
    }, 0, hairTex);
  }

  /* ---- Shoulders and the uniform ---- */
  volume(2, clothR, (px, py) => {
    if (py < 49) return null;
    const t = Math.min(1, (py - 49) / 8);
    const w = 15 + Math.sqrt(t) * 16;
    const dx = px + 0.5 - 32;
    if (Math.abs(dx) > w) return null;
    return [(dx / w) * 0.45, -0.6 + (py - 49) / 22];
  }, 1);
  // Collar and the front of the uniform: a V of shirt or a high collar, straps, rank pips, the accent badge.
  // The collar round the neck, an undershirt in the V, lapels, shoulder seams, the role's stripe and rank pips.
  const shirt = css(mix(role, [210, 210, 205], 0.6));
  for (let py = 49; py < 58; py++) {
    const v = Math.round((py - 49) * 0.7);
    for (let px = cx - v; px <= cx + v; px++) set(px, py, py === 49 ? clothR[0] : shirt);
    set(cx - v - 1, py, clothR[4]);
    set(cx + v + 1, py, clothR[1]);
    set(cx - v - 2, py, clothR[3]);
  }
  for (let px = cx - 8; px <= cx + 8; px++) if (Math.abs(px - cx) > 4) {
    set(px, 49, clothR[3]);
    set(px, 50, clothR[1]);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) set(32 + s * (22 + k), 52 + Math.floor(k * 0.6), clothR[1]);
  for (let px = 10; px < 22; px++) set(px, 59, spec.roleColor);
  for (let i = 0; i < 3; i++) {
    set(41 + i * 3, 56, spec.rarityColor);
    set(41 + i * 3, 57, css(mix(hex(spec.rarityColor), [0, 0, 0], 0.4)));
  }
  if (spec.accent) {
    for (let py = 56; py < 59; py++) for (let px = 23; px < 26; px++) set(px, py, spec.accent);
    set(23, 56, '#ffffff');
  }

  /* ---- Neck, ears, head ---- */
  volume(3, skinR, (px, py) => {
    if (py < 38 || py > 51) return null;
    const dx = px + 0.5 - cx;
    if (Math.abs(dx) > 7) return null;
    return [dx / 7, py < 47 ? 0.9 : 0.3];
  });
  if (L.kind !== 'machine' && L.style !== 'afro' && L.gear !== 'hood' && L.kind !== 'hooded') {
    for (const s of [-1, 1]) {
      volume(4 + (s > 0 ? 1 : 0), skinR, (px, py) => {
        if (py < 24 || py > 34) return null;
        const ex = cx + s * (rx + 0.5);
        const dx = (px + 0.5 - ex) / 2.4, dy = (py - 29) / 5;
        return dx * dx + dy * dy <= 1 ? [s * 0.6, dy] : null;
      });
    }
  }
  volume(6, skinR, inHead, 1, L.kind === 'machine' ? (px, py) => ((px + py) % 6 === 0 ? -0.15 : 0) : undefined);
  // Under the chin, onto the neck.
  for (let px = cx - 5; px <= cx + 5; px++) {
    set(px, chin + 1, skinR[0]);
    set(px, chin + 2, skinR[1]);
  }

  /* ---- The face ---- */
  const eyeY = 27;
  const eyes: [number, number][] = [[cx - 6, eyeY], [cx + 6, eyeY]];
  if (L.kind === 'machine') {
    // A steel skull: plates, a grille for a mouth, eyes burning in their sockets.
    for (let py = top + 4; py < chin; py += 6) for (let px = cx - rx + 2; px < cx + rx - 1; px++) if (inHead(px, py)) set(px, py, metalR[0]);
    for (const [ex, ey] of eyes) {
      for (let px = ex - 2; px <= ex + 2; px++) for (let py = ey - 1; py <= ey + 1; py++) set(px, py, '#140608');
      set(ex - 1, ey, '#ff3a20');
      set(ex, ey, '#ffd060');
      set(ex + 1, ey, '#ff3a20');
    }
    for (let px = cx - 4; px <= cx + 4; px++) for (let py = 37; py <= 40; py++) set(px, py, (px + py) % 2 ? metalR[0] : metalR[3]);
  } else if (L.kind === 'hooded') {
    // Nothing of the face but shadow and two lights.
    for (let py = top - 2; py < chin + 2; py++) for (let px = cx - 13; px <= cx + 13; px++) if (inHead(px, py) || (py < 34 && Math.abs(px - cx) < 13)) set(px, py, py < 22 ? '#120e16' : '#1a1420');
    for (const [ex, ey] of eyes) {
      set(ex, ey, L.eye);
      set(ex + 1, ey, L.eye);
      set(ex, ey - 1, '#ffffff');
    }
  } else {
    // Brows (scowling pulls the inner ends down).
    for (const [i, [ex]] of eyes.entries()) {
      const inner = i === 0 ? 1 : -1;
      for (let k = -3; k <= 2; k++) {
        const px = ex + k * (i === 0 ? 1 : -1) * -1;
        const lift = Math.round(-L.brow * (k * inner > 0 ? 1 : 0) * 0.8);
        set(px, eyeY - 4 + lift, hairR[0]);
        if (k > -3 && k < 2) set(px, eyeY - 3 + lift, hairR[1]);
      }
    }
    // Eyes: socket shadow, white, iris, pupil, glint, the upper lid.
    for (const [i, [ex, ey]] of eyes.entries()) {
      if (L.patch && i === 1) continue;
      for (let px = ex - 2; px <= ex + 2; px++) set(px, ey - 2, skinR[1]);
      if (mood.blink || (mood.hurt ?? 0) > 0.5) {
        for (let px = ex - 2; px <= ex + 2; px++) set(px, ey, skinR[0]);
        continue;
      }
      for (let px = ex - 2; px <= ex + 2; px++) {
        set(px, ey - 1, skinR[0]);
        set(px, ey, '#ece6dc');
        set(px, ey + 1, '#cfc6bc');
      }
      const ix = ex + Math.round(look * 1.2);
      const irisC = L.cyber && i === 0 ? '#ff2a20' : L.eye;
      set(ix, ey, irisC);
      set(ix - 1, ey, irisC);
      set(ix, ey + 1, irisC);
      set(ix - 1, ey + 1, css(mix(hex(irisC), [0, 0, 0], 0.3)));
      set(ix - 1, ey, '#0c0a0c');
      set(ix, ey, L.cyber && i === 0 ? '#ffd0a0' : '#ffffff');
      set(ex + 2, ey + 1, skinR[1]);
    }
    if (L.cyber) {
      const [ex, ey] = eyes[0];
      for (let px = ex - 3; px <= ex + 3; px++) {
        set(px, ey - 3, metalR[3]);
        set(px, ey + 3, metalR[1]);
      }
      set(ex - 3, ey, metalR[2]);
      set(ex + 3, ey + 1, metalR[2]);
    }
    if (L.patch) {
      const [ex, ey] = eyes[1];
      for (let px = ex - 3; px <= ex + 3; px++) for (let py = ey - 2; py <= ey + 2; py++) if (Math.abs(px - ex) + Math.abs(py - ey) < 5) set(px, py, '#141016');
      for (let k = -14; k <= 14; k++) set(cx + k, eyeY - 5 - Math.round(k * 0.35), '#141016');
    }
    // Nose: the shadow down the far side of the bridge, the nostrils, a lit tip.
    for (let py = eyeY + 1; py <= eyeY + 6; py++) set(cx + 1, py, skinR[1]);
    set(cx - 1, eyeY + 6, skinR[3]);
    set(cx - 2, eyeY + 7, skinR[1]);
    set(cx + 2, eyeY + 7, skinR[0]);
    set(cx, eyeY + 7, skinR[1]);
    // Cheekbones' shadow on the far side, smile lines with age.
    for (let py = eyeY + 3; py <= eyeY + 8; py++) set(cx + 8, py, skinR[1]);
    if (L.age > 0.7) {
      set(cx - 4, eyeY + 8, skinR[1]);
      set(cx + 4, eyeY + 8, skinR[1]);
      set(cx - 7, eyeY - 1, skinR[1]);
    }
    // The mouth.
    const my = 38;
    const lip = L.kind === 'ghoul' ? '#5a3a40' : css(mix(hex(L.skin), [150, 50, 60], 0.45));
    const open = Math.round((mood.mouth ?? 0) * 3);
    if (mood.grin) {
      for (let px = cx - 4; px <= cx + 4; px++) set(px, my, '#f4efe4');
      for (let px = cx - 4; px <= cx + 4; px++) set(px, my + 1, '#3a1416');
      set(cx - 5, my - 1, skinR[0]);
      set(cx + 5, my - 1, skinR[0]);
      for (let px = cx - 4; px <= cx + 4; px++) set(px, my - 1, skinR[0]);
    } else if (open > 0) {
      for (let px = cx - 3; px <= cx + 3; px++) for (let py = my; py < my + open + 1; py++) set(px, py, py === my && open > 1 ? '#efe8dc' : '#2a1012');
      for (let px = cx - 2; px <= cx + 2; px++) set(px, my + open + 1, lip);
    } else {
      for (let px = cx - 3; px <= cx + 3; px++) set(px, my, skinR[0]);
      for (let px = cx - 2; px <= cx + 2; px++) set(px, my + 1, lip);
      if (L.brow < -0.3) {
        set(cx - 4, my + 1, skinR[0]);
        set(cx + 4, my + 1, skinR[0]);
      }
    }
    // Facial hair.
    const beardIn = (px: number, py: number): boolean => {
      if (!inHead(px, py)) return false;
      if (L.beard === 'full') return py >= my - 3 && !(py >= my - 1 && py <= my + 1 && Math.abs(px - cx) <= 3) && (py > my + 1 || Math.abs(px - cx) > 3 || py === my - 2);
      if (L.beard === 'moustache') return py >= my - 2 && py <= my - 1 && Math.abs(px - cx) <= 5;
      if (L.beard === 'goatee') return (py >= my + 2 && Math.abs(px - cx) <= 3) || (py === my - 1 && Math.abs(px - cx) <= 4);
      if (L.beard === 'stubble') return py >= my - 3 && Math.abs(px - cx) >= 2 && (px + py) % 2 === 0;
      return false;
    };
    if (L.beard === 'stubble') {
      for (let py = my - 4; py <= chin + 1; py++) for (let px = cx - rx; px <= cx + rx; px++) if (beardIn(px, py)) set(px, py, skinR[1]);
    } else if (L.beard !== 'none') {
      volume(10, hairR, (px, py) => {
        if (!beardIn(px, py)) return null;
        const n = inHead(px, py)!;
        return [n[0], 0.1 + n[1] * 0.5];
      }, 0, hairTex);
    }
    // Scars, freckles, paint, ghoul rot.
    if (L.scar) for (let k = 0; k < 9; k++) set(cx - 9 + Math.round(k * 0.4), eyeY - 5 + k, k % 2 ? '#e8a8a0' : '#b06060');
    if (L.freckles) for (let k = 0; k < 10; k++) set(cx + (k % 2 ? -1 : 1) * (4 + Math.floor(r() * 4)), eyeY + 3 + Math.floor(r() * 3), skinR[1]);
    if (L.paint) for (const [ex, ey] of eyes) for (let k = 0; k < 3; k++) set(ex - 1 + k, ey + 3 + k, L.paint);
    if (L.kind === 'ghoul') {
      for (const [ex, ey] of eyes) for (let px = ex - 3; px <= ex + 3; px++) set(px, ey + 2, '#3e4a36');
      for (let k = 0; k < 6; k++) set(cx - 6 + Math.floor(r() * 12), 33 + Math.floor(r() * 9), '#4e5a3e');
    }
    if ((mood.hurt ?? 0) > 0.2) {
      set(cx - 7, eyeY - 6, '#c01818');
      set(cx - 7, eyeY - 5, '#901010');
      set(cx - 6, eyeY - 4, '#c01818');
    }
  }

  /* ---- Hair (front) ---- */
  const hairFront = (inside: (px: number, py: number) => boolean): void => {
    volume(7, hairR, (px, py) => {
      if (!inside(px, py)) return null;
      const w = Math.max(1, halfW(Math.max(top, Math.min(py, cheek))) + 2);
      return [(px + 0.5 - cx) / w, (py - 18) / 12];
    }, 0, hairTex);
  };
  const scalp = (px: number, py: number, line: number, extra = 1): boolean => {
    if (py < top - extra || py > line) return false;
    const w = (halfW(Math.max(top, py)) || 0) + extra;
    return Math.abs(px + 0.5 - cx) <= w && (py < line - 1 || Math.abs(px + 0.5 - cx) > 5 || py < line);
  };
  if (L.kind === 'human' || L.kind === 'ghoul') {
    switch (L.style) {
      case 'crew':
        hairFront((px, py) => scalp(px, py, 19, 1) || (py <= 25 && Math.abs(px + 0.5 - cx) >= rx - 1 && Math.abs(px + 0.5 - cx) <= rx + 1 && py >= 19));
        break;
      case 'part':
        hairFront((px, py) => scalp(px, py, 19, 2) || (py >= 19 && py <= 22 && px + 0.5 - cx < -1 && px + 0.5 - cx > -10 + (py - 19) * 2) || (py <= 26 && Math.abs(px + 0.5 - cx) >= rx && Math.abs(px + 0.5 - cx) <= rx + 1 && py >= 19));
        for (let py = top - 1; py < 19; py++) set(cx - 4, py, hairR[0]);
        break;
      case 'long':
      case 'curls':
        hairFront((px, py) => scalp(px, py, 20, 2) || (py >= 20 && py <= 42 && Math.abs(px + 0.5 - cx) >= rx - 1 && Math.abs(px + 0.5 - cx) <= rx + 3));
        break;
      case 'pony':
        hairFront((px, py) => scalp(px, py, 19, 1));
        volume(8, hairR, (px, py) => (py >= 18 && py <= 44 && px >= cx + rx + 1 && px <= cx + rx + 4 - Math.floor((py - 18) / 14) ? [0.8, (py - 30) / 14] : null), 0, hairTex);
        break;
      case 'bun':
        hairFront((px, py) => scalp(px, py, 19, 1));
        volume(8, hairR, (px, py) => {
          const dx = (px + 0.5 - cx) / 5, dy = (py - (top - 3)) / 4;
          return dx * dx + dy * dy <= 1 ? [dx, dy] : null;
        }, 0, hairTex);
        break;
      case 'mohawk':
        for (let py = top; py < 22; py++) for (let px = cx - rx; px <= cx + rx; px++) if (inHead(px, py) && (px + py) % 2 === 0) set(px, py, hairR[1]);
        hairFront((px, py) => py >= top - 7 + Math.abs(Math.sin(px * 1.2)) * 2 && py <= 22 && Math.abs(px + 0.5 - cx) <= 3);
        break;
      case 'afro':
        hairFront((px, py) => scalp(px, py, 18, 3));
        break;
      case 'buzz':
        for (let py = top; py < 20; py++) for (let px = cx - rx; px <= cx + rx; px++) if (inHead(px, py) && (px * 3 + py) % 3 !== 0) set(px, py, py < 15 ? hairR[2] : hairR[1]);
        break;
      case 'bald':
        set(cx - 5, top + 3, skinR[4]);
        set(cx - 4, top + 3, skinR[4]);
        set(cx - 6, top + 4, skinR[4]);
        break;
    }
  }

  /* ---- Gear ---- */
  const helmet = (shell: string, goggles: boolean): void => {
    const hr = ramp(shell);
    volume(9, hr, (px, py) => {
      if (py < top - 3 || py > 22) return null;
      const w = (halfW(Math.max(top, py)) || rx * 0.5) + 2;
      const dx = px + 0.5 - cx;
      if (Math.abs(dx) > w) return null;
      return [dx / w, (py - 14) / 10];
    }, 1);
    for (let px = cx - rx - 2; px <= cx + rx + 2; px++) {
      set(px, 22, hr[0]);
      set(px, 21, hr[3]);
    }
    for (let py = 23; py < chin - 2; py++) {
      set(cx - rx - 1, py, hr[1]);
      set(cx + rx + 1, py, hr[1]);
    }
    if (goggles) for (const s of [-1, 1]) {
      for (let px = cx + s * 5 - 2; px <= cx + s * 5 + 2; px++) for (let py = 16; py <= 19; py++) set(px, py, py === 16 ? '#ffe0a0' : '#c87a20');
      set(cx + s * 5 - 2, 16, '#ffffff');
    }
  };
  switch (L.kind === 'human' || L.kind === 'ghoul' ? L.gear : 'none') {
    case 'helmet':
      helmet('#55603e', false);
      break;
    case 'gunhelm':
      helmet('#4a4e56', true);
      break;
    case 'goggles':
      for (let px = cx - rx - 1; px <= cx + rx + 1; px++) set(px, 19, '#3a2a1a');
      for (const s of [-1, 1]) {
        for (let px = cx + s * 5 - 3; px <= cx + s * 5 + 3; px++) for (let py = 16; py <= 21; py++) {
          const d = Math.hypot(px - (cx + s * 5), py - 18.5);
          if (d <= 3.2) set(px, py, d > 2.3 ? '#b8862e' : py < 18 ? '#9ae0ff' : '#3a8ab8');
        }
        set(cx + s * 5 - 1, 17, '#ffffff');
      }
      break;
    case 'headset':
      for (let k = -rx - 1; k <= rx + 1; k++) set(cx + k, top - 2 + Math.round((k * k) / (rx * 3)), '#2a2e36');
      for (const s of [-1, 1]) for (let py = 26; py <= 32; py++) for (let px = 0; px < 3; px++) set(cx + s * (rx + px), py, py === 26 || py === 32 ? '#1a1c22' : px === 1 ? (py < 29 ? '#7a8496' : '#4a5262') : '#2a2e38');
      for (let k = 0; k < 7; k++) set(cx - rx - 1 + k, 34 + Math.round(k * 0.4), '#2a2e36');
      set(cx - rx + 6, 37, '#ff4030');
      break;
    case 'glasses':
      for (const [ex, ey] of eyes) {
        for (let px = ex - 3; px <= ex + 3; px++) {
          set(px, ey - 2, '#1a1a1e');
          set(px, ey + 2, '#1a1a1e');
        }
        set(ex - 3, ey - 1, '#1a1a1e');
        set(ex - 3, ey, '#1a1a1e');
        set(ex - 3, ey + 1, '#1a1a1e');
        set(ex + 3, ey - 1, '#1a1a1e');
        set(ex + 3, ey, '#1a1a1e');
        set(ex + 3, ey + 1, '#1a1a1e');
        set(ex - 2, ey - 1, '#d8f0ff');
      }
      set(cx, eyeY - 1, '#1a1a1e');
      break;
    case 'cap': {
      const cr = ramp('#d0a020');
      volume(9, cr, (px, py) => {
        if (py < top - 2 || py > 19) return null;
        const w = (halfW(Math.max(top, py)) || rx * 0.5) + 1;
        const dx = px + 0.5 - cx;
        return Math.abs(dx) <= w ? [dx / w, (py - 14) / 8] : null;
      }, 1);
      for (let px = cx - rx - 1; px <= cx + rx + 6; px++) {
        set(px, 20, cr[1]);
        set(px, 21, cr[0]);
      }
      set(cx, top + 1, cr[4]);
      break;
    }
    case 'band':
      for (let px = cx - rx - 1; px <= cx + rx + 1; px++) for (let py = 18; py <= 20; py++) set(px, py, py === 18 ? '#f4f4f0' : '#d8d8d2');
      set(cx, 18, '#e02020');
      set(cx - 1, 19, '#e02020');
      set(cx, 19, '#e02020');
      set(cx + 1, 19, '#e02020');
      set(cx, 20, '#e02020');
      break;
    case 'officer': {
      const cr = ramp('#2a3446');
      volume(9, cr, (px, py) => {
        if (py < top - 6 || py > 20) return null;
        const w = rx + 3 - Math.max(0, (top - py)) * 0.2;
        const dx = px + 0.5 - cx;
        return Math.abs(dx) <= w ? [dx / w, (py - 12) / 10] : null;
      }, 1);
      for (let px = cx - rx - 2; px <= cx + rx + 2; px++) {
        set(px, 18, '#c8a040');
        set(px, 20, '#0c0e12');
        set(px, 21, '#0c0e12');
      }
      for (let px = cx - 2; px <= cx + 2; px++) set(px, top - 1, '#ffd760');
      set(cx, top - 2, '#ffffff');
      break;
    }
    case 'beret': {
      const br = ramp('#8a2030');
      volume(9, br, (px, py) => {
        const dx = (px + 0.5 - (cx + 3)) / (rx + 3), dy = (py - (top + 1)) / 6;
        return dx * dx + dy * dy <= 1 && py <= top + 5 ? [dx, dy] : null;
      }, 1);
      for (let px = cx - rx; px <= cx + rx; px++) set(px, top + 5, br[0]);
      set(cx - 5, top + 2, '#ffd760');
      break;
    }
    case 'hood': {
      const hr = ramp('#5a4a3a');
      volume(9, hr, (px, py) => {
        if (py > 46) return null;
        const dx = px + 0.5 - cx;
        const w = py < 24 ? (halfW(Math.max(top, py)) || rx * 0.6) + 4 : rx + 4;
        if (Math.abs(dx) > w || py < top - 4) return null;
        if (py >= 22 && Math.abs(dx) < rx - 1) return null;
        return [dx / w, (py - 20) / 20];
      }, 1);
      // A scarf over the mouth and nose.
      for (let py = 35; py <= 44; py++) for (let px = cx - rx; px <= cx + rx; px++) if (inHead(px, py) || py > chin - 1) set(px, py, (px + py) % 4 === 0 ? hr[1] : hr[2]);
      break;
    }
  }

  /* ---- Selective outline: each shape's darkest step where it meets what's behind it ---- */
  const out = col.slice();
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const l = lay[py * N + px];
      if (l < 0 || !rampOf[l]) continue;
      const lower = (qx: number, qy: number): boolean => {
        const m = get(qx, qy);
        return m < 0 || (m < l && m !== 6 && !(l === 6 && m === 3));
      };
      if (lower(px - 1, py) || lower(px + 1, py) || lower(px, py - 1) || lower(px, py + 1)) out[py * N + px] = rampOf[l][0];
    }
  }
  for (let i = 0; i < N * N; i++) {
    const c = out[i];
    if (!c) continue;
    x.fillStyle = c;
    x.fillRect(i % N, Math.floor(i / N), 1, 1);
  }
  return cv;
}
