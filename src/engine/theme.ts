// Day/night theme. Defaults to the OS preference; the toggle sets an explicit
// choice (persisted) that overrides the OS via a `data-theme` attribute on the
// root element. With no explicit choice, CSS follows prefers-color-scheme.

type Theme = "light" | "dark";

const STORAGE_KEY = "dyslexia-simulator/theme";
const query = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

let explicit: Theme | null = load();
apply();

function systemTheme(): Theme {
  return query.matches ? "dark" : "light";
}

function load(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // storage unavailable — fall back to the OS preference
  }
  return null;
}

function apply(): void {
  if (explicit) {
    document.documentElement.setAttribute("data-theme", explicit);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getTheme(): Theme {
  return explicit ?? systemTheme();
}

export function setTheme(theme: Theme): void {
  explicit = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // non-fatal
  }
  apply();
  notify();
}

export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// While following the OS (no explicit choice), keep the toggle label in sync.
query.addEventListener("change", () => {
  if (!explicit) notify();
});
