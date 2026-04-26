import Link from "next/link";

const workflowCards = [
  {
    title: "Ingest",
    body: "Upload or receive PDFs by Gmail OAuth, then start OCR and classification with firm-scoped routing.",
  },
  {
    title: "Review",
    body: "See why a document was routed, resolve low-confidence matches, and keep work in the review queue when needed.",
  },
  {
    title: "Draft",
    body: "Build demand PDFs from records, bills, chronology, missing records, and developer-controlled templates.",
  },
];

const planCards = [
  ["Essential", "Small firm launch plan with controlled AI drafting and document limits."],
  ["Growth", "Adds Clio/Gmail access, providers, exports, and a larger seat pool."],
  ["Premium", "Full workflow access with migration, traffic, demand audit, and higher limits."],
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 12% 8%, rgba(201,162,39,0.22), transparent 28%), radial-gradient(circle at 86% 14%, rgba(35,68,101,0.18), transparent 30%), linear-gradient(135deg, #fbf7ef 0%, #f2eadc 44%, #e9ddc8 100%)",
        color: "#17202a",
      }}
    >
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.2rem 4rem" }}>
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "4rem" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.7rem", textDecoration: "none", color: "#17202a" }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "2.6rem",
                height: "2.6rem",
                borderRadius: "0.95rem",
                background: "linear-gradient(135deg, #17202a, #2e3d4d)",
                color: "#f6d77b",
                fontWeight: 900,
                letterSpacing: "0.08em",
                boxShadow: "0 18px 42px rgba(23,32,42,0.22)",
              }}
            >
              OI
            </span>
            <span style={{ fontWeight: 850, fontSize: "1.05rem", letterSpacing: "-0.03em" }}>Onyx Intel</span>
          </Link>
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/login" style={{ color: "#17202a", fontWeight: 700, textDecoration: "none" }}>
              Log in
            </Link>
            <Link
              href="/dashboard"
              style={{
                background: "#17202a",
                color: "#fff",
                borderRadius: 999,
                padding: "0.78rem 1rem",
                textDecoration: "none",
                fontWeight: 800,
                boxShadow: "0 16px 34px rgba(23,32,42,0.24)",
              }}
            >
              Open dashboard
            </Link>
          </div>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "2rem", alignItems: "center" }}>
          <div>
            <p style={{ margin: "0 0 1rem", textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.75rem", fontWeight: 900, color: "#7b641e" }}>
              Legal workflow intelligence
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(3rem, 8vw, 6.4rem)", lineHeight: 0.9, letterSpacing: "-0.08em", fontWeight: 900 }}>
              Documents into demands, without the maze.
            </h1>
            <p style={{ margin: "1.35rem 0 0", maxWidth: 640, fontSize: "1.08rem", lineHeight: 1.7, color: "#46515d" }}>
              Onyx Intel gives injury firms one controlled lane for Gmail ingestion, OCR, AI routing, chronology, records requests, Clio writeback, and review-ready demand PDFs.
            </p>
            <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginTop: "1.6rem" }}>
              <Link
                href="/login"
                style={{
                  background: "#c9a227",
                  color: "#17202a",
                  borderRadius: 999,
                  padding: "0.9rem 1.15rem",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                Start working
              </Link>
              <Link
                href="/dashboard/settings/billing"
                style={{
                  border: "1px solid rgba(23,32,42,0.22)",
                  color: "#17202a",
                  borderRadius: 999,
                  padding: "0.9rem 1.15rem",
                  fontWeight: 800,
                  textDecoration: "none",
                  background: "rgba(255,255,255,0.45)",
                }}
              >
                View plans
              </Link>
            </div>
          </div>

          <div
            style={{
              borderRadius: "2rem",
              background: "rgba(255,255,255,0.58)",
              border: "1px solid rgba(23,32,42,0.12)",
              boxShadow: "0 30px 80px rgba(23,32,42,0.16)",
              padding: "1.2rem",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ borderRadius: "1.45rem", background: "#17202a", color: "#fff", padding: "1.35rem" }}>
              <p style={{ margin: 0, color: "#f6d77b", fontSize: "0.78rem", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Live firm controls
              </p>
              <h2 style={{ margin: "0.6rem 0 0", fontSize: "1.8rem", letterSpacing: "-0.04em" }}>
                Role-aware access, plan limits, and feature flags.
              </h2>
              <div style={{ display: "grid", gap: "0.7rem", marginTop: "1.1rem" }}>
                {["Firm admin onboarding", "Seat and demand limits", "Floating AI assistant", "Document preview"].map((item) => (
                  <div key={item} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "0.7rem" }}>
                    <span>{item}</span>
                    <strong style={{ color: "#f6d77b" }}>Controlled</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem", marginTop: "4rem" }}>
          {workflowCards.map((card) => (
            <article key={card.title} style={{ padding: "1.2rem", borderRadius: "1.35rem", background: "rgba(255,255,255,0.58)", border: "1px solid rgba(23,32,42,0.1)" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{card.title}</h2>
              <p style={{ margin: "0.55rem 0 0", color: "#46515d", lineHeight: 1.65 }}>{card.body}</p>
            </article>
          ))}
        </section>

        <section style={{ marginTop: "4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "end", marginBottom: "1rem" }}>
            <div>
              <p style={{ margin: 0, color: "#7b641e", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.75rem" }}>
                Plans
              </p>
              <h2 style={{ margin: "0.35rem 0 0", fontSize: "2rem", letterSpacing: "-0.05em" }}>
                Access grows with the firm.
              </h2>
            </div>
            <p style={{ margin: 0, color: "#46515d", maxWidth: 480, lineHeight: 1.6 }}>
              Developer controls can enable or disable features per firm, while paid tiers keep seats, documents, AI workflows, and integrations bounded.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem" }}>
            {planCards.map(([title, body]) => (
              <article key={title} style={{ padding: "1.2rem", borderRadius: "1.35rem", background: "#fffaf0", border: "1px solid rgba(201,162,39,0.24)" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h3>
                <p style={{ margin: "0.55rem 0 0", color: "#46515d", lineHeight: 1.6 }}>{body}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
