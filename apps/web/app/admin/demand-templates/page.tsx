import Link from "next/link";
import { DemandTemplateManager } from "./DemandTemplateManager";

type DemandTemplate = {
  id: string;
  firmId: string | null;
  firmName: string | null;
  name: string;
  caseType: string | null;
  demandType: string | null;
  version: number;
  isActive: boolean;
  requiredSections: string[];
  examplesText: string | null;
  updatedAt: string;
};

async function fetchTemplates(): Promise<DemandTemplate[]> {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) return [];
  const response = await fetch(`${base}/admin/demand-templates?includeInactive=1`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.items) ? data.items : [];
}

export default async function AdminDemandTemplatesPage() {
  const templates = await fetchTemplates();

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div>
          <Link href="/admin/firms" style={{ color: "#111", textDecoration: "underline", fontSize: 14 }}>
            Back to firms
          </Link>
          <h1 style={{ margin: "10px 0 0", fontSize: 26 }}>Demand templates</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 14 }}>
            Create versioned firm/default demand structures for OpenAI-assisted review-ready drafts.
          </p>
        </div>
      </div>
      <DemandTemplateManager initialItems={templates} />
    </main>
  );
}
