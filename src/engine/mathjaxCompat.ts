// Small fixes that let MathJax 2.7.7 and MathJax 4 run on this page under a
// strict content security policy, on a site whose other pages may use
// MathJax too, without either version tripping over the other.
// engine/mathjaxLoader.ts applies them as each version loads.
//
// They touch nothing at the top level, so test/mathjax-compat.test.mjs can
// run them in Node with stand-ins for the browser.

/** The part of the Storage interface these fixes use. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** MathJax 2.7.7's cookie helper (MathJax.HTML.Cookie), which its menu saves through. */
export interface MathJax2Cookie {
  Set?: (name: string, values?: Record<string, unknown>) => void;
  Get?: (name: string, into?: Record<string, unknown>) => Record<string, unknown>;
}

const MENU_STORAGE_PREFIX = "mjx.";
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PLAIN_VALUE_TYPES = new Set(["string", "number", "boolean"]);

/**
 * Keep 2.7.7's menu settings in localStorage instead of a cookie.
 *
 * Out of the box, 2.7.7 saves a choice made in its menu (the renderer, the
 * zoom trigger and so on) as a cookie, mjx.menu, scoped to the whole site for
 * a year, so the browser sends it with every request to that site. This app
 * keeps its own settings in localStorage, and so does this: the menu still
 * remembers a choice, under the same name, and the page sets no cookie.
 * Stored values are read back as plain strings, numbers and booleans only.
 *
 * @param storage returns the storage to use; it may throw or return null
 *   where storage is blocked, and the menu then forgets its choices on reload.
 * @param options.ignore settings the page pins: never saved and never read
 *   back, whatever an earlier visit stored (the loader pins the renderer).
 */
export function storeMenuSettingsLocally(
  cookie: MathJax2Cookie,
  storage: () => KeyValueStorage | null,
  { ignore = [] }: { ignore?: readonly string[] } = {},
): void {
  const ignored = new Set(ignore);
  const open = (): KeyValueStorage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };

  cookie.Set = (name, values = {}) => {
    const kept = Object.fromEntries(
      Object.entries(values).filter(([key]) => !ignored.has(key)),
    );
    try {
      open()?.setItem(`${MENU_STORAGE_PREFIX}${name}`, JSON.stringify(kept));
    } catch {
      // Storage blocked or full: the choice lasts until the page closes.
    }
  };

  cookie.Get = (name, into = {}) => {
    let stored: unknown = null;
    try {
      stored = JSON.parse(open()?.getItem(`${MENU_STORAGE_PREFIX}${name}`) ?? "null");
    } catch {
      stored = null;
    }
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const [key, value] of Object.entries(stored)) {
        if (UNSAFE_KEYS.has(key) || ignored.has(key)) continue;
        if (PLAIN_VALUE_TYPES.has(typeof value)) into[key] = value;
      }
    }
    return into;
  };
}

/** MathJax 2.7.7's MathEvents extension (MathJax.Extension.MathEvents). */
export interface MathJax2Events {
  /** Set by 2.7.7 for WebKit and Blink browsers. */
  safariContextMenuBug?: boolean;
  Event?: { ClearSelection?: () => void };
}

/** The window features clearSelectionWithoutEval uses. */
export interface TimerWindow {
  setTimeout: (handler: () => void, timeout?: number) => unknown;
  getSelection: () => { empty?: () => void } | null;
}

/**
 * Give 2.7.7's right-click handler a function where it has a string.
 *
 * When the equation's menu opens, 2.7.7 clears the text selection with
 * setTimeout("window.getSelection().empty()", 0). A string timer is evaluated
 * as code, which a content security policy without 'unsafe-eval' blocks and
 * reports as a violation, every time a reader opens the menu the page tells
 * them to use. This does the same thing with a function. (2.7.7's other
 * branch, for Internet Explorer's document.selection, is dropped; this app
 * does not run there.)
 *
 * @returns false if MathEvents has not loaded yet, so nothing was changed
 */
export function clearSelectionWithoutEval(
  mathEvents: MathJax2Events | undefined,
  win: TimerWindow,
): boolean {
  if (!mathEvents) return false;
  const extension = mathEvents;
  const events = extension.Event;
  if (!events || typeof events.ClearSelection !== "function") return false;
  events.ClearSelection = () => {
    if (!extension.safariContextMenuBug) return;
    win.setTimeout(() => win.getSelection()?.empty?.(), 0);
  };
  return true;
}

/** The parts of MathJax 2.7.7's API that its startup's MenuZoom step uses. */
export interface MathJax2Startup {
  Ajax?: unknown;
  Localization?: unknown;
  Callback?: { Queue: () => { Push: (...items: unknown[]) => unknown } };
  Extension?: { MathMenu?: unknown; MathZoom?: unknown };
  Hub?: {
    config?: { showMathMenu?: boolean };
    Startup?: { MenuZoom?: () => unknown };
  };
}

/**
 * Load 2.7.7's menu phrases (and MathMenu or MathZoom, if missing) during
 * its startup, instead of on timers after it.
 *
 * 2.7.7's startup step MenuZoom leaves two loads on timers, to speed up the
 * first typeset: the menu's phrases 1 s later, and MathZoom 2 s later if it
 * is not loaded yet. On this page those timers fire while MathJax 4 may hold
 * window.MathJax, and 2.7.7 then dies reading MathJax.Callback off MathJax
 * 4's object. Both extensions are loaded at startup here anyway, and English
 * phrases need no file, so doing it at once costs nothing; and startup waits
 * for it, so 2.7.7 has nothing left pending when it reports that it is done.
 *
 * Call it from 2.7.7's AuthorInit, before startup runs.
 *
 * @returns false if there is no startup to change
 */
export function loadMenuDuringStartup(mathJax2: MathJax2Startup | undefined): boolean {
  const startup = mathJax2?.Hub?.Startup;
  if (!mathJax2 || !startup) return false;
  const mj = mathJax2;
  startup.MenuZoom = () => {
    if (!mj.Hub?.config?.showMathMenu || !mj.Callback) return null;
    const items: unknown[] = [];
    if (!mj.Extension?.MathMenu) items.push(["Require", mj.Ajax, "[MathJax]/extensions/MathMenu.js", {}]);
    items.push(["loadDomain", mj.Localization, "MathMenu"]);
    if (!mj.Extension?.MathZoom) items.push(["Require", mj.Ajax, "[MathJax]/extensions/MathZoom.js", {}]);
    // A startup step that returns its queue's last callback, as 2.7.7's own
    // steps do, makes startup wait until the loads are done.
    return mj.Callback.Queue().Push(...items);
  };
  return true;
}

/** MathJax 4's Menu class, as its loaded API exposes it. */
interface MathJax4MenuClass {
  prototype: { mergeUserSettings?: () => void; saveUserSettings?: () => void };
}

/**
 * Keep MathJax 4 off the menu settings that every MathJax page on the site
 * shares.
 *
 * MathJax 3 and 4 keep their menu's settings in one localStorage key,
 * MathJax-Menu-Settings, per origin, and read it even with the menu turned
 * off. Under a site with other MathJax pages, a renderer chosen on one of
 * them (SVG, say) makes this page's MathJax 4 ask for an output this app does
 * not ship, and its panel never renders. Its menu is off here, so it has no
 * settings of its own to keep: this stops it reading the key, and writing it
 * back over another page's choices.
 *
 * Call it from MathJax 4's startup.ready, before the document is created.
 *
 * @returns false if the loaded MathJax exposes no Menu class
 */
export function ignoreSharedMenuSettings(mathJax: unknown): boolean {
  const api = mathJax as { _?: { ui?: { menu?: { Menu?: { Menu?: MathJax4MenuClass } } } } } | undefined;
  const Menu = api?._?.ui?.menu?.Menu?.Menu;
  if (!Menu?.prototype) return false;
  Menu.prototype.mergeUserSettings = () => {};
  Menu.prototype.saveUserSettings = () => {};
  return true;
}

/** The parts of MathJax 2.7.7 that holdMathJax2Queue uses. */
export interface MathJax2Queueing {
  Hub: { Queue: (...items: unknown[]) => unknown };
  /** MathJax.Callback: wraps a function as a callback its queues can wait on. */
  Callback: (fn: () => void) => () => void;
}

/** setTimeout and clearTimeout, as window has them. */
export interface Timers {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/**
 * Wait until MathJax 2.7.7's Hub queue is idle, then hold it there until the
 * returned function is called.
 *
 * The loader runs its own 2.7.7 typesetting and MathJax 4's borrow of
 * window.MathJax through one serial chain, so they never overlap. 2.7.7's
 * menu does not use that chain: Scale All Math and the Accessibility items
 * queue a re-render on 2.7.7's own Hub queue. One that ran while MathJax 4
 * held the global read MathJax.OutputJax off MathJax 4's object, threw, and
 * left display 1 blank. Holding 2.7.7's queue for the length of the borrow
 * makes such a re-render wait its turn instead, and waiting for it to go idle
 * first keeps the borrow from starting in the middle of one.
 *
 * If the queue has not reached this hold within `timeoutMs` (a job stuck on a
 * file that never arrives, say), the promise resolves anyway, so MathJax 4 is
 * not kept waiting for ever, and the hold, once the queue does reach it,
 * holds nothing.
 *
 * @returns a promise of the function that releases the queue
 */
export function holdMathJax2Queue(
  mathJax2: MathJax2Queueing,
  { timeoutMs = 10_000, timers }: { timeoutMs?: number; timers: Timers },
): Promise<() => void> {
  return new Promise((resolve) => {
    let settled = false;
    let gate: (() => void) | null = null;
    const release = (): void => {
      settled = true;
      const open = gate;
      gate = null;
      open?.();
    };
    const timer = timers.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(release);
    }, timeoutMs);
    // A queued function that returns a MathJax callback not yet called holds
    // the queue until that callback is called.
    mathJax2.Hub.Queue(() => {
      timers.clearTimeout(timer);
      if (settled) return undefined;
      settled = true;
      gate = mathJax2.Callback(() => {});
      resolve(release);
      return gate;
    });
  });
}

/**
 * What to put on window.MathJax while MathJax 4's script is fetched and run:
 * MathJax 4's configuration, which also answers for 2.7.7.
 *
 * MathJax 4 reads window.MathJax as its configuration when its script runs,
 * so the configuration has to be in place from the moment the script is
 * requested. Over a slow connection that is seconds, and 2.7.7's own code
 * keeps reading window.MathJax meanwhile: its menu above all, which a reader
 * may open at any moment. With MathJax 4's bare configuration there,
 * right-clicking display 1 threw "MathJax.Callback is not a function" and no
 * menu opened, and the menu's own items threw in the same way.
 *
 * So the global is a view of the configuration that lends 2.7.7's keys
 * (Hub, Callback, OutputJax and the rest) for any name the configuration
 * does not have. Its own keys, and so what MathJax 4 enumerates, are only
 * the configuration's; and it never lends `version`, which is how MathJax 4
 * tells a configuration (no version) from a MathJax that has already loaded.
 * MathJax 4 keeps the object as MathJax.config once it runs, so call `stop`
 * then: from there it is the plain configuration again.
 *
 * @param mathJax2 2.7.7's API object, or null if it did not load
 */
export function lendMathJax2Keys<T extends object>(
  config: T,
  mathJax2: object | null,
): { global: T; stop: () => void } {
  if (!mathJax2) return { global: config, stop: () => {} };
  const lender = mathJax2;
  let lending = true;
  const lends = (target: object, key: PropertyKey): boolean =>
    lending && key !== "version" && !(key in target) && key in lender;
  const global = new Proxy(config, {
    get: (target, key, receiver) =>
      lends(target, key) ? Reflect.get(lender, key) : Reflect.get(target, key, receiver),
    has: (target, key) => lends(target, key) || Reflect.has(target, key),
  });
  return {
    global,
    stop: () => {
      lending = false;
    },
  };
}

/** Anything with Node#contains. */
export interface ContainingNode {
  contains(other: unknown): boolean;
}

const isContainingNode = (value: unknown): value is ContainingNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ContainingNode).contains === "function";

/**
 * Whether a typeset reached `element`: true if `elements` (one element or a
 * list, as 2.7.7's "End Math" message carries them) holds the element, an
 * ancestor of it or a descendant of it.
 */
export function coversElement(elements: unknown, element: ContainingNode): boolean {
  const list: unknown[] = Array.isArray(elements) ? elements : [elements];
  return list.some(
    (el) =>
      isContainingNode(el) &&
      (el === element || el.contains(element) || element.contains(el)),
  );
}
