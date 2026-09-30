/*
 * ground.js: small details scattered over the ground, painted in LibreSprite (art/lib/paint.js has the brushes).
 *
 * Tone details (names t_*) are painted in the grey "tone" ramp: the game doesn't paste their colours but lightens or
 * darkens the ground beneath by their brightness, so one grass tuft or crack suits every soil. Colour details (c_*:
 * flowers, embers, glass) are pasted as they are. Painted at 6 and 3 pixels a metre (half as big again as life, so a
 * tuft reads), stamped into the 4 and 2 pixel-a-metre ground.
 */

var S = [];
function def(name, w, d, h, draw) {
  S.push({ name: name, w: w, d: d, h: h, draw: draw, outline: false, rim: false, pad: 1 });
}
function rng(seed) {
  var s = seed | 0;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
/** A darker pixel on the ground south-east of something standing (its contact shadow). */
function shadowAt(cv, x, y) {
  cv.set(cv.X(x) + 1, cv.Y(y, 0) + 1, rid('tone'), 0.22, F_FLAT);
}

/* Grass: tufts of blades, lit on the sun side, shadowed at the root. */
function tuft(cv, cx, cy, n, len, seed) {
  var r = rng(seed), step = 1.4 / cv.k;
  for (var i = 0; i < n; i++) shadowAt(cv, cx + (i - n / 2) * step, cy + 0.04);
  // Blades fan out from the root, a pixel and a half apart, leaning left lit and right shaded.
  for (var j = 0; j < n; j++) {
    var f = j / Math.max(1, n - 1) - 0.5, bx = cx + (j - n / 2) * step, by = cy + (r() - 0.5) * 0.1;
    var tx = bx + f * len * 0.9, hz = len * (0.75 + r() * 0.5) * (1 - Math.abs(f) * 0.5);
    cv.line(bx, by, 0, tx, by - 0.04, hz, 'tone', f < 0 ? 0.86 : 0.62, F_FLAT);
    cv.set(cv.X(tx), cv.Y(by - 0.04, hz), rid('tone'), 0.95, F_FLAT);
  }
}
def('t_tuft0', 1, 1, 0.9, function (cv) { tuft(cv, 0.5, 0.7, 4, 0.7, 1); });
def('t_tuft1', 1.2, 1, 1, function (cv) { tuft(cv, 0.6, 0.7, 6, 0.8, 2); });
def('t_tuft2', 1.8, 1.2, 1, function (cv) { tuft(cv, 0.5, 0.7, 4, 0.7, 3); tuft(cv, 1.25, 0.9, 5, 0.8, 4); });
def('t_tuft3', 0.8, 0.8, 0.7, function (cv) { tuft(cv, 0.4, 0.6, 3, 0.55, 5); });

/* Flowers on short stems. */
function flowers(cv, n, ramp, seed) {
  var r = rng(seed);
  for (var i = 0; i < n; i++) {
    var x = 0.15 + r() * 0.7, y = 0.2 + r() * 0.6;
    cv.line(x, y, 0, x, y, 0.2, 'green', 0.4, F_FLAT);
    cv.set(cv.X(x), cv.Y(y, 0.25), rid(ramp), 0.9, F_FLAT);
  }
}
def('c_flower0', 1, 1, 0.4, function (cv) { flowers(cv, 4, 'white', 11); });
def('c_flower1', 1, 1, 0.4, function (cv) { flowers(cv, 5, 'yellow', 12); });
def('c_flower2', 1, 1, 0.4, function (cv) { flowers(cv, 3, 'red', 13); });
def('c_flower3', 1, 1, 0.4, function (cv) { flowers(cv, 4, 'violet', 14); });

/* Pebbles: little lit lumps with a shadow. */
function pebbles(cv, n, rmax, seed) {
  var r = rng(seed);
  for (var i = 0; i < n; i++) {
    var x = 0.2 + r() * (cv.w / cv.k - 0.6), y = 0.2 + r() * 0.6, rr = 0.06 + r() * rmax;
    shadowAt(cv, x + rr, y + rr * 0.5);
    cv.blob(x, y, rr * 0.5, rr, rr * 0.8, rr * 0.6, 'tone', { v: 0.12 });
  }
}
def('t_pebble0', 1, 1, 0.3, function (cv) { pebbles(cv, 3, 0.1, 21); });
def('t_pebble1', 1.4, 1, 0.3, function (cv) { pebbles(cv, 5, 0.12, 22); });
def('t_pebble2', 1, 1, 0.4, function (cv) { pebbles(cv, 2, 0.2, 23); });
def('t_pebble3', 2, 1.2, 0.4, function (cv) { pebbles(cv, 8, 0.14, 24); });

/* Cracks in dry ground: a dark seam with a lit lip on its north side. */
function crack(cv, x0, y0, len, a, seed, depth) {
  var r = rng(seed), x = x0, y = y0;
  var steps = Math.ceil(len / 0.25);
  for (var i = 0; i < steps; i++) {
    a += (r() - 0.5) * 0.9;
    var nx = x + Math.cos(a) * 0.25, ny = y + Math.sin(a) * 0.25;
    cv.line(x, y - 0.25, 0, nx, ny - 0.25, 0, 'tone', 0.62, F_FLAT);
    cv.line(x, y, 0, nx, ny, 0, 'tone', 0.08, F_FLAT);
    if (depth > 0 && r() < 0.18) crack(cv, nx, ny, len * 0.4, a + (r() < 0.5 ? 1 : -1), seed + i, depth - 1);
    x = nx;
    y = ny;
  }
}
def('t_crack0', 2.4, 1.6, 0, function (cv) { crack(cv, 0.2, 0.8, 2.2, 0.1, 31, 1); });
def('t_crack1', 2, 2, 0, function (cv) { crack(cv, 0.3, 1.6, 1.8, -0.8, 32, 1); });
def('t_crack2', 3, 1.4, 0, function (cv) { crack(cv, 0.2, 0.6, 2.8, 0.3, 33, 2); });

/* Snow drifts: a lit crest with a blue shadow under it. */
function drift(cv, seed) {
  var r = rng(seed), w = cv.w / cv.k - 0.4;
  for (var x = 0.2; x < w; x += 1 / cv.k) {
    var t = (x - 0.2) / (w - 0.2), y = 0.6 + Math.sin(t * Math.PI * 1.3 + seed) * 0.2;
    var hgt = Math.sin(t * Math.PI) * 0.5;
    cv.set(cv.X(x), cv.Y(y, 0), rid('tone'), 0.28, F_FLAT);
    cv.set(cv.X(x), cv.Y(y, 0) - 1, rid('tone'), 0.35, F_FLAT);
    if (hgt > 0.12) cv.set(cv.X(x), cv.Y(y, hgt) - 1, rid('tone'), 0.92, F_FLAT);
  }
}
def('t_drift0', 3, 1.2, 0.6, function (cv) { drift(cv, 41); });
def('t_drift1', 2.2, 1.2, 0.6, function (cv) { drift(cv, 42); });

/* Ripples in sand: paired lit and shaded curves. */
function ripples(cv, n, seed) {
  var r = rng(seed), w = cv.w / cv.k;
  for (var i = 0; i < n; i++) {
    var y0 = 0.3 + i * 0.35 + r() * 0.1;
    for (var x = 0.1; x < w - 0.1; x += 1 / cv.k) {
      var y = y0 + Math.sin(x * 2.2 + i) * 0.08;
      cv.set(cv.X(x), cv.Y(y, 0), rid('tone'), 0.7, F_FLAT);
      cv.set(cv.X(x), cv.Y(y, 0) + 1, rid('tone'), 0.3, F_FLAT);
    }
  }
}
def('t_ripple0', 3, 1.4, 0, function (cv) { ripples(cv, 3, 51); });
def('t_ripple1', 2, 1, 0, function (cv) { ripples(cv, 2, 52); });

/* Mud puddles: dark water with a glint. */
function puddle(cv, cx, cy, rx, ry, seed) {
  var pts = [], r = rng(seed);
  for (var i = 0; i < 12; i++) {
    var a = (i / 12) * Math.PI * 2, d = 0.75 + r() * 0.35;
    pts.push(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 0);
  }
  cv.poly(pts, 'tone', 0.2, F_FLAT);
  cv.line(cx - rx * 0.4, cy - ry * 0.35, 0, cx - rx * 0.05, cy - ry * 0.45, 0, 'tone', 0.9, F_FLAT);
}
def('t_puddle0', 2.4, 1.6, 0, function (cv) { puddle(cv, 1.2, 0.8, 1.0, 0.6, 61); });
def('t_puddle1', 1.6, 1.2, 0, function (cv) { puddle(cv, 0.8, 0.6, 0.65, 0.45, 62); });

/* Rubble and oil on made ground. */
def('t_rubble0', 1.6, 1.2, 0.3, function (cv) {
  var r = rng(71);
  for (var i = 0; i < 5; i++) {
    var x = 0.3 + r() * 1.0, y = 0.3 + r() * 0.6;
    shadowAt(cv, x + 0.1, y + 0.05);
    cv.box(x - 0.1, y - 0.08, 0, 0.12 + r() * 0.12, 0.1 + r() * 0.1, 0.08, 'tone', { topV: 0.8, bevel: 0.1, flat: true });
  }
});
def('t_rubble1', 2.2, 1.4, 0.3, function (cv) {
  var r = rng(72);
  for (var i = 0; i < 9; i++) {
    var x = 0.25 + r() * 1.7, y = 0.3 + r() * 0.8;
    shadowAt(cv, x + 0.1, y + 0.05);
    cv.box(x - 0.1, y - 0.08, 0, 0.1 + r() * 0.16, 0.1 + r() * 0.12, 0.08, 'tone', { topV: 0.75, bevel: 0.1, flat: true });
  }
});
def('t_oil0', 2.4, 1.6, 0, function (cv) {
  var pts = [], r = rng(73);
  for (var i = 0; i < 14; i++) {
    var a = (i / 14) * Math.PI * 2, d = 0.6 + r() * 0.45;
    pts.push(1.2 + Math.cos(a) * 1.0 * d, 0.8 + Math.sin(a) * 0.6 * d, 0);
  }
  cv.poly(pts, 'tone', function (x, y) { return 0.26 + (hash(x, y, 3) > 0.94 ? 0.5 : 0); }, F_FLAT);
});
def('t_scorch0', 3, 2.4, 0, function (cv) {
  var cx = cv.X(1.5), cy = cv.Y(1.2, 0), R = 1.3 * cv.k;
  for (var y = 0; y < cv.h; y++) for (var x = 0; x < cv.w; x++) {
    var dx = (x - cx) / R, dy = (y - cy) / (R * 0.8), d = Math.sqrt(dx * dx + dy * dy) + (vnoise(x, y, cv.k * 0.4, 5) - 0.5) * 0.5;
    if (d > 1) continue;
    if (d > 0.7 && hash(x, y, 7) > (1 - d) * 3) continue;
    cv.set(x, y, rid('tone'), 0.15 + d * 0.22, F_FLAT);
  }
});

/* Colour: embers in ash, glints in glass, dry weeds, bone chips. */
def('c_ember0', 1, 1, 0.2, function (cv) {
  var r = rng(81);
  for (var i = 0; i < 4; i++) cv.set(cv.X(0.2 + r() * 0.6), cv.Y(0.2 + r() * 0.6, 0), rid('lamp'), 0.3 + r() * 0.5, F_FLAT);
});
def('c_ember1', 1.4, 1, 0.2, function (cv) {
  var r = rng(82);
  for (var i = 0; i < 6; i++) cv.set(cv.X(0.2 + r() * 1.0), cv.Y(0.2 + r() * 0.6, 0), rid('lamp'), 0.2 + r() * 0.6, F_FLAT);
});
def('c_shard0', 1, 1, 0.2, function (cv) {
  var r = rng(83);
  for (var i = 0; i < 3; i++) {
    var x = cv.X(0.2 + r() * 0.6), y = cv.Y(0.2 + r() * 0.6, 0);
    cv.set(x, y, rid('crystal'), 0.95, F_FLAT);
    cv.set(x + 1, y, rid('crystal'), 0.55, F_FLAT);
  }
});
def('c_weed0', 1, 1, 0.5, function (cv) {
  var r = rng(84);
  for (var i = 0; i < 5; i++) {
    var bx = 0.4 + r() * 0.2, a = (r() - 0.5) * 1.8;
    cv.line(bx, 0.7, 0, bx + Math.sin(a) * 0.35, 0.65, 0.35 + r() * 0.15, 'tan', 0.55 + r() * 0.3, F_FLAT);
  }
});
def('c_bonebit0', 1, 1, 0.2, function (cv) {
  cv.line(0.25, 0.5, 0, 0.7, 0.4, 0, 'bone', 0.85, F_FLAT);
  cv.set(cv.X(0.25), cv.Y(0.5, 0) - 1, rid('bone'), 0.95, F_FLAT);
  cv.set(cv.X(0.72), cv.Y(0.4, 0) + 1, rid('bone'), 0.6, F_FLAT);
});

runAtlas('ground', S, [6, 3]);
