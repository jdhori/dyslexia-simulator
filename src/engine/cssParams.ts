// Shared mapping from settings values to the CSS custom properties the modes
// read. Used by both the reading simulator and the math simulator, so the curve
// stays identical for text and equations.

/** A strength fraction maps to a CSS amplitude: AMP_FLOOR + intensity * AMP_SCALE
 *  (≈0.55–2.0 across the 2%–60% sliders), so the whole slider has effect. */
const AMP_FLOOR = 0.5;
const AMP_SCALE = 2.5;
/** A mode's CSS animation period (ms) = its Speed slider value * this. */
const PERIOD_FACTOR = 4;

/** Map a 0..1 strength to a CSS amplitude multiplier. */
export function amp(intensity: number): string {
  return (AMP_FLOOR + intensity * AMP_SCALE).toFixed(3);
}

/** Map a Speed slider value (ms) to a CSS animation period. */
export function periodMs(speed: number): string {
  return `${speed * PERIOD_FACTOR}ms`;
}
