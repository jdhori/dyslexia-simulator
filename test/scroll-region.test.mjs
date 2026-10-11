// A maths panel that scrolls sideways must be reachable by keyboard (WCAG 2.1
// SC 2.1.1): only a focused element scrolls with the arrow keys. A panel that
// fits needs no tab stop, so src/ui/scrollRegion.ts makes each panel a named,
// focusable region only while its content is wider than it is.
//
// Run with `npm test` (Node 22.18 or later runs the TypeScript directly).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyScrollRegion } from "../src/ui/scrollRegion.ts";

/** Just enough of an element: sizes and attributes. */
function fakePanel(scrollWidth, clientWidth) {
  const attributes = new Map();
  return {
    scrollWidth,
    clientWidth,
    attributes,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
  };
}

describe("applyScrollRegion", () => {
  test("a panel wider inside than out becomes a named region in the tab order", () => {
    const panel = fakePanel(620, 300);
    assert.equal(applyScrollRegion(panel, "Native MathML equation"), true);
    assert.equal(panel.getAttribute("tabindex"), "0");
    assert.equal(panel.getAttribute("role"), "region");
    assert.equal(panel.getAttribute("aria-label"), "Native MathML equation, scrolls sideways");
  });

  test("a panel that fits has no tab stop and no region", () => {
    const panel = fakePanel(300, 300);
    assert.equal(applyScrollRegion(panel, "Native MathML equation"), false);
    assert.equal(panel.attributes.size, 0);
  });

  test("going back to fitting takes the tab stop away again", () => {
    const panel = fakePanel(620, 300);
    applyScrollRegion(panel, "MathJax 4 equation");
    panel.clientWidth = 700;
    assert.equal(applyScrollRegion(panel, "MathJax 4 equation"), false);
    for (const name of ["tabindex", "role", "aria-label"]) assert.equal(panel.getAttribute(name), null, name);
  });

  test("a pixel of rounding is not a scroll", () => {
    const panel = fakePanel(301, 300);
    assert.equal(applyScrollRegion(panel, "x"), false);
  });

  test("leaves a role or label the markup gave the panel alone when it fits", () => {
    const panel = fakePanel(300, 300);
    panel.setAttribute("role", "group");
    applyScrollRegion(panel, "x");
    assert.equal(panel.getAttribute("role"), "group");
  });
});
