"use client";

import CaseDocumentsTab from "./CaseDocumentsTab";
import { CaseProvidersSection } from "./CaseProvidersSection";
import CaseTimelinePreview from "./CaseTimelinePreview";
import CaseRequestsTab from "./CaseRequestsTab";

export default function CaseDetailsSections({ caseId }: { caseId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <CaseDocumentsTab caseId={caseId} />
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <CaseProvidersSection caseId={caseId} />
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <CaseTimelinePreview caseId={caseId} />
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <CaseRequestsTab caseId={caseId} />
      </section>
    </div>
  );
}
