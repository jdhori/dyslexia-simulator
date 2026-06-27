// The "perception alphabet".
//
// A per-letter distortion that recreates how some people with learning or
// developmental disabilities describe seeing characters: letterforms that
// mirror, tilt off the line, drift above or below the baseline, or fade,
// rather than sitting still.
//
// It is a deliberately *uneven* alphabet. A few letters reverse strongly (the
// famous reversals), most only tilt or drift, and some are left almost alone —
// so a word stays barely decodable with effort, which is the point.
//
// Each letter maps to CSS *individual transform properties* (`rotate`, `scale`,
// `translate`) plus `opacity`. Using the individual properties (rather than the
// `transform` shorthand) leaves `transform` free for the wobble animation, so
// the static distortion and the live tremble compose cleanly.

interface GlyphTransform {
  /** Tilt, in degrees. */
  rotate?: number;
  /** Horizontal reflection (b <-> d feel). */
  mirror?: boolean;
  /** Vertical reflection (b <-> p feel). */
  flip?: boolean;
  /** Baseline drift, in em. */
  dy?: number;
  /** Faded ink, 0..1. */
  fade?: number;
}

const ALPHABET: Record<string, GlyphTransform> = {
  a: { rotate: -7, dy: 0.03 },
  b: { mirror: true },
  c: { rotate: 11 },
  d: { flip: true },
  e: { mirror: true, fade: 0.85 },
  f: { rotate: 9 },
  g: { rotate: 13, dy: 0.04 },
  h: { rotate: -6 },
  i: { dy: -0.05 },
  j: { rotate: 10 },
  k: { rotate: 9 },
  l: { rotate: 8, dy: 0.03 },
  m: { rotate: -5 },
  n: { rotate: 12 },
  o: { fade: 0.82 },
  p: { flip: true },
  q: { mirror: true },
  r: { rotate: 13 },
  s: { mirror: true },
  t: { rotate: -8 },
  u: { rotate: 7, dy: 0.04 },
  v: { rotate: 16 },
  w: { rotate: -7 },
  x: { rotate: 12 },
  y: { rotate: 9 },
  z: { rotate: 14 },
};

const STYLE_ID = "perception-alphabet-styles";

/** Inject the generated perception stylesheet once per document. */
export function ensurePerceptionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCss();
  document.head.appendChild(style);
}

function buildCss(): string {
  const rules: string[] = [];
  for (const [letter, transform] of Object.entries(ALPHABET)) {
    const declarations = toDeclarations(transform);
    rules.push(
      `.sim-visual.m-perception .glyph[data-char="${letter}"] { ${declarations} }`,
    );
  }
  return rules.join("\n");
}

function toDeclarations(transform: GlyphTransform): string {
  const declarations: string[] = [];
  // Tilt and baseline drift scale with the Intensity slider (--perception-amp);
  // the mirror/flip itself is binary, and the fade is left as authored.
  if (transform.rotate) {
    declarations.push(`rotate: calc(${transform.rotate}deg * var(--perception-amp, 1));`);
  }

  const scaleX = transform.mirror ? -1 : 1;
  const scaleY = transform.flip ? -1 : 1;
  if (scaleX !== 1 || scaleY !== 1) {
    declarations.push(`scale: ${scaleX} ${scaleY};`);
  }

  if (transform.dy) {
    declarations.push(`translate: 0 calc(${transform.dy}em * var(--perception-amp, 1));`);
  }
  if (transform.fade !== undefined) declarations.push(`opacity: ${transform.fade};`);

  return declarations.join(" ");
}
