"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CaseDocumentsTab from "./CaseDocumentsTab";
import CaseTimelineTab from "./CaseTimelineTab";
import { CaseProvidersSection } from "./CaseProvidersSection";
import CaseRequestsTab from "./CaseRequestsTab";
import CaseNotes from "./_components/CaseNotes";
import CaseTasks from "./_components/CaseTasks";

const TABS = [
  { id: "documents", label: "Documents", countKey: "documents" as const },
  { id: "timeline", label: "Timeline", countKey: "timeline" as const },
  { id: "providers", label: "Providers", countKey: "providers" as const },
  { id: "requests", label: "Requests", countKey: "requests" as const },
  { id: "notes", label: "Notes", countKey: "notes" as const },
  { id: "tasks", label: "Tasks", countKey: "tasks" as const },
] as const;

type TabId = (typeof TABS)[number]["id"];

type TabCounts = { documents: number; timeline: number; providers: number; requests: number; notes: number; tasks: number };

export default function CaseHubTabs({
  caseId,
  firmId,
  timelineMeta,
  features,
  counts = { documents: 0, timeline: 0, providers: 0, requests: 0, notes: 0, tasks: 0 },
}: {
  caseId: string;
  firmId?: string | null;
  timelineMeta: { lastRebuiltAt: string | null };
  features: { demand_narratives: boolean; case_insights: boolean; insurance_extraction: boolean; court_extraction: boolean };
  counts?: TabCounts;
}) {
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) || "documents";
  const validTab = TABS.some((t) => t.id === tab) ? tab : "documents";

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e5e5", marginBottom: 24 }}>
        {TABS.map((t) => {
          const n = counts[t.countKey];
          const label = n > 0 ? `${t.label} (${n})` : t.label;
          return (
            <Link
              key={t.id}
              href={`/cases/${caseId}?tab=${t.id}`}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                color: validTab === t.id ? "#111" : "#666",
                borderBottom: validTab === t.id ? "2px solid #111" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {validTab === "documents" && <CaseDocumentsTab caseId={caseId} />}
      {validTab === "timeline" && (
        <CaseTimelineTab caseId={caseId} features={features} timelineMeta={timelineMeta} />
      )}
      {validTab === "providers" && <CaseProvidersSection caseId={caseId} />}
      {validTab === "requests" && <CaseRequestsTab caseId={caseId} />}
      {validTab === "notes" && <CaseNotes caseId={caseId} firmId={firmId} />}
      {validTab === "tasks" && <CaseTasks caseId={caseId} firmId={firmId} />}
    </div>
  );
}
