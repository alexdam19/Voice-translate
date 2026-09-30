import * as THREE from 'three';
import { hash2 } from '../px/pixels';

/**
 * Procedural textures for the cab's 3D view: building fronts (plaster, brick, planks, corrugated iron, concrete,
 * each with its windows and doors), roofs (clay tiles, slate, tar and gravel, metal sheet), riveted hull plate and
 * crawler treads. Painted once on canvases, tiled across the models in world metres.
 */

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, paint: (x: CanvasRenderingContext2D) => void, repeat = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  paint(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}

/** Speckle: a few thousand dots lighter and darker than the base, for grain. */
function grain(x: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const px = hash2(i, seed, 1) * w, py = hash2(i, seed, 2) * h;
    const k = hash2(i, seed, 3);
    x.fillStyle = k > 0.5 ? `rgba(255,255,255,${a * (k - 0.5) * 2})` : `rgba(0,0,0,${a * (0.5 - k) * 2})`;
    x.fillRect(px, py, 1 + (hash2(i, seed, 4) > 0.8 ? 1 : 0), 1);
  }
}

export type Facade = 'plaster' | 'brick' | 'planks' | 'iron' | 'concrete' | 'adobe' | 'ruin' | 'bunker';

/**
 * A building front, 8 m wide and 7 m (two floors) tall per tile of texture: the wall, and windows with frames,
 * sills and glass that catches the sky (some lit, some shuttered). Grey-ish so a vertex colour can tint the wall.
 */
export function facadeTex(kind: Facade): THREE.Texture {
  return canvasTex(`facade:${kind}`, 256, 224, (x) => {
    const W = 256, H = 224;
    const base: Record<Facade, string> = {
      plaster: '#e4ded2', brick: '#b0624a', planks: '#8a6a4a', iron: '#8a8e92', concrete: '#9a9a96', adobe: '#c8a47a', ruin: '#6e6a64', bunker: '#7c7e7a',
    };
    x.fillStyle = base[kind];
    x.fillRect(0, 0, W, H);
    // Material.
    if (kind === 'brick') {
      for (let r = 0; r < H / 7; r++) {
        for (let c = 0; c < W / 16 + 1; c++) {
          const ox = (r & 1) * 8;
          const k = hash2(c, r, 11);
          x.fillStyle = `rgb(${150 + k * 50},${76 + k * 30},${58 + k * 20})`;
          x.fillRect(c * 16 - ox + 1, r * 7 + 1, 14, 5);
        }
      }
    } else if (kind === 'planks') {
      for (let c = 0; c < W / 10; c++) {
        const k = hash2(c, 3, 12);
        x.fillStyle = `rgb(${110 + k * 40},${82 + k * 30},${56 + k * 20})`;
        x.fillRect(c * 10, 0, 9, H);
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.fillRect(c * 10 + 9, 0, 1, H);
      }
    } else if (kind === 'iron') {
      for (let c = 0; c < W / 8; c++) {
        const g = x.createLinearGradient(c * 8, 0, c * 8 + 8, 0);
        g.addColorStop(0, '#6a6e72');
        g.addColorStop(0.5, '#a8acb0');
        g.addColorStop(1, '#5a5e62');
        x.fillStyle = g;
        x.fillRect(c * 8, 0, 8, H);
      }
      // Rust streaks.
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `rgba(${120 + hash2(i, 1, 5) * 60},${50 + hash2(i, 2, 5) * 20},20,${0.15 + hash2(i, 3, 5) * 0.3})`;
        x.fillRect(hash2(i, 4, 5) * W, hash2(i, 6, 5) * H * 0.6, 2 + hash2(i, 7, 5) * 4, 20 + hash2(i, 8, 5) * 60);
      }
    } else if (kind === 'concrete' || kind === 'bunker') {
      x.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let r = 0; r <= H; r += kind === 'bunker' ? 32 : 56) {
        x.beginPath();
        x.moveTo(0, r + 0.5);
        x.lineTo(W, r + 0.5);
        x.stroke();
      }
      for (let c = 0; c <= W; c += 64) {
        x.beginPath();
        x.moveTo(c + 0.5, 0);
        x.lineTo(c + 0.5, H);
        x.stroke();
      }
    }
    grain(x, W, H, 5000, kind === 'plaster' || kind === 'adobe' ? 0.12 : 0.2, kind.length);
    // Grime: darker toward the ground, streaks under the sills.
    const gg = x.createLinearGradient(0, 0, 0, H);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.45, 'rgba(0,0,0,0.05)');
    gg.addColorStop(0.5, 'rgba(0,0,0,0)');
    gg.addColorStop(0.95, 'rgba(40,30,20,0.28)');
    gg.addColorStop(1, 'rgba(40,30,20,0.35)');
    x.fillStyle = gg;
    x.fillRect(0, 0, W, H);
    if (kind === 'bunker') {
      // Firing slits and hazard paint, no windows.
      for (let c = 0; c < 2; c++) {
        x.fillStyle = '#16181a';
        x.fillRect(40 + c * 128, 60, 48, 10);
      }
      for (let i = 0; i < 16; i++) {
        x.fillStyle = i & 1 ? '#1a1a1a' : '#d8a820';
        x.fillRect(i * 16, H - 14, 16, 14);
      }
      return;
    }
    // Windows: two floors of two.
    const ruin = kind === 'ruin';
    for (let fl = 0; fl < 2; fl++) {
      for (let c = 0; c < 2; c++) {
        const wx = 36 + c * 128, wy = 22 + fl * 112;
        const ww = kind === 'iron' ? 60 : 52, wh = 56;
        const seed = hash2(c, fl, kind.length);
        // Frame and sill.
        x.fillStyle = kind === 'brick' ? '#e8e0d0' : kind === 'planks' ? '#5a4028' : '#3a3a3a';
        x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.fillRect(wx - 4, wy + wh + 4, ww + 8, 4);
        if (ruin || (kind !== 'iron' && seed < 0.18)) {
          // Broken or boarded.
          x.fillStyle = '#0c0c0e';
          x.fillRect(wx, wy, ww, wh);
          if (!ruin) {
            x.fillStyle = '#6a5038';
            for (let k = 0; k < 3; k++) x.fillRect(wx - 2, wy + 8 + k * 18, ww + 4, 8);
          } else {
            x.fillStyle = 'rgba(0,0,0,0.4)';
            x.fillRect(wx - 10, wy - 20, ww + 20, 16);
          }
          continue;
        }
        // Glass: the sky reflected, darker at the bottom, a glint.
        const gl = x.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
        const lit = seed > 0.86;
        gl.addColorStop(0, lit ? '#ffe2a0' : '#9ab4c8');
        gl.addColorStop(0.5, lit ? '#e8b060' : '#4a6072');
        gl.addColorStop(1, lit ? '#b07830' : '#1e2a36');
        x.fillStyle = gl;
        x.fillRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(255,255,255,0.25)';
        x.beginPath();
        x.moveTo(wx + 6, wy + wh);
        x.lineTo(wx + 20, wy);
        x.lineTo(wx + 28, wy);
        x.lineTo(wx + 14, wy + wh);
        x.fill();
        // Glazing bars.
        x.fillStyle = kind === 'brick' ? '#e8e0d0' : '#2a2a2a';
        x.fillRect(wx + ww / 2 - 2, wy, 4, wh);
        x.fillRect(wx, wy + wh * 0.45, ww, 3);
      }
    }
    // A door on the ground floor of some.
    if (kind === 'plaster' || kind === 'adobe' || kind === 'planks') {
      x.fillStyle = '#4a3222';
      x.fillRect(108, 160, 40, 64);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.fillRect(108, 160, 40, 4);
    }
  });
}

export type Roof = 'clay' | 'slate' | 'tar' | 'sheet' | 'thatch';

/** Roofing, 8 m square per tile of texture. */
export function roofTex(kind: Roof): THREE.Texture {
  return canvasTex(`roof:${kind}`, 256, 256, (x) => {
    const W = 256;
    const base: Record<Roof, string> = { clay: '#a84a30', slate: '#4a4e58', tar: '#3a3a3c', sheet: '#7a8088', thatch: '#b09050' };
    x.fillStyle = base[kind];
    x.fillRect(0, 0, W, W);
    if (kind === 'clay' || kind === 'slate') {
      for (let r = 0; r < W / 10; r++) {
        for (let c = 0; c < W / 14 + 1; c++) {
          const ox = (r & 1) * 7;
          const k = hash2(c, r, kind.length);
          const b = kind === 'clay' ? [150 + k * 50, 60 + k * 26, 40 + k * 14] : [62 + k * 22, 66 + k * 22, 76 + k * 22];
          const g = x.createLinearGradient(0, r * 10, 0, r * 10 + 10);
          g.addColorStop(0, `rgb(${b[0] * 1.15},${b[1] * 1.15},${b[2] * 1.15})`);
          g.addColorStop(1, `rgb(${b[0] * 0.7},${b[1] * 0.7},${b[2] * 0.7})`);
          x.fillStyle = g;
          x.fillRect(c * 14 - ox + 1, r * 10 + 1, 12, 9);
        }
      }
    } else if (kind === 'sheet') {
      for (let c = 0; c < W / 8; c++) {
        const g = x.createLinearGradient(c * 8, 0, c * 8 + 8, 0);
        g.addColorStop(0, '#5a6068');
        g.addColorStop(0.5, '#a0a6ae');
        g.addColorStop(1, '#4a5058');
        x.fillStyle = g;
        x.fillRect(c * 8, 0, 8, W);
      }
      for (let i = 0; i < 30; i++) {
        x.fillStyle = `rgba(130,60,20,${0.1 + hash2(i, 1, 9) * 0.3})`;
        x.fillRect(hash2(i, 2, 9) * W, hash2(i, 3, 9) * W, 4 + hash2(i, 4, 9) * 30, 3 + hash2(i, 5, 9) * 20);
      }
    } else if (kind === 'thatch') {
      for (let i = 0; i < 4000; i++) {
        x.strokeStyle = `rgba(${140 + hash2(i, 1, 3) * 80},${110 + hash2(i, 2, 3) * 60},50,0.6)`;
        const px = hash2(i, 3, 3) * W, py = hash2(i, 4, 3) * W;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + 1, py + 10);
        x.stroke();
      }
    } else {
      // Tar and gravel with vents and patches.
      grain(x, W, W, 9000, 0.35, 7);
      for (let i = 0; i < 6; i++) {
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.fillRect(hash2(i, 1, 8) * W, hash2(i, 2, 8) * W, 30 + hash2(i, 3, 8) * 50, 20 + hash2(i, 4, 8) * 40);
      }
      x.fillStyle = '#6a6c70';
      x.fillRect(60, 60, 14, 14);
      x.fillRect(180, 150, 18, 12);
    }
    grain(x, W, W, 3000, 0.15, 17);
  });
}

/** Riveted steel plate, 10 m square per tile: panels, seams, rivets, grime and scuffs, grey for tinting. */
export function plateTex(): THREE.Texture {
  return canvasTex('plate', 512, 512, (x) => {
    const W = 512;
    x.fillStyle = '#8c9098';
    x.fillRect(0, 0, W, W);
    const P = 128;
    for (let r = 0; r < W / P; r++) {
      for (let c = 0; c < W / P; c++) {
        const k = hash2(c, r, 21);
        const g = x.createLinearGradient(c * P, r * P, c * P + P, r * P + P);
        g.addColorStop(0, `rgb(${148 + k * 30},${152 + k * 30},${160 + k * 30})`);
        g.addColorStop(1, `rgb(${118 + k * 24},${122 + k * 24},${130 + k * 24})`);
        x.fillStyle = g;
        x.fillRect(c * P + 2, r * P + 2, P - 4, P - 4);
        x.fillStyle = '#3a3e44';
        for (let i = 0; i < 8; i++) {
          for (const [px, py] of [[c * P + 8 + i * 15, r * P + 7], [c * P + 8 + i * 15, r * P + P - 7], [c * P + 7, r * P + 8 + i * 15], [c * P + P - 7, r * P + 8 + i * 15]]) {
            x.beginPath();
            x.arc(px, py, 2.2, 0, Math.PI * 2);
            x.fill();
          }
        }
      }
    }
    x.fillStyle = '#2a2d32';
    for (let i = 0; i <= W; i += P) {
      x.fillRect(i - 2, 0, 3, W);
      x.fillRect(0, i - 2, W, 3);
    }
    grain(x, W, W, 20000, 0.18, 31);
    for (let i = 0; i < 80; i++) {
      x.fillStyle = `rgba(60,40,30,${0.05 + hash2(i, 1, 33) * 0.12})`;
      x.beginPath();
      x.ellipse(hash2(i, 2, 33) * W, hash2(i, 3, 33) * W, 6 + hash2(i, 4, 33) * 30, 3 + hash2(i, 5, 33) * 12, hash2(i, 6, 33) * 3, 0, Math.PI * 2);
      x.fill();
    }
  });
}

/** Crawler track links along u (one link per 1.6 m, texture 8 links), for scrolling. */
export function treadTex(): THREE.Texture {
  return canvasTex('tread', 256, 64, (x) => {
    x.fillStyle = '#1c1d20';
    x.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 8; i++) {
      const g = x.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
      g.addColorStop(0, '#2a2c30');
      g.addColorStop(0.35, '#5a5e64');
      g.addColorStop(0.7, '#2e3034');
      g.addColorStop(1, '#141518');
      x.fillStyle = g;
      x.fillRect(i * 32 + 2, 4, 26, 56);
      x.fillStyle = '#6a6e74';
      x.fillRect(i * 32 + 12, 26, 6, 12);
    }
  });
}

/** Soft round puff (smoke, dust, glow), white on transparent. */
export function puffTex(): THREE.Texture {
  return canvasTex('puff', 128, 128, (x) => {
    for (let i = 0; i < 14; i++) {
      const cx = 64 + (hash2(i, 1, 41) - 0.5) * 50, cy = 64 + (hash2(i, 2, 41) - 0.5) * 50, r = 18 + hash2(i, 3, 41) * 26;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
  }, false);
}

/** A hot glow: white core to a transparent edge. */
export function glowTex(): THREE.Texture {
  return canvasTex('glow', 64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  }, false);
}

export type Bump = 'fur' | 'scale' | 'chitin' | 'rock' | 'cloth' | 'skin' | 'metal';

/** Grey relief for a surface (fur strands, overlapping scales, plated chitin, pitted rock, weave, pores, panels). */
export function bumpTex(kind: Bump): THREE.Texture {
  return canvasTex(`bump:${kind}`, 256, 256, (x) => {
    const W = 256;
    x.fillStyle = '#808080';
    x.fillRect(0, 0, W, W);
    switch (kind) {
      case 'fur':
        for (let i = 0; i < 9000; i++) {
          const px = hash2(i, 1, 201) * W, py = hash2(i, 2, 201) * W, l = 4 + hash2(i, 3, 201) * 9;
          x.strokeStyle = hash2(i, 4, 201) > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px + l * 0.25, py + l);
          x.stroke();
        }
        break;
      case 'scale':
        for (let r = -1; r < W / 12 + 1; r++) {
          for (let c = -1; c < W / 14 + 1; c++) {
            const cx = c * 14 + (r & 1) * 7, cy = r * 12;
            const g = x.createRadialGradient(cx, cy - 3, 1, cx, cy, 9);
            g.addColorStop(0, '#c8c8c8');
            g.addColorStop(0.8, '#707070');
            g.addColorStop(1, '#303030');
            x.fillStyle = g;
            x.beginPath();
            x.ellipse(cx, cy, 8, 7, 0, 0, Math.PI * 2);
            x.fill();
          }
        }
        break;
      case 'chitin':
        for (let r = 0; r < 8; r++) {
          const g = x.createLinearGradient(0, r * 32, 0, r * 32 + 32);
          g.addColorStop(0, '#b0b0b0');
          g.addColorStop(0.85, '#7a7a7a');
          g.addColorStop(1, '#2a2a2a');
          x.fillStyle = g;
          x.fillRect(0, r * 32, W, 32);
        }
        break;
      case 'rock':
        for (let i = 0; i < 1400; i++) {
          const px = hash2(i, 1, 203) * W, py = hash2(i, 2, 203) * W, r = 2 + hash2(i, 3, 203) * 14;
          x.fillStyle = `rgba(${hash2(i, 4, 203) > 0.5 ? '255,255,255' : '0,0,0'},${0.08 + hash2(i, 5, 203) * 0.18})`;
          x.beginPath();
          x.arc(px, py, r, 0, Math.PI * 2);
          x.fill();
        }
        break;
      case 'cloth':
        for (let i = 0; i < W; i += 3) {
          x.fillStyle = i % 6 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
          x.fillRect(i, 0, 1, W);
          x.fillRect(0, i, W, 1);
        }
        break;
      case 'skin':
        for (let i = 0; i < 6000; i++) {
          x.fillStyle = `rgba(0,0,0,${0.1 + hash2(i, 3, 205) * 0.2})`;
          x.fillRect(hash2(i, 1, 205) * W, hash2(i, 2, 205) * W, 1.5, 1.5);
        }
        for (let i = 0; i < 40; i++) {
          x.strokeStyle = 'rgba(0,0,0,0.2)';
          x.beginPath();
          x.moveTo(hash2(i, 4, 205) * W, hash2(i, 5, 205) * W);
          x.bezierCurveTo(hash2(i, 6, 205) * W, hash2(i, 7, 205) * W, hash2(i, 8, 205) * W, hash2(i, 9, 205) * W, hash2(i, 10, 205) * W, hash2(i, 11, 205) * W);
          x.stroke();
        }
        break;
      case 'metal':
        x.strokeStyle = '#303030';
        x.lineWidth = 2;
        for (let i = 0; i <= W; i += 64) {
          x.strokeRect(i, 0, 64, 64);
          x.strokeRect(0, i, 64, 64);
        }
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) {
          x.fillStyle = '#d0d0d0';
          x.beginPath();
          x.arc(c * 64 + 6 + k * 17, r * 64 + 6, 2, 0, Math.PI * 2);
          x.fill();
        }
        break;
    }
    grain(x, W, W, 4000, 0.25, kind.length + 300);
  });
}
