import { prisma } from "../db/prisma";

export type NotificationType =
  | "settlement_offer_detected"
  | "timeline_updated"
  | "narrative_generated"
  | "records_request_pdf_generated"
  | "records_request_sent"
  | "records_request_send_failed"
  | "mailbox_poll_failed"
  | "case_created_from_doc"
  | "retention_cleanup"
  | "overdue_task_reminder"
  | "demand_package_ready"
  | "job_failed";

export async function createNotification(
  firmId: string,
  type: NotificationType,
  title: string,
  message?: string | null,
  meta?: Record<string, unknown> | null
): Promise<void> {
  await prisma.notification.create({
    data: {
      firmId,
      type,
      title,
      message: message ?? null,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : null,
    },
  });
}

export async function getUnreadCount(firmId: string): Promise<number> {
  return prisma.notification.count({
    where: { firmId, read: false },
  });
}

export async function listNotifications(
  firmId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<
  { id: string; type: string; title: string; message: string | null; meta: unknown; read: boolean; createdAt: Date }[]
> {
  const limit = Math.min(options?.limit ?? 50, 100);
  const items = await prisma.notification.findMany({
    where: { firmId, ...(options?.unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, message: true, meta: true, read: true, createdAt: true },
  });
  return items;
}

export async function markNotificationRead(firmId: string, notificationId: string): Promise<boolean> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, firmId },
    data: { read: true },
  });
  return updated.count > 0;
}

export async function markAllNotificationsRead(firmId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { firmId, read: false },
    data: { read: true },
  });
  return result.count;
}
