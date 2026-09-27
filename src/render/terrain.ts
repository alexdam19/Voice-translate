import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Texture } from 'three';
import { CHUNK } from '../shared/constants';
import { OBS, TER, type GameMap } from '../shared/map';
import type { Prop } from '../shared/mapgen';
import { hash2 } from '../shared/rng';
import { withFow } from './fow';
import { F, GeoBuilder, type UVRect } from './geo';
import { getAtlas, liquidTexture } from './textures';

const LIQ_Y = -0.32;

/** Builds and caches terrain chunk meshes around the camera. */
export class TerrainView {
  group = new Group();
  private chunks = new Map<number, Group>();
  private mat: MeshLambertMaterial;
  private lavaMat: MeshBasicMaterial;
  private acidMat: MeshLambertMaterial;
  lavaTex: Texture;
  acidTex: Texture;
  constructor(private map: GameMap) {
    const atlas = getAtlas();
    this.mat = withFow(new MeshLambertMaterial({ map: atlas.texture, vertexColors: true }));
    this.lavaTex = liquidTexture('lava');
    this.acidTex = liquidTexture('acid');
    this.lavaMat = withFow(new MeshBasicMaterial({ map: this.lavaTex }));
    this.acidMat = withFow(new MeshLambertMaterial({ map: this.acidTex, emissive: '#2e5a10', emissiveIntensity: 0.9 }));
  }

  /** Props of a chunk (generated with it). */
  private props(cx: number, cy: number): Prop[] {
    return this.map.chunk(cx, cy).props;
  }

  private key(cx: number, cy: number): number {
    return cy * 1000 + cx;
  }

  /** Ensures chunks near (x, y) are built; frees far ones. */
  update(x: number, y: number, radius: number, time: number): void {
    const n = Math.ceil(this.map.size / CHUNK);
    const c0x = Math.floor((x - radius) / CHUNK), c1x = Math.floor((x + radius) / CHUNK);
    const c0y = Math.floor((y - radius) / CHUNK), c1y = Math.floor((y + radius) / CHUNK);
    let built = 0;
    // Catch up quickly when a lot is missing (a new game, a teleport, zooming out); trickle otherwise.
    const budget = this.chunks.size < 0.6 * (c1x - c0x + 1) * (c1y - c0y + 1) ? 12 : 4;
    for (let cy = Math.max(0, c0y); cy <= Math.min(n - 1, c1y); cy++) {
      for (let cx = Math.max(0, c0x); cx <= Math.min(n - 1, c1x); cx++) {
        const k = this.key(cx, cy);
        if (this.chunks.has(k)) continue;
        if (built >= budget) continue; // spread the work over frames
        const g = this.build(cx, cy);
        this.chunks.set(k, g);
        this.group.add(g);
        built++;
      }
    }
    for (const [k, g] of this.chunks) {
      const cx = k % 1000, cy = Math.floor(k / 1000);
      const mx = (cx + 0.5) * CHUNK, my = (cy + 0.5) * CHUNK;
      if (Math.abs(mx - x) > radius + CHUNK * 2.5 || Math.abs(my - y) > radius + CHUNK * 2.5) {
        this.group.remove(g);
        g.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
        this.chunks.delete(k);
      }
    }
    this.lavaTex.offset.set(time * 0.03, time * 0.02);
    this.acidTex.offset.set(-time * 0.02, time * 0.015);
  }

  /** Rebuilds one chunk (a fortress flattened something in it). */
  invalidate(cx: number, cy: number): void {
    const k = this.key(cx, cy);
    const g = this.chunks.get(k);
    if (!g) return;
    // Swap in the rebuilt chunk in the same frame so the ground never flickers.
    const fresh = this.build(cx, cy);
    this.group.remove(g);
    g.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.chunks.set(k, fresh);
    this.group.add(fresh);
  }

  /** Forces every loaded chunk to rebuild (e.g. after switching maps). */
  clear(): void {
    for (const g of this.chunks.values()) {
      this.group.remove(g);
      g.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
    this.chunks.clear();
  }

  setMap(map: GameMap): void {
    this.clear();
    this.map = map;
  }

  private build(cx: number, cy: number): Group {
    const atlas = getAtlas();
    const map = this.map;
    const size = map.size;
    const gb = new GeoBuilder();
    const lava = new GeoBuilder();
    const acid = new GeoBuilder();
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const hAt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 6;
      const o = map.getObs(x, y);
      if (!o) {
        const t = map.getTer(x, y);
        return t === TER.LAVA || t === TER.ACID ? LIQ_Y : 0;
      }
      return map.getOh(x, y) * 0.5 + hash2(x, y, 77) * 0.2;
    };
    for (let y = y0; y < Math.min(size, y0 + CHUNK); y++) {
      for (let x = x0; x < Math.min(size, x0 + CHUNK); x++) {
        const t = map.getTer(x, y);
        const o = map.getObs(x, y);
        const liquid = t === TER.LAVA || t === TER.ACID;
        if (liquid && !o) {
          const b = t === TER.LAVA ? lava : acid;
          b.quad(x, LIQ_Y, y + 1, x + 1, LIQ_Y, y + 1, x + 1, LIQ_Y, y, x, LIQ_Y, y, 0, 1, 0, { u0: x / 2, v0: (y + 1) / 2, u1: (x + 1) / 2, v1: y / 2 });
          continue;
        }
        if (o) {
          const h = hAt(x, y);
          const top = atlas.get(`obs${o}_top`), side = atlas.get(`obs${o}_side`);
          const j = 0.9 + hash2(x, y, 5) * 0.15;
          gb.box(x, 0, y, x + 1, h, y + 1, top, side, F.TOP, j, j, j);
          const sides: [number, number, number][] = [[0, 1, F.S], [0, -1, F.N], [1, 0, F.E], [-1, 0, F.W]];
          for (const [dx, dy, face] of sides) {
            const nh = hAt(x + dx, y + dy);
            if (nh >= h) continue;
            this.sideFace(gb, x, y, face, nh, h, side, j);
          }
          continue;
        }
        const v = Math.floor(hash2(x, y, 3) * 3);
        const uv = atlas.get(`ter${t}_${v}`);
        let shade = 0.92 + hash2(x, y, 9) * 0.1;
        // Ambient occlusion next to obstacles.
        if (hAt(x + 1, y) > 0.5 || hAt(x - 1, y) > 0.5 || hAt(x, y + 1) > 0.5 || hAt(x, y - 1) > 0.5) shade *= 0.78;
        gb.flat(x, y, x + 1, y + 1, 0, uv, shade, shade, shade);
        // Banks down into liquids.
        for (const [dx, dy, face] of [[0, 1, F.S], [0, -1, F.N], [1, 0, F.E], [-1, 0, F.W]] as [number, number, number][]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const nt = map.getTer(nx, ny);
          if ((nt !== TER.LAVA && nt !== TER.ACID) || map.getObs(nx, ny)) continue;
          this.sideFace(gb, x, y, face, LIQ_Y, 0, atlas.get(nt === TER.LAVA ? 'bank_lava' : 'bank_acid'), 1);
        }
      }
    }
    this.buildProps(gb, cx, cy);
    const g = new Group();
    const m = new Mesh(gb.build(), this.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    if (!lava.empty) g.add(new Mesh(lava.build(), this.lavaMat));
    if (!acid.empty) {
      const am = new Mesh(acid.build(), this.acidMat);
      am.receiveShadow = true;
      g.add(am);
    }
    return g;
  }

  private sideFace(gb: GeoBuilder, x: number, y: number, face: number, y0: number, y1: number, uv: UVRect, j: number): void {
    const ao = 0.62;
    if (face === F.S) gb.quad(x, y0, y + 1, x + 1, y0, y + 1, x + 1, y1, y + 1, x, y1, y + 1, 0, 0, 1, uv, j, j, j, ao);
    else if (face === F.N) gb.quad(x + 1, y0, y, x, y0, y, x, y1, y, x + 1, y1, y, 0, 0, -1, uv, j * 0.8, j * 0.8, j * 0.8, ao);
    else if (face === F.E) gb.quad(x + 1, y0, y + 1, x + 1, y0, y, x + 1, y1, y, x + 1, y1, y + 1, 1, 0, 0, uv, j * 0.9, j * 0.9, j * 0.9, ao);
    else gb.quad(x, y0, y, x, y0, y + 1, x, y1, y + 1, x, y1, y, -1, 0, 0, uv, j * 0.86, j * 0.86, j * 0.86, ao);
  }

  private buildProps(gb: GeoBuilder, cx: number, cy: number): void {
    const props = this.props(cx, cy);
    const a = getAtlas();
    for (const p of props) {
      if (p.gone) continue;
      const s = p.s;
      const x = p.x, z = p.y;
      const turn = Math.round(p.rot / (Math.PI / 2)) % 2 === 1;
      const box = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, tex: string, side?: string): void => {
        const [ww, dd, oxx, ozz] = turn ? [d, w, oz, ox] : [w, d, ox, oz];
        gb.cbox(x + oxx * s, z + ozz * s, ww * s, dd * s, y0 * s, y1 * s, a.get(tex), a.get(side ?? tex));
      };
      switch (p.kind) {
        case 'bones':
          box(0, 0, 0.6, 0.1, 0, 0.08, 'bone');
          box(0.1, 0.15, 0.1, 0.4, 0, 0.08, 'bone');
          box(-0.2, -0.1, 0.25, 0.2, 0, 0.14, 'bone');
          break;
        case 'skull':
          box(0, 0, 0.5, 0.45, 0, 0.35, 'bone');
          box(0, 0.26, 0.3, 0.08, 0.1, 0.24, 'black');
          box(0.3, 0, 0.35, 0.1, 0, 0.1, 'bone');
          box(-0.3, 0, 0.35, 0.1, 0, 0.1, 'bone');
          break;
        case 'deadtree':
          box(0, 0, 0.18, 0.18, 0, 1.4, 'wood');
          box(0.2, 0, 0.4, 0.1, 0.9, 1.0, 'wood');
          box(-0.15, 0.1, 0.3, 0.1, 1.15, 1.25, 'wood');
          break;
        case 'cactus':
          box(0, 0, 0.25, 0.25, 0, 1.2, 'cactus');
          box(0.22, 0, 0.2, 0.18, 0.5, 0.62, 'cactus');
          box(0.3, 0, 0.16, 0.16, 0.5, 0.95, 'cactus');
          box(-0.22, 0, 0.2, 0.16, 0.35, 0.47, 'cactus');
          box(-0.3, 0, 0.14, 0.14, 0.35, 0.8, 'cactus');
          break;
        case 'crystal': {
          const tex = p.v % 3 === 0 ? 'crystal_c' : p.v % 3 === 1 ? 'crystal_g' : 'crystal_p';
          box(0, 0, 0.22, 0.22, 0, 1.1, tex);
          box(0.2, 0.1, 0.16, 0.16, 0, 0.7, tex);
          box(-0.15, -0.12, 0.14, 0.14, 0, 0.5, tex);
          break;
        }
        case 'barrel':
          box(0, 0, 0.4, 0.4, 0, 0.6, 'rust');
          box(0, 0, 0.42, 0.42, 0.25, 0.35, 'hazard');
          break;
        case 'wreckcar':
          box(0, 0, 1.5, 0.8, 0.1, 0.5, 'rust');
          box(-0.1, 0, 0.8, 0.7, 0.5, 0.8, 'rust', 'darkmetal');
          box(0.5, 0.42, 0.3, 0.1, 0, 0.3, 'rubber');
          box(-0.5, 0.42, 0.3, 0.1, 0, 0.3, 'rubber');
          break;
        case 'sign':
          box(0, 0, 0.08, 0.08, 0, 1, 'wood');
          box(0, 0, 0.7, 0.06, 0.7, 1.1, 'hazard', 'wood');
          break;
        case 'mushroom':
          box(0, 0, 0.2, 0.2, 0, 0.6, 'stalk');
          box(0, 0, 0.7, 0.7, 0.6, 0.85, 'mush');
          break;
        case 'pipe':
          box(0, 0, 1.6, 0.25, 0, 0.25, 'rust', 'metal');
          break;
        case 'spike':
          box(0, 0, 0.2, 0.2, 0, 1.3, 'black');
          box(0.15, 0.1, 0.12, 0.12, 0, 0.7, 'black');
          break;
        case 'tent':
          box(0, 0, 1.2, 1, 0, 0.7, 'canvas');
          box(0, 0, 1.3, 0.15, 0.7, 0.8, 'wood');
          break;
        case 'antenna':
          box(0, 0, 0.12, 0.12, 0, 2.4, 'metal');
          box(0, 0, 0.22, 0.22, 2.4, 2.6, 'glow_red');
          break;
        case 'crate':
          box(0, 0, 0.6, 0.6, 0, 0.6, 'wood');
          box(0.3, 0.2, 0.4, 0.4, 0, 0.4, 'wood');
          break;
      }
    }
  }

  /** Obstacle-free check used by the camera (not needed yet). */
  static isObstacle(map: GameMap, x: number, y: number): boolean {
    return map.getObs(Math.floor(x), Math.floor(y)) !== OBS.NONE;
  }
}
