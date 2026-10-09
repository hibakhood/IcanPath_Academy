/**
 * Runs every supabase migration against a real PostgreSQL engine (PGlite, which
 * is Postgres compiled to WebAssembly) so the schema is actually executed, not
 * just parsed. Needs no Supabase project and no credentials.
 *
 *   node scripts/test-migrations.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS_DIR, SUPABASE_STUBS, migrationFiles } from "./pg-harness.mjs";

async function main() {
  const db = await PGlite.create();

  console.log("— installing Supabase stubs —");
  await db.exec(SUPABASE_STUBS);

  let failed = 0;

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      console.log(`ok    ${file}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${file}`);
      console.error(`      ${error.message}`);
      const at = Number(error.position ?? 0) - 1;
      if (at > 0) {
        const lines = sql.split("\n");
        const line = sql.slice(0, at).split("\n").length;
        console.error(`      near line ${line}:`);
        console.error(
          lines
            .slice(Math.max(0, line - 3), line + 2)
            .map((l, i) => `      ${Math.max(1, line - 2) + i} | ${l}`)
            .join("\n"),
        );
      }
    }
  }

  if (failed === 0) {
    const [{ rows: tables }, { rows: policies }, { rows: rls }, { rows: fn }] = await Promise.all([
      db.query(`select count(*)::int n from information_schema.tables
                 where table_schema = 'public' and table_type = 'BASE TABLE'`),
      db.query(`select count(*)::int n from pg_policies where schemaname = 'public'`),
      db.query(`select count(*)::int n from pg_tables
                 where schemaname = 'public' and rowsecurity`),
      db.query(`select count(*)::int n from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prosecdef`),
    ]);
    console.log(
      `\n${tables[0].n} tables · ${policies[0].n} policies · ${rls[0].n} tables with RLS · ${fn[0].n} SECURITY DEFINER functions`,
    );
  }

  await db.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
