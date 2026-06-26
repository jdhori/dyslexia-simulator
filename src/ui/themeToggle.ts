// A fixed, always-reachable day/night toggle for the top-right of the page.
// Mounted early in the DOM (so it sits near the top of the tab order) but pinned
// to the corner with position: fixed.

import { getTheme, onThemeChange, toggleTheme } from "../engine/theme";

export function buildThemeToggle(root: HTMLElement): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";

  const icon = document.createElement("span");
  icon.className = "theme-toggle__icon";
  icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "theme-toggle__label";

  button.append(icon, label);

  const sync = (): void => {
    const isDay = getTheme() === "light";
    // Show the action the click performs (the convention for theme switches).
    icon.textContent = isDay ? "🌙" : "☀️";
    label.textContent = isDay ? "Night" : "Day";
    button.setAttribute(
      "aria-label",
      isDay ? "Switch to night theme" : "Switch to day theme",
    );
  };
  sync();

  button.addEventListener("click", () => toggleTheme());
  onThemeChange(sync);

  root.appendChild(button);
}
