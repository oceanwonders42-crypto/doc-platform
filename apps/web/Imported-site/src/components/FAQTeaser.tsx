"use client";

import Link from "next/link";
import { useState } from "react";
import Section from "@landing/components/ui/Section";
import SectionHeader from "@landing/components/ui/SectionHeader";

const teaserFaqs = [
  {
    question: "How does Onyx Intel handle different document formats?",
    answer:
      "PDFs, scanned images, faxes, and portal exports. Documents are categorized by type and indexed for fast retrieval.",
  },
  {
    question: "Can we use our existing case management system?",
    answer:
      "Yes. We integrate with Clio, Filevine, Litify, MyCase, PracticePanther, and Smokeball. Processed data syncs into your CMS.",
  },
  {
    question: "How long does it take to get started?",
    answer:
      "Most firms are up and running within a few weeks. We handle CMS setup, field mapping, and onboarding.",
  },
];

export default function FAQTeaser() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Section id="faq" variant="compact">
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          eyebrow="FAQ"
          title="Common questions"
          subtitle="A few answers. View all FAQs for more."
        />
        <div className="mt-10 space-y-3">
          {teaserFaqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="card overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="font-semibold tracking-tight text-[var(--text-primary)]">{faq.question}</span>
                  <svg
                    className={`h-5 w-5 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--border-default)] px-6 pb-5 pt-2">
                    <p className="text-[var(--text-secondary)] leading-[1.6]">{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center">
          <Link
            href="/#faq"
            className="text-sm font-medium text-[var(--text-muted)] underline decoration-[var(--border-refined)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
          >
            View all FAQs →
          </Link>
        </p>
      </div>
    </Section>
  );
}
