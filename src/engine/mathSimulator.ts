// Renders a LaTeX equation with KaTeX and applies the simulation to it:
//
//  - the \text{...} words get the letter scramble (typoglycemia);
//  - ordinary math characters (letters, variables, small operators) get the
//    per-glyph visual modes — perception, wobble, blur, and b/d/p/q flips;
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
import type { Settings } from "../state";

interface Word {
  readonly start: number;
  readonly length: number;
}

interface TextSpan {
  readonly el: HTMLElement;
  readonly original: string;
  readonly words: Word[];
}

interface MathGlyph {
  readonly el: HTMLElement;
  readonly original: string;
}

const STATIC_PASSES = 6;
const WORD_RE = /\p{L}{4,}/gu;

// "Visual" math structures — division (fractions), sums and other large
// operators, square roots, and stretchy delimiters. Their glyphs never move.
const STRUCTURAL_SELECTOR = ".mop, .op-symbol, .sqrt, .mfrac, .delimsizing";

export class MathSimulator {
  private readonly host: HTMLElement; // KaTeX's visual (.katex-html) layer
  private readonly textSpans: TextSpan[] = [];
  private readonly mathGlyphs: MathGlyph[] = []; // single-letter vars + digits
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
    this.collectText();
  }

  apply(settings: Settings): void {
    this.settings = settings;
    const motion = isMotionAllowed();
    const active = settings.enabled && !settings.reveal;

    // Each visual mode reads its own strength/tempo (math has no crowding,
    // fragment or line-jump, so those vars are not set here).
    const style = this.host.style;
    style.setProperty("--perception-amp", amp(settings.perceptionIntensity));
    style.setProperty("--wobble-amp", amp(settings.wobbleIntensity));
    style.setProperty("--wobble-period", periodMs(settings.wobbleSpeed));
    style.setProperty("--blur-amp", amp(settings.blurIntensity));
    style.setProperty("--blur-period", periodMs(settings.blurSpeed));

    // Perception / flip / blur / wobble apply to math — but never crowding or
    // line-jumping.
    const v = this.host;
    v.classList.toggle("m-flip", active && settings.flip);
    v.classList.toggle("m-perception", active && settings.perception);
    v.classList.toggle("m-blur", active && settings.blur);
    v.classList.toggle("m-wobble", active && settings.wobble && motion);

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
  // to them — skipping \text (the scramble handles that) and structural pieces.
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

  private collectText(): void {
    const spans = this.host.querySelectorAll<HTMLElement>(".text");
    for (const el of spans) {
      if (el.parentElement?.closest(".text")) continue;
      const original = el.textContent ?? "";
      const words = extractWords(original);
      if (words.length > 0) {
        this.textSpans.push({ el, original, words });
      }
    }
  }

  private tick(): void {
    const s = this.settings;
    if (!s) return;
    for (const span of this.textSpans) {
      const chars = (span.el.textContent ?? span.original).split("");
      for (const word of span.words) {
        if (Math.random() < s.scrambleIntensity) {
          swapInner(chars, word, s.scrambleEnds);
        }
      }
      span.el.textContent = chars.join("");
    }
    this.mixMath(s.scrambleIntensity);
  }

  private staticScramble(): void {
    const includeEnds = this.settings?.scrambleEnds ?? false;
    for (let pass = 0; pass < STATIC_PASSES; pass++) {
      for (const span of this.textSpans) {
        const chars = (span.el.textContent ?? span.original).split("");
        for (const word of span.words) swapInner(chars, word, includeEnds);
        span.el.textContent = chars.join("");
      }
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
      swapGlyphChars(cells[i].el, cells[j].el);
      used.add(i);
      used.add(j);
    }
  }

  private restore(): void {
    for (const span of this.textSpans) span.el.textContent = span.original;
    for (const glyph of this.mathGlyphs) {
      glyph.el.textContent = glyph.original;
      glyph.el.dataset.char = glyph.original.toLowerCase();
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function extractWords(value: string): Word[] {
  const words: Word[] = [];
  WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(value)) !== null) {
    words.push({ start: match.index, length: match[0].length });
  }
  return words;
}

// Scramble within one word. Classic typoglycemia keeps first and last fixed;
// includeEnds opens the whole word to a full anagram.
function swapInner(chars: string[], word: Word, includeEnds: boolean): void {
  const lo = includeEnds ? word.start : word.start + 1;
  const hi = includeEnds ? word.start + word.length - 1 : word.start + word.length - 2;
  if (hi - lo < 1) return;
  const a = randInt(lo, hi);
  let b = randInt(lo, hi);
  if (a === b) b = a === hi ? lo : a + 1;
  const tmp = chars[a];
  chars[a] = chars[b];
  chars[b] = tmp;
}

// Swap the displayed character (and its data-char) between two glyph spans.
function swapGlyphChars(a: HTMLElement, b: HTMLElement): void {
  const ca = a.textContent ?? "";
  const cb = b.textContent ?? "";
  a.textContent = cb;
  b.textContent = ca;
  a.dataset.char = cb.trim().toLowerCase();
  b.dataset.char = ca.trim().toLowerCase();
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
