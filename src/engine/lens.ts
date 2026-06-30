// The "black-hole lens": a movable field of vision loss laid over one reading
// region. It simulates two conditions with one mechanism:
//
//   • tunnel  — a clear centre with darkness closing in from the edges. This is
//               the Retinitis pigmentosa experience: peripheral vision is lost
//               first and the visual field constricts to a narrow window.
//   • scotoma — a dark, refracting hole sitting over the point of gaze, hiding
//               whatever you try to look at (closer to macular degeneration).
//
// Two layers do the work, kept independent so neither fights the other:
//
//   1. Refraction. An SVG `feDisplacementMap` filter bends the text in a ring at
//      the field boundary — the "lensing". The displacement map is built by
//      flooding the whole filter region with neutral grey (zero displacement),
//      then compositing a *small* ring bulge on top. Because the neutral flood
//      covers everything the lens isn't, there is never a map "edge" to reveal —
//      regardless of region size or where the lens sits. The bulge is a square
//      just big enough for the ring, generated once on a canvas (cached, rebuilt
//      only when the radius changes) and re-centred on the gaze point each frame
//      via two `feImage` x/y writes — no per-frame canvas work, no `toDataURL`
//      in the hot path. A negative displacement scale flips the outward
//      "magnify" into an inward black-hole "pull".
//
//   2. Darkness. A separate `pointer-events: none` overlay holds a movable
//      radial gradient; the polarity flips its colour stops, and an optional
//      "black hole" rendering swaps in an event horizon + accretion ring.
//
// Accessibility: the wrapper, overlay, and filter defs are all decorative and
// `aria-hidden`; the off-screen screen-reader copy the Simulator leaves beside
// the region is never wrapped, so the real text stays in the accessibility tree.
// Autonomous drift is gated on `prefers-reduced-motion`; the pointer-follow and
// the X/Y sliders remain available so a keyboard or reduced-motion user can
// still place and experience the field loss.

import { isMotionAllowed } from "./motion";
import type { Settings } from "../state";

/** feDisplacementMap `scale` at full refraction. The actual pixel shift peaks at
 *  ~half this, so 320 lets the text stretch dramatically (~160px) at 100%. */
const MAX_SCALE = 320;
/** The displacement bulge is a small square sized to contain the ring (a few
 *  field radii); it floats over a full-region neutral flood, so it need not
 *  cover the region and the canvas stays small regardless of region size. */
const CANVAS_SCALE = 4.6;
/** Hard ceiling on the bulge canvas; beyond this the ring is gently tapered to
 *  zero at the edge (no seam, only a slightly tighter ring at extreme sizes). */
const MAX_CANVAS = 2048;
/** How far the autonomous drift wanders from centre, as a fraction of the box. */
const DRIFT_X = 0.32;
const DRIFT_Y = 0.26;
/** Drift frequencies (rad/ms) and a phase offset so X and Y never lock in sync. */
const DRIFT_FREQ_X = 0.0004;
const DRIFT_FREQ_Y = 0.0005;
const DRIFT_PHASE_Y = 1;
/** Width of the Gaussian displacement ring, relative to the field radius. */
const RING_SIGMA_RATIO = 0.42;
/** Per-frame easing toward the target position (1 = instant). */
const EASE = 0.18;
/** Within this many px of target we stop the idle loop to spare the CPU. */
const SETTLE_PX = 0.4;

// Displacement maps are pure functions of (width, height, radius) and identical
// across regions of the same size, so cache the encoded data URIs module-wide.
// This dedupes the three regions' builds, makes dragging "Field size" back and
// forth free after the first pass, and means re-enabling the lens never repays
// the cost. Bounded so a long drag session can't grow it without limit.
const MAP_CACHE = new Map<string, string>();
const MAP_CACHE_LIMIT = 64;

let defsSvg: SVGSVGElement | null = null;
let nextId = 0;

// One shared, off-screen <svg> holds every lens filter definition, mirroring the
// ensure*Styles pattern used by the perception and fragment modes.
function ensureDefsSvg(): SVGSVGElement {
  if (defsSvg) return defsSvg;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  document.body.appendChild(svg);
  defsSvg = svg;
  return svg;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export class LensController {
  private readonly region: HTMLElement;
  private readonly host: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly filter: SVGFilterElement;
  private readonly feImage: SVGFEImageElement;
  private readonly feDisplace: SVGFEDisplacementMapElement;
  private readonly filterId: string;

  private settings: Settings | null = null;
  private readonly resizeObserver: ResizeObserver;

  // Live geometry of the region's content box.
  private boxW = 0;
  private boxH = 0;
  // The bulge canvas is regenerated only when this key (radius) changes; `side`
  // is its current pixel size, used to centre the feImage on the gaze point.
  private mapKey = "";
  private side = 0;

  // Position state, in region-box pixels.
  private targetX = 0;
  private targetY = 0;
  private curX = 0;
  private curY = 0;
  private pointerInside = false;
  private rafId: number | null = null;
  private active = false;

  constructor(region: HTMLElement) {
    this.region = region;
    this.filterId = `lens-${nextId++}`;

    // Wrap the region (but not its screen-reader sibling) in a positioned host.
    const host = document.createElement("div");
    host.className = "lens-host";
    region.parentNode?.insertBefore(host, region);
    host.appendChild(region);
    this.host = host;

    const veil = document.createElement("div");
    veil.className = "lens-veil";
    veil.setAttribute("aria-hidden", "true");
    host.appendChild(veil);
    this.veil = veil;

    // Build the filter chain: a full-region neutral-grey flood (zero
    // displacement) with the small bulge composited on top, then displacement.
    // Flooding the whole region means there is never a map "edge" to reveal — the
    // grey extends everywhere the lens isn't, so only the ring bends the text.
    const svg = ensureDefsSvg();
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", this.filterId);
    // A generous filter region so the flood covers the whole element box.
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const feFlood = document.createElementNS(SVG_NS, "feFlood");
    // 0.502 (128/255) is feDisplacementMap's neutral midpoint — no shift.
    feFlood.setAttribute("flood-color", "rgb(128,128,128)");
    feFlood.setAttribute("result", "neutral");

    const feImage = document.createElementNS(SVG_NS, "feImage");
    feImage.setAttribute("result", "bulge");
    feImage.setAttribute("preserveAspectRatio", "none");

    const feComposite = document.createElementNS(SVG_NS, "feComposite");
    feComposite.setAttribute("in", "bulge");
    feComposite.setAttribute("in2", "neutral");
    feComposite.setAttribute("operator", "over");
    feComposite.setAttribute("result", "map");

    const feDisplace = document.createElementNS(SVG_NS, "feDisplacementMap");
    feDisplace.setAttribute("in", "SourceGraphic");
    feDisplace.setAttribute("in2", "map");
    feDisplace.setAttribute("xChannelSelector", "R");
    feDisplace.setAttribute("yChannelSelector", "G");
    feDisplace.setAttribute("scale", "0");

    filter.append(feFlood, feImage, feComposite, feDisplace);
    svg.appendChild(filter);

    this.filter = filter;
    this.feImage = feImage as SVGFEImageElement;
    this.feDisplace = feDisplace as SVGFEDisplacementMapElement;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.tick = this.tick.bind(this);

    // apply() always re-measures on its on-path, so the callback need not.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.settings) this.apply(this.settings);
    });
    this.resizeObserver.observe(region);
    this.measure();
  }

  apply(settings: Settings): void {
    this.settings = settings;
    const on = settings.enabled && !settings.reveal && settings.lens;
    const wasActive = this.active;
    this.active = on;

    this.host.classList.toggle("lens-on", on);
    if (!on) {
      this.stop();
      this.region.style.filter = "";
      return;
    }

    this.measure();
    this.ensureMap(settings);
    this.applyVeilMode(settings);
    // The map encodes outward radial vectors, so a positive scale magnifies the
    // field (content bends away from the centre); negating it pinches the text
    // inward — the true black-hole "pull". No map rebuild needed.
    const magnitude = Math.round(settings.lensRefraction * MAX_SCALE);
    this.feDisplace.setAttribute(
      "scale",
      String(settings.lensPull ? -magnitude : magnitude),
    );
    this.region.style.filter = `url(#${this.filterId})`;

    this.resolveTarget(performance.now());
    const willLoop = this.needsLoop(settings);
    // Place directly when first enabling, or whenever no loop will move the lens
    // (static X/Y mode — so dragging the position sliders still works). While a
    // follow/drift loop is already running, leave the live position alone so an
    // unrelated change (e.g. dragging Refraction) doesn't teleport it to centre;
    // the loop keeps easing toward its target.
    if (!wasActive || !willLoop) {
      this.curX = this.targetX;
      this.curY = this.targetY;
      this.place(this.curX, this.curY);
    }
    this.syncListeners(settings);

    if (willLoop) this.start();
    else this.stop();
  }

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.host.removeEventListener("pointermove", this.onPointerMove);
    this.host.removeEventListener("pointerleave", this.onPointerLeave);
    this.region.style.filter = "";
    this.filter.remove();
    // Unwrap: return the region to where the host sits, then drop host + veil.
    this.host.parentNode?.insertBefore(this.region, this.host);
    this.host.remove();
  }

  // --- geometry ---

  private measure(): void {
    const rect = this.region.getBoundingClientRect();
    this.boxW = Math.max(1, rect.width);
    this.boxH = Math.max(1, rect.height);
  }

  // Build (or rebuild) the small bulge image — a square just big enough to hold
  // the ring, tapered to neutral at its edge so it blends seamlessly into the
  // flood. The feImage is displayed at the ring's true size (`displaySide`); its
  // pixel resolution is capped (`pixelSide`), and the ring within the canvas is
  // scaled to match, so a very large field stays refracting (just at lower map
  // resolution — which is fine, displacement is smooth) rather than silently
  // vanishing. Region-size-independent and cached; only reruns when radius
  // changes. `place()` then centres it on the gaze point each frame.
  private ensureMap(s: Settings): void {
    const radius = Math.max(8, s.lensRadius * Math.min(this.boxW, this.boxH));
    const displaySide = Math.max(64, Math.round(radius * CANVAS_SCALE));
    const pixelSide = Math.min(MAX_CANVAS, displaySide);
    // Scale the ring into the (possibly downscaled) canvas so it always fits.
    const canvasRadius = radius * (pixelSide / displaySide);
    this.side = displaySide;
    this.feImage.setAttribute("width", String(displaySide));
    this.feImage.setAttribute("height", String(displaySide));

    const key = `${pixelSide}r${canvasRadius.toFixed(1)}`;
    if (key === this.mapKey) return;

    const dataUri = mapFromCache(pixelSide, canvasRadius, key);
    // A failed canvas context yields an empty URI; leave mapKey unset so the
    // build is retried next time rather than silently sticking with no map.
    if (!dataUri) return;
    this.mapKey = key;
    this.feImage.setAttribute("href", dataUri);
    // Older engines still read the namespaced attribute.
    this.feImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", dataUri);
  }

  // The veil rendering is pure CSS keyed off these data attributes: the polarity
  // chooses the tunnel/scotoma gradient, and the black-hole flag (when set)
  // overrides both with an event horizon + accretion ring.
  private applyVeilMode(s: Settings): void {
    this.host.dataset.polarity = s.lensPolarity;
    this.host.dataset.blackhole = String(s.lensBlackHole);
  }

  // --- movement ---

  private needsLoop(s: Settings): boolean {
    return (s.lensFollow && this.pointerInside) || (s.lensDrift && isMotionAllowed());
  }

  private syncListeners(s: Settings): void {
    if (s.lensFollow) {
      this.host.addEventListener("pointermove", this.onPointerMove);
      this.host.addEventListener("pointerleave", this.onPointerLeave);
    } else {
      this.host.removeEventListener("pointermove", this.onPointerMove);
      this.host.removeEventListener("pointerleave", this.onPointerLeave);
      this.pointerInside = false;
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const rect = this.region.getBoundingClientRect();
    this.pointerInside = true;
    this.targetX = event.clientX - rect.left;
    this.targetY = event.clientY - rect.top;
    this.start();
  }

  private onPointerLeave(): void {
    this.pointerInside = false;
    // Hand control back to drift or the resting position.
    if (this.settings && this.needsLoop(this.settings)) this.start();
    else if (this.settings) {
      this.resolveTarget(performance.now());
      this.start();
    }
  }

  // Choose where the lens wants to be this frame: pointer wins, then drift, then
  // the resting X/Y position.
  private resolveTarget(now: number): void {
    const s = this.settings;
    if (!s) return;
    if (s.lensFollow && this.pointerInside) return; // target already set
    if (s.lensDrift && isMotionAllowed()) {
      this.targetX = this.boxW * (0.5 + DRIFT_X * Math.sin(now * DRIFT_FREQ_X));
      this.targetY =
        this.boxH *
        (0.5 + DRIFT_Y * Math.sin(now * DRIFT_FREQ_Y + DRIFT_PHASE_Y));
      return;
    }
    this.targetX = s.lensX * this.boxW;
    this.targetY = s.lensY * this.boxH;
  }

  private start(): void {
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(): void {
    this.rafId = null;
    if (!this.active || !this.settings) return;

    this.resolveTarget(performance.now());
    const ease = isMotionAllowed() ? EASE : 1;
    this.curX += (this.targetX - this.curX) * ease;
    this.curY += (this.targetY - this.curY) * ease;
    this.place(this.curX, this.curY);

    const settled =
      Math.abs(this.targetX - this.curX) < SETTLE_PX &&
      Math.abs(this.targetY - this.curY) < SETTLE_PX;
    // Keep animating while drift runs or the pointer is live; otherwise let the
    // position settle and idle.
    const keepGoing =
      (this.settings.lensDrift && isMotionAllowed()) ||
      (this.settings.lensFollow && this.pointerInside) ||
      !settled;
    if (keepGoing) this.start();
  }

  private place(x: number, y: number): void {
    // Centre the bulge image on the gaze point (filter user space; primitive
    // units default to the element's user space, so these are px from the box
    // origin). The surrounding flood supplies neutral grey everywhere else.
    this.feImage.setAttribute("x", String(Math.round(x - this.side / 2)));
    this.feImage.setAttribute("y", String(Math.round(y - this.side / 2)));
    const px = (x / this.boxW) * 100;
    const py = (y / this.boxH) * 100;
    const radius = (this.settings?.lensRadius ?? 0.3) * 100;
    this.veil.style.setProperty("--lx", `${px.toFixed(2)}%`);
    this.veil.style.setProperty("--ly", `${py.toFixed(2)}%`);
    this.veil.style.setProperty("--lr", `${radius.toFixed(2)}%`);
  }
}

// Return an encoded bulge image for this geometry, building and caching it on
// first request. Returns "" only when the canvas context is unavailable.
function mapFromCache(side: number, radius: number, key: string): string {
  const cached = MAP_CACHE.get(key);
  if (cached !== undefined) return cached;
  const dataUri = buildDisplacementMap(side, radius);
  if (!dataUri) return "";
  // Bound the cache: drop the oldest entry once it's full (Map keeps insertion
  // order), so a long "Field size" drag can't grow it without limit.
  if (MAP_CACHE.size >= MAP_CACHE_LIMIT) {
    const oldest = MAP_CACHE.keys().next().value;
    if (oldest !== undefined) MAP_CACHE.delete(oldest);
  }
  MAP_CACHE.set(key, dataUri);
  return dataUri;
}

// Where the ring fades to neutral so the square's edge meets the flood with no
// seam (fractions of the half-side; the taper finishes well inside the corners).
const EDGE_FADE_START = 0.78;
const EDGE_FADE_END = 0.96;

// Paint the bulge once: neutral grey (no displacement) by default, with a soft
// radial ring whose red channel encodes the horizontal push and green the
// vertical — both pointing radially outward, peaking at `radius`, so the text
// bends at the field boundary. The ring is windowed to exactly neutral before
// the canvas edge, so compositing it over the flood leaves no visible border.
function buildDisplacementMap(side: number, radius: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const image = ctx.createImageData(side, side);
  const data = image.data;
  const half = side / 2;
  const fadeStart = half * EDGE_FADE_START;
  const fadeEnd = half * EDGE_FADE_END;
  // Width of the soft ring; the bump is a Gaussian centred on `radius`.
  const sigma = radius * RING_SIGMA_RATIO;
  const twoSigmaSq = 2 * sigma * sigma;

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const ox = x - half;
      const oy = y - half;
      const dist = Math.hypot(ox, oy) || 1;
      let bump = Math.exp(-((dist - radius) * (dist - radius)) / twoSigmaSq);
      // Taper the ring to zero before the square's edge → seamless with flood.
      if (dist >= fadeEnd) bump = 0;
      else if (dist > fadeStart) {
        bump *= 1 - smoothstep01((dist - fadeStart) / (fadeEnd - fadeStart));
      }
      const ux = ox / dist;
      const uy = oy / dist;
      // 128 is the neutral midpoint feDisplacementMap reads as "no shift".
      data[i] = clampByte(128 + ux * bump * 127);
      data[i + 1] = clampByte(128 + uy * bump * 127);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

function smoothstep01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
