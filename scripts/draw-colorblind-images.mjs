#!/usr/bin/env node
// Draw two of the colour-vision section's three sample images, the test
// plates and the charts, as SVG, from this file alone:
//
//   node scripts/draw-colorblind-images.mjs   # writes public/colorblind/*.svg
//
// WHY: the section used to show plates and a chart figure nobody had recorded
// a source or licence for, so they could not be credited. These are drawn
// here instead, from made-up numbers and colours picked for the demo, so the
// project owns them outright and they carry the repository's own licence
// (MIT).
//
// The third image is not drawn: it is a USA TODAY Sports Images (USATSI)
// photograph of the 2015 Jets vs Bills "Color Rush" game
// (public/colorblind/football.webp), as published by CBS Sports, shown as fair
// use for education and commentary about colour-vision accessibility. The
// README's credits and the page's References name the source.
//
// The output is deterministic (a seeded random number generator, fixed
// rounding), so test/colour-vision.test.mjs can check that the committed
// files are exactly what this script draws, and that the colours do what the
// captions say under the simulator's own colour-vision matrices.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUT_DIR = path.join(ROOT, "public", "colorblind");

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Round to one decimal, without a trailing ".0". */
const n = (value) => String(Math.round(value * 10) / 10);

/** A small, seeded PRNG (mulberry32), so every run draws the same dots. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------------

/**
 * Each plate hides a number in dots of the `figure` colours among dots of the
 * `ground` colours. `hiddenFrom` names the simulations it is meant to vanish
 * under; the colours were chosen so that, under each of those, every figure
 * colour has a twin among the ground colours, and the twins come in matching
 * light and dark pairs so lightness gives nothing away either.
 */
export const PLATES = Object.freeze([
  {
    number: "16",
    // Dark dots on light ones: a difference in lightness, which every view keeps.
    hiddenFrom: [],
    figure: ["#2c3e6b", "#3f4f80"],
    ground: ["#e8c170", "#f0d69a", "#dcb35c"],
  },
  {
    number: "3",
    hiddenFrom: ["protanopia", "deuteranopia"],
    figure: ["#a86818", "#c88820", "#e8a028"],
    ground: ["#508000", "#68a000", "#88b800"],
  },
  {
    number: "42",
    hiddenFrom: ["protanopia", "deuteranopia"],
    figure: ["#a86818", "#c88820", "#e8a028"],
    ground: ["#508000", "#68a000", "#88b800"],
  },
  {
    number: "8",
    hiddenFrom: ["protanopia", "deuteranopia"],
    figure: ["#508000", "#68a000", "#88b800"],
    ground: ["#a86818", "#c88820", "#e8a028"],
  },
  {
    number: "57",
    hiddenFrom: ["protanopia", "deuteranopia"],
    figure: ["#a86818", "#c88820", "#e8a028"],
    ground: ["#508000", "#68a000", "#88b800"],
  },
  {
    number: "6",
    hiddenFrom: ["tritanopia"],
    figure: ["#d00068", "#f83068"],
    ground: ["#d04800", "#f85800"],
  },
]);

const PLATE_CELL = 260;
const PLATE_COLUMNS = 3;
const PLATE_RADIUS = 118;

/** Polyline points along an ellipse arc, angles in degrees (0 = right, clockwise on screen). */
function arc(cx, cy, rx, ry, from, to, steps = 24) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return points;
}

/**
 * The digits as strokes in a 0.6 x 1 box (y down): each is a list of
 * polylines. A dot belongs to the number when its centre is within
 * DIGIT_STROKE of a stroke.
 */
const DIGITS = {
  0: [arc(0.3, 0.5, 0.25, 0.43, 0, 360, 40)],
  1: [[[0.12, 0.2], [0.34, 0.05], [0.34, 0.95]]],
  2: [[...arc(0.3, 0.3, 0.24, 0.24, 195, 390), [0.06, 0.94], [0.57, 0.94]]],
  3: [[...arc(0.29, 0.27, 0.22, 0.22, 200, 450), ...arc(0.29, 0.72, 0.25, 0.23, 270, 520)]],
  4: [[[0.44, 0.95], [0.44, 0.05], [0.04, 0.67], [0.58, 0.67]]],
  5: [[[0.52, 0.06], [0.15, 0.06], [0.1, 0.46], ...arc(0.3, 0.66, 0.25, 0.28, 215, 510)]],
  6: [[...arc(0.38, 0.5, 0.32, 0.44, 300, 180), [0.06, 0.68]], arc(0.3, 0.68, 0.24, 0.26, 0, 360, 40)],
  7: [[[0.04, 0.06], [0.56, 0.06], [0.22, 0.95]]],
  8: [arc(0.3, 0.27, 0.2, 0.21, 0, 360, 36), arc(0.3, 0.72, 0.25, 0.23, 0, 360, 40)],
};
DIGITS[9] = DIGITS[6].map((line) => line.map(([x, y]) => [0.6 - x, 1 - y]));
const DIGIT_STROKE = 0.115;

/** Distance from point p to segment ab. */
function toSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether (x, y), relative to the plate's centre, falls on a stroke of `number`. */
function onNumber(number, x, y) {
  const height = number.length > 1 ? 1.08 * PLATE_RADIUS : 1.25 * PLATE_RADIUS;
  const width = 0.6 * height;
  const gap = 0.1 * height;
  const total = number.length * width + (number.length - 1) * gap;
  const left = -total / 2;
  const top = -height / 2;
  return [...number].some((digit, i) => {
    const u = (x - (left + i * (width + gap))) / height;
    const v = (y - top) / height;
    return DIGITS[digit].some((line) =>
      line.some((point, j) => j > 0 && toSegment([u, v], line[j - 1], point) <= DIGIT_STROKE));
  });
}

/** Pack non-overlapping dots into a disc of `radius`: big ones first, then smaller ones in the gaps. */
function packDots(rand, radius) {
  const sizes = [
    { r: 5.4, tries: 3000 },
    { r: 4.5, tries: 5000 },
    { r: 3.7, tries: 7000 },
    { r: 3, tries: 9000 },
    { r: 2.4, tries: 12000 },
    { r: 1.9, tries: 12000 },
  ];
  const dots = [];
  const gap = 1;
  for (const { r: base, tries } of sizes) {
    for (let i = 0; i < tries; i++) {
      const r = base * (0.9 + 0.2 * rand());
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * (radius - r);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      if (dots.every((d) => Math.hypot(d.x - x, d.y - y) >= d.r + r + gap)) dots.push({ x, y, r });
    }
  }
  return dots;
}

/** The plates image: six plates, three to a row. */
export function drawPlates() {
  const rows = Math.ceil(PLATES.length / PLATE_COLUMNS);
  const width = PLATE_COLUMNS * PLATE_CELL;
  const height = rows * PLATE_CELL;
  const parts = [];
  PLATES.forEach((plate, index) => {
    const rand = random(0x5eed + index * 7919);
    const cx = PLATE_CELL / 2 + (index % PLATE_COLUMNS) * PLATE_CELL;
    const cy = PLATE_CELL / 2 + Math.floor(index / PLATE_COLUMNS) * PLATE_CELL;
    const byColour = new Map();
    for (const dot of packDots(rand, PLATE_RADIUS)) {
      const palette = onNumber(plate.number, dot.x, dot.y) ? plate.figure : plate.ground;
      const colour = palette[Math.floor(rand() * palette.length)];
      if (!byColour.has(colour)) byColour.set(colour, []);
      byColour.get(colour).push(`<circle cx="${n(cx + dot.x)}" cy="${n(cy + dot.y)}" r="${n(dot.r)}"/>`);
    }
    parts.push(`<g data-plate="${index + 1}">`);
    for (const colour of [...plate.figure, ...plate.ground]) {
      const circles = byColour.get(colour);
      if (circles) parts.push(`<g fill="${colour}">${circles.join("")}</g>`);
    }
    parts.push("</g>");
  });
  return svg(width, height, "Six colour-vision test plates, each a disc of coloured dots hiding a number", parts);
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/**
 * Three series told apart by colour alone. Red and green turn alike under
 * deuteranopia (and achromatopsia), red and brown under protanopia.
 */
export const CHART_SERIES = Object.freeze([
  { name: "Class A", colour: "#c8501e", bars: [22, 28, 31, 35], line: [12, 20, 16, 25, 22, 31] },
  { name: "Class B", colour: "#5a9a1e", bars: [25, 24, 30, 33], line: [18, 14, 23, 19, 29, 26] },
  { name: "Class C", colour: "#87641e", bars: [18, 21, 26, 29], line: [8, 15, 13, 21, 25, 22] },
]);

const INK = "#333333";
const GRID = "#d9d9d9";

/** Axes, gridlines and labels for one chart; returns [markup, y-scale]. */
function chartFrame(x0, x1, y0, y1, max, title, labels) {
  const scale = (v) => y1 - ((y1 - y0) * v) / max;
  const parts = [];
  for (let v = 0; v <= max; v += 10) {
    parts.push(`<line x1="${x0}" y1="${n(scale(v))}" x2="${x1}" y2="${n(scale(v))}" stroke="${v === 0 ? INK : GRID}" stroke-width="${v === 0 ? 2 : 1}"/>`);
    parts.push(`<text x="${x0 - 8}" y="${n(scale(v) + 5)}" text-anchor="end">${v}</text>`);
  }
  const step = (x1 - x0) / labels.length;
  labels.forEach((label, i) => {
    parts.push(`<text x="${n(x0 + step * (i + 0.5))}" y="${y1 + 24}" text-anchor="middle">${label}</text>`);
  });
  parts.push(`<text x="${n((x0 + x1) / 2)}" y="${y1 + 52}" text-anchor="middle" font-weight="600">${title}</text>`);
  return [parts.join(""), scale, step];
}

/** The charts image: a grouped bar chart and a line chart, with a colour-only legend. */
export function drawCharts() {
  const width = 800;
  const height = 420;
  const parts = [`<g font-family="${FONT}" font-size="16" fill="${INK}">`];
  CHART_SERIES.forEach((series, i) => {
    const x = 210 + i * 140;
    parts.push(`<rect x="${x}" y="18" width="22" height="22" rx="3" fill="${series.colour}"/>`);
    parts.push(`<text x="${x + 30}" y="35">${series.name}</text>`);
  });
  // Bars: four terms, three classes each.
  const [barFrame, barY, barStep] = chartFrame(60, 370, 70, 330, 40, "Books read each term", ["Term 1", "Term 2", "Term 3", "Term 4"]);
  parts.push(barFrame);
  const barWidth = 18;
  CHART_SERIES.forEach((series, s) => {
    series.bars.forEach((value, t) => {
      const x = 60 + barStep * (t + 0.5) + (s - 1) * (barWidth + 3) - barWidth / 2;
      parts.push(`<rect x="${n(x)}" y="${n(barY(value))}" width="${barWidth}" height="${n(barY(0) - barY(value))}" fill="${series.colour}"/>`);
    });
  });
  // Lines: six weeks, no markers, so colour is the only cue.
  const [lineFrame, lineY, lineStep] = chartFrame(450, 770, 70, 330, 40, "Pages read each week", ["W1", "W2", "W3", "W4", "W5", "W6"]);
  parts.push(lineFrame);
  for (const series of CHART_SERIES) {
    const points = series.line.map((value, w) => `${n(450 + lineStep * (w + 0.5))},${n(lineY(value))}`).join(" ");
    parts.push(`<polyline points="${points}" fill="none" stroke="${series.colour}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  parts.push("</g>");
  return svg(width, height, "A bar chart and a line chart whose three series differ only in colour", parts);
}

// ---------------------------------------------------------------------------

/** A standalone SVG document on a white background. */
function svg(width, height, title, parts) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${title}</title>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...parts,
    `</svg>`,
    "",
  ].join("\n");
}

/** Every image this script draws, by file name. */
export const IMAGES = Object.freeze({
  "plates.svg": drawPlates,
  "charts.svg": drawCharts,
});

// Run as a script (not when a test imports it).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const [file, draw] of Object.entries(IMAGES)) {
    const markup = draw();
    writeFileSync(path.join(OUT_DIR, file), markup);
    console.log(`[colorblind] ${file} (${(markup.length / 1024).toFixed(1)} KB)`);
  }
}
