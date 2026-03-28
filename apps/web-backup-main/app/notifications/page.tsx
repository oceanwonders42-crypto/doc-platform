import Link from "next/link";
import { NotificationsList } from "./NotificationsList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 640,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Notifications</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        Key events: settlement offers, timeline updates, records request PDFs, narratives.
      </p>

      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard"
          style={{ fontSize: 14, color: "#06c", textDecoration: "underline" }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      <NotificationsList />
    </main>
  );
}
