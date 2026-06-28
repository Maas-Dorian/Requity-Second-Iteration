/**
 * Build-time guard: fail if the deleted preview deployment domain reappears in
 * user-facing or link-generating source. Generated share links, QR links, and
 * email CTAs must always use the production domain (https://www.requityapp.com).
 *
 * Scans code/link files (.html, .js, .ts, .css, .json). Markdown docs are NOT
 * scanned so historical notes never block a build, but the domain should be
 * removed everywhere in practice.
 *
 * The forbidden host is assembled from parts so this guard file does not itself
 * contain the literal string it searches for.
 *
 * Usage: node scripts/check-no-old-domain.js   (npm run check:domain)
 * Exit code 1 when the forbidden domain is found.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Assembled from parts on purpose, so this file is not a self-match.
const FORBIDDEN_HOST = ["requity", "second", "iteration"].join("-") + ".vercel.app";

const SCAN_EXTENSIONS = new Set([".html", ".js", ".ts", ".css", ".json"]);
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

const selfPath = path.resolve(__filename);
const files = walk(rootDir, []).filter((f) => path.resolve(f) !== selfPath);
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
    if (lines[i].includes(FORBIDDEN_HOST)) {
      problems.push({ file: path.relative(rootDir, file), line: i + 1 });
    }
  }
}

if (problems.length) {
  console.error(
    `[check:domain] Found the deleted preview domain (${FORBIDDEN_HOST}) in ${problems.length} place(s):\n`
  );
  for (const p of problems) console.error(`  ${p.file}:${p.line}`);
  console.error(
    "\n[check:domain] Use the production domain (https://www.requityapp.com) via getPublicSiteUrl()/env.publicSiteUrl instead."
  );
  process.exit(1);
}

console.log(`[check:domain] OK. Scanned ${files.length} files. Deleted preview domain not found.`);
