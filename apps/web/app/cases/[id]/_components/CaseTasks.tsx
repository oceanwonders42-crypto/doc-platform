"use client";

import { useState, useEffect, useCallback } from "react";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

export default function CaseTasks({
  caseId,
  firmId,
}: {
  caseId: string;
  firmId?: string | null;
}) {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = firmId ? `?firmId=${encodeURIComponent(firmId)}` : "";
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks${qs}`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: Task[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [caseId, firmId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await load();
      setLoading(false);
    }
    init();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      const payload: { title: string; dueDate?: string; firmId?: string } = {
        title: t,
      };
      if (dueDate.trim()) payload.dueDate = dueDate.trim();
      if (firmId) payload.firmId = firmId;
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setTitle("");
        setDueDate("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(task: Task) {
    const completed = !task.completedAt;
    setToggling(task.id);
    try {
      const payload: { completed: boolean; firmId?: string } = { completed };
      if (firmId) payload.firmId = firmId;
      const res = await fetch(`/api/cases/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) await load();
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading tasks…</p>;
  }

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Tasks</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Manage tasks for this case.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: 24,
          padding: 16,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
            Due date (optional)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: submitting || !title.trim() ? "#ccc" : "#111",
            color: "#fff",
            fontSize: 14,
            alignSelf: "flex-start",
            cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Adding…" : "Add task"}
        </button>
      </form>

      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No tasks yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((task) => {
            const isOverdue =
              !task.completedAt &&
              task.dueDate &&
              new Date(task.dueDate).getTime() < Date.now();
            return (
            <li
              key={task.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                marginBottom: 8,
                border: isOverdue ? "1px solid #dc2626" : "1px solid #e5e5e5",
                borderRadius: 8,
                background: isOverdue ? "#fef2f2" : "#fafafa",
              }}
            >
              <input
                type="checkbox"
                checked={!!task.completedAt}
                onChange={() => handleToggle(task)}
                disabled={toggling === task.id}
                style={{ marginTop: 3, cursor: toggling === task.id ? "not-allowed" : "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    textDecoration: task.completedAt ? "line-through" : "none",
                    color: task.completedAt ? "#888" : "#111",
                  }}
                >
                  {task.title}
                </div>
                {(task.dueDate || task.completedAt) && (
                  <div style={{ marginTop: 4, fontSize: 12, color: isOverdue ? "#dc2626" : "#888" }}>
                    {task.dueDate && (
                      <>
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                        {isOverdue && " (overdue)"}
                      </>
                    )}
                    {task.dueDate && task.completedAt && " · "}
                    {task.completedAt && (
                      <>Completed: {new Date(task.completedAt).toLocaleString()}</>
                    )}
                  </div>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
