// The colour-vision chooser, rendered inside the Colour vision section (next
// to the images it affects) rather than in the sidebar.
//
// The options form a vertical list; each has an "i" information button that
// shows the option's description in ONE shared panel to the right of the list
// (beneath it on narrow screens), so opening an explanation never reflows the
// list itself. Only one explanation is open at a time. The buttons follow the
// disclosure pattern (aria-expanded + aria-controls on the shared panel), and
// opening one also speaks its text through the page's persistent live region,
// so the reader hears the explanation without navigating to it.

import type { ColorVision, Settings, SettingsStore } from "../state";
import { setEmphasisContent } from "./infoDisclosure";
import { announce } from "./announce";

interface OptionDef {
  value: ColorVision;
  label: string;
  /** Shown in the information disclosure. */
  info: string;
}

const OPTIONS: readonly OptionDef[] = [
  {
    value: "none",
    label: "Typical colour vision",
    info: "The images as they were published, with no simulation applied. Roughly 92% of men and 99.5% of women see colour this way.",
  },
  {
    value: "protanopia",
    label: "Protanopia",
    info: "Red-blind: the eye's long-wavelength (red) cones are missing. Reds look dark and dull, and red, orange, yellow and green all crowd together. One of the two common red–green forms, affecting about 1% of men.",
  },
  {
    value: "deuteranopia",
    label: "Deuteranopia",
    info: "Green-blind: the medium-wavelength (green) cones are missing. Greens and reds merge into similar browns and yellows, so the Ishihara digits and the red-versus-green uniforms disappear. The most common form, affecting about 6% of men including milder cases.",
  },
  {
    value: "tritanopia",
    label: "Tritanopia",
    info: "Blue-blind: the short-wavelength (blue) cones are missing. Blue and green are confused, and yellow and violet with pink. It is rare, affects men and women equally, and is not inherited on the X chromosome.",
  },
  {
    value: "achromatopsia",
    label: "Achromatopsia",
    info: "Total colour blindness: the world is seen in shades of grey, usually with light sensitivity and reduced sharpness. Very rare, about 1 in 30,000 people. Anything carried by colour alone is lost entirely.",
  },
];

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `cvd-${prefix}-${idCounter}`;
}

export function buildColorVisionControls(
  root: HTMLElement,
  store: SettingsStore,
): void {
  root.replaceChildren();

  const group = document.createElement("fieldset");
  group.className = "cvd-controls";
  const legend = document.createElement("legend");
  legend.className = "cvd-controls__legend";
  legend.textContent = "See the images as someone with";
  group.appendChild(legend);

  // Two columns: the option list, and one shared explanation panel.
  const columns = document.createElement("div");
  columns.className = "cvd-columns";
  group.appendChild(columns);

  const list = document.createElement("ul");
  list.className = "cvd-options";
  columns.appendChild(list);

  const detail = buildDetailPanel();
  columns.appendChild(detail.region);

  const name = nextId("choice");
  const reflectors: ((s: Settings) => void)[] = [];
  const buttons: HTMLButtonElement[] = [];

  for (const option of OPTIONS) {
    const item = document.createElement("li");
    item.className = "cvd-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = nextId("radio");
    input.value = option.value;
    input.checked = store.get().colorVision === option.value;
    input.addEventListener("change", () => {
      if (input.checked) store.update({ colorVision: option.value });
    });

    const label = document.createElement("label");
    label.setAttribute("for", input.id);
    label.textContent = option.label;

    const button = buildInfoButton(option.label, detail.region.id);
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      for (const other of buttons) other.setAttribute("aria-expanded", "false");
      if (open) {
        button.setAttribute("aria-expanded", "true");
        detail.show(option);
      } else {
        detail.hide();
      }
    });
    buttons.push(button);

    item.append(input, label, button);
    list.appendChild(item);
    reflectors.push((s) => {
      input.checked = s.colorVision === option.value;
    });
  }

  root.appendChild(group);
  store.subscribe((next) => {
    for (const reflect of reflectors) reflect(next);
  });
}

// The "i" button: a native button whose accessible name carries the visible
// option label, so voice control can say "click Information about Protanopia"
// (SC 2.5.3); Enter / Space and pointer cancellation come free with <button>.
function buildInfoButton(subject: string, controlsId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-btn";
  button.setAttribute("aria-label", `Information about ${subject}`);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", controlsId);
  const icon = document.createElement("span");
  icon.className = "info-btn__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "i";
  button.appendChild(icon);
  return button;
}

interface DetailPanel {
  region: HTMLElement;
  show: (option: OptionDef) => void;
  hide: () => void;
}

// One shared explanation panel: a heading (the option's label) plus its
// description. Opening it also speaks the text through the page's persistent
// live region — see announce.ts for why the panel cannot be its own.
function buildDetailPanel(): DetailPanel {
  const region = document.createElement("div");
  region.className = "cvd-detail";
  region.id = nextId("detail");
  region.classList.add("is-empty");

  const heading = document.createElement("h3");
  heading.className = "cvd-detail__heading";

  const text = document.createElement("p");
  text.className = "cvd-detail__text";
  region.append(heading, text);

  return {
    region,
    show: (option) => {
      heading.textContent = option.label;
      setEmphasisContent(text, option.info);
      region.classList.remove("is-empty");
      announce(`${option.label}. ${option.info}`);
    },
    hide: () => {
      heading.textContent = "";
      text.replaceChildren();
      region.classList.add("is-empty");
    },
  };
}
