// The control panel. Builds an accessible <form> of grouped controls and keeps
// them in sync with the settings store (so e.g. pressing Esc to reveal also
// updates the reveal button here).
//
// Each mode carries its own timing/strength sliders, shown beneath the mode and
// only while that mode is on, so a reader can tune one effect without touching
// the others.

import { prefersReducedMotion, setMotionOverride } from "../engine/motion";
import type { Settings, SettingsStore } from "../state";
import { buildInfoDisclosure, setEmphasisContent } from "./infoDisclosure";

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
  | "lens"
  | "lensFollow"
  | "lensDrift"
  | "lensPull"
  | "lensBlackHole"
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
  /** Override the default slider range (used by the 0–100% position sliders). */
  range?: { min: number; max: number; step: number };
}

/** A string-enum field rendered as a radio group (currently lens polarity). */
interface RadioDef {
  key: "lensPolarity";
  label: string;
  options: { value: string; label: string }[];
}

/** A boolean sub-control shown inside a mode's panel while the mode is on. */
interface ToggleDef {
  key: ModeKey;
  label: string;
  hint?: string;
}

interface ModeDef {
  key: ModeKey;
  label: string;
  hint: string;
  /** Longer description shown by the mode's "i" information button. */
  info?: string;
  params?: ParamDef[];
  radio?: RadioDef;
  toggles?: ToggleDef[];
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
// A 0–100% position slider (the lens's resting centre), distinct from the
// 2–60% strength sliders above.
const POSITION = (key: NumericKey, label: string): ParamDef => ({
  key,
  label,
  kind: "fraction",
  range: { min: 0, max: 100, step: 2 },
});

// Effects that read as dyslexia itself (letter movement and reversal)...
const DYSLEXIA_MODES: ModeDef[] = [
  {
    key: "scramble",
    label: "Letter scramble",
    hint: "Inner letters shuffle; first and last stay put.",
    info:
      "The inner letters of a word are shuffled while the first and last letters stay put. This is the original 2016 effect. You can also include the first and last letters for a harder, full anagram.",
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
    info:
      "The classic confusable pairs are mirrored or flipped, the reversal errors many beginning and dyslexic readers report.",
  },
  {
    key: "linejump",
    label: "Jumping letters",
    hint: "Letters switch places with the word directly above or below (never with empty space). Needs motion.",
    info:
      "Letters switch places with the word directly above or below them, so the eye keeps losing its place between rows — an experience dyslexic readers have reported. Letters with nothing above or below — at the start or end of the text, or beside a paragraph gap — stay put, because there is nothing to switch with.",
    params: [SPEED("linejumpSpeed"), STRENGTH("linejumpIntensity")],
  },
  {
    key: "fragment",
    label: "Letter fragments",
    hint: "Removes part of each letter, so words must be decoded slowly — an approximation of Daniel Britton's *Dyslexia* typeface.",
    info:
      "Part of every letter is removed, so each word must be decoded slowly. Lower removal sizes echo the dyslexic effort of decoding; higher sizes evoke a low-vision experience of black text on white, where the white overpowers the characters. It was inspired by Daniel Britton's *Dyslexia* typeface, which simulated visual perceptual anomalies.",
    params: [STRENGTH("fragmentIntensity", "Removal size")],
  },
];

// ...and effects describing other reading difficulties.
const OTHER_MODES: ModeDef[] = [
  {
    key: "perception",
    label: "Perception alphabet",
    hint: "How some people with learning or developmental disabilities perceive characters — letters mirror, tilt, drift and fade.",
    info:
      "A per-letter distortion — mirroring, rotation, baseline drift, and fading — that approximates how some people with learning or developmental disabilities describe *seeing* characters: unstable shapes that shift and reverse rather than sitting still.",
    params: [STRENGTH("perceptionIntensity")],
  },
  {
    key: "wobble",
    label: "Visual wobble",
    hint: "A reading disorder some people experience — letters tremble and never hold still. Needs motion.",
    info:
      "Letters drift and tremble, so the line never holds still — a reading disorder some people experience. The Speed and Intensity sliders show the range of movement different readers describe, and how distracting it is to read against.",
    params: [SPEED("wobbleSpeed"), STRENGTH("wobbleIntensity")],
  },
  {
    key: "blur",
    label: "Blur / focus drift",
    hint: "Focus slips in and out.",
    info:
      "Focus slips in and out — the way tired eyes lose a sharp edge, the way some people with low vision experience text on white backgrounds, and the way text can look before someone starts wearing glasses.",
    params: [SPEED("blurSpeed"), STRENGTH("blurIntensity")],
  },
  {
    key: "crowding",
    label: "Crowding",
    hint: "Spacing tightens until words touch.",
    info:
      "Spacing tightens until letters and words press together and the white “rivers” between words vanish — a reading experience described by people with dyslexia, Irlen Syndrome, and other reading disorders, and sometimes by those prior to wearing glasses.",
    params: [STRENGTH("crowdingIntensity", "Tightness")],
  },
];

// Field-of-vision loss: a movable "black hole" that bends the text at the edge
// of the failing field. One mechanism, two honest readings of it.
const VISION_MODES: ModeDef[] = [
  {
    key: "lens",
    label: "Black-hole lens",
    hint: "A field of vision loss that refracts the text at its boundary. *Tunnel* is Retinitis pigmentosa — a clear centre with darkness closing in from the edges; *Central scotoma* inverts it into a dark hole over your gaze (closer to macular degeneration, not RP).",
    info:
      "A movable field of vision loss that bends, or “refracts,” the text at its edge. *Tunnel* is the Retinitis pigmentosa experience: peripheral vision is lost first, so a clear window survives at the centre while darkness closes in from the edges — reading shrinks to scanning a narrow tunnel. *Central scotoma* inverts it into a dark hole that sits over wherever you look, hiding the very thing you are trying to read; that pattern is closer to macular degeneration than to RP, and is labelled as such. The refraction can *magnify* the text outward or, with *Pull inward*, pinch it into the field edge like a true black hole. Because the loss moves with the eye, the lens can follow your pointer, drift on its own, or be placed with the X / Y sliders. There is also a *for-fun* option to render an actual black hole — a glowing event horizon and accretion ring — where the dark spot sits.",
    radio: {
      key: "lensPolarity",
      label: "Field shape",
      options: [
        { value: "tunnel", label: "Tunnel (RP)" },
        { value: "scotoma", label: "Central scotoma" },
      ],
    },
    params: [
      STRENGTH("lensRadius", "Field size"),
      // Refraction runs to 100% (not the usual 60%) so the text can stretch hard.
      { ...STRENGTH("lensRefraction", "Refraction"), range: { min: 2, max: 100, step: 2 } },
      POSITION("lensX", "Resting X"),
      POSITION("lensY", "Resting Y"),
    ],
    toggles: [
      {
        key: "lensPull",
        label: "Pull inward (black hole)",
        hint: "Bends the text *into* the failing edge like a true black hole, instead of magnifying it outward.",
      },
      {
        key: "lensBlackHole",
        label: "Render an actual black hole",
        hint: "Just for fun: draws a glowing event horizon where the dark spot sits. Pair it with *Pull inward* for the full gravitational effect.",
      },
      {
        key: "lensFollow",
        label: "Follow the pointer",
        hint: "The field tracks your cursor over the text — whatever you look at is exactly what's hidden.",
      },
      {
        key: "lensDrift",
        label: "Drift on its own",
        hint: "The field wanders slowly across the text. Needs motion; the resting position is used otherwise.",
      },
    ],
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
  groups.appendChild(
    buildModeGroup("Vision field loss", VISION_MODES, store, reflectors),
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
    if (mode.info) {
      const info = buildInfoDisclosure(mode.label, mode.info);
      info.button.classList.add("check-info-btn");
      control.wrapper.classList.add("check--info");
      // The button sits beside the label (third grid column); the hint and
      // then the panel follow beneath, so the panel opens under the mode.
      control.wrapper.querySelector("label")?.after(info.button);
      control.wrapper.append(info.panel);
    }
    modeWrap.appendChild(control.wrapper);

    const hasPanel = Boolean(
      mode.params?.length || mode.radio || mode.toggles?.length,
    );
    if (hasPanel) {
      // A fieldset with a visually-hidden legend names this mode's sub-controls,
      // so a screen-reader user landing on a "Speed" slider out of spatial
      // context still knows which effect it belongs to (visible labels are kept
      // terse). The panel is hidden while the mode is off.
      const params = document.createElement("fieldset");
      params.className = "mode-params";
      params.hidden = !store.get()[mode.key];
      const legend = document.createElement("legend");
      legend.className = "sr-only";
      legend.textContent = `${mode.label} settings`;
      params.appendChild(legend);

      if (mode.radio) {
        params.appendChild(buildRadioGroup(mode.radio, store, reflectors));
      }
      for (const toggle of mode.toggles ?? []) {
        params.appendChild(buildToggle(toggle, store, reflectors));
      }
      for (const param of mode.params ?? []) {
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

  const range = param.range ?? {
    min: isFraction ? 2 : 50,
    max: isFraction ? 60 : 2000,
    step: isFraction ? 2 : 50,
  };
  const control = slider({
    label: param.label,
    min: range.min,
    max: range.max,
    step: range.step,
    value: toSlider(store.get()),
    format,
    onInput: (value) =>
      store.update({ [param.key]: fromSlider(value) } as Partial<Settings>),
  });

  reflectors.push((s) => control.set(toSlider(s)));
  return control.wrapper;
}

// A sub-toggle shown inside a mode's panel (e.g. the lens's follow/drift modes).
function buildToggle(
  toggle: ToggleDef,
  store: SettingsStore,
  reflectors: Reflector[],
): HTMLElement {
  const control = checkbox(
    toggle.label,
    store.get()[toggle.key],
    (value) => store.update({ [toggle.key]: value } as Partial<Settings>),
    toggle.hint,
  );
  reflectors.push((s) => {
    control.input.checked = s[toggle.key];
  });
  return control.wrapper;
}

// A radio group for a string-enum setting (the lens polarity). Native radios in
// a shared group inside a labelled fieldset, so arrow-key selection and the
// group name are conveyed to assistive tech for free.
function buildRadioGroup(
  def: RadioDef,
  store: SettingsStore,
  reflectors: Reflector[],
): HTMLElement {
  const group = document.createElement("fieldset");
  group.className = "radiogroup";
  const legend = document.createElement("legend");
  legend.className = "radiogroup-legend";
  legend.textContent = def.label;
  group.appendChild(legend);

  const name = nextId("radio");
  const inputs: { value: string; input: HTMLInputElement }[] = [];
  for (const option of def.options) {
    const wrapper = document.createElement("div");
    wrapper.className = "radio";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = nextId("rad");
    input.value = option.value;
    input.checked = store.get()[def.key] === option.value;
    input.addEventListener("change", () => {
      if (input.checked) {
        store.update({ [def.key]: option.value } as Partial<Settings>);
      }
    });

    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", input.id);
    labelEl.textContent = option.label;

    wrapper.append(input, labelEl);
    group.appendChild(wrapper);
    inputs.push({ value: option.value, input });
  }

  reflectors.push((s) => {
    for (const item of inputs) item.input.checked = s[def.key] === item.value;
  });
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
    setEmphasisContent(hintEl, hint);
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
