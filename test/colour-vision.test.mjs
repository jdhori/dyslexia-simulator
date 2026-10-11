// The colour-vision section: its three sample images and what the page says
// about its filters.
//
// The images are drawn by scripts/draw-colorblind-images.mjs, so the project
// owns them outright (the section used to show three images with no recorded
// source or licence, an agency's NFL photograph among them). These tests keep
// the committed files equal to what the script draws, keep them plain
// pictures (no script, nothing fetched), and check, with the page's own
// matrices, that the colours do what the captions claim: each plate's number
// vanishes under the filters it is meant to vanish under and stays under the
// rest, and the chart's series and the two teams' kits merge.
//
// Run with `npm test` (Node 22.18 or later runs the TypeScript directly).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATRICES } from "../src/engine/colorVisionMatrices.ts";
import { CHART_SERIES, IMAGES, PLATES, TEAMS } from "../scripts/draw-colorblind-images.mjs";
import { deltaE, simulate } from "./colour-math.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COLORBLIND = path.join(ROOT, "public", "colorblind");
const indexHtml = readFileSync(path.join(ROOT, "index.html"), "utf8");
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
const KINDS = Object.keys(MATRICES);
const VIEWS = ["none", ...KINDS];

/**
 * At or below SAME (CIE76), two colours read as one in a field of dots that
 * mixes light and dark shades; at or above SEEN, as plainly different.
 */
const SAME = 7;
const SEEN = 20;

/** Every <img> in the gallery, with its attributes. */
const galleryImages = (() => {
  const gallery = /<div class="cvd-gallery"[\s\S]*?\n {8}<\/div>/.exec(indexHtml)?.[0] ?? "";
  return [...gallery.matchAll(/<img\b([\s\S]*?)\/?>/g)].map(([, attrs]) =>
    Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])));
})();

/** The smallest difference, under `view`, between any colour of `a` and any of `b`. */
const closest = (a, b, view) => Math.min(...a.flatMap((x) => b.map((y) => deltaE(simulate(x, view), simulate(y, view)))));

/** The largest distance, under `view`, from a colour of `a` to its nearest twin in `b`. */
const worstTwin = (a, b, view) => Math.max(...a.map((x) => Math.min(...b.map((y) => deltaE(simulate(x, view), simulate(y, view))))));

describe("the sample images (public/colorblind/)", () => {
  test("are exactly the three drawings, and the gallery shows each", () => {
    assert.deepEqual(readdirSync(COLORBLIND).sort(), Object.keys(IMAGES).sort());
    assert.deepEqual(
      galleryImages.map((img) => img.src),
      Object.keys(IMAGES).map((file) => `/colorblind/${file}`),
    );
  });

  test("are what scripts/draw-colorblind-images.mjs draws (run it after changing it)", () => {
    for (const [file, draw] of Object.entries(IMAGES)) {
      assert.equal(readFileSync(path.join(COLORBLIND, file), "utf8"), draw(), `${file} is out of date`);
    }
  });

  test("are plain pictures: no script, no link, nothing fetched", () => {
    for (const file of Object.keys(IMAGES)) {
      const svg = readFileSync(path.join(COLORBLIND, file), "utf8");
      assert.doesNotMatch(svg, /<script|<foreignObject|<image|<use|\bon[a-z]+=|href=|url\(|@import|<!ENTITY/i, file);
    }
  });

  test("each <img> gives the drawing's own size, so the page does not shift as it loads", () => {
    for (const img of galleryImages) {
      const svg = readFileSync(path.join(ROOT, "public", img.src), "utf8");
      const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      assert.equal(img.width, width, img.src);
      assert.equal(img.height, height, img.src);
      assert.ok(img.alt && img.alt.length > 40, `${img.src} needs a full description`);
    }
  });
});

describe("the plates", () => {
  test("the plates image's alt text names every hidden number, in order", () => {
    const alt = galleryImages.find((img) => img.src.endsWith("/plates.svg")).alt;
    assert.equal(PLATES.length, 6);
    assert.match(alt, /^Six /);
    assert.deepEqual(alt.match(/\b\d+\b/g), PLATES.map((p) => p.number));
  });

  for (const [index, plate] of PLATES.entries()) {
    test(`plate ${index + 1} (${plate.number}) vanishes under ${plate.hiddenFrom.join(" and ") || "nothing"}, and shows under the rest`, () => {
      for (const view of VIEWS) {
        // Achromatopsia keeps lightness only: every plate whose figure and
        // ground are matched in lightness vanishes under it too.
        const hidden = plate.hiddenFrom.includes(view) || (view === "achromatopsia" && plate.hiddenFrom.length > 0);
        if (hidden) {
          assert.ok(worstTwin(plate.figure, plate.ground, view) <= SAME, `${view}: a figure colour has no twin in the ground`);
        } else {
          assert.ok(closest(plate.figure, plate.ground, view) >= SEEN, `${view}: figure and ground are too alike`);
        }
      }
    });
  }

  test("every plate's ground mixes light and dark dots, so lightness gives nothing away", () => {
    for (const plate of PLATES.filter((p) => p.hiddenFrom.length > 0)) {
      for (const colours of [plate.figure, plate.ground]) {
        assert.ok(colours.length >= 2, `${plate.number}: one shade only`);
      }
    }
  });

  test("the captions say which plates vanish for whom", () => {
    assert.ok(PLATES.some((p) => p.hiddenFrom.length === 0), "no plate everyone can see");
    const caption = /plates\.svg[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>/.exec(indexHtml)[1].replace(/\s+/g, " ");
    assert.match(caption, /protanopia and deuteranopia/);
    assert.match(caption, /tritanopia/);
    assert.match(caption, /everyone/);
  });
});

describe("the charts and the teams", () => {
  test("the chart's series differ in typical vision, and two merge under each red–green view", () => {
    const colours = CHART_SERIES.map((s) => s.colour);
    const pairs = colours.flatMap((a, i) => colours.slice(i + 1).map((b) => [a, b]));
    for (const [a, b] of pairs) assert.ok(deltaE(simulate(a, "none"), simulate(b, "none")) >= 35, `${a} and ${b} are too alike`);
    for (const view of ["protanopia", "deuteranopia", "achromatopsia"]) {
      const nearest = Math.min(...pairs.map(([a, b]) => deltaE(simulate(a, view), simulate(b, view))));
      assert.ok(nearest <= SAME, `${view}: no two series merge (closest ${nearest.toFixed(1)})`);
    }
  });

  test("the two kits are far apart in typical vision and the same khaki under deuteranopia", () => {
    const [red, green] = TEAMS.map((t) => t.colour);
    assert.ok(deltaE(simulate(red, "none"), simulate(green, "none")) >= 60);
    for (const view of ["deuteranopia", "achromatopsia"]) {
      assert.ok(deltaE(simulate(red, view), simulate(green, view)) <= SAME, view);
    }
  });
});

describe("what the page says about the filters", () => {
  test("the achromatopsia matrix is a plain greyscale, every row the same luma weights", () => {
    const m = MATRICES.achromatopsia;
    for (const row of [0, 3, 6]) assert.deepEqual(m.slice(row, row + 3), [0.299, 0.587, 0.114]);
  });

  test("credits Machado, Oliveira and Fernandes (2009) for three filters, not the greyscale one", () => {
    // Their paper models protan, deutan and tritan deficiencies; it has no
    // achromatopsia model, so no sentence may credit all four filters to it.
    for (const [name, text] of [["index.html", indexHtml], ["README.md", readme]]) {
      const flat = text.replace(/\s+/g, " ");
      assert.doesNotMatch(flat, /The filters are (?:SVG `feColorMatrix` versions of )?the Machado/, name);
      assert.match(flat, /protanopia, deuteranopia and tritanopia (?:filters|matrices)[^.]*Machado/i, name);
      assert.match(flat, /achromatopsia is a plain greyscale/i, name);
    }
  });
});
