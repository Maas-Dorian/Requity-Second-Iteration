/**
 * Fail the build if any "cross dash" (non-ASCII dash) character appears in
 * source files. REQUITY copy must use normal punctuation (comma, colon, period,
 * parentheses) or a normal ASCII hyphen "-" only when grammatically needed.
 *
 * Forbidden code points (referenced by code point so THIS file never trips the
 * check on itself):
 *   U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
 *   U+2013 en dash, U+2014 em dash, U+2015 horizontal bar, U+2212 minus sign.
 *
 * The normal ASCII hyphen (U+002D) is allowed everywhere (slugs, URLs, CSS
 * class names, file names, IDs) and is NOT flagged.
 *
 * Usage: node scripts/check-no-cross-dashes.js   (npm run check:dashes)
 * Exit code 1 when any forbidden character is found.
 *
 * ESM module (package.json has "type": "module").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const FORBIDDEN = new Map([
  [0x2010, "U+2010 hyphen"],
  [0x2011, "U+2011 non-breaking hyphen"],
  [0x2012, "U+2012 figure dash"],
  [0x2013, "U+2013 en dash"],
  [0x2014, "U+2014 em dash"],
  [0x2015, "U+2015 horizontal bar"],
  [0x2212, "U+2212 minus sign"],
]);

const SCAN_EXTENSIONS = new Set([".html", ".js", ".ts", ".css", ".json", ".md"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vercel",
  "build",
  ".next",
  "coverage",
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

const files = walk(rootDir, []);
const problems = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let col = 0; col < line.length; col++) {
      const code = line.codePointAt(col);
      if (FORBIDDEN.has(code)) {
        problems.push({
          file: path.relative(rootDir, file),
          line: i + 1,
          col: col + 1,
          char: FORBIDDEN.get(code),
        });
      }
    }
  }
}

if (problems.length) {
  console.error(`[check:dashes] Found ${problems.length} cross dash character(s):\n`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}:${p.col}  ${p.char}`);
  }
  console.error(
    "\n[check:dashes] Replace cross dashes with normal punctuation (comma, colon, period, parentheses) or a normal hyphen only when needed."
  );
  process.exit(1);
}

console.log(`[check:dashes] OK. Scanned ${files.length} files. No cross dashes found.`);
