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
  coversElement,
  holdMathJax2Queue,
  ignoreSharedMenuSettings,
  lendMathJax2Keys,
  loadMenuDuringStartup,
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

  // The demo is simulated on 2.7.7's SVG output only, so the loader pins the
  // renderer. A visitor who chose HTML-CSS while the menu still offered it
  // has {"renderer":"HTML-CSS"} saved; read back, it would bring HTML-CSS
  // back on every visit, unsimulated, and showRenderer would bring the menu
  // item back.
  test("neither reads back nor saves the settings it is told to ignore", () => {
    const storage = fakeStorage();
    storage.setItem("mjx.menu", JSON.stringify({ renderer: "HTML-CSS", showRenderer: true, zoom: "Click", scale: 150 }));
    const cookie = {};
    storeMenuSettingsLocally(cookie, () => storage, { ignore: ["renderer", "showRenderer"] });
    const settings = { renderer: "", zoom: "None" };
    assert.deepEqual(cookie.Get("menu", settings), { renderer: "", zoom: "Click", scale: 150 });
    cookie.Set("menu", { renderer: "HTML-CSS", showRenderer: true, zoom: "Hover" });
    assert.equal(storage.data.get("mjx.menu"), JSON.stringify({ zoom: "Hover" }));
  });
});

/**
 * Just enough of MathJax 2.7.7's queue: entries run in order, and an entry
 * that returns a callback not yet called holds every later entry until it is
 * called (MathJax.Callback.Queue's documented behaviour).
 */
function fakeQueueingMathJax2() {
  const pending = [];
  const ran = [];
  let waitingFor = null;
  const run = () => {
    while (!waitingFor && pending.length) {
      const entry = pending.shift();
      const result = typeof entry === "function" ? entry() : (ran.push(entry), undefined);
      if (result?.isCallback && !result.called) waitingFor = result;
    }
  };
  const Callback = (fn) => {
    const callback = (...args) => {
      if (callback.called) return;
      callback.called = true;
      fn(...args);
      if (waitingFor === callback) {
        waitingFor = null;
        run();
      }
    };
    callback.isCallback = true;
    callback.called = false;
    return callback;
  };
  return {
    mj: { Hub: { Queue: (...entries) => { pending.push(...entries); run(); } }, Callback },
    ran,
    /** Queue an entry without running the queue, as work already under way. */
    hold: (entry) => pending.push(entry),
    resume: run,
  };
}

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
    get size() { return timers.size; },
  };
}

describe("holdMathJax2Queue (MathJax 4's borrow of window.MathJax)", () => {
  // MathJax 2.7.7's menu queues its re-renders (Scale All Math, the
  // Accessibility items) on its own Hub queue, outside this app's serial
  // chain. One that runs while MathJax 4 holds window.MathJax dies reading
  // 2.7.7's objects off MathJax 4's, and display 1 is left blank. So the
  // borrow waits for 2.7.7's queue to go idle, then holds it until it ends.
  test("resolves once 2.7.7's queue reaches it, and holds later entries until released", async () => {
    const { mj, ran } = fakeQueueingMathJax2();
    const release = await holdMathJax2Queue(mj, { timers: fakeTimers() });
    mj.Hub.Queue(["Rerender", "Hub"]);
    assert.deepEqual(ran, [], "a re-render ran while the queue was held");
    release();
    assert.deepEqual(ran, [["Rerender", "Hub"]]);
  });

  test("waits for work already queued to finish first", async () => {
    const { mj, ran, hold, resume } = fakeQueueingMathJax2();
    let finish;
    hold(() => (finish = mj.Callback(() => ran.push("re-render done"))));
    resume();
    let held = false;
    const holding = holdMathJax2Queue(mj, { timers: fakeTimers() }).then((release) => {
      held = true;
      return release;
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(held, false, "held while a re-render was still running");
    finish();
    const release = await holding;
    assert.deepEqual(ran, ["re-render done"]);
    release();
  });

  test("gives up waiting after the timeout, and its entry then holds nothing", async () => {
    const { mj, ran, hold, resume } = fakeQueueingMathJax2();
    const timers = fakeTimers();
    let unstick;
    hold(() => (unstick = mj.Callback(() => {}))); // a job that has not finished
    resume();
    const holding = holdMathJax2Queue(mj, { timeoutMs: 5000, timers });
    assert.equal(timers.size, 1);
    timers.runAll();
    const release = await holding;
    release();
    assert.doesNotThrow(release, "release can be called twice");
    // Once the slow job finishes, the hold's own entry must let the queue
    // carry straight on.
    mj.Hub.Queue(["Rerender", "Hub"]);
    unstick();
    assert.deepEqual(ran, [["Rerender", "Hub"]]);
  });

  test("releasing clears the timeout", async () => {
    const { mj } = fakeQueueingMathJax2();
    const timers = fakeTimers();
    const release = await holdMathJax2Queue(mj, { timeoutMs: 5000, timers });
    assert.equal(timers.size, 0, "the timeout outlived the wait");
    release();
  });
});

describe("lendMathJax2Keys (window.MathJax while MathJax 4's script loads)", () => {
  // MathJax 4 reads window.MathJax as its configuration when its script runs,
  // so the configuration has to be there from the moment the script is
  // requested until it runs. Over a slow connection that is seconds, and
  // 2.7.7's own code (its menu above all) keeps reading window.MathJax
  // meanwhile: right-clicking display 1 then threw "MathJax.Callback is not a
  // function" and no menu opened.
  const v2 = { Hub: { name: "Hub" }, Callback: () => {}, Localization: {}, version: "2.7.7", isReady: true };
  const config = () => ({ loader: { paths: {} }, startup: { typeset: false }, options: { enableMenu: false } });

  test("answers MathJax 4's own keys from its configuration and every other one from 2.7.7", () => {
    const own = config();
    const { global } = lendMathJax2Keys(own, v2);
    assert.equal(global.loader, own.loader);
    assert.equal(global.startup, own.startup);
    assert.equal(global.Hub, v2.Hub);
    assert.equal(global.Callback, v2.Callback);
    assert.equal(global.isReady, true);
    assert.ok("Localization" in global);
  });

  test("still looks like a configuration to MathJax 4, which checks `version` and the constructor", () => {
    // MathJax 4.1.3: a plain object without `version` is a configuration;
    // one with it is taken for a MathJax that has already loaded.
    const { global } = lendMathJax2Keys(config(), v2);
    assert.equal(global.version, undefined);
    assert.equal("version" in global, false);
    assert.equal(global.constructor, {}.constructor);
    assert.deepEqual(Object.keys(global), ["loader", "startup", "options"]);
  });

  test("stops lending once MathJax 4 has run, leaving a plain configuration", () => {
    const { global, stop } = lendMathJax2Keys(config(), v2);
    stop();
    assert.equal(global.Hub, undefined);
    assert.equal("Callback" in global, false);
    assert.ok(global.loader);
  });

  test("lends nothing when 2.7.7 is not loaded", () => {
    const own = config();
    const { global } = lendMathJax2Keys(own, null);
    assert.equal(global.Hub, undefined);
    assert.equal(global.loader, own.loader);
  });
});

describe("coversElement (which of 2.7.7's typesets reach display 1)", () => {
  // 2.7.7 posts ["End Math", elements, action] after every typeset and
  // re-render, where elements is one element or a list of them.
  const node = (parent = null) => {
    const self = {
      parent,
      contains(other) {
        for (let at = other; at; at = at.parent) if (at === self) return true;
        return false;
      },
    };
    return self;
  };
  const body = node();
  const section = node(body);
  const root = node(section);
  const elsewhere = node(body);

  test("is true for the element, an ancestor or a descendant, alone or in a list", () => {
    assert.equal(coversElement(root, root), true);
    assert.equal(coversElement(body, root), true);
    assert.equal(coversElement([elsewhere, section], root), true);
    assert.equal(coversElement(node(root), root), true);
  });

  test("is false for elements elsewhere, and for anything that is not an element", () => {
    assert.equal(coversElement(elsewhere, root), false);
    assert.equal(coversElement([elsewhere], root), false);
    assert.equal(coversElement(undefined, root), false);
    assert.equal(coversElement("math-root", root), false);
    assert.equal(coversElement([null, {}], root), false);
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

describe("loadMenuDuringStartup (MathJax 2.7.7's delayed menu loads)", () => {
  // Out of the box, 2.7.7's startup step MenuZoom sets timers: 1 s later it
  // loads the menu's phrases, and 2 s later MathZoom if it is missing. Those
  // timers can fire while MathJax 4 holds window.MathJax, and 2.7.7 then dies
  // reading MathJax.Callback off the wrong object.
  function fakeMathJax2({ showMathMenu = true, menu = true, zoom = true } = {}) {
    const queued = [];
    const mj = {
      Ajax: { name: "Ajax" },
      Localization: { name: "Localization" },
      Callback: { Queue: () => ({ Push: (...items) => (queued.push(items), "queue") }) },
      Extension: { ...(menu ? { MathMenu: {} } : {}), ...(zoom ? { MathZoom: {} } : {}) },
      Hub: { config: { showMathMenu }, Startup: { MenuZoom: () => assert.fail("the original ran") } },
    };
    return { mj, queued };
  }

  test("does the same loads at once, as part of startup, and hands startup the queue to wait on", () => {
    const { mj, queued } = fakeMathJax2();
    assert.equal(loadMenuDuringStartup(mj), true);
    assert.equal(mj.Hub.Startup.MenuZoom(), "queue");
    assert.deepEqual(queued, [[["loadDomain", mj.Localization, "MathMenu"]]]);
  });

  test("loads MathMenu and MathZoom first when they are not loaded yet", () => {
    const { mj, queued } = fakeMathJax2({ menu: false, zoom: false });
    loadMenuDuringStartup(mj);
    mj.Hub.Startup.MenuZoom();
    assert.deepEqual(queued, [[
      ["Require", mj.Ajax, "[MathJax]/extensions/MathMenu.js", {}],
      ["loadDomain", mj.Localization, "MathMenu"],
      ["Require", mj.Ajax, "[MathJax]/extensions/MathZoom.js", {}],
    ]]);
  });

  test("loads nothing when the page has no MathJax menu", () => {
    const { mj, queued } = fakeMathJax2({ showMathMenu: false });
    loadMenuDuringStartup(mj);
    assert.equal(mj.Hub.Startup.MenuZoom(), null);
    assert.deepEqual(queued, []);
  });

  test("reports false, and changes nothing, without a startup to change", () => {
    assert.equal(loadMenuDuringStartup(undefined), false);
    assert.equal(loadMenuDuringStartup({ Hub: {} }), false);
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
