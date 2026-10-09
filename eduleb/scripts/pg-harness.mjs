/**
 * The slice of Supabase's own schema that the migrations depend on: the `auth`
 * and `storage` schemas, the three roles Supabase ships, and a role-aware
 * `auth.uid()` that reads the JWT claim PostgREST sets.
 *
 * This exists so the migrations and the security tests can run against a real
 * Postgres engine with no Supabase project and no credentials.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS_DIR = resolve(import.meta.dirname, "..", "supabase", "migrations");

export const SUPABASE_STUBS = `
create schema if not exists auth;
create schema if not exists storage;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Same shape Supabase uses: reads the JWT claim set by PostgREST.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists storage_objects_bucket_name on storage.objects (bucket_id, name);

create or replace function storage.foldername(p_name text)
returns text[] language sql immutable as $$
  select string_to_array(p_name, '/')
$$;

create or replace function storage.create_signed_url(p_bucket text, p_path text, p_expires integer)
returns text language sql volatile as $$
  select 'https://signed.example/' || p_bucket || '/' || p_path || '?expires=' || p_expires
$$;

grant usage on schema auth, storage to anon, authenticated, service_role;

-- Supabase grants the storage tables to these roles as part of its defaults.
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on storage.buckets, storage.objects to service_role;
`;

/** A PGlite instance with the stubs and every migration already applied. */
export async function bootstrapDatabase() {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Runs `sql` as `role`, impersonating `uid` the way PostgREST would, and reports
 * the outcome instead of throwing — an expected denial is a test result here, not
 * a crash.
 */
export async function as(db, role, uid, sql, aal = "aal2") {
  await db.exec(`set role ${role};`);
  if (uid) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  }
  // Existing admin fixtures represent verified sessions. Tests pass aal1 explicitly.
  await db.query("select set_config('request.jwt.claim.aal', $1, false)", [aal]);
  try {
    const result = await db.query(sql);
    const rows = result.rows ?? [];
    return { ok: true, rows, count: result.affectedRows ?? rows.length };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await db.exec("reset role;");
    await db.exec("select set_config('request.jwt.claim.aal', '', false)");
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  }
}
