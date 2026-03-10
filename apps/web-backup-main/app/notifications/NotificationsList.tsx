"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  meta: unknown;
  read: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  ok: boolean;
  items: NotificationItem[];
  unreadCount: number;
};

import { formatTimestamp } from "../lib/formatTimestamp";

function metaLink(type: string, meta: unknown): { href: string; label: string } | null {
  if (meta == null || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  if (m.caseId && typeof m.caseId === "string") {
    if (type === "overdue_task_reminder") {
      return { href: `/cases/${m.caseId}?tab=tasks`, label: "View tasks" };
    }
    return { href: `/cases/${m.caseId}`, label: "View case" };
  }
  if (m.documentId && typeof m.documentId === "string") {
    return { href: `/documents/${m.documentId}`, label: "View document" };
  }
  return null;
}

export function NotificationsList() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      if (data.ok) {
        setItems(data.items);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function markRead(id: string) {
    setMarkingId(id);
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (res.ok) await fetchNotifications();
    } finally {
      setMarkingId(null);
    }
  }

  async function markAllRead() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (res.ok) await fetchNotifications();
    } finally {
      setLoading(false);
    }
  }

  if (loading && items.length === 0) {
    return <div style={{ color: "#666", fontSize: 14 }}>Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "#666",
          fontSize: 14,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
        }}
      >
        No notifications yet.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "#666" }}>
          {unreadCount} unread
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            style={{
              fontSize: 13,
              color: "#06c",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((n) => {
          const link = metaLink(n.type, n.meta);
          return (
            <li
              key={n.id}
              style={{
                padding: 16,
                marginBottom: 8,
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: n.read ? "#fff" : "#f9f9ff",
              }}
            >
              <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 14 }}>
                {n.title}
              </div>
              {n.message && (
                <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>
                  {n.message}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, color: "#888" }}>
                  {formatTimestamp(n.createdAt)}
                </span>
                {link && (
                  <Link
                    href={link.href}
                    style={{
                      fontSize: 13,
                      color: "#06c",
                      textDecoration: "underline",
                    }}
                  >
                    {link.label}
                  </Link>
                )}
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    disabled={markingId === n.id}
                    style={{
                      fontSize: 12,
                      color: "#666",
                      background: "none",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      padding: "4px 10px",
                      cursor: markingId === n.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {markingId === n.id ? "…" : "Mark as read"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
