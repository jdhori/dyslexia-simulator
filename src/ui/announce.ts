// A single polite live region for status messages (SC 4.1.3). Because the
// visible simulated text is aria-hidden, screen-reader users need a spoken
// signal when the simulation state changes (on/off, reveal, custom update).

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (region) return region;
  region = document.createElement("div");
  region.className = "sr-only";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}

export function announce(message: string): void {
  const node = ensureRegion();
  // Clear first so repeating the same message still re-announces.
  node.textContent = "";
  window.setTimeout(() => {
    node.textContent = message;
  }, 40);
}
