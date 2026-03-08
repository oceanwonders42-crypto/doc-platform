# Backups, Data Recovery, and Incident Response — Implementation Report

## Summary

The platform has automated backups, restore tooling, incident tracking, and alerting. Backup metadata and incidents are stored in the database; backups run on a schedule or via manual trigger; restore requires admin confirmation and logs an incident. No existing business logic was changed.

---

## Part 1 — Backup configuration service

**File:** `apps/api/src/services/backupManager.ts`

- **Trigger database backups:** `triggerDatabaseBackup()` runs `pg_dump` (DATABASE_URL), writes to `BACKUP_DIR` (default `./backups`), records metadata in `SystemBackup`.
- **Record backup metadata:** `SystemBackup` fields: id, backupType (DB | FILE_STORAGE | CONFIG), location, size, checksum, createdAt, verifiedAt, status (SUCCESS | FAILED).
- **Verify backup integrity:** After write, computes SHA-256 checksum and stores it; `verifyBackupFile(path, expectedChecksum)` re-reads and validates. On mismatch, record is updated to FAILED and `logSystemError` is called.
- **Manual trigger:** Used by POST `/admin/system/backup` and by the backup worker/script.

**Prisma:** `SystemBackup` model and migration `20260306000006_backups_and_incidents`.

---

## Part 2 — Automated backup worker

**Files:**
- `apps/api/src/workers/backupWorker.ts` — exports `runBackup()`; when run as script, executes backup then retention.
- `apps/api/scripts/backup_run.ts` — entry for cron: checks “backup not run in expected window” (26h), triggers `triggerBackupNotRunAlert` if missed, then calls `runBackup()`.

**Behaviour:**
- Runs on schedule (cron example: `0 3 * * * cd apps/api && pnpm backup:run`).
- Triggers DB backup via `triggerDatabaseBackup()`.
- Stores metadata in `SystemBackup` (success or failed).
- Verifies backup file (checksum); on failure marks FAILED and emits alert.
- Creates `SystemErrorLog` on backup failure (via `logSystemError` and `emitSystemAlert("backup_failed")`).
- Retention: `applyRetention()` deletes DB backups older than 30 days (daily retention); weekly 90-day retention can be added later.

**Script:** `pnpm backup:run` (package.json).

---

## Part 3 — Restore tooling

**Endpoints (admin-only, PLATFORM_ADMIN):**

- **POST /admin/system/backup** — Manually trigger backup. Returns 201 with `{ ok: true, backup }` or 500 on failure.
- **GET /admin/system/backups** — List backups; query: `backupType`, `status`, `from`, `to`, `limit`. Returns `{ ok: true, backups, total }`.
- **POST /admin/system/restore/:id** — Restore from backup. Body must contain `{ confirm: "RESTORE" }`. Creates a `SystemIncident` (Database restore executed), calls `emitSystemAlert("restore_attempted")`, runs `restoreFromBackup(backupId)` (psql -f). Updates incident with success/failure. Returns 200 or 500.

`restoreFromBackup()` in backupManager validates backup exists, status SUCCESS, file on disk, and checksum before running psql.

---

## Part 4 — Incident tracking

**Prisma:** `SystemIncident` — id, severity (LOW | MEDIUM | HIGH | CRITICAL), title, description, status (OPEN | MITIGATING | RESOLVED), relatedErrorId, createdAt, resolvedAt.

**Routes:**
- **POST /admin/incidents** — Create incident (body: severity, title, description?, relatedErrorId?). Platform admin only.
- **GET /admin/incidents** — List with optional `status`, `severity`, `limit`. Platform admin only.
- **PATCH /admin/incidents/:id** — Update status, severity, title, description; setting status to RESOLVED sets resolvedAt. Platform admin only.

---

## Part 5 — Admin incident dashboard

**File:** `apps/web/app/admin/incidents/page.tsx`

- Lists incidents with filters (status, severity).
- Shows open count.
- Severity badges (colour by LOW/MEDIUM/HIGH/CRITICAL).
- Resolution timeline (resolvedAt column).
- Linked system errors: `relatedErrorId` links to `/admin/errors?highlight=:id`.
- Actions: Mark as Mitigating, Resolve.

**Nav:** Admin layout includes “Incidents” link to `/admin/incidents`.

---

## Part 6 — Backup status in health check

**File:** `apps/api/src/services/systemHealth.ts`

- `getSystemHealth()` includes `backupStatus`:
  - `lastBackupTime` (ISO string or null)
  - `lastBackupStatus` (string or null)
  - `backupsLast7Days` (number)

**Endpoint:** GET `/admin/system/health` returns `health.backupStatus` with the above.

---

## Part 7 — Alerting on backup failure

**File:** `apps/api/src/services/systemAlerts.ts`

- **emitSystemAlert(type, payload)** — Logs to SystemErrorLog with severity; types: `backup_failed`, `backup_not_run`, `restore_attempted`.
- **triggerBackupNotRunAlert(hoursSinceLastBackup)** — Used by backup_run script when no backup in expected window (e.g. 26h) or no backup in last 7 days.

Triggered when:
- Backup fails (worker and backupManager).
- Backup not run in expected window (script checks before running backup).
- Restore operation attempted (POST /admin/system/restore/:id).

---

## Part 8 — Audit integration

**File:** `scripts/full_audit.js`

- **backupSystem(apiSrcDir)** checks:
  - backupWorkerExists — `workers/backupWorker.ts`
  - backupManagerExists — `services/backupManager.ts`
  - systemBackupModel — `model SystemBackup` in schema
  - restoreEndpoint — `/admin/system/restore/:id` or `restoreFromBackup` in server
  - healthIncludesBackup — `backupStatus` or `getBackupStatus` in server

- Audit output includes `audit.backupSystem` and a summary line: Backup: worker= manager= model= restore= healthBackup=.

---

## Part 9 — Testing

**File:** `apps/api/tests/systemBackups/backups.test.ts`  
**Script:** `pnpm -C apps/api test:backups`

- **verifyBackupFile:** Missing file returns false; correct checksum returns true; wrong checksum returns false (temp file).
- **getBackupStatusSummary:** Return shape (lastBackupTime, lastBackupStatus, backupsLast7Days); skipped if DB/migration not available.

**Manual checklist (recommended):**
- Backup metadata creation: run backup, then GET /admin/system/backups and confirm record.
- Failed backup logs error: force failure (e.g. invalid DATABASE_URL), confirm SystemErrorLog and alert.
- Admin-only restore: call POST /admin/system/restore/:id without auth or with firm key → 401/403.
- Health includes backup status: GET /admin/system/health with platform admin → `health.backupStatus` present.

---

## Part 10 — Files and remaining gaps

**Files added/updated**

| Area | Path |
|------|------|
| Migration | `apps/api/prisma/migrations/20260306000006_backups_and_incidents/migration.sql` |
| Schema | `apps/api/prisma/schema.prisma` (SystemBackup, SystemIncident) |
| Backup service | `apps/api/src/services/backupManager.ts` |
| Backup verification (no DB) | `apps/api/src/services/backupManagerVerify.ts` |
| Backup worker | `apps/api/src/workers/backupWorker.ts` |
| Backup script | `apps/api/scripts/backup_run.ts` |
| System alerts | `apps/api/src/services/systemAlerts.ts` |
| Health | `apps/api/src/services/systemHealth.ts` (backupStatus) |
| Server routes | `apps/api/src/http/server.ts` (backup, backups, restore, incidents) |
| Incidents UI | `apps/web/app/admin/incidents/page.tsx` |
| Audit | `scripts/full_audit.js` (backupSystem) |
| Tests | `apps/api/tests/systemBackups/backups.test.ts` |

**Remaining operational gaps**

- **Weekly retention:** Only 30-day daily retention is implemented; “keep weekly backups 90 days” would require marking or selecting one backup per week and retaining those for 90 days.
- **FILE_STORAGE / CONFIG backups:** Only DB backups are implemented; FILE_STORAGE and CONFIG types are in the model but not produced by the worker.
- **Restore safety:** Restore runs psql against DATABASE_URL; ensure no production DB is pointed by default and consider read-only or confirmation gates in production.
- **Alert delivery:** Alerts are logged to SystemErrorLog only; integrate with Slack, PagerDuty, or email if needed.
- **Backup location:** Backups are local by default (BACKUP_DIR); for durability, copy to S3 or another remote store (e.g. in a post-backup step).

Priority remains on operational safety and recovery; the above gaps are enhancements.
