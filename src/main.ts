import "./style.css";

import { loadSettings, SettingsStore } from "./state";
import { Simulator } from "./engine/simulator";
import { MathSimulator } from "./engine/mathSimulator";
import { onMotionChange } from "./engine/motion";
import { buildControls } from "./ui/controls";
import { buildBookmarklet } from "./ui/bookmarklet";
import { buildThemeToggle } from "./ui/themeToggle";
import { announce } from "./ui/announce";

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
  const applyDemo = (): void => demo.apply(store.get());
  store.subscribe(applyDemo);
  onMotionChange(applyDemo);
  applyDemo();
}

// --- math content demo: words scramble, the equation itself stays intact ---
// `aligned` with a leading `&` on each row left-aligns the lines (so the two
// text lines sit flush-left rather than centered); the widest line still fills
// the block, which displayMode centers on the page.
const MATH_LATEX = String.raw`\begin{aligned}
& \text{Ball of radius } r>0 \text{ centered at } \vec{x} \in \mathbb{R}^n \\
& \text{notation \& def.}\quad B_r(\vec{x})=\left\{\vec{y} \in \mathbb{R}^n \mid |\vec{y}-\vec{x}|<r\right\} \\
& (X, d)\quad \left\{\begin{array}{l}
\text{set } X,\ \text{distance } d: X \times X \to \mathbb{R}_{\geq 0}=\{s \in \mathbb{R} \mid s \geq 0\} \\
\forall\, x, y \in X: \ d(x, y)=d(y, x) \\
d(x, y)=0 \iff x=y \\
B_r(x)=\{y \in X \mid d(y, x)<r\} \\
\forall\, x, y, z: \ d(x, y)+d(y, z) \geq d(x, z)
\end{array}\right.
\end{aligned}`;

const mathRoot = document.getElementById("math-root");
if (mathRoot) {
  const math = new MathSimulator(mathRoot, MATH_LATEX);
  const applyMath = (): void => math.apply(store.get());
  store.subscribe(applyMath);
  onMotionChange(applyMath);
  applyMath();
}

// --- UI panels ---
const controlsRoot = document.getElementById("controls-root");
if (controlsRoot) buildControls(controlsRoot, store);

const bookmarkletRoot = document.getElementById("bookmarklet-root");
if (bookmarkletRoot) buildBookmarklet(bookmarkletRoot, store);

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
