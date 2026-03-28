import Link from "next/link";
import { notFound } from "next/navigation";
import { NewRecordsRequestClient } from "./NewRecordsRequestClient";

export default async function NewRecordsRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ requestId?: string; providerId?: string }>;
}) {
  const { id } = await params;
  const { requestId, providerId } = await searchParams;

  if (!id) notFound();

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {requestId ? "Edit records request" : "New records request"}
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        {requestId
          ? "Edit the letter body and save before marking as sent."
          : "Select a provider and dates. The letter is generated automatically—you can edit it before saving."}
      </p>

      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/cases/${id}/records-requests`}
          style={{ fontSize: 14, color: "#06c", textDecoration: "underline" }}
        >
          ← Back to records requests
        </Link>
      </div>

      <NewRecordsRequestClient caseId={id} initialRequestId={requestId} initialProviderId={providerId} />
    </main>
  );
}
