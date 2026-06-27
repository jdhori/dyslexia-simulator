// Renders a LaTeX equation with KaTeX and applies the simulation to it:
//
//  - the \text{...} words are split into per-letter glyphs, so they scramble
//    (typoglycemia) AND take the per-glyph visual modes — perception, wobble,
//    blur, b/d/p/q flips, and the letter-fragment masks — like ordinary text;
//  - other math characters (variables, digits, small operators) get the same
//    per-glyph visual modes; variables and digits also mix positions;
//  - structural pieces (fractions, roots, large operators, big delimiters) are
//    left untouched, so the equation's shape stays intact;
//  - crowding and line-jumping are never applied (they would wreck an equation).
//
// KaTeX emits a visual `.katex-html` (aria-hidden) and a `.katex-mathml` layer
// for screen readers. We only ever touch the visual layer, so assistive tech
// always receives the correct equation.

import katex from "katex";
import "katex/dist/katex.min.css";
import { isMotionAllowed } from "./motion";
import { amp, periodMs } from "./cssParams";
import { restoreWord, scrambleWord, swapCells } from "./scramble";
import type { GlyphCell, WordRun } from "./glyphs";
import type { Settings } from "../state";

const STATIC_PASSES = 6;

// "Visual" math structures — division (fractions), sums and other large
// operators, square roots, and stretchy delimiters. Their glyphs never move.
const STRUCTURAL_SELECTOR = ".mop, .op-symbol, .sqrt, .mfrac, .delimsizing";

export class MathSimulator {
  private readonly host: HTMLElement; // KaTeX's visual (.katex-html) layer
  // \text{...} content, split into per-letter glyphs and grouped into words so
  // the scramble keeps each word's first and last letters in place.
  private readonly textWords: WordRun[] = [];
  // Single-letter variables + digits, which mix positions with each other.
  private readonly mathGlyphs: GlyphCell[] = [];
  private timer: number | null = null;
  private settings: Settings | null = null;

  constructor(container: HTMLElement, latex: string) {
    katex.render(latex, container, {
      displayMode: true,
      throwOnError: false,
      output: "htmlAndMathml",
    });
    this.host = container.querySelector<HTMLElement>(".katex-html") ?? container;
    this.host.classList.add("sim-visual", "sim-math");
    this.tagGlyphs();
    this.wrapTextGlyphs();
  }

  apply(settings: Settings): void {
    this.settings = settings;
    const motion = isMotionAllowed();
    const active = settings.enabled && !settings.reveal;

    // Each visual mode reads its own strength/tempo (math has no crowding or
    // line-jump, so those vars are not set here).
    const style = this.host.style;
    style.setProperty("--perception-amp", amp(settings.perceptionIntensity));
    style.setProperty("--wobble-amp", amp(settings.wobbleIntensity));
    style.setProperty("--wobble-period", periodMs(settings.wobbleSpeed));
    style.setProperty("--blur-amp", amp(settings.blurIntensity));
    style.setProperty("--blur-period", periodMs(settings.blurSpeed));
    style.setProperty("--fragment-amp", amp(settings.fragmentIntensity));

    // Perception / flip / blur / wobble / fragments apply to math — but never
    // crowding or line-jumping.
    const v = this.host;
    v.classList.toggle("m-flip", active && settings.flip);
    v.classList.toggle("m-perception", active && settings.perception);
    v.classList.toggle("m-blur", active && settings.blur);
    v.classList.toggle("m-wobble", active && settings.wobble && motion);
    v.classList.toggle("m-fragment", active && settings.fragment);

    this.clearTimer();
    if (!active || !settings.scramble) {
      this.restore();
      return;
    }
    if (motion) {
      this.timer = window.setInterval(() => this.tick(), settings.scrambleSpeed);
    } else {
      this.restore();
      this.staticScramble();
    }
  }

  destroy(): void {
    this.clearTimer();
    this.restore();
  }

  // Tag ordinary math character spans as glyphs so the per-glyph CSS modes apply
  // to them — skipping \text (handled separately) and structural pieces.
  private tagGlyphs(): void {
    const walker = document.createTreeWalker(this.host, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node): number {
        if (!/\S/.test(node.nodeValue ?? "")) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".text")) return NodeFilter.FILTER_REJECT;
        if (parent.closest(STRUCTURAL_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const parent = (node as Text).parentElement;
      if (!parent) continue;
      parent.classList.add("glyph");
      const char = (node.nodeValue ?? "").trim();
      if ([...char].length === 1) {
        parent.dataset.char = char.toLowerCase();
        // Italic variables (KaTeX's .mathnormal) and digits may swap places
        // with each other — full mix, no first/last protection. Operators and
        // special letters (ℝ etc.) are left where they are.
        if (parent.classList.contains("mathnormal") || /[0-9]/.test(char)) {
          this.mathGlyphs.push({ el: parent, original: char });
        }
      }
    }
  }

  // Split each \text{...} run into per-letter <span class="glyph"> elements so
  // the fragment masks and other per-glyph modes reach the words too. Spaces are
  // kept as plain text nodes (preserving KaTeX's spacing) and break words.
  private wrapTextGlyphs(): void {
    for (const span of this.host.querySelectorAll<HTMLElement>(".text")) {
      if (!span.isConnected) continue; // a parent .text was already rewrapped
      if (span.parentElement?.closest(".text")) continue; // skip nested .text
      const text = span.textContent ?? "";
      if (!text) continue;

      span.textContent = "";
      let cells: GlyphCell[] = [];
      for (const ch of text) {
        if (/\s/.test(ch)) {
          span.appendChild(document.createTextNode(ch));
          if (cells.length) {
            this.textWords.push({ cells });
            cells = [];
          }
          continue;
        }
        const el = document.createElement("span");
        el.className = "glyph";
        el.dataset.char = ch.toLowerCase();
        el.textContent = ch;
        span.appendChild(el);
        cells.push({ el, original: ch });
      }
      if (cells.length) this.textWords.push({ cells });
    }
  }

  private tick(): void {
    const s = this.settings;
    if (!s) return;
    for (const word of this.textWords) {
      if (Math.random() < s.scrambleIntensity) scrambleWord(word, s.scrambleEnds);
    }
    this.mixMath(s.scrambleIntensity);
  }

  private staticScramble(): void {
    const includeEnds = this.settings?.scrambleEnds ?? false;
    for (let pass = 0; pass < STATIC_PASSES; pass++) {
      for (const word of this.textWords) scrambleWord(word, includeEnds);
      this.mixMath(1);
    }
  }

  // Variables and digits swap places with each other (full mix, first and last
  // are not protected) — the "updated letter scramble" applied across the maths.
  private mixMath(intensity: number): void {
    const cells = this.mathGlyphs;
    const n = cells.length;
    if (n < 2) return;
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (used.has(i) || Math.random() >= intensity) continue;
      const j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n; // j !== i
      if (used.has(j)) continue;
      swapCells(cells[i], cells[j]);
      used.add(i);
      used.add(j);
    }
  }

  private restore(): void {
    for (const word of this.textWords) restoreWord(word);
    restoreWord({ cells: this.mathGlyphs });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
