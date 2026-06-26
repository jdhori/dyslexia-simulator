// Application settings: a small immutable store with subscribe + localStorage.

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
  // --- timing ---
  /** Milliseconds between scramble passes. */
  readonly speedMs: number;
  /** Fraction of words (0..1) changed on each pass. */
  readonly intensity: number;
  // --- transient ---
  /** Show the original, unaltered text. Never persisted as `true`. */
  readonly reveal: boolean;
}

/** Bounds that mirror the control sliders, used to sanitise loaded values. */
const SPEED_MIN = 50;
const SPEED_MAX = 2000;
const INTENSITY_MIN = 0.02;
const INTENSITY_MAX = 0.6;

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
  speedMs: 500,
  intensity: 0.12,
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
    const merged: Settings = { ...DEFAULT_SETTINGS, ...parsed, reveal: false };
    // localStorage is untrusted (DevTools, extensions, same-origin tampering).
    // Clamp the numeric fields so a bad value can't, e.g., make setInterval(0)
    // busy-loop the main thread or push intensity outside 0..1.
    return {
      ...merged,
      speedMs: clamp(merged.speedMs, SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS.speedMs),
      intensity: clamp(
        merged.intensity,
        INTENSITY_MIN,
        INTENSITY_MAX,
        DEFAULT_SETTINGS.intensity,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function persist(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode, quota). Non-fatal.
  }
}
