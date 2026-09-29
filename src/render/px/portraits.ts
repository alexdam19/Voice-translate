import { cap, ell, eye, line, paintSprite, plate, spike, tint } from './creaturesHD';
import { rgb, type RGB } from './pixels';

/**
 * Officer portraits as painted pixel-art busts (48 px): a lit, shaded head with its own skin, hair style and colour,
 * eyes, brows, nose and mouth, now and then a beard, a scar or an eyepatch, and the gear of their trade (a marine's
 * helmet and visor, an engineer's goggles, a medic's headband, a driver's headset, a scientist's glasses, a
 * mechanic's cap), in a uniform of their role's colour with a collar pip in their rarity's, on a panel lit in it.
 */

export interface PortraitSpec {
  seed: number;
  role: string;
  roleColor: string;
  rarityColor: string;
  /** Champions set their own hair colour and an accent (a badge). */
  hair?: string;
  accent?: string;
}

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0785a', '#6b4430'];
const HAIRS = ['#1a1612', '#3e2a20', '#6a4a30', '#b07a3a', '#d8d0c0', '#8e2a1e', '#5a2a7a', '#1e4a8a', '#c8c8c8'];

function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const cache = new Map<string, string>();

export function portraitHD(spec: PortraitSpec): string {
  const key = `${spec.seed}|${spec.role}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(spec.seed);
  const skin = rgb(SKINS[Math.floor(r() * SKINS.length)]);
  const hair = rgb(spec.hair ?? HAIRS[Math.floor(r() * HAIRS.length)]);
  const style = Math.floor(r() * 7);
  const beard = r() < 0.3;
  const scar = r() < 0.18;
  const patch = r() < 0.07;
  const eyeCol = rgb(['#3a2a1a', '#2a5a8a', '#3a6a3a', '#5a3a1a', '#1a1a1a'][Math.floor(r() * 5)]);
  const uni = rgb(spec.roleColor);
  const rar = rgb(spec.rarityColor);
  const role = spec.role;
  const bust = paintSprite(48, spec.seed % 997, (p) => {
    // Shoulders and uniform: a dark tunic with the role's colour on the yoke, the collar and a rank pip.
    ell(p, 16, 31.5, 13, 6.5, tint(uni, -0.55), 'cloth', 0.9);
    ell(p, 16, 28.4, 11, 3.2, tint(uni, -0.1), 'cloth', 0.8);
    plate(p, 13.2, 25.2, 5.6, 2.4, tint(uni, -0.35), 'none');
    ell(p, 22.4, 28.6, 1, 0.8, rar, 'metal', 0.6);
    if (role === 'medic') {
      plate(p, 8.2, 27.2, 3, 3, rgb('#f0f0f0'), 'none');
      plate(p, 9.3, 27.6, 0.8, 2.2, rgb('#d02020'), 'none');
      plate(p, 8.6, 28.3, 2.2, 0.8, rgb('#d02020'), 'none');
    }
    // Neck and head.
    cap(p, 16, 22, 16, 25.6, 2.6, 2.8, tint(skin, -0.08), 'skin');
    // Long hair falls behind the shoulders first.
    if (style === 2) {
      ell(p, 11, 18, 3, 7, hair, 'fur', 0.9);
      ell(p, 21, 18, 3, 7, hair, 'fur', 0.9);
    }
    ell(p, 9.6, 14.6, 1.3, 2, tint(skin, -0.12), 'skin');
    ell(p, 22.4, 14.6, 1.3, 2, tint(skin, -0.12), 'skin');
    ell(p, 16, 14, 6.4, 8.2, skin, 'skin', 1.05);
    // Jaw shadow and cheekbones.
    ell(p, 16, 19.4, 4.2, 1.6, tint(skin, -0.1), 'skin', 0.4, 0, false);
    if (beard) {
      ell(p, 16, 19.6, 5, 3, tint(hair, 0.05), 'fur', 0.7);
      ell(p, 16, 18.2, 2.6, 0.9, tint(skin, -0.25), 'none', 0.3, 0, false);
    }
    // Eyes, brows, nose, mouth.
    for (const s of [-1, 1]) {
      const ex = 16 + s * 2.5;
      if (patch && s < 0) {
        ell(p, ex, 13.8, 1.6, 1.2, rgb('#141414'), 'none', 0.4);
        line(p, ex - 2.6, 11.6, ex + 3, 12.6, rgb('#141414'));
        continue;
      }
      ell(p, ex, 13.9, 1.3, 0.8, rgb('#f4f0e8'), 'none', 0.5, 0, false);
      ell(p, ex + 0.2, 13.9, 0.62, 0.62, eyeCol, 'none', 0.3, 0, false);
      eye(p, ex - 0.1, 13.6, rgb('#ffffff'), 0.12);
      line(p, ex - 1.4, 12.2 + (s > 0 ? 0.1 : 0), ex + 1.3, 12.1, tint(hair, -0.2));
    }
    line(p, 16.3, 14.6, 16.6, 16.6, tint(skin, -0.3));
    line(p, 15.8, 16.8, 16.8, 16.8, tint(skin, -0.22));
    line(p, 14.6, 18.4, 17.6, 18.4, tint(skin, -0.42));
    if (scar) line(p, 18.6, 11.2, 20, 16, tint(skin, -0.35));
    // Hair on top (or the headgear of the trade).
    if (role === 'marine' || role === 'gunner') {
      ell(p, 16, 9.4, 7.4, 5.2, role === 'marine' ? rgb('#4a5a3a') : rgb('#4a4d55'), 'metal', 1.1);
      plate(p, 9.4, 10.8, 13.2, 1.4, tint(uni, -0.3), 'none');
      if (role === 'marine') {
        ell(p, 16, 13.8, 5.4, 1.5, rgb('#1a2a3a'), 'glow', 0.4);
        line(p, 11.6, 13.4, 20.4, 13.4, rgb('#6ad8ff'));
      }
    } else {
      switch (style) {
        case 0:
          ell(p, 16, 8.8, 6.8, 3.8, hair, 'fur', 1);
          break;
        case 1:
          spike(p, 16, 8, 16, 2.6, 3, hair);
          ell(p, 16, 8.4, 2, 2.6, hair, 'fur', 0.9);
          break;
        case 2:
          ell(p, 16, 8.8, 7, 4.2, hair, 'fur', 1);
          break;
        case 3:
          ell(p, 16, 8.6, 6.8, 3.4, hair, 'fur', 0.9);
          ell(p, 21, 6.6, 2.4, 2.4, hair, 'fur', 1);
          break;
        case 4:
          // Bald, with a shine.
          eye(p, 13.6, 8.8, tint(skin, 0.5), 0.35);
          break;
        case 5:
          ell(p, 14.6, 8.4, 5.8, 3.4, hair, 'fur', 1, -0.3);
          ell(p, 19.6, 10.2, 2.2, 2.6, hair, 'fur', 0.9);
          break;
        default:
          ell(p, 16, 8.4, 6.6, 3, hair, 'fur', 0.8);
          for (let k = 0; k < 5; k++) spike(p, 11.6 + k * 2.2, 8.4, 11.2 + k * 2.4, 6, 1.4, hair);
      }
      if (role === 'engineer') {
        plate(p, 9.6, 10.8, 12.8, 1.2, rgb('#3a2a1a'), 'none');
        for (const s of [-1, 1]) {
          ell(p, 16 + s * 2.6, 11.4, 1.7, 1.5, rgb('#2a2e36'), 'metal', 0.6);
          ell(p, 16 + s * 2.6, 11.4, 1, 0.9, rgb('#4dd0e1'), 'glow', 0.4, 0, false);
        }
      } else if (role === 'driver') {
        cap(p, 9.6, 12.4, 16, 5.6, 0.6, 0.6, rgb('#303440'), 'metal');
        cap(p, 16, 5.6, 22.4, 12.4, 0.6, 0.6, rgb('#303440'), 'metal');
        ell(p, 9.4, 14.2, 1.6, 2.2, rgb('#303440'), 'metal', 0.8);
        ell(p, 22.6, 14.2, 1.6, 2.2, rgb('#303440'), 'metal', 0.8);
        line(p, 22.6, 16, 19.4, 18.6, rgb('#303440'));
      } else if (role === 'scientist') {
        for (const s of [-1, 1]) {
          ell(p, 16 + s * 2.5, 13.9, 1.6, 1.3, rgb('#c0c8d0'), 'metal', 0.3, 0, true);
          ell(p, 16 + s * 2.5, 13.9, 1.1, 0.8, rgb('#bfe8ff'), 'glow', 0.2, 0, false);
        }
        line(p, 15.2, 13.8, 16.8, 13.8, rgb('#c0c8d0'));
      } else if (role === 'mechanic' || role === 'quartermaster') {
        ell(p, 16, 8.2, 6.8, 3, role === 'mechanic' ? rgb('#c05a20') : rgb('#5a6a7a'), 'cloth', 0.9);
        plate(p, 16, 8.4, 6.4, 1.2, role === 'mechanic' ? rgb('#8a3a10') : rgb('#3a4a5a'), 'none');
        if (role === 'mechanic') ell(p, 19.2, 16.6, 1.4, 0.8, rgb('#3a3028'), 'none', 0.3, 0, false);
      } else if (role === 'medic') {
        plate(p, 9.8, 9.6, 12.4, 1.4, rgb('#f0f0f0'), 'none');
        plate(p, 15.3, 9.4, 1.4, 1.8, rgb('#d02020'), 'none');
      } else if (role === 'scavenger') {
        ell(p, 16, 20.8, 6.4, 2.6, rgb('#8a7a60'), 'cloth', 0.6);
      }
    }
    if (spec.accent) {
      const A = rgb(spec.accent);
      for (let k = 0; k < 3; k++) spike(p, 12.6 + k * 3.4, 5.4, 12.6 + k * 3.4, 2.6 - (k === 1 ? 1 : 0), 1.8, A);
      ell(p, 9.6, 28.8, 1.3, 1.3, A, 'metal', 0.7);
    }
  });
  // The panel behind: lit in the rarity's colour, scanlines, a frame.
  const S = 50;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;
  const bg = x.createRadialGradient(S * 0.5, S * 0.35, 2, S * 0.5, S * 0.5, S * 0.75);
  const rr: RGB = rar;
  bg.addColorStop(0, `rgb(${rr[0] * 0.45},${rr[1] * 0.45},${rr[2] * 0.45})`);
  bg.addColorStop(1, '#0a0716');
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < S; y += 2) x.fillRect(0, y, S, 1);
  x.drawImage(bust, 0, 2);
  x.strokeStyle = spec.rarityColor;
  x.lineWidth = 2;
  x.strokeRect(1, 1, S - 2, S - 2);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
