// Each bookmarklet's "Copy code" button (src/ui/copyCode.ts).
//
// Whether the copy worked has to reach a screen reader as a status message
// (WCAG 2.1 SC 4.1.3). The button's own label changing to "Copied!" is not
// enough: assistive technology does not reliably speak a change to the name
// of the focused control, and when the copy is refused the code is selected
// instead, so focus has already left the button by the time its label says
// what to do. So the outcome also goes to the page's one live region
// (src/ui/announce.ts), passed in here as `announce`.
//
// Run with `npm test` (Node 22.18 or later runs the TypeScript directly).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  COPIED_MESSAGE,
  COPY_LABEL,
  COPY_REFUSED_MESSAGE,
  LABEL_RESET_MS,
  copyCode,
} from "../src/ui/copyCode.ts";

/** Timers that run only when told to. */
function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setTimeout: (fn, ms) => (timers.set(next, { fn, ms }), next++),
    clearTimeout: (id) => timers.delete(id),
    runAll() {
      const due = [...timers.values()];
      timers.clear();
      for (const { fn } of due) fn();
    },
    delays: () => [...timers.values()].map(({ ms }) => ms),
  };
}

function setUp({ writeText } = {}) {
  const said = [];
  const written = [];
  const timers = fakeTimers();
  const button = { textContent: COPY_LABEL };
  const code = {
    value: "javascript:(function(){})()",
    selected: 0,
    select() { this.selected++; },
  };
  const deps = {
    clipboard: writeText === null ? undefined : { writeText: writeText ?? (async (text) => { written.push(text); }) },
    announce: (message) => said.push(message),
    timers,
  };
  return { said, written, timers, button, code, deps };
}

describe("copyCode", () => {
  test("copies the code, says so in the live region, and shows it on the button for a moment", async () => {
    const { said, written, timers, button, code, deps } = setUp();
    assert.equal(await copyCode(code, button, deps), true);
    assert.deepEqual(written, [code.value]);
    assert.deepEqual(said, [COPIED_MESSAGE]);
    assert.match(COPIED_MESSAGE, /copied/i);
    assert.equal(button.textContent, "Copied!");
    assert.deepEqual(timers.delays(), [LABEL_RESET_MS]);
    timers.runAll();
    assert.equal(button.textContent, COPY_LABEL);
    assert.equal(code.selected, 0);
  });

  test("when the clipboard refuses, selects the code and says how to copy it", async () => {
    const { said, timers, button, code, deps } = setUp({
      writeText: async () => { throw new DOMException("Write permission denied.", "NotAllowedError"); },
    });
    assert.equal(await copyCode(code, button, deps), false);
    assert.equal(code.selected, 1);
    assert.deepEqual(said, [COPY_REFUSED_MESSAGE]);
    // Spelled out for speech, with the Mac key too.
    assert.match(COPY_REFUSED_MESSAGE, /selected/i);
    assert.match(COPY_REFUSED_MESSAGE, /Control\s*\+\s*C/);
    assert.match(COPY_REFUSED_MESSAGE, /Command\s*\+\s*C/);
    assert.equal(button.textContent, "Press Ctrl/Cmd + C");
    timers.runAll();
    assert.equal(button.textContent, COPY_LABEL);
  });

  test("does the same where there is no clipboard API at all (an insecure page)", async () => {
    const { said, code, button, deps } = setUp({ writeText: null });
    assert.equal(await copyCode(code, button, deps), false);
    assert.equal(code.selected, 1);
    assert.deepEqual(said, [COPY_REFUSED_MESSAGE]);
  });

  test("a second press restarts the label's timer instead of stacking another", async () => {
    const { said, timers, button, code, deps } = setUp();
    await copyCode(code, button, deps);
    await copyCode(code, button, deps);
    assert.deepEqual(timers.delays(), [LABEL_RESET_MS], "two timers were left running");
    assert.deepEqual(said, [COPIED_MESSAGE, COPIED_MESSAGE], "the repeat must be announced too");
    timers.runAll();
    assert.equal(button.textContent, COPY_LABEL);
  });

  test("the button's resting label is the one the markup and the tests name", () => {
    assert.equal(COPY_LABEL, "Copy code");
  });
});
