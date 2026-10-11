// Colour arithmetic for the colour-vision tests: what the page's SVG filter
// does to a colour, and how far apart two colours look.
//
// The page applies each matrix with color-interpolation-filters="linearRGB"
// (src/engine/colorVision.ts), so `simulate` does the same: decode sRGB to
// linear light, apply the 3x3 matrix, clamp, encode back to sRGB. `deltaE` is
// the CIE 1976 difference in CIELAB (D65): about 2 is a just-noticeable
// difference side by side, and in a field of mixed light and dark dots a
// difference several times that still goes unseen.
import { MATRICES } from "../src/engine/colorVisionMatrices.ts";

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (x) => Math.min(1, Math.max(0, x));

/** "#rrggbb" -> [r, g, b] in 0..1 (sRGB). */
export function parseHex(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
}

/** The sRGB colour `hex` becomes under `view` ("none" or a key of MATRICES). */
export function simulate(hex, view) {
  const rgb = parseHex(hex);
  if (view === "none") return rgb;
  const m = MATRICES[view];
  if (!m) throw new Error(`unknown view: ${view}`);
  const lin = rgb.map(toLinear);
  return [0, 3, 6].map((i) => toSrgb(clamp(m[i] * lin[0] + m[i + 1] * lin[1] + m[i + 2] * lin[2])));
}

/** sRGB [r, g, b] in 0..1 -> CIELAB [L, a, b] (D65). */
export function toLab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference between two sRGB colours. */
export function deltaE(a, b) {
  const [p, q] = [toLab(a), toLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
