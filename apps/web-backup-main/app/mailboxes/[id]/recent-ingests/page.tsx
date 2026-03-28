import { formatTimestamp } from "../../../lib/formatTimestamp";

export const dynamic = "force-dynamic";

export default async function RecentIngestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: mailboxId } = await params;

  if (!mailboxId) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Recent Ingests</h1>
        <pre>Missing mailbox id param.</pre>
      </div>
    );
  }

  let status = 0;
  let data: any = null;
  let raw = "";

  try {
    const res = await fetch(
      `http://localhost:4000/mailboxes/${mailboxId}/recent-ingests`,
      { cache: "no-store" }
    );
    status = res.status;
    raw = await res.text();
    data = JSON.parse(raw);
  } catch (e: any) {
    data = { ok: false, error: String(e?.message || e), raw };
  }

  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  return (
    <div style={{ padding: 24 }}>
      <h1>Recent Ingests</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        mailbox: <code>{mailboxId}</code> • apiStatus: <code>{status}</code> • ok:{" "}
        <code>{String(!!data?.ok)}</code>
      </div>

      {!data?.ok && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #444",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      <div style={{ marginTop: 16 }}>
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Filename</th>
              <th>Subject</th>
              <th>From</th>
              <th>Document ID</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ opacity: 0.8 }}>
                  No items (or API error above).
                </td>
              </tr>
            ) : (
              items.map((row: any) => (
                <tr key={row.id}>
                  <td>{formatTimestamp(row.created_at)}</td>
                  <td>{row.filename}</td>
                  <td>{row.subject}</td>
                  <td>{row.from_email}</td>
                  <td>{row.ingest_document_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
