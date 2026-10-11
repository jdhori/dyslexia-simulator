// Keyboard access for the maths panels that scroll sideways.
//
// The display equation is wider than a phone, so each maths panel scrolls
// inside itself rather than pushing the page sideways (SC 1.4.10, Reflow).
// A keyboard user can only scroll an element that has focus, though (SC
// 2.1.1), and a panel of maths has nothing focusable in it. So while a panel's
// content is wider than the panel, it becomes a named region in the tab order;
// the arrow keys then scroll it. When it fits, as on a desktop, it is neither,
// so it adds no empty tab stop.

/** The parts of an element this needs; a plain object can stand in for tests. */
export interface ScrollPanel {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
}

/** Marks the attributes as ours, so only ours are ever taken away. */
const MARK = "data-scroll-region";

/**
 * Make `panel` a focusable, named region if its content overflows it, or
 * undo that if it no longer does.
 *
 * @param label what the panel holds, e.g. "Native MathML equation"
 * @returns whether the panel scrolls
 */
export function applyScrollRegion(panel: ScrollPanel, label: string): boolean {
  // A pixel of difference is sub-pixel rounding, not a scroll.
  const scrolls = panel.scrollWidth > panel.clientWidth + 1;
  if (scrolls) {
    panel.setAttribute("tabindex", "0");
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", `${label}, scrolls sideways`);
    panel.setAttribute(MARK, "");
  } else if (panel.getAttribute(MARK) !== null) {
    panel.removeAttribute("tabindex");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-label");
    panel.removeAttribute(MARK);
  }
  return scrolls;
}

/**
 * Keep `panel` in step as the window resizes and as its maths is typeset:
 * the panel's own size and its children's are watched, and the children are
 * re-watched whenever they are replaced.
 */
export function watchScrollRegion(panel: HTMLElement, label: string): void {
  let queued = false;
  const update = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyScrollRegion(panel, label);
    });
  };

  const sizes = new ResizeObserver(update);
  const watchChildren = (): void => {
    sizes.disconnect();
    sizes.observe(panel);
    for (const child of Array.from(panel.children)) sizes.observe(child);
  };
  new MutationObserver(() => {
    watchChildren();
    update();
  }).observe(panel, { childList: true });

  watchChildren();
  update();
}
