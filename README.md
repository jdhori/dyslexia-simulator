# Reading Disorders & Color Blindness Simulation

An interactive, accessible simulation of how **Dyslexia, Irlen Syndrome, Low
Vision, and other reading disorders** can make text feel, and how **colour
blindness** changes what an image shows — built to create a moment of empathy,
not to diagnose. It is a modern TypeScript fork of Victor
Widell's 2016
demo
[“Dsxyliea”](https://geon.github.io/programming/2016/03/03/dsxyliea), expanded
with several new effects, a math-content demo with three renderings of one
equation, a data table, a colour-vision simulation, two bookmarklets, a
day/night theme, and accessibility safeguards throughout.

> **Please read this first.** Dyslexia is neurological and differs from person to
> person. It is *not* literally “moving letters” for everyone, and this is **not
> a diagnostic tool or a medical model**. Several of these effects also overlap
> with **Irlen Syndrome** (scotopic sensitivity / visual stress) — a distinct
> perceptual condition. **Low vision** readers may meet the *Letter fragments*
> and *Blur / focus drift* effects in everyday reading, because black text on a
> white background can be overpowering — many find white text on a dark
> background easier, though everyone is different. This recreates *some* commonly
> described visual experiences to build empathy — nothing more.

## Effects

Each effect is a toggle, and they combine. They’re grouped in the control panel:

**Dyslexia**
- **Letter scramble** — typoglycemia: inner letters shuffle, first and last stay put (the original 2016 effect).
- **…include first & last** — opens the whole word to a full anagram.
- **Letter flips (b d p q)** — the classic confusable pairs are mirrored.
- **Jumping letters** — letters swap places with the word directly above or below; nothing happens where there’s no neighbour (top/bottom of the text or across a paragraph gap).
- **Letter fragments** — removes part of each letter so words must be decoded slowly, with an adjustable **removal size**; a CSS approximation of Daniel Britton’s *Dyslexia* typeface (not his actual font).

**Other reading disorders**
- **Perception alphabet** — a per-letter distortion (mirror, tilt, baseline drift, fade) approximating how some people with learning or developmental disabilities describe *seeing* characters.
- **Visual wobble** — letters tremble and never hold still, a reading disorder some people experience; its Speed and Intensity sliders show the range of movement different readers describe.
- **Blur / focus drift** — focus slips softly in and out.
- **Crowding** — spacing tightens until words press together.

**Vision field loss**
- **Black-hole lens** — a movable field of vision loss that refracts (bends) the text at its boundary. **Tunnel** is *Retinitis pigmentosa*: a clear centre with darkness closing in from the periphery, so reading shrinks to a narrow window. **Central scotoma** inverts it into a dark hole over the gaze (closer to macular degeneration than RP, and labelled as such). The field can **follow the pointer**, **drift** on its own (motion-gated), or be placed with **Resting X / Y** sliders; **Field size** and **Refraction** tune it, and **Pull inward** flips the distortion from magnifying the text outward to pinching it into the field edge like a true black hole. For fun, **Render an actual black hole** draws a glowing event horizon and accretion ring where the dark spot sits — pair it with *Pull inward* and the bent text reads as light falling past the horizon.

Every effect carries **its own controls**, shown beneath it while it’s on: a
**Speed** for the time-based effects (scramble, jumping letters, wobble, blur)
and a strength slider for the rest — **Intensity**, or **Removal size** for
letter fragments and **Tightness** for crowding. So you can tune one effect to
one reader’s experience without disturbing the others.

## Math content

One LaTeX equation (`src/engine/mathContent.ts`) is shown three ways, so the
effects can be compared across renderers:

1. **MathJax 2.7.7, SVG output** — the simulated demo. 2.7.7 is the version
   Canvas LMS ships, so an equation authored for a Canvas course behaves here
   as it does there, and SVG draws stretchy delimiters as one continuous
   curve. Its own menu (right-click, or <kbd>Shift</kbd> + <kbd>F10</kbd>)
   can switch the renderer, the zoom and the assistive MathML.
2. **Native MathML** — static markup laid out by the browser itself, also
   simulated (on a copy, so the real equation stays in the accessibility tree).
3. **MathJax 4, CommonHTML output** — the current MathJax, left unsimulated as
   a clean reference. Both MathJax versions run in the one page; see
   `src/engine/mathjaxLoader.ts` for how they share `window.MathJax`.

On the simulated renderings:

- The `\text{…}` words **scramble**, and ordinary variables and digits **mix
  positions** with each other (a full anagram across the equation).
- Perception, wobble, blur and the b/d/p/q flips distort the math letters
  too. Crowding, jumping letters and letter fragments are never applied to
  math: they would wreck the equation rather than simulate reading it.
- Structural pieces — fractions, large operators (∑, ∫), square roots, stretchy
  delimiters — are **left intact**, so the equation keeps its shape.
- Screen readers always receive the correct equation: MathJax’s assistive
  MathML copy is never touched.

On a narrow screen each rendering scrolls sideways inside its own panel, and
while it does, the panel is a named region in the tab order, so the arrow keys
can scroll it.

## Colour vision

Three sample images — Ishihara plates, charts that rely on colour alone, and a
red-versus-green football game — can be re-rendered as someone with
protanopia, deuteranopia, tritanopia or achromatopsia is estimated to see them.
The filters are SVG `feColorMatrix` versions of the Machado, Oliveira and
Fernandes (2009) full-severity matrices (`src/engine/colorVisionMatrices.ts`),
so they are an estimate, not a measurement. Each option has an **i** button
that explains the condition, and a status line always says which view is on
screen. The **Simulation on** switch and the reveal control suspend the
filters too.

## Accessibility

The tool is built to WCAG 2.1 AA, because a tool about reading should be
readable:

- **The real text is never lost.** The visible, animated layer is `aria-hidden`;
  an off-screen, unaltered copy stays in the accessibility tree (and a clean
  MathML copy of every rendering of the equation), so screen-reader users
  always get the correct content and never hear scrambled letters.
- **Reduced motion is respected.** With `prefers-reduced-motion`, live animation
  is paused and a single static snapshot is shown; an “Animate anyway” control
  lets a user opt back in.
- **Instant reveal.** A reveal toggle and the <kbd>Esc</kbd> key restore the
  original text everywhere at once.
- Full keyboard operation, visible focus styles, labelled controls with
  `fieldset`/`legend` grouping, live slider readouts, and a day/night theme that
  defaults to your OS preference.

## Running it

```bash
npm ci
npm run dev      # start the Vite dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
npm test         # unit tests (node --test; Node 22.18 or later)
```

`dist/` is self-contained and its paths are relative (`base: "./"`), so it
can be served from the root of a site or from any sub-folder.

### Self-hosted MathJax, no CDN

The page makes **no request to any other origin**. Both MathJax versions are
served from the app's own `vendor/` folder:

| Package (devDependency, exact version) | Copied to | Used for |
|---|---|---|
| `mathjax2` → `mathjax@2.7.7` | `vendor/mathjax2/` | the SVG demo, its menu and zoom, and every renderer and accessibility tool the menu offers |
| `mathjax4` → `mathjax@4.1.3` | `vendor/mathjax4/` | the CommonHTML panel, with its speech engine (`sre/`) |
| `@mathjax/mathjax-newcm-font@4.1.3` | `vendor/mathjax-newcm-font/` | MathJax 4's default font, which it would otherwise fetch from a CDN |

`scripts/vendor-mathjax.mjs` copies only the files the page can load (about
8.6 MB, 604 files, out of about 140 MB of packages) from `node_modules` into
`public/vendor/` before every `npm run dev` and `npm run build` (the
`predev` and `prebuild` scripts). `public/vendor/` is git-ignored: the pinned
packages are the source of truth, and the script refuses to copy a package
whose installed version differs from the pin. The script's header lists what
is left out and why; `test/vendor-mathjax.test.mjs` checks it.

`src/engine/mathjaxLoader.ts` points both versions at those copies through
`import.meta.env.BASE_URL`, and `src/engine/mathjaxCompat.ts` holds four
small fixes for sharing a page and a site:

- MathJax 2.7.7 loads its menu's phrases during startup, not on a timer a
  second later: the timer fired while MathJax 4 held `window.MathJax`, and
  2.7.7 then threw "MathJax.Callback is not a function". The loader also
  waits for 2.7.7's startup to finish before MathJax 4 borrows the global;
- MathJax 2.7.7's menu keeps its settings in `localStorage` (`mjx.menu`)
  instead of a year-long, site-wide cookie;
- opening that menu no longer passes a string to `setTimeout`, which a policy
  without `'unsafe-eval'` blocks and reports;
- MathJax 4 ignores the menu settings that other MathJax 3 or 4 pages on the
  same origin keep in `localStorage` (`MathJax-Menu-Settings`), and never
  writes over them. Without this, a renderer chosen on another page (SVG, say)
  made this page ask for an output it does not ship, and the panel never
  rendered.

So the built app runs under a content security policy with no external
origins at all:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self'; img-src 'self' data:; connect-src 'self';
worker-src 'self' blob:
```

`'unsafe-inline'` styles are for the styles MathJax writes into the page, and
`blob:` workers are for MathJax 4, which starts its speech worker from a
`blob:` URL.

The static MathML in `index.html` was generated with KaTeX, which is no
longer a dependency. To regenerate it after changing the equation, use KaTeX
0.18.2 or later (earlier versions are affected by GHSA-238p-pmpm-9mq7).

## The bookmarklets

The **Take it to any page** section generates two bookmarklets. Each is a
self-contained `javascript:` snippet: drag it to the bookmarks bar, then click
it on any page you choose. It runs only in that page, only when clicked, and
sends nothing anywhere.

- **Dyslexia simulator** applies **only the original Letter scramble**
  (typoglycemia) — the behaviour of the 2016 demo — because the other effects
  can’t be applied safely to arbitrary pages. Click it once to start, again to
  stop; its speed and intensity follow the page’s Letter scramble controls.
- **Colour blindness simulator** filters the whole page through the same
  matrices as the colour-vision section. Each click moves to the next
  deficiency, and a fifth click clears it.

Some sites block bookmarklets with a strict content-security-policy.

## Project structure

```
src/
  main.ts                 # bootstrap + wiring
  state.ts                # settings store (immutable, persisted)
  style.css               # design tokens, layout, and the effect CSS
  engine/
    motion.ts             # reduced-motion gate
    theme.ts              # day/night theme (OS default + override)
    textNodes.ts          # TreeWalker text-node collection
    glyphs.ts             # wrap text into per-letter / per-word spans
    scramble.ts           # typoglycemia permutation
    perception.ts         # the perception-alphabet stylesheet
    simulator.ts          # drives a text region (modes, tick loop, line-switch)
    lens.ts               # black-hole vision-loss overlay (SVG refraction + veil)
    mathContent.ts        # the one equation every math rendering shows
    mathSimulator.ts      # renders (MathJax 2.7.7 SVG) + simulates the demo equation
    panelSimulator.ts     # simulates the native MathML panel on a copy
    mathjaxLoader.ts      # loads both MathJax versions from vendor/, shares the global
    mathjaxCompat.ts      # the CSP and shared-origin fixes for MathJax
    colorVision.ts        # applies the colour-vision filters to the gallery
    colorVisionMatrices.ts # Machado 2009 matrices, shared with the bookmarklet
  ui/
    controls.ts           # the control panel
    colorVisionControls.ts # the colour-vision chooser and its explanations
    infoDisclosure.ts     # the "i" explanation buttons
    mathComparison.ts     # the native MathML and MathJax 4 panels
    scrollRegion.ts       # keyboard access for maths panels that scroll sideways
    bookmarklet.ts        # both bookmarklet generators
    themeToggle.ts        # fixed day/night toggle
    announce.ts           # screen-reader live region
scripts/
  vendor-mathjax.mjs      # copies MathJax into public/vendor/ (predev, prebuild)
test/                     # node --test unit tests
public/
  colorblind/             # the three colour-vision sample images
```

## Credits & sources

- Original concept and letter-scramble demo: **Victor Widell**, *Dsxyliea*
  (2016).
- Background: [Dyslexia](https://en.wikipedia.org/wiki/Dyslexia),
  [Typoglycemia](https://en.wikipedia.org/wiki/Typoglycemia), and
  [Irlen Syndrome](https://irlen.com/what-is-irlen-syndrome/).
- Daniel Britton’s
  [*Dyslexia* typeface](https://www.boredpanda.com/dyslexic-typrface-daniel-britton/),
  which simulates the *effort* of decoding by removing parts of each letter.
- Colour vision matrices: Machado, Oliveira & Fernandes,
  [“A Physiologically-based Model for Simulation of Color Vision Deficiency”](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
  (2009).
- [MathJax](https://www.mathjax.org/) 2.7.7 and 4.1.3 and its New Computer
  Modern font, Apache License 2.0; each copy in `vendor/` keeps its `LICENSE`.
- The three colour-vision sample images in `public/colorblind/` have no
  recorded source or licence yet.

## License

[MIT](LICENSE). The original demo carries no explicit license; this fork credits
Victor Widell as the originator of the core idea.
