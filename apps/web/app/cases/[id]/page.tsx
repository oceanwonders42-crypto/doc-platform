import { notFound } from "next/navigation";
import CasePageClient from "./CasePageClient";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();
  return <CasePageClient caseId={id} />;
}
