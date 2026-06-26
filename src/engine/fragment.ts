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

// A deliberately varied assignment — chosen so each letter loses a different
// part, not a copy of any specific typeface.
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
};

const STYLE_ID = "fragment-mask-styles";

export function ensureFragmentStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildCss();
  document.head.appendChild(style);
}

// Vertical cuts use a slightly larger fraction because the glyph box includes
// line-height leading; horizontal cuts act on the tighter letter width.
function maskFor(cut: Cut): string {
  switch (cut) {
    case "top":
      return "linear-gradient(to bottom, transparent 0 44%, #000 44%)";
    case "bottom":
      return "linear-gradient(to top, transparent 0 40%, #000 40%)";
    case "left":
      return "linear-gradient(to right, transparent 0 36%, #000 36%)";
    case "right":
      return "linear-gradient(to left, transparent 0 36%, #000 36%)";
    case "sides":
      return "linear-gradient(to right, transparent 0 24%, #000 24% 76%, transparent 76%)";
    case "centerV":
      return "linear-gradient(to right, #000 0 32%, transparent 32% 68%, #000 68%)";
    case "centerH":
      return "linear-gradient(to bottom, #000 0 38%, transparent 38% 64%, #000 64%)";
  }
}

function rule(selector: string, mask: string): string {
  return `${selector} { -webkit-mask-image: ${mask}; mask-image: ${mask}; }`;
}

function buildCss(): string {
  const rules: string[] = [];
  // Fallback for any glyph without a mapped letter (e.g. digits).
  rules.push(rule(".sim-visual.m-fragment .glyph", maskFor("top")));
  for (const [letter, cut] of Object.entries(ALPHABET)) {
    rules.push(
      rule(`.sim-visual.m-fragment .glyph[data-char="${letter}"]`, maskFor(cut)),
    );
  }
  return rules.join("\n");
}
