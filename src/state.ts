// Application settings: a small immutable store with subscribe + localStorage.
// Each adjustable mode has its own timing/strength, so controls are per-mode.

/** Which way the black-hole lens reads: peripheral loss vs central loss. */
export type LensPolarity = "tunnel" | "scotoma";

const LENS_POLARITIES: readonly LensPolarity[] = ["tunnel", "scotoma"];

export interface Settings {
  /** Master switch for the whole effect. */
  readonly enabled: boolean;

  // --- modes ---
  /** Typoglycemia: shuffle inner letters, keep first and last. */
  readonly scramble: boolean;
  /** Include the first and last letters in the scramble (full anagram). */
  readonly scrambleEnds: boolean;
  /** Mirror the classic confusable pairs b d p q. */
  readonly flip: boolean;
  /** Per-letter distortion alphabet (mirror / tilt / drift / fade). */
  readonly perception: boolean;
  /** Continuous per-letter tremble (requires motion). */
  readonly wobble: boolean;
  /** Letters leap to the line above or below (requires motion). */
  readonly linejump: boolean;
  /** Remove part of each letter, after Daniel Britton's Dyslexia typeface. */
  readonly fragment: boolean;
  /** Soft focus that slips in and out. */
  readonly blur: boolean;
  /** Tighten spacing until words touch. */
  readonly crowding: boolean;
  /** Black-hole lens: a movable field of vision loss that refracts the text. */
  readonly lens: boolean;

  // --- lens configuration ---
  /** "tunnel" = clear centre, dark periphery (Retinitis pigmentosa); "scotoma"
   *  = a dark refracting hole over the gaze (macular-degeneration-like). */
  readonly lensPolarity: LensPolarity;
  /** The lens tracks the pointer over the region. */
  readonly lensFollow: boolean;
  /** The lens drifts on its own (requires motion). */
  readonly lensDrift: boolean;
  /** Bend the text inward (a true black-hole pinch) instead of magnifying it. */
  readonly lensPull: boolean;
  /** Render an actual black hole — event horizon + accretion ring — for fun. */
  readonly lensBlackHole: boolean;
  /** Radius of the clear tunnel / dark hole, as a fraction of the region. */
  readonly lensRadius: number;
  /** Refraction strength at the field boundary, 0..1. */
  readonly lensRefraction: number;
  /** Resting centre of the lens, as a 0..1 fraction of width / height. Used
   *  when neither follow nor drift is driving the position. */
  readonly lensX: number;
  readonly lensY: number;

  // --- per-mode timing (ms) + strength (0..1) ---
  readonly scrambleSpeed: number;
  readonly scrambleIntensity: number;
  readonly linejumpSpeed: number;
  readonly linejumpIntensity: number;
  readonly perceptionIntensity: number;
  readonly wobbleSpeed: number;
  readonly wobbleIntensity: number;
  readonly blurSpeed: number;
  readonly blurIntensity: number;
  readonly crowdingIntensity: number;
  /** Fraction of each letter removed by the fragment mode. */
  readonly fragmentIntensity: number;

  // --- transient ---
  /** Show the original, unaltered text. Never persisted as `true`. */
  readonly reveal: boolean;
}

/** Bounds that mirror the control sliders, used to sanitise loaded values. */
const SPEED_MIN = 50;
const SPEED_MAX = 2000;
const INTENSITY_MIN = 0.02;
const INTENSITY_MAX = 0.6;

const SPEED_KEYS = [
  "scrambleSpeed",
  "linejumpSpeed",
  "wobbleSpeed",
  "blurSpeed",
] as const satisfies readonly (keyof Settings)[];

const INTENSITY_KEYS = [
  "scrambleIntensity",
  "linejumpIntensity",
  "perceptionIntensity",
  "wobbleIntensity",
  "blurIntensity",
  "crowdingIntensity",
  "fragmentIntensity",
] as const satisfies readonly (keyof Settings)[];

// The lens numerics run on their own 0..1 scale (radius, refraction, and the
// resting X/Y position), so they are clamped separately from the mode strengths
// above — an intensity-range clamp would wrongly cap radius and position.
const UNIT_MIN = 0;
const UNIT_MAX = 1;
const UNIT_KEYS = [
  "lensRadius",
  "lensRefraction",
  "lensX",
  "lensY",
] as const satisfies readonly (keyof Settings)[];

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  scramble: true,
  scrambleEnds: false,
  flip: false,
  perception: false,
  wobble: false,
  linejump: false,
  fragment: false,
  blur: false,
  crowding: false,
  lens: false,

  lensPolarity: "tunnel",
  lensFollow: true,
  lensDrift: false,
  lensPull: false,
  lensBlackHole: false,
  lensRadius: 0.3,
  lensRefraction: 0.5,
  lensX: 0.5,
  lensY: 0.5,

  scrambleSpeed: 500,
  scrambleIntensity: 0.12,
  linejumpSpeed: 600,
  linejumpIntensity: 0.12,
  perceptionIntensity: 0.2,
  wobbleSpeed: 400,
  wobbleIntensity: 0.12,
  blurSpeed: 1000,
  blurIntensity: 0.12,
  crowdingIntensity: 0.12,
  fragmentIntensity: 0.2,

  reveal: false,
};

const STORAGE_KEY = "dyslexia-simulator/settings";

export type SettingsListener = (settings: Settings) => void;

export class SettingsStore {
  private settings: Settings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(initial: Settings = DEFAULT_SETTINGS) {
    this.settings = initial;
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    persist(this.settings);
    for (const listener of this.listeners) listener(this.settings);
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      reveal: false,
    };
    // localStorage is untrusted (DevTools, extensions, same-origin tampering).
    // Clamp every numeric field so a bad value can't, e.g., make setInterval(0)
    // busy-loop the main thread or push a strength outside its range.
    for (const key of SPEED_KEYS) {
      merged[key] = clamp(merged[key], SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS[key]);
    }
    for (const key of INTENSITY_KEYS) {
      merged[key] = clamp(
        merged[key],
        INTENSITY_MIN,
        INTENSITY_MAX,
        DEFAULT_SETTINGS[key],
      );
    }
    for (const key of UNIT_KEYS) {
      merged[key] = clamp(merged[key], UNIT_MIN, UNIT_MAX, DEFAULT_SETTINGS[key]);
    }
    // The polarity is a string enum, so a tampered blob could carry anything;
    // fall back to the default unless it is one of the known values.
    if (!LENS_POLARITIES.includes(merged.lensPolarity as LensPolarity)) {
      merged.lensPolarity = DEFAULT_SETTINGS.lensPolarity;
    }
    return merged as unknown as Settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function persist(settings: Settings): void {
  try {
    // Write only the known settings keys, so a legacy blob's stale fields (e.g.
    // the old global speedMs/intensity) don't round-trip back into storage. The
    // transient `reveal` flag is never persisted — a reload always simulates.
    const toStore: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (key === "reveal") continue;
      toStore[key] = settings[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Storage can be unavailable (private mode, quota). Non-fatal.
  }
}
