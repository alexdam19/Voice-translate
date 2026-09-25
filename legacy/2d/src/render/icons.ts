import { getItem, type ItemDef } from '../shared/items';
import { tileArt } from './tileArt';

const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();
const S = 32;

function drawIcon(ctx: CanvasRenderingContext2D, d: ItemDef): void {
  const c1 = d.c1, c2 = d.c2;
  const r = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const circle = (x: number, y: number, rad: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  const outline = '#15161a';
  switch (d.icon) {
    case 'block': {
      const tile = d.place ?? 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tileArt().tiles[tile][0], 6, 6, 20, 20);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeRect(6.5, 6.5, 19, 19);
      break;
    }
    case 'ore':
      circle(16, 18, 10, c2);
      circle(12, 15, 4, c1);
      circle(20, 20, 3, c1);
      circle(18, 12, 2.5, c1);
      r(11, 13, 2, 2, '#fff');
      break;
    case 'scrap':
      r(6, 14, 12, 10, c1);
      r(14, 8, 12, 8, c2);
      r(10, 20, 14, 5, '#5a4a40');
      r(15, 9, 2, 2, '#ddd');
      break;
    case 'plate':
      r(6, 10, 20, 12, c2);
      r(7, 11, 18, 10, c1);
      r(8, 12, 2, 2, '#fff');
      r(22, 18, 2, 2, '#fff');
      break;
    case 'alloy':
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(6, 22);
      ctx.lineTo(10, 12);
      ctx.lineTo(26, 12);
      ctx.lineTo(22, 22);
      ctx.fill();
      r(10, 13, 14, 2, '#fff');
      r(8, 20, 14, 2, c2);
      break;
    case 'wire':
      ctx.strokeStyle = c1;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(16, 16, 8, 0, Math.PI * 1.7);
      ctx.stroke();
      ctx.strokeStyle = c2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(16, 16, 5, 0, Math.PI * 1.5);
      ctx.stroke();
      break;
    case 'rod':
      r(13, 5, 6, 22, c2);
      r(14, 7, 4, 18, c1);
      r(12, 4, 8, 3, '#666');
      r(12, 25, 8, 3, '#666');
      break;
    case 'crystal':
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(16, 4);
      ctx.lineTo(22, 14);
      ctx.lineTo(18, 27);
      ctx.lineTo(12, 27);
      ctx.lineTo(9, 14);
      ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(22, 14);
      ctx.lineTo(18, 27);
      ctx.lineTo(16, 16);
      ctx.fill();
      r(13, 9, 2, 5, '#fff');
      break;
    case 'core':
      circle(16, 16, 10, c2);
      circle(16, 16, 6, c1);
      circle(14, 14, 2, '#fff');
      break;
    case 'chip':
      r(7, 8, 18, 16, c1);
      r(11, 12, 10, 8, '#1b1b1b');
      for (let i = 0; i < 4; i++) {
        r(9 + i * 4, 5, 2, 3, c2);
        r(9 + i * 4, 24, 2, 3, c2);
      }
      break;
    case 'explosive':
      r(9, 8, 14, 18, c1);
      r(9, 14, 14, 3, c2);
      r(15, 4, 2, 5, '#aaa');
      circle(16, 4, 2, '#ffeb3b');
      break;
    case 'powder':
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(5, 26);
      ctx.quadraticCurveTo(16, 4, 27, 26);
      ctx.fill();
      r(10, 20, 3, 2, c2);
      r(18, 17, 3, 2, c2);
      break;
    case 'biomass':
      r(14, 16, 4, 11, '#d7ccc8');
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.ellipse(16, 15, 11, 7, 0, Math.PI, 0);
      ctx.fill();
      r(10, 11, 2, 2, c2);
      r(19, 10, 2, 2, c2);
      break;
    case 'ammo':
      for (let i = 0; i < 3; i++) {
        r(8 + i * 6, 12, 4, 14, c1);
        r(8 + i * 6, 8, 4, 5, c2);
      }
      break;
    case 'rocket':
      r(8, 13, 16, 6, c2);
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(24, 13);
      ctx.lineTo(29, 16);
      ctx.lineTo(24, 19);
      ctx.fill();
      r(5, 11, 4, 10, c1);
      break;
    case 'cutter':
      r(6, 14, 14, 6, c2);
      r(8, 20, 5, 7, '#3a3a3a');
      r(20, 15, 5, 4, '#9e9e9e');
      r(25, 16, 4, 2, c1);
      circle(28, 17, 2, c1);
      break;
    case 'pistol':
      r(8, 12, 16, 5, c1);
      r(8, 17, 5, 8, '#3a3a3a');
      r(20, 11, 4, 2, c2);
      break;
    case 'smg':
      r(5, 12, 20, 5, c1);
      r(10, 17, 4, 8, '#3a3a3a');
      r(16, 17, 3, 7, c2);
      r(25, 13, 4, 2, '#9e9e9e');
      break;
    case 'shotgun':
      r(3, 12, 26, 4, c2);
      r(3, 16, 14, 4, c1);
      r(3, 20, 6, 5, c1);
      break;
    case 'rifle':
      r(3, 13, 26, 4, c2);
      r(8, 11, 14, 8, c1);
      r(5, 17, 5, 7, '#333');
      r(27, 14, 3, 2, '#fff');
      break;
    case 'rail':
      r(2, 13, 28, 3, c1);
      r(2, 17, 28, 2, c1);
      r(6, 11, 12, 10, c2);
      r(8, 21, 4, 5, '#333');
      break;
    case 'launcher':
      r(3, 11, 24, 8, c1);
      r(26, 10, 4, 10, '#333');
      r(10, 19, 4, 6, '#333');
      r(6, 12, 3, 2, c2);
      break;
    case 'baton':
      ctx.save();
      ctx.translate(16, 16);
      ctx.rotate(-0.7);
      r(-3, -12, 6, 22, c1);
      r(-3, -14, 6, 5, c2);
      ctx.restore();
      break;
    case 'grenade':
      circle(16, 18, 8, c1);
      r(13, 7, 6, 4, '#777');
      r(18, 6, 6, 2, c2);
      r(12, 16, 8, 1, '#222');
      break;
    case 'suit':
      r(10, 6, 12, 8, c2);
      r(12, 8, 8, 3, '#6af0ff');
      r(8, 14, 16, 12, c1);
      r(6, 15, 3, 9, c1);
      r(23, 15, 3, 9, c1);
      r(14, 16, 4, 6, c2);
      break;
    case 'jetpack':
      r(9, 6, 14, 18, c1);
      r(8, 22, 6, 5, '#444');
      r(18, 22, 6, 5, '#444');
      r(9, 27, 4, 3, c2);
      r(19, 27, 4, 3, c2);
      break;
    case 'medkit':
      r(6, 8, 20, 16, c1);
      r(14, 10, 4, 12, c2);
      r(10, 14, 12, 4, c2);
      break;
    case 'ration':
      r(8, 8, 16, 18, c1);
      r(8, 12, 16, 4, c2);
      break;
    case 'stim':
      ctx.save();
      ctx.translate(16, 16);
      ctx.rotate(0.7);
      r(-3, -12, 6, 18, c2);
      r(-2, -10, 4, 12, c1);
      r(-1, 6, 2, 7, '#bbb');
      ctx.restore();
      break;
    case 'wheel':
    case 'chain':
      circle(16, 16, 12, c1);
      circle(16, 16, 5, c2);
      if (d.icon === 'chain') for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        r(16 + Math.cos(a) * 12 - 1, 16 + Math.sin(a) * 12 - 1, 3, 3, c2);
      }
      break;
    case 'track':
    case 'magtrack':
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.roundRect(3, 9, 26, 14, 7);
      ctx.fill();
      for (let i = 0; i < 3; i++) circle(9 + i * 7, 16, 3, c2);
      if (d.icon === 'magtrack') r(4, 21, 24, 2, '#ff6e28');
      break;
    case 'hover':
      r(4, 12, 24, 8, c1);
      r(6, 20, 20, 3, c2);
      r(8, 24, 16, 2, 'rgba(106,240,255,0.5)');
      break;
  }
  ctx.strokeStyle = outline;
}

export function itemIcon(id: string): HTMLCanvasElement {
  let c = cache.get(id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    drawIcon(ctx, getItem(id));
    cache.set(id, c);
  }
  return c;
}

export function iconURL(id: string): string {
  let u = urls.get(id);
  if (!u) {
    u = itemIcon(id).toDataURL();
    urls.set(id, u);
  }
  return u;
}
