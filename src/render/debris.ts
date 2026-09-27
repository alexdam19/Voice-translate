import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';

/**
 * Chunks of concrete and steel with real(ish) physics: when the fortress ploughs through a building, pieces fly,
 * tumble, fall under gravity, bounce and settle, then sink away. One instanced mesh for all of them.
 */
const MAX = 700;

interface Piece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Tumble axis and speed. */
  ax: number;
  ay: number;
  az: number;
  spin: number;
  angle: number;
  s: number;
  life: number;
  rest: number;
}

export class Debris {
  mesh: InstancedMesh;
  private pieces: Piece[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private sc = new Vector3();
  private axis = new Vector3();
  private col = new Color();

  constructor() {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: '#ffffff' }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** A building section coming down at (x, y): `h` tall, pieces flung away from (fx, fy). */
  burst(x: number, y: number, h: number, color: string, n: number, fx: number, fy: number, push: number): void {
    const base = new Color(color);
    for (let i = 0; i < n; i++) {
      if (this.pieces.length >= MAX) this.pieces.shift();
      const a = Math.atan2(y - fy, x - fx) + (Math.random() - 0.5) * 1.6;
      const sp = 1 + Math.random() * 3 + push * 0.6;
      const p: Piece = {
        x: x + (Math.random() - 0.5), y: 0.3 + Math.random() * h, z: y + (Math.random() - 0.5),
        vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp,
        ax: Math.random() - 0.5, ay: Math.random() - 0.5, az: Math.random() - 0.5, spin: (Math.random() - 0.5) * 12, angle: 0,
        s: 0.18 + Math.random() * 0.45, life: 4 + Math.random() * 3, rest: 0,
      };
      this.pieces.push(p);
      const k = 0.75 + Math.random() * 0.4;
      this.col.setRGB(base.r * k, base.g * k, base.b * k);
      this.mesh.setColorAt(this.pieces.length - 1, this.col);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const list = this.pieces;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.rest < 1) {
        p.vy -= 20 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.angle += p.spin * dt;
        const floor = p.s / 2;
        if (p.y < floor) {
          // Bounce, lose energy, slide to a stop.
          p.y = floor;
          p.vy = Math.abs(p.vy) > 1.5 ? -p.vy * 0.32 : 0;
          p.vx *= 0.55;
          p.vz *= 0.55;
          p.spin *= 0.5;
          if (p.vy === 0 && Math.hypot(p.vx, p.vz) < 0.3) p.rest = 1;
        }
      } else if (p.life < 1) p.y -= dt * p.s; // settle into the ground
      if (w !== i) {
        list[w] = p;
        if (this.mesh.instanceColor) {
          this.mesh.getColorAt(i, this.col);
          this.mesh.setColorAt(w, this.col);
        }
      }
      this.axis.set(p.ax, p.ay, p.az).normalize();
      this.q.setFromAxisAngle(this.axis, p.angle);
      this.v.set(p.x, p.y, p.z);
      this.sc.setScalar(p.s);
      this.m.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(w, this.m);
      w++;
    }
    list.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
