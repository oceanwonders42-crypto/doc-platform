import Link from "next/link";
import { notFound } from "next/navigation";
import InviteProviderButton from "../InviteProviderButton";

type ProviderProfile = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  specialty?: string | null;
  specialtiesJson?: unknown;
  verified?: boolean;
  subscriptionTier?: string;
  lat?: number | null;
  lng?: number | null;
  createdAt?: string;
};

type CaseItem = {
  id: string;
  title?: string | null;
  caseNumber?: string | null;
  clientName?: string | null;
  createdAt: string;
  relationship?: string;
};

type RecordsRequestItem = {
  id: string;
  providerName: string;
  status: string;
  caseId: string;
  createdAt: string;
};

type TimelineEventItem = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string;
  provider: string | null;
  diagnosis: string | null;
  documentId: string;
  caseId: string;
};

type SummaryResponse = {
  ok: boolean;
  provider: ProviderProfile;
  cases: CaseItem[];
  recordsRequests: RecordsRequestItem[];
  timelineEvents: TimelineEventItem[];
};

async function apiGet<T>(path: string): Promise<T> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const url = `${base}${path}`;
  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 404) {
    throw new Error("NOT_FOUND");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

function MapCard({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=14`;
  const staticUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.02}%2C${lat - 0.01}%2C${lng + 0.02}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Map</h2>
      <div
        style={{
          borderRadius: 8,
          overflow: "hidden",
          height: 200,
          background: "#f0f0f0",
          position: "relative",
        }}
      >
        <iframe
          title={`Map for ${name}`}
          src={staticUrl}
          width="100%"
          height="200"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 13, color: "#06c", textDecoration: "underline", marginTop: 8, display: "inline-block" }}
      >
        Open in OpenStreetMap →
      </a>
    </section>
  );
}

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  let data: SummaryResponse | null = null;
  try {
    data = await apiGet<SummaryResponse>(`/api/providers/${id}/summary`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  if (!data?.ok || !data.provider) {
    notFound();
  }

  const provider = data.provider;
  const cases = data.cases ?? [];
  const recordsRequests = data.recordsRequests ?? [];
  const timelineEvents = data.timelineEvents ?? [];

  const specialties =
    provider.specialty?.trim() ||
    (Array.isArray(provider.specialtiesJson) && provider.specialtiesJson.length > 0
      ? String(provider.specialtiesJson.join(", "))
      : typeof provider.specialtiesJson === "string"
        ? provider.specialtiesJson
        : "");

  const hasLocation = provider.lat != null && provider.lng != null && !Number.isNaN(provider.lat) && !Number.isNaN(provider.lng);
  const tier = provider.subscriptionTier && provider.subscriptionTier !== "free" ? provider.subscriptionTier : null;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 800,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{provider.name}</h1>
            {provider.verified && (
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  fontWeight: 600,
                }}
              >
                Verified
              </span>
            )}
            {tier && (
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#e3f2fd",
                  color: "#1565c0",
                  fontWeight: 500,
                }}
              >
                {tier}
              </span>
            )}
          </div>
          <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
            Provider record used when requesting medical records.
          </p>
        </div>
        <InviteProviderButton providerId={id} />
      </div>

      {hasLocation && (
        <MapCard lat={provider.lat!} lng={provider.lng!} name={provider.name} />
      )}

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Contact</h2>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <div>{provider.address}</div>
          <div>
            {provider.city}, {provider.state}
          </div>
          {provider.phone && (
            <div>
              <strong>Phone:</strong> {provider.phone}
            </div>
          )}
          {provider.fax && (
            <div>
              <strong>Fax:</strong> {provider.fax}
            </div>
          )}
          {provider.email && (
            <div>
              <strong>Email:</strong> {provider.email}
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Details</h2>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <div>
            <strong>Specialties:</strong> {specialties || "—"}
          </div>
          {provider.createdAt && (
            <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>
              Added {new Date(provider.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Related cases
        </h2>
        {cases.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {cases.map((c) => (
              <li
                key={c.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f3f3",
                }}
              >
                <Link
                  href={`/cases/${c.id}`}
                  style={{
                    fontWeight: 500,
                    color: "#111",
                    textDecoration: "none",
                  }}
                >
                  {c.title || c.caseNumber || c.clientName || c.id}
                </Link>
                {(c.caseNumber || c.clientName || c.relationship) && (
                  <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>
                    {[c.caseNumber, c.clientName, c.relationship].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            No cases linked to this provider yet.
          </p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Recent records requests
        </h2>
        {recordsRequests.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {recordsRequests.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f3f3",
                }}
              >
                <Link
                  href={`/records-requests/${r.id}`}
                  style={{ fontWeight: 500, color: "#111", textDecoration: "none" }}
                >
                  {r.providerName}
                </Link>
                <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>
                  {r.status}
                  {r.caseId && (
                    <>
                      {" · "}
                      <Link href={`/cases/${r.caseId}`} style={{ color: "#06c", textDecoration: "underline" }}>
                        Case
                      </Link>
                    </>
                  )}
                </span>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            No records requests for this provider yet.
          </p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Recent timeline events
        </h2>
        {timelineEvents.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {timelineEvents.map((ev) => (
              <li
                key={ev.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f3f3",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#f5f5f5",
                      color: "#333",
                    }}
                  >
                    {ev.track}
                  </span>
                  {ev.eventDate && (
                    <span style={{ fontSize: 13, color: "#666" }}>
                      {new Date(ev.eventDate).toLocaleDateString()}
                    </span>
                  )}
                  <strong>{ev.eventType ?? "Event"}</strong>
                </div>
                {(ev.provider || ev.diagnosis) && (
                  <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                    {[ev.provider, ev.diagnosis].filter(Boolean).join(" · ")}
                  </div>
                )}
                <div style={{ marginTop: 4 }}>
                  <Link
                    href={`/documents/${ev.documentId}`}
                    style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}
                  >
                    View document
                  </Link>
                  {ev.caseId && (
                    <>
                      {" · "}
                      <Link
                        href={`/cases/${ev.caseId}/timeline`}
                        style={{ fontSize: 12, color: "#06c", textDecoration: "underline" }}
                      >
                        Case timeline
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            No timeline events involving this provider yet.
          </p>
        )}
      </section>

      <p style={{ fontSize: 14, marginTop: 20 }}>
        <Link
          href="/providers"
          style={{ color: "#06c", textDecoration: "underline" }}
        >
          ← Back to provider directory
        </Link>
      </p>
    </main>
  );
}

