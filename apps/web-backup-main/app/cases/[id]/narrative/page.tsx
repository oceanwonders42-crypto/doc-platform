import { notFound } from "next/navigation";
import NarrativePageClient from "./NarrativeClient";

async function fetchFeatures(): Promise<{ demand_narratives: boolean }> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return { demand_narratives: false };
  const res = await fetch(`${base}/me/features`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { demand_narratives: false };
  const data = (await res.json().catch(() => ({}))) as { demand_narratives?: boolean };
  return { demand_narratives: Boolean(data.demand_narratives) };
}

export default async function NarrativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const features = await fetchFeatures();

  return <NarrativePageClient caseId={id} enabled={features.demand_narratives} />;
}
