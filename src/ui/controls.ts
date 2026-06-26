// The control panel. Builds an accessible <form> of grouped controls and keeps
// them in sync with the settings store (so e.g. pressing Esc to reveal also
// updates the reveal button here).

import { prefersReducedMotion, setMotionOverride } from "../engine/motion";
import type { Settings, SettingsStore } from "../state";

type ModeKey = Extract<
  keyof Settings,
  | "scramble"
  | "scrambleEnds"
  | "flip"
  | "linejump"
  | "fragment"
  | "perception"
  | "wobble"
  | "blur"
  | "crowding"
>;

interface ModeDef {
  key: ModeKey;
  label: string;
  hint: string;
}

// Effects that read as dyslexia itself (letter movement and reversal)...
const DYSLEXIA_MODES: ModeDef[] = [
  {
    key: "scramble",
    label: "Letter scramble",
    hint: "Inner letters shuffle; first and last stay put.",
  },
  {
    key: "scrambleEnds",
    label: "…include first & last",
    hint: "Scramble the whole word (a full anagram). Off keeps the classic, readable *Letter scramble* on.",
  },
  {
    key: "flip",
    label: "Letter flips (b d p q)",
    hint: "The classic mirror-image confusions.",
  },
  {
    key: "linejump",
    label: "Jumping letters",
    hint: "Letters switch places with the word directly above or below (never with empty space). Needs motion.",
  },
  {
    key: "fragment",
    label: "Letter fragments",
    hint: "Removes part of each letter, so words must be decoded slowly — an approximation of Daniel Britton's *Dyslexia* typeface.",
  },
];

// ...and effects describing other reading difficulties.
const OTHER_MODES: ModeDef[] = [
  {
    key: "perception",
    label: "Perception alphabet",
    hint: "Letters mirror, tilt, drift and fade.",
  },
  {
    key: "wobble",
    label: "Visual wobble",
    hint: "Letters tremble and never hold still. Needs motion.",
  },
  {
    key: "blur",
    label: "Blur / focus drift",
    hint: "Focus slips in and out.",
  },
  {
    key: "crowding",
    label: "Crowding",
    hint: "Spacing tightens until words touch.",
  },
];

const ALL_MODES: ModeDef[] = [...DYSLEXIA_MODES, ...OTHER_MODES];

export function buildControls(root: HTMLElement, store: SettingsStore): void {
  root.replaceChildren();

  const form = document.createElement("form");
  form.className = "controls";
  form.setAttribute("aria-label", "Simulation controls");
  form.addEventListener("submit", (event) => event.preventDefault());

  // --- header: title, master switch, reveal toggle, tip ---
  const header = document.createElement("div");
  header.className = "control-header";

  const title = document.createElement("h2");
  title.className = "controls-title";
  title.textContent = "Controls";

  const master = checkbox(
    "Simulation on",
    store.get().enabled,
    (value) => store.update({ enabled: value }),
  );
  master.wrapper.classList.add("control-master");

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "reveal-btn";
  const setRevealState = (on: boolean): void => {
    reveal.setAttribute("aria-pressed", String(on));
    reveal.textContent = on
      ? "Showing original — click to simulate"
      : "Reveal original text";
  };
  setRevealState(store.get().reveal);
  reveal.addEventListener("click", () =>
    store.update({ reveal: !store.get().reveal }),
  );

  const escHint = document.createElement("p");
  escHint.className = "control-hint";
  escHint.innerHTML = "Tip: press <kbd>Esc</kbd> to toggle this at any time.";

  header.append(title, master.wrapper, reveal, escHint);
  form.appendChild(header);

  // --- groups: two named mode groups + timing (+ motion when relevant) ---
  const groups = document.createElement("div");
  groups.className = "control-groups";

  const modeInputs = new Map<ModeKey, HTMLInputElement>();
  groups.appendChild(buildModeGroup("Dyslexia", DYSLEXIA_MODES, store, modeInputs));
  groups.appendChild(
    buildModeGroup("Other reading disorders", OTHER_MODES, store, modeInputs),
  );

  const timing = fieldset("Timing");
  const speed = slider({
    label: "Speed",
    min: 50,
    max: 2000,
    step: 50,
    value: store.get().speedMs,
    format: (value) => `${value} ms (lower is faster)`,
    onInput: (value) => store.update({ speedMs: value }),
  });
  const intensity = slider({
    label: "Intensity",
    min: 2,
    max: 60,
    step: 2,
    value: Math.round(store.get().intensity * 100),
    format: (value) => `${value}% strength`,
    onInput: (value) => store.update({ intensity: value / 100 }),
  });
  timing.append(speed.wrapper, intensity.wrapper);
  groups.appendChild(timing);

  if (prefersReducedMotion()) {
    const motionGroup = fieldset("Motion");
    const note = document.createElement("p");
    note.className = "control-hint";
    note.textContent =
      "Your system requests reduced motion, so live animation is paused — you still see a static simulation.";
    const allow = checkbox("Animate anyway", false, (value) =>
      setMotionOverride(value),
    );
    motionGroup.append(note, allow.wrapper);
    groups.appendChild(motionGroup);
  }

  form.appendChild(groups);
  root.appendChild(form);

  // Keep controls reflecting the store (e.g. Esc-to-reveal, persisted state).
  store.subscribe((next) => {
    setRevealState(next.reveal);
    master.input.checked = next.enabled;
    for (const mode of ALL_MODES) {
      const input = modeInputs.get(mode.key);
      if (input) input.checked = next[mode.key];
    }
  });
}

function buildModeGroup(
  legendText: string,
  modes: ModeDef[],
  store: SettingsStore,
  modeInputs: Map<ModeKey, HTMLInputElement>,
): HTMLFieldSetElement {
  const group = fieldset(legendText);
  for (const mode of modes) {
    const control = checkbox(
      mode.label,
      store.get()[mode.key],
      (value) => store.update({ [mode.key]: value } as Partial<Settings>),
      mode.hint,
    );
    modeInputs.set(mode.key, control.input);
    group.appendChild(control.wrapper);
  }
  return group;
}

// --- small accessible control builders ---

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function fieldset(legendText: string): HTMLFieldSetElement {
  const group = document.createElement("fieldset");
  group.className = "control-group";
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  group.appendChild(legend);
  return group;
}

interface CheckboxControl {
  wrapper: HTMLElement;
  input: HTMLInputElement;
}

// Render a hint, turning *emphasis* into <em>. Built as DOM nodes (never
// innerHTML) so it stays safe and is read normally by screen readers.
function setHintContent(el: HTMLElement, hint: string): void {
  el.replaceChildren();
  hint.split(/\*([^*]+)\*/g).forEach((part, index) => {
    if (index % 2 === 1) {
      const em = document.createElement("em");
      em.textContent = part;
      el.appendChild(em);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void,
  hint?: string,
): CheckboxControl {
  const wrapper = document.createElement("div");
  wrapper.className = "check";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = nextId("chk");
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));

  const labelEl = document.createElement("label");
  labelEl.setAttribute("for", input.id);
  labelEl.textContent = label;

  wrapper.append(input, labelEl);

  if (hint) {
    const hintEl = document.createElement("span");
    hintEl.className = "check-hint";
    hintEl.id = `${input.id}-hint`;
    setHintContent(hintEl, hint);
    input.setAttribute("aria-describedby", hintEl.id);
    wrapper.appendChild(hintEl);
  }

  return { wrapper, input };
}

interface SliderConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
}

interface SliderControl {
  wrapper: HTMLElement;
  input: HTMLInputElement;
}

function slider(config: SliderConfig): SliderControl {
  const wrapper = document.createElement("div");
  wrapper.className = "slider";

  const input = document.createElement("input");
  input.type = "range";
  input.id = nextId("rng");
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(config.value);
  // So the thumb announces "12% strength" rather than just "12".
  input.setAttribute("aria-valuetext", config.format(config.value));

  const labelEl = document.createElement("label");
  labelEl.setAttribute("for", input.id);
  labelEl.textContent = config.label;

  const output = document.createElement("output");
  output.setAttribute("for", input.id);
  output.textContent = config.format(config.value);

  input.addEventListener("input", () => {
    const value = Number(input.value);
    const text = config.format(value);
    output.textContent = text;
    input.setAttribute("aria-valuetext", text);
    config.onInput(value);
  });

  wrapper.append(labelEl, input, output);
  return { wrapper, input };
}
