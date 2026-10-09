/**
 * Proves the marketing site was not modified by LMS work.
 *
 * Compares SHA-256 of every frozen file against scripts/frozen.sha256.
 * Run via `npm run verify:frozen`.
 *
 * `npm run verify:frozen -- --update` rewrites the baseline. That is the only
 * sanctioned way to change a marketing page on purpose: it prints every file it
 * is about to accept, so the change is a decision on the record rather than a
 * silent edit to a hash file.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const MANIFEST = join(import.meta.dirname, "frozen.sha256");
const UPDATE = process.argv.includes("--update");
const REASON =
  process.argv.find((a) => a.startsWith("--reason="))?.slice("--reason=".length) ?? "";

const sha256 = (abs) => createHash("sha256").update(readFileSync(abs)).digest("hex");

const manifestLines = readFileSync(MANIFEST, "utf8").split("\n");
const expected = new Map(
  manifestLines
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [hash, ...rest] = line.trim().split(/\s+/);
      return [rest.join(" "), hash];
    }),
);

if (UPDATE) {
  const changed = [];
  for (const [rel, want] of expected) {
    const abs = join(SITE_ROOT, rel);
    if (!statSync(abs, { throwIfNoEntry: false })) {
      console.error(`MISSING  ${rel} — not in the baseline, so it cannot be added`);
      process.exit(1);
    }
    const got = sha256(abs);
    if (got !== want) changed.push(rel);
  }

  if (changed.length === 0) {
    console.log("Nothing has changed, so the baseline was left alone.");
    process.exit(0);
  }

  console.log("Accepting edits to the frozen marketing site:");
  for (const rel of changed) console.log(`  ${rel}`);
  console.log(`\nBaseline reason: ${REASON || "(none given — pass --reason= to record one)"}`);
  console.log(`\nWriting ${expected.size} hashes to scripts/frozen.sha256\n`);

  const stamp = new Date().toISOString().slice(0, 10);
  const header = [
    "# SHA-256 of the frozen marketing site. Verify with: npm run verify:frozen",
    `# Baseline last changed: ${stamp}${REASON ? ` — ${REASON}` : ""}`,
  ];
  const body = [...expected.keys()].map((rel) => `${sha256(join(SITE_ROOT, rel))}  ${rel}`);
  writeFileSync(MANIFEST, `${[...header, ...body].join("\n")}\n`);
  process.exit(0);
}

let failures = 0;
for (const [rel, want] of expected) {
  const abs = join(SITE_ROOT, rel);
  if (!statSync(abs, { throwIfNoEntry: false })) {
    console.error(`MISSING  ${rel}`);
    failures += 1;
    continue;
  }
  const got = sha256(abs);
  if (got !== want) {
    console.error(`CHANGED  ${rel}\n  expected ${want}\n  actual   ${got}`);
    failures += 1;
  } else {
    console.log(`ok       ${rel}`);
  }
}

console.log(`\n${expected.size - failures}/${expected.size} frozen files unchanged`);
if (failures > 0) {
  console.error(`\nRESULT: ${failures} frozen marketing file(s) were modified.`);
  process.exit(1);
}
console.log("RESULT: marketing site untouched.");
