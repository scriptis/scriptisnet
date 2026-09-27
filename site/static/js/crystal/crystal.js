// The home page's crystal: an octahedron three units tall to two wide, its
// edges finely chamfered, turning on its vertical axis, with a space inside
// it larger than itself - a purple nebula and three shells of stars, seen
// through a hole in the glass and turning the other way at half the speed.
//
// Everything a frame draws is one fragment shader over one full-canvas
// triangle: the rays are cast per pixel against the slab form of the solid
// (slab.js, whose `intersect` the shader's `span` twins), so there is no mesh,
// and the silhouette, facet normals, refraction and antialiasing all come out
// of the same few lines. The nebula is painted into a cubemap once at start
// by a second program - `ENVIRONMENTS` below - and only sampled after that.
//
// Projection. The solid is cast orthographically, so its outline is a flat
// playing-card diamond at every turn. The environment lookups are not: with
// every view ray parallel, the whole view would be one direction and one
// color. So the space is looked up along a perspective ray, as if seen
// through a lens with the field of view `LENS`. Outside the crystal the
// canvas is transparent: the space is only ever seen through it.
//
// A hole, not a lens. What the glass shows is the space behind it along the
// camera's own ray, in world space - a hole punched through to somewhere
// larger - and the facets only nudge that, by `REFRACTION` of the way toward
// where they would really bend the light. Physical refraction through both
// surfaces is there to be had at REFRACTION = 1, but then every facet shows
// its own patch of sky and the hole reads as a kaleidoscope.
//
// Depth. A cubemap is infinitely far away, so nothing painted into it can
// show parallax. The stars are therefore not in the cubemap: they sit on
// three spheres of finite radius around the crystal, and each is looked up
// where the ray through the hole meets it, from the hole's mouth on the
// crystal's front. The environment turns about the crystal's axis, and the
// mouth is off that axis, so the shells sweep past at different rates - the
// near one visibly slower - and against the nebula: the space reads as
// deeper than the solid holding it.
//
// Use: load this module, and every `<canvas data-crystal>` on the page gets a
// crystal, drawn at whatever size CSS gives the canvas (in the proportion
// ASPECT) - today, the mark hung before a wordmark (.Mark in _layout.scss),
// at the hero's size or a header's.
//
// Debugging: `?crystal-t=<seconds>` on the page's URL freezes the animation
// at that time, and `?crystal-env=debug` swaps the nebula for a map built to
// show orientation mistakes.

import { corners, octahedron, outline } from "./slab.js";

// The solid's half-extents, in the view's units: the view spans y in [-1, 1],
// and the crystal is ASPECT times as tall as it is wide at its widest. The
// canvas has the same proportion (the `.crystal` rule in main.scss), so the
// margin around the crystal is the same on every side.
const ASPECT = 1.5;
const HALF_HEIGHT = 0.9;
const HALF_WIDTH = HALF_HEIGHT / ASPECT;

// How deep the edges are chamfered, in the view's units, along each
// chamfer's own normal. At 512 CSS pixels tall a view unit is 256 pixels, so
// this leaves strips about 3 pixels wide on the slanted edges and 2 on the
// equator's, seen face-on; the chamfers also take about 3 pixels off each
// apex. 0 is the plain octahedron.
const CHAMFER = 0.007;

// The solid, as slab.js builds and tests it, and its corners, from which the
// outline is drawn each frame. The outline has at most as many edges as
// there are corners to draw it around, which sizes the shader's array.
const SLABS = octahedron(HALF_WIDTH, HALF_HEIGHT, CHAMFER);
const CORNERS = corners(SLABS);

// Seconds per revolution, and the sense of each turn about the vertical axis:
// +1 is counter-clockwise seen from above, which sweeps the crystal's near
// face from left to right. The environment turns the other way, half as fast.
const CRYSTAL_PERIOD = 16;
const CRYSTAL_SENSE = 1;
const ENVIRONMENT_PERIOD = 32;
const ENVIRONMENT_SENSE = -CRYSTAL_SENSE;

// The time a still frame is drawn at, for `prefers-reduced-motion`: a
// sixteenth of a turn off a corner, so the front facets are unequal and the
// solid reads as three-dimensional.
const STILL_TIME = CRYSTAL_PERIOD / 16;

// tan(fov/2) of the perspective the environment lookups are cast through.
const LENS = 0.45;

// Edge length of each cubemap face, in texels: the canvas's height in
// device pixels, rounded up to a power of two and held to this range. A
// texel then covers about what a screen pixel does through `LENS`, so the
// lookups read level 0 and the map carries no mipmaps - and a small crystal
// does not paint a sky it has no pixels to show.
const MIN_CUBE_SIZE = 64;
const MAX_CUBE_SIZE = 512;

// The hole's margin, in CSS pixels in from the outline, by default: RIM of
// solid glass with no hole in it, then FADE over which the hole comes in.
// Sized for a crystal shown large, some 500 CSS pixels tall; a canvas sets
// its own with `data-rim` and `data-fade`, which a small one must - at forty
// pixels tall, twenty pixels of margin is the whole crystal. The site's
// marks set 1/3 (a header's) and 2/6 (the hero's).
const RIM = 4;
const FADE = 16;

// The backing store is the canvas's CSS size times the device pixel ratio,
// capped: the shader does a handful of slab tests and cubemap samples per
// pixel, and past 2x the extra fill buys nothing a reader can see.
const MAX_PIXEL_RATIO = 2;

const VERTEX = `#version 300 es
// One triangle that covers the canvas; no buffers, positions from the index.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Hashing and noise, shared by the painter and the frame. Integer hashing
// (pcg3d, Jarzynski and Olano 2020) rather than the usual fract(sin(...)):
// the sine trick depends on how a GPU rounds a large argument, so the same
// seed paints a different sky on different hardware, and integer arithmetic
// does not.
const NOISE = `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

// Three uniform values in [0, 1] for the lattice cell containing p.
vec3 hash3(vec3 p) {
  return vec3(pcg3d(uvec3(ivec3(floor(p))))) * (1.0 / 4294967295.0);
}

// Gradient noise, roughly in [-1, 1], with the quintic fade so the second
// derivative is continuous and the clouds show no lattice creases.
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash3(i) * 2.0 - 1.0, f);
  float n100 = dot(hash3(i + vec3(1, 0, 0)) * 2.0 - 1.0, f - vec3(1, 0, 0));
  float n010 = dot(hash3(i + vec3(0, 1, 0)) * 2.0 - 1.0, f - vec3(0, 1, 0));
  float n110 = dot(hash3(i + vec3(1, 1, 0)) * 2.0 - 1.0, f - vec3(1, 1, 0));
  float n001 = dot(hash3(i + vec3(0, 0, 1)) * 2.0 - 1.0, f - vec3(0, 0, 1));
  float n101 = dot(hash3(i + vec3(1, 0, 1)) * 2.0 - 1.0, f - vec3(1, 0, 1));
  float n011 = dot(hash3(i + vec3(0, 1, 1)) * 2.0 - 1.0, f - vec3(0, 1, 1));
  float n111 = dot(hash3(i + vec3(1, 1, 1)) * 2.0 - 1.0, f - vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// Fractal sum of six octaves. The lacunarity is a little off 2 so octaves'
// lattices never line up.
float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int o = 0; o < 6; o++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + vec3(19.1, 7.3, 11.7);
    amplitude *= 0.5;
  }
  return sum;
}
`;

// The cubemap face a direction lands on, and where, per the GL convention:
// face order +X, -X, +Y, -Y, +Z, -Z, and (u, v) in [-1, 1] from the face's
// (s, t). The inverse of the table the sampler itself applies, so a texel
// painted from `faceDirection` is the texel a lookup of that direction reads.
const FACE_DIRECTION = `
vec3 faceDirection(int face, vec2 uv) {
  float u = uv.x;
  float v = uv.y;
  if (face == 0) return vec3(1.0, -v, -u);
  if (face == 1) return vec3(-1.0, -v, u);
  if (face == 2) return vec3(u, 1.0, v);
  if (face == 3) return vec3(u, -1.0, -v);
  if (face == 4) return vec3(u, -v, 1.0);
  return vec3(-u, -v, -1.0);
}
`;

/**
 * The environments, each a GLSL `vec3 environment(vec3 d)` of a unit
 * direction, painted into the cubemap once. They may call `NOISE`.
 */
export const ENVIRONMENTS = {
  // Clouds of domain-warped noise, evaluated on the direction itself - a
  // point on the unit sphere - so the sky is seamless by construction, with
  // no face edges or poles to hide. The warp (noise displacing the noise's
  // own input) is what turns round blobs into filaments and folds.
  nebula: `
vec3 environment(vec3 d) {
  vec3 p = d * 2.2;
  vec3 warp = vec3(
    fbm(p + vec3(1.7, 9.2, 3.1)),
    fbm(p + vec3(8.3, 2.8, 5.5)),
    fbm(p + vec3(4.1, 6.3, 1.9))
  );
  // Six octaves of this noise mostly land within +/-0.3, so the ramps below
  // are set on that range, not on the nominal +/-1.
  float density = smoothstep(-0.25, 0.35, fbm(p + 1.8 * warp));
  // Large-scale structure: whole regions of sky brighter or emptier than
  // others, so the clouds gather rather than spread evenly.
  density *= mix(0.25, 1.0, smoothstep(-0.25, 0.25, noise(p * 0.6 + 5.0)));
  // Dark lanes of dust, cut into the bright gas and not the empty dark.
  float dust = smoothstep(0.0, 0.3, fbm(p * 2.4 + 3.0 * warp + 11.0));

  vec3 color = mix(vec3(0.02, 0.006, 0.05), vec3(0.30, 0.08, 0.55), density);
  color = mix(color, vec3(0.75, 0.25, 0.85), 0.85 * smoothstep(0.5, 0.95, density));
  color += vec3(1.0, 0.75, 0.95) * 0.6 * pow(smoothstep(0.78, 1.0, density), 2.0);
  color *= 1.0 - 0.7 * dust * density;
  // A cold haze in the thin regions, so the dark is not one flat violet.
  float haze = smoothstep(-0.1, 0.3, fbm(p * 0.7 + 23.0));
  color += vec3(0.04, 0.06, 0.2) * haze * (1.0 - density);
  return color;
}
`,
  // Built to make mistakes visible, not to look good. Each face is its own
  // color by the axis it faces - +X red, -X cyan, +Y green, -Y magenta, +Z
  // blue, -Z yellow - so a face painted from the wrong direction shows as a
  // color out of place. Over that, a latitude/longitude grid drawn from the
  // direction itself: seamless if the faces are right, broken at their
  // edges if not, and its meridians show which way the environment turns.
  // The 0-degree meridian (toward +X) is white, and a white disc marks -Z,
  // the direction the camera looks.
  debug: `
vec3 environment(vec3 d) {
  vec3 a = abs(d);
  vec3 base;
  if (a.x >= a.y && a.x >= a.z) {
    base = d.x > 0.0 ? vec3(0.85, 0.2, 0.2) : vec3(0.15, 0.75, 0.75);
  } else if (a.y >= a.z) {
    base = d.y > 0.0 ? vec3(0.2, 0.75, 0.2) : vec3(0.75, 0.2, 0.75);
  } else {
    base = d.z > 0.0 ? vec3(0.2, 0.3, 0.9) : vec3(0.85, 0.75, 0.15);
  }
  const float PI = 3.14159265;
  float lon = atan(d.z, d.x);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float spacing = PI / 12.0;
  vec2 cell = vec2(lon, lat) / spacing;
  vec2 grid = abs(fract(cell + 0.5) - 0.5) * spacing;
  float line = 1.0 - smoothstep(0.004, 0.012, min(grid.x * cos(lat), grid.y));
  vec3 color = mix(base, base * 0.35, line);
  float prime = 1.0 - smoothstep(0.006, 0.016, abs(lon) * cos(lat));
  color = mix(color, vec3(1.0), prime * step(0.0, d.x));
  float marker = 1.0 - smoothstep(0.06, 0.07, distance(d, vec3(0.0, 0.0, -1.0)));
  return mix(color, vec3(1.0), marker);
}
`,
};

const BAKE = `#version 300 es
precision highp float;
precision highp int;
uniform int uFace;
uniform float uSize;
out vec4 outColor;
${NOISE}
${FACE_DIRECTION}
%ENVIRONMENT%
void main() {
  vec2 uv = gl_FragCoord.xy / uSize * 2.0 - 1.0;
  outColor = vec4(environment(normalize(faceDirection(uFace, uv))), 1.0);
}
`;

// The frame. World space has y up and the camera on +z looking down -z; the
// crystal's frame is world space turned by uCrystal about y, and the
// environment's is world space turned by uEnvironment.
const FRAME = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform vec2 uView;        // half-extents of the orthographic view
uniform float uLens;       // tan(fov/2) of the environment lookups
uniform float uCrystal;    // the crystal's turn about y, radians
uniform float uEnvironment;
uniform vec4 uSlabs[${SLABS.length}];  // slab.js octahedron(): direction, bound
uniform vec3 uOutline[${CORNERS.length}]; // slab.js outline(), padded
uniform float uPixelRatio; // device pixels per CSS pixel
uniform float uPixelAngle; // radians of sky one device pixel spans
uniform float uRim;        // the hole's margin, CSS pixels (RIM, FADE)
uniform float uFade;
uniform samplerCube uCube;
out vec4 outColor;
${NOISE}

// Refractive index per channel: a little dispersion, so the edges of what
// is seen through the glass split into color.
const vec3 IOR = vec3(1.50, 1.52, 1.54);
// Reflectance at normal incidence, for Schlick's Fresnel term.
const float F0 = 0.04;
// A Lambert term from a light fixed relative to the camera - in front,
// raised and off to the right, so it rakes the front facets like a rim light
// - and it works both ways: a facet turned from the light is darkened by up
// to DARKEN, and one turned toward it gains up to LIGHTEN of a pale sheen.
// The sheen is added rather than multiplied, because most of what the glass
// shows is dark sky, and no multiplier brightens black.
const vec3 LIGHT = normalize(vec3(0.55, 0.6, 0.6));
const float DARKEN = 0.45;
const float LIGHTEN = 0.2;
const vec3 SHEEN = vec3(0.85, 0.8, 1.0);
// The glass in the hole's margin (uRim, uFade): lit like everything else, so
// the rim reads as the solid's own edge and the hole as something set inside
// it.
const vec3 GLASS = vec3(0.18, 0.08, 0.32);
// How far what the glass shows follows the facets. At 0 the crystal is a
// hole punched through to the space behind it: each pixel looks along the
// camera's own ray, whatever the facet under it faces. At 1 it is the
// physical refraction through both surfaces, where every facet shows its own
// patch of sky. Between, the hole stays put and the facets shift it a little
// - the refraction is faked, and this is how much.
const float REFRACTION = 0.15;
// Internal reflections followed before giving up on a ray that cannot get
// out; past the last one the ray samples wherever it points. Scaled down with
// the rest of the refraction by REFRACTION.
const int BOUNCES = 0;

// Right-handed turn about y: positive is counter-clockwise seen from above.
mat3 yaw(float t) {
  float c = cos(t);
  float s = sin(t);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

// The twin of slab.js intersect(): the ray's span inside the solid, and the
// slab that bounds it on each side. Mirror any change there.
struct Span {
  float tIn;
  float tOut;
  int kIn;
  int kOut;
};

Span span(vec3 o, vec3 d) {
  Span s = Span(-1e30, 1e30, 0, 0);
  for (int k = 0; k < ${SLABS.length}; k++) {
    vec3 n = uSlabs[k].xyz;
    float pd = dot(n, d);
    float r = abs(pd) < 1e-12 ? 1e12 : clamp(1.0 / pd, -1e12, 1e12);
    float tc = -dot(n, o) * r;
    float w = uSlabs[k].w * abs(r);
    if (tc - w > s.tIn) {
      s.tIn = tc - w;
      s.kIn = k;
    }
    if (tc + w < s.tOut) {
      s.tOut = tc + w;
      s.kOut = k;
    }
  }
  return s;
}

// slab.js facing(): slab k's unit normal, turned against d.
vec3 facing(int k, vec3 d) {
  vec3 n = normalize(uSlabs[k].xyz);
  return dot(n, d) >= 0.0 ? -n : n;
}

// The nebula along an environment-frame direction. Level 0 explicitly: the
// map has no mipmaps (see MAX_CUBE_SIZE), and an implicit level would be picked
// from screen-space derivatives, which jump at every facet edge and would
// blur a seam of texels along each one.
vec3 nebula(vec3 d) {
  return textureLod(uCube, d, 0.0).rgb;
}

// One channel's path through the glass: in through the entry facet at p,
// across to whichever facet it meets, and out - or back in, off the inside
// of that facet, when the angle is past the critical one. Returns the
// direction the ray leaves in, and moves p to where it leaves.
vec3 through(inout vec3 p, vec3 i, vec3 n, float eta) {
  vec3 d = refract(i, n, 1.0 / eta);
  for (int b = 0; b <= BOUNCES; b++) {
    Span s = span(p, d);
    p += d * s.tOut;
    vec3 m = facing(s.kOut, d);
    vec3 exit = refract(d, m, eta);
    if (dot(exit, exit) > 0.0) return exit;
    d = reflect(d, m);
  }
  return d;
}

// One shell of stars, of the given radius around the crystal, where the ray
// from p along d meets it (p is inside the shell: p is on the crystal's
// surface, within its own reach of 0.9). The shell's surface is cut into a lattice
// of about \`cells\` per radian; a cell holds a star with probability
// \`chance\`, placed off-center at random so the lattice never shows, and the
// star is a soft disc \`size\` radians across.
//
// Never much under a pixel, though, or it flickers in and out as it slides
// between pixel centers: on a small canvas, where a pixel spans more sky,
// the disc is widened to 0.7 of one and dimmed by the same area, so it
// carries the light it would have and only loses sharpness it could not
// have shown. At the hero's size every star is already past that and
// untouched.
vec3 shell(vec3 p, vec3 d, float radius, float cells, float chance, float size, float gain) {
  float b = dot(p, d);
  float t = -b + sqrt(max(b * b - dot(p, p) + radius * radius, 0.0));
  vec3 s = normalize(p + d * t);
  vec3 cell = floor(s * cells);
  vec3 h = hash3(cell);
  vec3 star = normalize(cell + 0.3 + 0.4 * hash3(cell + 97.0));
  float drawn = max(size, 0.7 * uPixelAngle);
  float r = distance(s, star) / drawn;
  // Brightness skewed hard toward dim: a few bright stars among many faint
  // ones is what reads as depth; an even field reads as snow.
  float light = gain * step(h.x, chance) * exp(-r * r) * (0.08 + 0.92 * pow(h.y, 4.0));
  light *= (size * size) / (drawn * drawn);
  // Mostly white, some blue, a few rose.
  vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.82, 0.95), step(0.8, h.z));
  return tint * light;
}

vec3 stars(vec3 p, vec3 d) {
  return shell(p, d, 40.0, 70.0, 0.12, 0.0025, 0.9)
       + shell(p, d, 3.0, 40.0, 0.08, 0.0035, 1.2)
       + shell(p, d, 1.4, 16.0, 0.10, 0.005, 1.6);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  mat3 crystal = yaw(uCrystal);
  mat3 toCrystal = transpose(crystal);
  // From world space into the environment's own turn.
  mat3 toEnvironment = transpose(yaw(uEnvironment));

  // The orthographic ray that finds the solid, in the crystal's frame, and
  // the perspective one the environment is looked up along - in world space,
  // since that is what the hole looks along, and in the crystal's frame for
  // the refraction.
  vec3 o = toCrystal * vec3(ndc * uView, 4.0);
  vec3 d = toCrystal * vec3(0.0, 0.0, -1.0);
  vec3 view = normalize(vec3(ndc * (uView / uView.y) * uLens, -1.0));
  vec3 i = toCrystal * view;

  Span s = span(o, d);
  // Coverage from the chord: the ray's length inside the solid falls
  // linearly to zero at the silhouette and carries on negative past it, so
  // one screen-space derivative gives a pixel's partial coverage - analytic
  // antialiasing, with no extra rays. Taken before the branch below, where
  // derivatives are still defined.
  float chord = s.tOut - s.tIn;
  float alpha = clamp(0.5 + chord / max(fwidth(chord), 1e-6), 0.0, 1.0);
  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec3 p = o + d * s.tIn;
  vec3 n = facing(s.kIn, d);
  // Near a facet seen edge-on the perspective direction can pass behind it;
  // there the orthographic one stands in, which refracts correctly.
  if (dot(i, n) >= 0.0) {
    i = d;
    view = crystal * d;
  }

  // What the hole shows: the camera's own ray, nudged by REFRACTION toward
  // where each channel's index would really bend it. The stars ride the
  // green channel alone - splitting them too would triple the shells for a
  // fringe the eye cannot resolve on a point - and are looked up from where
  // the ray enters the glass, the mouth of the hole.
  vec3 pr = p;
  vec3 pg = p;
  vec3 pb = p;
  vec3 dr = toEnvironment * normalize(mix(view, crystal * through(pr, i, n, IOR.r), REFRACTION));
  vec3 dg = toEnvironment * normalize(mix(view, crystal * through(pg, i, n, IOR.g), REFRACTION));
  vec3 db = toEnvironment * normalize(mix(view, crystal * through(pb, i, n, IOR.b), REFRACTION));
  vec3 refracted = vec3(nebula(dr).r, nebula(dg).g, nebula(db).b);
  refracted += stars(toEnvironment * (crystal * p), dg);

  vec3 reflected = nebula(toEnvironment * (crystal * reflect(i, n)));
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(dot(-i, n), 0.0), 5.0);

  // How far in from the outline this pixel is, in CSS pixels, and so how
  // much of the hole shows here. The outline is convex, so the distance is
  // the least over its edges - exact, and mitered at the corners; the edges
  // come from slab.js outline() each frame, and this is outlineDistance()'s
  // twin, both tested against the ray test. Unused entries are padded far
  // out of the way. y spans two view units over the canvas height.
  vec2 q = ndc * uView;
  float inset = 1e30;
  for (int e = 0; e < ${CORNERS.length}; e++) {
    inset = min(inset, uOutline[e].z - dot(uOutline[e].xy, q));
  }
  float hole = smoothstep(uRim, uRim + uFade, inset * uResolution.y / 2.0 / uPixelRatio);

  vec3 color = mix(mix(GLASS, refracted, hole), reflected, fresnel);

  float lambert = max(dot(crystal * n, LIGHT), 0.0);
  color *= mix(1.0 - DARKEN, 1.0, lambert);
  color += SHEEN * LIGHTEN * lambert * lambert;

  // Half a step of dither before the 8-bit canvas quantizes: the nebula is
  // mostly long, dark gradients, which is exactly where banding shows.
  color += (hash3(vec3(gl_FragCoord.xy, 0.0)).x - 0.5) / 255.0;

  // Premultiplied, as the context is.
  outColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`crystal: shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Compiles and links `fragment` against the full-canvas triangle. */
export function program(gl, fragment) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`crystal: program: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

/**
 * Paints `environment` - GLSL defining `vec3 environment(vec3 d)` - into a
 * new cubemap, one face per draw. Exported, with `program` and
 * `ENVIRONMENTS`, for the browser checks: that the faces land where a lookup
 * reads them, and what a sky looks like unrolled.
 *
 * The texels are sRGB-encoded. The painter writes, and the sampler reads, the
 * same values either way - the encoding is undone on lookup - but the
 * encoding spends its 8 bits mostly on the dark end, which is where this sky
 * lives: stored linearly, the nebula's deep gradients band.
 */
export function bake(gl, environment, size = MAX_CUBE_SIZE) {
  const cube = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.SRGB8_ALPHA8, size, size);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const painter = program(gl, BAKE.replace("%ENVIRONMENT%", environment));
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.viewport(0, 0, size, size);
  gl.useProgram(painter);
  gl.uniform1f(gl.getUniformLocation(painter, "uSize"), size);
  for (let face = 0; face < 6; face++) {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      cube,
      0,
    );
    gl.uniform1i(gl.getUniformLocation(painter, "uFace"), face);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteProgram(painter);
  return cube;
}

/**
 * Starts the crystal on `canvas`, which is sized by CSS and may set its own
 * hole margin in CSS pixels with `data-rim` and `data-fade` (see RIM, FADE).
 * Returns false, drawing nothing, when the browser has no WebGL2. Each canvas
 * is its own context, with its own sky and its own clock.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function start(canvas) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) return false;

  const params = new URLSearchParams(location.search);
  const frozen = params.has("crystal-t") ? Number(params.get("crystal-t")) : null;
  const environment = ENVIRONMENTS[params.get("crystal-env")] ?? ENVIRONMENTS.nebula;
  const setting = (name, fallback) => {
    const value = Number(canvas.dataset[name]);
    return Number.isFinite(value) && canvas.dataset[name] !== undefined ? value : fallback;
  };

  // The sky's resolution, from the canvas's height as laid out when the
  // page starts it (see MIN_CUBE_SIZE).
  const deviceHeight =
    canvas.clientHeight * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const cubeSize = Math.min(
    Math.max(2 ** Math.ceil(Math.log2(Math.max(deviceHeight, 1))), MIN_CUBE_SIZE),
    MAX_CUBE_SIZE,
  );

  gl.bindVertexArray(gl.createVertexArray());
  const cube = bake(gl, environment, cubeSize);
  const frame = program(gl, FRAME);
  gl.useProgram(frame);
  const uniform = (name) => gl.getUniformLocation(frame, name);
  gl.uniform1f(uniform("uLens"), LENS);
  gl.uniform4fv(uniform("uSlabs"), SLABS.flat());
  gl.uniform1f(uniform("uRim"), setting("rim", RIM));
  gl.uniform1f(uniform("uFade"), setting("fade", FADE));
  const uPixelRatio = uniform("uPixelRatio");
  const uPixelAngle = uniform("uPixelAngle");
  const uOutline = uniform("uOutline");
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  gl.uniform1i(uniform("uCube"), 0);
  const uResolution = uniform("uResolution");
  const uView = uniform("uView");
  const uCrystal = uniform("uCrystal");
  const uEnvironment = uniform("uEnvironment");

  // The backing store follows the canvas's laid-out size.
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    // y spans [-1, 1]; x follows the canvas's aspect.
    gl.uniform2f(uView, canvas.width / canvas.height, 1);
    // The ratio actually applied, after rounding, so a margin given in CSS
    // pixels is measured in the pixels the canvas really has.
    gl.uniform1f(uPixelRatio, canvas.height / Math.max(canvas.clientHeight, 1));
    // The lookups span 2 * LENS of tangent over the canvas's height; near
    // the middle, where the stars are, that is as good as radians.
    gl.uniform1f(uPixelAngle, (2 * LENS) / canvas.height);
  };

  // The outline for this turn, padded to the shader's fixed length with
  // edges so far out that no pixel is ever nearest them.
  const outlineEdges = new Float32Array(CORNERS.length * 3);
  const draw = (seconds) => {
    const turn = (period, sense) => sense * ((2 * Math.PI * seconds) / period);
    const crystalTurn = turn(CRYSTAL_PERIOD, CRYSTAL_SENSE);
    const edges = outline(CORNERS, crystalTurn);
    outlineEdges.fill(0);
    for (const [e, edge] of edges.entries()) outlineEdges.set(edge, e * 3);
    for (let e = edges.length; e < CORNERS.length; e++) outlineEdges[e * 3 + 2] = 1e6;
    gl.uniform3fv(uOutline, outlineEdges);
    gl.uniform1f(uCrystal, crystalTurn);
    gl.uniform1f(uEnvironment, turn(ENVIRONMENT_PERIOD, ENVIRONMENT_SENSE));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let visible = true;
  let pending = 0;

  // Time comes from the frame clock, not a count of frames, so the turn is
  // the same speed at any refresh rate.
  const tick = (now) => {
    pending = 0;
    draw(now / 1000);
    schedule();
  };
  const schedule = () => {
    if (!pending && visible && frozen === null && !still.matches) {
      pending = requestAnimationFrame(tick);
    }
  };
  const redraw = () => {
    resize();
    if (frozen !== null) draw(frozen);
    else if (still.matches) draw(STILL_TIME);
    else schedule();
  };

  new ResizeObserver(redraw).observe(canvas);
  still.addEventListener("change", redraw);
  // Off screen, nothing is drawn; requestAnimationFrame already stops for a
  // hidden tab.
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible && pending) {
      cancelAnimationFrame(pending);
      pending = 0;
    }
    schedule();
  }).observe(canvas);
  redraw();
  return true;
}

// Every canvas that asks for a crystal gets one.
for (const canvas of document.querySelectorAll("canvas[data-crystal]")) start(canvas);
