// The crystal's geometry: an octahedron - two square pyramids joined at the
// base - with its edges chamfered, as an intersection of slabs, kept free of
// WebGL so it runs headless under `bun test`. The fragment shader in
// crystal.js carries twins of `intersect` and `outlineDistance`; a change to
// one is mirrored in the other.
//
// The construction. With half-width `a` (the equator's corners at x, z = +/-a)
// and half-height `c` (the apexes at y = +/-c), the octahedron is
//
//   |x|/a + |y|/c + |z|/a <= 1.
//
// Its eight faces have normals (sx/a, sy/c, sz/a) for every sign choice, and
// they come in opposite pairs, n and -n. A pair is one slab, |n . p| <= h, so
// the octahedron is the intersection of four slabs. Its twelve edges pair off
// through the center the same way, so chamfering them is six slabs more, each
// one's direction bisecting the two faces it cuts between and its bound set
// the chamfer depth inside the solid's reach along it.
//
// Ray intersection is the interval (Kay-Kajiya) form: each slab gives the
// span of t the ray spends inside it, the solid's span is the intersection of
// all of them, and which slab bounded that span on each side names the facet
// hit - face or chamfer - so the normal comes free, with no face bookkeeping.

const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const unit = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
};

/**
 * The slab table of the octahedron with half-width `a` and half-height `c`,
 * its edges chamfered `b` deep: entries [x, y, z, h], each the slab
 * |(x, y, z) . p| <= h. The same table is uploaded to the shader, so the two
 * twins read one set of numbers.
 *
 * The four face slabs come first, and the order matters: at b = 0 each
 * chamfer slab only touches the solid along its edge, so it ties a face slab
 * there, and `intersect` breaks ties toward the earlier entry - which makes a
 * table with b = 0 draw the plain octahedron. (Up to rounding on the edges
 * themselves: a ray running exactly along one meets both at the same t, and
 * the last bit decides. Its normal is then the edge's bisector, on a line no
 * pixel is wide enough to show.)
 *
 * The chamfer depth is measured along each chamfer's own normal. The strip it
 * leaves is about b wide on the equator's edges and 1.7b on the slanted ones
 * at this site's 1.5:1, where the faces meet at a sharper angle.
 *
 * @param {number} a half-width: the equator's corners are at x, z = +/-a
 * @param {number} c half-height: the apexes are at y = +/-c
 * @param {number} [b] chamfer depth; 0 is the plain octahedron
 * @returns {number[][]} ten [x, y, z, h] slabs
 */
export function octahedron(a, c, b = 0) {
  const faces = [
    [1 / a, 1 / c, 1 / a, 1],
    [1 / a, 1 / c, -1 / a, 1],
    [-1 / a, 1 / c, 1 / a, 1],
    [-1 / a, 1 / c, -1 / a, 1],
  ];
  // Every face normal has the same length, so the sum of two is their
  // bisector. The equator's edges join faces differing in the sign of y,
  // whose sum is horizontal; the slanted ones join faces differing in the
  // sign of x or z. The solid's reach along each is attained on the edge
  // itself - a/sqrt(2) along a horizontal diagonal, 1/|(1/a, 1/c)| along a
  // slanted one - and the chamfer takes b off it.
  const reach = (m) => {
    const corners = [
      [a, 0, 0],
      [-a, 0, 0],
      [0, c, 0],
      [0, -c, 0],
      [0, 0, a],
      [0, 0, -a],
    ];
    return Math.max(...corners.map((v) => dot(m, v)));
  };
  const edges = [
    [1, 0, 1],
    [1, 0, -1],
    [1 / a, 1 / c, 0],
    [-1 / a, 1 / c, 0],
    [0, 1 / c, 1 / a],
    [0, 1 / c, -1 / a],
  ].map((v) => {
    const m = unit(v);
    return [...m, reach(m) - b];
  });
  return [...faces, ...edges];
}

/**
 * The span of a ray against the slabs, as the shader computes it.
 *
 * `tIn`/`tOut` bound the ray's span inside the solid and `kIn`/`kOut` name
 * the slab that set each bound. The ray hits when `tIn <= tOut` and
 * `tOut >= 0`; a ray that starts inside has `tIn < 0`, and its exit is
 * `tOut` on slab `kOut`. On a miss the span is still returned, with
 * `tOut - tIn` negative: it is linear in the ray's origin, which is what the
 * shader's edge antialiasing reads. A tie goes to the earlier slab.
 *
 * A ray parallel to a slab has no finite crossing of it. The reciprocal of
 * the projected direction is clamped to +/-1e12, which keeps the arithmetic
 * finite and the sign intact, so the slab then either excludes the ray or
 * constrains nothing. With a level camera this is not a corner case: as the
 * crystal turns, the view ray is parallel to some slab every few degrees.
 *
 * @param {number[]} o ray origin
 * @param {number[]} d ray direction
 * @param {number[][]} slabs the table from `octahedron`
 */
export function intersect(o, d, slabs) {
  let tIn = -1e30;
  let tOut = 1e30;
  let kIn = 0;
  let kOut = 0;
  for (let k = 0; k < slabs.length; k++) {
    const n = slabs[k];
    const pd = dot(n, d);
    const r = Math.abs(pd) < 1e-12 ? 1e12 : Math.min(Math.max(1 / pd, -1e12), 1e12);
    // The slab's midplane crossing, and its half-width in t: the bounds are
    // symmetric about the crossing, so lo <= hi with no min/max.
    const tc = -dot(n, o) * r;
    const w = n[3] * Math.abs(r);
    if (tc - w > tIn) {
      tIn = tc - w;
      kIn = k;
    }
    if (tc + w < tOut) {
      tOut = tc + w;
      kOut = k;
    }
  }
  return { tIn, tOut, kIn, kOut, hit: tIn <= tOut && tOut >= 0 };
}

/**
 * The unit normal of slab `k`, turned to face against direction `d`: the
 * convention GLSL's `refract` and `reflect` expect, on the way in and on the
 * way out alike.
 *
 * @param {number[][]} slabs
 * @param {number} k
 * @param {number[]} d
 */
export function facing(slabs, k, d) {
  const n = unit(slabs[k]);
  const s = dot(n, d) >= 0 ? -1 : 1;
  return [n[0] * s, n[1] * s, n[2] * s];
}

/**
 * The corners of the solid the slabs bound: every point where three of the
 * slabs' planes meet and no slab excludes. Found once, by brute force - the
 * ten slabs give twenty planes and a thousand-odd triples, which is nothing
 * to run at start and simpler than any bookkeeping of which facet meets
 * which.
 *
 * @param {number[][]} slabs
 * @returns {number[][]} [x, y, z] corners, without repeats
 */
export function corners(slabs) {
  const planes = slabs.flatMap((s) => [s, [-s[0], -s[1], -s[2], s[3]]]);
  const found = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const p = meet(planes[i], planes[j], planes[k]);
        if (!p) continue;
        if (slabs.some((s) => Math.abs(dot(s, p)) > s[3] + 1e-9)) continue;
        if (found.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9)) continue;
        found.push(p);
      }
    }
  }
  return found;
}

// The point on all three planes n . p = h, by Cramer's rule, or null when
// they do not meet in one point.
function meet(u, v, w) {
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const vw = cross(v, w);
  const det = dot(u, vw);
  if (Math.abs(det) < 1e-12) return null;
  const wu = cross(w, u);
  const uv = cross(u, v);
  return [0, 1, 2].map((i) => (u[3] * vw[i] + v[3] * wu[i] + w[3] * uv[i]) / det);
}

/**
 * The crystal's outline, seen level and orthographically with the solid
 * turned by `theta` about its axis: the convex hull of its corners projected
 * onto the view plane, as edge lines [nx, ny, offset] - each the half-plane
 * nx x + ny y <= offset, with (nx, ny) the unit outward normal. The turn is
 * the shader's: positive is counter-clockwise seen from above.
 *
 * @param {number[][]} points the solid's corners, from `corners`
 * @param {number} theta the turn about y, radians
 * @returns {number[][]} the outline's edges, counter-clockwise
 */
export function outline(points, theta) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const projected = points
    .map((p) => [p[0] * cos + p[2] * sin, p[1]])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  // Andrew's monotone chain; collinear points are dropped, so no edge is
  // zero-length.
  const turn = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list) => {
    const chain = [];
    for (const p of list) {
      while (
        chain.length >= 2 &&
        turn(chain[chain.length - 2], chain[chain.length - 1], p) <= 1e-12
      ) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  const hull = [...half(projected), ...half([...projected].reverse())];
  return hull.map((p, i) => {
    const q = hull[(i + 1) % hull.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = (q[1] - p[1]) / len;
    const ny = (p[0] - q[0]) / len;
    return [nx, ny, nx * p[0] + ny * p[1]];
  });
}

/**
 * Signed distance from the view-plane point (x, y) to the outline: positive
 * inside, in the view's units. Inside a convex outline the nearest edge's
 * line is the nearest boundary, so the distance is the least of the edges'
 * - which is also what makes the band it measures meet itself at a mitered
 * corner.
 *
 * @param {number[][]} edges from `outline`
 * @param {number} x
 * @param {number} y
 */
export function outlineDistance(edges, x, y) {
  return Math.min(...edges.map(([nx, ny, offset]) => offset - nx * x - ny * y));
}
