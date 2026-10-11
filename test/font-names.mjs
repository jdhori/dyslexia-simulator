// Read the copyright and licence strings a font file carries in its own name
// table, for the test that checks each vendored font ships with the text of
// the licence it names. Handles the three formats the vendor/ copy holds:
// plain OpenType (otf), WOFF (zlib per table) and WOFF2 (one Brotli stream).
//
// Only what the test needs: no glyph data is decoded, and a WOFF2 font
// collection (flavor "ttcf") is refused rather than half-read.
import { brotliDecompressSync, inflateSync } from "node:zlib";

/** Name IDs this module reads: 0 copyright, 13 licence description, 14 licence URL. */
export const NAME_IDS = Object.freeze({ copyright: 0, licence: 13, licenceUrl: 14 });

/** WOFF2's table tags by index, as far as the transformed tables (glyf 10, loca 11, hmtx 3) and name (5). */
const WOFF2_KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca"];

const tagAt = (bytes, offset) => bytes.toString("latin1", offset, offset + 4);

/** The `name` table of a plain sfnt (otf or ttf), or null. */
function sfntNameTable(bytes) {
  const numTables = bytes.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (tagAt(bytes, record) === "name") {
      const offset = bytes.readUInt32BE(record + 8);
      const length = bytes.readUInt32BE(record + 12);
      return bytes.subarray(offset, offset + length);
    }
  }
  return null;
}

/** The `name` table of a WOFF file, inflated if it was compressed, or null. */
function woffNameTable(bytes) {
  const numTables = bytes.readUInt16BE(12);
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    if (tagAt(bytes, entry) === "name") {
      const offset = bytes.readUInt32BE(entry + 4);
      const compLength = bytes.readUInt32BE(entry + 8);
      const origLength = bytes.readUInt32BE(entry + 12);
      const data = bytes.subarray(offset, offset + compLength);
      return compLength < origLength ? inflateSync(data) : data;
    }
  }
  return null;
}

/** WOFF2's UIntBase128: up to five bytes, seven bits each, high bit = more. */
function readBase128(bytes, at) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = bytes[at.offset++];
    if (i === 0 && byte === 0x80) throw new Error("WOFF2: UIntBase128 with a leading zero");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("WOFF2: UIntBase128 longer than five bytes");
}

/** The `name` table of a WOFF2 file (never transformed), or null. */
function woff2NameTable(bytes) {
  if (tagAt(bytes, 4) === "ttcf") throw new Error("WOFF2 font collections are not supported");
  const numTables = bytes.readUInt16BE(12);
  const totalCompressedSize = bytes.readUInt32BE(20);
  const at = { offset: 48 };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = bytes[at.offset++];
    const index = flags & 0x3f;
    let tag;
    if (index === 0x3f) {
      tag = tagAt(bytes, at.offset);
      at.offset += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[index] ?? `#${index}`;
    }
    const version = flags >> 6;
    const origLength = readBase128(bytes, at);
    // glyf and loca are transformed unless version 3; every other table is
    // transformed unless version 0. Only a transformed table has a second length.
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    const storedLength = transformed ? readBase128(bytes, at) : origLength;
    tables.push({ tag, storedLength });
  }
  const stream = brotliDecompressSync(bytes.subarray(at.offset, at.offset + totalCompressedSize));
  let offset = 0;
  for (const { tag, storedLength } of tables) {
    if (tag === "name") return stream.subarray(offset, offset + storedLength);
    offset += storedLength;
  }
  return null;
}

/** Decode one name record's string: UTF-16BE for Unicode and Windows, Latin-1 for Macintosh. */
function decodeName(raw, platformID) {
  if (platformID === 1) return raw.toString("latin1");
  const swapped = Buffer.from(raw);
  swapped.swap16();
  return swapped.toString("utf16le");
}

/**
 * The strings a font names for each of `NAME_IDS`, one per name ID (the first
 * non-blank record wins; Windows English records are preferred).
 *
 * @param {Buffer} bytes an otf, ttf, woff or woff2 file
 * @returns {{ copyright: string, licence: string, licenceUrl: string }}
 */
export function fontNames(bytes) {
  const signature = tagAt(bytes, 0);
  const table =
    signature === "wOFF" ? woffNameTable(bytes)
    : signature === "wOF2" ? woff2NameTable(bytes)
    : sfntNameTable(bytes);
  if (!table) throw new Error("the font has no name table");
  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);
  const found = {};
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    const platformID = table.readUInt16BE(record);
    const languageID = table.readUInt16BE(record + 4);
    const nameID = table.readUInt16BE(record + 6);
    const length = table.readUInt16BE(record + 8);
    const offset = table.readUInt16BE(record + 10);
    const text = decodeName(table.subarray(stringOffset + offset, stringOffset + offset + length), platformID).trim();
    if (!text) continue;
    const preferred = platformID === 3 && languageID === 0x409;
    if (!(nameID in found) || preferred) found[nameID] = text;
  }
  return {
    copyright: found[NAME_IDS.copyright] ?? "",
    licence: found[NAME_IDS.licence] ?? "",
    licenceUrl: found[NAME_IDS.licenceUrl] ?? "",
  };
}
