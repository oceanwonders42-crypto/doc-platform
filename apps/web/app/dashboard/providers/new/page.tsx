"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ProviderForm } from "@/components/dashboard/ProviderForm";

export default function NewProviderPage() {
  const router = useRouter();

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Providers", href: "/dashboard/providers" }, { label: "New" }]}
        title="Add provider"
        description="Create a provider record so operators can link cases, send records requests, and manage contact details from the active dashboard."
        action={
          <Link href="/dashboard/providers" className="onyx-link" style={{ fontSize: "0.875rem" }}>
            Back to providers
          </Link>
        }
      />

      <div style={{ maxWidth: "42rem" }}>
        <DashboardCard title="Provider details">
          <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
            Required fields are provider name, address, city, and state.
          </p>
          <ProviderForm
            mode="create"
            onSuccess={(provider) => {
              router.push(`/dashboard/providers/${provider.id}`);
            }}
          />
        </DashboardCard>
      </div>
    </div>
  );
}
