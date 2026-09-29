import { makeCanvas } from './pixels';
import { TOP_PX } from './shipArt';

/**
 * Blueprint tracings of the ship's own art: the silhouette's outline as a bright line, the panel seams and edges
 * inside it (where the brightness jumps) as fainter lines, and a light wash over the hull, all in drafting blue.
 * Traced once per picture, so the drawing on the BLUEPRINT screen is exactly the ship's shape.
 */

const traced = new WeakMap<CanvasImageSource, HTMLCanvasElement>();

export function traceBlueprint(src: HTMLCanvasElement): HTMLCanvasElement {
  const hit = traced.get(src);
  if (hit) return hit;
  const w = src.width, h = src.height;
  const tmp = makeCanvas(w, h);
  const tx = tmp.getContext('2d')!;
  tx.drawImage(src, 0, 0);
  const d = tx.getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const ox = out.getContext('2d')!;
  const img = ox.createImageData(w, h);
  const o = img.data;
  const A = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const Lm = (x: number, y: number): number => {
    const k = (y * w + x) * 4;
    return d[k] * 0.3 + d[k + 1] * 0.55 + d[k + 2] * 0.15;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (A(x, y) < 60) continue;
      const edge = A(x - 1, y) < 60 || A(x + 1, y) < 60 || A(x, y - 1) < 60 || A(x, y + 1) < 60;
      let r = 120, g = 190, b = 255, a = 26;
      if (edge) {
        r = 226;
        g = 246;
        b = 255;
        a = 255;
      } else {
        const l = Lm(x, y);
        const gx = x + 1 < w && A(x + 1, y) >= 60 ? Math.abs(l - Lm(x + 1, y)) : 0;
        const gy = y + 1 < h && A(x, y + 1) >= 60 ? Math.abs(l - Lm(x, y + 1)) : 0;
        const e = gx + gy;
        if (e > 38) {
          r = 150;
          g = 210;
          b = 255;
          a = Math.min(200, 70 + e * 1.2);
        } else if (l > 150) {
          // Lamps and bright trim.
          r = 200;
          g = 236;
          b = 255;
          a = 110;
        }
      }
      o[k] = r;
      o[k + 1] = g;
      o[k + 2] = b;
      o[k + 3] = a;
    }
  }
  ox.putImageData(img, 0, 0);
  traced.set(src, out);
  return out;
}

/**
 * Which deck cells sit inside the hull's real outline (seen from above): a cell counts if most of it lies over the
 * top view's plating. rows run bow (0) to stern; cols port (0) to starboard.
 */
export function hullCells(top: HTMLCanvasElement, L: number, W: number, cols: number, rows: number, cell: number): boolean[][] {
  const tx = makeCanvas(top.width, top.height).getContext('2d')!;
  tx.drawImage(top, 0, 0);
  const d = tx.getImageData(0, 0, top.width, top.height).data;
  const kx = (L * TOP_PX.over) / TOP_PX.w, ky = (W * TOP_PX.wide) / TOP_PX.h;
  const out: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      let inside = 0;
      for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.5]]) {
        const lx = (rows / 2 - (r + fy)) * cell, lz = (c + fx - cols / 2) * cell;
        const px = Math.round(lx / kx + TOP_PX.cx), py = Math.round(lz / ky + TOP_PX.cy);
        if (px >= 0 && py >= 0 && px < top.width && py < top.height && d[(py * top.width + px) * 4 + 3] > 60) inside++;
      }
      row.push(inside >= 3);
    }
    out.push(row);
  }
  return out;
}
