/**
 * Executes the real (non-preview) branches of api.ts in Node against a recording
 * stand-in for the Supabase client, then checks every request they built against
 * the migrations.
 *
 * The preview branches get exercised by test-frontend.mjs. These are the branches
 * that only ever run against a live database, which is exactly why a wrong column
 * name or a missing grant can sit in the repository for months unnoticed: nothing
 * local ever calls them.
 *
 * Three things are verified:
 *   1. every column used in a select, filter or order clause exists in the table
 *   2. every insert/update payload is a subset of the columns granted for that op
 *   3. no real branch crashes on the shape of an empty response
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRecordingClient } from "./fake-supabase.mjs";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = join(SITE_ROOT, "supabase/migrations");
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ the SQL */

const columns = {};
for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, table, body] = m;
  columns[table] = new Set(
    body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^(constraint|primary key|unique|check|foreign key|exclude)\b/i.test(l))
      .map((l) => l.split(/\s+/)[0])
      .filter(Boolean),
  );
}

// Forward migrations extend existing tables; include their added columns.
for (const alteration of sql.matchAll(/alter table public\.(\w+)\s+([\s\S]*?);/gi)) {
 const table = alteration[1];
 columns[table] ??= new Set();
 for (const added of alteration[2].matchAll(/\badd column(?: if not exists)?\s+(\w+)/gi)) columns[table].add(added[1]);
}

// granted columns, per table and operation, unioned across roles
const granted = {};
for (const m of sql.matchAll(/grant\s+(select|insert|update|delete)(?:\s*\(([^)]*)\))?\s+on\s+(?:public\.)?(\w+)/gi)) {
  const [, op, list, table] = m;
  const key = `${table}.${op.toLowerCase()}`;
  granted[key] ??= new Set();
  if (list) for (const c of list.split(",")) granted[key].add(c.trim());
  else granted[key].add("*");
}

const rpcParams = {};
for (const m of sql.matchAll(/create or replace function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*returns/gi)) {
  const [, name, args] = m;
  // split on commas that are not inside parens, so a numeric(10,2) default is
  // not torn in half
  const params = [];
  let depth = 0;
  let current = "";
  for (const ch of args) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      params.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) params.push(current);
  rpcParams[name.toLowerCase()] = params.map((a) => ({
    name: a.trim().split(/\s+/)[0],
    hasDefault: /\bdefault\b/i.test(a),
  }));
}

/* ------------------------------------------------- run the real branches */

// api.ts reads config, which reads import.meta.env. Under Node that is absent, so
// config.preview is false and the real branches are the ones that run.
// config.ts warns when there are no credentials and preview mode is off. That is
// exactly the state this test needs, so the warning is expected rather than
// useful, and would only be noise in the output.
const warn = console.warn;
console.warn = () => {};

const client = createRecordingClient();
const supabaseModule = await import(join(SITE_ROOT, "assets/js/lms/supabase.ts"));
supabaseModule.__setSupabaseForTests(client);
const api = await import(join(SITE_ROOT, "assets/js/lms/api.ts"));
console.warn = warn;

const UUID = "00000000-0000-4000-8000-000000000001";
const apiSource = readFileSync(join(SITE_ROOT, "assets/js/lms/api.ts"), "utf8");

/**
 * Builds an argument list for each exported function from its own signature, so
 * adding a function to api.ts makes this test cover it without anyone having to
 * remember to add it here.
 */
function valueFor(type, name = "") {
  const t = type.replace(/\?$/, "").trim();
  if (/^Record</.test(t)) return {};
  if (t.endsWith("[]")) return [UUID];
  if (/^\{/.test(t)) {
    const object = {};
    for (const part of t.slice(1, -1).split(/[;,]/)) {
      const [key, valueType] = part.split(":").map((x) => x && x.trim());
      // "title?: string" is the same column as "title: string" to Postgres.
      if (key) object[key.replace(/\?$/, "")] = valueFor(valueType ?? "string", key);
    }
    return object;
  }
  // a union of literals: take the first, which is the safe default
  const literal = t.match(/"([^"]*)"\s*\|/);
  if (literal) return literal[1];
  if (/number$/.test(t)) return 1;
  if (/boolean$/.test(t)) return true;
  if (/\|\s*null$/.test(t)) return null;
  if (/Url$/.test(name) || /url$/.test(name)) return "https://example.invalid/x";
  if (/_at$|_date$/.test(name)) return "2026-01-01T10:00:00.000Z";
  if (/_time$/.test(name)) return "10:00";
  if (/Path$/.test(name)) return `courses/${UUID}/materials/${UUID}.url`;
  if (/note$|feedback$/.test(name)) return null;
  if (/^ids$/.test(name)) return [UUID];
  return UUID;
}

const signatures = new Map();
for (const m of apiSource.matchAll(/export async function (\w+)\(([\s\S]*?)\)\s*:/g)) {
  const [, name, rawArgs] = m;
  const params = [];
  let depth = 0;
  let current = "";
  for (const ch of rawArgs) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      params.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) params.push(current);
  signatures.set(
    name,
    params
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        // Split at the first colon that is not inside an object literal, or
        // "input: { title: string }" becomes the parameter "input" of type
        // "{ title" and invents a column called "titl".
        let depth = 0;
        let at = p.indexOf(":");
        for (let i = 0; i < p.length; i += 1) {
          if (p[i] === "{") depth += 1;
          else if (p[i] === "}") depth -= 1;
          else if (p[i] === ":" && depth === 0) {
            at = i;
            break;
          }
        }
        const name2 = p.slice(0, at).trim().replace(/\?$/, "");
        const type = p.slice(at + 1).trim() || "string";
        return { name: name2, type };
      }),
  );
}

const crashes = [];
const notCovered = [];
let executed = 0;
for (const name of Object.keys(api)) {
  if (name === "friendlyError") continue;
  const params = signatures.get(name);
  if (!params) {
    notCovered.push(`${name} (no async signature found)`);
    continue;
  }
  const args = params.map((p) => valueFor(p.type, p.name));
  try {
    await api[name](...args);
    executed += 1;
  } catch (error) {
    // A plain Error is the module handling the situation; a TypeError or
    // ReferenceError is a shape bug in the branch itself.
    if (!(error instanceof Error) || error.name === "TypeError" || error.name === "ReferenceError") {
      crashes.push(`${name}: ${error.name ?? typeof error}: ${error.message ?? error}`);
    } else {
      executed += 1;
    }
  }
}

console.log("Real-branch execution");
check("the real client was used, not the fixtures", client.requests.length > 0);
check("every exported function was executed", notCovered.length === 0, notCovered.join(", "));
check("most functions ran to completion", executed > 60, `only ${executed}`);
check("no real branch crashed on an empty response", crashes.length === 0, crashes.join(" | "));

/* ------------------------------------------- check what the branches asked for */

console.log("Request contract");
const missingColumns = [];
const ungranted = [];
for (const req of client.requests) {
  if (req.rpc) continue;
  const known = columns[req.table];
  if (!known) {
    missingColumns.push(`${req.table}: no such table`);
    continue;
  }
  const used = [];
  if (typeof req.columns === "string" && req.columns !== "*") {
    // handles "a, b" and embedded resources such as profile:full_name(id)
    used.push(...req.columns.split(",").map((c) => c.trim().split(":")[0].trim()).filter(Boolean));
  }
  for (const [, column] of req.filters) used.push(column);
  if (req.order) used.push(req.order);
  for (const column of used) {
    if (!column || column === "*" || column.includes("(")) continue;
    if (!known.has(column)) missingColumns.push(`${req.table}.${column}`);
  }
  if (req.op === "insert" || req.op === "update") {
    const allowed = granted[`${req.table}.${req.op}`];
    for (const column of req.payload ?? []) {
      if (!known.has(column)) {
        missingColumns.push(`${req.table}.${column}`);
        continue;
      }
      // A column with no grant at all can never be written by any role.
      if (allowed && !allowed.has("*") && !allowed.has(column)) {
        ungranted.push(`${req.op} ${req.table}.${column}`);
      }
    }
  }
}
check(
  "every column used in a select, filter or order exists",
  missingColumns.length === 0,
  [...new Set(missingColumns)].join(", "),
);
check(
  "every insert and update payload is granted",
  ungranted.length === 0,
  [...new Set(ungranted)].join(", "),
);

const wrongArity = [];
for (const req of client.requests) {
  if (!req.rpc) continue;
  const params = rpcParams[req.rpc.toLowerCase()];
  if (!params) continue;
  const given = Object.keys(req.payload ?? {});
  // PostgREST lets a caller omit trailing arguments that have a SQL default.
  const required = params.filter((p) => !p.hasDefault).length;
  const unknown = given.filter((g) => !params.some((p) => p.name === g));
  const missing = params.slice(given.length).filter((p) => !p.hasDefault);
  if (unknown.length) wrongArity.push(`${req.rpc}: unknown ${unknown.join(", ")}`);
  if (given.length < required || missing.length) {
    wrongArity.push(`${req.rpc}: ${given.length} given, ${required} required`);
  }
}
check("every RPC is called with the right number of arguments", wrongArity.length === 0, wrongArity.join(", "));

console.log(`\n────────────────────────────────────────────────────────────`);
if (failures.length) {
  console.log(`RESULT: ${passed} passed, ${failures.length} FAILED.`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`RESULT: ${passed} real-branch assertions passed, 0 failed.`);
}
