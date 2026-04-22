import Link from "next/link";

export const dynamic = "force-dynamic";

type Provider = {
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
};

type ProvidersResponse = {
  items: Provider[];
};

async function fetchProviders(params: {
  q?: string;
  city?: string;
  state?: string;
  specialty?: string;
}): Promise<ProvidersResponse> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.city?.trim()) sp.set("city", params.city.trim());
  if (params.state?.trim()) sp.set("state", params.state.trim());
  if (params.specialty?.trim()) sp.set("specialty", params.specialty.trim());
  const qs = sp.toString();
  const url = qs ? `${base}/api/providers?${qs}` : `${base}/api/providers`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  return res.json();
}

function formatSpecialty(p: Provider): string {
  if (p.specialty?.trim()) return p.specialty;
  if (Array.isArray(p.specialtiesJson) && p.specialtiesJson.length > 0) {
    return String((p.specialtiesJson as string[]).join(", "));
  }
  if (typeof p.specialtiesJson === "string") return p.specialtiesJson;
  return "—";
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; state?: string; specialty?: string }>;
}) {
  const params = await searchParams;
  const data = await fetchProviders(params);

  const items = data.items ?? [];
  const q = params.q ?? "";
  const city = params.city ?? "";
  const state = params.state ?? "";
  const specialty = params.specialty ?? "";

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Provider directory
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        Search for facilities and providers to use when requesting records.{" "}
        <Link
          href="/providers/map"
          style={{ color: "#111", textDecoration: "underline" }}
        >
          View on map
        </Link>
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Link
          href="/providers/new"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          Add Provider
        </Link>
      </div>

      <form
        method="GET"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}
          >
            Search
          </label>
          <input
            type="text"
            name="q"
            placeholder="Name, city, specialty..."
            defaultValue={q}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ width: 140 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}
          >
            City
          </label>
          <input
            type="text"
            name="city"
            placeholder="City"
            defaultValue={city}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ width: 100 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}
          >
            State
          </label>
          <input
            type="text"
            name="state"
            placeholder="State"
            defaultValue={state}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ width: 160 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}
          >
            Specialty
          </label>
          <input
            type="text"
            name="specialty"
            placeholder="Specialty"
            defaultValue={specialty}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Filter
          </button>
        </div>
      </form>

      <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
        Showing {items.length} provider{items.length !== 1 ? "s" : ""}
      </div>

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <th
                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}
              >
                Name
              </th>
              <th
                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}
              >
                City
              </th>
              <th
                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}
              >
                State
              </th>
              <th
                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}
              >
                Phone
              </th>
              <th
                style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600 }}
              >
                Specialty
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                <td style={{ padding: "12px 14px" }}>
                  <Link
                    href={`/providers/${p.id}`}
                    style={{
                      fontWeight: 600,
                      color: "#111",
                      textDecoration: "none",
                    }}
                  >
                    {p.name}
                  </Link>
                  {p.address && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {p.address}
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 14 }}>{p.city}</td>
                <td style={{ padding: "12px 14px", fontSize: 14 }}>{p.state}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#444" }}>
                  {p.phone || "—"}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#444" }}>
                  {formatSpecialty(p)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 24,
                    fontSize: 14,
                    color: "#666",
                    textAlign: "center",
                  }}
                >
                  No providers match this search.{" "}
                  <Link
                    href="/providers/new"
                    style={{ color: "#111", textDecoration: "underline" }}
                  >
                    Add one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
