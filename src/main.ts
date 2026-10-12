import "./style.css";

import { loadSettings, SettingsStore } from "./state";
import { Simulator } from "./engine/simulator";
import { MathSimulator } from "./engine/mathSimulator";
import { LensController } from "./engine/lens";
import { ColorVisionSimulator } from "./engine/colorVision";
import { MATH_LATEX } from "./engine/mathContent";
import { buildMathComparison } from "./ui/mathComparison";
import { onMotionChange } from "./engine/motion";
import { buildControls } from "./ui/controls";
import { buildColorVisionControls } from "./ui/colorVisionControls";
import {
  buildBookmarklet,
  buildColorVisionBookmarklet,
} from "./ui/bookmarklet";
import { buildThemeToggle } from "./ui/themeToggle";
import { announce } from "./ui/announce";
import { watchScrollRegion } from "./ui/scrollRegion";

const store = new SettingsStore(loadSettings());

// Announce on/off + reveal changes for screen readers (the visible layer is
// aria-hidden, so these state changes are otherwise silent). Only these two
// fields are announced — slider drags would be far too chatty.
let previous = store.get();
store.subscribe((next) => {
  if (next.reveal !== previous.reveal) {
    announce(next.reveal ? "Showing the original text." : "Simulation running.");
  } else if (next.enabled !== previous.enabled) {
    announce(
      next.enabled ? "Simulation on." : "Simulation off, showing original text.",
    );
  }
  previous = next;
});

// --- the main reading demo ---
const demoEl = document.querySelector<HTMLElement>('[data-sim="demo"]');
if (demoEl) {
  const demo = new Simulator(demoEl, { srCopy: true });
  const lens = new LensController(demoEl);
  const applyDemo = (): void => {
    demo.apply(store.get());
    lens.apply(store.get());
  };
  store.subscribe(applyDemo);
  onMotionChange(applyDemo);
  applyDemo();
}

// --- the data-table demo: every effect runs on the table cells too ---
const tableEl = document.querySelector<HTMLElement>('[data-sim="table"]');
if (tableEl) {
  const table = new Simulator(tableEl, { srCopy: true });
  const lens = new LensController(tableEl);
  const applyTable = (): void => {
    table.apply(store.get());
    lens.apply(store.get());
  };
  store.subscribe(applyTable);
  onMotionChange(applyTable);
  applyTable();
}

// --- math content demo: its letters and digits scramble; its layout stays put ---
const mathRoot = document.getElementById("math-root");
if (mathRoot) {
  const math = new MathSimulator(mathRoot, MATH_LATEX);
  const lens = new LensController(mathRoot);
  const applyMath = (): void => {
    math.apply(store.get());
    lens.apply(store.get());
  };
  store.subscribe(applyMath);
  onMotionChange(applyMath);
  applyMath();
}

// --- colour vision demo: the sample images are filtered per deficiency ---
const cvdSection = document.querySelector<HTMLElement>(".cvd-demo");
if (cvdSection) {
  const colorVision = new ColorVisionSimulator(cvdSection);
  const applyColorVision = (): void => colorVision.apply(store.get());
  store.subscribe(applyColorVision);
  applyColorVision();
}

// --- UI panels ---
const controlsRoot = document.getElementById("controls-root");
if (controlsRoot) buildControls(controlsRoot, store);

const cvdControlsRoot = document.getElementById("cvd-controls-root");
if (cvdControlsRoot) buildColorVisionControls(cvdControlsRoot, store);

buildMathComparison(store);

// --- the maths panels scroll sideways on a phone; keep that keyboard-reachable ---
for (const [selector, label] of [
  [".math-surface__body", "MathJax 2.7.7 equation"],
  ["#mathml-equation", "Native MathML equation"],
  ["#mathjax4-equation", "MathJax 4 equation"],
] as const) {
  const panel = document.querySelector<HTMLElement>(selector);
  if (panel) watchScrollRegion(panel, label);
}

const bookmarkletRoot = document.getElementById("bookmarklet-root");
if (bookmarkletRoot) buildBookmarklet(bookmarkletRoot, store);

const cvdBookmarkletRoot = document.getElementById("bookmarklet-cvd-root");
if (cvdBookmarkletRoot) buildColorVisionBookmarklet(cvdBookmarkletRoot);

const themeRoot = document.getElementById("theme-root");
if (themeRoot) buildThemeToggle(themeRoot);

// --- Esc reveals / re-hides the original text everywhere ---
// Ignored while typing in a field so it never hijacks the expected Esc behaviour
// of the custom-text and bookmarklet textareas (keyboard-operability, SC 2.1.2).
const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || EDITABLE.has(target.tagName))) {
    return;
  }
  store.update({ reveal: !store.get().reveal });
});
