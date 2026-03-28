import Link from "next/link";
import { notFound } from "next/navigation";
import { OffersPageClient } from "./OffersPageClient";

type Offer = {
  documentId: string;
  originalName: string;
  date: string;
  amount: number;
};

async function fetchOffers(caseId: string): Promise<{ ok: boolean; offers?: Offer[]; latest?: Offer | null }> {
  const base = process.env.DOC_WEB_BASE_URL ?? "";
  const res = await fetch(`${base}/api/cases/${caseId}/offers`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return { ok: false, offers: [], latest: null };
  return res.json().catch(() => ({ ok: false, offers: [], latest: null }));
}

export default async function CaseOffersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const data = await fetchOffers(id);
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const latest = data.latest ?? null;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Settlement offers
      </h1>

      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/cases/${id}`}
          style={{ fontSize: 13, color: "#111", textDecoration: "underline" }}
        >
          ← Back to case
        </Link>
      </div>

      <OffersPageClient caseId={id} offers={offers} latest={latest} />
    </main>
  );
}
