// Colour vision deficiency simulation.
//
// Applies an SVG colour-matrix filter to the image gallery so the three sample
// pictures look the way a person with each deficiency is estimated to see them.
// The matrices live in colorVisionMatrices.ts, shared with the bookmarklet.
//
// Accessibility: the filter is purely visual. Each image keeps its alt text,
// and the section's status line names the active simulation for everyone.

import type { ColorVision, Settings } from "../state";
import { KIND_LABELS, MATRICES, toFeMatrix } from "./colorVisionMatrices";

const STYLE_ID = "color-vision-styles";
const FILTER_ID = "cvd-filters";

const LABELS: Record<ColorVision, string> = {
  none: "typical colour vision",
  ...KIND_LABELS,
};

/** Inject the SVG filter definitions and the CSS that applies them, once. */
function ensureFilters(): void {
  if (document.getElementById(FILTER_ID)) return;

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.id = FILTER_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  const defs = document.createElementNS(svgNs, "defs");
  const cssRules: string[] = [];

  for (const [kind, matrix] of Object.entries(MATRICES)) {
    const filter = document.createElementNS(svgNs, "filter");
    filter.id = `cvd-${kind}`;
    // Simulate in linear light, which is what the matrices were fitted in.
    filter.setAttribute("color-interpolation-filters", "linearRGB");
    const fe = document.createElementNS(svgNs, "feColorMatrix");
    fe.setAttribute("type", "matrix");
    fe.setAttribute("values", toFeMatrix(matrix));
    filter.appendChild(fe);
    defs.appendChild(filter);
    cssRules.push(
      `.cvd-gallery[data-cvd="${kind}"] .cvd-figure img { filter: url("#cvd-${kind}"); }`,
    );
  }

  svg.appendChild(defs);
  document.body.prepend(svg);

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = cssRules.join("\n");
  document.head.appendChild(style);
}

// The status line says what is on screen and, when nothing is being filtered,
// why — the master switch and the reveal control both suspend this section, and
// the controls that do so sit far away from the images they affect.
function statusFor(
  settings: Settings,
  active: boolean,
  kind: ColorVision,
): string {
  if (!settings.enabled) {
    return "Showing the original images. The simulation is switched off — tick “Simulation on” in the controls to apply a colour vision filter.";
  }
  if (settings.reveal) {
    return "Showing the original images, because the original text is revealed. Press Escape, or use the reveal control, to return to the simulation.";
  }
  if (!active || kind === "none") {
    return "Showing the original images. Choose a colour vision deficiency above to filter them.";
  }
  return `Simulating ${LABELS[kind]}.`;
}

export class ColorVisionSimulator {
  private readonly gallery: HTMLElement;
  private readonly status: HTMLElement | null;

  /** `section` holds both the `.cvd-gallery` and its status line. */
  constructor(section: HTMLElement) {
    ensureFilters();
    this.gallery =
      section.querySelector<HTMLElement>(".cvd-gallery") ?? section;
    this.status = section.querySelector<HTMLElement>("[data-cvd-status]");
  }

  apply(settings: Settings): void {
    const active = settings.enabled && !settings.reveal;
    const kind: ColorVision = active ? settings.colorVision : "none";
    this.gallery.dataset.cvd = kind;
    if (this.status) this.status.textContent = statusFor(settings, active, kind);
  }
}
