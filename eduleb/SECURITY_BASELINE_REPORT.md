# Security baseline

9 October 2026. Source preserved in a restricted local backup at /private/tmp/icanpath-security-backup/source.tar.gz with SHA256 manifest. Copy this archive into durable access controlled storage before relying on it for recovery; temporary directories are not durable backups. Branch: codex/security-remediation. Git initially had no commits and app files were untracked; no environment values were committed.

Fresh discovery: TypeScript passed; lint failed on 12 Node globals in the standalone audit probe. Reproducer confirmed the assessment, progress and contact weaknesses. Historical same-day audit regression tests and production build passed before the probe artifact was added. No configured live Supabase connection found. No production changes made. Old migrations 0001 through 0023 must remain byte identical to the backup manifest.
