/*
 * props.js: the wasteland's props, painted in LibreSprite (see art/lib/paint.js for the brushes).
 *
 * Every kind of prop the world scatters (mapgen's PropKind) gets four designs, picked by the prop's variant:
 * dead trees, barrels, signs, crates, wrecks, bones, skulls, pipes, spikes, crystals, cacti, mushrooms, antennas
 * and tents. A few have a snowed-on copy (name + 's') for the frozen grounds. Footprints are in metres; the atlas
 * is painted at 8 and 4 pixels a metre: props are drawn twice life size, so a wreck or a skeleton reads as one
 * next to a 200-metre Titan (the ground itself is 4 and 2 pixels a metre up close).
 */

var S = [];
function def(name, w, d, h, draw, o) {
  var s = { name: name, w: w, d: d, h: h, draw: draw };
  if (o) for (var key in o) if (o.hasOwnProperty(key)) s[key] = o[key];
  S.push(s);
  return s;
}
function rng(seed) {
  var s = seed | 0;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
/** Patches (rust, moss, paint wear) about `cell` metres across, covering more as thr drops. */
function patchy(cell, seed, thr) {
  return function (x, y, k) {
    return vnoise(x, y, cell * k, seed) + (hash(x, y, seed) - 0.5) * 0.12 > thr;
  };
}
/** Rust creeping up from the bottom edges and seams, with a few patches higher up. */
function rusty(cv, paint, seed, amt) {
  cv.stain(paint, 'rust', function (x, y, k) {
    var below = 0;
    for (var d = 1; d <= Math.max(2, k * 0.4); d++) if (cv.get(x, y + d) !== rid(paint)) below++;
    var n = vnoise(x, y, 0.8 * k, seed);
    return (below > 0 && n > 0.45 - amt * 0.3) || n > 0.78 - amt * 0.25;
  });
}
/** Snow settles on whatever faces up: lit pixels of the given ramps turn to ice. */
function snowed(draw, ramps) {
  return function (cv, k) {
    draw(cv, k);
    for (var i = 0; i < ramps.length; i++) {
      (function (r) {
        cv.stain(r, 'ice', function (x, y) {
          return cv.V[y * cv.w + x] > 0.6 && hash(x, y, 9) > 0.15;
        });
      })(ramps[i]);
    }
  };
}
/** Draw rods back to front (far and low first). */
function drawRods(cv, rods, ramp, opt) {
  rods.sort(function (a, b) {
    return (a[1] + a[4]) * TILT + (a[2] + a[5]) - ((b[1] + b[4]) * TILT + (b[2] + b[5]));
  });
  for (var i = 0; i < rods.length; i++) {
    var r = rods[i];
    cv.rod(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8] || ramp, opt);
  }
}

/* ------------------------------------------------------------------ */
/* Dead trees */

function tree(cv, x, y, h, seed, ramp, opt) {
  opt = opt || {};
  var R = rng(seed), rods = [];
  function branch(ax, ay, az, dx, dy, dz, len, r, depth) {
    var bx = ax + dx * len, by = ay + dy * len, bz = az + dz * len;
    rods.push([ax, ay, az, bx, by, bz, r, r * 0.62]);
    if (depth <= 0) return;
    var n = depth > 1 ? 2 + Math.floor(R() * 2) : 1 + Math.floor(R() * 2);
    for (var i = 0; i < n; i++) {
      var a = Math.atan2(dy, dx) + (R() - 0.5) * 2.4;
      var ndz = clamp(dz * 0.6 + (R() - 0.25) * 0.7, -0.2, 0.95);
      var nh = Math.sqrt(1 - ndz * ndz);
      branch(bx, by, bz, Math.cos(a) * nh, Math.sin(a) * nh, ndz, len * (0.5 + R() * 0.25), r * 0.58, depth - 1);
    }
  }
  var th = h * (opt.trunk || 0.4);
  var lean = (R() - 0.5) * 0.4;
  rods.push([x, y, 0, x + lean, y - 0.1, th, 0.24, 0.17]);
  // Roots along the ground.
  for (var q = 0; q < 5; q++) {
    var ra = (q / 5) * Math.PI * 2 + R();
    rods.push([x, y, 0.1, x + Math.cos(ra) * 0.8, y + Math.sin(ra) * 0.6, 0, 0.14, 0.04]);
  }
  var nb = opt.branches || 4;
  for (var i = 0; i < nb; i++) {
    var a = (i / nb) * Math.PI * 2 + R() * 0.8;
    var dz = 0.45 + R() * 0.35, nh = Math.sqrt(1 - dz * dz);
    branch(x + lean, y - 0.1, th * (0.8 + R() * 0.2), Math.cos(a) * nh, Math.sin(a) * nh, dz, h * 0.28, 0.13, opt.depth || 2);
  }
  drawRods(cv, rods, ramp);
}

def('deadtree0', 5, 5, 6.5, function (cv) {
  tree(cv, 2.5, 2.7, 6, 11, 'bark');
});
def('deadtree1', 5.4, 2, 1, function (cv) {
  // A fallen log: the cut end shows its rings, broken limbs stick up.
  cv.rod(0.4, 1.0, 0.35, 4.8, 1.25, 0.3, 0.36, 0.28, 'bark', { rings: 3 });
  cv.rod(1.6, 1.0, 0.6, 1.2, 0.3, 1.1, 0.1, 0.04, 'bark');
  cv.rod(3.2, 1.2, 0.55, 3.8, 0.6, 1.0, 0.09, 0.03, 'bark');
  cv.rod(2.4, 1.3, 0.5, 2.9, 1.9, 0.7, 0.08, 0.03, 'bark');
  cv.blob(4.85, 1.26, 0.3, 0.16, 0.3, 0.3, 'wood', { v: 0.18 });
  cv.dot(4.85, 1.26, 0.32, 'wood', 0.35);
});
def('deadtree2', 2.6, 2.4, 1.2, function (cv) {
  // A stump on its roots, rings on the saw cut.
  var R = rng(5);
  for (var q = 0; q < 6; q++) {
    var a = (q / 6) * Math.PI * 2 + R() * 0.5;
    cv.rod(1.3, 1.2, 0.15, 1.3 + Math.cos(a) * 1.1, 1.2 + Math.sin(a) * 0.9, 0, 0.16, 0.05, 'bark');
  }
  cv.cyl(1.3, 1.2, 0, 0.8, 0.45, 'bark', {
    top: 'wood',
    rough: 0.15,
    topFn: function (x, y, v) {
      var dx = x + 0.5 - cv.X(1.3), dy = y + 0.5 - cv.Y(1.2, 0.8);
      return v + (Math.floor(Math.sqrt(dx * dx + dy * dy) / (cv.k * 0.12)) % 2 ? -0.1 : 0.05);
    }
  });
  cv.rod(1.5, 1.1, 0.8, 1.7, 0.9, 1.15, 0.08, 0.05, 'bark');
});
def('deadtree3', 3.4, 3.4, 7, function (cv) {
  // A burnt snag: a tall charred trunk with two snapped limbs.
  tree(cv, 1.7, 2, 6.8, 29, 'char', { trunk: 0.7, branches: 3, depth: 1 });
});
def('deadtree0s', 5, 5, 6.5, snowed(function (cv) {
  tree(cv, 2.5, 2.7, 6, 11, 'bark');
}, ['bark']));
def('deadtree3s', 3.4, 3.4, 7, snowed(function (cv) {
  tree(cv, 1.7, 2, 6.8, 29, 'bark', { trunk: 0.7, branches: 3, depth: 1 });
}, ['bark']));

/* ------------------------------------------------------------------ */
/* Barrels */

function drum(cv, x, y, z, paint, opt) {
  opt = opt || {};
  var r = 0.42, h = 1.15;
  cv.cyl(x, y, z, z + h, r, paint, { rough: 0.08, bevel: 0.16 });
  // Rolling hoops, the lid's bung, rust.
  for (var zz = 0.35; zz < h; zz += 0.4) {
    for (var a = 0.1; a < Math.PI - 0.1; a += 0.08) cv.shade(cv.X(x + Math.cos(a) * r), cv.Y(y + Math.sin(a) * r, z + zz), -0.18);
  }
  cv.dot(x + 0.18, y - 0.1, z + h, 'black', 0.2);
  cv.dot(x - 0.2, y + 0.05, z + h, paint, 0.95);
  if (opt.rust !== false) cv.stain(paint, 'rust', patchy(1, opt.seed || 3, 0.64));
  if (opt.stripe) {
    for (var b = 0; b < Math.PI; b += 0.05) {
      var px = cv.X(x + Math.cos(b) * r);
      for (var s = 0; s < cv.k * 0.3; s++) {
        var py = cv.Y(y + Math.sin(b) * r, z + 0.55) - s;
        if (cv.get(Math.floor(px), Math.floor(py)) >= 0) cv.set(px, py, rid(Math.floor((b * 6) % 2) ? opt.stripe : 'black'), 0.5, F_FLAT);
      }
    }
  }
}
def('barrel0', 1.2, 1.2, 1.3, function (cv) {
  drum(cv, 0.6, 0.6, 0, 'red', { seed: 4 });
});
def('barrel1', 2.6, 2.2, 1.3, function (cv) {
  drum(cv, 0.7, 0.65, 0, 'red', { seed: 7 });
  drum(cv, 1.75, 0.7, 0, 'yellow', { seed: 8 });
  drum(cv, 1.2, 1.55, 0, 'steel', { seed: 9 });
});
def('barrel2', 2.4, 1.6, 1, function (cv) {
  // Knocked over and leaking: an oil slick with a sheen.
  cv.poly([1.5, 0.5, 0, 2.3, 0.6, 0, 2.4, 1.2, 0, 1.9, 1.55, 0, 1.3, 1.3, 0], 'black', function (x, y) {
    return hash(x, y, 3) > 0.9 ? 0.75 : 0.25;
  });
  cv.rod(0.3, 0.8, 0.42, 1.45, 0.9, 0.42, 0.42, 0.42, 'orange', { rings: 1.6 });
  cv.stain('orange', 'rust', patchy(1, 12, 0.6));
  cv.blob(1.5, 0.9, 0.42, 0.14, 0.38, 0.38, 'black', { v: -0.1 });
});
def('barrel3', 2, 2, 1.3, function (cv) {
  // Toxic waste: a glowing puddle around a hazard-striped drum.
  cv.poly([0.2, 0.9, 0, 0.9, 0.35, 0, 1.8, 0.6, 0, 1.9, 1.5, 0, 1.0, 1.9, 0, 0.3, 1.6, 0], 'toxic', function (x, y) {
    return 0.35 + vnoise(x, y, 2, 5) * 0.5;
  }, F_GLOW);
  drum(cv, 1.0, 1.0, 0, 'yellow', { seed: 21, stripe: 'yellow', rust: false });
  cv.stain('yellow', 'rust', patchy(0.8, 22, 0.7));
  cv.light(1.15, 0.9, 1.16, 'toxic', 0.9);
});

/* ------------------------------------------------------------------ */
/* Signs */

def('sign0', 1.2, 0.8, 2.8, function (cv) {
  // A diamond warning sign on a post, shot up.
  cv.rod(0.6, 0.4, 0, 0.6, 0.4, 1.9, 0.06, 0.06, 'steel');
  cv.poly([0.1, 0.4, 2.0, 0.6, 0.4, 2.5, 1.1, 0.4, 2.0, 0.6, 0.4, 1.5], 'yellow', 0.72);
  cv.poly([0.18, 0.4, 2.0, 0.6, 0.4, 2.42, 1.02, 0.4, 2.0, 0.6, 0.4, 1.58], 'yellow', 0.86);
  cv.line(0.6, 0.4, 2.3, 0.6, 0.4, 2.05, 'black', 0.1, F_FLAT);
  cv.dot(0.6, 0.4, 1.9, 'black', 0.1, F_FLAT);
  cv.dot(0.42, 0.4, 2.12, 'black', 0.2, F_FLAT);
  cv.dot(0.8, 0.4, 1.86, 'black', 0.2, F_FLAT);
  cv.stain('yellow', 'rust', patchy(0.64, 31, 0.68));
});
def('sign1', 4.4, 0.8, 3.2, function (cv) {
  // A billboard: two legs, a torn panel of faded stripes.
  cv.rod(1.0, 0.4, 0, 1.0, 0.4, 1.5, 0.08, 0.08, 'wood');
  cv.rod(3.4, 0.4, 0, 3.4, 0.4, 1.5, 0.08, 0.08, 'wood');
  cv.poly([0.2, 0.4, 1.4, 4.2, 0.4, 1.4, 4.2, 0.4, 3.0, 0.2, 0.4, 3.0], 'white', function (x, y) {
    return 0.62 + (hash(x, y, 2) - 0.5) * 0.15;
  });
  cv.poly([0.2, 0.4, 2.0, 4.2, 0.4, 2.0, 4.2, 0.4, 2.45, 0.2, 0.4, 2.45], 'red', 0.55);
  cv.poly([0.4, 0.4, 1.55, 1.6, 0.4, 1.55, 1.6, 0.4, 1.85, 0.4, 0.4, 1.85], 'blue', 0.55);
  // The torn corner, and weathering.
  cv.erase([3.3, 0.4, 3.05, 4.3, 0.4, 3.05, 4.3, 0.4, 2.2]);
  cv.stain('white', 'tan', patchy(0.88, 41, 0.6));
  cv.stain('red', 'rust', patchy(0.8, 43, 0.6));
  cv.line(0.2, 0.4, 1.4, 4.2, 0.4, 1.4, 'wood', 0.3);
  cv.line(0.2, 0.4, 3.0, 3.2, 0.4, 3.0, 'wood', 0.7);
});
def('sign2', 2.4, 0.8, 2.6, function (cv) {
  // A wooden signpost with two arrow boards.
  cv.rod(1.2, 0.4, 0, 1.2, 0.4, 2.4, 0.08, 0.07, 'wood');
  cv.poly([0.2, 0.4, 2.05, 1.6, 0.4, 2.05, 1.6, 0.4, 2.35, 0.2, 0.4, 2.35, 0.0, 0.4, 2.2], 'wood', 0.72);
  cv.poly([0.8, 0.4, 1.45, 2.2, 0.4, 1.45, 2.4, 0.4, 1.6, 2.2, 0.4, 1.75, 0.8, 0.4, 1.75], 'wood', 0.6);
  cv.line(0.4, 0.4, 2.2, 1.3, 0.4, 2.2, 'bark', 0.2, F_FLAT);
  cv.line(1.1, 0.4, 1.6, 2.0, 0.4, 1.6, 'bark', 0.2, F_FLAT);
});
def('sign3', 1.4, 1, 2.6, function (cv) {
  // A stop sign, the post bent over by something big.
  cv.rod(0.5, 0.6, 0, 0.55, 0.6, 1.1, 0.06, 0.06, 'steel');
  cv.rod(0.55, 0.6, 1.1, 0.95, 0.5, 1.9, 0.06, 0.06, 'steel');
  var pts = [], cx = 0.95, cz = 2.05, r = 0.42;
  for (var i = 0; i < 8; i++) {
    var a = (i / 8) * Math.PI * 2 + Math.PI / 8 + 0.2;
    pts.push(cx + Math.cos(a) * r, 0.5, cz + Math.sin(a) * r * 0.9);
  }
  cv.poly(pts, 'red', 0.62);
  cv.line(cx - 0.25, 0.5, cz, cx + 0.25, 0.5, cz + 0.05, 'white', 0.9, F_FLAT);
  cv.stain('red', 'rust', patchy(0.6, 51, 0.7));
});

/* ------------------------------------------------------------------ */
/* Crates */

function crate(cv, x, y, z, w, d, h, ramp, seed) {
  var k = cv.k;
  cv.box(x, y, z, w, d, h, ramp, {
    rough: 0.1,
    topFn: function (px, py, v) {
      return v + (Math.floor((px - cv.X(x)) / Math.max(1, k * 0.3)) % 2 ? -0.06 : 0.04);
    }
  });
  // Frame and cross brace on the south face.
  var y0 = cv.Y(y + d, z), y1 = cv.Y(y + d, z + h), x0 = cv.X(x), x1 = cv.X(x + w) - 1;
  for (var py = Math.ceil(y1); py < y0; py++) {
    cv.shade(x0, py, 0.12);
    cv.shade(x1, py, -0.12);
    var t = (py - y1) / (y0 - y1);
    cv.shade(x0 + t * (x1 - x0), py, -0.18);
    cv.shade(x1 - t * (x1 - x0), py, -0.18);
  }
  for (var px = x0; px <= x1; px++) cv.shade(px, Math.ceil(y1), 0.1);
}
def('crate0', 1.6, 1.6, 1.4, function (cv) {
  crate(cv, 0.2, 0.25, 0, 1.2, 1.1, 1.1, 'wood', 1);
});
def('crate1', 3, 2.6, 2.4, function (cv) {
  crate(cv, 0.2, 0.3, 0, 1.3, 1.2, 1.1, 'wood', 2);
  crate(cv, 1.6, 0.4, 0, 1.2, 1.1, 1.0, 'wood', 3);
  crate(cv, 0.8, 1.4, 0, 1.2, 1.1, 1.0, 'wood', 4);
  crate(cv, 0.5, 0.45, 1.1, 1.1, 1.0, 0.95, 'wood', 5);
});
def('crate2', 3, 2, 1.6, function (cv) {
  // Army ammo boxes, stencilled.
  var list = [[0.2, 0.2, 0], [1.55, 0.25, 0], [0.3, 1.0, 0], [1.6, 1.05, 0], [0.9, 0.5, 0.6]];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    cv.box(b[0], b[1], b[2], 1.25, 0.72, 0.58, 'olive', { rough: 0.06, bevel: 0.14 });
    cv.line(b[0] + 0.3, b[1] + 0.3, b[2] + 0.58, b[0] + 0.9, b[1] + 0.3, b[2] + 0.58, 'yellow', 0.75, F_FLAT);
    cv.dot(b[0] + 0.12, b[1] + 0.72, b[2] + 0.35, 'black', 0.2);
  }
});
def('crate3', 6.4, 2.8, 3, function (cv) {
  // A shipping container, corrugated, rust eating up from the bottom.
  cv.box(0.2, 0.2, 0, 6, 2.4, 2.5, 'flesh', {
    ribs: Math.max(1, cv.k * 0.25),
    rough: 0.04,
    topFn: function (x, y, v) {
      return v + (Math.floor(x / Math.max(1, cv.k * 0.5)) % 2 ? -0.05 : 0.03);
    }
  });
  rusty(cv, 'flesh', 61, 0.5);
  // Door bars and a stencilled number on the side.
  for (var i = 0; i < 2; i++) cv.line(5.7 + i * 0.25, 2.6, 0.1, 5.7 + i * 0.25, 2.6, 2.4, 'steel', 0.6);
  cv.line(1.0, 2.6, 1.9, 2.4, 2.6, 1.9, 'white', 0.8, F_FLAT);
  cv.line(1.0, 2.6, 1.75, 1.8, 2.6, 1.75, 'white', 0.7, F_FLAT);
});

/* ------------------------------------------------------------------ */
/* Wrecks */

function car(cv, cx, cy, a, len, wid, paint, seed, opt) {
  opt = opt || {};
  var c = Math.cos(a), s = Math.sin(a);
  function P(u, v) {
    return [cx + u * c - v * s, cy + u * s + v * c];
  }
  function quad(q, ramp, o) {
    var V = [];
    for (var i = 0; i < q.length; i += 3) {
      var p = P(q[i], q[i + 1]);
      V.push(p[0], p[1], q[i + 2]);
    }
    cv.mesh(V, [[0, 1, 2, 3]], ramp, o);
  }
  var wheels = [[len * 0.3, -wid * 0.42], [-len * 0.32, -wid * 0.42], [len * 0.3, wid * 0.42], [-len * 0.32, wid * 0.42]];
  for (var i = 0; i < 4; i++) {
    if (opt.missing === i) continue;
    var p = P(wheels[i][0], wheels[i][1]);
    cv.blob(p[0], p[1], 0.32, 0.36, 0.16, 0.32, 'black');
  }
  // The body, its hood and boot lines.
  cv.obox(cx, cy, 0.28, len, wid, 0.52, a, paint, { rough: 0.05, bevel: 0.16 });
  var w2 = wid * 0.4, zb = 0.8, zr = 1.3;
  var f0 = len * (opt.bed ? 0.32 : 0.18), f1 = len * (opt.bed ? 0.2 : 0.04), r0 = opt.bed ? len * 0.02 : -len * 0.2, r1 = opt.bed ? len * 0.0 : -len * 0.3;
  var h0 = P(f0 + 0.05, -wid * 0.48), h1 = P(f0 + 0.05, wid * 0.48);
  cv.line(h0[0], h0[1], zb, h1[0], h1[1], zb, paint, 0.45);
  if (opt.bed) {
    // A pickup's open bed: a rusty floor inside low walls.
    var b = P(-len * 0.24, 0);
    cv.obox(b[0], b[1], zb - 0.02, len * 0.48, wid * 0.84, 0.03, a, 'rust', { topV: 0.3, bevel: 0 });
    var bw = P(-len * 0.24, wid * 0.44);
    cv.obox(bw[0], bw[1], zb, len * 0.48, 0.1, 0.22, a, paint, { bevel: 0.1 });
    var bn = P(-len * 0.24, -wid * 0.44);
    cv.obox(bn[0], bn[1], zb, len * 0.48, 0.1, 0.22, a, paint, { bevel: 0.1 });
    var bt = P(-len * 0.47, 0);
    cv.obox(bt[0], bt[1], zb, 0.12, wid * 0.9, 0.22, a, paint, { bevel: 0.1 });
  }
  // The glasshouse: windscreen, roof, rear window, and the side windows we can see.
  quad([f0, -w2, zb, f0, w2, zb, f1, w2, zr, f1, -w2, zr], 'glass', { v: 0.12 });
  if (!opt.bed) quad([r0, -w2, zr, r0, w2, zr, r1, w2, zb, r1, -w2, zb], 'glass', { v: 0.05 });
  else quad([r0, -w2, zr, r0, w2, zr, r1, w2, zb, r1, -w2, zb], 'glass', { v: 0.0 });
  var rc = P((f1 + r0) / 2, 0);
  cv.obox(rc[0], rc[1], zr - 0.06, f1 - r0, w2 * 2, 0.06, a, paint, { topV: 0.8, bevel: 0.14 });
  quad([f0 - 0.1, w2 + 0.02, zb + 0.04, r1 + 0.08, w2 + 0.02, zb + 0.04, r0, w2 + 0.02, zr - 0.08, f1, w2 + 0.02, zr - 0.08], 'glass', { v: -0.05 });
  var hl = P(len * 0.5, wid * 0.3), hr = P(len * 0.5, -wid * 0.3);
  cv.dot(hl[0], hl[1], 0.62, 'white', 0.9, F_FLAT);
  cv.dot(hr[0], hr[1], 0.62, 'white', 0.8, F_FLAT);
  rusty(cv, paint, seed, opt.rust || 0.4);
  cv.stain('glass', 'black', function (x, y) {
    return hash(x, y, seed) > 0.8;
  });
}
def('wreckcar0', 5, 2.6, 1.6, function (cv) {
  car(cv, 2.5, 1.3, 0.14, 4.4, 1.9, 'blue', 71);
});
def('wreckcar1', 5.8, 2.8, 1.6, function (cv) {
  car(cv, 2.9, 1.4, -0.2, 5.1, 2.0, 'orange', 72, { bed: true, missing: 3, rust: 0.6 });
});
def('wreckcar2', 11, 3.6, 3.2, function (cv) {
  // A school bus: a row of windows, a black stripe, the roof rusting through.
  var a = -0.06, len = 10, wid = 2.5, cx = 5.5, cy = 1.8, c = Math.cos(a), s = Math.sin(a);
  function P(u, v) {
    return [cx + u * c - v * s, cy + u * s + v * c];
  }
  var wl = [[3.4, -1.1], [-3.4, -1.1], [3.4, 1.1], [-3.4, 1.1]];
  for (var i = 0; i < 4; i++) {
    var p = P(wl[i][0], wl[i][1]);
    cv.blob(p[0], p[1], 0.45, 0.5, 0.2, 0.45, 'black');
  }
  cv.obox(cx, cy, 0.4, len, wid, 2.3, a, 'yellow', { rough: 0.08, bevel: 0.12 });
  cv.obox(cx, cy, 1.55, len * 0.98, wid, 0.6, a, 'yellow', { side: 'glass', noTop: true });
  for (var u = -4.6; u <= 4.6; u += 0.9) {
    var q = P(u, wid / 2);
    cv.line(q[0], q[1], 1.55, q[0], q[1], 2.15, 'yellow', 0.45);
  }
  var s0 = P(-len / 2, wid / 2), s1 = P(len / 2, wid / 2);
  cv.line(s0[0], s0[1], 1.15, s1[0], s1[1], 1.15, 'black', 0.2, F_FLAT);
  rusty(cv, 'yellow', 73, 0.45);
  cv.stain('glass', 'black', function (x, y) {
    return hash(x, y, 74) > 0.6;
  });
  var v1 = P(1.5, 0), v2 = P(-2.5, 0);
  cv.obox(v1[0], v1[1], 2.7, 0.8, 0.8, 0.12, a, 'steel');
  cv.obox(v2[0], v2[1], 2.7, 0.8, 0.8, 0.12, a, 'steel');
});
def('wreckcar3', 8, 4.2, 3, function (cv) {
  // A dead tank: tracks, a scorched hull, the turret knocked askew and its gun drooping.
  var a = 0.1, cx = 4, cy = 2.1, c = Math.cos(a), s = Math.sin(a);
  function P(u, v) {
    return [cx + u * c - v * s, cy + u * s + v * c];
  }
  var tn = P(0, -1.45), ts = P(0, 1.45);
  cv.obox(tn[0], tn[1], 0, 6.8, 0.8, 0.9, a, 'gun', { rough: 0.1 });
  cv.obox(cx, cy, 0.3, 6.4, 2.3, 0.95, a, 'olive', { rough: 0.04, bevel: 0.16 });
  // Engine deck grille at the back.
  for (var g = 0; g < 5; g++) {
    var gp = P(-2.2 + g * 0.22, -0.6), gq = P(-2.2 + g * 0.22, 0.6);
    cv.line(gp[0], gp[1], 1.25, gq[0], gq[1], 1.25, 'olive', 0.3);
  }
  cv.obox(ts[0], ts[1], 0, 6.8, 0.8, 0.9, a, 'gun', { rough: 0.1 });
  // Road wheels on the near track.
  for (var u = -2.8; u <= 2.8; u += 0.93) {
    var w = P(u, 1.86);
    cv.blob(w[0], w[1], 0.42, 0.34, 0.05, 0.34, 'steel', { v: -0.15 });
  }
  var t = P(-0.3, 0.1);
  cv.cyl(t[0], t[1], 1.25, 1.9, 1.1, 'olive', { rough: 0.04, bevel: 0.2 });
  cv.cyl(t[0] - 0.35, t[1] - 0.25, 1.9, 2.02, 0.32, 'olive', { bevel: 0.2 });
  var m0 = P(0.6, 0.35), m1 = P(3.6, 1.35);
  cv.rod(m0[0], m0[1], 1.55, m1[0], m1[1], 0.9, 0.14, 0.12, 'gun');
  cv.dot(t[0] - 0.3, t[1] - 0.2, 1.9, 'black', 0.2);
  cv.stain('olive', 'char', function (x, y, k) {
    var dx = x - cv.X(t[0] + 0.4), dy = y - cv.Y(t[1], 1.9);
    return Math.sqrt(dx * dx + dy * dy) < k * (0.7 + vnoise(x, y, k * 0.4, 81) * 0.8);
  });
  rusty(cv, 'olive', 82, 0.25);
});

/* ------------------------------------------------------------------ */
/* Bones and skulls */

function ribcage(cv, x0, x1, y, rise, span, seed) {
  var rods = [], n = Math.max(3, Math.round((x1 - x0) / 0.3));
  for (var i = 0; i < n; i++) {
    var x = x0 + ((x1 - x0) * (i + 0.5)) / n, r = 0.05 + span * 0.02;
    var sp = span * (1 - Math.abs(i / n - 0.4) * 0.6);
    rods.push([x, y, 0.15, x + 0.1, y - sp * 0.55, rise, r, r * 0.8]);
    rods.push([x + 0.1, y - sp * 0.55, rise, x + 0.2, y - sp, 0.05, r * 0.8, r * 0.5]);
    rods.push([x, y, 0.15, x + 0.1, y + sp * 0.55, rise, r, r * 0.8]);
    rods.push([x + 0.1, y + sp * 0.55, rise, x + 0.2, y + sp, 0.05, r * 0.8, r * 0.5]);
  }
  rods.push([x0 - 0.2, y, 0.15, x1 + 0.2, y, 0.18, 0.08 + span * 0.02, 0.06, 'bone']);
  drawRods(cv, rods, 'bone');
}
function skull(cv, x, y, z, r, opt) {
  opt = opt || {};
  if (opt.horns) {
    // Horns sweep back and up behind the head.
    cv.rod(x - r * 0.7, y - r * 0.1, z + r * 1.2, x - r * 1.5, y - r * 0.5, z + r * 1.8, r * 0.22, r * 0.14, 'bone');
    cv.rod(x - r * 1.5, y - r * 0.5, z + r * 1.8, x - r * 1.7, y - r * 1.1, z + r * 2.5, r * 0.14, r * 0.04, 'bark');
    cv.rod(x + r * 0.7, y - r * 0.1, z + r * 1.2, x + r * 1.5, y - r * 0.5, z + r * 1.8, r * 0.22, r * 0.14, 'bone');
    cv.rod(x + r * 1.5, y - r * 0.5, z + r * 1.8, x + r * 1.7, y - r * 1.1, z + r * 2.5, r * 0.14, r * 0.04, 'bark');
  }
  // Cranium, cheekbones, the jaw and muzzle in front (south).
  cv.blob(x, y - r * 0.1, z + r, r, r * 0.95, r * 0.85, 'bone', { v: 0.04 });
  cv.blob(x, y + r * 0.55, z + r * 0.45, r * 0.66, r * 0.5, r * 0.42, 'bone', { v: -0.02 });
  var k = cv.k, big = r * k >= 3;
  var ez = z + r * 0.95, ey = y + r * 0.35;
  if (big) {
    // Deep sockets, a nose hole, a row of teeth.
    cv.blob(x - r * 0.4, ey, ez, r * 0.27, r * 0.1, r * 0.26, 'black', { v: -0.3, flat: true });
    cv.blob(x + r * 0.4, ey, ez, r * 0.27, r * 0.1, r * 0.26, 'black', { v: -0.3, flat: true });
    cv.poly([x - r * 0.1, y + r * 0.62, z + r * 0.72, x + r * 0.1, y + r * 0.62, z + r * 0.72, x, y + r * 0.62, z + r * 0.95], 'black', 0.05, F_FLAT);
    var ty = cv.Y(y + r * 0.98, z + r * 0.3), tx0 = cv.X(x - r * 0.42), tx1 = cv.X(x + r * 0.42);
    for (var tx = Math.round(tx0); tx <= tx1; tx++) {
      cv.set(tx, ty, rid('bone'), (tx & 1) ? 0.95 : 0.2, F_FLAT);
      cv.set(tx, ty + 1, rid('bone'), (tx & 1) ? 0.7 : 0.1, F_FLAT);
    }
    // A crack across the dome.
    cv.line(x + r * 0.1, y - r * 0.5, z + r * 1.8, x + r * 0.45, y - r * 0.1, z + r * 1.5, 'bone', 0.2, F_FLAT);
  } else {
    cv.dot(x - r * 0.38, ey, ez, 'black', 0.05, F_FLAT);
    cv.dot(x + r * 0.38, ey, ez, 'black', 0.05, F_FLAT);
  }
}
function bone(cv, x, y, z, a, len, r) {
  var dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
  cv.rod(x - dx, y - dy, z, x + dx, y + dy, z, r, r, 'bone');
  cv.blob(x - dx, y - dy, z, r * 1.6, r * 1.6, r * 1.4, 'bone');
  cv.blob(x + dx, y + dy, z, r * 1.6, r * 1.6, r * 1.4, 'bone');
}
def('bones0', 2.6, 1.8, 0.9, function (cv) {
  ribcage(cv, 0.5, 2.1, 0.9, 0.62, 0.62, 1);
});
def('bones1', 2.6, 2, 0.4, function (cv) {
  var R = rng(17);
  for (var i = 0; i < 6; i++) bone(cv, 0.4 + R() * 1.8, 0.4 + R() * 1.2, 0.08, R() * Math.PI, 0.5 + R() * 0.5, 0.06);
  skull(cv, 1.9, 1.3, 0, 0.26);
});
def('bones2', 9, 4, 2.4, function (cv) {
  // Some huge beast's skeleton: a curved spine, ribs taller than a man, a horned skull.
  ribcage(cv, 2.2, 6.2, 2.0, 1.9, 1.6, 3);
  var R = rng(23);
  for (var i = 0; i < 10; i++) cv.blob(6.4 + i * 0.22, 2.0 + Math.sin(i * 0.5) * 0.3, 0.15, 0.13, 0.13, 0.12, 'bone');
  bone(cv, 5.0, 3.5, 0.1, 0.3, 1.4, 0.1);
  bone(cv, 3.0, 3.6, 0.1, -0.5, 1.2, 0.1);
  skull(cv, 1.2, 2.2, 0, 0.62, { horns: true });
  for (var j = 0; j < 4; j++) bone(cv, 7.2 + R() * 1.2, 0.6 + R() * 2.8, 0.08, R() * 3, 0.6, 0.06);
});
def('bones3', 2.4, 2.4, 1.4, function (cv) {
  // A bone pile with a skull on top.
  var R = rng(31);
  for (var i = 0; i < 16; i++) {
    var a = R() * Math.PI * 2, d = R() * 0.9;
    bone(cv, 1.2 + Math.cos(a) * d, 1.2 + Math.sin(a) * d * 0.8, 0.1 + (0.9 - d) * 0.6, R() * Math.PI, 0.5 + R() * 0.4, 0.06);
  }
  skull(cv, 1.2, 1.25, 0.55, 0.3);
});
def('skull0', 1.2, 1.2, 0.8, function (cv) {
  bone(cv, 0.6, 0.55, 0.06, 0.6, 0.9, 0.05);
  bone(cv, 0.6, 0.55, 0.06, -0.6, 0.9, 0.05);
  skull(cv, 0.6, 0.55, 0, 0.3);
});
def('skull1', 3, 2.2, 1.8, function (cv) {
  skull(cv, 1.5, 1.0, 0, 0.55, { horns: true });
});
def('skull2', 1.4, 1, 3, function (cv) {
  // A raider's warning: a skull on a pike, rags tied below it.
  cv.rod(0.7, 0.5, 0, 0.7, 0.5, 2.3, 0.06, 0.05, 'wood');
  cv.poly([0.7, 0.5, 1.9, 1.2, 0.5, 1.75, 1.05, 0.5, 1.35, 0.72, 0.5, 1.55], 'red', 0.5);
  cv.poly([0.7, 0.5, 1.8, 0.3, 0.5, 1.6, 0.4, 0.5, 1.3], 'tan', 0.55);
  skull(cv, 0.7, 0.5, 2.1, 0.26);
});
def('skull3', 4.6, 3.6, 2.8, function (cv) {
  // A giant's skull half sunk in drifted sand.
  cv.blob(2.3, 2.3, 0.1, 2.1, 1.1, 0.35, 'sand', { rough: 0.3 });
  skull(cv, 2.3, 1.6, -0.2, 1.2);
  cv.stain('bone', 'sand', function (x, y) {
    return y > cv.Y(2.7, 0.3) && hash(x, y, 5) > 0.3;
  });
  cv.blob(1.6, 1.3, 1.95, 0.35, 0.3, 0.12, 'sand', { rough: 0.4 });
});

/* ------------------------------------------------------------------ */
/* Pipes */

function pipeRun(cv, ax, ay, az, bx, by, bz, r, ramp) {
  cv.rod(ax, ay, az, bx, by, bz, r, r, ramp, { rings: 5 });
  var L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
  // Flanges every few metres.
  for (var t = 0; t <= 1.001; t += 2.2 / Math.max(2.2, L)) {
    var x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    var ux = (bx - ax) / L * 0.08, uy = (by - ay) / L * 0.08;
    cv.rod(x - ux, y - uy, z, x + ux, y + uy, z, r * 1.25, r * 1.25, ramp, { v: 0.05 });
  }
}
def('pipe0', 5.6, 1.6, 1.2, function (cv) {
  pipeRun(cv, 0.4, 0.7, 0.45, 5.2, 0.9, 0.45, 0.45, 'steel');
  cv.blob(5.25, 0.9, 0.45, 0.12, 0.38, 0.38, 'black', { v: -0.1 });
  cv.stain('steel', 'rust', patchy(0.96, 91, 0.62));
});
def('pipe1', 3, 2.4, 2.2, function (cv) {
  // A valve junction: a riser, a run, a red handwheel and a gauge.
  pipeRun(cv, 0.2, 1.4, 0.4, 2.8, 1.4, 0.4, 0.34, 'steel');
  cv.cyl(1.5, 1.3, 0, 1.5, 0.3, 'steel', { bevel: 0.16 });
  cv.cyl(1.5, 1.3, 1.5, 1.62, 0.36, 'steel');
  for (var a = 0; a < Math.PI * 2; a += 0.25) cv.dot(1.5 + Math.cos(a) * 0.5, 1.3 + Math.sin(a) * 0.5, 1.85, 'red', 0.6, F_FLAT);
  cv.rod(1.5, 1.3, 1.62, 1.5, 1.3, 1.85, 0.05, 0.05, 'steel');
  cv.blob(1.95, 1.62, 1.0, 0.14, 0.05, 0.14, 'white', { v: 0.1 });
  cv.stain('steel', 'rust', patchy(0.8, 93, 0.66));
});
def('pipe2', 8.4, 1.8, 2.2, function (cv) {
  // An old pipeline on H-frames, broken off and dripping into a glowing pool.
  cv.poly([6.4, 1.0, 0, 7.8, 0.8, 0, 8.2, 1.5, 0, 7.0, 1.7, 0], 'toxic', function (x, y) {
    return 0.3 + vnoise(x, y, 2, 7) * 0.5;
  }, F_GLOW);
  for (var i = 0; i < 3; i++) {
    var x = 1.0 + i * 2.6;
    cv.rod(x, 0.6, 0, x, 0.6, 1.3, 0.07, 0.07, 'gun');
    cv.rod(x, 1.2, 0, x, 1.2, 1.3, 0.07, 0.07, 'gun');
    cv.rod(x, 0.6, 1.0, x, 1.2, 1.0, 0.06, 0.06, 'gun');
  }
  pipeRun(cv, 0.2, 0.9, 1.45, 7.2, 0.9, 1.45, 0.38, 'steel');
  cv.blob(7.25, 0.9, 1.45, 0.1, 0.3, 0.3, 'black', { v: -0.1 });
  cv.light(7.3, 1.1, 0.9, 'toxic', 0.8);
  cv.light(7.35, 1.2, 0.4, 'toxic', 0.7);
  cv.stain('steel', 'rust', patchy(1.04, 95, 0.52));
});
def('pipe3', 3.6, 3.2, 1.8, function (cv) {
  // A stack of pipes seen end on.
  var rows = [[0.62, 0.45, [0.7, 1.8, 2.9]], [1.3, 0.45, [1.25, 2.35]], [1.95, 0.45, [1.8]]];
  for (var r = 0; r < rows.length; r++) {
    for (var i = 0; i < rows[r][2].length; i++) {
      var x = rows[r][2][i], z = rows[r][0] - 0.2;
      cv.rod(x, 0.3, z, x, 2.7, z, 0.5, 0.5, 'steel');
      cv.blob(x, 2.72, z, 0.5, 0.06, 0.5, 'steel', { v: 0.12 });
      cv.blob(x, 2.74, z, 0.3, 0.04, 0.3, 'black', { v: -0.2 });
    }
  }
  cv.stain('steel', 'rust', patchy(0.88, 97, 0.6));
});

/* ------------------------------------------------------------------ */
/* Spikes */

function spire(cv, x, y, r, h, ramp, seed) {
  var R = rng(seed), base = [], n = 5;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 + R() * 0.6;
    var rr = r * (0.75 + R() * 0.4);
    base.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8);
  }
  cv.pyramid(base, 0, [x + (R() - 0.5) * r * 0.6, y + (R() - 0.5) * r * 0.4, h], ramp, { rough: 0.06 });
}
def('spike0', 1.6, 1.4, 3, function (cv) {
  spire(cv, 0.8, 0.8, 0.55, 2.8, 'obsidian', 3);
});
def('spike1', 2.4, 2.2, 1.8, function (cv) {
  // A Czech hedgehog: three welded girders.
  var c = [1.2, 1.1, 0.7];
  cv.rod(c[0] - 0.9, c[1] - 0.5, 0.05, c[0] + 0.9, c[1] + 0.5, 1.35, 0.1, 0.1, 'gun');
  cv.rod(c[0] + 0.9, c[1] - 0.6, 0.05, c[0] - 0.9, c[1] + 0.6, 1.35, 0.1, 0.1, 'gun');
  cv.rod(c[0], c[1] - 0.9, 1.35, c[0], c[1] + 0.9, 0.05, 0.1, 0.1, 'gun');
  cv.stain('gun', 'rust', patchy(0.72, 101, 0.55));
});
def('spike2', 3.6, 1.8, 1.6, function (cv) {
  // A barricade of sharpened stakes, lashed to a rail.
  cv.rod(0.2, 0.7, 0.5, 3.4, 0.75, 0.5, 0.1, 0.1, 'bark');
  for (var i = 0; i < 7; i++) {
    var x = 0.35 + i * 0.48;
    cv.rod(x, 0.5, 0, x + 0.05, 1.25, 1.2, 0.09, 0.05, 'wood');
    cv.dot(x + 0.05, 1.25, 1.22, 'char', 0.3, F_FLAT);
  }
});
def('spike3', 3, 2.6, 3.4, function (cv) {
  spire(cv, 1.0, 0.9, 0.45, 2.2, 'rock', 7);
  spire(cv, 2.1, 1.0, 0.5, 3.2, 'rock', 8);
  spire(cv, 1.5, 1.8, 0.4, 1.6, 'rock', 9);
  spire(cv, 0.6, 1.9, 0.3, 1.0, 'rock', 10);
});

/* ------------------------------------------------------------------ */
/* Crystals */

function shard(cv, x, y, tx, ty, tz, r, ramp) {
  // A six-sided crystal from a base on the ground to a point (tx, ty, tz), with a bright core.
  var V = [], F = [], n = 6, L = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y) + tz * tz);
  var ux = (tx - x) / L, uy = (ty - y) / L, uz = tz / L;
  // Two axes across the shard.
  var ax = -uy, ay = ux, az = 0, al = Math.sqrt(ax * ax + ay * ay) || 1;
  ax /= al;
  ay /= al;
  if (al < 1e-3) {
    ax = 1;
    ay = 0;
  }
  var bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;
  var neck = 0.72;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    V.push(x + ax * c + bx * s, y + ay * c + by * s, Math.max(0, az * c + bz * s));
    V.push(x + (tx - x) * neck + ax * c + bx * s, y + (ty - y) * neck + ay * c + by * s, tz * neck + az * c + bz * s);
  }
  V.push(tx, ty, tz);
  for (var j = 0; j < n; j++) {
    var p = j * 2, q = ((j + 1) % n) * 2;
    F.push([p, q, q + 1, p + 1]);
    F.push([p + 1, q + 1, n * 2]);
  }
  cv.mesh(V, F, ramp, { v: 0.06 });
}
function glowPool(cv, x, y, rx, ry, ramp) {
  cv.poly((function () {
    var p = [];
    for (var i = 0; i < 10; i++) p.push(x + Math.cos((i / 10) * Math.PI * 2) * rx, y + Math.sin((i / 10) * Math.PI * 2) * ry, 0);
    return p;
  })(), ramp, function (px, py) {
    return 0.1 + hash(px, py, 2) * 0.2;
  }, F_GLOW | F_NOLINE);
  // Light pools thin out to a speckle toward the rim.
  var cx0 = cv.X(x), cy0 = cv.Y(y, 0);
  for (var yy = 0; yy < cv.h; yy++) {
    for (var xx = 0; xx < cv.w; xx++) {
      var i = yy * cv.w + xx;
      if (cv.R[i] !== rid(ramp) || !(cv.F[i] & F_GLOW)) continue;
      var dx = (xx - cx0) / (rx * cv.k), dy = (yy - cy0) / (ry * cv.k);
      if (dx * dx + dy * dy > 0.35 && hash(xx, yy, 7) > 0.45) cv.R[i] = -1;
    }
  }
}
def('crystal0', 2.2, 2, 2.6, function (cv) {
  glowPool(cv, 1.1, 1.1, 1.0, 0.8, 'cyanGlow');
  shard(cv, 0.8, 0.9, 0.5, 0.6, 1.6, 0.22, 'crystal');
  shard(cv, 1.2, 1.0, 1.3, 0.7, 2.4, 0.3, 'crystal');
  shard(cv, 1.5, 1.2, 1.95, 1.1, 1.3, 0.2, 'crystal');
  shard(cv, 0.9, 1.3, 0.6, 1.6, 0.9, 0.16, 'crystal');
});
def('crystal1', 1.6, 1.4, 3.6, function (cv) {
  glowPool(cv, 0.8, 0.8, 0.7, 0.5, 'cyanGlow');
  shard(cv, 0.8, 0.8, 0.9, 0.6, 3.3, 0.32, 'ice');
  shard(cv, 0.5, 1.0, 0.25, 1.1, 1.0, 0.14, 'ice');
});
def('crystal2', 2.2, 2, 2.6, function (cv) {
  glowPool(cv, 1.1, 1.1, 1.0, 0.8, 'violet');
  shard(cv, 0.7, 1.0, 0.4, 0.7, 1.4, 0.2, 'violet');
  shard(cv, 1.1, 0.9, 1.2, 0.6, 2.4, 0.28, 'violet');
  shard(cv, 1.5, 1.1, 1.9, 0.9, 1.6, 0.22, 'violet');
  shard(cv, 1.2, 1.4, 1.4, 1.7, 1.0, 0.16, 'violet');
});
def('crystal3', 2.8, 2.4, 2.6, function (cv) {
  cv.mesh([0.3, 1.4, 0, 2.5, 1.5, 0, 1.4, 0.4, 0, 1.3, 2.2, 0, 1.2, 1.3, 0.9, 1.9, 1.4, 0.6], [[0, 4, 3], [3, 4, 5], [5, 4, 2], [0, 2, 4], [1, 5, 3], [1, 2, 5]], 'rock', { rough: 0.08 });
  shard(cv, 1.2, 1.2, 0.9, 0.9, 2.3, 0.22, 'crystal');
  shard(cv, 1.6, 1.3, 2.1, 1.1, 1.7, 0.18, 'crystal');
  shard(cv, 1.0, 1.5, 0.6, 1.8, 1.2, 0.14, 'crystal');
});

/* ------------------------------------------------------------------ */
/* Cacti */

function saguaro(cv, x, y, h, ramp, arms) {
  var r = 0.28;
  var rods = [[x, y, 0, x, y, h, r, r * 0.9]];
  for (var i = 0; i < arms.length; i++) {
    var A = arms[i];
    rods.push([x, y, A[1], x + A[0], y + A[2], A[1] + 0.25, r * 0.72, r * 0.72]);
    rods.push([x + A[0], y + A[2], A[1] + 0.2, x + A[0] * 1.05, y + A[2], A[1] + A[3], r * 0.72, r * 0.62]);
  }
  drawRods(cv, rods, ramp);
  // Ribs and spines.
  cv.each(function (px, py, rr, v) {
    if (rr !== ramp) return;
    if (Math.floor(px + py * 0.1) % 2 === 0) v -= 0.07;
    if (hash(px, py, 13) > 0.94) v += 0.3;
    return v;
  });
}
def('cactus0', 2, 1.4, 3.8, function (cv) {
  saguaro(cv, 1.0, 0.8, 3.5, 'green', [[-0.65, 1.2, 0, 1.2], [0.6, 1.7, 0.05, 1.0]]);
  cv.light(1.0, 0.8, 3.55, 'magenta', 0.9);
});
def('cactus1', 1.4, 1.4, 1.2, function (cv) {
  cv.blob(0.7, 0.7, 0.45, 0.5, 0.5, 0.48, 'green', { rough: 0.1 });
  cv.each(function (px, py, r, v) {
    if (r !== 'green') return;
    var a = Math.atan2(py - cv.Y(0.7, 0.9), px - cv.X(0.7));
    return v + (Math.floor(a * 3) % 2 ? -0.08 : 0.04);
  });
  cv.light(0.6, 0.6, 0.95, 'magenta', 0.8);
  cv.light(0.85, 0.72, 0.92, 'yellow', 0.9);
});
def('cactus2', 2.2, 1.6, 1.8, function (cv) {
  // Prickly pear: paddles with red fruit.
  var pads = [[0.8, 0.9, 0.5, 0.36, 0.1, 0.46], [1.35, 0.85, 0.55, 0.34, 0.1, 0.44], [1.05, 0.95, 1.1, 0.3, 0.1, 0.4], [0.6, 1.0, 1.1, 0.26, 0.1, 0.34], [1.55, 0.95, 1.2, 0.24, 0.08, 0.32]];
  for (var i = 0; i < pads.length; i++) {
    var p = pads[i];
    cv.blob(p[0], p[1], p[2], p[3], p[4], p[5], 'sage', { v: 0.04 });
  }
  cv.light(1.05, 0.95, 1.5, 'red', 0.7);
  cv.light(1.55, 0.95, 1.52, 'red', 0.8);
  cv.light(0.55, 1.0, 1.42, 'red', 0.7);
});
def('cactus3', 2, 1.6, 3.4, function (cv) {
  // Dead and dried: bleached, leaning, one arm fallen off.
  saguaro(cv, 1.0, 0.9, 3.0, 'tan', [[0.6, 1.4, 0.05, 0.9]]);
  cv.rod(0.2, 1.3, 0.12, 0.9, 1.5, 0.12, 0.17, 0.15, 'tan');
  cv.stain('tan', 'bark', function (x, y) {
    return hash(x, y, 3) > 0.88;
  });
});

/* ------------------------------------------------------------------ */
/* Mushrooms */

function shroom(cv, x, y, h, r, cap, glow) {
  cv.rod(x, y, 0, x + 0.05, y, h, r * 0.28, r * 0.22, 'bone');
  cv.blob(x + 0.05, y, h, r, r * 0.9, r * 0.35, cap, { v: 0.04 });
  // Gills glowing under the rim, spots on top.
  for (var a = 0.3; a < Math.PI - 0.3; a += 0.12) cv.set(cv.X(x + 0.05 + Math.cos(a) * r * 0.85), cv.Y(y + Math.sin(a) * r * 0.8, h - r * 0.15), rid(glow), 0.85, F_GLOW | F_FLAT);
  var R = rng(Math.floor(x * 100 + y * 10));
  for (var i = 0; i < Math.max(1, Math.round(r * 5)); i++) {
    var sa = R() * Math.PI * 2, sd = R() * r * 0.6;
    cv.dot(x + 0.05 + Math.cos(sa) * sd, y + Math.sin(sa) * sd * 0.7 - r * 0.2, h + r * 0.3, 'white', 0.9, F_FLAT);
  }
}
def('mushroom0', 2, 1.8, 1.6, function (cv) {
  glowPool(cv, 1.0, 1.0, 0.9, 0.7, 'violet');
  shroom(cv, 0.6, 0.7, 0.8, 0.32, 'violet', 'magenta');
  shroom(cv, 1.3, 0.8, 1.2, 0.42, 'violet', 'magenta');
  shroom(cv, 0.9, 1.3, 0.5, 0.24, 'violet', 'magenta');
  shroom(cv, 1.55, 1.35, 0.4, 0.18, 'violet', 'magenta');
});
def('mushroom1', 3, 2.6, 2.8, function (cv) {
  glowPool(cv, 1.5, 1.4, 1.3, 1.0, 'violet');
  shroom(cv, 1.45, 1.3, 1.9, 1.15, 'violet', 'magenta');
});
def('mushroom2', 3.6, 1.8, 1.4, function (cv) {
  // Shelf fungus climbing a rotten log.
  cv.rod(0.3, 0.9, 0.35, 3.3, 1.0, 0.35, 0.36, 0.32, 'bark', { rings: 2 });
  var sh = [[0.9, 1.2, 0.55, 0.3], [1.5, 1.25, 0.7, 0.36], [2.2, 1.2, 0.5, 0.28], [2.7, 1.25, 0.72, 0.24], [1.2, 0.8, 0.72, 0.22]];
  for (var i = 0; i < sh.length; i++) cv.blob(sh[i][0], sh[i][1], sh[i][2], sh[i][3], sh[i][3] * 0.6, 0.06, 'orange', { v: 0.1 });
});
def('mushroom3', 1.8, 1.6, 1.2, function (cv) {
  glowPool(cv, 0.9, 0.9, 0.8, 0.6, 'cyanGlow');
  shroom(cv, 0.6, 0.8, 0.6, 0.24, 'crystal', 'cyanGlow');
  shroom(cv, 1.1, 0.7, 0.85, 0.3, 'crystal', 'cyanGlow');
  shroom(cv, 1.25, 1.15, 0.45, 0.2, 'crystal', 'cyanGlow');
  shroom(cv, 0.8, 1.25, 0.35, 0.16, 'crystal', 'cyanGlow');
});

/* ------------------------------------------------------------------ */
/* Antennas */

function lattice(cv, ax, ay, az, bx, by, bz, wdt, ramp) {
  // Two rails and a zig-zag brace between them.
  var dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  var ox = -dy / L * wdt / 2, oy = dx / L * wdt / 2;
  if (Math.abs(dz) > Math.abs(dx) + Math.abs(dy)) {
    ox = wdt / 2;
    oy = 0;
  }
  cv.line(ax - ox, ay - oy, az, bx - ox, by - oy, bz, ramp, 0.45);
  cv.line(ax + ox, ay + oy, az, bx + ox, by + oy, bz, ramp, 0.75);
  var n = Math.max(2, Math.round(L / 0.45));
  for (var i = 0; i < n; i++) {
    var t0 = i / n, t1 = (i + 1) / n, s = i % 2 ? 1 : -1;
    cv.line(ax + dx * t0 + ox * s, ay + dy * t0 + oy * s, az + dz * t0, ax + dx * t1 - ox * s, ay + dy * t1 - oy * s, az + dz * t1, ramp, 0.55);
  }
}
def('antenna0', 2.4, 2.4, 7.6, function (cv) {
  // A lattice mast on guy wires, a red beacon on top.
  cv.line(1.2, 1.2, 4.6, 0.1, 0.4, 0, 'steel', 0.35);
  cv.line(1.2, 1.2, 4.6, 2.3, 0.5, 0, 'steel', 0.35);
  cv.box(0.9, 0.95, 0, 0.6, 0.5, 0.2, 'rock');
  lattice(cv, 1.2, 1.2, 0, 1.2, 1.2, 7.0, 0.36, 'steel');
  cv.line(1.2, 1.2, 4.6, 1.3, 2.3, 0, 'steel', 0.5);
  cv.rod(1.2, 1.2, 7.0, 1.2, 1.2, 7.4, 0.03, 0.03, 'steel');
  cv.light(1.2, 1.2, 7.35, 'lamp', 0.3);
});
def('antenna1', 2.6, 2.4, 3.2, function (cv) {
  // A dish on a pedestal, tilted at the sky.
  cv.box(1.0, 1.2, 0, 0.6, 0.6, 1.0, 'steel', { bevel: 0.14 });
  cv.rod(1.3, 1.5, 1.0, 1.3, 1.4, 1.5, 0.12, 0.12, 'steel');
  var cx = cv.X(1.3), cy = cv.Y(1.2, 2.1), rx = 1.15 * cv.k, ry = 0.95 * cv.k;
  for (var y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      // Concave: lit on the far (south-east) inside, a rim all round.
      cv.set(x, y, rid('white'), d2 > 0.8 ? 0.85 : clamp(0.35 + (dx + dy) * 0.25 + d2 * 0.2, 0, 1), 0);
    }
  }
  cv.rod(1.3, 1.2, 2.1, 1.05, 1.05, 2.75, 0.04, 0.03, 'steel');
  cv.blob(1.02, 1.03, 2.8, 0.1, 0.1, 0.08, 'steel');
  cv.stain('white', 'tan', patchy(0.8, 111, 0.66));
});
def('antenna2', 7, 3, 1, function (cv) {
  // A mast brought down across the ground.
  cv.box(0.3, 1.2, 0, 0.6, 0.5, 0.25, 'rock');
  lattice(cv, 0.6, 1.4, 0.3, 6.6, 1.9, 0.25, 0.36, 'steel');
  cv.line(6.4, 1.9, 0.3, 6.8, 1.5, 0.2, 'steel', 0.5);
  cv.stain('steel', 'rust', patchy(0.8, 113, 0.55));
});
def('antenna3', 2.6, 2, 3.4, function (cv) {
  // A field comms box: a solar panel, whip aerials, a blinking lamp.
  cv.box(0.4, 0.7, 0, 1.2, 0.8, 0.8, 'olive', { bevel: 0.14 });
  cv.poly([1.5, 0.3, 0.6, 2.4, 0.3, 0.6, 2.4, 1.0, 0.2, 1.5, 1.0, 0.2], 'blue', function (x, y) {
    return (x % 3 === 0 || y % 3 === 0) ? 0.25 : 0.6;
  });
  cv.line(0.6, 0.9, 0.8, 0.45, 0.8, 3.2, 'black', 0.4);
  cv.line(1.3, 0.9, 0.8, 1.45, 0.85, 2.6, 'black', 0.4);
  cv.light(0.8, 1.5, 0.6, 'toxic', 0.9);
});

/* ------------------------------------------------------------------ */
/* Tents */

def('tent0', 3, 3.6, 2.2, function (cv) {
  // An A-frame of patched canvas seen from its door end, guy ropes pegged out.
  cv.line(0.3, 1.0, 0.2, 1.5, 0.5, 1.8, 'bark', 0.4);
  cv.line(2.7, 3.0, 0.2, 1.5, 3.1, 1.8, 'bark', 0.4);
  cv.mesh([0.35, 0.5, 0, 0.35, 3.1, 0, 1.5, 3.1, 1.8, 1.5, 0.5, 1.8], [[0, 1, 2, 3]], 'tan', { rough: 0.05 });
  cv.mesh([2.65, 0.5, 0, 2.65, 3.1, 0, 1.5, 3.1, 1.8, 1.5, 0.5, 1.8], [[0, 1, 2, 3]], 'tan', { rough: 0.05 });
  cv.mesh([0.35, 3.1, 0, 2.65, 3.1, 0, 1.5, 3.1, 1.8], [[0, 1, 2]], 'tan', { v: -0.05 });
  cv.poly([1.05, 3.1, 0, 1.5, 3.1, 1.1, 1.95, 3.1, 0], 'black', 0.12, F_FLAT);
  cv.poly([1.5, 3.1, 1.1, 1.95, 3.1, 0, 2.2, 3.1, 0], 'tan', 0.85);
  cv.rod(1.5, 0.35, 1.8, 1.5, 3.3, 1.8, 0.04, 0.04, 'bark');
  cv.stain('tan', 'olive', patchy(1.2, 121, 0.74));
});
def('tent1', 3.2, 3, 1.8, function (cv) {
  // A military dome tent, seamed, its door flap open.
  cv.blob(1.6, 1.5, 0.05, 1.4, 1.3, 1.35, 'olive', { v: 0.02 });
  cv.each(function (x, y, r, v) {
    if (r !== 'olive') return;
    var dx = x - cv.X(1.6);
    return Math.abs(dx) < 0.6 || Math.abs(Math.abs(dx) - cv.k * 0.7) < 0.6 ? v - 0.12 : v;
  });
  cv.poly([1.3, 2.75, 0, 1.6, 2.75, 1.0, 1.9, 2.75, 0], 'black', 0.08);
});
def('tent2', 3.8, 3.2, 2.2, function (cv) {
  // A blue tarp lean-to on two poles over a crate and a bedroll.
  cv.rod(0.4, 0.5, 0, 0.4, 0.5, 1.8, 0.05, 0.05, 'wood');
  cv.rod(3.4, 0.5, 0, 3.4, 0.5, 1.8, 0.05, 0.05, 'wood');
  cv.mesh([0.2, 0.45, 1.85, 3.6, 0.45, 1.85, 3.7, 1.9, 0.5, 0.1, 1.9, 0.5], [[0, 1, 2, 3]], 'blue', { rough: 0.04, v: 0.08 });
  cv.each(function (x, y, r, v) {
    return r === 'blue' && Math.floor((x + y * 0.3) / Math.max(2, cv.k * 0.6)) % 2 ? v - 0.08 : undefined;
  });
  cv.line(0.1, 1.9, 0.5, -0.1, 2.8, 0, 'bark', 0.4);
  cv.line(3.7, 1.9, 0.5, 3.9, 2.8, 0, 'bark', 0.4);
  crate(cv, 0.6, 2.0, 0, 0.9, 0.8, 0.7, 'wood', 7);
  cv.rod(1.9, 2.5, 0.15, 3.2, 2.6, 0.15, 0.18, 0.18, 'red', { rings: 0.5 });
});
def('tent3', 3.6, 3, 1.2, function (cv) {
  // A collapsed tent: sagging canvas, a pole poking out, torn.
  cv.blob(1.8, 1.5, 0.1, 1.5, 1.2, 0.5, 'tan', { rough: 0.45 });
  cv.rod(1.0, 1.3, 0.4, 0.2, 0.8, 1.1, 0.05, 0.04, 'bark');
  cv.rod(2.6, 1.5, 0.4, 3.3, 2.2, 0.9, 0.05, 0.04, 'bark');
  cv.stain('tan', 'black', function (x, y) {
    return vnoise(x, y, 2, 131) > 0.78;
  });
});

runAtlas('props', S, [8, 4]);
