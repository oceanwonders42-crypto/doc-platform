import DemoForm from "@/components/DemoForm";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PageHero from "@/components/ui/PageHero";

export default function DemoPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-primary)] pt-16">
        <PageHero
          title="Book a demo"
          subtitle="See how Onyx Intel can transform your firm's document workflow. No commitment required."
        />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
