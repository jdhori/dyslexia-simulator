// Replace the text inside a container with one <span class="glyph"> per letter,
// grouped into words. This is what lets us style and reorder individual letters
// without disturbing the surrounding markup. The real characters are preserved
// (as `original`) so the text can always be restored exactly.

import { collectTextNodes } from "./textNodes";

export interface GlyphCell {
  // HTMLElement (not just HTMLSpanElement) so a cell can also wrap an existing
  // KaTeX glyph element, which the math simulator reuses in place.
  readonly el: HTMLElement;
  readonly original: string;
}

export interface WordRun {
  readonly cells: GlyphCell[];
}

export interface GlyphModel {
  readonly cells: GlyphCell[];
  readonly words: WordRun[];
}

// Lines may break only at whitespace. Each non-whitespace token (a word plus any
// attached punctuation, e.g. "around.") is kept whole; the line never breaks
// inside it, so punctuation can never be orphaned onto its own line.
const WHITESPACE_OR_TOKEN = /(\s+)|(\S+)/g;
// Within a token, letter runs (capture 1) and everything else (capture 2 —
// digits, punctuation, symbols) all become glyphs. Each letter run is its own
// WordRun; within the non-letters, every digit joins ONE shared WordRun, so all
// the digits in a number intermix (e.g. across "1-800-555-1234") while the
// separators between them stay put.
const LETTERS_OR_OTHER = /(\p{L}+)|([^\p{L}]+)/gu;

export function buildGlyphModel(container: HTMLElement): GlyphModel {
  const textNodes = collectTextNodes(container);
  const cells: GlyphCell[] = [];
  const words: WordRun[] = [];

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? "";
    const fragment = document.createDocumentFragment();

    WHITESPACE_OR_TOKEN.lastIndex = 0;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = WHITESPACE_OR_TOKEN.exec(text)) !== null) {
      const whitespace: string | undefined = tokenMatch[1];
      const token: string | undefined = tokenMatch[2];

      if (whitespace) {
        // Whitespace stays as plain text — the only place a line may break.
        fragment.appendChild(document.createTextNode(whitespace));
        continue;
      }
      if (!token) continue;

      // One wrapper per token. It's inline-block so the line breaks between
      // tokens (at the whitespace), never inside — keeping punctuation attached.
      const wordEl = document.createElement("span");
      wordEl.className = "word";

      LETTERS_OR_OTHER.lastIndex = 0;
      let partMatch: RegExpExecArray | null;
      while ((partMatch = LETTERS_OR_OTHER.exec(token)) !== null) {
        const letters: string | undefined = partMatch[1];
        const other: string | undefined = partMatch[2];
        if (letters) {
          // A run of letters scrambles as one word (first/last preserved).
          const run: WordRun = { cells: [] };
          appendGlyphs(letters, wordEl, cells, run);
          words.push(run);
        } else if (other) {
          // Every digit in this run joins one shared word, so all the digits in
          // a number intermix (not just one group); the separators between them
          // stay put as standalone glyphs.
          const digitRun: WordRun = { cells: [] };
          for (const char of other) {
            const isDigit = char >= "0" && char <= "9";
            appendGlyphs(char, wordEl, cells, isDigit ? digitRun : null);
          }
          if (digitRun.cells.length) words.push(digitRun);
        }
      }

      fragment.appendChild(wordEl);
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return { cells, words };
}

// Wrap each character of `text` in a glyph, collecting them into `cells` and
// (when given) into a WordRun so the scramble treats them as one word.
function appendGlyphs(
  text: string,
  wordEl: HTMLElement,
  cells: GlyphCell[],
  run: WordRun | null,
): void {
  for (const char of text) {
    const cell = createGlyph(char);
    cells.push(cell);
    if (run) run.cells.push(cell);
    wordEl.appendChild(cell.el);
  }
}

function createGlyph(char: string): GlyphCell {
  const el = document.createElement("span");
  el.className = "glyph";
  el.dataset.char = char.toLowerCase();
  el.textContent = char;
  // Per-glyph random negative delay so wobble never moves in lockstep. The
  // duration itself comes from --wobble-period, driven by the wobble Speed slider.
  el.style.setProperty("--gd", `${(Math.random() * -2).toFixed(2)}s`);
  return { el, original: char };
}
