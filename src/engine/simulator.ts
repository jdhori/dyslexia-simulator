// Drives one region of the page. It snapshots the original content for assistive
// technology, wraps the visible text in glyphs, and applies the active modes.
//
// Accessibility model: the visible (animated) layer is `aria-hidden`, because a
// screen reader user does not experience visual scrambling and should never hear
// reordered letters. When `srCopy` is requested, an off-screen, unaltered copy
// of the text is left in the accessibility tree so the real content is available.
//
// Each mode has its own timing/strength, so scramble and line-jump run on
// independent timers and every CSS mode reads its own custom property.

import { buildGlyphModel, type GlyphCell, type GlyphModel } from "./glyphs";
import { restoreWord, scrambleWord, swapCells } from "./scramble";
import { ensurePerceptionStyles } from "./perception";
import { ensureFragmentStyles } from "./fragment";
import { isMotionAllowed } from "./motion";
import { amp, periodMs } from "./cssParams";
import type { Settings } from "../state";

interface SimulatorOptions {
  /** Leave an off-screen original copy for screen readers. */
  srCopy: boolean;
}

/** Passes used to reach a clearly-scrambled but motionless state. */
const STATIC_PASSES = 6;

/** Recompute the line layout at least this often, to track scramble's drift. */
const NEIGHBOR_REFRESH_TICKS = 30;
/** Vertical tolerance (px) for grouping glyphs into the same visual line. */
const LINE_TOLERANCE = 8;
/** Block elements that bound a paragraph; letter switching never crosses them. */
const PARAGRAPH_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";

// "Letter flips" also swaps look-alike digit/letter pairs — the sudden character
// replacement some readers report, which needs no neighbour to switch with.
// Case-sensitive, keyed on the displayed character. (6/9 and b d p q g are
// mirrored/rotated in CSS instead; see style.css.)
const CONFUSABLES = new Map<string, string>([
  ["0", "O"], ["O", "0"],
  ["2", "R"], ["R", "2"],
  ["3", "E"], ["E", "3"],
  ["5", "S"], ["S", "5"],
  ["8", "B"], ["B", "8"],
]);
/** Cadence of the confusable swap, and the per-glyph chance to flip each tick. */
const FLIP_PERIOD_MS = 700;
const CONFUSABLE_PROB = 0.25;
/** A single letter — used to keep the cross-line jump on letters only. */
const LETTER_RE = /\p{L}/u;

interface VerticalNeighbors {
  readonly up?: GlyphCell;
  readonly down?: GlyphCell;
}

interface MeasuredGlyph {
  readonly cell: GlyphCell;
  readonly centerX: number;
  readonly top: number;
}

export class Simulator {
  private readonly visualEl: HTMLElement;
  private readonly model: GlyphModel;
  // Letters only — drives the cross-line jump (the scramble uses model.words,
  // which also includes digit runs so numbers shuffle).
  private readonly letterCells: GlyphCell[];
  // Digit/letter look-alikes the flip mode swaps (a subset of model.cells).
  private readonly confusableCells: GlyphCell[];
  private srEl: HTMLElement | null = null;
  private scrambleTimer: number | null = null;
  private linejumpTimer: number | null = null;
  private flipTimer: number | null = null;
  private settings: Settings | null = null;

  // Vertical-neighbour map for the line-switching effect, plus its freshness.
  private neighbors: Map<GlyphCell, VerticalNeighbors> | null = null;
  private ticksSinceNeighbors = 0;
  private layoutKey = "";
  private readonly resizeObserver: ResizeObserver;

  constructor(
    visualEl: HTMLElement,
    options: SimulatorOptions = { srCopy: true },
  ) {
    ensurePerceptionStyles();
    ensureFragmentStyles();
    this.visualEl = visualEl;
    if (options.srCopy) this.srEl = this.buildSrCopy(visualEl);
    visualEl.classList.add("sim-visual");
    visualEl.setAttribute("aria-hidden", "true");
    this.model = buildGlyphModel(visualEl);
    // Letters only — model.words now also holds digit runs (so numbers scramble),
    // but the cross-line jump should still move letters, never digits.
    this.letterCells = this.model.cells.filter((cell) =>
      LETTER_RE.test(cell.original),
    );
    this.confusableCells = this.model.cells.filter((cell) =>
      CONFUSABLES.has(cell.original),
    );

    // A width change rewraps the text, which invalidates the neighbour map.
    this.resizeObserver = new ResizeObserver(() => {
      this.neighbors = null;
    });
    this.resizeObserver.observe(visualEl);
  }

  apply(settings: Settings): void {
    this.settings = settings;
    this.applyParams(settings);
    this.invalidateNeighborsIfLayoutChanged(settings);

    const motion = isMotionAllowed();
    const active = settings.enabled && !settings.reveal;

    this.syncClasses(settings, active, motion);
    this.clearTimers();

    if (!active) {
      this.restoreAll();
      return;
    }

    // A clean baseline when nothing is rewriting the text, so the static modes
    // (perception, flip, fragment…) apply to the correct letters.
    if (!settings.scramble) this.restoreAll();

    if (settings.scramble) {
      if (motion) {
        this.scrambleTimer = window.setInterval(
          () => this.scrambleTick(),
          settings.scrambleSpeed,
        );
      } else {
        this.restoreAll();
        this.staticScramble();
      }
    }

    // Line-jump is motion-gated and runs on its own clock.
    if (settings.linejump && motion) {
      this.linejumpTimer = window.setInterval(
        () => this.lineJumpTick(),
        settings.linejumpSpeed,
      );
    }

    // Flip's confusable swaps (digit ↔ look-alike letter) run whether or not the
    // scramble is on. With motion they flicker; otherwise a single static swap.
    // When flip is off, undo any swaps the scramble path didn't already reset.
    if (settings.flip) {
      if (motion) {
        this.flipTimer = window.setInterval(() => this.flipTick(), FLIP_PERIOD_MS);
      } else {
        this.restoreConfusables();
        this.staticFlip();
      }
    } else {
      this.restoreConfusables();
    }
  }

  destroy(): void {
    this.clearTimers();
    this.restoreAll();
    this.resizeObserver.disconnect();
    this.neighbors = null;
    this.srEl?.remove();
    this.srEl = null;
  }

  // Expose each mode's strength/tempo to its CSS via custom properties.
  private applyParams(s: Settings): void {
    const v = this.visualEl.style;
    v.setProperty("--perception-amp", amp(s.perceptionIntensity));
    v.setProperty("--wobble-amp", amp(s.wobbleIntensity));
    v.setProperty("--wobble-period", periodMs(s.wobbleSpeed));
    v.setProperty("--blur-amp", amp(s.blurIntensity));
    v.setProperty("--blur-period", periodMs(s.blurSpeed));
    v.setProperty("--crowd-amp", amp(s.crowdingIntensity));
    v.setProperty("--fragment-amp", amp(s.fragmentIntensity));
  }

  private syncClasses(s: Settings, active: boolean, motion: boolean): void {
    const v = this.visualEl;
    v.classList.toggle("m-flip", active && s.flip);
    v.classList.toggle("m-perception", active && s.perception);
    v.classList.toggle("m-blur", active && s.blur);
    v.classList.toggle("m-crowd", active && s.crowding);
    v.classList.toggle("m-wobble", active && s.wobble && motion);
    v.classList.toggle("m-fragment", active && s.fragment);
  }

  private scrambleTick(): void {
    const s = this.settings;
    if (!s) return;
    for (const word of this.model.words) {
      if (Math.random() < s.scrambleIntensity) scrambleWord(word, s.scrambleEnds);
    }
  }

  // Switch letters with the word directly above or below — but only where such a
  // word exists. Letters at the top or bottom of the text, or beside a paragraph
  // gap, have no neighbour there and so never jump into empty space.
  private lineJumpTick(): void {
    const s = this.settings;
    if (!s) return;
    const map = this.ensureNeighbors();
    const used = new Set<GlyphCell>();
    for (const [cell, neighbor] of map) {
      if (used.has(cell)) continue;
      if (Math.random() >= s.linejumpIntensity) continue;

      const options: GlyphCell[] = [];
      if (neighbor.up && !used.has(neighbor.up)) options.push(neighbor.up);
      if (neighbor.down && !used.has(neighbor.down)) options.push(neighbor.down);
      if (options.length === 0) continue;

      const other = options[Math.floor(Math.random() * options.length)];
      swapCells(cell, other);
      used.add(cell);
      used.add(other);
    }
  }

  private ensureNeighbors(): Map<GlyphCell, VerticalNeighbors> {
    this.ticksSinceNeighbors += 1;
    if (this.neighbors && this.ticksSinceNeighbors < NEIGHBOR_REFRESH_TICKS) {
      return this.neighbors;
    }
    this.neighbors = this.computeNeighbors();
    this.ticksSinceNeighbors = 0;
    return this.neighbors;
  }

  private computeNeighbors(): Map<GlyphCell, VerticalNeighbors> {
    const map = new Map<GlyphCell, VerticalNeighbors>();
    for (const cells of this.groupByParagraph().values()) {
      const lines = this.groupIntoLines(cells);
      for (let i = 0; i < lines.length; i++) {
        const above = i > 0 ? lines[i - 1] : null;
        const below = i < lines.length - 1 ? lines[i + 1] : null;
        for (const item of lines[i]) {
          const up = above ? nearestByX(above, item.centerX) : undefined;
          const down = below ? nearestByX(below, item.centerX) : undefined;
          if (up || down) map.set(item.cell, { up, down });
        }
      }
    }
    return map;
  }

  private groupByParagraph(): Map<Element, GlyphCell[]> {
    const groups = new Map<Element, GlyphCell[]>();
    // Letters only: the cross-line jump never moves digits or punctuation.
    for (const cell of this.letterCells) {
      const paragraph = cell.el.closest(PARAGRAPH_SELECTOR) ?? this.visualEl;
      let list = groups.get(paragraph);
      if (!list) {
        list = [];
        groups.set(paragraph, list);
      }
      list.push(cell);
    }
    return groups;
  }

  private groupIntoLines(cells: GlyphCell[]): MeasuredGlyph[][] {
    const measured: MeasuredGlyph[] = cells.map((cell) => {
      const rect = cell.el.getBoundingClientRect();
      return { cell, centerX: rect.left + rect.width / 2, top: rect.top };
    });
    measured.sort((a, b) => a.top - b.top || a.centerX - b.centerX);

    const lines: MeasuredGlyph[][] = [];
    let current: MeasuredGlyph[] | null = null;
    let lineTop = Number.NaN;
    for (const item of measured) {
      if (!current || Math.abs(item.top - lineTop) > LINE_TOLERANCE) {
        current = [];
        lines.push(current);
        lineTop = item.top;
      }
      current.push(item);
    }
    for (const line of lines) line.sort((a, b) => a.centerX - b.centerX);
    return lines;
  }

  private invalidateNeighborsIfLayoutChanged(s: Settings): void {
    // Only crowding (and, while crowding is on, its strength) rewraps lines.
    const key = `${s.crowding}|${s.crowding ? s.crowdingIntensity : 0}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.neighbors = null;
    }
  }

  private staticScramble(): void {
    const includeEnds = this.settings?.scrambleEnds ?? false;
    for (let pass = 0; pass < STATIC_PASSES; pass++) {
      for (const word of this.model.words) scrambleWord(word, includeEnds);
    }
  }

  private restoreAll(): void {
    // Reset every glyph — letters, digits, and the confusable swaps alike.
    restoreWord({ cells: this.model.cells });
  }

  // --- flip confusables (digit ↔ look-alike letter) ---

  private flipTick(): void {
    for (const cell of this.confusableCells) {
      if (Math.random() >= CONFUSABLE_PROB) continue;
      const pair = CONFUSABLES.get(cell.original);
      if (pair === undefined) continue;
      // Toggle between the real character and its look-alike.
      const showOriginal = (cell.el.textContent ?? "") !== cell.original;
      setGlyphChar(cell.el, showOriginal ? cell.original : pair);
    }
  }

  private staticFlip(): void {
    for (const cell of this.confusableCells) {
      const pair = CONFUSABLES.get(cell.original);
      if (pair !== undefined) setGlyphChar(cell.el, pair);
    }
  }

  private restoreConfusables(): void {
    restoreWord({ cells: this.confusableCells });
  }

  private clearTimers(): void {
    if (this.scrambleTimer !== null) {
      clearInterval(this.scrambleTimer);
      this.scrambleTimer = null;
    }
    if (this.linejumpTimer !== null) {
      clearInterval(this.linejumpTimer);
      this.linejumpTimer = null;
    }
    if (this.flipTimer !== null) {
      clearInterval(this.flipTimer);
      this.flipTimer = null;
    }
  }

  private buildSrCopy(el: HTMLElement): HTMLElement {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-sim");
    clone.removeAttribute("aria-hidden");
    clone.classList.remove("sim-visual");
    clone.classList.add("sim-sr", "sr-only");
    el.insertAdjacentElement("afterend", clone);
    return clone;
  }
}

// Show a character in a glyph and keep its data-char in sync (so the CSS modes
// keyed on data-char follow the displayed character).
function setGlyphChar(el: HTMLElement, char: string): void {
  el.textContent = char;
  el.dataset.char = char.toLowerCase();
}

function nearestByX(line: MeasuredGlyph[], centerX: number): GlyphCell | undefined {
  let best: MeasuredGlyph | undefined;
  let bestDistance = Infinity;
  for (const item of line) {
    const distance = Math.abs(item.centerX - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best?.cell;
}
