import { RecordsRequestDetailClient } from "./RecordsRequestDetailClient";

export default async function RecordsRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecordsRequestDetailClient id={id} />;
}
