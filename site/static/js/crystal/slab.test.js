// The crystal's geometry, checked headless. Not published: `ignored_static`
// in zola.toml keeps test files out of the site.
import { describe, expect, test } from "bun:test";
import { corners, facing, intersect, octahedron, outline, outlineDistance } from "./slab.js";

const C = 0.9;
// 1.5:1, as crystal.js draws it.
const A = C / 1.5;
// A chamfer about as deep as crystal.js's.
const B = 0.01;
const PLAIN = octahedron(A, C);
const CHAMFERED = octahedron(A, C, B);

// Each solid's own inequality, which the slabs are supposed to reproduce:
// 1 on the surface, less inside, more outside.
const plainInside = (p) => Math.abs(p[0]) / A + Math.abs(p[1]) / C + Math.abs(p[2]) / A;
const slabInside = (slabs) => (p) =>
  Math.max(...slabs.map((s) => Math.abs(s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / s[3]));
const chamferedInside = slabInside(CHAMFERED);

// Turning a point about y by phi, right-handed: positive phi is
// counter-clockwise seen from above.
const rotY = (p, phi) => {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

// A level orthographic view down -z of the crystal turned by `theta` about
// y, in the crystal's own frame: turning the solid by theta is turning the
// ray by -theta.
const viewRay = (x, y, theta) => ({
  o: rotY([x, y, 4], -theta),
  d: rotY([0, 0, -1], -theta),
});
const span = (x, y, theta, slabs = PLAIN) => {
  const { o, d } = viewRay(x, y, theta);
  return intersect(o, d, slabs);
};
const hits = (x, y, theta, slabs = PLAIN) => span(x, y, theta, slabs).hit;

const turns = [0, 0.2, 0.5, Math.PI / 4, 1.1, 2.0, 3.3, 5.0];

describe("the plain octahedron", () => {
  test("is a 1.5:1 diamond, edge to edge, when a corner faces the view", () => {
    // At theta = 0 the corners at x = +/-a are the widest points, so the
    // silhouette is exactly |x|/a + |y|/c < 1.
    for (let y = -1; y <= 1; y += 0.05) {
      for (let x = -0.7; x <= 0.7; x += 0.025) {
        const expected = Math.abs(x) / A + Math.abs(y) / C;
        if (Math.abs(expected - 1) < 1e-3) continue;
        expect(hits(x, y, 0)).toBe(expected < 1);
      }
    }
  });

  test("narrows to a*sqrt(2) wide when an edge faces the view", () => {
    // A quarter-turn's midpoint puts an equator edge toward the camera; the
    // widest point is then that edge's end, sqrt(2)/2 of a corner's reach.
    const half = A / Math.SQRT2;
    expect(hits(half - 1e-3, 0, Math.PI / 4)).toBe(true);
    expect(hits(half + 1e-3, 0, Math.PI / 4)).toBe(false);
  });

  test("keeps its apexes at +/-c whatever the turn", () => {
    for (const theta of turns) {
      expect(hits(0, C - 1e-3, theta)).toBe(true);
      expect(hits(0, C + 1e-3, theta)).toBe(false);
    }
  });

  test("is what a table with no chamfer draws: no chamfer slab wins but by rounding", () => {
    // At b = 0 the chamfer slabs only touch the solid along its edges. A ray
    // that runs exactly along one - this grid crosses the equator at y = 0 -
    // meets a face and a chamfer at the same t, and the last bit of rounding
    // decides between them; anywhere else the face wins outright.
    const faces = PLAIN.slice(0, 4);
    for (const theta of turns) {
      for (let y = -0.85; y <= 0.85; y += 0.05) {
        for (let x = -0.6; x <= 0.6; x += 0.02) {
          const s = span(x, y, theta);
          if (!s.hit || s.kIn < 4) continue;
          const { o, d } = viewRay(x, y, theta);
          expect(s.tIn - intersect(o, d, faces).tIn).toBeLessThan(1e-12);
        }
      }
    }
  });

  test("hits land on the surface, with the normal facing the ray", () => {
    for (let theta = 0; theta < Math.PI; theta += 0.17) {
      // |y| <= 0.6 keeps x = 0.05 inside the silhouette at every turn: the
      // narrowest width there is a * sqrt(2) * (1 - 0.6/c), about 0.28.
      for (let y = -0.6; y <= 0.6; y += 0.2) {
        const { o, d } = viewRay(0.05, y, theta);
        const s = intersect(o, d, PLAIN);
        expect(s.hit).toBe(true);
        const p = o.map((v, i) => v + d[i] * s.tIn);
        expect(plainInside(p)).toBeCloseTo(1, 5);
        const n = facing(PLAIN, s.kIn, d);
        expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeLessThan(0);
        // And the normal is outward: a step along it leaves the solid.
        expect(plainInside(p.map((v, i) => v + n[i] * 1e-3))).toBeGreaterThan(1);
      }
    }
  });

  test("rays stay finite when parallel to a slab", () => {
    // (1, 0, -1)/sqrt(2) is perpendicular to slab 0's direction (1/a, 1/c,
    // 1/a): exactly the case the reciprocal clamp exists for.
    const d = [Math.SQRT1_2, 0, -Math.SQRT1_2];
    expect(PLAIN[0][0] * d[0] + PLAIN[0][1] * d[1] + PLAIN[0][2] * d[2]).toBe(0);
    for (let y = -0.8; y <= 0.8; y += 0.1) {
      const o = [-4 * Math.SQRT1_2, y, 4 * Math.SQRT1_2];
      const s = intersect(o, d, PLAIN);
      expect(Number.isFinite(s.tIn) && Number.isFinite(s.tOut)).toBe(true);
      const mid = o.map((v, i) => v + d[i] * 4);
      expect(s.hit).toBe(plainInside(mid) < 1);
    }
  });

  test("rays from inside find the exit, which is on the surface", () => {
    for (let i = 0; i < 200; i++) {
      const u = (i * 0.618034) % 1;
      const v = (i * 0.414214) % 1;
      const phi = 2 * Math.PI * u;
      const z = 2 * v - 1;
      const r = Math.sqrt(1 - z * z);
      const d = [r * Math.cos(phi), z, r * Math.sin(phi)];
      const o = [0.05, -0.1, 0.02];
      const s = intersect(o, d, PLAIN);
      expect(s.tIn).toBeLessThan(0);
      expect(s.tOut).toBeGreaterThan(0);
      const p = o.map((w, j) => w + d[j] * s.tOut);
      expect(plainInside(p)).toBeCloseTo(1, 5);
    }
  });

  test("has the octahedron's six corners and no others", () => {
    const found = corners(PLAIN);
    expect(found.length).toBe(6);
    for (const p of found) expect(plainInside(p)).toBeCloseTo(1, 9);
  });
});

describe("the chamfered octahedron", () => {
  test("hits land on the surface, with the normal facing the ray and outward", () => {
    for (const theta of turns) {
      for (let y = -0.8; y <= 0.8; y += 0.04) {
        for (let x = -0.6; x <= 0.6; x += 0.03) {
          const { o, d } = viewRay(x, y, theta);
          const s = intersect(o, d, CHAMFERED);
          if (!s.hit) continue;
          const p = o.map((v, i) => v + d[i] * s.tIn);
          expect(chamferedInside(p)).toBeCloseTo(1, 5);
          const n = facing(CHAMFERED, s.kIn, d);
          expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeLessThan(0);
          expect(chamferedInside(p.map((v, i) => v + n[i] * 1e-3))).toBeGreaterThan(1);
        }
      }
    }
  });

  test("shows an equator chamfer where an equator edge faces the view", () => {
    // An eighth of a turn brings the edge between the corners on +x and +z
    // to the front, at the middle of the view: the ray there meets its
    // chamfer, one of the two horizontal chamfer slabs (4 and 5).
    const s = span(0, 0, Math.PI / 4, CHAMFERED);
    expect(s.hit).toBe(true);
    expect([4, 5]).toContain(s.kIn);
    // And a little above it, the face again.
    expect(span(0, 0.2, Math.PI / 4, CHAMFERED).kIn).toBeLessThan(4);
  });

  test("lowers the apexes by the slanted chamfers' depth", () => {
    // The four slanted chamfers meet on the axis, below the old apex: where
    // (y/c) / |(1/a, 1/c)| reaches the chamfered bound.
    const top = C * (1 - B * Math.hypot(1 / A, 1 / C));
    for (const theta of turns) {
      expect(hits(0, top - 1e-4, theta, CHAMFERED)).toBe(true);
      expect(hits(0, top + 1e-4, theta, CHAMFERED)).toBe(false);
    }
  });
});

describe("outline", () => {
  test("of the plain octahedron is the rhombus", () => {
    // The closed form the outline used to be: half-width a * max(|cos|,
    // |sin|), and distance the rhombus inequality over its normal's length.
    for (const theta of turns) {
      const w = A * Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
      const edges = outline(corners(PLAIN), theta);
      expect(edges.length).toBe(4);
      for (const [x, y] of [
        [0, 0],
        [0.1, 0.2],
        [-0.15, 0.1],
        [0.05, -0.5],
      ]) {
        const rhombus = (1 - Math.abs(x) / w - Math.abs(y) / C) / Math.hypot(1 / w, 1 / C);
        expect(outlineDistance(edges, x, y)).toBeCloseTo(rhombus, 9);
      }
    }
  });

  test("of the chamfered octahedron is what the rays see, at every turn", () => {
    const points = corners(CHAMFERED);
    for (const theta of turns) {
      const edges = outline(points, theta);
      for (let y = -0.95; y <= 0.95; y += 0.025) {
        for (let x = -0.7; x <= 0.7; x += 0.01) {
          const dist = outlineDistance(edges, x, y);
          if (Math.abs(dist) < 1e-4) continue;
          expect(hits(x, y, theta, CHAMFERED)).toBe(dist > 0);
        }
      }
    }
  });

  test("measures true distance: a step that far toward the nearest edge crosses it", () => {
    const points = corners(CHAMFERED);
    for (const theta of turns) {
      const edges = outline(points, theta);
      for (const [x, y] of [
        [0.1, 0.2],
        [-0.15, 0.1],
        [0.05, -0.5],
        [-0.02, -0.7],
        [0.3, 0.0],
      ]) {
        const dist = outlineDistance(edges, x, y);
        if (dist <= 0) continue;
        const [nx, ny] = edges.reduce((best, e) =>
          e[2] - e[0] * x - e[1] * y < best[2] - best[0] * x - best[1] * y ? e : best,
        );
        const at = (t) => hits(x + nx * t, y + ny * t, theta, CHAMFERED);
        expect(at(dist - 1e-4)).toBe(true);
        expect(at(dist + 1e-4)).toBe(false);
      }
    }
  });
});
