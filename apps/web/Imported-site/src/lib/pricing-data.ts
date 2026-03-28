/**
 * Pricing and plan content for marketing presentation only.
 * No billing logic, Stripe, or usage enforcement.
 */

export interface MonthlyPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  documentLimit: number;
  support: string;
  overagePerDoc: string;
  cta: string;
  highlighted?: boolean;
}

export interface OneTimeService {
  id: string;
  name: string;
  priceLabel: string;
  description: string;
  features: string[];
  cta: string;
}

export const monthlyPlans: MonthlyPlan[] = [
  {
    id: "essential",
    name: "Essential",
    price: 499,
    period: "month",
    description: "For firms getting started with AI document workflow.",
    features: [
      "AI document reading",
      "Document classification",
      "Smart file renaming",
      "Basic routing support",
      "Basic workflow automations",
      "Up to 1,500 documents/month",
      "Email support",
    ],
    documentLimit: 1500,
    support: "Email support",
    overagePerDoc: "$0.20 per extra document",
    cta: "Book demo",
    highlighted: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 999,
    period: "month",
    description: "For firms scaling document operations and case organization.",
    features: [
      "Everything in Essential",
      "Deeper extraction workflows",
      "Case organization support",
      "Advanced automation tools",
      "Review queue support",
      "Timeline and data organization",
      "Up to 4,000 documents/month",
      "Priority support",
    ],
    documentLimit: 4000,
    support: "Priority support",
    overagePerDoc: "$0.15 per extra document",
    cta: "Book demo",
    highlighted: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 1999,
    period: "month",
    description: "For high-volume firms and advanced workflow needs.",
    features: [
      "Everything in Growth",
      "Advanced document intelligence",
      "Advanced routing logic",
      "Custom workflow tuning",
      "Higher-volume processing",
      "Operational support",
      "Up to 10,000 documents/month",
      "VIP support",
    ],
    documentLimit: 10000,
    support: "VIP support",
    overagePerDoc: "$0.10 per extra document",
    cta: "Book demo",
    highlighted: false,
  },
];

export const paperlessTransition: OneTimeService = {
  id: "paperless",
  name: "Paperless Transition",
  priceLabel: "Starting at $3,500",
  description:
    "A white-glove migration service for firms ready to move from fragmented paper processes to a structured digital workflow, regardless of which CRM they use.",
  features: [
    "One-time migration and setup",
    "Workflow setup and design",
    "Naming and organization systems",
    "CRM-ready migration support",
    "Automation implementation guidance",
    "Works with any CRM",
  ],
  cta: "Talk about migration",
};

export const comparisonRows = [
  { label: "Included documents/month", essential: "1,500", growth: "4,000", premium: "10,000" },
  { label: "Support", essential: "Email", growth: "Priority", premium: "VIP" },
  { label: "Automation depth", essential: "Basic", growth: "Advanced", premium: "Custom" },
  { label: "Routing & extraction", essential: "Basic", growth: "Deeper workflows", premium: "Advanced" },
  { label: "Overage (per document)", essential: "$0.20", growth: "$0.15", premium: "$0.10" },
];

export const pricingFaq = [
  {
    q: "Do you charge per document?",
    a: "Each monthly plan includes a set document volume. We charge a simple overage rate per extra document only when you exceed that included volume. See the comparison table for details.",
  },
  {
    q: "What happens if we exceed our included volume?",
    a: "Overage is billed at the per-document rate for your plan (e.g. $0.20 for Essential). We’ll notify you as you approach your limit so you can upgrade or manage usage.",
  },
  {
    q: "Does Paperless Transition require a specific CRM?",
    a: "No. Paperless Transition works regardless of which CRM you use. We help you design naming, folders, and workflows so your files are CRM-ready when you sync.",
  },
  {
    q: "Can we upgrade later?",
    a: "Yes. You can upgrade to a higher plan at any time. We’ll prorate as needed so you only pay the difference for the remainder of the billing period.",
  },
  {
    q: "Is onboarding included?",
    a: "Yes. All plans include onboarding so your team can start using document classification, routing, and workflows. Paperless Transition includes dedicated migration and setup support.",
  },
];
