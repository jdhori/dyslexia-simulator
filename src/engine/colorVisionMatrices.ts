// The colour vision deficiency matrices, shared by the on-page simulation and
// the bookmarklet so the two can never drift apart.
//
// These are the full-severity (1.0) Machado, Oliveira & Fernandes (2009)
// linear-RGB approximations, with achromatopsia as a luminance-only matrix.

export type ColorVisionKind =
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

/** 3x3 RGB matrices, row-major. */
export const MATRICES: Record<ColorVisionKind, readonly number[]> = {
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

export const KINDS = Object.keys(MATRICES) as ColorVisionKind[];

/** Plain-language names, used in status lines and the bookmarklet's toast. */
export const KIND_LABELS: Record<ColorVisionKind, string> = {
  protanopia: "protanopia (red-blind)",
  deuteranopia: "deuteranopia (green-blind)",
  tritanopia: "tritanopia (blue-blind)",
  achromatopsia: "achromatopsia (total colour blindness)",
};

/** Turn a 3x3 RGB matrix into the 4x5 values feColorMatrix expects. */
export function toFeMatrix(m: readonly number[]): string {
  const rows = [0, 3, 6].map((i) => `${m[i]} ${m[i + 1]} ${m[i + 2]} 0 0`);
  return [...rows, "0 0 0 1 0"].join(" ");
}
