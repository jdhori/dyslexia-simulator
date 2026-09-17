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
// Opening the panel also speaks its text, so a screen-reader user hears the
// explanation without having to navigate to it. That announcement goes through
// the page's one persistent live region (see announce.ts) rather than an
// aria-live attribute on the panel: the panel is empty and zero-height until it
// opens, and a browser does not expose an element in that state, so a live
// region declared on it is never armed and never speaks. VoiceOver in Chrome
// shows this most clearly — the attribute is there in DevTools and nothing is
// announced no matter how long you wait.

import { announce } from "./announce";

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
    if (open) {
      setEmphasisContent(panel, text);
      // Name the subject first, so the reader knows which control this
      // explains — the button's own name is not repeated by the region.
      announce(`${subject}. ${text.replace(/\*/g, "")}`);
    } else {
      panel.replaceChildren();
    }
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
