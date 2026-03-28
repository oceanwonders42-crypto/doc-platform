/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

type Provider = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  specialtiesJson?: any;
};

export function RequestRecordsForm({ caseId, providers }: { caseId: string; providers: Provider[] }) {
  const [providerId, setProviderId] = useState<string>("");
  const [contactName, setContactName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [fax, setFax] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  function handleProviderChange(nextId: string) {
    setProviderId(nextId);
    const selected = providers.find((p) => p.id === nextId);
    if (!selected) {
      return;
    }

    setPhone(selected.phone ?? "");
    setFax(selected.fax ?? "");
    setEmail(selected.email ?? "");
    setAddress(`${selected.address}, ${selected.city}, ${selected.state}`);

    if (!contactName) {
      setContactName(selected.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Not wired up yet – this will send a records request in a future iteration.");
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
          Provider
        </label>
        <select
          value={providerId}
          onChange={(e) => handleProviderChange(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        >
          <option value="">Select a provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.city}, {p.state}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
          Attention / contact name
        </label>
        <input
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Address</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Fax</label>
          <input
            type="text"
            value={fax}
            onChange={(e) => setFax(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
      </div>

      <button
        type="submit"
        style={{
          marginTop: 6,
          alignSelf: "flex-start",
          padding: "8px 16px",
          borderRadius: 999,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Request records
      </button>

      {status && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          {status} (case {caseId}, providerId {providerId || "—"})
        </div>
      )}
    </form>
  );
}

