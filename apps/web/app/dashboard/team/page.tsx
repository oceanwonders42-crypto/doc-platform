"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { useDashboardAuth, canAccessTeam } from "@/contexts/DashboardAuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type TeamUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  displayName: string;
};

export default function TeamPage() {
  const { role, checked } = useDashboardAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"STAFF" | "ADMIN" | "READ_ONLY">("STAFF");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !canAccessTeam(role)) return;
    const base = getApiBase();
    if (!base) return;
    fetch(`${base}/me/team`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then((res) => (res.ok ? parseJsonResponse(res) : null))
      .then((data: unknown) => {
        const d = data as { ok?: boolean; users?: TeamUser[] };
        if (d?.ok && Array.isArray(d.users)) setUsers(d.users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [checked, role]);

  if (checked && !canAccessTeam(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage the team.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const base = getApiBase();
    if (!base) {
      setError("API not configured");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`${base}/me/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string; user?: TeamUser };
      if (res.ok && data.ok && data.user) {
        setUsers((prev) => [data.user!, ...prev]);
        setInviteEmail("");
      } else {
        setError(data.error ?? "Invite failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const updateUser = async (userId: string, updates: { role?: string; status?: string }) => {
    const base = getApiBase();
    if (!base) return;
    const res = await fetch(`${base}/me/team/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify(updates),
      ...getFetchOptions(),
    });
    if (res.ok) {
      const data = (await parseJsonResponse(res)) as { ok?: boolean };
      if (data.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, role: updates.role ?? u.role, status: updates.status ?? u.status }
              : u
          )
        );
      }
    }
  };

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Team" }]}
        title="Team"
        description="Manage users and roles for your firm."
      />

      <DashboardCard title="Invite user" style={{ marginBottom: "1.5rem" }}>
        <form onSubmit={handleInvite} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="invite-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "var(--onyx-dash-font-sm)" }}>
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@firm.com"
              className="onyx-input"
              style={{ width: "100%" }}
              required
            />
          </div>
          <div>
            <label htmlFor="invite-role" style={{ display: "block", marginBottom: "0.25rem", fontSize: "var(--onyx-dash-font-sm)" }}>
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "STAFF" | "ADMIN" | "READ_ONLY")}
              className="onyx-input"
              style={{ minWidth: 120 }}
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
              <option value="READ_ONLY">Read only</option>
            </select>
          </div>
          <button type="submit" disabled={submitting} className="onyx-btn-primary">
            {submitting ? "Inviting…" : "Invite"}
          </button>
        </form>
        {error && <p style={{ margin: "0.75rem 0 0", color: "var(--onyx-error)", fontSize: "var(--onyx-dash-font-sm)" }}>{error}</p>}
      </DashboardCard>

      <DashboardCard title="Firm users">
        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
        ) : (
          <div className="onyx-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName || "—"}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="onyx-badge onyx-badge-neutral">{u.role}</span>
                    </td>
                    <td>{u.status}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      {u.role !== "OWNER" && (
                        <>
                          <select
                            value={u.role}
                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                            className="onyx-input"
                            style={{ marginRight: 4, padding: "0.25rem 0.5rem", fontSize: "var(--onyx-dash-font-xs)" }}
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="STAFF">Staff</option>
                            <option value="READ_ONLY">Read only</option>
                          </select>
                          {u.status === "ACTIVE" ? (
                            <button type="button" className="onyx-btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "var(--onyx-dash-font-xs)" }} onClick={() => updateUser(u.id, { status: "DISABLED" })}>
                              Disable
                            </button>
                          ) : (
                            <button type="button" className="onyx-btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "var(--onyx-dash-font-xs)" }} onClick={() => updateUser(u.id, { status: "ACTIVE" })}>
                              Enable
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
