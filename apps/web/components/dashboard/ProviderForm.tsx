"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

export type ProviderFormValues = {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  fax: string;
  email: string;
  specialty: string;
};

type ProviderRecord = ProviderFormValues & {
  id: string;
  verified?: boolean | null;
  subscriptionTier?: string | null;
  createdAt?: string | null;
};

type ProviderFormProps = {
  mode: "create" | "edit";
  providerId?: string;
  initialValues?: Partial<ProviderFormValues>;
  onSuccess?: (provider: ProviderRecord) => void;
};

const EMPTY_VALUES: ProviderFormValues = {
  name: "",
  address: "",
  city: "",
  state: "",
  phone: "",
  fax: "",
  email: "",
  specialty: "",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.375rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--onyx-text-muted)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "2.5rem",
};

function normalizeInitialValues(initialValues?: Partial<ProviderFormValues>): ProviderFormValues {
  return {
    name: initialValues?.name ?? "",
    address: initialValues?.address ?? "",
    city: initialValues?.city ?? "",
    state: initialValues?.state ?? "",
    phone: initialValues?.phone ?? "",
    fax: initialValues?.fax ?? "",
    email: initialValues?.email ?? "",
    specialty: initialValues?.specialty ?? "",
  };
}

export function ProviderForm({ mode, providerId, initialValues, onSuccess }: ProviderFormProps) {
  const [values, setValues] = useState<ProviderFormValues>(normalizeInitialValues(initialValues));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setValues(normalizeInitialValues(initialValues));
  }, [initialValues]);

  function updateField(field: keyof ProviderFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function buildPayload() {
    const required = {
      name: values.name.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
    };

    const optionalValue = (value: string) => {
      const trimmed = value.trim();
      if (mode === "edit") return trimmed;
      return trimmed || null;
    };

    return {
      ...required,
      phone: optionalValue(values.phone),
      fax: optionalValue(values.fax),
      email: optionalValue(values.email),
      specialty: optionalValue(values.specialty),
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const endpoint = mode === "create" ? `${getApiBase()}/providers` : `${getApiBase()}/providers/${providerId}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify(buildPayload()),
      });
      const data = (await parseJsonResponse(response)) as { error?: string; id?: string } & ProviderRecord;
      if (!response.ok || typeof data?.id !== "string") {
        setError(data?.error ?? (mode === "create" ? "Failed to create provider." : "Failed to update provider."));
        return;
      }

      setSuccess(mode === "create" ? "Provider created." : "Provider details updated.");
      if (mode === "create") {
        setValues(EMPTY_VALUES);
      } else {
        setValues(normalizeInitialValues(data));
      }
      onSuccess?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {(error || success) && (
        <div
          className="onyx-card"
          style={{
            padding: "0.875rem 1rem",
            borderColor: error ? "var(--onyx-error)" : "var(--onyx-success)",
            background: error ? "rgba(239, 68, 68, 0.06)" : "rgba(34, 197, 94, 0.08)",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, color: error ? "var(--onyx-error)" : "var(--onyx-success)" }}>
            {error ?? success}
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`provider-name-${mode}`} style={labelStyle}>
            Provider name <span style={{ color: "var(--onyx-error)" }}>*</span>
          </label>
          <input
            id={`provider-name-${mode}`}
            value={values.name}
            onChange={(event) => updateField("name", event.target.value)}
            className="onyx-input"
            style={inputStyle}
            required
          />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`provider-address-${mode}`} style={labelStyle}>
            Address <span style={{ color: "var(--onyx-error)" }}>*</span>
          </label>
          <input
            id={`provider-address-${mode}`}
            value={values.address}
            onChange={(event) => updateField("address", event.target.value)}
            className="onyx-input"
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label htmlFor={`provider-city-${mode}`} style={labelStyle}>
            City <span style={{ color: "var(--onyx-error)" }}>*</span>
          </label>
          <input
            id={`provider-city-${mode}`}
            value={values.city}
            onChange={(event) => updateField("city", event.target.value)}
            className="onyx-input"
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label htmlFor={`provider-state-${mode}`} style={labelStyle}>
            State <span style={{ color: "var(--onyx-error)" }}>*</span>
          </label>
          <input
            id={`provider-state-${mode}`}
            value={values.state}
            onChange={(event) => updateField("state", event.target.value)}
            className="onyx-input"
            style={inputStyle}
            required
          />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`provider-specialty-${mode}`} style={labelStyle}>Specialty</label>
          <input
            id={`provider-specialty-${mode}`}
            value={values.specialty}
            onChange={(event) => updateField("specialty", event.target.value)}
            className="onyx-input"
            style={inputStyle}
            placeholder="e.g. Orthopedics, Radiology"
          />
        </div>

        <div>
          <label htmlFor={`provider-phone-${mode}`} style={labelStyle}>Phone</label>
          <input
            id={`provider-phone-${mode}`}
            value={values.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className="onyx-input"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor={`provider-fax-${mode}`} style={labelStyle}>Fax</label>
          <input
            id={`provider-fax-${mode}`}
            value={values.fax}
            onChange={(event) => updateField("fax", event.target.value)}
            className="onyx-input"
            style={inputStyle}
          />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`provider-email-${mode}`} style={labelStyle}>Email</label>
          <input
            id={`provider-email-${mode}`}
            type="email"
            value={values.email}
            onChange={(event) => updateField("email", event.target.value)}
            className="onyx-input"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <button type="submit" disabled={saving} className="onyx-btn-primary">
          {saving ? (mode === "create" ? "Creating..." : "Saving...") : (mode === "create" ? "Create provider" : "Save provider")}
        </button>
      </div>
    </form>
  );
}
