"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.getUnreadCount = getUnreadCount;
exports.listNotifications = listNotifications;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
async function createNotification(firmId, type, title, message, meta) {
    await prisma_1.prisma.notification.create({
        data: {
            firmId,
            type,
            title,
            message: message ?? null,
            meta: meta != null ? JSON.parse(JSON.stringify(meta)) : client_1.Prisma.JsonNull,
        },
    });
}
async function getUnreadCount(firmId) {
    return prisma_1.prisma.notification.count({
        where: { firmId, read: false },
    });
}
async function listNotifications(firmId, options) {
    const limit = Math.min(options?.limit ?? 50, 100);
    const where = { firmId };
    if (options?.unreadOnly)
        where.read = false;
    if (options?.type && options.type.trim())
        where.type = options.type.trim();
    const items = await prisma_1.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, type: true, title: true, message: true, meta: true, read: true, createdAt: true },
    });
    return items;
}
async function markNotificationRead(firmId, notificationId) {
    const updated = await prisma_1.prisma.notification.updateMany({
        where: { id: notificationId, firmId },
        data: { read: true },
    });
    return updated.count > 0;
}
async function markAllNotificationsRead(firmId) {
    const result = await prisma_1.prisma.notification.updateMany({
        where: { firmId, read: false },
        data: { read: true },
    });
    return result.count;
}
