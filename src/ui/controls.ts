// The control panel. Builds an accessible <form> of grouped controls and keeps
// them in sync with the settings store (so e.g. pressing Esc to reveal also
// updates the reveal button here).
//
// Each mode carries its own timing/strength sliders, shown beneath the mode and
// only while that mode is on, so a reader can tune one effect without touching
// the others.

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

/** A numeric Settings field exposed as a slider under its mode. */
type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

interface ParamDef {
  key: NumericKey;
  label: string;
  /** "speed" is an ms value; "fraction" is a 0..1 strength shown as a percent. */
  kind: "speed" | "fraction";
}

interface ModeDef {
  key: ModeKey;
  label: string;
  hint: string;
  params?: ParamDef[];
}

const SPEED = (key: NumericKey, label = "Speed"): ParamDef => ({
  key,
  label,
  kind: "speed",
});
const STRENGTH = (key: NumericKey, label = "Intensity"): ParamDef => ({
  key,
  label,
  kind: "fraction",
});

// Effects that read as dyslexia itself (letter movement and reversal)...
const DYSLEXIA_MODES: ModeDef[] = [
  {
    key: "scramble",
    label: "Letter scramble",
    hint: "Inner letters shuffle; first and last stay put.",
    params: [SPEED("scrambleSpeed"), STRENGTH("scrambleIntensity")],
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
    params: [SPEED("linejumpSpeed"), STRENGTH("linejumpIntensity")],
  },
  {
    key: "fragment",
    label: "Letter fragments",
    hint: "Removes part of each letter, so words must be decoded slowly — an approximation of Daniel Britton's *Dyslexia* typeface.",
    params: [STRENGTH("fragmentIntensity", "Removal size")],
  },
];

// ...and effects describing other reading difficulties.
const OTHER_MODES: ModeDef[] = [
  {
    key: "perception",
    label: "Perception alphabet",
    hint: "How some people with learning or developmental disabilities perceive characters — letters mirror, tilt, drift and fade.",
    params: [STRENGTH("perceptionIntensity")],
  },
  {
    key: "wobble",
    label: "Visual wobble",
    hint: "A reading disorder some people experience — letters tremble and never hold still. Needs motion.",
    params: [SPEED("wobbleSpeed"), STRENGTH("wobbleIntensity")],
  },
  {
    key: "blur",
    label: "Blur / focus drift",
    hint: "Focus slips in and out.",
    params: [SPEED("blurSpeed"), STRENGTH("blurIntensity")],
  },
  {
    key: "crowding",
    label: "Crowding",
    hint: "Spacing tightens until words touch.",
    params: [STRENGTH("crowdingIntensity", "Tightness")],
  },
];

/** Callbacks that push the current settings back into a control. */
type Reflector = (settings: Settings) => void;

export function buildControls(root: HTMLElement, store: SettingsStore): void {
  root.replaceChildren();

  const form = document.createElement("form");
  form.className = "controls";
  form.setAttribute("aria-label", "Simulation controls");
  form.addEventListener("submit", (event) => event.preventDefault());

  const reflectors: Reflector[] = [];

  // --- header: title, master switch, reveal toggle, tip ---
  const header = document.createElement("div");
  header.className = "control-header";

  const title = document.createElement("h2");
  title.className = "controls-title";
  title.textContent = "Controls";

  const master = checkbox("Simulation on", store.get().enabled, (value) =>
    store.update({ enabled: value }),
  );
  master.wrapper.classList.add("control-master");
  reflectors.push((s) => {
    master.input.checked = s.enabled;
  });

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
  reflectors.push((s) => setRevealState(s.reveal));

  const escHint = document.createElement("p");
  escHint.className = "control-hint";
  escHint.innerHTML = "Tip: press <kbd>Esc</kbd> to toggle this at any time.";

  header.append(title, master.wrapper, reveal, escHint);
  form.appendChild(header);

  // --- groups: two named mode groups (+ motion when relevant) ---
  const groups = document.createElement("div");
  groups.className = "control-groups";

  groups.appendChild(buildModeGroup("Dyslexia", DYSLEXIA_MODES, store, reflectors));
  groups.appendChild(
    buildModeGroup("Other reading disorders", OTHER_MODES, store, reflectors),
  );

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
    for (const reflect of reflectors) reflect(next);
  });
}

function buildModeGroup(
  legendText: string,
  modes: ModeDef[],
  store: SettingsStore,
  reflectors: Reflector[],
): HTMLFieldSetElement {
  const group = fieldset(legendText);
  for (const mode of modes) {
    const modeWrap = document.createElement("div");
    modeWrap.className = "mode";

    const control = checkbox(
      mode.label,
      store.get()[mode.key],
      (value) => store.update({ [mode.key]: value } as Partial<Settings>),
      mode.hint,
    );
    modeWrap.appendChild(control.wrapper);

    if (mode.params?.length) {
      // A fieldset with a visually-hidden legend names this mode's sliders, so a
      // screen-reader user landing on a "Speed" slider out of spatial context
      // still knows which effect it belongs to (the visible label stays "Speed").
      const params = document.createElement("fieldset");
      params.className = "mode-params";
      params.hidden = !store.get()[mode.key];
      const legend = document.createElement("legend");
      legend.className = "sr-only";
      legend.textContent = `${mode.label} settings`;
      params.appendChild(legend);
      for (const param of mode.params) {
        params.appendChild(buildParam(param, store, reflectors));
      }
      modeWrap.appendChild(params);
      reflectors.push((s) => {
        control.input.checked = s[mode.key];
        params.hidden = !s[mode.key];
      });
    } else {
      reflectors.push((s) => {
        control.input.checked = s[mode.key];
      });
    }

    group.appendChild(modeWrap);
  }
  return group;
}

function buildParam(
  param: ParamDef,
  store: SettingsStore,
  reflectors: Reflector[],
): HTMLElement {
  const isFraction = param.kind === "fraction";
  const toSlider = (s: Settings): number =>
    isFraction ? Math.round((s[param.key] as number) * 100) : (s[param.key] as number);
  const fromSlider = (value: number): number => (isFraction ? value / 100 : value);
  const format = (value: number): string =>
    isFraction ? `${value}%` : `${value} ms`;

  const control = slider({
    label: param.label,
    min: isFraction ? 2 : 50,
    max: isFraction ? 60 : 2000,
    step: isFraction ? 2 : 50,
    value: toSlider(store.get()),
    format,
    onInput: (value) =>
      store.update({ [param.key]: fromSlider(value) } as Partial<Settings>),
  });

  reflectors.push((s) => control.set(toSlider(s)));
  return control.wrapper;
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
  /** Push a value in from the store without firing onInput. */
  set: (value: number) => void;
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
  // So the thumb announces "12%" / "500 ms" rather than just the bare number.
  input.setAttribute("aria-valuetext", config.format(config.value));

  const labelEl = document.createElement("label");
  labelEl.setAttribute("for", input.id);
  labelEl.textContent = config.label;

  const output = document.createElement("output");
  output.setAttribute("for", input.id);
  // Decorative: the value is already conveyed to AT via the slider's
  // aria-valuetext, and <output> live-region support is unreliable. Hiding it
  // avoids both silent failures and double-announcements.
  output.setAttribute("aria-hidden", "true");
  output.textContent = config.format(config.value);

  const set = (value: number): void => {
    input.value = String(value);
    const text = config.format(value);
    output.textContent = text;
    input.setAttribute("aria-valuetext", text);
  };

  input.addEventListener("input", () => {
    const value = Number(input.value);
    const text = config.format(value);
    output.textContent = text;
    input.setAttribute("aria-valuetext", text);
    config.onInput(value);
  });

  wrapper.append(labelEl, input, output);
  return { wrapper, input, set };
}
