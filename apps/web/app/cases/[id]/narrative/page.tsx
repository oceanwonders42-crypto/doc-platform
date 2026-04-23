import { notFound } from "next/navigation";
import NarrativePageGateClient from "./NarrativePageGateClient";

export default async function NarrativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();
  return <NarrativePageGateClient caseId={id} />;
}
