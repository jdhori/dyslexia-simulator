// The small fixes that let MathJax 2.7.7 and MathJax 4 share this page under a
// strict content security policy, on a site that other MathJax pages share.
// They live in src/engine/mathjaxCompat.ts, apart from the loader, so they
// can run here in Node with stand-ins for the browser.
//
// Run with `npm test` (Node 22.18 or later runs the TypeScript directly).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  clearSelectionWithoutEval,
  ignoreSharedMenuSettings,
  storeMenuSettingsLocally,
} from "../src/engine/mathjaxCompat.ts";

/** A Storage stand-in. `blocked` makes every call throw, as a privacy mode can. */
function fakeStorage({ blocked = false } = {}) {
  const data = new Map();
  const guard = () => {
    if (blocked) throw new Error("SecurityError: storage is blocked");
  };
  return {
    data,
    getItem: (key) => (guard(), data.has(key) ? data.get(key) : null),
    setItem: (key, value) => (guard(), data.set(key, String(value))),
  };
}

describe("storeMenuSettingsLocally (MathJax 2.7.7's menu settings)", () => {
  test("saves the menu's choices in localStorage under mjx.<name>, not in a cookie", () => {
    const storage = fakeStorage();
    const cookie = { Set: () => assert.fail("the cookie helper ran"), Get: () => assert.fail("the cookie helper ran") };
    storeMenuSettingsLocally(cookie, () => storage);
    cookie.Set("menu", { renderer: "HTML-CSS", zscale: "200%" });
    assert.equal(storage.data.get("mjx.menu"), JSON.stringify({ renderer: "HTML-CSS", zscale: "200%" }));
  });

  test("reads them back into the object MathJax passes, and returns it", () => {
    const storage = fakeStorage();
    storage.setItem("mjx.menu", JSON.stringify({ renderer: "CommonHTML", zoom: "Click", scale: 120, discoverable: true }));
    const cookie = {};
    storeMenuSettingsLocally(cookie, () => storage);
    const settings = { zoom: "None" };
    assert.equal(cookie.Get("menu", settings), settings);
    assert.deepEqual(settings, { zoom: "Click", renderer: "CommonHTML", scale: 120, discoverable: true });
  });

  test("ignores anything but plain strings, numbers and booleans, and prototype keys", () => {
    const storage = fakeStorage();
    storage.data.set(
      "mjx.menu",
      '{"renderer":{"x":1},"list":[1],"none":null,"__proto__":{"polluted":true},"constructor":"x","zoom":"Hover"}',
    );
    const cookie = {};
    storeMenuSettingsLocally(cookie, () => storage);
    const settings = cookie.Get("menu", {});
    assert.deepEqual(settings, { zoom: "Hover" });
    assert.equal({}.polluted, undefined);
  });

  test("treats a corrupt or non-object entry as no entry", () => {
    for (const raw of ["{not json", "[1,2]", '"text"', "42"]) {
      const storage = fakeStorage();
      storage.data.set("mjx.menu", raw);
      const cookie = {};
      storeMenuSettingsLocally(cookie, () => storage);
      assert.deepEqual(cookie.Get("menu", { zoom: "None" }), { zoom: "None" }, raw);
    }
  });

  test("keeps working when storage is blocked or unavailable", () => {
    for (const storage of [() => fakeStorage({ blocked: true }), () => null, () => { throw new Error("denied"); }]) {
      const cookie = {};
      storeMenuSettingsLocally(cookie, storage);
      assert.doesNotThrow(() => cookie.Set("menu", { zoom: "Click" }));
      assert.deepEqual(cookie.Get("menu", { zoom: "None" }), { zoom: "None" });
    }
  });
});

describe("clearSelectionWithoutEval (MathJax 2.7.7's right-click handler)", () => {
  test("replaces the string timer with a function, so a CSP without 'unsafe-eval' allows it", () => {
    const timers = [];
    let emptied = 0;
    const win = {
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
      getSelection: () => ({ empty: () => emptied++ }),
    };
    const mathEvents = { safariContextMenuBug: true, Event: { ClearSelection: () => assert.fail("the original ran") } };
    assert.equal(clearSelectionWithoutEval(mathEvents, win), true);
    mathEvents.Event.ClearSelection();
    assert.equal(timers.length, 1);
    assert.equal(typeof timers[0].fn, "function");
    timers[0].fn();
    assert.equal(emptied, 1);
  });

  test("does nothing on a browser without the context-menu selection bug", () => {
    const timers = [];
    const mathEvents = { Event: { ClearSelection() {} } };
    clearSelectionWithoutEval(mathEvents, { setTimeout: (fn) => timers.push(fn), getSelection: () => null });
    mathEvents.Event.ClearSelection();
    assert.equal(timers.length, 0);
  });

  test("reports false, and changes nothing, before MathEvents has loaded", () => {
    assert.equal(clearSelectionWithoutEval(undefined, globalThis), false);
    assert.equal(clearSelectionWithoutEval({}, globalThis), false);
  });
});

describe("ignoreSharedMenuSettings (MathJax 4's menu settings)", () => {
  // Every MathJax 3 or 4 page on an origin reads and writes one localStorage
  // key, MathJax-Menu-Settings. A renderer chosen on another page of the site
  // (SVG, say) would otherwise make this page's MathJax 4 ask for an output it
  // does not ship, and fail.
  test("stops the menu reading or writing the shared key", () => {
    let read = 0;
    let written = 0;
    class Menu {
      mergeUserSettings() { read++; }
      saveUserSettings() { written++; }
    }
    assert.equal(ignoreSharedMenuSettings({ _: { ui: { menu: { Menu: { Menu } } } } }), true);
    const menu = new Menu();
    menu.mergeUserSettings();
    menu.saveUserSettings();
    assert.equal(read, 0);
    assert.equal(written, 0);
  });

  test("reports false when MathJax 4 exposes no Menu class", () => {
    assert.equal(ignoreSharedMenuSettings({}), false);
    assert.equal(ignoreSharedMenuSettings(undefined), false);
  });
});
