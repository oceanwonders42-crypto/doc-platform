"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { formatDate } from "../lib/formatTimestamp";

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

import { statusColors } from "../lib/statusColors";

function notificationLink(type: string, meta: unknown): string | null {
  if (meta != null && typeof meta === "object" && "caseId" in meta) {
    const caseId = (meta as { caseId: string }).caseId;
    if (type === "overdue_task_reminder") {
      return `/cases/${caseId}?tab=tasks`;
    }
    return `/cases/${caseId}`;
  }
  if (meta != null && typeof meta === "object" && "documentId" in meta) {
    return `/documents/${(meta as { documentId: string }).documentId}`;
  }
  return null;
}

export default function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10&unread=true");
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      if (data.ok) {
        setItems(data.items);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  async function markRead(id: string) {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (res.ok) await fetchNotifications();
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (res.ok) await fetchNotifications();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          border: "1px solid #ddd",
          borderRadius: 8,
          background: open ? "#f5f5f5" : "#fff",
          cursor: "pointer",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              background: "var(--status-error-text)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 360,
            maxHeight: 400,
            overflow: "auto",
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #eee",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}
            >
              View all
            </Link>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  fontSize: 12,
                  color: "#06c",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Mark all read
              </button>
            )}
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, color: "#666", fontSize: 14, textAlign: "center" }}>
              No notifications yet.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((n) => {
                const link = notificationLink(n.type, n.meta);
                const content = (
                  <>
                    <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 13 }}>{n.title}</div>
                    {n.message && (
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{n.message}</div>
                    )}
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{formatDate(n.createdAt)}</div>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #f0f0f0",
                      background: n.read ? "#fff" : "#f9f9ff",
                    }}
                  >
                    {link ? (
                      <Link
                        href={link}
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                          setOpen(false);
                        }}
                        style={{ textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => !n.read && markRead(n.id)}
                        onKeyDown={(e) => e.key === "Enter" && !n.read && markRead(n.id)}
                        style={{ cursor: n.read ? "default" : "pointer" }}
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
