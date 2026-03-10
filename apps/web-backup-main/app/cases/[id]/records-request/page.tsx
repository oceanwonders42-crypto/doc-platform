import { redirect, notFound } from "next/navigation";

export default async function CaseRecordsRequestCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ requestId?: string }>;
}) {
  const { id } = await params;
  const { requestId } = await searchParams;

  if (!id) notFound();

  const search = requestId ? `?requestId=${encodeURIComponent(requestId)}` : "";
  redirect(`/cases/${id}/records-requests/new${search}`);
}

