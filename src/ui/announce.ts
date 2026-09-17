// The page's one polite live region (SC 4.1.3). Because the visible simulated
// text is aria-hidden, screen-reader users need a spoken signal when the
// simulation state changes (on/off, reveal) and when an information disclosure
// is opened.
//
// The region is created once, eagerly, and never removed. That matters more
// than it looks. A screen reader only speaks changes inside a region it has
// already registered, and a browser does not expose an element that is empty
// and zero-sized in the first place. So an aria-live attribute placed on a
// panel that stays empty until the moment it is filled is never armed: the
// attribute is plainly visible in DevTools and nothing is ever announced. A
// region that has been present, non-empty and registered since load has no
// such problem, so every announcement on the page goes through this one.

const PLACEHOLDER = " ";

const region = document.createElement("div");
region.className = "sr-only";
region.setAttribute("role", "status");
region.setAttribute("aria-live", "polite");
// Speak the whole message, not just the part that changed.
region.setAttribute("aria-atomic", "true");
// Non-breaking space: keeps the element non-empty, so it is laid out and
// exposed to assistive technology before the first real message arrives.
region.textContent = PLACEHOLDER;
document.body.appendChild(region);

export function announce(message: string): void {
  // Clear first so repeating the same message still re-announces, and leave a
  // beat before writing — VoiceOver in particular can miss a change made in
  // the same task as the clear.
  region.textContent = PLACEHOLDER;
  window.setTimeout(() => {
    region.textContent = message;
  }, 80);
}
