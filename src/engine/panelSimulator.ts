// Runs the simulation on the native-MathML comparison panel, so the effects can
// be compared between a vector renderer and the browser's own MathML layout.
//
// The panel has no text nodes the prose simulator could wrap. MathML keeps each
// character as the text of an <mi>, <mn>, <mo> or <mtext> element, so the
// adapter below reads and writes that text, and tags each element with
// data-char — which is all the existing per-character CSS needs.
//
// Accessibility: the visible layer is hidden from assistive technology and a
// clean, unscrambled copy is left in the accessibility tree. This matters more
// in MathML than anywhere else on the page, because the visible characters and
// the ones a screen reader announces are the same nodes — scrambling in place
// would corrupt the real equation rather than just its appearance.

import { isMotionAllowed } from "./motion";
import { amp, periodMs } from "./cssParams";
import type { Settings } from "../state";

const STATIC_PASSES = 6;

/** Elements inside the off-screen accessible copy, which must stay pristine. */
function isAccessibleCopy(el: Element): boolean {
  return el.closest(".sr-only") !== null;
}
const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

/** One rendered character, and the opaque token that produces it. */
interface Cell {
  readonly el: Element;
  readonly original: string;
}

interface Adapter {
  /** Prepare the tree and return the characters that may swap places. */
  collect: (host: Element) => Cell[];
  /** The token currently shown by this element. */
  read: (el: Element) => string;
  /** Show this token, and keep data-char in step. */
  write: (el: Element, token: string) => void;
}

export class PanelSimulator {
  private readonly host: HTMLElement;
  private readonly adapter: Adapter;
  private readonly cells: Cell[];
  private timer: number | null = null;

  constructor(host: HTMLElement, adapter: Adapter) {
    this.host = host;
    this.adapter = adapter;
    this.cells = adapter.collect(host);
    host.classList.add("sim-visual", "sim-math");
  }

  apply(settings: Settings): void {
    const motion = isMotionAllowed();
    const active = settings.enabled && !settings.reveal;

    const style = this.host.style;
    style.setProperty("--perception-amp", amp(settings.perceptionIntensity));
    style.setProperty("--wobble-amp", amp(settings.wobbleIntensity));
    style.setProperty("--wobble-period", periodMs(settings.wobbleSpeed));
    style.setProperty("--blur-amp", amp(settings.blurIntensity));
    style.setProperty("--blur-period", periodMs(settings.blurSpeed));

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
      this.timer = window.setInterval(
        () => this.mix(settings.scrambleIntensity),
        settings.scrambleSpeed,
      );
    } else {
      this.restore();
      for (let pass = 0; pass < STATIC_PASSES; pass++) this.mix(1);
    }
  }

  destroy(): void {
    this.clearTimer();
    this.restore();
  }

  private mix(intensity: number): void {
    const n = this.cells.length;
    if (n < 2) return;
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (used.has(i) || Math.random() >= intensity) continue;
      const j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n; // j !== i
      if (used.has(j)) continue;
      const a = this.cells[i].el;
      const b = this.cells[j].el;
      const tokenA = this.adapter.read(a);
      const tokenB = this.adapter.read(b);
      this.adapter.write(a, tokenB);
      this.adapter.write(b, tokenA);
      used.add(i);
      used.add(j);
    }
  }

  private restore(): void {
    for (const cell of this.cells) this.adapter.write(cell.el, cell.original);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// --- native MathML -----------------------------------------------------------

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
const TOKEN_TAGS = new Set(["mi", "mn", "mo", "mtext"]);

export const mathMLAdapter: Adapter = {
  collect(host) {
    // <mtext> holds whole phrases ("Ball of radius "), so split it into one
    // element per character. MathML allows a run of them, and keeping each
    // space as its own <mtext> preserves the word gaps.
    for (const text of Array.from(host.querySelectorAll("mtext"))) {
      if (isAccessibleCopy(text)) continue;
      const content = text.textContent ?? "";
      if ([...content].length <= 1) continue;
      const parent = text.parentNode;
      if (!parent) continue;
      for (const char of content) {
        const piece = document.createElementNS(MATHML_NS, "mtext");
        piece.textContent = char;
        parent.insertBefore(piece, text);
      }
      parent.removeChild(text);
    }

    const cells: Cell[] = [];
    for (const el of host.querySelectorAll("mi, mn, mo, mtext")) {
      if (isAccessibleCopy(el)) continue;
      const content = el.textContent ?? "";
      if ([...content].length !== 1) continue;
      if (!TOKEN_TAGS.has(el.localName)) continue;
      el.setAttribute("data-char", content.toLowerCase());
      // Only letters and digits move; operators and delimiters stay put, or
      // the equation stops looking like an equation.
      if (LETTER_OR_DIGIT.test(content)) cells.push({ el, original: content });
    }
    return cells;
  },
  read: (el) => el.textContent ?? "",
  write: (el, token) => {
    el.textContent = token;
    el.setAttribute("data-char", token.toLowerCase());
  },
};

/**
 * Hide `visible` from assistive technology and leave an unscrambled copy of it
 * in the accessibility tree.
 *
 * The clip goes on a wrapping <div>: `overflow` has no effect on a <math> box
 * any more than on a <table>, so putting .sr-only on the clone itself would let
 * it escape and widen the page.
 */
export function addAccessibleCopy(visible: Element, copy: Element): void {
  visible.setAttribute("aria-hidden", "true");
  const wrapper = document.createElement("div");
  wrapper.className = "sr-only";
  wrapper.appendChild(copy);
  visible.insertAdjacentElement("afterend", wrapper);
}
