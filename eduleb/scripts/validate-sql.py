#!/usr/bin/env python3
"""
Parse every supabase/migrations/*.sql file with libpg_query (the real
PostgreSQL grammar, via pglast) and report syntax errors.

This catches typos, unbalanced parens and malformed DDL before anything is
applied to a project. It cannot check semantics — RLS behaviour still has to be
exercised against a live database with scripts/security-tests.mjs.

    python3 -m venv .sqlvenv
    .sqlvenv/bin/pip install pglast
    .sqlvenv/bin/python scripts/validate-sql.py
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from pglast import parse_sql
    from pglast.parser import ParseError
except ImportError:  # pragma: no cover
    sys.exit("pglast not installed. Run: pip install pglast")

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))

if not MIGRATIONS:
    sys.exit("no migrations found")


def main() -> int:
    failures = 0
    for path in MIGRATIONS:
        sql = path.read_text(encoding="utf-8")
        try:
            statements = parse_sql(sql)
        except ParseError as exc:
            line = getattr(exc, "location", 0)
            context = ""
            if line:
                lines = sql.splitlines()
                start = max(0, line - 3)
                context = "\n".join(
                    f"    {i + 1:>4} | {lines[i]}" for i in range(start, min(len(lines), line + 2))
                )
            print(f"FAIL  {path.relative_to(ROOT)}")
            print(f"      {exc}")
            if context:
                print(context)
            failures += 1
            continue
        print(f"ok    {path.relative_to(ROOT)}  ({len(statements)} statements)")

    print()
    if failures:
        print(f"RESULT: {failures} file(s) failed to parse.")
        return 1
    print(f"RESULT: all {len(MIGRATIONS)} migration file(s) parse cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
