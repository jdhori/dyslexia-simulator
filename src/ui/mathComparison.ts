// The renderer comparison beneath the math demo.
//
// The same equation appears three times on the page: MathJax 2.7.7 SVG in the
// demo above, then native MathML and MathJax 4 here.
//
// The MathML panel is simulated, so the effects can be compared between a
// vector renderer and the browser's own MathML layout. The MathJax 4 panel is
// deliberately left clean: its characters carry explicit widths, so swapping
// one for another leaves ragged gaps rather than a convincing scramble. It
// stays as a straight reference rendering.
//
// Both MathJax versions really do run in this one document; see the note in
// engine/mathjaxLoader.ts for how they share the global.

import { MATH_LATEX } from "../engine/mathContent";
import { typeset4, withMathJax4 } from "../engine/mathjaxLoader";
import {
  PanelSimulator,
  addAccessibleCopy,
  mathMLAdapter,
} from "../engine/panelSimulator";
import { onMotionChange } from "../engine/motion";
import type { SettingsStore } from "../state";

/** A pristine clone of the page's MathML, taken before anything is scrambled.
 *  Both panels draw their accessible copy from it. */
let pristineMathML: Element | null = null;

export function buildMathComparison(store: SettingsStore): void {
  setUpMathML(store);
  setUpMathJax4();
}

/** Put an unscrambled MathML copy of the equation in the accessibility tree. */
function appendAccessibleCopy(host: HTMLElement): void {
  if (!pristineMathML) return;
  const wrapper = document.createElement("div");
  wrapper.className = "sr-only";
  wrapper.appendChild(pristineMathML.cloneNode(true));
  host.appendChild(wrapper);
}

// Panel 2: the static MathML already in the page. Nothing needs loading, but
// it does need an accessible copy taken *before* anything is scrambled — in
// MathML the characters on screen and the ones a screen reader announces are
// the same nodes.
function setUpMathML(store: SettingsStore): void {
  const host = document.getElementById("mathml-equation");
  const math = host?.querySelector("math");
  if (!host || !math) return;

  pristineMathML = math.cloneNode(true) as Element;
  addAccessibleCopy(math, pristineMathML.cloneNode(true) as Element);
  attach(new PanelSimulator(host, mathMLAdapter), store);
}

// Panel 3: MathJax 4, fetched when the section nears the viewport. Shown as
// a clean reference rendering, with no simulation applied.
function setUpMathJax4(): void {
  const host = document.getElementById("mathjax4-equation");
  const status = document.getElementById("mathjax4-status");
  if (!host) return;

  whenNearViewport(host, () => {
    void (async () => {
      setStatus(status, "Loading MathJax…");
      try {
        await withMathJax4(async (mj) => {
          host.textContent = `\\[${MATH_LATEX}\\]`;
          await typeset4(mj, host);
        });
        // Not simulated — but it still needs an accessible copy. MathJax 4
        // marks its own rendering aria-hidden and, without the a11y component
        // we cannot load here, leaves nothing in its place, so without this
        // the panel is invisible to a screen reader.
        appendAccessibleCopy(host);
        setStatus(
          status,
          "Typeset by MathJax 4, CommonHTML output. Not simulated.",
        );
      } catch {
        setStatus(
          status,
          "MathJax could not be loaded, so this panel still shows its LaTeX source. The MathML panel above needs no script and is unaffected.",
        );
      }
    })();
  });
}

function attach(sim: PanelSimulator, store: SettingsStore): void {
  const apply = (): void => sim.apply(store.get());
  store.subscribe(apply);
  onMotionChange(apply);
  apply();
}

// Each MathJax build is around a megabyte, so wait until the section is near
// the viewport before the browser pays for it.
function whenNearViewport(el: HTMLElement, start: () => void): void {
  if (!("IntersectionObserver" in window)) {
    start();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    },
    { rootMargin: "400px" },
  );
  observer.observe(el);
}

// The status line is a polite live region in the markup, so the outcome is
// announced without the reader having to go looking for it.
function setStatus(el: HTMLElement | null, message: string): void {
  if (el) el.textContent = message;
}
