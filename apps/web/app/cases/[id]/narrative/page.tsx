import { notFound } from "next/navigation";
import NarrativePageClient from "./NarrativeClient";

export default async function NarrativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  return <NarrativePageClient caseId={id} />;
}
