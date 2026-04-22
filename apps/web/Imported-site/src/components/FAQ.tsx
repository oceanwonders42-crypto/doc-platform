"use client";

import { useState } from "react";
import SectionHeader from "@/components/ui/SectionHeader";

const faqGroups = [
  {
    category: "Product",
    faqs: [
      {
        question: "How does Onyx Intel handle different document formats?",
        answer:
          "Onyx Intel accepts PDFs, scanned images, faxes, and exports from medical portals. Documents are automatically categorized by type (ER records, imaging, bills, provider notes) and indexed for fast retrieval.",
      },
      {
        question: "How accurate is the AI extraction?",
        answer:
          "We achieve high accuracy on classification and data extraction, with human review workflows for critical fields. Timelines and billing extractions include source citations so your team can verify and refine.",
      },
    ],
  },
  {
    category: "Integrations",
    faqs: [
      {
        question: "Can Onyx Intel integrate with our existing case management system?",
        answer:
          "Yes. We integrate with Clio, Filevine, Litify, MyCase, PracticePanther, and Smokeball. Processed documents, timelines, and billing data sync into your CMS. Configure field mappings once.",
      },
    ],
  },
  {
    category: "Security & compliance",
    faqs: [
      {
        question: "Is Onyx Intel HIPAA compliant?",
        answer:
          "Onyx Intel is built with HIPAA-ready infrastructure: encryption at rest and in transit, access controls, and audit logging. We can provide a BAA for firms that require it.",
      },
    ],
  },
  {
    category: "Getting started & support",
    faqs: [
      {
        question: "How long does it take to get started?",
        answer:
          "Most firms are up and running within a few weeks. Implementation includes CMS setup, field mapping, and training. We provide onboarding and can help process your first batch during rollout.",
      },
      {
        question: "What support do you offer?",
        answer:
          "Dedicated onboarding, training, and ongoing support. We help with integration, workflow optimization, and technical issues. Higher plans include priority support.",
      },
    ],
  },
];

export default function FAQ() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <section id="faq" className="border-t border-[var(--border-default)] bg-[var(--bg-primary)] px-5 py-20 sm:px-6 md:py-28 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          eyebrow="FAQ"
          title="Frequently asked questions"
          subtitle="Common questions about Onyx Intel from personal injury law firms."
        />
        <div className="mt-12 space-y-10">
          {faqGroups.map((group) => (
            <div key={group.category}>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {group.category}
              </h3>
              <div className="space-y-3">
                {group.faqs.map((faq, index) => {
                  const key = `${group.category}-${index}`;
                  const isOpen = openKey === key;
                  return (
                    <div key={key} className="card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenKey(isOpen ? null : key)}
                        className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <span className="font-semibold text-[var(--text-primary)] pr-4">{faq.question}</span>
                        <svg
                          className={`h-5 w-5 shrink-0 text-[var(--text-secondary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="border-t border-[var(--border-default)] px-6 pb-5 pt-2">
                          <p className="text-[var(--text-secondary)] leading-relaxed">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
