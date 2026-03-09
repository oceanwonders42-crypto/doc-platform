"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "../../../lib/api";

type Audit = {
  generatedAt?: string;
  git?: { branch?: string; status?: string; recentCommits?: string[] };
  web?: { routes?: string[]; pagesCount?: number; apiRoutes?: string[] };
  api?: { filesCount?: number; keyFiles?: string[] };
  db?: {
    models?: string[];
    enums?: string[];
    migrations?: { total?: number; pending?: string[]; statusText?: string };
  };
  build?: {
    webBuildOk?: boolean;
    apiTypecheckOk?: boolean;
    errors?: { component?: string; message?: string }[];
  };
  codeHealth?: {
    todoMarkers?: { file?: string; line?: number; text?: string }[];
    duplicateBasenames?: { basename?: string; paths?: string[] }[];
    suspiciousPartials?: { type?: string; detail?: string }[];
  };
};

const sectionStyle = { marginBottom: "1.5rem", padding: "1rem", borderRadius: "6px", background: "#f8f9fa", border: "1px solid #e9ecef" };
const okStyle = { ...sectionStyle, borderLeft: "4px solid #198754", background: "#d4edda" };
const failStyle = { ...sectionStyle, borderLeft: "4px solid #dc3545", background: "#f8d7da" };
const warnStyle = { ...sectionStyle, borderLeft: "4px solid #ffc107", background: "#fff3cd" };

export default function DebugAuditPage() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/debug/audit")
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; error?: string };
        if (d.ok !== false) setAudit(data as Audit);
        else setError(d.error || "Audit not found");
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: "1rem" }}>Loading audit…</p>;
  if (error) {
    return (
      <div style={failStyle}>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Debug — Project Audit</h1>
        <p style={{ color: "#721c24", margin: 0 }}>{error}</p>
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Run from repo root: <code>pnpm run audit</code></p>
      </div>
    );
  }

  const buildOk = audit?.build?.webBuildOk !== false && audit?.build?.apiTypecheckOk !== false;
  const hasBuildErrors = (audit?.build?.errors?.length ?? 0) > 0;
  const hasTodos = (audit?.codeHealth?.todoMarkers?.length ?? 0) > 0;
  const hasPartials = (audit?.codeHealth?.suspiciousPartials?.length ?? 0) > 0;

  return (
    <>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Debug — Project Audit</h1>
      <p style={{ margin: "0 0 1rem", color: "#666", fontSize: "0.9rem" }}>
        Generated: {audit?.generatedAt ?? "—"}
      </p>

      <section style={audit?.git?.branch ? okStyle : sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Git</h2>
        <p style={{ margin: 0 }}>Branch: <strong>{audit?.git?.branch ?? "—"}</strong></p>
        <pre style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", overflow: "auto", whiteSpace: "pre-wrap" }}>{audit?.git?.status || "—"}</pre>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
          {(audit?.git?.recentCommits ?? []).slice(0, 5).map((c, i) => (
            <li key={i} style={{ fontSize: "0.85rem" }}>{c}</li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Web routes</h2>
        <p style={{ margin: 0 }}>Pages: {audit?.web?.pagesCount ?? 0} | API routes: {(audit?.web?.apiRoutes ?? []).length}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
          {(audit?.web?.routes ?? []).slice(0, 20).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
          {(audit?.web?.routes ?? []).length > 20 && <li>… and {(audit?.web?.routes ?? []).length - 20} more</li>}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>API</h2>
        <p style={{ margin: 0 }}>Source files: {audit?.api?.filesCount ?? 0}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
          {(audit?.api?.keyFiles ?? []).slice(0, 15).map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>DB (Prisma)</h2>
        <p style={{ margin: 0 }}>Models: {(audit?.db?.models ?? []).length} | Enums: {(audit?.db?.enums ?? []).length}</p>
        <p style={{ margin: "0.25rem 0 0" }}>Migrations: {audit?.db?.migrations?.total ?? 0} total. Pending: {(audit?.db?.migrations?.pending ?? []).length}</p>
        <pre style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", overflow: "auto", whiteSpace: "pre-wrap" }}>{audit?.db?.migrations?.statusText ?? "—"}</pre>
        <details style={{ marginTop: "0.5rem" }}>
          <summary>Model names</summary>
          <p style={{ margin: "0.25rem 0", fontSize: "0.85rem" }}>{(audit?.db?.models ?? []).join(", ")}</p>
        </details>
      </section>

      <section style={buildOk && !hasBuildErrors ? okStyle : hasBuildErrors ? failStyle : warnStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Build</h2>
        <p style={{ margin: 0 }}>Web build: {audit?.build?.webBuildOk ? "OK" : "FAIL"} | API typecheck: {audit?.build?.apiTypecheckOk ? "OK" : "FAIL"}</p>
        {(audit?.build?.errors ?? []).length > 0 && (
          <pre style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", overflow: "auto", whiteSpace: "pre-wrap", color: "#721c24" }}>
            {audit?.build?.errors?.map((e) => `[${e.component}] ${e.message}`).join("\n\n")}
          </pre>
        )}
      </section>

      <section style={hasTodos ? warnStyle : sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>TODO / FIXME markers</h2>
        <p style={{ margin: 0 }}>Count: {(audit?.codeHealth?.todoMarkers ?? []).length}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.8rem" }}>
          {(audit?.codeHealth?.todoMarkers ?? []).slice(0, 15).map((t, i) => (
            <li key={i}>{t.file}:{t.line} — {String(t.text).slice(0, 80)}</li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Duplicate basenames</h2>
        <p style={{ margin: 0 }}>Count: {(audit?.codeHealth?.duplicateBasenames ?? []).length}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
          {(audit?.codeHealth?.duplicateBasenames ?? []).slice(0, 10).map((d, i) => (
            <li key={i}>{d.basename}: {(d.paths ?? []).join(", ")}</li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Pending migrations</h2>
        <p style={{ margin: 0 }}>{(audit?.db?.migrations?.pending ?? []).length ? "Yes" : "None"}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
          {(audit?.db?.migrations?.pending ?? []).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </section>

      <section style={hasPartials ? warnStyle : sectionStyle}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Likely incomplete features</h2>
        <p style={{ margin: 0 }}>Suspicious partials: {(audit?.codeHealth?.suspiciousPartials ?? []).length}</p>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
          {(audit?.codeHealth?.suspiciousPartials ?? []).map((s, i) => (
            <li key={i}><strong>{s.type}</strong>: {s.detail}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
