// Three small fixes that let MathJax 2.7.7 and MathJax 4 run on this page
// under a strict content security policy, on a site whose other pages may
// use MathJax too. engine/mathjaxLoader.ts applies them as each version loads.
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
 */
export function storeMenuSettingsLocally(
  cookie: MathJax2Cookie,
  storage: () => KeyValueStorage | null,
): void {
  const open = (): KeyValueStorage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };

  cookie.Set = (name, values = {}) => {
    try {
      open()?.setItem(`${MENU_STORAGE_PREFIX}${name}`, JSON.stringify(values));
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
        if (UNSAFE_KEYS.has(key)) continue;
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
