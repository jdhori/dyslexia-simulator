// The "Copy code" button beside each bookmarklet's source.
//
// Its outcome is a status message (WCAG 2.1 SC 4.1.3), so it goes to the
// page's one live region (ui/announce.ts) as well as onto the button. The
// button's own label is not enough on its own: a change to the name of the
// focused control is not reliably spoken, and when the clipboard refuses,
// the code is selected instead, so focus has already moved to the text box
// by the time the button's label says what to do.
//
// Nothing here touches the DOM or the clipboard directly, so
// test/copy-code.test.mjs runs it in Node with stand-ins.

/** The button's resting label (and so its accessible name). */
export const COPY_LABEL = "Copy code";
/** How long the button shows the outcome before going back to COPY_LABEL. */
export const LABEL_RESET_MS = 1500;

export const COPIED_MESSAGE =
  "Code copied. Paste it as the address of a new bookmark.";
export const COPY_REFUSED_MESSAGE =
  "Your browser did not allow copying. The code is selected: press Control + C, or Command + C on a Mac, to copy it.";

const COPIED_LABEL = "Copied!";
const REFUSED_LABEL = "Press Ctrl/Cmd + C";

/** The parts of the text box this uses. */
export interface CodeBox {
  readonly value: string;
  select(): void;
}

/** The parts of the button this uses. */
export interface LabelledButton {
  textContent: string | null;
}

export interface CopyCodeDeps {
  /** navigator.clipboard, which is missing on a page that is not secure. */
  clipboard?: { writeText(text: string): Promise<void> };
  /** Speaks a message through the page's live region. */
  announce(message: string): void;
  timers: {
    setTimeout(handler: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
  };
}

/** Each button's pending label reset, so a second press restarts it. */
const labelResets = new WeakMap<LabelledButton, unknown>();

/**
 * Copy `code` to the clipboard, or, if the browser will not, select it for a
 * keyboard copy. Either way, say which happened.
 *
 * @returns whether the code reached the clipboard
 */
export async function copyCode(
  code: CodeBox,
  button: LabelledButton,
  deps: CopyCodeDeps,
): Promise<boolean> {
  let copied = false;
  try {
    if (!deps.clipboard) throw new Error("No clipboard API on this page");
    await deps.clipboard.writeText(code.value);
    copied = true;
  } catch {
    code.select();
  }
  showOnButton(button, copied ? COPIED_LABEL : REFUSED_LABEL, deps.timers);
  deps.announce(copied ? COPIED_MESSAGE : COPY_REFUSED_MESSAGE);
  return copied;
}

function showOnButton(
  button: LabelledButton,
  label: string,
  timers: CopyCodeDeps["timers"],
): void {
  if (labelResets.has(button)) timers.clearTimeout(labelResets.get(button));
  button.textContent = label;
  labelResets.set(
    button,
    timers.setTimeout(() => {
      button.textContent = COPY_LABEL;
      labelResets.delete(button);
    }, LABEL_RESET_MS),
  );
}
