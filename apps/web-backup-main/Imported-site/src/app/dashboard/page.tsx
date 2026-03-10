"use client";

import Link from "next/link";
import Header from "@/components/Header";
import DashboardKpiCard from "@/components/dashboard/DashboardKpiCard";
import RecentDocumentsTable from "@/components/dashboard/RecentDocumentsTable";
import ReviewQueuePanel from "@/components/dashboard/ReviewQueuePanel";
import TreatmentTimelinePreview from "@/components/dashboard/TreatmentTimelinePreview";
import IntegrationStatusCard from "@/components/dashboard/IntegrationStatusCard";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import {
  dashboardKpis,
  recentDocuments,
  reviewQueue,
  treatmentTimelineEntries,
  integrationStatus,
  activityFeed,
} from "@/lib/demo-dashboard-data";

export default function DashboardPage() {
  const billingFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dashboardKpis.billingExtracted);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0B0B0C] pt-16">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[#FFFFFF] sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-[#B3B6BA]">
              Overview of your matters, documents, and integrations.
            </p>
          </div>

          {/* Upload entry point */}
          <Link
            href="/dashboard/upload"
            className="mb-10 flex items-center gap-4 rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-5 transition-colors hover:border-[#3B82F6]/50 hover:bg-[#3B82F6]/5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#3B82F6]/20">
              <svg className="h-6 w-6 text-[#3B82F6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[#FFFFFF]">Upload document</p>
              <p className="text-sm text-[#B3B6BA]">Process a medical or billing record and see extraction results.</p>
            </div>
            <span className="shrink-0 text-[#3B82F6]">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* KPI cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
            <DashboardKpiCard
              label="Documents processed"
              value={dashboardKpis.documentsProcessed}
              accent="blue"
            />
            <DashboardKpiCard
              label="Cases active"
              value={dashboardKpis.casesActive}
            />
            <DashboardKpiCard
              label="Providers found"
              value={dashboardKpis.providersFound}
            />
            <DashboardKpiCard
              label="Billing extracted"
              value={billingFormatted}
              accent="teal"
            />
          </section>

          {/* Main content grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left column: documents + timeline */}
            <div className="lg:col-span-2 space-y-8">
              <RecentDocumentsTable documents={recentDocuments} />
              <TreatmentTimelinePreview entries={treatmentTimelineEntries} caseLabel="Johnson v. Defendant" />
            </div>

            {/* Right column: review queue, integration, activity */}
            <div className="space-y-8">
              <ReviewQueuePanel items={reviewQueue} />
              <IntegrationStatusCard status={integrationStatus} />
              <ActivityFeed items={activityFeed} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
