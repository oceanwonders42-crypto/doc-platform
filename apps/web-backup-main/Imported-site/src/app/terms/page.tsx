import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service | Onyx Intel",
  description: "Onyx Intel terms of service. Terms governing use of our platform and services.",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <section className="border-b border-[#2A2C2E] bg-[#121314] px-6 py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-[#FFFFFF] sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-4 text-[#B3B6BA]">
              Last updated: March 2025. By using Onyx Intel, you agree to these terms.
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
          <div className="prose prose-invert prose-sm max-w-none text-[#B3B6BA]">
            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Agreement</h2>
            <p className="mt-2">
              These Terms of Service (“Terms”) govern your access to and use of Onyx Intel’s platform and services. By signing up, requesting a demo, or using our services, you agree to these Terms and our{" "}
              <Link href="/privacy" className="text-[#3B82F6] hover:underline">Privacy Policy</Link>.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Services</h2>
            <p className="mt-2">
              Onyx Intel provides AI-powered medical record processing, timeline generation, billing extraction, and case management integrations for personal injury law firms. We reserve the right to modify or discontinue features with reasonable notice where practicable.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Acceptable use</h2>
            <p className="mt-2">
              You agree to use the platform only for lawful purposes and in compliance with applicable law, including professional responsibility and data protection rules. You are responsible for the accuracy and legality of data you submit and for obtaining any required client consents.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Intellectual property</h2>
            <p className="mt-2">
              Onyx Intel and its licensors retain all rights in the platform, technology, and content we provide. You retain rights in your data. We may use anonymized or aggregated data to improve our services.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Termination</h2>
            <p className="mt-2">
              You may stop using the services at any time. We may suspend or terminate access for breach of these Terms or for operational or legal reasons, with notice where required. Upon termination, your right to use the services ends. Provisions that by their nature should survive (e.g., liability, indemnity, dispute resolution) will survive.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Limitation of liability</h2>
            <p className="mt-2">
              To the maximum extent permitted by law, Onyx Intel is not liable for indirect, incidental, special, or consequential damages arising from your use of the services. Our total liability is limited to the fees you paid to us in the twelve months preceding the claim.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Dispute resolution and governing law</h2>
            <p className="mt-2">
              These Terms are governed by the laws of the State of Delaware, without regard to conflict of laws. Any dispute will be resolved in the state or federal courts located in Delaware. Specific arbitration or class-action provisions will be updated here following legal review.
            </p>

            <h2 className="text-xl font-semibold text-[#FFFFFF] mt-8">Contact</h2>
            <p className="mt-2">
              For questions about these Terms, contact us via the information on our website or at{" "}
              <a href="mailto:legal@onyxintel.com" className="text-[#3B82F6] hover:underline">legal@onyxintel.com</a>.
            </p>

            <p className="mt-10 text-xs text-[#B3B6BA]/90 border-l-2 border-[#2A2C2E] pl-4">
              This summary is for convenience. We recommend legal review for your jurisdiction before reliance. See our{" "}
              <Link href="/privacy" className="text-[#3B82F6] hover:underline">Privacy Policy</Link> for how we handle data.
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
