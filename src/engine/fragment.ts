// "Letter fragments" mode — an approximation of Daniel Britton's "Dyslexia"
// typeface, where a different portion of each letter is removed so the word has
// to be decoded slowly from the fragments that remain.
//
// This is NOT his font. It's an original, per-character mask map: each letter
// loses a different region (top, bottom, a side, both sides, or the middle),
// generated as a stylesheet keyed on the glyph's data-char (so it also follows a
// letter when the scramble moves it). His actual typeface is the faithful
// version — drop the font in and point this mode at it instead.

// Which region of a letter is masked away.
type Cut = "top" | "bottom" | "left" | "right" | "sides" | "centerV" | "centerH";

// A deliberately varied assignment — chosen so each letter (and digit) loses a
// different part, not a copy of any specific typeface.
const ALPHABET: Record<string, Cut> = {
  a: "bottom",
  b: "left",
  c: "right",
  d: "top",
  e: "centerH",
  f: "left",
  g: "top",
  h: "centerV",
  i: "bottom",
  j: "top",
  k: "right",
  l: "top",
  m: "centerV",
  n: "right",
  o: "sides",
  p: "bottom",
  q: "bottom",
  r: "right",
  s: "centerH",
  t: "left",
  u: "top",
  v: "bottom",
  w: "centerV",
  x: "centerV",
  y: "bottom",
  z: "left",

  // Digits get a varied set too, so dates, times and phone numbers fragment
  // like words instead of all losing the same (fallback) top slice.
  "0": "sides",
  "1": "right",
  "2": "bottom",
  "3": "centerH",
  "4": "left",
  "5": "top",
  "6": "centerV",
  "7": "right",
  "8": "sides",
  "9": "bottom",
};

const STYLE_ID = "fragment-mask-styles";

export function ensureFragmentStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCss();
  document.head.appendChild(style);
}

// Every cut size is multiplied by --fragment-amp (the "Removal size" slider), so
// the same per-letter pattern can take away a little or almost all of the glyph.
// Edge cuts grow from one side; the two centred cuts grow symmetrically about
// the letter's middle. Vertical cuts use a slightly larger base fraction because
// the glyph box includes line-height leading; horizontal cuts act on the tighter
// letter width.

// `n%` of the box, scaled by the removal-size variable.
function s(base: number): string {
  return `calc(${base}% * var(--fragment-amp, 1))`;
}
// `100% - n%`, scaled — the far edge of a side/edge cut.
function rest(base: number): string {
  return `calc(100% - ${base}% * var(--fragment-amp, 1))`;
}
// A band centred at `center%`, half-width `half%`, scaled — for the middle cuts.
function lo(center: number, half: number): string {
  return `calc(${center}% - ${half}% * var(--fragment-amp, 1))`;
}
function hi(center: number, half: number): string {
  return `calc(${center}% + ${half}% * var(--fragment-amp, 1))`;
}

function maskFor(cut: Cut): string {
  switch (cut) {
    case "top":
      return `linear-gradient(to bottom, transparent 0 ${s(44)}, #000 ${s(44)})`;
    case "bottom":
      return `linear-gradient(to top, transparent 0 ${s(40)}, #000 ${s(40)})`;
    case "left":
      return `linear-gradient(to right, transparent 0 ${s(36)}, #000 ${s(36)})`;
    case "right":
      return `linear-gradient(to left, transparent 0 ${s(36)}, #000 ${s(36)})`;
    case "sides":
      return `linear-gradient(to right, transparent 0 ${s(24)}, #000 ${s(24)} ${rest(24)}, transparent ${rest(24)})`;
    case "centerV":
      return `linear-gradient(to right, #000 0 ${lo(50, 18)}, transparent ${lo(50, 18)} ${hi(50, 18)}, #000 ${hi(50, 18)})`;
    case "centerH":
      return `linear-gradient(to bottom, #000 0 ${lo(51, 13)}, transparent ${lo(51, 13)} ${hi(51, 13)}, #000 ${hi(51, 13)})`;
  }
}

function rule(selector: string, mask: string): string {
  return `${selector} { -webkit-mask-image: ${mask}; mask-image: ${mask}; }`;
}

function buildCss(): string {
  const rules: string[] = [];
  // Fallback for any glyph without a mapped character (e.g. punctuation, Greek).
  rules.push(rule(".sim-visual.m-fragment .glyph", maskFor("top")));
  for (const [letter, cut] of Object.entries(ALPHABET)) {
    rules.push(
      rule(`.sim-visual.m-fragment .glyph[data-char="${letter}"]`, maskFor(cut)),
    );
  }
  return rules.join("\n");
}
