// Typoglycemia: shuffle a word's inner letters while the first and last stay
// fixed. Each pass swaps two inner letters, so over time a word's middle drifts
// — the gradual "jumping letters" effect from the original demo.

import type { GlyphCell, WordRun } from "./glyphs";

export function scrambleWord(run: WordRun, includeEnds: boolean): void {
  const { cells } = run;
  // Classic typoglycemia keeps the first and last letters fixed (swappable
  // range 1..len-2, so len >= 4). Including the ends opens the whole word
  // (range 0..len-1, so len >= 2) for a full anagram.
  const lo = includeEnds ? 0 : 1;
  const hi = includeEnds ? cells.length - 1 : cells.length - 2;
  if (hi - lo < 1) return;

  const a = randInt(lo, hi);
  let b = randInt(lo, hi);
  if (a === b) b = a === hi ? lo : a + 1;

  swapCells(cells[a], cells[b]);
}

export function restoreWord(run: WordRun): void {
  for (const cell of run.cells) restoreCell(cell);
}

function restoreCell(cell: GlyphCell): void {
  cell.el.textContent = cell.original;
  cell.el.dataset.char = cell.original.toLowerCase();
}

/** Swap the displayed characters (and data-char) of two glyph cells. Used by
 *  the within-word scramble and by the cross-line letter switching. */
export function swapCells(a: GlyphCell, b: GlyphCell): void {
  const aChar = a.el.textContent ?? "";
  const bChar = b.el.textContent ?? "";
  a.el.textContent = bChar;
  b.el.textContent = aChar;
  a.el.dataset.char = bChar.toLowerCase();
  b.el.dataset.char = aChar.toLowerCase();
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
