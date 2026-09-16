// Renders the demo equation with MathJax 2.7.7 (SVG output) and applies the
// simulation to it.
//
// MathJax SVG draws each character as a <use> element pointing at a glyph path
// in a shared <defs>, so there are no text nodes to rewrap. The simulation
// therefore works on the <use> elements directly:
//
//  - the glyph a <use> shows is decoded from its href (MathJax names glyphs
//    after their code point), and written to data-char so the existing
//    per-character CSS — the perception alphabet, the b/d/p/q flips — matches
//    it exactly as it matches an HTML glyph span;
//  - the letter scramble swaps the href between two <use> elements, which
//    swaps the characters on screen while every position stays put;
//  - wobble and blur are CSS and apply unchanged.
//
// Crowding, line-jumping and the letter-fragment masks are not applied to
// maths: the first two would wreck an equation's layout, and the fragment
// masks need a text glyph box that an SVG <use> does not have.
//
// Accessibility: MathJax's AssistiveMML extension leaves a real MathML copy of
// the equation in the accessibility tree and hides the SVG from assistive
// technology, so screen readers always get the correct, unscrambled maths.
// Nothing here touches that copy.

import { isMotionAllowed } from "./motion";
import { amp, periodMs } from "./cssParams";
import { loadMathJax2, typeset2 } from "./mathjaxLoader";
import type { Settings } from "../state";

const STATIC_PASSES = 6;

/** A rendered glyph: one <use> element and the character it started as. */
interface SvgGlyph {
  readonly el: SVGUseElement;
  readonly original: string;
}

const HREF = "http://www.w3.org/1999/xlink";
const LETTER_RE = /\p{L}/u;

export class MathSimulator {
  private readonly container: HTMLElement;
  private readonly latex: string;
  private host: HTMLElement | null = null;
  /** Letters and digits, which swap characters with each other. */
  private glyphs: SvgGlyph[] = [];
  private timer: number | null = null;
  private settings: Settings | null = null;
  private ready = false;

  constructor(container: HTMLElement, latex: string) {
    this.container = container;
    this.latex = latex;
    void this.render();
  }

  private async render(): Promise<void> {
    try {
      const mj = await loadMathJax2();
      // MathJax 2 typesets the TeX it finds in the element's text.
      this.container.textContent = `\\[${this.latex}\\]`;
      await typeset2(mj, this.container);
      this.host = this.container.querySelector<HTMLElement>(".MathJax_SVG");
      if (!this.host) return;
      this.host.classList.add("sim-visual", "sim-math");
      this.collectGlyphs();
      this.ready = true;
      this.container.dataset.mathState = "ready";
      if (this.settings) this.apply(this.settings);
    } catch {
      // Leave the TeX visible as plain text rather than an empty panel.
      this.container.dataset.mathState = "failed";
    }
  }

  apply(settings: Settings): void {
    this.settings = settings;
    if (!this.ready || !this.host) return;

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
      this.timer = window.setInterval(() => this.tick(), settings.scrambleSpeed);
    } else {
      this.restore();
      for (let pass = 0; pass < STATIC_PASSES; pass++) this.mix(1);
    }
  }

  destroy(): void {
    this.clearTimer();
    this.restore();
  }

  // MathJax names each glyph after its font and code point, e.g. MJMATHI-78 is
  // "x". Decode that so per-character CSS can match, and keep the letters and
  // digits as the pool the scramble draws from.
  private collectGlyphs(): void {
    if (!this.host) return;
    for (const use of this.host.querySelectorAll("use")) {
      const href =
        use.getAttributeNS(HREF, "href") ?? use.getAttribute("href") ?? "";
      const tail = href.split("-").pop() ?? "";
      if (!/^[0-9A-Fa-f]{2,6}$/.test(tail)) continue;
      const code = Number.parseInt(tail, 16);
      if (!Number.isFinite(code) || code <= 0) continue;
      const char = String.fromCodePoint(code);
      use.dataset.char = char.toLowerCase();
      if (LETTER_RE.test(char) || /[0-9]/.test(char)) {
        this.glyphs.push({ el: use, original: href });
      }
    }
  }

  private tick(): void {
    const s = this.settings;
    if (!s) return;
    this.mix(s.scrambleIntensity);
  }

  /** Swap the glyph shown by pairs of <use> elements. */
  private mix(intensity: number): void {
    const cells = this.glyphs;
    const n = cells.length;
    if (n < 2) return;
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (used.has(i) || Math.random() >= intensity) continue;
      const j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n; // j !== i
      if (used.has(j)) continue;
      swapGlyphs(cells[i].el, cells[j].el);
      used.add(i);
      used.add(j);
    }
  }

  private restore(): void {
    for (const cell of this.glyphs) setHref(cell.el, cell.original);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function setHref(el: SVGUseElement, href: string): void {
  el.setAttributeNS(HREF, "xlink:href", href);
  el.setAttribute("href", href);
  const tail = href.split("-").pop() ?? "";
  const code = Number.parseInt(tail, 16);
  if (Number.isFinite(code) && code > 0) {
    el.dataset.char = String.fromCodePoint(code).toLowerCase();
  }
}

function swapGlyphs(a: SVGUseElement, b: SVGUseElement): void {
  const aHref = a.getAttributeNS(HREF, "href") ?? a.getAttribute("href") ?? "";
  const bHref = b.getAttributeNS(HREF, "href") ?? b.getAttribute("href") ?? "";
  setHref(a, bHref);
  setHref(b, aHref);
}
