# System Backups & Recovery — Test Checklist

Use these to validate backups, restore, and health. Run with API up and platform admin key.

## 1. Backup metadata creation

- **Action:** Trigger a backup: `POST /admin/system/backup` with `Authorization: Bearer <platform_admin_key>`.
- **Expect:** 201, `{ ok: true, backup: { id, backupType: "DB", location, size, checksum, status: "SUCCESS", verifiedAt } }`.
- **Verify:** `GET /admin/system/backups` lists the new backup; `SystemBackup` row exists in DB.

## 2. Failed backup logs error

- **Action:** Run backup with `DATABASE_URL` invalid or `pg_dump` missing (or temporarily rename pg_dump).
- **Expect:** Backup fails; `SystemBackup` record with `status: "FAILED"`; `SystemErrorLog` entry with service `backup-manager` or `backup-worker`; alert emitted (check logs or SystemErrorLog for backup_failed).

## 3. Admin-only restore route protection

- **Request:** `POST /admin/system/restore/:id` without `Authorization` or with firm (non–platform-admin) key, body `{ "confirm": "RESTORE" }`.
- **Expect:** 401 or 403. Only platform admin can call restore.

## 4. Health endpoint includes backup status

- **Request:** `GET /admin/system/health` with platform admin key.
- **Expect:** 200, body includes `health.backupStatus` with `lastBackupTime`, `lastBackupStatus`, `backupsLast7Days`.

## 5. Restore requires confirmation

- **Request:** `POST /admin/system/restore/<valid-backup-id>` with platform admin key, body `{}` or `{ "confirm": "other" }`.
- **Expect:** 400, message that confirmation is required (`confirm: 'RESTORE'`).

## 6. Restore logs incident

- **Request:** `POST /admin/system/restore/<valid-backup-id>` with platform admin key, body `{ "confirm": "RESTORE" }` (only if you intend to actually run restore in test env).
- **Expect:** Incident created in `SystemIncident`; alert `restore_attempted` logged.

## 7. Incidents CRUD

- **POST /admin/incidents** with body `{ "title": "Test", "severity": "LOW", "description": "Test incident" }` → 201, incident returned.
- **GET /admin/incidents** → list includes the incident; filter by `status`, `severity`.
- **PATCH /admin/incidents/:id** with `{ "status": "RESOLVED" }` → incident updated, `resolvedAt` set.

## 8. Backup worker and retention

- **Run:** `pnpm -C apps/api backup:run` (with valid `DATABASE_URL` and `pg_dump` on PATH).
- **Expect:** Backup file created under `BACKUP_DIR` (or `./backups`), `SystemBackup` record SUCCESS; retention deletes backups older than 30 days (if any).
