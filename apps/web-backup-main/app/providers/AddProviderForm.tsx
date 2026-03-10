"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddProviderForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          phone: phone.trim() || null,
          fax: fax.trim() || null,
          email: email.trim() || null,
          specialty: specialty.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      if (data.id) {
        router.push(`/providers/${data.id}`);
        return;
      }
      setName("");
      setAddress("");
      setCity("");
      setState("");
      setPhone("");
      setFax("");
      setEmail("");
      setSpecialty("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add provider");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 520,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Add provider</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Address *</label>
          <input
            type="text"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>City *</label>
          <input
            type="text"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>State *</label>
          <input
            type="text"
            required
            value={state}
            onChange={(e) => setState(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Specialty</label>
          <input
            type="text"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="e.g. Orthopedics, Radiology"
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Fax</label>
          <input
            type="text"
            value={fax}
            onChange={(e) => setFax(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
      </div>
      {error && <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{
          alignSelf: "flex-start",
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Adding…" : "Add provider"}
      </button>
    </form>
  );
}
