// The colour-vision section: its three sample images and what the page says
// about its filters.
//
// Two images, the test plates and the charts, are drawn by
// scripts/draw-colorblind-images.mjs, so the project owns them outright.
// These tests keep the committed files equal to what the script draws, keep
// them plain pictures (no script, nothing fetched), and check, with the
// page's own matrices, that the colours do what the captions claim: each
// plate's number vanishes under the filters it is meant to vanish under and
// stays under the rest, and the chart's series merge.
//
// The third is a photograph of the 2015 Jets vs Bills "Color Rush" game: a
// USA TODAY Sports Images (USATSI) photograph, as published by CBS Sports in
// John Breech's article of 12 November 2015, which credits it to USATSI. It is
// shown as fair use, for education and commentary about colour-vision
// accessibility (17 U.S.C. section 107), with no licence claimed, and these
// tests keep its credit honest: the file is the one the credit describes, the
// credit under it says what it shows, whose it is and on what basis it is
// used, the article is listed under References at the end of the page, and
// nothing claims a licence or names a photographer the source does not.
//
// Run with `npm test` (Node 22.18 or later runs the TypeScript directly).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATRICES } from "../src/engine/colorVisionMatrices.ts";
import { CHART_SERIES, IMAGES, PLATES } from "../scripts/draw-colorblind-images.mjs";
import { deltaE, simulate } from "./colour-math.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COLORBLIND = path.join(ROOT, "public", "colorblind");
const indexHtml = readFileSync(path.join(ROOT, "index.html"), "utf8");
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
const KINDS = Object.keys(MATRICES);
const VIEWS = ["none", ...KINDS];

/**
 * The photograph, and the sha256 of the file first committed in 5a91c66. Its
 * credit (under it, in the page's credits and in the README) describes this
 * exact file; a different photo needs a credit of its own, so it fails here.
 */
const PHOTO = "football.webp";
const PHOTO_SHA256 = "85501c07921c2c24c26304757351db4600ff77b17fb90fb72efa3e3a999a3752";

/** The photograph's source: the CBS Sports article that published it, credited there to USATSI. */
const SOURCE = Object.freeze({
  url: "https://www.cbssports.com/nfl/news/look-bills-jets-game-is-complete-torture-for-color-blind-people/",
  headline: "LOOK: Bills-Jets game is complete torture for color-blind people",
});
const SOURCE_HREF = new RegExp(`<a\\s+href="${SOURCE.url.replace(/[.?]/g, "\\$&")}"`);

/** The gallery's images, in the order it shows them. */
const GALLERY = ["plates.svg", "charts.svg", PHOTO];

/**
 * At or below SAME (CIE76), two colours read as one in a field of dots that
 * mixes light and dark shades; at or above SEEN, as plainly different.
 */
const SAME = 7;
const SEEN = 20;

/** Markup reduced to its words, for matching prose across line breaks (tags drop out, as in reading). */
const words = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Wording that would claim a licence, or name an author the source does not:
 * CBS Sports credits the photograph to USATSI alone, so no credit here may
 * name a photographer (a "photo by" line, a "Name-USA TODAY Sports" byline).
 */
const CLAIMS = /\blicen[cs]ed\b|\bunder (?:the |a |an )?(?:[\w-]+ )?licen[cs]e\b|creative commons|\bCC[ -]BY\b|public domain|©|\(c\)|courtesy of|photo(?:graph)? by|\bphotographer\b|[-–/] ?USA TODAY Sports/i;

/** The credit's own words for whose photograph it is, and how it came to be used. */
const RIGHTS_HOLDER = /USA TODAY Sports Images \(USATSI\) photograph, as published by CBS Sports/;

/** The gallery's markup. */
const gallery = /<div class="cvd-gallery"[\s\S]*?\n {8}<\/div>/.exec(indexHtml)?.[0] ?? "";

/** Every <img> in the gallery, with its attributes. */
const galleryImages = [...gallery.matchAll(/<img\b([\s\S]*?)\/?>/g)].map(([, attrs]) =>
  Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])));

/** The <figure> that shows the photograph. */
const photoFigure = gallery.split(/(?=<figure\b)/).find((part) => part.includes(`/colorblind/${PHOTO}`)) ?? "";

/** [width, height] of a WebP, from its VP8X, VP8 or VP8L header. */
function webpSize(bytes) {
  assert.equal(bytes.toString("latin1", 0, 4), "RIFF");
  assert.equal(bytes.toString("latin1", 8, 12), "WEBP");
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  throw new Error(`not a WebP image chunk: ${chunk}`);
}

/** The names of a WebP's top-level chunks, in order. */
function webpChunks(bytes) {
  const chunks = [];
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(at + 4);
    chunks.push(bytes.toString("latin1", at, at + 4));
    at += 8 + size + (size & 1);
  }
  return chunks;
}

/** [width, height] of a gallery image, as strings, read from the file itself. */
function imageSize(file) {
  const bytes = readFileSync(path.join(COLORBLIND, file));
  if (file.endsWith(".svg")) {
    const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(bytes.toString("utf8"));
    return [width, height];
  }
  return webpSize(bytes).map(String);
}

/** The smallest difference, under `view`, between any colour of `a` and any of `b`. */
const closest = (a, b, view) => Math.min(...a.flatMap((x) => b.map((y) => deltaE(simulate(x, view), simulate(y, view)))));

/** The largest distance, under `view`, from a colour of `a` to its nearest twin in `b`. */
const worstTwin = (a, b, view) => Math.max(...a.map((x) => Math.min(...b.map((y) => deltaE(simulate(x, view), simulate(y, view))))));

describe("the sample images (public/colorblind/)", () => {
  test("are the two drawings and the photograph, and the gallery shows each, in order", () => {
    assert.deepEqual(Object.keys(IMAGES), GALLERY.filter((file) => file !== PHOTO));
    assert.deepEqual(readdirSync(COLORBLIND).sort(), [...GALLERY].sort());
    assert.deepEqual(galleryImages.map((img) => img.src), GALLERY.map((file) => `/colorblind/${file}`));
  });

  test("the drawings are what scripts/draw-colorblind-images.mjs draws (run it after changing it)", () => {
    for (const [file, draw] of Object.entries(IMAGES)) {
      assert.equal(readFileSync(path.join(COLORBLIND, file), "utf8"), draw(), `${file} is out of date`);
    }
  });

  test("the drawings are plain pictures: no script, no link, nothing fetched", () => {
    for (const file of Object.keys(IMAGES)) {
      const svg = readFileSync(path.join(COLORBLIND, file), "utf8");
      assert.doesNotMatch(svg, /<script|<foreignObject|<image|<use|\bon[a-z]+=|href=|url\(|@import|<!ENTITY/i, file);
    }
  });

  test("each <img> gives the image's own size, so the page does not shift as it loads", () => {
    for (const img of galleryImages) {
      const [width, height] = imageSize(path.basename(img.src));
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

describe("the charts", () => {
  test("the chart's series differ in typical vision, and two merge under each red–green view", () => {
    const colours = CHART_SERIES.map((s) => s.colour);
    const pairs = colours.flatMap((a, i) => colours.slice(i + 1).map((b) => [a, b]));
    for (const [a, b] of pairs) assert.ok(deltaE(simulate(a, "none"), simulate(b, "none")) >= 35, `${a} and ${b} are too alike`);
    for (const view of ["protanopia", "deuteranopia", "achromatopsia"]) {
      const nearest = Math.min(...pairs.map(([a, b]) => deltaE(simulate(a, view), simulate(b, view))));
      assert.ok(nearest <= SAME, `${view}: no two series merge (closest ${nearest.toFixed(1)})`);
    }
  });
});

describe("the photograph (public/colorblind/football.webp)", () => {
  const bytes = readFileSync(path.join(COLORBLIND, PHOTO));

  test("is the file its credit describes, byte for byte (first committed in 5a91c66)", () => {
    assert.equal(createHash("sha256").update(bytes).digest("hex"), PHOTO_SHA256);
  });

  test("carries no embedded metadata (no EXIF or XMP): its source is the CBS Sports article, not the file", () => {
    // The README says so; if a replacement carries a byline or a rights link,
    // that is the credit to give.
    const chunks = webpChunks(bytes);
    assert.ok(chunks.includes("VP8 ") || chunks.includes("VP8L"), `no image data in ${chunks.join(", ")}`);
    assert.deepEqual(chunks.filter((chunk) => chunk === "EXIF" || chunk === "XMP "), []);
  });

  test("its alt text says what a sighted visitor sees: the 2015 Jets vs Bills game, all green against all red", () => {
    const alt = galleryImages.find((img) => img.src.endsWith(`/${PHOTO}`)).alt;
    assert.match(alt, /^A moment from the 2015 Jets vs Bills game: /);
    assert.match(alt, /\bgreen\b/);
    assert.match(alt, /\ball-red\b/);
    assert.doesNotMatch(alt, /^(?:image|photo|picture) of/i);
  });

  test("its caption is about the uniforms many red–green colour-blind viewers could not tell apart", () => {
    const caption = words(/<figcaption>([\s\S]*?)<small\b/.exec(photoFigure)?.[1] ?? "");
    assert.match(caption, /^Red versus green\. /);
    assert.match(caption, /“Color Rush” uniforms/);
    assert.match(caption, /many red–green colour-blind viewers could not tell apart/);
  });

  test("has a visible credit under it: what it shows, whose it is (USATSI, via CBS Sports), and fair use", () => {
    const small = /<small class="cvd-credit"[^>]*>([\s\S]*?)<\/small>/.exec(photoFigure);
    assert.ok(small, "no <small class=\"cvd-credit\"> in the photograph's figure");
    assert.match(photoFigure, /<figcaption>[\s\S]*<small class="cvd-credit"[\s\S]*<\/figcaption>/, "the credit belongs in the figure's caption");
    const credit = words(small[1]);
    assert.match(credit, /^Photo: the New York Jets \(green\) and the Buffalo Bills \(red\), 12 November 2015\. /);
    assert.match(credit, RIGHTS_HOLDER);
    // It links to the article, named by its headline.
    const link = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/.exec(small[1]);
    assert.equal(link?.[1], SOURCE.url);
    assert.equal(words(link[2]), `“${SOURCE.headline}”`);
    assert.match(credit, /for education and commentary about colour-vision accessibility, as fair use \(17 U\.S\.C\. § 107\); no licence is claimed\.$/);
    assert.match(small[1], /<a href="https:\/\/www\.copyright\.gov\/title17\/92chap1\.html#107"/);
    assert.doesNotMatch(credit, /not identified/, "the source names the rights holder now");
    assert.doesNotMatch(credit, CLAIMS);
  });

  test("the page's credits and the README's credit it in the same terms, and claim no licence for it", () => {
    const pageCredits = /<section id="credits"[\s\S]*?<\/section>/.exec(indexHtml)?.[0] ?? "";
    const pageItem = words([...pageCredits.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]).find((li) => li.includes("Color Rush")) ?? "");
    const readmeCredits = /## Credits & sources\n([\s\S]*?)\n## /.exec(readme)?.[1] ?? "";
    const readmeItem = readmeCredits.split("\n### References")[0].split(/\n(?=- )/).find((item) => item.includes(PHOTO))?.replace(/\s+/g, " ") ?? "";
    for (const [name, text] of [["index.html credits", pageItem], ["README credits", readmeItem]]) {
      assert.match(text, /New York Jets \(green\) and the Buffalo Bills \(red\)/, name);
      assert.match(text, /12 November 2015/, name);
      assert.match(text, RIGHTS_HOLDER, name);
      assert.match(text, /in the article listed under \[?References\b/, name);
      assert.match(text, /education and commentary about colour-vision accessibility, as fair use/, name);
      assert.match(text, /17 U\.S\.C\. § 107/, name);
      assert.match(text, /no licence is claimed/i, name);
      assert.doesNotMatch(text, /not identified/, name);
      assert.doesNotMatch(text, CLAIMS, name);
    }
    // The repository's MIT licence is the project's to give; the photo is not.
    assert.match(readmeItem, /the repository’s MIT licence does not cover it/);
    const licence = /## License\n([\s\S]*?)(?:\n## |$)/.exec(readme)?.[1].replace(/\s+/g, " ") ?? "";
    assert.match(licence, /except the colour-vision photograph, a USA TODAY Sports Images \(USATSI\) photograph shown as fair use/);
    assert.match(licence, /no licence is claimed for it/);
    assert.doesNotMatch(licence, CLAIMS);
  });
});

describe("the References at the end of the page", () => {
  /** "“Headline”, CBS Sports, John Breech, 12 November 2015." with the headline linking to the article. */
  const CITATION = new RegExp(
    `^“${SOURCE.headline}”, CBS Sports, John Breech, 12 November 2015\\. `,
  );

  test("close the page: a References list is the last thing in the credits, the last section of <main>", () => {
    const end = /<h3 class="credits-subheading">References<\/h3>\s*<ul class="credits">([\s\S]*?)<\/ul>\s*<\/section>\s*<\/main>/.exec(indexHtml);
    assert.ok(end, "no References list closing the credits section at the end of <main>");
    const items = [...end[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    const cbs = items.find((item) => item.includes(SOURCE.url));
    assert.ok(cbs, "the CBS Sports article is not in the References");
    assert.match(cbs, SOURCE_HREF);
    const link = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/.exec(cbs);
    assert.equal(words(link[1]), `“${SOURCE.headline}”`, "the headline is the link text");
    assert.match(words(cbs), CITATION);
    assert.match(words(cbs), /The source of the colour-vision photograph\.$/);
  });

  test("the README lists the same reference under its credits", () => {
    const references = /\n### References\n([\s\S]*?)\n## /.exec(readme)?.[1] ?? "";
    const item = references.split(/\n(?=- )/).find((entry) => entry.includes(SOURCE.url))?.replace(/\s+/g, " ") ?? "";
    assert.ok(item, "the CBS Sports article is not in the README's References");
    assert.ok(readme.indexOf("\n### References\n") > readme.indexOf("## Credits & sources\n"), "References belong under Credits & sources");
    assert.ok(item.startsWith(`- [“${SOURCE.headline}”](${SOURCE.url}), CBS Sports, John Breech, 12 November 2015.`), item);
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
