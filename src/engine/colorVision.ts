// Colour vision deficiency simulation.
//
// Applies an SVG colour-matrix filter to the image gallery so the three sample
// pictures look the way a person with each deficiency is estimated to see them.
// The matrices are the full-severity (1.0) Machado, Oliveira & Fernandes (2009)
// linear-RGB approximations, with achromatopsia as a luminance-only matrix.
//
// Accessibility: the filter is purely visual. Each image keeps its alt text,
// and the section's status line names the active simulation for everyone.

import type { ColorVision, Settings } from "../state";

const STYLE_ID = "color-vision-styles";
const FILTER_ID = "cvd-filters";

/** 3x3 RGB matrices (row-major) per deficiency. */
const MATRICES: Record<Exclude<ColorVision, "none">, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.3039,
  ],
  achromatopsia: [
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
  ],
};

const LABELS: Record<ColorVision, string> = {
  none: "typical colour vision",
  protanopia: "protanopia (red-blind)",
  deuteranopia: "deuteranopia (green-blind)",
  tritanopia: "tritanopia (blue-blind)",
  achromatopsia: "achromatopsia (total colour blindness)",
};

/** Turn a 3x3 RGB matrix into the 4x5 values feColorMatrix expects. */
function toFeMatrix(m: readonly number[]): string {
  const rows = [0, 3, 6].map((i) => `${m[i]} ${m[i + 1]} ${m[i + 2]} 0 0`);
  return [...rows, "0 0 0 1 0"].join(" ");
}

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
    if (this.status) {
      this.status.textContent =
        kind === "none"
          ? "Showing the original images."
          : `Simulating ${LABELS[kind]}.`;
    }
  }
}
