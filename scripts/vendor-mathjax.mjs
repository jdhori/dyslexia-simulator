#!/usr/bin/env node
// Copy the two MathJax builds the page uses, and MathJax 4's default font,
// out of node_modules into public/vendor/, so the app serves them itself.
//
//   node scripts/vendor-mathjax.mjs             # into public/vendor/
//   node scripts/vendor-mathjax.mjs --out <dir> # anywhere else
//
// It runs before every `npm run build` and `npm run dev` (the prebuild and
// predev scripts), and public/vendor/ is git-ignored: the npm packages, pinned
// to exact versions in package.json, are the source of truth.
//
// WHY: the page used to load MathJax 2.7.7 from cdnjs and MathJax 4 from
// jsDelivr, and MathJax 4 then fetched its font and its speech engine's data
// from jsDelivr too. A site that serves the app under a content security
// policy with no external script origins (script-src 'self') broke two of the
// three maths displays, and every visit told two CDNs about it. Now the page
// makes no request to any other origin.
//
// WHAT: only what the page can load, not the whole packages (about 140 MB
// between them). The lists below are deliberate; each leaves something out:
//
// MathJax 2.7.7 (TeX input, SVG output, the menu, zoom and AssistiveMML):
//   - its TeX fonts only. The menu's Font Preference list is hidden by
//     default, so STIX, Asana, Gyre, Latin Modern and Neo Euler never load.
//   - every output the menu's Math Renderer list can switch to (HTML-CSS,
//     Common HTML, Preview HTML, MathML, SVG, Plain Source), since the page
//     tells readers to use that list. HTML-CSS and Common HTML get the woff
//     fonts: their @font-face rules name woff first, and every browser that
//     runs this app reads woff, so the eot and svg copies and the png image
//     fonts are left out. The MathML renderer is the exception: its
//     @font-face rules name six otf files and nothing else, so those six are
//     copied and the rest of the otf folder is not.
//   - the menu's Accessibility tools (Collapsible Math, Auto Collapse,
//     Explorer). Their speech engine (SRE 2) loads the rules for every
//     language it knows as it starts, English and Spanish, so both are
//     copied; the Internet Explorer bundle of the same rules is not.
//   - no translations of the menu itself: the page is English, and its
//     menu's Language list is hidden (src/engine/mathjaxLoader.ts) so no
//     other locale is asked for.
//   - no unpacked sources, tests, or TeX extensions the page's equation and
//     the combined configuration do not already cover.
//
// MathJax 4 (tex-mml-chtml, menu off):
//   - the one combined component the page loads, its speech worker and the
//     speech rule maps for English and Nemeth braille (MathJax 4 generates
//     speech and braille by default; other locales need the menu, which is
//     off).
//   - its default font, mathjax-newcm, as CommonHTML woff2 files and the
//     glyph-range scripts that MathJax 4 loads on demand. The SVG-output
//     copy and the CommonJS/ES module builds are left out.
//
// LICENCES: each copy keeps MathJax's LICENSE (Apache License 2.0), which
// covers MathJax's code. The fonts are under their own licences, which each
// font file names in its name table but neither npm package ships as text:
// MathJax 2.7.7's TeX fonts are Design Science's, under the SIL Open Font
// License 1.1, and MathJax 4's New Computer Modern font is Antonis
// Tsolomitis's, under the GUST Font License (which builds on the LPPL 1.3c).
// Those texts are kept in licenses/ and copied beside the fonts they cover;
// test/vendor-mathjax.test.mjs reads every copied font to check it.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The otf fonts MathJax 2.7.7's MathML renderer names in its @font-face rules. */
export const NATIVE_MML_OTF = Object.freeze([
  "MathJax_AMS-Regular.otf",
  "MathJax_Caligraphic-Bold.otf",
  "MathJax_Caligraphic-Regular.otf",
  "MathJax_Fraktur-Bold.otf",
  "MathJax_Fraktur-Regular.otf",
  "MathJax_Script-Regular.otf",
]);

/**
 * What to copy from each package. `copy` lists files and folders, relative to
 * the package; `skip` drops paths inside a copied folder (tested against the
 * forward-slash path relative to the package); `fontLicences` maps a file in
 * this repository's licenses/ folder to where it goes in the copy.
 */
export const PACKAGES = Object.freeze([
  {
    name: "mathjax2",
    dependency: "mathjax2",
    dest: "mathjax2",
    copy: [
      "LICENSE",
      "MathJax.js",
      "config/TeX-MML-AM_SVG.js",
      "extensions",
      "jax/element",
      "jax/input",
      "jax/output/SVG",
      "jax/output/HTML-CSS",
      "jax/output/CommonHTML",
      "jax/output/PreviewHTML",
      "jax/output/NativeMML",
      "jax/output/PlainSource",
      "fonts/HTML-CSS/TeX/woff",
      ...NATIVE_MML_OTF.map((font) => `fonts/HTML-CSS/TeX/otf/${font}`),
    ],
    // Design Science's TeX fonts name the SIL Open Font License 1.1.
    fontLicences: { "licenses/MathJax-TeX-fonts-OFL-1.1.txt": "fonts/OFL.txt" },
    skip: [
      // Font families other than TeX, for every output.
      /^jax\/output\/[^/]+\/fonts\/(?!TeX(\/|$))/,
      // TeX extensions beyond the ones the combined configuration bundles.
      /^extensions\/TeX\//,
      // Internet Explorer's single-file copy of the speech rules.
      /^extensions\/a11y\/mathmaps\/mathmaps_ie\.js$/,
    ],
  },
  {
    name: "mathjax4",
    dependency: "mathjax4",
    dest: "mathjax4",
    copy: [
      "LICENSE",
      "tex-mml-chtml.js",
      "sre/speech-worker.js",
      "sre/mathmaps/base.json",
      "sre/mathmaps/en.json",
      "sre/mathmaps/nemeth.json",
    ],
    skip: [],
  },
  {
    name: "mathjax-newcm-font",
    dependency: "@mathjax/mathjax-newcm-font",
    dest: "mathjax-newcm-font",
    // The package ships no LICENSE file of its own. Its package.json says
    // Apache-2.0, the licence of its scripts (chtml/dynamic/), the same as
    // MathJax 4's, whose text is copied as LICENSE. The woff2 fonts name the
    // GUST Font License instead, which builds on the LPPL 1.3c.
    copy: ["chtml/woff2", "chtml/dynamic"],
    licenceFrom: { dependency: "mathjax4", file: "LICENSE" },
    fontLicences: {
      "licenses/MathJax-NewCM-GUST-FONT-LICENSE.txt": "GUST-FONT-LICENSE.txt",
      "licenses/LPPL-1.3c.txt": "LPPL-1.3c.txt",
    },
    skip: [],
  },
]);

/** The exact version package.json pins for a dependency ("npm:x@1.2.3" or "1.2.3"). */
function pinnedVersion(dependency) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const spec = pkg.devDependencies?.[dependency];
  if (!spec) throw new Error(`${dependency} is not a devDependency in package.json`);
  const version = spec.replace(/^npm:[^@]+@/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${dependency} must be pinned to an exact version, not "${spec}"`);
  }
  return version;
}

/** The installed package's folder, after checking it is the pinned version. */
function installed(dependency) {
  const dir = path.join(ROOT, "node_modules", dependency);
  const manifest = path.join(dir, "package.json");
  if (!existsSync(manifest)) {
    throw new Error(`node_modules/${dependency} is missing; run npm ci first`);
  }
  const { version } = JSON.parse(readFileSync(manifest, "utf8"));
  const pinned = pinnedVersion(dependency);
  if (version !== pinned) {
    throw new Error(`node_modules/${dependency} is ${version}, but package.json pins ${pinned}; run npm ci`);
  }
  return { dir, version };
}

/** Bytes and file count under `dir`. */
function measure(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files++;
    bytes += statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size;
  }
  return { bytes, files };
}

/**
 * Copy every package's files into `out`, replacing any earlier copy.
 *
 * @returns {{ bytes: number, files: number, versions: Record<string, string>,
 *   packages: Record<string, { bytes: number, files: number }> }}
 */
export function vendorMathJax({ out = path.join(ROOT, "public", "vendor"), quiet = false } = {}) {
  const report = { bytes: 0, files: 0, versions: {}, packages: {} };
  for (const { name, dependency, dest, copy, skip, licenceFrom, fontLicences = {} } of PACKAGES) {
    const { dir, version } = installed(dependency);
    const target = path.join(out, dest);
    rmSync(target, { recursive: true, force: true });
    for (const item of copy) {
      const from = path.join(dir, item);
      if (!existsSync(from)) throw new Error(`${dependency}@${version} has no ${item}`);
      cpSync(from, path.join(target, item), {
        recursive: true,
        filter: (source) => {
          const relative = path.relative(dir, source).split(path.sep).join("/");
          return !skip.some((pattern) => pattern.test(relative));
        },
      });
    }
    if (licenceFrom) {
      const { dir: licenceDir } = installed(licenceFrom.dependency);
      cpSync(path.join(licenceDir, licenceFrom.file), path.join(target, "LICENSE"));
    }
    for (const [from, to] of Object.entries(fontLicences)) {
      const source = path.join(ROOT, from);
      if (!existsSync(source)) throw new Error(`${from} is missing; it is the licence of ${dependency}'s fonts`);
      cpSync(source, path.join(target, to));
    }
    const size = measure(target);
    report.packages[name] = size;
    report.versions[name] = version;
    report.bytes += size.bytes;
    report.files += size.files;
    if (!quiet) {
      console.log(`[vendor] ${dependency}@${version} -> ${path.relative(ROOT, target) || target} (${size.files} files, ${(size.bytes / 1024 / 1024).toFixed(2)} MB)`);
    }
  }
  if (!quiet) {
    console.log(`[vendor] MathJax total: ${report.files} files, ${(report.bytes / 1024 / 1024).toFixed(2)} MB`);
  }
  return report;
}

// Run as a script (not when a test imports it).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const at = process.argv.indexOf("--out");
  const out = at > -1 ? path.resolve(process.argv[at + 1]) : undefined;
  if (out) mkdirSync(out, { recursive: true });
  try {
    vendorMathJax({ out });
  } catch (error) {
    console.error(`[vendor] ${error.message}`);
    process.exit(1);
  }
}
