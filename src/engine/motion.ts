// Central reduced-motion gate.
//
// The simulation is, by nature, motion. We must respect
// `prefers-reduced-motion` by default, but also let a user explicitly opt back
// in (they came here precisely to experience the effect). `.motion-ok` on the
// root element is the single CSS hook that every animation keys off of.

const query = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduce = query.matches;
let override = false;
const listeners = new Set<() => void>();

function notify(): void {
  document.documentElement.classList.toggle("motion-ok", isMotionAllowed());
  for (const listener of listeners) listener();
}

export function isMotionAllowed(): boolean {
  return !reduce || override;
}

export function prefersReducedMotion(): boolean {
  return reduce;
}

export function setMotionOverride(value: boolean): void {
  override = value;
  notify();
}

export function onMotionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

query.addEventListener("change", (event) => {
  reduce = event.matches;
  notify();
});

// Reflect the initial state on the root element immediately.
document.documentElement.classList.toggle("motion-ok", isMotionAllowed());
