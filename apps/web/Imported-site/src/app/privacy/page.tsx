import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Onyx Intel",
  description: "Onyx Intel privacy policy. How we collect, use, and protect your information.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <section className="border-b border-[#2A2C2E] bg-[#121314] px-6 py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-[#FFFFFF] sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-[#B3B6BA]">
              Last updated: March 2025. We respect your privacy and protect your data.
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
          <div className="prose prose-invert prose-sm max-w-none text-[#B3B6BA]">
            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Information we collect</h2>
            <p className="mt-2">
              We collect information you provide when requesting a demo or using our services, including name, email, phone, firm name, and case management preferences. When you use our platform, we process documents and extraction data to deliver our services. We do not sell your personal information.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">How we use it</h2>
            <p className="mt-2">
              We use your information to provide and improve Onyx Intel, communicate with you about your account and demos, send product updates where you have opted in, and comply with legal obligations. Document and matter data is processed solely to deliver AI extraction, timelines, and sync features you have requested.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Data security</h2>
            <p className="mt-2">
              We use industry-standard encryption, access controls, and security practices. Our infrastructure is designed to support HIPAA-related requirements where applicable. We retain data only as long as needed to provide our services and as required by law.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Cookies and similar technologies</h2>
            <p className="mt-2">
              We use essential cookies to operate the service (e.g., session and security) and optional analytics to improve our product. You can control non-essential cookies via your browser settings. A detailed cookie list and consent options will be published here following legal review.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Sharing and subprocessors</h2>
            <p className="mt-2">
              We do not sell or rent your data. We may share data with service providers (hosting, email, analytics) who process it on our behalf under contract. A subprocessor list is available on request and will be published here once finalized. We require processors to meet appropriate security and confidentiality standards.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">International data</h2>
            <p className="mt-2">
              Our systems may process data in the United States or other jurisdictions where we or our providers operate. Where required by law, we implement appropriate safeguards (e.g., standard contractual clauses). Specific transfer mechanisms and jurisdictions will be updated following legal review for your region.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Your rights</h2>
            <p className="mt-2">
              You may request access to, correction of, or deletion of your personal data. You may opt out of marketing communications at any time. For requests or questions, contact us at the email address provided on our website. Applicable law may provide additional rights (e.g., portability, restriction, objection); we will honor them where required.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Contact</h2>
            <p className="mt-2">
              For privacy-related questions or to exercise your rights, contact us via the contact information on our website or at{" "}
              <a href="mailto:privacy@onyxintel.com" className="text-[#3B82F6] hover:underline">privacy@onyxintel.com</a>.
            </p>

            <p className="mt-10 text-xs text-[#B3B6BA]/90 border-l-2 border-[#2A2C2E] pl-4">
              This summary is for convenience. We recommend legal review for your jurisdiction before reliance. See our{" "}
              <Link href="/terms" className="text-[#3B82F6] hover:underline">Terms of Service</Link> for governing terms.
            </p>
          </div>
          <p className="mt-12">
            <Link href="/" className="text-sm text-[#3B82F6] hover:underline">← Back to home</Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
