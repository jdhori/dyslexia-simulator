// What the page says about its maths displays and its bookmarklets, checked
// against what they do.
//
// Each of these sentences was once wrong in a way a reader could act on:
//   - the maths note said the scramble "garbles the words but leaves the
//     equation itself intact", while it mixes every letter and digit across
//     the equation, those in subscripts and superscripts included;
//   - display 1's label invited readers to change the renderer from
//     MathJax's menu, which left the demo unsimulated (on every later visit
//     too, as the menu saved the choice);
//   - the Dyslexia bookmarklet was offered beside promises that screen
//     readers always get the real text, while it rewrites the page's own text.
//
// Run with `npm test`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
/** Markup reduced to its words, for matching prose across line breaks. */
const words = (html) => html.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "’").replace(/\s+/g, " ");

const indexHtml = read("index.html");
const page = words(indexHtml);
const loader = read("src/engine/mathjaxLoader.ts");
const mathSimulator = read("src/engine/mathSimulator.ts");
const bookmarklet = read("src/ui/bookmarklet.ts");

describe("the maths section (index.html)", () => {
  test("describes the scramble as what it is: every letter and digit, sub- and superscripts included", () => {
    // mathSimulator.ts pools every <use> whose character is a letter or a
    // digit, wherever it sits, and swaps random pairs across the pool.
    assert.match(mathSimulator, /LETTER_RE\.test\(char\) \|\| \/\[0-9\]\/\.test\(char\)/);
    assert.doesNotMatch(page, /leaves the equation itself intact/);
    assert.doesNotMatch(page, /garbles the words but/);
    assert.match(page, /every letter and digit in the equation, the variables and the ones in subscripts and superscripts included, trades places/);
  });

  test("does not invite readers to change display 1's renderer, which the loader pins to SVG", () => {
    assert.match(loader, /MathMenu: \{[^}]*showRenderer: false/);
    assert.match(loader, /PINNED_MENU_SETTINGS = \["renderer", "showRenderer"\]/);
    const label = /MathJax 2\.7\.7, SVG output[\s\S]*?<\/p>/.exec(indexHtml)?.[0] ?? "";
    assert.ok(label, "display 1's label is missing");
    assert.doesNotMatch(words(label), /renderer, the zoom/);
    assert.match(words(label), /The renderer stays SVG/);
  });

  test("gives the Math Renderer advice for equations elsewhere, and says this menu leaves it out", () => {
    const note = words(/<p class="math-note">[\s\S]*?<\/p>/.exec(indexHtml)?.[0] ?? "");
    assert.match(note, /Math Settings → Math Renderer → HTML-CSS/);
    assert.match(note, /If an equation elsewhere/);
    assert.match(note, /This page leaves that item out of its own menu/);
  });
});

describe("the Dyslexia bookmarklet", () => {
  test("its note says screen readers and voice control get the scrambled text", () => {
    // buildPayload rewrites every text node's nodeValue: no aria-hidden layer.
    assert.match(bookmarklet, /\.nodeValue=/);
    const note = /title: "Dyslexia simulator",[\s\S]*?note: "([^"]*)"/.exec(bookmarklet)?.[1] ?? "";
    assert.match(note, /changes the page’s own text/);
    assert.match(note, /a screen reader reads the scrambled words/);
    assert.match(note, /voice commands stop matching/);
  });
});
