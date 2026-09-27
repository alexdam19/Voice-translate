import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { OBS, TER } from '../shared/map';
import type { UVRect } from './geo';
import { mix, Pix, shade } from './pixel';

/**
 * One big atlas of 16x16 pixel-art textures generated at startup: terrain, obstacles,
 * hull plating and deck module tops. Nothing is loaded from files.
 */

const SIZE = 1024;
const CELL = 16;

export class Atlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  private slots = new Map<string, UVRect>();
  private next = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.flipY = false;
  }

  add(name: string, draw: (p: Pix) => void, seed = 1): UVRect {
    const per = SIZE / CELL;
    const i = this.next++;
    const x = (i % per) * CELL, y = Math.floor(i / per) * CELL;
    const p = new Pix(this.ctx, x, y, CELL, CELL, seed * 7919 + i * 104729);
    draw(p);
    const e = 0.02;
    const r: UVRect = { u0: (x + e) / SIZE, v0: (y + CELL - e) / SIZE, u1: (x + CELL - e) / SIZE, v1: (y + e) / SIZE };
    this.slots.set(name, r);
    return r;
  }

  get(name: string): UVRect {
    const r = this.slots.get(name);
    if (!r) throw new Error(`atlas: ${name}`);
    return r;
  }

  has(name: string): boolean {
    return this.slots.has(name);
  }
}

/* ---------------------------------------------------------------------- */
/* Terrain                                                                 */
/* ---------------------------------------------------------------------- */

const TERRAIN_ART: Record<number, (p: Pix) => void> = {
  [TER.RUST]: (p) => {
    p.ground(['#5a3322', '#6e3f28', '#7c4a2e', '#8a5634', '#98603a'], 4, 0.4);
    p.speck('#b4703e', 5);
    p.speck('#3e2418', 4);
    p.cracks('#4a2a1c', 1, 5);
  },
  [TER.DIRT]: (p) => {
    p.ground(['#4e3e2e', '#5a4834', '#66523c', '#725c44'], 4, 0.4);
    p.speck('#8a7458', 4);
    p.speck('#3a2e22', 3, 2);
  },
  [TER.ROAD]: (p) => {
    p.ground(['#2e2e34', '#36363c', '#3c3c42', '#424248'], 3, 0.5);
    p.speck('#55555c', 6);
    p.cracks('#26262a', 1, 6);
  },
  [TER.SAND]: (p) => {
    p.ground(['#b88a50', '#c29458', '#cc9e62', '#d4a86c'], 4, 0.3);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) p.wset(x, y + Math.round(Math.sin((x + y) * 0.7)), '#a87c46');
  },
  [TER.DUNE]: (p) => {
    p.ground(['#caa068', '#d4aa70', '#dcb47a', '#e4be84'], 4, 0.25);
    for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) {
      const yy = y + Math.round(Math.sin(x * 0.5 + y) * 1.2);
      p.wset(x, yy, '#b88e58');
      p.wset(x, yy - 1, '#ecc890');
    }
  },
  [TER.ICE]: (p) => {
    p.ground(['#7ab6d8', '#88c4e4', '#94cfec', '#a2daf2'], 5, 0.2);
    for (let i = 0; i < 3; i++) {
      const y = Math.floor(p.rnd() * 16);
      for (let x = 0; x < 6; x++) p.wset(x + i * 5, y - x / 2, '#d8f2ff');
    }
    p.cracks('#5e9cc0', 2, 6);
  },
  [TER.SNOW]: (p) => {
    p.ground(['#c8d6e6', '#d4e0ee', '#dee8f4', '#e8f0f8'], 4, 0.3);
    p.speck('#b0c2d6', 5);
    p.speck('#ffffff', 5);
  },
  [TER.ASH]: (p) => {
    p.ground(['#2e2628', '#362e30', '#3e3436', '#463c3c'], 4, 0.45);
    p.speck('#ff6e28', 2);
    p.speck('#ffa040', 1);
    p.speck('#5a4e4c', 4);
  },
  [TER.BASALT]: (p) => {
    p.ground(['#1e1a22', '#242028', '#2a262e', '#302a34'], 4, 0.3);
    for (let i = 0; i < 16; i += 5) {
      p.rect(i, 0, 1, 16, '#16121a');
      p.rect(0, (i * 3) % 16, 16, 1, '#16121a');
    }
  },
  [TER.GLASS]: (p) => {
    p.ground(['#3e7a3a', '#4a8a44', '#56984e', '#62a658'], 5, 0.2);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(p.rnd() * 16), y = Math.floor(p.rnd() * 16);
      for (let k = 0; k < 4; k++) p.wset(x + k, y - k, '#a8f09a');
    }
    p.speck('#c6ff00', 2);
  },
  [TER.CRATER]: (p) => {
    p.ground(['#2e3a28', '#36442e', '#3e4e34', '#46583a'], 4, 0.4);
    p.speck('#6a8a4e', 4);
    p.speck('#20281c', 4);
  },
  [TER.MUD]: (p) => {
    p.ground(['#2a2818', '#32301e', '#3a3824', '#42402a'], 4, 0.35);
    p.circle(4 + p.rnd() * 8, 4 + p.rnd() * 8, 2, '#24321a');
    p.speck('#5a6a2a', 3);
  },
  [TER.CONCRETE]: (p) => {
    p.ground(['#5e5e62', '#66666a', '#6e6e72', '#76767a'], 4, 0.3);
    p.rect(0, 0, 16, 1, '#4e4e52');
    p.rect(0, 0, 1, 16, '#4e4e52');
    p.cracks('#48484c', 1, 6);
    p.speck('#86868a', 3);
  },
  [TER.METAL]: (p) => {
    p.fill('#4c545e');
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4) {
      p.set(x, y, '#6c7580');
      p.set(x + 1, y + 1, '#6c7580');
    }
    p.frame(0, 0, 16, 16, '#3a4048');
  },
  [TER.CAMP]: (p) => {
    p.ground(['#5a4630', '#664f36', '#72583c', '#7e6244'], 4, 0.35);
    p.speck('#a08a5a', 5);
  },
  [TER.GRASS]: (p) => {
    p.ground(['#46502a', '#505a30', '#5a6436', '#646e3c'], 4, 0.4);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(p.rnd() * 15), y = Math.floor(p.rnd() * 14);
      p.set(x, y, '#8a9448');
      p.set(x + 1, y + 1, '#7a8440');
      p.set(x, y + 1, '#6a7438');
    }
  },
};

/* ---------------------------------------------------------------------- */
/* Obstacles                                                               */
/* ---------------------------------------------------------------------- */

const OBS_ART: Record<number, { top: (p: Pix) => void; side: (p: Pix) => void }> = {
  [OBS.ROCK]: {
    top: (p) => {
      p.ground(['#4a4644', '#57524e', '#625c58', '#6e6862'], 4, 0.35);
      p.speck('#7c4a2e', 3);
    },
    side: (p) => {
      p.ground(['#383432', '#423e3a', '#4c4844', '#56524e'], 4, 0.3);
      for (let y = 3; y < 16; y += 5) p.rect(0, y, 16, 1, '#2e2a28');
    },
  },
  [OBS.BOULDER]: {
    top: (p) => p.ground(['#5a5450', '#6a6460', '#766e6a', '#827a74'], 4, 0.3),
    side: (p) => p.ground(['#46403c', '#504a46', '#5a5450', '#645e5a'], 4, 0.3),
  },
  [OBS.RUIN]: {
    top: (p) => {
      p.ground(['#6e6c68', '#7a7874', '#86847e', '#908e88'], 4, 0.3);
      p.rect(3, 7, 10, 1, '#8a5a3a');
      p.rect(7, 2, 1, 12, '#8a5a3a');
    },
    side: (p) => {
      p.fill('#77746e');
      for (let y = 0; y < 16; y += 4) {
        p.rect(0, y, 16, 1, '#5e5c58');
        for (let x = (y / 4) % 2 ? 0 : 4; x < 16; x += 8) p.rect(x, y, 1, 4, '#5e5c58');
      }
      p.rect(5, 5, 4, 5, '#1e1c1c');
      p.rect(5, 5, 4, 1, '#3a3836');
    },
  },
  [OBS.SANDSTONE]: {
    top: (p) => p.ground(['#9a6a40', '#a8784a', '#b48454', '#c0905e'], 4, 0.3),
    side: (p) => {
      const cols = ['#8a5c36', '#a06c42', '#b07a4c', '#946438', '#bc8856'];
      for (let y = 0; y < 16; y++) p.rect(0, y, 16, 1, cols[Math.floor(y / 3) % cols.length]);
      p.speck('#6e4a2c', 6);
    },
  },
  [OBS.ICE_SPIRE]: {
    top: (p) => {
      p.ground(['#9ad4f4', '#aadcf8', '#bce6fc', '#d0f0ff'], 5, 0.2);
      p.speck('#ffffff', 4);
    },
    side: (p) => {
      p.ground(['#6aaed6', '#7cbce0', '#8ecae8', '#a0d6f0'], 5, 0.2);
      for (let x = 2; x < 16; x += 6) p.rect(x, 0, 1, 16, '#d8f4ff');
    },
  },
  [OBS.BASALT]: {
    top: (p) => {
      p.fill('#26222c');
      p.ring(8, 8, 5, '#16121a');
      p.speck('#ff6e28', 1);
    },
    side: (p) => {
      p.fill('#1e1a24');
      for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, '#141018');
      p.speck('#3a3444', 6);
    },
  },
  [OBS.SHARD]: {
    top: (p) => {
      p.ground(['#6ad060', '#7ade70', '#8eea80', '#a8f89a'], 4, 0.2);
      p.speck('#e8ffd0', 4);
    },
    side: (p) => {
      p.ground(['#3e8a38', '#4c9c44', '#5aac50', '#6abc5e'], 4, 0.2);
      for (let i = 0; i < 16; i += 5) for (let k = 0; k < 16; k++) p.wset(i + k / 3, k, '#b8ffa8');
    },
  },
  [OBS.FUNGUS]: {
    top: (p) => {
      p.ground(['#6a2a8a', '#7a3a9a', '#8a4aaa', '#9a5aba'], 4, 0.3);
      for (let i = 0; i < 4; i++) p.circle(2 + p.rnd() * 12, 2 + p.rnd() * 12, 1.4, '#e8c8ff');
    },
    side: (p) => {
      p.ground(['#c8b8a0', '#d4c4aa', '#ded0b6', '#e8dac0'], 4, 0.25);
      for (let x = 1; x < 16; x += 3) p.rect(x, 0, 1, 16, '#b4a48c');
    },
  },
  [OBS.CLIFF]: {
    top: (p) => {
      p.ground(['#3a322c', '#443a34', '#4e443c', '#584e44'], 4, 0.35);
      p.speck('#6a5a4a', 4);
    },
    side: (p) => {
      p.ground(['#2a2420', '#322a26', '#3a322c', '#443a34'], 3, 0.35);
      for (let y = 2; y < 16; y += 4) p.rect(0, y, 16, 1, '#221c18');
    },
  },
  [OBS.WRECK]: {
    top: (p) => {
      p.ground(['#5a4034', '#6a4a3c', '#7a5644', '#8a624c'], 4, 0.4);
      p.rect(2, 2, 12, 1, '#3a2a22');
      p.rect(2, 9, 12, 1, '#3a2a22');
      p.speck('#c87848', 4);
    },
    side: (p) => {
      p.fill('#5e463a');
      for (let x = 0; x < 16; x += 5) p.rect(x, 0, 1, 16, '#3e2c24');
      for (let y = 2; y < 16; y += 6) for (let x = 2; x < 16; x += 5) p.set(x, y, '#9a7a62');
      p.speck('#c87848', 5);
    },
  },
  [OBS.WALL]: {
    top: (p) => {
      p.fill('#66666a');
      p.stripes(0, 5, 16, 6, '#ffc400', '#2a2a2a', 4);
    },
    side: (p) => {
      p.ground(['#58585c', '#606064', '#68686c', '#707074'], 4, 0.3);
      p.rect(0, 0, 16, 1, '#48484c');
      p.rect(0, 8, 16, 1, '#48484c');
    },
  },
  [OBS.PILLAR]: {
    top: (p) => {
      p.fill('#2c2c3a');
      p.frame(2, 2, 12, 12, '#ff1744');
    },
    side: (p) => {
      p.fill('#30303e');
      p.rect(7, 0, 2, 16, '#ff1744');
      p.rect(0, 4, 16, 1, '#20202a');
      p.rect(0, 11, 16, 1, '#20202a');
    },
  },
};

/* ---------------------------------------------------------------------- */
/* Hulls and modules                                                       */
/* ---------------------------------------------------------------------- */

export interface HullPalette {
  plate: string;
  seam: string;
  trim: string;
  accent: string;
}

export const HULLS: Record<string, HullPalette> = {
  // Gunmetal black with cyan running lights: part land cruiser, part night-time street machine.
  player: { plate: '#3e454c', seam: '#23282d', trim: '#5c666e', accent: '#26c6da' },
  rival: { plate: '#3c2c2e', seam: '#1e1416', trim: '#6e3c3c', accent: '#ff1744' },
  outrider: { plate: '#4e7a6e', seam: '#34524a', trim: '#7aa89a', accent: '#ffca28' },
  enemy: { plate: '#7a4a3a', seam: '#4e2e24', trim: '#a0684e', accent: '#ff3d00' },
  outpost: { plate: '#6a6660', seam: '#48443e', trim: '#8a8680', accent: '#ff1744' },
  remote: { plate: '#5a4a6e', seam: '#3a2e4a', trim: '#8a78a0', accent: '#e040fb' },
};

function hullArt(pal: HullPalette): (p: Pix) => void {
  return (p) => {
    p.ground([shade(pal.plate, 0.9), pal.plate, shade(pal.plate, 1.06)], 4, 0.25);
    p.rect(0, 0, 16, 1, pal.seam);
    p.rect(0, 8, 16, 1, pal.seam);
    p.rect(0, 0, 1, 16, pal.seam);
    p.rect(8, 8, 1, 8, pal.seam);
    for (const [x, y] of [[2, 2], [13, 2], [2, 6], [13, 6], [4, 11], [12, 11]]) p.set(x, y, pal.trim);
    p.speck(shade(pal.plate, 0.7), 3);
  };
}

function deckArt(pal: HullPalette): (p: Pix) => void {
  return (p) => {
    p.fill(shade(pal.plate, 0.75));
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4) {
      p.set(x, y, shade(pal.plate, 0.95));
      p.set(x + 1, y + 1, shade(pal.plate, 0.95));
    }
    p.frame(0, 0, 16, 16, shade(pal.plate, 0.55));
  };
}

const MODULE_ART: Record<string, (p: Pix) => void> = {
  bridge: (p) => {
    p.fill('#48545c');
    p.rect(2, 2, 12, 6, '#1a2a34');
    p.rect(3, 3, 10, 4, '#4dd0e1');
    p.rect(3, 3, 4, 1, '#b2ebf2');
    p.rect(2, 10, 12, 4, '#3a444a');
    p.rect(4, 11, 2, 2, '#ffca28');
    p.rect(8, 11, 2, 2, '#76ff03');
    p.rect(11, 11, 2, 2, '#ff5252');
    p.bevel(0, 0, 16, 16, '#6a7880', '#2a3238');
  },
  reactor: (p) => {
    p.fill('#4a4e40');
    p.circle(8, 8, 6, '#2a2c24');
    p.circle(8, 8, 4, '#ffb300');
    p.circle(8, 8, 2, '#fff59d');
    p.stripes(0, 0, 16, 2, '#ffc400', '#222', 4);
    p.stripes(0, 14, 16, 2, '#ffc400', '#222', 4);
  },
  fission: (p) => {
    p.fill('#3a4a3a');
    p.circle(8, 8, 6, '#1e2a1e');
    p.circle(8, 8, 4, '#76ff03');
    p.circle(8, 8, 2, '#ccff90');
    p.frame(0, 0, 16, 16, '#c6ff00');
  },
  engine: (p) => {
    p.fill('#4a4440');
    for (let y = 2; y < 14; y += 2) p.rect(2, y, 12, 1, '#2a2622');
    p.rect(2, 12, 4, 3, '#1e1a18');
    p.rect(10, 12, 4, 3, '#1e1a18');
    p.bevel(0, 0, 16, 16, '#6a625c', '#2a2622');
  },
  ion_engine: (p) => {
    p.fill('#2e3a4a');
    for (let x = 3; x < 14; x += 4) {
      p.rect(x, 2, 2, 12, '#40c4ff');
      p.rect(x, 2, 1, 12, '#b3e5fc');
    }
    p.bevel(0, 0, 16, 16, '#4e5e70', '#1e2630');
  },
  quarters: (p) => {
    p.fill('#6a5e4e');
    for (let x = 0; x < 16; x += 2) p.rect(x, 0, 1, 16, '#5a4e40');
    p.rect(2, 3, 3, 3, '#ffe082');
    p.rect(11, 3, 3, 3, '#ffe082');
    p.rect(2, 10, 3, 3, '#ffe082');
    p.rect(11, 10, 3, 3, '#1e1a18');
    p.bevel(0, 0, 16, 16, '#8a7e6a', '#3e3428');
  },
  barracks: (p) => {
    p.fill('#5a5a40');
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) * 2; x < 16; x += 4) {
      p.rect(x, y, 3, 2, '#8a8656');
      p.set(x, y + 1, '#6a6644');
    }
    p.rect(6, 6, 4, 4, '#b71c1c');
  },
  medbay: (p) => {
    p.fill('#dcdcdc');
    p.rect(6, 2, 4, 12, '#e53935');
    p.rect(2, 6, 12, 4, '#e53935');
    p.bevel(0, 0, 16, 16, '#ffffff', '#9e9e9e');
  },
  hydroponics: (p) => {
    p.fill('#3a4a2a');
    for (let y = 1; y < 16; y += 5) for (let x = 1; x < 16; x += 5) {
      p.rect(x, y, 4, 4, '#1b5e20');
      p.set(x + 1, y + 1, '#76ff03');
      p.set(x + 2, y + 2, '#b2ff59');
      p.set(x + 1, y + 2, '#64dd17');
    }
  },
  cargo: (p) => {
    p.fill('#4a4038');
    const crate = (x: number, y: number, c: string): void => {
      p.rect(x, y, 6, 6, c);
      p.frame(x, y, 6, 6, shade(c, 0.6));
      p.set(x + 1, y + 1, shade(c, 1.3));
      p.rect(x + 2, y + 2, 2, 2, shade(c, 0.8));
    };
    crate(1, 1, '#a1887f');
    crate(9, 1, '#8d6e63');
    crate(1, 9, '#6d8c5a');
    crate(9, 9, '#a1887f');
  },
  vault: (p) => {
    p.fill('#5a5e66');
    p.circle(8, 8, 5, '#3a3e46');
    p.ring(8, 8, 5, '#ffd740');
    p.rect(7, 4, 2, 8, '#ffd740');
    p.bevel(0, 0, 16, 16, '#8a8e96', '#2a2e36');
  },
  refinery: (p) => {
    p.fill('#4e3e34');
    p.circle(5, 6, 4, '#2a1e18');
    p.circle(5, 6, 2, '#ff6d00');
    p.rect(10, 1, 3, 14, '#6d6d6d');
    p.rect(10, 1, 1, 14, '#9e9e9e');
    p.rect(1, 12, 9, 2, '#6d6d6d');
  },
  workshop: (p) => {
    p.fill('#4a4a4e');
    p.stripes(0, 0, 16, 3, '#ffc400', '#222', 4);
    p.rect(3, 6, 10, 2, '#9e9e9e');
    p.rect(7, 5, 2, 8, '#9e9e9e');
    p.rect(3, 11, 4, 3, '#ff7043');
  },
  drill_mk2: (p) => {
    p.fill('#5a4a2a');
    p.stripes(0, 0, 16, 16, '#ffb300', '#3a3a3a', 6);
    p.circle(8, 8, 4, '#9e9e9e');
    p.circle(8, 8, 2, '#616161');
  },
  drill_mk3: (p) => {
    p.fill('#3a2a4a');
    p.stripes(0, 0, 16, 16, '#e040fb', '#2a2a2a', 6);
    p.circle(8, 8, 5, '#bdbdbd');
    p.circle(8, 8, 2, '#ff3cdc');
  },
  garage: (p) => {
    p.fill('#4a5058');
    for (let y = 3; y < 14; y += 2) p.rect(2, y, 12, 1, '#2e343c');
    p.stripes(0, 0, 16, 2, '#ffc400', '#222', 4);
    p.stripes(0, 14, 16, 2, '#ffc400', '#222', 4);
  },
  armor: (p) => {
    p.ground(['#5a6068', '#626870', '#6a7078'], 4, 0.2);
    p.bevel(0, 0, 16, 16, '#8a9098', '#2a3038');
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) p.rect(x, y, 1, 1, '#b0b8c0');
  },
  heavy_armor: (p) => {
    p.fill('#4e5448');
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      p.rect(x, y, 4, 4, '#646a5c');
      p.bevel(x, y, 4, 4, '#80867a', '#34382e');
    }
  },
  shield: (p) => {
    p.fill('#2a3a4a');
    p.circle(8, 8, 6, '#1565c0');
    p.circle(8, 8, 4, '#40c4ff');
    p.circle(7, 7, 1.5, '#e1f5fe');
  },
  repair_bay: (p) => {
    p.fill('#4a4e54');
    p.rect(3, 7, 10, 2, '#ffca28');
    p.rect(3, 5, 2, 6, '#ffca28');
    p.rect(11, 5, 2, 6, '#ffca28');
    p.bevel(0, 0, 16, 16, '#6a6e74', '#2a2e34');
  },
  radar: (p) => {
    p.fill('#3a4048');
    p.circle(8, 8, 6, '#b0bec5');
    p.circle(8, 8, 4, '#78909c');
    p.set(8, 8, '#ff1744');
  },
  rad_baffles: (p) => {
    p.fill('#ffd600');
    p.circle(8, 8, 2, '#212121');
    for (let a = 0; a < 3; a++) {
      const ang = a * 2.094 - 1.57;
      p.circle(8 + Math.cos(ang) * 4.5, 8 + Math.sin(ang) * 4.5, 2.2, '#212121');
    }
  },
  thermal: (p) => {
    p.fill('#4a4a4a');
    for (let x = 1; x < 16; x += 3) {
      p.rect(x, 1, 2, 7, '#ff7043');
      p.rect(x, 8, 2, 7, '#4fc3f7');
    }
  },
  sealant: (p) => {
    p.fill('#2e3a2e');
    p.circle(5, 8, 4, '#00c853');
    p.circle(12, 8, 3, '#00c853');
    p.circle(4, 7, 1, '#b9f6ca');
  },
  hp_light: (p) => {
    p.fill('#3a4046');
    p.ring(8, 8, 6, '#1e2226');
    p.ring(8, 8, 4, '#5a646e');
  },
  hp_medium: (p) => {
    p.fill('#3a4046');
    p.ring(8, 8, 6.5, '#1e2226');
    p.ring(8, 8, 5, '#5a646e');
    p.stripes(0, 0, 3, 3, '#ffc400', '#222', 2);
  },
  pad: (p) => {
    p.fill('#2c3238');
    p.stripes(0, 0, 16, 2, '#ffc400', '#1a1a1a', 2);
    p.stripes(0, 14, 16, 2, '#ffc400', '#1a1a1a', 2);
    p.ring(8, 8, 5.5, '#161a1e');
    p.ring(8, 8, 4, '#56606a');
    p.set(8, 8, '#26c6da');
  },
  main_gun: (p) => {
    p.fill('#262c32');
    p.ring(8, 8, 7.5, '#121518');
    p.ring(8, 8, 6, '#4a545e');
    p.ring(8, 8, 3, '#1a1e22');
    p.stripes(0, 0, 4, 4, '#ffc400', '#1a1a1a', 2);
    p.stripes(12, 12, 4, 4, '#ffc400', '#1a1a1a', 2);
  },
  tesla: (p) => {
    p.fill('#2a3038');
    p.ring(8, 8, 6, '#40c4ff');
    p.ring(8, 8, 3, '#b3e5fc');
    p.set(8, 8, '#ffffff');
  },
  hp_heavy: (p) => {
    p.fill('#363c42');
    p.ring(8, 8, 7, '#1a1e22');
    p.ring(8, 8, 5.5, '#5a646e');
    p.stripes(0, 0, 3, 3, '#ffc400', '#222', 2);
    p.stripes(13, 13, 3, 3, '#ffc400', '#222', 2);
  },
  /* Labs & facilities */
  science_lab: (p) => {
    p.fill('#e0e6ea');
    p.rect(2, 2, 12, 12, '#b0bec5');
    p.rect(4, 3, 3, 8, '#80deea');
    p.rect(4, 9, 3, 2, '#00e5ff');
    p.rect(9, 5, 4, 6, '#b39ddb');
    p.rect(9, 9, 4, 2, '#7c4dff');
    p.bevel(0, 0, 16, 16, '#ffffff', '#78909c');
  },
  forge: (p) => {
    p.fill('#3a2a24');
    p.circle(8, 8, 6, '#1e1410');
    p.circle(8, 8, 4, '#ff6d00');
    p.circle(8, 8, 2, '#ffea00');
    p.rect(1, 13, 14, 2, '#6d6d6d');
    p.bevel(0, 0, 16, 16, '#6a4a3a', '#1a0e0a');
  },
  training_grounds: (p) => {
    p.ground(['#6a5a3a', '#74643e', '#7e6e46'], 3, 0.3);
    p.ring(8, 8, 5, '#f5f5f5');
    p.ring(8, 8, 3, '#e53935');
    p.set(8, 8, '#e53935');
    p.rect(0, 0, 16, 1, '#fafafa');
    p.rect(0, 15, 16, 1, '#fafafa');
  },
  mess_hall: (p) => {
    p.fill('#6d4c41');
    for (let y = 2; y < 16; y += 5) p.rect(2, y, 12, 3, '#a1887f');
    p.circle(5, 3, 1, '#ffca28');
    p.circle(11, 8, 1, '#ef5350');
    p.circle(6, 13, 1, '#66bb6a');
  },
  arcane_sanctum: (p) => {
    p.fill('#1a1030');
    p.ring(8, 8, 7, '#7c4dff');
    p.ring(8, 8, 4, '#ea80fc');
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2 - Math.PI / 2;
      p.set(Math.round(8 + Math.cos(ang) * 5.5), Math.round(8 + Math.sin(ang) * 5.5), '#ffd740');
    }
    p.circle(8, 8, 1.5, '#ff4f7b');
  },
  ammo_depot: (p) => {
    p.fill('#4a4a36');
    for (let x = 1; x < 16; x += 3) {
      p.rect(x, 3, 2, 10, '#c8a44a');
      p.rect(x, 3, 2, 2, '#8d6e2a');
    }
    p.bevel(0, 0, 16, 16, '#6a6a50', '#22221a');
  },
  command_uplink: (p) => {
    p.fill('#263238');
    p.circle(8, 8, 6, '#455a64');
    p.circle(8, 8, 3, '#ffd740');
    p.set(8, 8, '#ff1744');
  },
  /* Actives */
  salvo_rack: (p) => {
    p.fill('#3a3e44');
    for (let y = 1; y < 16; y += 4) for (let x = 1; x < 16; x += 4) {
      p.rect(x, y, 3, 3, '#1e2226');
      p.set(x + 1, y + 1, '#ff5722');
    }
  },
  smoke_launcher: (p) => {
    p.fill('#3a4046');
    for (let i = 0; i < 4; i++) p.circle(4 + (i % 2) * 8, 4 + Math.floor(i / 2) * 8, 2.5, '#9e9e9e');
    p.bevel(0, 0, 16, 16, '#5a6068', '#20262c');
  },
  drone_bay: (p) => {
    p.fill('#37474f');
    p.stripes(0, 0, 16, 2, '#29b6f6', '#1e2226', 4);
    for (const [x, y] of [[4, 6], [11, 6], [4, 12], [11, 12]]) {
      p.circle(x, y, 2, '#90a4ae');
      p.set(x, y, '#40c4ff');
    }
  },
  mine_layer: (p) => {
    p.fill('#3e3a2a');
    p.stripes(0, 0, 16, 16, '#ffd740', '#2a2a2a', 8);
    p.circle(8, 8, 4, '#424242');
    p.set(8, 8, '#ff1744');
  },
  jet_hangar: (p) => {
    p.fill('#455a64');
    p.rect(7, 0, 2, 16, '#fafafa');
    for (let y = 1; y < 16; y += 4) p.rect(7, y, 2, 2, '#ffc400');
    p.rect(2, 5, 12, 2, '#90caf9');
    p.rect(6, 3, 4, 8, '#90caf9');
  },
  teleporter: (p) => {
    p.fill('#102030');
    p.ring(8, 8, 7, '#18ffff');
    p.ring(8, 8, 4, '#00b8d4');
    p.circle(8, 8, 2, '#e0f7fa');
  },
  dome_projector: (p) => {
    p.fill('#1b3a2a');
    p.circle(8, 8, 6, '#2e7d32');
    p.circle(8, 8, 4, '#69f0ae');
    p.circle(6, 6, 1.5, '#e8f5e9');
  },
  airstrike: (p) => {
    p.fill('#3a3a3a');
    p.circle(8, 8, 6, '#b71c1c');
    p.circle(8, 8, 3, '#ff6e40');
    p.rect(7, 2, 2, 12, '#fafafa');
    p.rect(2, 7, 12, 2, '#fafafa');
  },
  /* Ultimates */
  nuke_silo: (p) => {
    p.fill('#37474f');
    p.circle(8, 8, 7, '#263238');
    p.circle(8, 8, 5, '#ffd600');
    p.circle(8, 8, 1.6, '#212121');
    for (let a = 0; a < 3; a++) {
      const ang = a * 2.094 - 1.57;
      p.circle(8 + Math.cos(ang) * 3.2, 8 + Math.sin(ang) * 3.2, 1.3, '#212121');
    }
  },
  mech_bay: (p) => {
    p.fill('#4e342e');
    p.stripes(0, 0, 16, 3, '#ffc400', '#222', 4);
    p.stripes(0, 13, 16, 3, '#ffc400', '#222', 4);
    p.rect(4, 5, 8, 6, '#ff8f00');
    p.rect(6, 6, 4, 2, '#18ffff');
  },
  orbital: (p) => {
    p.fill('#212121');
    p.circle(8, 8, 6, '#b0bec5');
    p.circle(8, 8, 4, '#eceff1');
    p.circle(8, 8, 2, '#ff1744');
  },
  obelisk: (p) => {
    p.fill('#1a1024');
    p.rect(6, 1, 4, 14, '#3a2a4a');
    p.rect(7, 2, 2, 12, '#ff9100');
    p.set(7, 4, '#ffea00');
    p.set(8, 9, '#ffea00');
  },
  chrono_engine: (p) => {
    p.fill('#0e2a30');
    p.ring(8, 8, 6, '#18ffff');
    p.rect(8, 3, 1, 5, '#e0f7fa');
    p.rect(8, 8, 4, 1, '#e0f7fa');
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      p.set(Math.round(8 + Math.cos(ang) * 7), Math.round(8 + Math.sin(ang) * 7), '#80deea');
    }
  },
  dragon_roost: (p) => {
    p.ground(['#3a2218', '#44281c', '#4e2e20'], 3, 0.3);
    p.circle(8, 8, 6, '#5d4037');
    p.circle(8, 8, 4, '#ff3d00');
    p.circle(7, 7, 1.5, '#ffd740');
    p.circle(10, 9, 1, '#ffd740');
  },
  storm_engine: (p) => {
    p.fill('#1a2336');
    p.circle(8, 8, 6, '#283593');
    for (const [x, y] of [[8, 2], [6, 6], [9, 8], [7, 12]]) p.rect(x, y, 2, 3, '#82b1ff');
    p.rect(6, 5, 1, 2, '#e3f2fd');
  },
};

export const MODULE_COLOR: Record<string, string> = {
  bridge: '#4dd0e1', reactor: '#ffb300', fission: '#76ff03', engine: '#8d6e63', ion_engine: '#40c4ff', quarters: '#bcaaa4',
  barracks: '#9e9d24', medbay: '#ef5350', hydroponics: '#66bb6a', cargo: '#a1887f', vault: '#ffd740', refinery: '#ff7043',
  workshop: '#ffca28', drill_mk2: '#ffb300', drill_mk3: '#e040fb', garage: '#78909c', armor: '#90a4ae', heavy_armor: '#8d9a7a',
  shield: '#40c4ff', repair_bay: '#ffca28', radar: '#b0bec5', rad_baffles: '#ffd600', thermal: '#ff7043', sealant: '#00c853',
  hp_light: '#ff8a65', hp_medium: '#ff7043', hp_heavy: '#f4511e', pad: '#ffc400', main_gun: '#ff3d00', tesla: '#40c4ff',
  science_lab: '#80deea', forge: '#ff6d00', training_grounds: '#fafafa', mess_hall: '#a1887f', arcane_sanctum: '#b388ff',
  ammo_depot: '#c8a44a', command_uplink: '#ffd740', salvo_rack: '#ff5722', smoke_launcher: '#9e9e9e', drone_bay: '#40c4ff',
  mine_layer: '#ffd740', jet_hangar: '#90caf9', teleporter: '#18ffff', dome_projector: '#69f0ae', airstrike: '#ff6e40',
  nuke_silo: '#ffd600', mech_bay: '#ff8f00', orbital: '#ff1744', obelisk: '#ff9100', chrono_engine: '#18ffff', dragon_roost: '#ff3d00',
  storm_engine: '#82b1ff',
};

let atlas: Atlas | null = null;
let treadTex: CanvasTexture | null = null;

export function getAtlas(): Atlas {
  if (atlas) return atlas;
  const a = new Atlas();
  for (const [id, fn] of Object.entries(TERRAIN_ART)) for (let v = 0; v < 3; v++) a.add(`ter${id}_${v}`, fn, Number(id) * 13 + v * 101);
  for (const [id, art] of Object.entries(OBS_ART)) {
    a.add(`obs${id}_top`, art.top, Number(id) * 17);
    a.add(`obs${id}_side`, art.side, Number(id) * 19);
  }
  // Liquid banks (the dirt edge you see around lava and acid pools).
  a.add('bank_lava', (p) => {
    p.ground(['#1a1418', '#241c1e', '#2e2426'], 3, 0.3);
    p.rect(0, 0, 16, 2, '#ff6e28');
  });
  a.add('bank_acid', (p) => {
    p.ground(['#1e2414', '#262c1a', '#2e3420'], 3, 0.3);
    p.rect(0, 0, 16, 2, '#7cff3c');
  });
  a.add('bank', (p) => p.ground(['#2a2018', '#34281e', '#3e3024'], 3, 0.3));
  for (const [k, pal] of Object.entries(HULLS)) {
    a.add(`hull_${k}`, hullArt(pal), k.length * 31);
    a.add(`deck_${k}`, deckArt(pal), k.length * 37);
    a.add(`trim_${k}`, (p) => {
      p.fill(pal.trim);
      p.rect(0, 0, 16, 2, pal.accent);
      p.rect(0, 14, 16, 2, shade(pal.trim, 0.6));
    });
  }
  for (const [k, fn] of Object.entries(MODULE_ART)) a.add(`mod_${k}`, fn, k.length * 41);
  a.add('mod_side', (p) => {
    p.ground(['#3e464e', '#465058', '#4e5862'], 4, 0.2);
    p.rect(0, 0, 16, 1, '#6a7680');
    p.rect(0, 15, 16, 1, '#262c32');
  });
  a.add('metal', (p) => {
    p.ground(['#4a525a', '#545c64', '#5e666e'], 4, 0.2);
    p.rect(0, 0, 16, 1, '#76808a');
  });
  a.add('darkmetal', (p) => {
    p.ground(['#1e2226', '#262a2e', '#2e3236'], 4, 0.2);
    p.rect(0, 0, 16, 1, '#40464c');
  });
  a.add('rubber', (p) => p.ground(['#18181a', '#1e1e20', '#242426'], 4, 0.2));
  a.add('hazard', (p) => p.stripes(0, 0, 16, 16, '#ffc400', '#1e1e1e', 8));
  const solids: Record<string, string> = {
    white: '#ffffff', glow_yellow: '#ffea00', glow_cyan: '#18ffff', glow_red: '#ff1744', glow_green: '#76ff03', glow_purple: '#e040fb',
    glow_orange: '#ff9100', glow_blue: '#40c4ff', bone: '#e8e0cc', wood: '#6d4c41', cactus: '#558b2f', crystal_c: '#80deea', crystal_g: '#b2ff59',
    crystal_p: '#ea80fc', mush: '#ab47bc', stalk: '#e0d6c2', canvas: '#a1887f', rust: '#8d4a2a', skin: '#e0ac69', black: '#101010',
  };
  for (const [k, c] of Object.entries(solids)) {
    a.add(k, (p) => {
      p.fill(c);
      p.speck(shade(c, 0.85), 10);
      p.speck(mix(c, '#ffffff', 0.3), 4);
    });
  }
  // Resource node art (ore chunks on rock).
  const ore = (base: string, fleck: string): ((p: Pix) => void) => (p) => {
    p.ground([shade(base, 0.8), base, shade(base, 1.1)], 4, 0.3);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(p.rnd() * 14), y = Math.floor(p.rnd() * 14);
      p.rect(x, y, 2, 2, fleck);
      p.set(x, y, shade(fleck, 1.4));
    }
  };
  a.add('node_scrap', (p) => {
    p.ground(['#5a4a40', '#6e5a4a', '#80705e'], 3, 0.5);
    p.speck('#b0bec5', 6);
    p.speck('#c87848', 5, 2);
  });
  a.add('node_iron', ore('#55504c', '#c86848'));
  a.add('node_copper', ore('#55504c', '#e28c40'));
  a.add('node_titanium', ore('#4a4a52', '#dce8f8'));
  a.add('node_uranium', ore('#3a403a', '#a0ff50'));
  a.add('node_cryo', ore('#5a7a90', '#78faff'));
  a.add('node_sulfur', ore('#4a4230', '#ffe246'));
  a.add('node_xenite', ore('#3a2040', '#ff3cdc'));
  a.add('node_biomass', (p) => {
    p.ground(['#4a2a5a', '#5a3a6a', '#6a4a7a'], 4, 0.3);
    p.speck('#5affc8', 6);
  });
  a.texture.needsUpdate = true;
  atlas = a;
  return a;
}

/** Repeating tread texture (scrolled per tank). */
export function treadTexture(): Texture {
  if (treadTex) return treadTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const p = new Pix(c.getContext('2d')!, 0, 0, 16, 16, 5);
  p.fill('#1c1c1e');
  for (let y = 0; y < 16; y += 4) {
    p.rect(0, y, 16, 2, '#38383c');
    p.rect(0, y, 16, 1, '#4a4a50');
    p.rect(3, y + 2, 2, 2, '#2a2a2e');
    p.rect(11, y + 2, 2, 2, '#2a2a2e');
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  treadTex = t;
  return t;
}

/** Animated liquid texture (lava / acid). */
export function liquidTexture(kind: 'lava' | 'acid'): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const p = new Pix(c.getContext('2d')!, 0, 0, 32, 32, kind === 'lava' ? 9 : 11);
  if (kind === 'lava') {
    p.ground(['#b71c1c', '#e64a19', '#ff6d00', '#ff9100', '#ffc400'], 8, 0.15);
    p.cracks('#7f0000', 6, 8);
    p.speck('#fff59d', 6);
  } else {
    p.ground(['#33691e', '#558b2f', '#7cb342', '#9ccc65', '#c6ff00'], 8, 0.15);
    for (let i = 0; i < 8; i++) p.ring(p.rnd() * 32, p.rnd() * 32, 1.5 + p.rnd() * 2, '#e6ee9c');
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}
