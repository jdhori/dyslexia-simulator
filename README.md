# Dyslexia, Irlen Syndrome & Reading-Disorder Simulator

An interactive, accessible simulator of how **Dyslexia, Irlen Syndrome, Low
Vision, and other reading disorders** can make text feel — built to create a
moment of empathy, not to diagnose. It is a modern TypeScript fork of Victor
Widell's 2016
demo
[“Dsxyliea”](https://geon.github.io/programming/2016/03/03/dsxyliea), expanded
with several new effects, a math-content demo, a day/night theme, and
accessibility safeguards throughout.

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

A rendered LaTeX equation (via [KaTeX](https://katex.org/)) demonstrates the
effects on STEM material:

- The `\text{…}` words **scramble**, and ordinary variables and digits **mix
  positions** with each other (a full anagram across the equation).
- The visual modes (perception, wobble, blur, b/d/p/q flips, letter fragments)
  distort the math letters too.
- Structural pieces — fractions, large operators (∑, ∫), square roots, stretchy
  delimiters — are **left intact**, so the equation keeps its shape. Crowding is
  never applied to math.
- Screen readers always receive the correct equation: only KaTeX’s visual layer
  is touched, never its MathML.

## Accessibility

The tool is built to WCAG 2.1 AA, because a tool about reading should be
readable:

- **The real text is never lost.** The visible, animated layer is `aria-hidden`;
  an off-screen, unaltered copy stays in the accessibility tree (and KaTeX’s
  MathML stays intact for the equation), so screen-reader users always get the
  correct content and never hear scrambled letters.
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
npm install
npm run dev      # start the Vite dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

The only runtime dependency is KaTeX, bundled locally (no CDN), which keeps the
page content-security-policy clean.

## The bookmarklet

The **Take it to any page** section generates a one-click bookmarklet. It applies
**only the original Letter scramble** (typoglycemia) to any site — the behaviour
of the 2016 demo — because the other effects can’t be applied safely to arbitrary
pages. Click it once to start, again to stop. Some sites block bookmarklets with
a strict content-security-policy.

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
    mathSimulator.ts      # renders + simulates a KaTeX equation
  ui/
    controls.ts           # the control panel
    bookmarklet.ts        # bookmarklet generator
    themeToggle.ts        # fixed day/night toggle
    announce.ts           # screen-reader live region
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

## License

[MIT](LICENSE). The original demo carries no explicit license; this fork credits
Victor Widell as the originator of the core idea.
