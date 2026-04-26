"use client";

import { useState } from "react";

type DemandTemplate = {
  id: string;
  firmId: string | null;
  firmName: string | null;
  name: string;
  caseType: string | null;
  demandType: string | null;
  version: number;
  isActive: boolean;
  requiredSections: string[];
  structureJson: Record<string, unknown> | null;
  examplesText: string | null;
  updatedAt: string;
};

const DEFAULT_SECTIONS = [
  "facts_liability",
  "injuries",
  "treatment_chronology",
  "bills",
  "missing_records",
  "damages",
  "demand_amount",
  "exhibits",
];

export function DemandTemplateManager({ initialItems }: { initialItems: DemandTemplate[] }) {
  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [firmId, setFirmId] = useState("");
  const [demandType, setDemandType] = useState("demand_package");
  const [sections, setSections] = useState(DEFAULT_SECTIONS.join("\n"));
  const [structureJsonText, setStructureJsonText] = useState(JSON.stringify({
    liability_section: "Facts and liability first, followed by causation.",
    injuries_section: "Summarize documented injuries only.",
    chronology_style: "Date-ordered treatment chronology with source citations.",
    billing_explanation_style: "Separate billed, paid, and outstanding amounts.",
    tone: "assertive",
    closing_format: "Review-required demand closing.",
  }, null, 2));
  const [examplesText, setExamplesText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSections, setEditSections] = useState("");
  const [editStructureJsonText, setEditStructureJsonText] = useState("");
  const [editExamplesText, setEditExamplesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function parseStructureJson(value: string): Record<string, unknown> | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Structure JSON must be an object.");
    }
    return parsed as Record<string, unknown>;
  }

  async function refresh() {
    const response = await fetch("/api/admin/demand-templates?includeInactive=1", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
  }

  async function createTemplate() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/demand-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: firmId.trim() || null,
          name: name.trim(),
          demandType: demandType.trim() || null,
          requiredSections: sections
            .split(/\r?\n|,/)
            .map((section) => section.trim())
            .filter(Boolean),
          structureJson: parseStructureJson(structureJsonText),
          examplesText: examplesText.trim() || null,
          isActive: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setName("");
      setExamplesText("");
      await refresh();
      setMessage("Template created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create template.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(template: DemandTemplate) {
    setEditingId(template.id);
    setEditSections(template.requiredSections.join("\n"));
    setEditStructureJsonText(JSON.stringify(template.structureJson ?? {}, null, 2));
    setEditExamplesText(template.examplesText ?? "");
    setMessage(null);
  }

  async function saveTemplate(template: DemandTemplate) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/demand-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requiredSections: editSections
            .split(/\r?\n|,/)
            .map((section) => section.trim())
            .filter(Boolean),
          structureJson: parseStructureJson(editStructureJsonText),
          examplesText: editExamplesText.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setEditingId(null);
      await refresh();
      setMessage("Template updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update template.");
    } finally {
      setSaving(false);
    }
  }

  async function createNewVersion(template: DemandTemplate) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/demand-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId: template.firmId,
          name: template.name,
          caseType: template.caseType,
          demandType: template.demandType,
          version: template.version + 1,
          isActive: true,
          requiredSections: editSections
            .split(/\r?\n|,/)
            .map((section) => section.trim())
            .filter(Boolean),
          structureJson: parseStructureJson(editStructureJsonText),
          examplesText: editExamplesText.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      await fetch(`/api/admin/demand-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }).catch(() => undefined);
      setEditingId(null);
      await refresh();
      setMessage(`Created ${template.name} v${template.version + 1}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create new version.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(template: DemandTemplate) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/demand-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      await refresh();
      setMessage(template.isActive ? "Template deactivated." : "Template activated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Create template</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Firm ID (optional)
            <input value={firmId} onChange={(event) => setFirmId(event.target.value)} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Demand type
            <input value={demandType} onChange={(event) => setDemandType(event.target.value)} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
          </label>
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: 13, marginTop: 12 }}>
          Required sections
          <textarea value={sections} onChange={(event) => setSections(event.target.value)} rows={6} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, marginTop: 12 }}>
          Template structure JSON
          <textarea value={structureJsonText} onChange={(event) => setStructureJsonText(event.target.value)} rows={8} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontFamily: "monospace" }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, marginTop: 12 }}>
          OpenAI structure/examples
          <textarea value={examplesText} onChange={(event) => setExamplesText(event.target.value)} rows={5} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
        </label>
        <button type="button" onClick={createTemplate} disabled={saving || !name.trim()} style={{ marginTop: 12, padding: "9px 14px", borderRadius: 6, border: "none", background: "#111", color: "#fff" }}>
          {saving ? "Saving..." : "Create template"}
        </button>
        {message ? <span style={{ marginLeft: 12, fontSize: 13 }}>{message}</span> : null}
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Templates</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((template) => (
            <article key={template.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{template.name} v{template.version}</h3>
                  <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
                    {template.firmName ?? "Default/global"} | {template.demandType ?? "any demand"} | {template.isActive ? "active" : "inactive"}
                  </p>
                </div>
                <button type="button" onClick={() => toggleTemplate(template)} disabled={saving} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #111", background: template.isActive ? "#fff" : "#111", color: template.isActive ? "#111" : "#fff" }}>
                  {template.isActive ? "Deactivate" : "Activate"}
                </button>
                <button type="button" onClick={() => startEdit(template)} disabled={saving} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111" }}>
                  Edit/version
                </button>
              </div>
              <p style={{ margin: "10px 0 0", color: "#444", fontSize: 13 }}>
                Sections: {template.requiredSections.join(", ")}
              </p>
              {editingId === template.id ? (
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Required sections
                    <textarea value={editSections} onChange={(event) => setEditSections(event.target.value)} rows={5} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Structure JSON
                    <textarea value={editStructureJsonText} onChange={(event) => setEditStructureJsonText(event.target.value)} rows={7} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontFamily: "monospace" }} />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Examples/style guidance
                    <textarea value={editExamplesText} onChange={(event) => setEditExamplesText(event.target.value)} rows={4} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }} />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => saveTemplate(template)} disabled={saving} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #111", background: "#111", color: "#fff" }}>
                      Save changes
                    </button>
                    <button type="button" onClick={() => createNewVersion(template)} disabled={saving} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #111", background: "#fff", color: "#111" }}>
                      Save as v{template.version + 1}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={saving} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", color: "#333" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
          {items.length === 0 ? <p style={{ color: "#666" }}>No templates yet. Demand generation will use the default template.</p> : null}
        </div>
      </section>
    </div>
  );
}
