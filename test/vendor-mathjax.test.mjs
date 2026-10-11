// The page loads both MathJax builds from its own folder (public/vendor/,
// filled by scripts/vendor-mathjax.mjs before every build and dev server), so
// it makes no request to any other origin and runs under a CSP of
// script-src 'self'. These tests keep it that way: the copy holds what the
// page needs and nothing it does not, at the pinned versions, and no source
// file points back at a CDN.
//
// Run with `npm test` (node --test; no extra dependencies).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_MML_OTF, PACKAGES, vendorMathJax } from "../scripts/vendor-mathjax.mjs";
import { fontNames } from "./font-names.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

/** Every file under `dir`, as forward-slash paths relative to it. */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join("/"),
    )
    .sort();
}

describe("scripts/vendor-mathjax.mjs", () => {
  let out;
  let report;
  let files;

  before(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "vendor-mathjax-"));
    report = vendorMathJax({ out, quiet: true });
    files = filesUnder(out);
  });
  after(() => rmSync(out, { recursive: true, force: true }));

  test("pins each package to the exact version package.json names", () => {
    for (const { name, dependency } of PACKAGES) {
      const spec = pkg.devDependencies[dependency];
      assert.ok(spec, `${dependency} is not a devDependency`);
      const version = spec.replace(/^npm:[^@]+@/, "");
      assert.match(version, /^\d+\.\d+\.\d+$/, `${dependency} must be pinned exactly, not "${spec}"`);
      const installed = JSON.parse(
        readFileSync(path.join(ROOT, "node_modules", dependency, "package.json"), "utf8"),
      );
      assert.equal(installed.version, version, `${name}: installed ${installed.version}, pinned ${version}`);
      assert.equal(report.versions[name], version);
    }
  });

  test("copies what MathJax 2.7.7 loads: the SVG demo, the menu's renderers and its accessibility tools", () => {
    for (const file of [
      "mathjax2/MathJax.js",
      "mathjax2/LICENSE",
      "mathjax2/config/TeX-MML-AM_SVG.js",
      "mathjax2/extensions/AssistiveMML.js",
      "mathjax2/extensions/a11y/explorer.js",
      "mathjax2/extensions/a11y/mathjax-sre.js",
      "mathjax2/jax/output/SVG/jax.js",
      "mathjax2/jax/output/SVG/fonts/TeX/fontdata.js",
      "mathjax2/jax/output/HTML-CSS/jax.js",
      "mathjax2/jax/output/CommonHTML/jax.js",
      "mathjax2/fonts/HTML-CSS/TeX/woff/MathJax_Main-Regular.woff",
      "mathjax2/jax/output/NativeMML/jax.js",
      "mathjax2/fonts/HTML-CSS/TeX/otf/MathJax_AMS-Regular.otf",
      "mathjax2/extensions/a11y/mathmaps/en/functions/algebra.js",
      "mathjax2/extensions/a11y/mathmaps/es/functions/algebra.js",
    ]) {
      assert.ok(files.includes(file), `${file} is missing`);
    }
  });

  test("copies exactly the otf fonts 2.7.7's MathML renderer names, and no others", () => {
    const nativeMML = readFileSync(path.join(ROOT, "node_modules/mathjax2/jax/output/NativeMML/jax.js"), "utf8");
    const named = [...new Set(nativeMML.match(/MathJax_[A-Za-z0-9-]+\.otf/g))].sort();
    assert.deepEqual([...NATIVE_MML_OTF].sort(), named);
    const copied = files.filter((f) => f.endsWith(".otf")).map((f) => path.posix.basename(f)).sort();
    assert.deepEqual(copied, named);
  });

  test("copies the speech rules for every language SRE 2 loads as it starts", () => {
    const shipped = readdirSync(path.join(ROOT, "node_modules/mathjax2/extensions/a11y/mathmaps"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(shipped, ["en", "es"]);
    for (const locale of shipped) {
      const source = filesUnder(path.join(ROOT, "node_modules/mathjax2/extensions/a11y/mathmaps", locale));
      const copied = filesUnder(path.join(out, "mathjax2/extensions/a11y/mathmaps", locale));
      assert.deepEqual(copied, source, `${locale} speech rules differ from the package's`);
    }
  });

  test("copies what MathJax 4 loads: its component, the speech worker and the default font", () => {
    for (const file of [
      "mathjax4/tex-mml-chtml.js",
      "mathjax4/LICENSE",
      "mathjax4/sre/speech-worker.js",
      "mathjax4/sre/mathmaps/base.json",
      "mathjax4/sre/mathmaps/en.json",
      "mathjax4/sre/mathmaps/nemeth.json",
      "mathjax-newcm-font/LICENSE",
    ]) {
      assert.ok(files.includes(file), `${file} is missing`);
    }
    assert.ok(files.some((f) => /^mathjax-newcm-font\/chtml\/woff2\/.+\.woff2$/.test(f)), "no woff2 font files");
    assert.ok(files.some((f) => /^mathjax-newcm-font\/chtml\/dynamic\/.+\.js$/.test(f)), "no dynamic font ranges");
  });

  test("leaves out what the page never loads", () => {
    const unused = [
      // Other font families, other font formats, and image fonts (the
      // MathML renderer's six otf files are checked above).
      /\/(STIX-Web|Asana-Math|Gyre-Pagella|Gyre-Termes|Latin-Modern|Neo-Euler)\//,
      /\.eot$/,
      /^mathjax2\/fonts\/HTML-CSS\/TeX\/(png|svg|eot)\//,
      // Menu translations (its Language list is hidden; the page is English),
      // and Internet Explorer's single-file copy of the speech rules.
      /^mathjax2\/localization\//,
      /^mathjax2\/extensions\/a11y\/mathmaps\/mathmaps_ie\.js$/,
      /^mathjax4\/sre\/mathmaps\/(?!(base|en|nemeth)\.json$)/,
      // Sources, tests and the outputs this page does not use.
      /^mathjax2\/(unpacked|test)\//,
      /^mathjax4\/(output\/svg|.*svg).*\.js$/,
      /^mathjax-newcm-font\/(svg|cjs|mjs|def)\//,
    ];
    const offenders = files.filter((file) => unused.some((pattern) => pattern.test(file)));
    assert.deepEqual(offenders, []);
  });

  test("reports the size it copied, and stays within budget", () => {
    const BUDGET = 12 * 1024 * 1024;
    assert.ok(report.bytes > 0);
    assert.ok(report.bytes < BUDGET, `vendored MathJax is ${report.bytes} B; the budget is ${BUDGET} B`);
    assert.equal(report.files, files.length);
  });

  // Each font file says in its own name table who holds it and under which
  // licence: MathJax 2.7.7's TeX fonts are Design Science's, under the SIL
  // Open Font License 1.1, and MathJax 4's New Computer Modern font is Antonis
  // Tsolomitis's, under the GUST Font License. Neither npm package ships those
  // texts, and OFL 1.1 asks every copy to carry its licence, so the vendor
  // script copies them from licenses/. A font that names no licence (MathJax
  // 2.7.7's two MathJax_Vector files) falls under its package's LICENSE.
  test("ships, beside every font, the text of the licence the font names", () => {
    const fonts = files.filter((f) => /\.(otf|ttf|woff2?)$/.test(f));
    assert.ok(fonts.length > 100, `only ${fonts.length} fonts found; the check would prove little`);
    /** The nearest file called `name` at or above `file`'s folder, inside its package. */
    const nearest = (file, name) => {
      const top = file.split("/")[0];
      for (let dir = path.posix.dirname(file); dir.startsWith(top); dir = path.posix.dirname(dir)) {
        if (files.includes(`${dir}/${name}`)) return `${dir}/${name}`;
      }
      return null;
    };
    const problems = [];
    for (const font of fonts) {
      const names = fontNames(readFileSync(path.join(out, font)));
      const named = `${names.copyright}\n${names.licence}\n${names.licenceUrl}`;
      const licence =
        /SIL Open Font License|scripts\.sil\.org\/OFL/i.test(named) ? "OFL.txt"
        : /GUST Font License/i.test(named) ? "GUST-FONT-LICENSE.txt"
        : /licen[cs]e/i.test(named) ? null
        : "LICENSE";
      if (!licence) {
        problems.push(`${font} names a licence this test does not know: ${named}`);
        continue;
      }
      const shipped = nearest(font, licence);
      if (!shipped) {
        problems.push(`${font} names ${licence}, but its copy has no ${licence}`);
        continue;
      }
      if (licence === "LICENSE") continue;
      // The licence text must carry the font's own copyright lines with it.
      const text = readFileSync(path.join(out, shipped), "utf8").replace(/,/g, "");
      for (const holder of named.match(/(?:Copyright \(c\)|\(C\)) \d{4}(?:-\d{4})?,? [^.(\n]+/gi) ?? []) {
        const who = holder.replace(/^(?:Copyright \(c\)|\(C\))\s*/i, "").replace(/,/g, "").trim();
        if (!text.includes(who)) problems.push(`${shipped} does not name "${who}" (from ${font})`);
      }
      const reserved = /Reserved Font Name ([\w-]+)/.exec(named);
      if (reserved && !text.includes(`Reserved Font Name ${reserved[1]}`)) {
        problems.push(`${shipped} does not reserve ${reserved[1]} (from ${font})`);
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });

  test("the font licences are the full texts, with the LPPL the GUST licence builds on", () => {
    const read = (file) => readFileSync(path.join(out, file), "utf8");
    assert.match(read("mathjax2/fonts/OFL.txt"), /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007[\s\S]*TERMINATION[\s\S]*DISCLAIMER/);
    const gust = read("mathjax-newcm-font/GUST-FONT-LICENSE.txt");
    assert.match(gust, /This is version 1\.0, dated 22 June 2009, of the GUST Font License/);
    assert.match(gust, /LaTeX Project Public License, either version 1\.3c/);
    assert.match(read("mathjax-newcm-font/LPPL-1.3c.txt"), /LPPL Version 1\.3c\s+2008-05-04[\s\S]*NO WARRANTY/);
    // The package's own scripts keep the licence its package.json declares.
    assert.match(read("mathjax-newcm-font/LICENSE"), /Apache License/);
  });

  test("replaces an earlier copy rather than adding to it", () => {
    const stale = path.join(out, "mathjax2", "stale.js");
    writeFileSync(stale, "// left over from an older MathJax\n");
    vendorMathJax({ out, quiet: true });
    assert.ok(!existsSync(stale), "a file from the earlier copy survived");
    assert.ok(existsSync(path.join(out, "mathjax2", "MathJax.js")));
  });
});

describe("no CDN in the app's own source", () => {
  const CDN = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|cdn\.mathjax\.org/;

  test("src/ and index.html name no CDN", () => {
    const sources = [
      "index.html",
      ...filesUnder(path.join(ROOT, "src")).map((file) => `src/${file}`),
    ];
    const offenders = sources.filter((file) => CDN.test(readFileSync(path.join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });

  test("the MathJax loader builds every URL from the app's own base", () => {
    const loader = readFileSync(path.join(ROOT, "src/engine/mathjaxLoader.ts"), "utf8");
    assert.doesNotMatch(loader, /["'`]https?:\/\//, "an absolute URL in the loader");
    assert.match(loader, /import\.meta\.env\.BASE_URL/);
  });
});

describe("the README's credits", () => {
  test("name each maths font's own licence, not only MathJax's", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    const credits = readme.slice(readme.indexOf("## Credits"));
    assert.match(credits, /Design Science[\s\S]*SIL Open\s+Font\s+License/);
    assert.match(credits, /Antonis\s+Tsolomitis[\s\S]*GUST\s+Font\s+License/);
    assert.doesNotMatch(credits, /New\s+Computer\s+Modern\s+font,\s+Apache/);
  });
});
