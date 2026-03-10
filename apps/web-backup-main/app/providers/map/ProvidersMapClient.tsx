"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MapProvider = {
  id: string;
  name: string;
  address?: string;
  city: string;
  state: string;
  specialty?: string | null;
  lat: number | null;
  lng: number | null;
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
        addTo: (m: unknown) => { bindPopup: (html: string) => void };
        bindPopup: (html: string) => unknown;
      };
    };
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

export default function ProvidersMapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [items, setItems] = useState<MapProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const loadProviders = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("onlyWithGeo", "true");
    if (q.trim()) params.set("q", q.trim());
    if (specialty.trim()) params.set("specialty", specialty.trim());
    if (city.trim()) params.set("city", city.trim());
    if (state.trim()) params.set("state", state.trim());
    try {
      const res = await fetch(`/api/providers?${params}`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
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

      const valid = items.filter(
        (p) => p.lat != null && p.lng != null
      ) as (MapProvider & { lat: number; lng: number })[];

      const center: [number, number] =
        valid.length > 0 ? [valid[0].lat, valid[0].lng] : [39.5, -98.5];
      const map = L.map(containerRef.current, {
        center,
        zoom: valid.length > 0 ? 10 : 4,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      valid.forEach((p) => {
        const popupHtml = `
          <div style="min-width:220px;padding:4px 0">
            <strong>${escapeHtml(p.name)}</strong><br/>
            ${p.address ? `${escapeHtml(p.address)}<br/>` : ""}
            ${escapeHtml(p.city)}, ${escapeHtml(p.state)}
            ${p.specialty ? `<br/><em style="font-size:12px">${escapeHtml(p.specialty)}</em>` : ""}
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
              <a href="/providers/${p.id}" style="font-size:13px">View Provider →</a>
              <a href="/cases?provider=${encodeURIComponent(p.id)}" style="font-size:13px">View linked cases →</a>
            </div>
          </div>
        `;
        const marker = L.marker([p.lat, p.lng]).addTo(map);
        marker.bindPopup(popupHtml);
      });

      if (valid.length > 1) {
        const lats = valid.map((p) => p.lat);
        const lngs = valid.map((p) => p.lng);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ];
        try {
          if ((map as { fitBounds?: unknown }).fitBounds) {
            (map as { fitBounds: (b: [[number, number], [number, number]], opts?: { padding?: [number, number] }) => void }).fitBounds(
              bounds,
              { padding: [20, 20] }
            );
          }
        } catch {}
      }
    };

    if (window.L) {
      loadLeaflet();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = loadLeaflet;
    document.body.appendChild(script);

    return () => {
      script.remove();
      link.remove();
      if (mapRef.current) {
        try {
          (mapRef.current as { remove?: () => void }).remove?.();
        } catch {}
        mapRef.current = null;
      }
    };
  }, [items]);

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        gap: 20,
        minHeight: 520,
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Link href="/providers" style={{ color: "#111", textDecoration: "underline", fontSize: 14 }}>
          ← Provider directory
        </Link>
        <Link href="/dashboard/providers/map" style={{ color: "#666", textDecoration: "underline", fontSize: 14 }}>
          Dashboard map (advanced filters)
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Provider map</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Providers with location data. Click a pin for details.
      </p>

      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Name, city, specialty..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              City
            </label>
            <input
              type="text"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              State
            </label>
            <input
              type="text"
              placeholder="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Specialty
            </label>
            <input
              type="text"
              placeholder="Specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 14,
              }}
            />
          </div>
          <button
            type="button"
            onClick={loadProviders}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Loading…" : "Apply filters"}
          </button>

          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {items.length} provider{items.length !== 1 ? "s" : ""} with location
          </div>
          <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Click a pin to open a card with provider details and View Provider link.
          </p>
        </aside>

        <div
          ref={containerRef}
          style={{
            flex: 1,
            minHeight: 400,
            borderRadius: 12,
            border: "1px solid #e5e5e5",
            background: "#f5f5f5",
          }}
        />
      </div>

      {items.length === 0 && !loading && (
        <p style={{ marginTop: 12, color: "#666", fontSize: 14 }}>
          No providers with coordinates match. Add lat/lng on provider records to show them here.
        </p>
      )}
    </div>
  );
}
