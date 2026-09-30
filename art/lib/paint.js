/*
 * paint.js: a small pixel painter that runs inside LibreSprite's script engine (Duktape, so plain ES5).
 *
 * Sprites are described in metres in a 3/4 top-down view (the same view as the game's ground: the sun in the
 * north-west, heights shown as south-facing walls), painted with lighting into palette *ramps* (AAP-64 colours
 * ordered dark to light, hue-shifted the way pixel artists build them), dithered only where two steps meet, given a
 * selective outline (each edge in the darkest colour of its own ramp), packed into an indexed atlas and saved by
 * LibreSprite as an editable .ase and a .png.
 *
 * tools/art/build.mjs prepends a CFG object and runs this with the script that defines the sprites; see art/README.md.
 */

/* ------------------------------------------------------------------ */
/* Palette ramps (indices into the sprite's palette: 0 is transparent, 1..64 are AAP-64 in order) */

var RAMPS = {
  ink: [1, 2],
  black: [1, 2, 31, 43, 42],
  steel: [2, 31, 43, 42, 41, 40, 39, 38],
  gun: [1, 2, 31, 43, 42, 41, 40],
  rust: [2, 32, 45, 34, 35, 36, 37],
  wood: [2, 32, 33, 64, 63, 62, 61, 60],
  bark: [1, 2, 32, 33, 64, 63, 62],
  char: [1, 2, 32, 33, 64],
  bone: [33, 64, 63, 62, 61, 60, 59, 24],
  sand: [32, 33, 64, 63, 62, 61, 60, 59, 24],
  sandstone: [32, 45, 34, 35, 36, 37, 24],
  rock: [2, 31, 30, 43, 42, 41, 40, 39],
  obsidian: [1, 2, 31, 30, 29, 51],
  green: [2, 17, 16, 15, 14, 13, 12, 11],
  sage: [17, 16, 54, 55, 56, 57, 58],
  olive: [2, 32, 33, 16, 54, 55, 56],
  crystal: [31, 18, 19, 20, 21, 22, 23],
  ice: [31, 18, 52, 51, 50, 49, 23],
  violet: [2, 31, 30, 29, 28, 27, 26, 25],
  red: [2, 3, 4, 5, 6, 7, 8],
  orange: [3, 4, 5, 6, 7, 8, 9],
  yellow: [32, 34, 35, 8, 9, 10, 24],
  tan: [32, 33, 63, 62, 61, 60, 59, 24],
  blue: [2, 31, 18, 19, 52, 51, 50],
  white: [31, 43, 41, 40, 39, 38, 23],
  glass: [1, 2, 31, 18, 52, 20],
  cyanGlow: [18, 19, 20, 21, 22, 23],
  lamp: [5, 6, 7, 8, 9, 10, 23],
  toxic: [17, 16, 14, 13, 12, 11, 10],
  flesh: [3, 44, 45, 46, 47, 48],
  magenta: [3, 4, 28, 27, 26, 25],
  // Ground details are painted in tone: the game lightens or darkens the ground under them by its brightness.
  tone: [1, 2, 31, 43, 42, 41, 40, 39, 38, 23]
};
var RAMP_NAMES = [];
var RAMP_LIST = [];
(function () {
  for (var k in RAMPS) {
    if (RAMPS.hasOwnProperty(k)) {
      RAMP_NAMES.push(k);
      RAMP_LIST.push(RAMPS[k]);
    }
  }
})();
function rid(name) {
  var i = RAMP_NAMES.indexOf(name);
  if (i < 0) throw new Error('no ramp ' + name);
  return i;
}

/* ------------------------------------------------------------------ */
/* Maths */

var LX = -0.501, LY = -0.602, LZ = 0.622;
/** Brightness (0..1) of a surface with normal (nx, ny, nz), lit by the north-west sun with a little sky. */
function lit(nx, ny, nz) {
  var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  var d = (nx * LX + ny * LY + nz * LZ) / l;
  return 0.16 + 0.84 * (0.5 + 0.5 * d);
}
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function hash(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, cell, s) {
  var fx = x / cell, fy = y / cell;
  var gx = Math.floor(fx), gy = Math.floor(fy);
  var tx = fx - gx, ty = fy - gy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  var a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* ------------------------------------------------------------------ */
/* The canvas: per pixel a ramp, a brightness and flags. Coordinates in metres: x east, y south, z up. */

/** How far up the screen one metre of height goes (the 3/4 view). */
var TILT = 0.6;

var F_FLAT = 1; // no dithering
var F_GLOW = 2; // brightness is the ramp step itself (lights), untouched by later shading
var F_NOLINE = 4; // no outline around this pixel

function Canvas(w, d, h, k, pad) {
  this.k = k;
  this.pad = pad;
  this.w = Math.ceil(w * k) + pad * 2;
  this.h = Math.ceil((d + h * TILT) * k) + pad * 2;
  this.ox = pad;
  this.oy = pad + h * TILT * k;
  var n = this.w * this.h;
  this.R = new Int8Array(n);
  for (var i = 0; i < n; i++) this.R[i] = -1;
  this.V = new Float32Array(n);
  this.F = new Uint8Array(n);
  this.seed = 1;
}
Canvas.prototype.X = function (gx) {
  return this.ox + gx * this.k;
};
Canvas.prototype.Y = function (gy, z) {
  return this.oy + (gy - (z || 0) * TILT) * this.k;
};
Canvas.prototype.set = function (x, y, r, v, f) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  var i = y * this.w + x;
  this.R[i] = r;
  this.V[i] = v;
  this.F[i] = f || 0;
};
Canvas.prototype.get = function (x, y) {
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
  return this.R[y * this.w + x];
};
/** Adds to the brightness of what's already painted. */
Canvas.prototype.shade = function (x, y, dv) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  var i = y * this.w + x;
  if (this.R[i] < 0 || this.F[i] & F_GLOW) return;
  this.V[i] = clamp(this.V[i] + dv, 0, 1);
};
/** A pixel (in metres) of a ramp at a brightness. */
Canvas.prototype.dot = function (gx, gy, z, ramp, v, f) {
  this.set(this.X(gx), this.Y(gy, z), rid(ramp), v, f);
};
/** A light: one pixel (two at 4 px a metre) of a glowing ramp, flagged so shading leaves it. */
Canvas.prototype.light = function (gx, gy, z, ramp, v) {
  var r = rid(ramp), x = this.X(gx), y = this.Y(gy, z);
  this.set(x, y, r, v, F_GLOW | F_FLAT);
  if (this.k >= 4) {
    this.set(x + 1, y, r, v * 0.8, F_GLOW | F_FLAT);
    this.set(x, y + 1, r, v * 0.8, F_GLOW | F_FLAT);
  }
};

/** Iterate the pixels of a filled polygon given in pixel coordinates. */
function fillPoly(cv, pts, fn) {
  var minY = 1e9, maxY = -1e9, i;
  for (i = 0; i < pts.length; i += 2) {
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  var y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(cv.h - 1, Math.ceil(maxY));
  for (var y = y0; y <= y1; y++) {
    var cy = y + 0.5, xs = [];
    for (i = 0; i < pts.length; i += 2) {
      var j = (i + 2) % pts.length;
      var ay = pts[i + 1], by = pts[j + 1];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(pts[i] + ((cy - ay) / (by - ay)) * (pts[j] - pts[i]));
    }
    xs.sort(function (a, b) { return a - b; });
    for (var q = 0; q + 1 < xs.length; q += 2) {
      var xa = Math.max(0, Math.round(xs[q])), xb = Math.min(cv.w - 1, Math.round(xs[q + 1]) - 1);
      for (var x = xa; x <= xb; x++) fn(x, y);
    }
  }
}

/** A flat polygon on the ground or at a height: points are [gx, gy, z] triples. v is a number or fn(x, y) -> v. */
Canvas.prototype.poly = function (pts3, ramp, v, f) {
  var pts = [], r = rid(ramp), self = this;
  for (var i = 0; i < pts3.length; i += 3) pts.push(this.X(pts3[i]), this.Y(pts3[i + 1], pts3[i + 2]));
  fillPoly(this, pts, function (x, y) {
    self.set(x, y, r, typeof v === 'function' ? v(x, y) : v, f);
  });
};

/** Clear a polygon (torn edges, holes): points are [gx, gy, z] triples. */
Canvas.prototype.erase = function (pts3) {
  var pts = [], self = this;
  for (var i = 0; i < pts3.length; i += 3) pts.push(this.X(pts3[i]), this.Y(pts3[i + 1], pts3[i + 2]));
  fillPoly(this, pts, function (x, y) {
    self.R[y * self.w + x] = -1;
  });
};

/**
 * An upright prism: a footprint polygon (ground [gx, gy] pairs, any winding) from z0 up to z1. The faces turned to
 * the viewer (south-ish) are drawn lit by their facing, then the top. opt: top/side ramps, bevel, rough.
 */
Canvas.prototype.prism = function (foot, z0, z1, ramp, opt) {
  opt = opt || {};
  var rs = rid(opt.side || ramp), rt = rid(opt.top || ramp), self = this;
  var n = foot.length / 2, area = 0, i;
  for (i = 0; i < n; i++) {
    var a = i * 2, b = ((i + 1) % n) * 2;
    area += foot[a] * foot[b + 1] - foot[b] * foot[a + 1];
  }
  var cw = area > 0 ? 1 : -1;
  var hh = Math.max(1e-6, z1 - z0);
  for (i = 0; i < n; i++) {
    var p = i * 2, q = ((i + 1) % n) * 2;
    var ex = foot[q] - foot[p], ey = foot[q + 1] - foot[p + 1];
    var nx = ey * cw, ny = -ex * cw;
    var nl = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nl;
    ny /= nl;
    if (ny <= 0.02) continue;
    var base = lit(nx, ny, 0) + (opt.sideLift || 0);
    var y0a = this.Y(foot[p + 1], z0), y1a = this.Y(foot[p + 1], z1);
    var pts = [this.X(foot[p]), y0a, this.X(foot[q]), this.Y(foot[q + 1], z0), this.X(foot[q]), this.Y(foot[q + 1], z1), this.X(foot[p]), y1a];
    var span = (y0a - y1a) || 1;
    (function (base, y0a, span) {
      fillPoly(self, pts, function (x, y) {
        // Darker toward the ground (contact shadow), a lit rim along the top.
        var t = clamp((y0a - y) / span, 0, 1);
        var v = base - 0.1 * (1 - t) + (t > 0.9 ? 0.06 : 0);
        if (opt.rough) v += (hash(x, y, self.seed) - 0.5) * opt.rough;
        if (opt.ribs && Math.floor(x / opt.ribs) % 2 === 0) v -= 0.07;
        self.set(x, y, rs, clamp(v, 0, 1), opt.flat ? F_FLAT : 0);
      });
    })(base, y0a, span);
  }
  if (opt.noTop) return;
  var top = [];
  for (i = 0; i < n; i++) top.push(this.X(foot[i * 2]), this.Y(foot[i * 2 + 1], z1));
  var tv = opt.topV !== undefined ? opt.topV : lit(0, 0, 1);
  var bev = opt.bevel === undefined ? 0.1 : opt.bevel;
  var inside = {};
  fillPoly(this, top, function (x, y) {
    inside[y * 4096 + x] = 1;
  });
  fillPoly(this, top, function (x, y) {
    var v = tv;
    // Bevel: edges facing the sun catch it, the far edges fall away.
    if (!inside[(y - 1) * 4096 + x] || !inside[y * 4096 + x - 1]) v += bev;
    else if (!inside[(y + 1) * 4096 + x] || !inside[y * 4096 + x + 1]) v -= bev;
    if (opt.rough) v += (hash(x, y, self.seed + 3) - 0.5) * opt.rough;
    if (opt.topFn) v = opt.topFn(x, y, v);
    self.set(x, y, rt, clamp(v, 0, 1), opt.flat ? F_FLAT : 0);
  });
};

/** An axis-aligned box: min corner (gx, gy), footprint w x d, from z up by h. */
Canvas.prototype.box = function (gx, gy, z, w, d, h, ramp, opt) {
  this.prism([gx, gy, gx + w, gy, gx + w, gy + d, gx, gy + d], z, z + h, ramp, opt);
};

/** A box turned by `a` radians about its centre (cx, cy). */
Canvas.prototype.obox = function (cx, cy, z, w, d, h, a, ramp, opt) {
  var c = Math.cos(a), s = Math.sin(a), f = [];
  var corners = [-w / 2, -d / 2, w / 2, -d / 2, w / 2, d / 2, -w / 2, d / 2];
  for (var i = 0; i < 8; i += 2) f.push(cx + corners[i] * c - corners[i + 1] * s, cy + corners[i] * s + corners[i + 1] * c);
  this.prism(f, z, z + h, ramp, opt);
};

/**
 * A lit ellipsoid (a blob, a dome, a boulder, a canopy): centred over (gx, gy) with its middle at height z, radii
 * rx, ry in plan and rz tall. opt: rough (lumpiness), v (brightness offset), flat.
 */
Canvas.prototype.blob = function (gx, gy, z, rx, ry, rz, ramp, opt) {
  opt = opt || {};
  var r = rid(ramp), k = this.k;
  var cx = this.X(gx), cy = this.Y(gy, z);
  // On screen the blob is rx wide and (ry + rz * TILT) tall.
  var ax = Math.max(0.6, rx * k), ay = Math.max(0.6, Math.sqrt(ry * ry + rz * TILT * rz * TILT) * k);
  var x0 = Math.floor(cx - ax - 1), x1 = Math.ceil(cx + ax + 1), y0 = Math.floor(cy - ay - 1), y1 = Math.ceil(cy + ay + 1);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var dx = (x + 0.5 - cx) / ax, dy = (y + 0.5 - cy) / ay;
      var rough = opt.rough ? (vnoise(x, y, Math.max(1.5, k * 0.6), this.seed + 11) - 0.5) * opt.rough : 0;
      var d2 = dx * dx + dy * dy;
      if (d2 > 1 + rough) continue;
      var nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      // The lower half of the screen ellipse is the blob's south flank.
      var v = lit(dx, dy * 0.9 + 0.15, nz * 1.1) + (opt.v || 0);
      if (opt.rough) v += (hash(x, y, this.seed + 5) - 0.5) * opt.rough * 0.5;
      this.set(x, y, r, clamp(v, 0, 1), opt.flat ? F_FLAT : 0);
    }
  }
};

/**
 * A round rod from (ax, ay, az) to (bx, by, bz) with radii r0 at the start and r1 at the end (branches, pipes,
 * logs, poles, bones), shaded as a cylinder. Rods thinner than a pixel become a 1-pixel line.
 */
Canvas.prototype.rod = function (ax, ay, az, bx, by, bz, r0, r1, ramp, opt) {
  opt = opt || {};
  var r = rid(ramp), k = this.k;
  var x0 = this.X(ax), y0 = this.Y(ay, az), x1 = this.X(bx), y1 = this.Y(by, bz);
  var R0 = r0 * k, R1 = (r1 === undefined ? r0 : r1) * k;
  var vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1e-6, L = Math.sqrt(L2);
  if (Math.max(R0, R1) < 0.75) {
    var steps = Math.ceil(Math.max(Math.abs(vx), Math.abs(vy))) + 1;
    // A thin line: brighter where it faces the sun.
    var lv = lit(-vy / L, vx / L, 0.6) + (opt.v || 0);
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      this.set(x0 + vx * t, y0 + vy * t, r, clamp(lv, 0, 1), opt.flat ? F_FLAT : 0);
    }
    return;
  }
  var pad = Math.max(R0, R1) + 1;
  var bx0 = Math.floor(Math.min(x0, x1) - pad), bx1 = Math.ceil(Math.max(x0, x1) + pad);
  var by0 = Math.floor(Math.min(y0, y1) - pad), by1 = Math.ceil(Math.max(y0, y1) + pad);
  var px = -vy / L, py = vx / L;
  for (var y = by0; y <= by1; y++) {
    for (var x = bx0; x <= bx1; x++) {
      var qx = x + 0.5 - x0, qy = y + 0.5 - y0;
      var tt = clamp((qx * vx + qy * vy) / L2, 0, 1);
      var rad = R0 + (R1 - R0) * tt;
      var ex = qx - vx * tt, ey = qy - vy * tt;
      var dd = Math.sqrt(ex * ex + ey * ey);
      if (dd > rad) continue;
      var side = (ex * px + ey * py) / Math.max(0.5, rad);
      var nz = Math.sqrt(Math.max(0, 1 - side * side));
      var v = lit(px * side, py * side, nz) + (opt.v || 0);
      if (opt.rings && Math.floor(tt * L / opt.rings) % 2 === 0) v -= 0.06;
      this.set(x, y, r, clamp(v, 0, 1), opt.flat ? F_FLAT : 0);
    }
  }
};

/** An upright cylinder (drums, stumps, tanks, posts): a many-sided prism. */
Canvas.prototype.cyl = function (cx, cy, z0, z1, r, ramp, opt) {
  var n = Math.max(8, Math.min(24, Math.round(r * this.k * 3))), f = [];
  for (var i = 0; i < n; i++) f.push(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r);
  this.prism(f, z0, z1, ramp, opt);
};

/**
 * A faceted solid (rocks, crystals, spires, roofs): V is a flat list of [x, y, z] vertices and faces lists vertex
 * indices (3 or 4 per face). Faces turned from the viewer are culled (so draw a convex piece at a time, back to
 * front) and each face is lit flat by its facing. opt.ramps: per-face ramp names; opt.rough; opt.v.
 */
Canvas.prototype.mesh = function (V, faces, ramp, opt) {
  opt = opt || {};
  var n = V.length / 3, cx = 0, cy = 0, cz = 0, i, self = this;
  for (i = 0; i < n; i++) {
    cx += V[i * 3];
    cy += V[i * 3 + 1];
    cz += V[i * 3 + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  for (var fi = 0; fi < faces.length; fi++) {
    var f = faces[fi], a = f[0] * 3, b = f[1] * 3, c = f[2] * 3;
    var ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    var wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    var fx = 0, fy = 0, fz = 0;
    for (i = 0; i < f.length; i++) {
      fx += V[f[i] * 3];
      fy += V[f[i] * 3 + 1];
      fz += V[f[i] * 3 + 2];
    }
    fx /= f.length;
    fy /= f.length;
    fz /= f.length;
    // A lone face (a tarp, a sign, a roof slope) has no inside: it faces whoever looks at it.
    var out = faces.length === 1 ? ny * TILT + nz : (fx - cx) * nx + (fy - cy) * ny + (fz - cz) * nz;
    if (out < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    if (faces.length > 1 && ny * TILT + nz <= 1e-6) continue;
    var pts = [];
    for (i = 0; i < f.length; i++) pts.push(this.X(V[f[i] * 3]), this.Y(V[f[i] * 3 + 1], V[f[i] * 3 + 2]));
    var r = rid(opt.ramps ? opt.ramps[fi] || ramp : ramp);
    var v = lit(nx, ny, nz) + (opt.v || 0);
    (function (r, v) {
      fillPoly(self, pts, function (x, y) {
        var vv = v;
        if (opt.rough) vv += (hash(x, y, self.seed + fi) - 0.5) * opt.rough;
        self.set(x, y, r, clamp(vv, 0, 1), opt.flat ? F_FLAT : 0);
      });
    })(r, v);
  }
};

/** A pyramid: a ground polygon ([x, y] pairs) at z0 rising to an apex [x, y, z]. */
Canvas.prototype.pyramid = function (base, z0, apex, ramp, opt) {
  var V = [], F = [], n = base.length / 2;
  for (var i = 0; i < n; i++) V.push(base[i * 2], base[i * 2 + 1], z0);
  V.push(apex[0], apex[1], apex[2]);
  for (var j = 0; j < n; j++) F.push([j, (j + 1) % n, n]);
  this.mesh(V, F, ramp, opt);
};

/** A 1-pixel line (in metres) of a ramp at a brightness. */
Canvas.prototype.line = function (ax, ay, az, bx, by, bz, ramp, v, f) {
  var r = rid(ramp);
  var x0 = this.X(ax), y0 = this.Y(ay, az), x1 = this.X(bx), y1 = this.Y(by, bz);
  var steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, v, f);
  }
};

/** Modulate every painted pixel: fn(x, y, ramp, v) returns the new brightness (or undefined to keep it). */
Canvas.prototype.each = function (fn) {
  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      var i = y * this.w + x;
      if (this.R[i] < 0 || this.F[i] & F_GLOW) continue;
      var v = fn(x, y, RAMP_NAMES[this.R[i]], this.V[i]);
      if (v !== undefined) this.V[i] = clamp(v, 0, 1);
    }
  }
};
/** Recolour painted pixels of one ramp where fn(x, y) says so (rust patches, moss, paint wear). */
Canvas.prototype.stain = function (from, to, fn) {
  var a = rid(from), b = rid(to);
  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      var i = y * this.w + x;
      if (this.R[i] === a && fn(x, y, this.k)) this.R[i] = b;
    }
  }
};

/** Rim light: the sun catches the top edge of every shape, the bottom edge falls into shade. */
Canvas.prototype.rim = function (up, down) {
  var w = this.w, h = this.h, R = this.R, V = this.V, F = this.F, dv = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = y * w + x;
      if (R[i] < 0 || F[i] & F_GLOW) continue;
      if (y === 0 || R[i - w] < 0 || (R[i - w] !== R[i] && V[i - w] < V[i] - 0.25)) dv[i] += up;
      else if (x > 0 && R[i - 1] < 0) dv[i] += up * 0.5;
      if (y === h - 1 || R[i + w] < 0) dv[i] -= down;
    }
  }
  for (var j = 0; j < w * h; j++) if (dv[j]) V[j] = clamp(V[j] + dv[j], 0, 1);
};

/** Selective outline: every empty pixel next to paint takes the darkest colour of its neighbour's ramp. */
Canvas.prototype.outline = function (opt) {
  opt = opt || {};
  var w = this.w, h = this.h, R = this.R, add = [];
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = y * w + x;
      if (R[i] >= 0) continue;
      var best = -1;
      var nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (var q = 0; q < 4; q++) {
        var j = nb[q];
        if (j >= 0 && R[j] >= 0 && !(this.F[j] & F_NOLINE)) {
          best = R[j];
          if (q === 2) break; // prefer the colour above (the object's own bottom edge)
        }
      }
      if (best >= 0) add.push(i, best);
    }
  }
  for (var a = 0; a < add.length; a += 2) {
    this.R[add[a]] = opt.ramp !== undefined ? rid(opt.ramp) : add[a + 1];
    this.V[add[a]] = 0;
    this.F[add[a]] = F_FLAT;
  }
  // Inner lines: where one ramp sits over another, the lower one darkens a step (plates, panels, limbs read).
  if (opt.inner !== false) {
    for (var yy = 1; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var ii = yy * w + xx, up = ii - w;
        if (R[ii] >= 0 && R[up] >= 0 && R[ii] !== R[up] && !(this.F[ii] & F_GLOW) && this.V[ii] > 0.2) this.V[ii] -= 0.12;
      }
    }
  }
};

/** Palette indices: brightness to a ramp step, ordered-dithered only near the boundary between two steps. */
Canvas.prototype.quantize = function () {
  var out = new Uint8Array(this.w * this.h);
  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      var i = y * this.w + x, r = this.R[i];
      if (r < 0) continue;
      var ramp = RAMP_LIST[r], n = ramp.length;
      var f = this.F[i], t = this.V[i] * (n - 1);
      var dth = f & F_FLAT ? 0 : ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * 0.5;
      out[i] = ramp[clamp(Math.round(t + dth), 0, n - 1)];
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Atlases */

/**
 * Sprites: {name, w, d, h, draw(cv, k)}: a footprint w x d metres, h tall; the anchor (the world position) is the
 * middle of the footprint on the ground. Each atlas is painted once per scale (pixels per metre).
 */
function packAtlas(sprites, k, width) {
  var list = [], i;
  for (i = 0; i < sprites.length; i++) {
    var s = sprites[i];
    var pad = s.pad !== undefined ? s.pad : 2;
    var cw = Math.ceil(s.w * k) + pad * 2, ch = Math.ceil((s.d + s.h * TILT) * k) + pad * 2;
    list.push({ s: s, w: cw, h: ch, pad: pad });
  }
  var order = list.slice().sort(function (a, b) { return b.h - a.h || b.w - a.w; });
  var x = 0, y = 0, rowH = 0;
  for (i = 0; i < order.length; i++) {
    var e = order[i];
    if (x + e.w > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    e.x = x;
    e.y = y;
    x += e.w;
    rowH = Math.max(rowH, e.h);
  }
  return { w: width, h: y + rowH, list: list };
}

function runAtlas(name, sprites, scales) {
  var meta = { name: name, scales: {} };
  for (var si = 0; si < scales.length; si++) {
    var k = scales[si];
    var key = name + '@' + k;
    var pack = packAtlas(sprites, k, CFG.width ? CFG.width * k / 4 : 64 * k);
    if (CFG.mode === 'layout') {
      console.log('@@LAYOUT ' + JSON.stringify({ key: key, w: pack.w, h: pack.h }));
      continue;
    }
    var doc = app.open(CFG.templates[key]);
    var spr = doc.sprite;
    var img = spr.layer(0).cel(0).image;
    if (img.width !== pack.w || img.height !== pack.h) throw new Error('template size ' + img.width + 'x' + img.height + ' != ' + pack.w + 'x' + pack.h);
    var buf = new Uint8Array(img.stride * img.height);
    var rects = {};
    for (var i = 0; i < pack.list.length; i++) {
      var e = pack.list[i], s = e.s;
      var cv = new Canvas(s.w, s.d, s.h, k, e.pad);
      cv.seed = i * 31 + 7;
      s.draw(cv, k);
      if (s.rim !== false) cv.rim(0.12, 0.1);
      if (s.outline !== false) cv.outline(s.outlineOpt);
      var q = cv.quantize();
      for (var y = 0; y < cv.h; y++) for (var x = 0; x < cv.w; x++) if (q[y * cv.w + x]) buf[(e.y + y) * img.stride + e.x + x] = q[y * cv.w + x];
      // [x, y, w, h, anchor x, anchor y, height in px] in the atlas.
      rects[s.name] = [e.x, e.y, cv.w, cv.h, Math.round(cv.X(s.w / 2)), Math.round(cv.Y(s.d / 2, 0)), Math.round(s.h * TILT * k)];
    }
    img.putImageData(buf);
    spr.saveAs(CFG.ase[key], false);
    spr.saveAs(CFG.png[key], true);
    meta.scales[k] = { w: pack.w, h: pack.h, sprites: rects };
    console.log('saved ' + key + ' ' + pack.w + 'x' + pack.h + ' (' + pack.list.length + ' sprites)');
  }
  if (CFG.mode !== 'layout') console.log('@@META ' + JSON.stringify(meta));
}
