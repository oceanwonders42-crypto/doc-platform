import Link from "next/link";

export const dynamic = "force-dynamic";

type FeaturesResponse = {
  ok: boolean;
  web: Record<string, boolean>;
  db: Record<string, boolean>;
  notes: string[];
};

async function fetchFeatures(): Promise<FeaturesResponse> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/debug/features`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}

function CheckItem({
  label,
  checked,
}: {
  label: string;
  checked: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          backgroundColor: checked ? "#22c55e" : "#ef4444",
          flexShrink: 0,
        }}
        aria-hidden
      />
      <span style={{ fontWeight: checked ? 500 : 400, color: checked ? "#111" : "#666" }}>
        {label}
      </span>
    </li>
  );
}

export default async function DebugFeaturesPage() {
  const data = await fetchFeatures();

  const webEntries = Object.entries(data.web);
  const dbEntries = Object.entries(data.db);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 640,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Debug: Feature Checklist
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Real code + Prisma schema detection. Routes and models present in the
        codebase.
      </p>

      {data.notes.length > 0 && (
        <section
          style={{
            border: "1px solid #fde047",
            borderRadius: 8,
            padding: 12,
            marginBottom: 20,
            backgroundColor: "#fefce8",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Notes
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Web routes
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {webEntries.map(([key, checked]) => (
            <CheckItem key={key} label={key} checked={checked} />
          ))}
        </ul>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Prisma models
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {dbEntries.map(([key, checked]) => (
            <CheckItem key={key} label={key} checked={checked} />
          ))}
        </ul>
      </section>

      <p style={{ fontSize: 14, color: "#666" }}>
        <Link href="/admin/debug" style={{ color: "#06c", textDecoration: "underline" }}>
          ← Back to Admin Debug
        </Link>
      </p>
    </main>
  );
}
