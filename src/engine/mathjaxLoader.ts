// Loads MathJax and typesets elements with it. Two different major versions
// run on this page at once, which takes a little care.
//
// Why 2.7.7 for the demo: it is the version Canvas LMS ships, so equations
// authored for a Canvas course behave here exactly as they do there. Its SVG
// output draws every glyph as a vector path, which is why stretchy delimiters
// (the tall brace in the demo) come out as one continuous curve instead of the
// stacked font pieces a text-based renderer has to fall back on.
//
// Running 2.7.7 and 4 together: each version reads `window.MathJax` as its
// configuration when its script runs, then overwrites that global with its own
// API object. They cannot both own the global — but neither needs to own it
// forever. Once a version has typeset, its output is ordinary static DOM. So
// 2.7.7 loads first and renders the demo, then MathJax 4 borrows the global
// for as long as it takes to load AND typeset its own panel, and 2.7.7's
// object goes back afterwards. Restoring it keeps 2.7.7's contextual menu and
// zoom working on the demo, which the note under it tells readers to use.
//
// The borrow must cover the typesetting, not just the script load: MathJax 4
// fetches font ranges on demand, and that loader reads the global. And because
// 2.7.7 typesets asynchronously through its own queue — also reading the
// global as it goes — the two versions must never be working at the same
// moment. Every job here therefore goes through one serial chain, and each job
// installs the global its own version expects before it starts.
//
// Accessibility: the AssistiveMML extension is enabled on 2.7.7, so MathJax
// puts a real MathML copy of each equation in the accessibility tree and hides
// the SVG from assistive technology. Without it, SVG maths is opaque to a
// screen reader.

const MATHJAX2_SRC =
  "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-MML-AM_SVG";
const MATHJAX4_SRC = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js";

interface MathJax2Hub {
  Queue: (...args: unknown[]) => void;
}
export interface MathJax2 {
  Hub: MathJax2Hub;
  version: string;
}
export interface MathJax4 {
  startup?: { promise?: Promise<unknown> };
  typesetPromise?: (elements: HTMLElement[]) => Promise<unknown>;
  version?: string;
}

declare global {
  interface Window {
    MathJax?: unknown;
  }
}

let v2Loader: Promise<MathJax2> | null = null;
let v4Loader: Promise<void> | null = null;
/** MathJax 4's API object once loaded, re-installed each time we borrow. */
let v4Api: MathJax4 | null = null;
/** 2.7.7's API object, kept so it can be restored after MathJax 4 loads. */
let mathJax2Global: unknown = null;

// One job at a time, whichever version it belongs to. Without this, MathJax 4
// can borrow the global while 2.7.7 is midway through typesetting, and 2.7.7
// then reads MathJax.SVG off the wrong object and dies.
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(job, job);
  chain = next.catch(() => undefined);
  return next;
}

function injectScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error(`Could not fetch ${src}`)),
    );
    document.head.appendChild(script);
  });
}

export function loadMathJax2(): Promise<MathJax2> {
  if (v2Loader) return v2Loader;

  v2Loader = (async () => {
    // MathJax 2 reads window.MathJax as configuration when its script runs.
    // skipStartupTypeset keeps it off the rest of the page — we hand it only
    // the elements we want typeset.
    window.MathJax = {
      jax: ["input/TeX", "output/SVG"],
      extensions: ["tex2jax.js", "MathMenu.js", "MathZoom.js", "AssistiveMML.js"],
      TeX: {
        extensions: ["AMSmath.js", "AMSsymbols.js", "noErrors.js", "noUndefined.js"],
      },
      SVG: { scale: 100, useFontCache: true, font: "TeX" },
      showMathMenu: true,
      menuSettings: { assistiveMML: true },
      skipStartupTypeset: true,
      messageStyle: "none",
    };

    await injectScript(MATHJAX2_SRC);
    const mj = window.MathJax as MathJax2 | undefined;
    if (!mj?.Hub) throw new Error("MathJax 2 loaded but Hub is missing");
    mathJax2Global = mj;
    return mj;
  })();

  return v2Loader;
}

/** Typeset with 2.7.7. The element's text must already hold the TeX. */
export function typeset2(mj: MathJax2, element: HTMLElement): Promise<void> {
  return serial(() => {
    // Make sure the global is 2.7.7's before its queue runs — MathJax 4 may
    // have borrowed it for the panel below.
    if (mathJax2Global) window.MathJax = mathJax2Global;
    return new Promise<void>((resolve) => {
      mj.Hub.Queue(["Typeset", mj.Hub, element], resolve);
    });
  });
}

/**
 * Run `job` with MathJax 4 holding `window.MathJax`, then give the global back
 * to 2.7.7.
 *
 * The borrow has to span the typesetting, not just the script load: MathJax 4
 * fetches font ranges on demand — `\mathbb{R}` in this equation pulls the
 * double-struck range — and that loader reads the global. Restoring it before
 * typesetting finishes makes those fetches fail.
 */
export function withMathJax4<T>(job: (mj: MathJax4) => Promise<T>): Promise<T> {
  return serial(() => borrowForMathJax4(job));
}

async function borrowForMathJax4<T>(
  job: (mj: MathJax4) => Promise<T>,
): Promise<T> {
  // Let 2.7.7 settle first, so the demo never waits on this and the global we
  // borrow is the finished one.
  try {
    await v2Loader;
  } catch {
    // 2.7.7 failing does not stop 4 from rendering its own panel.
  }

  const previous = window.MathJax;
  window.MathJax = v4Api ?? {
    startup: { typeset: false },
    // 2.7.7 owns the page's menu; a second one would only confuse.
    //
    // enableAssistiveMml is deliberately NOT set here. It makes MathJax fetch
    // the a11y component lazily, and that fetch outlives the window in which
    // this version holds the global — the loader then reads MathJax.loader off
    // 2.7.7's object and dies. The panel gets its accessible copy from the
    // page's own MathML instead; see ui/mathComparison.ts.
    options: { enableMenu: false },
  };

  try {
    if (!v4Loader) v4Loader = injectScript(MATHJAX4_SRC);
    await v4Loader;
    const mj = window.MathJax as MathJax4 | undefined;
    if (!mj?.typesetPromise) throw new Error("MathJax 4 API is missing");
    v4Api = mj;
    await mj.startup?.promise;
    return await job(mj);
  } finally {
    window.MathJax = settledGlobal(previous);
  }
}

/**
 * The object to leave on `window.MathJax` once both versions are up.
 *
 * Neither can simply have it back. 2.7.7 needs its own API there for the
 * contextual menu and zoom on the demo. MathJax 4 keeps reaching for it too,
 * well after typesetting finishes — it fetches font ranges on demand, and this
 * equation's double-struck R arrives late, at which point its loader reads
 * MathJax.loader.components and finds 2.7.7 instead.
 *
 * The two APIs barely overlap, though: 2.7.7 works through Hub, SVG and
 * friends, while 4 works through loader, startup and its module registry. So
 * the global becomes a merge of both, with 2.7.7's keys winning any collision.
 * Each library then finds what it looks for.
 */
function settledGlobal(previous: unknown): unknown {
  const v2 = mathJax2Global as Record<string, unknown> | null;
  if (!v2) return v4Api ?? previous;
  if (!v4Api) return v2;
  return { ...(v4Api as Record<string, unknown>), ...v2 };
}

/** Typeset with 4. The element's text must already hold the TeX. */
export async function typeset4(
  mj: MathJax4,
  element: HTMLElement,
): Promise<void> {
  await mj.typesetPromise?.([element]);
}
