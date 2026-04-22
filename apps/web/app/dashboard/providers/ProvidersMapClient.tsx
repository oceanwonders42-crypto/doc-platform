"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MapProvider = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
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

export default function ProvidersMapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [items, setItems] = useState<MapProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState("");
  const [centerLat, setCenterLat] = useState("");
  const [centerLng, setCenterLng] = useState("");

  const loadProviders = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (specialty.trim()) params.set("specialty", specialty.trim());
    if (city.trim()) params.set("city", city.trim());
    if (radius.trim()) params.set("radius", radius.trim());
    if (centerLat.trim()) params.set("lat", centerLat.trim());
    if (centerLng.trim()) params.set("lng", centerLng.trim());
    try {
      const res = await fetch(`/api/providers/search?${params}`);
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

      const valid = items.filter((p) => p.lat != null && p.lng != null) as (MapProvider & { lat: number; lng: number })[];
      const center: [number, number] = valid.length > 0 ? [valid[0].lat, valid[0].lng] : [39.5, -98.5];
      const map = L.map(containerRef.current, { center, zoom: valid.length > 0 ? 10 : 4 });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      valid.forEach((p) => {
        const marker = L.marker([p.lat, p.lng]).addTo(map);
        marker.bindPopup(
          `<div style="min-width:180px"><strong><a href="/providers/${p.id}">${escapeHtml(p.name)}</a></strong><br/>${escapeHtml(p.address)}<br/>${escapeHtml(p.city)}, ${escapeHtml(p.state)}${p.specialty ? `<br/><em>${escapeHtml(p.specialty)}</em>` : ""}</div>`
        );
      });

      if (valid.length > 1) {
        const lats = valid.map((p) => p.lat);
        const lngs = valid.map((p) => p.lng);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ];
        try {
          map.fitBounds?.(bounds, { padding: [20, 20] });
        } catch {}
      }
    };

    function escapeHtml(s: string) {
      const div = document.createElement("div");
      div.textContent = s;
      return div.innerHTML;
    }

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
    <div style={{ fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <Link href="/dashboard" style={{ color: "#111", textDecoration: "underline", fontSize: 14 }}>
          ← Dashboard
        </Link>
        <Link href="/providers" style={{ color: "#111", textDecoration: "underline", fontSize: 14 }}>
          Provider list
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Provider map</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Treatment providers by location. Add lat/lng on provider profiles to show them here.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 120 }}
        />
        <input
          type="text"
          placeholder="Specialty"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 140 }}
        />
        <input
          type="number"
          placeholder="Radius (km)"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 100 }}
        />
        <input
          type="text"
          placeholder="Center lat"
          value={centerLat}
          onChange={(e) => setCenterLat(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 90 }}
        />
        <input
          type="text"
          placeholder="Center lng"
          value={centerLng}
          onChange={(e) => setCenterLng(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 90 }}
        />
        <button
          type="button"
          onClick={loadProviders}
          disabled={loading}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading…" : "Apply filters"}
        </button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: "#666" }}>
        {items.length} provider{items.length !== 1 ? "s" : ""} with location
      </div>

      <div
        ref={containerRef}
        style={{
          height: 480,
          width: "100%",
          maxWidth: 1000,
          borderRadius: 12,
          border: "1px solid #e5e5e5",
          background: "#f5f5f5",
        }}
      />
      {items.length === 0 && !loading && (
        <p style={{ marginTop: 12, color: "#666", fontSize: 14 }}>
          No providers with coordinates yet. Edit a provider and set lat/lng to show them on the map.
        </p>
      )}
    </div>
  );
}
