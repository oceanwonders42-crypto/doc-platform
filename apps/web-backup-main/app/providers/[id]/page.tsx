import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { PageHeader } from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import ProviderContactSection from "./ProviderContactSection";

export const dynamic = "force-dynamic";

type Provider = {
  id: string;
  name: string;
  address?: string | null;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
};

async function fetchProvider(id: string): Promise<Provider | null> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/providers/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch provider: ${res.status}`);
  return res.json();
}

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const provider = await fetchProvider(id);
  if (!provider) notFound();

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/providers" },
          { label: provider.name },
        ]}
      />
      <PageHeader
        title={provider.name}
        description={`${provider.city}, ${provider.state}. Contact info, linked cases, and records requests.`}
      />

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Contact
        </h2>
        <ProviderContactSection
          city={provider.city}
          state={provider.state}
          phone={provider.phone}
          fax={provider.fax}
          email={provider.email}
        />
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Cases
        </h2>
        <EmptyState
          title="No cases linked yet"
          description="Cases associated with this provider will appear here."
          action={{ label: "View all cases", href: "/cases" }}
          compact
        />
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Records requests
        </h2>
        <EmptyState
          title="No records requests yet"
          description="Request records from this provider from a case page."
          action={{ label: "View cases", href: "/cases" }}
          compact
        />
      </section>
    </main>
  );
}
