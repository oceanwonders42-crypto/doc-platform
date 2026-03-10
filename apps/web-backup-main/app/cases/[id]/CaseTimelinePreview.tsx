"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { formatDate } from "../../lib/formatTimestamp";

type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string;
  createdAt: string;
};

const PREVIEW_LIMIT = 5;

export default function CaseTimelinePreview({ caseId }: { caseId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/timeline?track=medical`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: TimelineEvent[] };
      const list = Array.isArray(data.items) ? data.items : [];
      const recent = list.slice(-PREVIEW_LIMIT).reverse();
      setEvents(recent);
      setLoading(false);
    }
    load();
  }, [caseId]);

  if (loading) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, background: "#fafafa" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Timeline Preview</h2>
        <p style={{ color: "#666", fontSize: 14 }}>Loading…</p>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Timeline Preview</h2>
        <Link
          href={`/cases/${caseId}/timeline`}
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View Full Timeline
        </Link>
      </div>
      {events.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
          No timeline events yet.{" "}
          <Link href={`/cases/${caseId}/timeline`} style={{ color: "#06c", textDecoration: "underline" }}>
            Rebuild timeline
          </Link>
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                padding: "10px 12px",
                marginBottom: 8,
                border: "1px solid #eee",
                borderRadius: 8,
                background: "#fff",
                fontSize: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{e.track}</span>
                  {e.eventDate && (
                    <span style={{ color: "#666", marginLeft: 8 }}>
                      {formatDate(e.eventDate)}
                    </span>
                  )}
                </div>
                <Link
                  href={`/documents/${e.documentId}`}
                  style={{ fontSize: 13, color: "#06c", textDecoration: "underline", flexShrink: 0 }}
                >
                  View doc
                </Link>
              </div>
              {(e.provider || e.diagnosis || e.procedure || e.amount) && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                  {e.provider && <span>{e.provider}</span>}
                  {e.diagnosis && <span style={{ marginLeft: 8 }}>· {e.diagnosis}</span>}
                  {e.procedure && <span style={{ marginLeft: 8 }}>· {e.procedure}</span>}
                  {e.amount && <span style={{ marginLeft: 8 }}>· {e.amount}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
