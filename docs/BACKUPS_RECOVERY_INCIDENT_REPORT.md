# Backups, Data Recovery, and Incident Response — Implementation Report

## Summary

Backup configuration, automated backup worker, restore tooling, incident tracking, admin dashboards, health integration, alerting, audit checks, and tests are in place. No existing business logic was changed; focus is operational safety.

---

## Part 1 — Backup configuration service

**File:** `apps/api/src/services/backupManager.ts`

- **Trigger DB backups:** `triggerDatabaseBackup()` runs `pg_dump` (requires `pg_dump` on PATH and `DATABASE_URL`), writes to `BACKUP_DIR` (default `./backups`), computes size and SHA-256 checksum.
- **Record metadata:** Writes to `SystemBackup` with `backupType`, `location`, `size`, `checksum`, `createdAt`, `verifiedAt`, `status` (SUCCESS | FAILED).
- **Verify integrity:** After write, re-reads file and verifies checksum; sets `verifiedAt` only when valid; on mismatch sets status to FAILED and logs to SystemErrorLog.
- **Manual trigger:** Used by POST `/admin/system/backup` and by `backupWorker` / `pnpm backup:run`.
- **List/get:** `listBackups(filter)`, `getBackupById(id)` with optional filters (backupType, status, since, until, limit).
- **Retention:** `applyRetention()` deletes DB backups older than 30 days and removes files from disk.
- **Restore:** `restoreFromBackup(backupId)` runs `psql` against the backup file (admin endpoint logs incident and requires body `{ confirm: "RESTORE" }`).

**Prisma:** `SystemBackup` model (id, backupType, location, size, checksum, createdAt, verifiedAt, status). Migration: `20260306000006_backups_and_incidents`.

---

## Part 2 — Automated backup worker

**Files:**
- `apps/api/src/workers/backupWorker.ts` — exports `runBackup()` (trigger backup, apply retention; on failure calls `logSystemError` and `emitSystemAlert("backup_failed")`).
- `apps/api/scripts/backup_run.ts` — entry for cron: checks “backup not run in expected window” (e.g. 26h), calls `triggerBackupNotRunAlert` if needed, then `runBackup()`.

**Behavior:**
- Run on schedule: `pnpm backup:run` (e.g. cron `0 3 * * *` or `0 2 * * *`).
- Triggers DB backup via `triggerDatabaseBackup()`.
- Stores metadata in `SystemBackup`.
- Verifies backup file integrity (checksum in backupManager).
- On failure: creates SystemErrorLog and emits system alert.
- Retention: keeps daily backups 30 days (deletes older); weekly 90-day retention can be added later via schema/flag.

---

## Part 3 — Restore tooling

**Endpoints (admin-only, PLATFORM_ADMIN):**

- **POST /admin/system/backup** — Manually trigger backup. Returns 201 with backup record or 500 on failure.
- **GET /admin/system/backups** — List backups; query params: `backupType`, `status`, `from`, `to`, `limit`.
- **POST /admin/system/restore/:id** — Restore from backup. Requires body `{ confirm: "RESTORE" }`. Logs incident (SystemIncident), emits `restore_attempted` alert, then runs `restoreFromBackup(id)`. Returns 400 if confirm missing, 404 if backup not found, 500 if restore fails.

---

## Part 4 — Incident tracking

**Prisma:** `SystemIncident` (id, severity, title, description, status, relatedErrorId, createdAt, resolvedAt). Migration: `20260306000006_backups_and_incidents`.

**Routes (admin-only):**
- **POST /admin/incidents** — Create incident (body: severity, title, description?, relatedErrorId?).
- **GET /admin/incidents** — List; filter by `status`, `severity`, `limit`.
- **PATCH /admin/incidents/:id** — Update status, severity, title, description; setting status to RESOLVED sets resolvedAt.

---

## Part 5 — Admin incident dashboard

**File:** `apps/web/app/admin/incidents/page.tsx`

- Lists incidents with filters (status, severity).
- Severity badges (LOW / MEDIUM / HIGH / CRITICAL) with distinct colors.
- Resolution timeline: `resolvedAt` shown.
- Linked system errors: `relatedErrorId` links to `/admin/errors?highlight=:id`.
- Actions: set status to Mitigating or Resolve (RESOLVED).
- Nav: link to Support; admin layout includes “Incidents” in nav.

---

## Part 6 — Backup status in health check

**File:** `apps/api/src/services/systemHealth.ts`

- **backupStatus** on health summary: `lastBackupTime`, `lastBackupStatus`, `backupsLast7Days`.
- **getBackupStatusSummary()** in backupManager (used by systemHealth); health endpoint catches errors if SystemBackup not migrated.

**GET /admin/system/health** response includes `health.backupStatus`.

---

## Part 7 — Alerting on backup failure

**File:** `apps/api/src/services/systemAlerts.ts`

- **emitSystemAlert(type, payload):** `backup_failed` | `backup_not_run` | `restore_attempted`. Logs to SystemErrorLog with severity (CRITICAL for backup failures, WARN for restore_attempted).
- **triggerBackupNotRunAlert(hoursSinceLastBackup):** Used by `scripts/backup_run.ts` when no backup in expected window (e.g. 26h) or no backup in last 7 days.
- Backup worker calls `emitSystemAlert("backup_failed", ...)` on failure.
- Restore endpoint calls `emitSystemAlert("restore_attempted", ...)` before running restore.

---

## Part 8 — Audit integration

**File:** `scripts/full_audit.js`

- **backupSystem(apiSrcDir):** Checks backup worker exists (`workers/backupWorker.ts`), backup manager exists (`services/backupManager.ts`), `SystemBackup` model in schema, restore endpoint in server (`/admin/system/restore/:id` or `restoreFromBackup`), health includes backup info (`backupStatus` or `getBackupStatus`). Pushes warnings for any missing.
- Audit output includes `backupSystem` section with these flags and warnings.

---

## Part 9 — Testing

- **Unit/smoke:** `apps/api/tests/systemBackups/backupManager.test.ts` — run with `pnpm -C apps/api test:backups`. Covers: `verifyBackupFile` (matching checksum, wrong checksum, missing file); `getBackupStatusSummary` shape (when DB available); `emitSystemAlert` / `triggerBackupNotRunAlert` (no throw when DB available).
- **Checklist:** `apps/api/tests/systemBackups/BACKUP_TEST_CHECKLIST.md` — manual/API cases: backup metadata creation, failed backup logs error, admin-only restore protection, health includes backup status, restore confirmation required, restore logs incident, incidents CRUD, backup worker and retention.

---

## Part 10 — Files and remaining gaps

**Files added/updated**

| Area | Path |
|------|------|
| Migration | `apps/api/prisma/migrations/20260306000006_backups_and_incidents/migration.sql` |
| Schema | `apps/api/prisma/schema.prisma` (SystemBackup, SystemIncident) |
| Backup manager | `apps/api/src/services/backupManager.ts` |
| Backup worker | `apps/api/src/workers/backupWorker.ts` |
| Backup script | `apps/api/scripts/backup_run.ts` |
| System alerts | `apps/api/src/services/systemAlerts.ts` |
| Health | `apps/api/src/services/systemHealth.ts` (backupStatus) |
| Server routes | `apps/api/src/http/server.ts` (backup, backups, restore, incidents) |
| Incidents page | `apps/web/app/admin/incidents/page.tsx` |
| Audit | `scripts/full_audit.js` (backupSystem) |
| Tests | `apps/api/tests/systemBackups/backupManager.test.ts`, `BACKUP_TEST_CHECKLIST.md` |
| Report | `docs/BACKUPS_RECOVERY_INCIDENT_REPORT.md` |

**Remaining operational gaps**

- **Weekly retention (90 days):** Current retention keeps daily backups 30 days only. To keep “weekly” backups 90 days, add a retention tier or tag (e.g. weekly snapshot on Sunday) and extend retention logic.
- **Restore command:** `restoreFromBackup` uses `psql -f file <connection>`. On Windows, `psql` argument order/env may differ; verify in target environment.
- **File-storage/config backups:** Only DB backups are implemented; FILE_STORAGE and CONFIG backup types are schema-ready but not triggered.
- **External alerting:** systemAlerts only logs to SystemErrorLog; Slack/PagerDuty/email can be added by subscribing to `emitSystemAlert` or SystemErrorLog.
