import Link from "next/link";

export const dynamic = "force-dynamic";

type OverdueTask = {
  id: string;
  title: string;
  dueDate: string | null;
  caseId: string;
};

type Response = {
  ok: boolean;
  items: OverdueTask[];
  count: number;
};

async function fetchOverdueTasks(): Promise<OverdueTask[]> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return [];
  const res = await fetch(`${base}/me/overdue-tasks?limit=200`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as Response;
  return Array.isArray(data?.items) ? data.items : [];
}

export default async function OverdueTasksPage() {
  const tasks = await fetchOverdueTasks();

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Overdue tasks</h1>
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No overdue tasks.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tasks.map((t) => (
            <li
              key={t.id}
              style={{
                padding: "14px 16px",
                marginBottom: 8,
                border: "1px solid #dc2626",
                borderRadius: 8,
                background: "#fef2f2",
              }}
            >
              <Link
                href={`/cases/${t.caseId}?tab=tasks`}
                style={{ fontWeight: 600, color: "#111", textDecoration: "none", fontSize: 15 }}
              >
                {t.title}
              </Link>
              <div style={{ marginTop: 6, fontSize: 13, color: "#dc2626" }}>
                Due: {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"} (overdue)
              </div>
              <div style={{ marginTop: 4 }}>
                <Link
                  href={`/cases/${t.caseId}?tab=tasks`}
                  style={{ fontSize: 13, color: "#06c", textDecoration: "underline" }}
                >
                  Open case →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
