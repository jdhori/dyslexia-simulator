// An "i" information button that discloses a description beneath a control.
//
// A plain <button> with aria-expanded / aria-controls: operable by keyboard
// (Enter / Space), announced with its state by screen readers, and reachable
// by voice control because the accessible name includes the visible label of
// the control it explains ("Information about Letter scramble", SC 2.5.3).
// The panel is placed by the caller directly beneath its control so a
// magnifier user sees it without hunting. Native buttons fire on release, so
// pointer cancellation (SC 2.5.2) comes for free.
//
// The panel is a polite live region that stays in the accessibility tree at
// all times: opening it *inserts* the text (which is what gets announced, so
// the reader hears the explanation without navigating to it) and closing it
// empties the panel again. Toggling `hidden` instead would not announce
// reliably, because live regions only report changes inside a region that is
// already present.

let idCounter = 0;

export interface InfoDisclosure {
  button: HTMLButtonElement;
  panel: HTMLElement;
}

/**
 * @param subject the visible label of the control being explained
 * @param text the description shown when the button is expanded; `*emphasis*`
 *   is rendered as <em>
 */
export function buildInfoDisclosure(subject: string, text: string): InfoDisclosure {
  idCounter += 1;

  const panel = document.createElement("p");
  panel.className = "info-panel";
  panel.id = `info-panel-${idCounter}`;
  panel.setAttribute("aria-live", "polite");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-btn";
  button.setAttribute("aria-label", `Information about ${subject}`);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", panel.id);

  const icon = document.createElement("span");
  icon.className = "info-btn__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "i";
  button.appendChild(icon);

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    if (open) setEmphasisContent(panel, text);
    else panel.replaceChildren();
  });

  return { button, panel };
}

// Render text, turning *emphasis* into <em>. Built as DOM nodes (never
// innerHTML) so it stays safe and reads normally with screen readers.
export function setEmphasisContent(el: HTMLElement, text: string): void {
  el.replaceChildren();
  text.split(/\*([^*]+)\*/g).forEach((part, index) => {
    if (index % 2 === 1) {
      const em = document.createElement("em");
      em.textContent = part;
      el.appendChild(em);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}
