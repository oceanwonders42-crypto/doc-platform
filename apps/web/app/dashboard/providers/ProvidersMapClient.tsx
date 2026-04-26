"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

type MapProvider = {
  id: string;
  name: string;
  type?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  lat: number | null;
  lng: number | null;
  linkedCaseCount?: number;
  recordsRequestCount?: number;
  linkedCases?: Array<{
    id: string;
    title: string | null;
    caseNumber: string | null;
    clientName: string | null;
    status: string | null;
    relationship?: string | null;
  }>;
  recordsRequestHistory?: Array<{
    id: string;
    status: string;
    sentAt: string | null;
    dueAt: string | null;
    createdAt: string;
  }>;
};

type ProviderCategory = {
  key: string;
  label: string;
};

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts?: { center: [number, number]; zoom: number }) => {
        addTo: (m: unknown) => unknown;
        remove?: () => void;
        fitBounds?: (b: [[number, number], [number, number]], opts?: { padding?: [number, number] }) => void;
      };
      tileLayer: (url: string, opts?: unknown) => { addTo: (m: unknown) => unknown };
      marker: (latlng: [number, number], opts?: unknown) => {
        addTo: (m: unknown) => {
          bindPopup: (html: string) => void;
          on?: (event: string, handler: () => void) => void;
        };
        bindPopup: (html: string) => unknown;
      };
    };
  }
}

const CATEGORIES: ProviderCategory[] = [
  { key: "", label: "All categories" },
  { key: "chiropractor", label: "Chiropractor" },
  { key: "orthopedic", label: "Orthopedic" },
  { key: "imaging", label: "Imaging / MRI" },
  { key: "pain_management", label: "Pain management" },
  { key: "physical_therapy", label: "Physical therapy" },
  { key: "neurologist", label: "Neurologist" },
  { key: "hospital_er", label: "Hospital / ER" },
  { key: "other", label: "Other" },
];

const STATES = ["", "FL", "GA", "AL", "SC", "NC", "TX", "CA", "NY", "NJ", "PA"];

function escapeHtml(value: string | null | undefined): string {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function providerLocation(provider: MapProvider): string {
  return [provider.address, provider.city, provider.state].filter(Boolean).join(", ") || "Needs location";
}

function categoryLabel(value: string | null | undefined): string {
  return CATEGORIES.find((item) => item.key === value)?.label ?? "Other";
}

export default function ProvidersMapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [items, setItems] = useState<MapProvider[]>([]);
  const [needsLocation, setNeedsLocation] = useState<MapProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<MapProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState("FL");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");

  const loadProviders = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (stateFilter.trim()) params.set("state", stateFilter.trim());
    if (category.trim()) params.set("category", category.trim());
    if (city.trim()) params.set("city", city.trim());
    params.set("includeNeedsLocation", "true");

    try {
      const response = await fetch(`${getApiBase()}/providers/map?${params.toString()}`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        items?: MapProvider[];
        needsLocation?: MapProvider[];
        error?: string;
      };
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? "Failed to load providers.");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setNeedsLocation(Array.isArray(data.needsLocation) ? data.needsLocation : []);
      setSelectedProvider(null);
    } catch (requestError) {
      setItems([]);
      setNeedsLocation([]);
      setError(requestError instanceof Error ? requestError.message : "Failed to load providers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const loadLeaflet = () => {
      const L = window.L;
      if (!L || !containerRef.current) return;

      if (mapRef.current) {
        try {
          (mapRef.current as { remove?: () => void }).remove?.();
        } catch {}
        mapRef.current = null;
      }

      const valid = items.filter((provider) => provider.lat != null && provider.lng != null) as (MapProvider & {
        lat: number;
        lng: number;
      })[];
      const center: [number, number] = valid.length > 0 ? [valid[0].lat, valid[0].lng] : [27.8, -81.7];
      const map = L.map(containerRef.current, { center, zoom: valid.length > 0 ? 9 : 6 });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      valid.forEach((provider) => {
        const marker = L.marker([provider.lat, provider.lng]).addTo(map);
        marker.bindPopup(
          `<div style="min-width:190px"><strong><a href="/dashboard/providers/${provider.id}">${escapeHtml(provider.name)}</a></strong><br/>${escapeHtml(providerLocation(provider))}<br/><em>${escapeHtml(categoryLabel(provider.type))}</em>${provider.specialty ? `<br/>${escapeHtml(provider.specialty)}` : ""}</div>`
        );
        marker.on?.("click", () => setSelectedProvider(provider));
      });

      if (valid.length > 1) {
        const lats = valid.map((provider) => provider.lat);
        const lngs = valid.map((provider) => provider.lng);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ];
        try {
          map.fitBounds?.(bounds, { padding: [24, 24] });
        } catch {}
      }
    };

    if (window.L) {
      loadLeaflet();
      return;
    }

    const existingStylesheet = document.querySelector('link[data-onyx-leaflet="true"]');
    const existingScript = document.querySelector('script[data-onyx-leaflet="true"]');
    const link = existingStylesheet ?? document.createElement("link");
    if (!existingStylesheet) {
      link.setAttribute("data-onyx-leaflet", "true");
      (link as HTMLLinkElement).rel = "stylesheet";
      (link as HTMLLinkElement).href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const script = existingScript ?? document.createElement("script");
    if (!existingScript) {
      script.setAttribute("data-onyx-leaflet", "true");
      (script as HTMLScriptElement).src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      (script as HTMLScriptElement).onload = loadLeaflet;
      document.body.appendChild(script);
    } else {
      script.addEventListener("load", loadLeaflet, { once: true });
    }

    return () => {
      if (mapRef.current) {
        try {
          (mapRef.current as { remove?: () => void }).remove?.();
        } catch {}
        mapRef.current = null;
      }
    };
  }, [items]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 750, margin: 0 }}>Providers Map by State</h1>
          <p style={{ color: "var(--onyx-text-muted)", fontSize: 14, margin: "0.35rem 0 0", lineHeight: 1.5 }}>
            Real provider pins only. Providers without coordinates are listed as needing location instead of being faked.
          </p>
        </div>
        <Link href="/dashboard/providers" className="onyx-link">
          Provider directory
        </Link>
      </div>

      <div
        className="onyx-card"
        style={{ padding: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          State
          <select className="onyx-input" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            {STATES.map((state) => (
              <option key={state || "all"} value={state}>
                {state || "All states"}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          Provider type
          <select className="onyx-input" value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((item) => (
              <option key={item.key || "all"} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          City
          <input
            type="text"
            className="onyx-input"
            placeholder="Optional"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button type="button" onClick={loadProviders} disabled={loading} className="onyx-btn-primary">
            {loading ? "Loading..." : "Apply filters"}
          </button>
        </div>
      </div>

      {error ? <p style={{ color: "var(--onyx-error)", margin: 0, fontSize: 14 }}>{error}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.6fr)", gap: "1rem" }}>
        <div
          ref={containerRef}
          style={{
            height: 520,
            width: "100%",
            borderRadius: "var(--onyx-radius-lg)",
            border: "1px solid var(--onyx-border-subtle)",
            background: "#eef1ec",
            overflow: "hidden",
          }}
        />

        <aside style={{ display: "grid", gap: "1rem", alignContent: "start" }}>
          <div className="onyx-card" style={{ padding: "1rem" }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--onyx-text-muted)" }}>Visible pins</p>
            <p style={{ margin: "0.2rem 0 0", fontSize: 28, fontWeight: 750 }}>{items.length}</p>
            <p style={{ margin: "0.2rem 0 0", fontSize: 13, color: "var(--onyx-text-muted)" }}>
              {needsLocation.length} provider{needsLocation.length === 1 ? "" : "s"} need coordinates.
            </p>
          </div>

          {selectedProvider ? (
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{selectedProvider.name}</h2>
              <p style={{ margin: "0.4rem 0 0", fontSize: 13, color: "var(--onyx-text-muted)" }}>
                {providerLocation(selectedProvider)}
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: 13 }}>
                <span className="onyx-badge onyx-badge-info">{categoryLabel(selectedProvider.type)}</span>
              </p>
              {selectedProvider.specialty ? (
                <p style={{ margin: "0.4rem 0 0", fontSize: 13 }}>{selectedProvider.specialty}</p>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.75rem" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--onyx-text-muted)" }}>Linked cases</p>
                  <p style={{ margin: "0.1rem 0 0", fontWeight: 700 }}>{selectedProvider.linkedCaseCount ?? selectedProvider.linkedCases?.length ?? 0}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--onyx-text-muted)" }}>Records requests</p>
                  <p style={{ margin: "0.1rem 0 0", fontWeight: 700 }}>{selectedProvider.recordsRequestCount ?? selectedProvider.recordsRequestHistory?.length ?? 0}</p>
                </div>
              </div>
              {selectedProvider.linkedCases && selectedProvider.linkedCases.length > 0 ? (
                <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--onyx-text-muted)" }}>Cases</p>
                  {selectedProvider.linkedCases.slice(0, 4).map((legalCase) => (
                    <Link key={legalCase.id} href={`/dashboard/cases/${legalCase.id}`} className="onyx-link" style={{ fontSize: 13 }}>
                      {legalCase.clientName ?? legalCase.caseNumber ?? legalCase.title ?? legalCase.id}
                    </Link>
                  ))}
                </div>
              ) : null}
              {selectedProvider.recordsRequestHistory && selectedProvider.recordsRequestHistory.length > 0 ? (
                <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--onyx-text-muted)" }}>Records request history</p>
                  {selectedProvider.recordsRequestHistory.slice(0, 4).map((request) => (
                    <span key={request.id} style={{ fontSize: 13, color: "var(--onyx-text-secondary)" }}>
                      {request.status} - {request.sentAt ? new Date(request.sentAt).toLocaleDateString() : new Date(request.createdAt).toLocaleDateString()}
                    </span>
                  ))}
                </div>
              ) : null}
              <Link href={`/dashboard/providers/${selectedProvider.id}`} className="onyx-link" style={{ display: "inline-block", marginTop: "0.6rem" }}>
                Open provider
              </Link>
            </div>
          ) : null}

          <div className="onyx-card" style={{ padding: "1rem" }}>
            <h2 style={{ margin: "0 0 0.65rem", fontSize: 16 }}>Provider list</h2>
            {items.length === 0 && !loading ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--onyx-text-muted)" }}>
                No providers with coordinates match these filters.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem", maxHeight: 230, overflow: "auto" }}>
                {items.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setSelectedProvider(provider)}
                    style={{
                      textAlign: "left",
                      border: "1px solid var(--onyx-border-subtle)",
                      borderRadius: 10,
                      background: "var(--onyx-background-surface)",
                      padding: "0.65rem",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{provider.name}</strong>
                    <span className="onyx-badge onyx-badge-info" style={{ marginTop: "0.35rem" }}>
                      {categoryLabel(provider.type)}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--onyx-text-muted)" }}>
                      {providerLocation(provider)}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--onyx-text-muted)" }}>
                      {provider.linkedCaseCount ?? 0} linked case{(provider.linkedCaseCount ?? 0) === 1 ? "" : "s"} | {provider.recordsRequestCount ?? 0} request{(provider.recordsRequestCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {needsLocation.length > 0 ? (
            <div className="onyx-card" style={{ padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.65rem", fontSize: 16 }}>Needs location</h2>
              <div style={{ display: "grid", gap: "0.45rem", maxHeight: 180, overflow: "auto" }}>
                {needsLocation.map((provider) => (
                  <Link key={provider.id} href={`/dashboard/providers/${provider.id}`} className="onyx-link">
                    {provider.name}
                    <span style={{ display: "block", fontSize: 12, color: "var(--onyx-text-muted)" }}>
                      {provider.city || provider.state ? [provider.city, provider.state].filter(Boolean).join(", ") : "No city/state stored"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
