/**
 * Overdue task reminders: creates Notification rows for CaseTasks where
 * completedAt is null and dueDate < now. Avoids duplicate reminders on the same day.
 */
import { prisma } from "../db/prisma";
import { createNotification } from "./notifications";

export async function runOverdueTaskReminders(): Promise<{ firmsProcessed: number; notificationsCreated: number }> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueTasks = await prisma.caseTask.findMany({
    where: {
      completedAt: null,
      dueDate: { lt: now },
    },
    select: { id: true, firmId: true, caseId: true, title: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });

  if (overdueTasks.length === 0) {
    return { firmsProcessed: 0, notificationsCreated: 0 };
  }

  const alreadyRemindedToday = await prisma.notification.findMany({
    where: {
      type: "overdue_task_reminder",
      createdAt: { gte: todayStart },
    },
    select: { meta: true },
  });
  const remindedTaskIds = new Set(
    alreadyRemindedToday
      .map((n) => (n.meta as { taskId?: string })?.taskId)
      .filter((id): id is string => typeof id === "string")
  );

  let created = 0;
  const firmsSeen = new Set<string>();

  for (const task of overdueTasks) {
    if (remindedTaskIds.has(task.id)) continue;

    const dueStr = task.dueDate ? task.dueDate.toLocaleDateString() : "N/A";
    await createNotification(
      task.firmId,
      "overdue_task_reminder",
      "Overdue task: " + task.title,
      `Task "${task.title}" was due ${dueStr}.`,
      { caseId: task.caseId, taskId: task.id }
    );
    remindedTaskIds.add(task.id);
    firmsSeen.add(task.firmId);
    created++;
  }

  return { firmsProcessed: firmsSeen.size, notificationsCreated: created };
}
