"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOverdueTaskReminders = runOverdueTaskReminders;
/**
 * Overdue task reminders: creates Notification rows for CaseTasks where
 * completedAt is null and dueDate < now. Avoids duplicate reminders on the same day.
 */
const prisma_1 = require("../db/prisma");
const notifications_1 = require("./notifications");
async function runOverdueTaskReminders() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const overdueTasks = await prisma_1.prisma.caseTask.findMany({
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
    const alreadyRemindedToday = await prisma_1.prisma.notification.findMany({
        where: {
            type: "overdue_task_reminder",
            createdAt: { gte: todayStart },
        },
        select: { meta: true },
    });
    const remindedTaskIds = new Set(alreadyRemindedToday
        .map((n) => n.meta?.taskId)
        .filter((id) => typeof id === "string"));
    let created = 0;
    const firmsSeen = new Set();
    for (const task of overdueTasks) {
        if (remindedTaskIds.has(task.id))
            continue;
        const dueStr = task.dueDate ? task.dueDate.toLocaleDateString() : "N/A";
        await (0, notifications_1.createNotification)(task.firmId, "overdue_task_reminder", "Overdue task: " + task.title, `Task "${task.title}" was due ${dueStr}.`, { caseId: task.caseId, taskId: task.id });
        remindedTaskIds.add(task.id);
        firmsSeen.add(task.firmId);
        created++;
    }
    return { firmsProcessed: firmsSeen.size, notificationsCreated: created };
}
