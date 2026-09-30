/*
 * nature.js: tree crowns and boulders, painted in LibreSprite (art/lib/paint.js has the brushes).
 *
 * The ground stamps a crown over the woods and hedgerows (one per few metres of tree tiles, so they overlap into a
 * canopy) and a boulder on every boulder tile, in the stone of the ground around it. Painted at 6 and 3 pixels a
 * metre: half as big again as life, stamped into the 4 and 2 pixel-a-metre ground.
 */

var S = [];
function def(name, w, d, h, draw, o) {
  var s = { name: name, w: w, d: d, h: h, draw: draw };
  if (o) for (var key in o) if (o.hasOwnProperty(key)) s[key] = o[key];
  S.push(s);
}
function rng(seed) {
  var s = seed | 0;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/* ------------------------------------------------------------------ */
/* Broadleaf crowns: clumps of leaves piled into a dome, dappled, a trunk showing under the south edge. */

function crown(cv, cx, cy, R, top, ramp, seed, opt) {
  opt = opt || {};
  var r = rng(seed);
  cv.rod(cx, cy + R * 0.2, 0, cx, cy + R * 0.1, top * 0.55, R * 0.14, R * 0.1, opt.trunk || 'bark');
  // Clumps, back to front: the outer ring low, the middle high.
  var clumps = [];
  var n = opt.clumps || 11;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 + r() * 0.5, d = R * (0.45 + r() * 0.35);
    clumps.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, top * (0.78 + r() * 0.1), R * (0.42 + r() * 0.16)]);
  }
  for (var j = 0; j < 4; j++) {
    var b = r() * Math.PI * 2, e = R * r() * 0.3;
    clumps.push([cx + Math.cos(b) * e, cy + Math.sin(b) * e, top * (0.95 + r() * 0.08), R * (0.45 + r() * 0.15)]);
  }
  clumps.sort(function (p, q) {
    return p[1] * TILT + p[2] - (q[1] * TILT + q[2]);
  });
  for (var k = 0; k < clumps.length; k++) {
    var c = clumps[k];
    cv.blob(c[0], c[1], c[2], c[3], c[3] * 0.9, c[3] * 0.7, ramp, { rough: 0.35, v: opt.v === undefined ? -0.16 : opt.v });
  }
  // Dapple: sunlit leaves and dark gaps, a few leaves in a second colour.
  cv.each(function (x, y, rr, v) {
    if (rr !== ramp) return;
    var h = hash(x, y, seed);
    if (h > 0.9) return v + 0.18;
    if (h < 0.08) return v - 0.22;
    return v;
  });
  if (opt.accent) {
    cv.stain(ramp, opt.accent, function (x, y) {
      return vnoise(x, y, cv.k * 0.7, seed + 3) > 0.66 && cv.V[y * cv.w + x] > 0.5;
    });
  }
}

def('oak0', 5, 5, 6, function (cv) {
  crown(cv, 2.5, 2.6, 2.1, 5, 'green', 11);
});
def('oak1', 4.4, 4.4, 5.4, function (cv) {
  crown(cv, 2.2, 2.3, 1.8, 4.6, 'green', 12, { accent: 'sage' });
});
def('oak2', 5.6, 5.4, 6.4, function (cv) {
  crown(cv, 2.8, 2.8, 2.4, 5.4, 'green', 13, { clumps: 13 });
});
def('birch0', 3.6, 3.6, 5.4, function (cv) {
  crown(cv, 1.8, 1.9, 1.45, 4.8, 'sage', 14, { trunk: 'white', clumps: 9, v: -0.1 });
});
def('autumn0', 4.6, 4.6, 5.6, function (cv) {
  crown(cv, 2.3, 2.4, 1.9, 4.8, 'orange', 15, { accent: 'yellow', v: -0.06 });
});
def('autumn1', 4, 4, 5, function (cv) {
  crown(cv, 2, 2.1, 1.65, 4.3, 'yellow', 16, { accent: 'orange', v: -0.1 });
});
def('bush0', 2.6, 2.4, 2, function (cv) {
  crown(cv, 1.3, 1.2, 1.05, 1.3, 'green', 17, { clumps: 7 });
});
def('bush1', 2.4, 2.2, 1.8, function (cv) {
  crown(cv, 1.2, 1.1, 0.95, 1.2, 'sage', 18, { clumps: 6, accent: 'magenta' });
});

/* ------------------------------------------------------------------ */
/* Conifers: stacked star-shaped tiers of needles narrowing to a point, snow optional. */

function pine(cv, cx, cy, R, top, seed, snow) {
  var r = rng(seed);
  cv.rod(cx, cy, 0, cx, cy, top * 0.3, R * 0.1, R * 0.08, 'bark');
  var tiers = 4;
  for (var t = 0; t < tiers; t++) {
    var f = t / tiers, rr = R * (1 - f * 0.72), z0 = top * (0.18 + f * 0.62), z1 = z0 + top * 0.3;
    var n = 9, base = [];
    for (var i = 0; i < n * 2; i++) {
      var a = (i / (n * 2)) * Math.PI * 2 + t * 0.4, d = i % 2 ? rr * 0.62 : rr * (0.92 + r() * 0.12);
      base.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.92);
    }
    cv.pyramid(base, z0, [cx, cy, z1], 'green', { rough: 0.1, v: -0.08 });
  }
  cv.each(function (x, y, rr, v) {
    if (rr !== 'green') return;
    return v + (hash(x, y, seed) > 0.86 ? 0.14 : 0) - (hash(x, y, seed + 1) < 0.1 ? 0.18 : 0);
  });
  if (snow) {
    cv.stain('green', 'ice', function (x, y) {
      return cv.V[y * cv.w + x] > 0.52 && hash(x, y, seed + 2) > 0.25;
    });
  }
}
def('pine0', 3.8, 3.8, 7, function (cv) {
  pine(cv, 1.9, 2, 1.7, 6.4, 21);
});
def('pine1', 3.2, 3.2, 6, function (cv) {
  pine(cv, 1.6, 1.7, 1.4, 5.4, 22);
});
def('pine0s', 3.8, 3.8, 7, function (cv) {
  pine(cv, 1.9, 2, 1.7, 6.4, 21, true);
});
def('pine1s', 3.2, 3.2, 6, function (cv) {
  pine(cv, 1.6, 1.7, 1.4, 5.4, 22, true);
});

/* ------------------------------------------------------------------ */
/* Boulders: a faceted lump from a jittered hull, in four stones. */

function boulder(cv, cx, cy, R, H, ramp, seed) {
  var r = rng(seed), V = [], F = [], n = 7;
  // A ring at the ground, a ring at the shoulder, a top point.
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 + r() * 0.4, d = R * (0.8 + r() * 0.3);
    V.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 0);
  }
  for (var j = 0; j < n; j++) {
    var b = ((j + 0.5) / n) * Math.PI * 2 + r() * 0.4, e = R * (0.55 + r() * 0.25);
    V.push(cx + Math.cos(b) * e, cy + Math.sin(b) * e * 0.85, H * (0.55 + r() * 0.2));
  }
  V.push(cx + (r() - 0.5) * R * 0.4, cy + (r() - 0.5) * R * 0.3, H);
  for (var k = 0; k < n; k++) {
    var k1 = (k + 1) % n;
    F.push([k, k1, n + k]);
    F.push([k1, n + k1, n + k]);
    F.push([n + k, n + k1, n * 2]);
  }
  cv.mesh(V, F, ramp, { rough: 0.1 });
  // Lichen or cracks.
  cv.each(function (x, y, rr, v) {
    if (rr !== ramp) return;
    return hash(x, y, seed) > 0.93 ? v - 0.2 : v;
  });
}
var STONES = [['rock', 'rock'], ['sandstone', 'sandstone'], ['obsidian', 'basalt'], ['ice', 'ice']];
for (var si = 0; si < STONES.length; si++) {
  (function (ramp, name, si) {
    def('boulder_' + name + '0', 2.4, 2, 1.8, function (cv) {
      boulder(cv, 1.2, 1.0, 0.95, 1.2, ramp, 31 + si * 7);
    });
    def('boulder_' + name + '1', 3.2, 2.6, 2.4, function (cv) {
      boulder(cv, 1.6, 1.3, 1.3, 1.7, ramp, 32 + si * 7);
    });
    def('boulder_' + name + '2', 3.4, 2.6, 1.6, function (cv) {
      boulder(cv, 1.2, 1.4, 0.9, 1.1, ramp, 33 + si * 7);
      boulder(cv, 2.4, 1.2, 0.7, 0.8, ramp, 34 + si * 7);
    });
  })(STONES[si][0], STONES[si][1], si);
}

runAtlas('nature', S, [6, 3]);
