#!/usr/bin/env node
/**
 * Overdue task reminders: creates Notification rows for overdue CaseTasks.
 * Run manually: pnpm overdue:run
 * Schedule daily via cron: 0 9 * * * cd apps/api && pnpm overdue:run
 */
import "dotenv/config";
import { runOverdueTaskReminders } from "../src/services/overdueTaskReminders";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add to apps/api/.env");
    process.exit(1);
  }

  console.log("[overdue-task-reminders] Starting...");
  const result = await runOverdueTaskReminders();
  console.log(
    `[overdue-task-reminders] Done. Firms: ${result.firmsProcessed}, notifications created: ${result.notificationsCreated}`
  );
}

main().catch((e) => {
  console.error("[overdue-task-reminders] Fatal error:", e);
  process.exit(1);
});
