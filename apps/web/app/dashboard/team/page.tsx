"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatApiClientError, getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { useDashboardAuth, canAccessTeam } from "@/contexts/DashboardAuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";

type CanonicalRole = "PLATFORM_ADMIN" | "FIRM_ADMIN" | "PARALEGAL" | "STAFF";

type TeamUser = {
  id: string;
  email: string;
  role: CanonicalRole;
  status: "ACTIVE" | "PENDING_PASSWORD";
  createdAt: string;
  displayName: string;
};

type TeamResponse = {
  ok?: boolean;
  users?: TeamUser[];
  error?: string;
};

type InviteResponse = {
  ok?: boolean;
  error?: string;
  inviteLink?: string;
  message?: string;
  invite?: {
    role?: CanonicalRole;
    expiresAt?: string;
  };
};

const ROLE_OPTIONS: { value: CanonicalRole; label: string }[] = [
  { value: "FIRM_ADMIN", label: "FIRM_ADMIN" },
  { value: "PARALEGAL", label: "PARALEGAL" },
  { value: "STAFF", label: "STAFF" },
];

function formatRoleLabel(role: CanonicalRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export default function TeamPage() {
  const { role, checked } = useDashboardAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CanonicalRole>("STAFF");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<{
    message: string;
    inviteLink: string;
    expiresAt?: string;
  } | null>(null);

  const base = useMemo(() => getApiBase(), []);

  useEffect(() => {
    if (!checked || !canAccessTeam(role)) return;
    if (!base) {
      setError("API not configured");
      setLoading(false);
      return;
    }
    fetch(`${base}/me/team`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        const payload = data as TeamResponse;
        if (payload?.ok && Array.isArray(payload.users)) {
          setUsers(payload.users);
          setError(null);
          return;
        }
        setError(payload?.error ?? "Failed to load team members.");
      })
      .catch((requestError) =>
        setError(
          formatApiClientError(requestError, "Failed to load team members.", {
            deploymentMessage:
              "The team API returned HTML instead of JSON. Check the active API target and the current web build.",
          })
        )
      )
      .finally(() => setLoading(false));
  }, [base, checked, role]);

  if (checked && !canAccessTeam(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only PLATFORM_ADMIN and FIRM_ADMIN can manage the team.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!base) {
      setError("API not configured");
      return;
    }
    setError(null);
    setInviteNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/me/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as InviteResponse;
      if (res.ok && data.ok && data.inviteLink) {
        setInviteEmail("");
        setInviteNotice({
          message: data.message ?? "Share this invite link with your teammate.",
          inviteLink: data.inviteLink,
          expiresAt: data.invite?.expiresAt,
        });
      } else {
        setError(data.error ?? "Invite failed");
      }
    } catch (requestError) {
      setError(
        formatApiClientError(requestError, "Invite failed.", {
          deploymentMessage:
            "The invite API returned HTML instead of JSON. Check the active API target and the current web build.",
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const updateUserRole = async (userId: string, nextRole: CanonicalRole) => {
    if (!base) return;
    setError(null);
    try {
      const res = await fetch(`${base}/me/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ role: nextRole }),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string; user?: TeamUser };
      if (res.ok && data.ok && data.user) {
        setUsers((previous) => previous.map((user) => (user.id === userId ? data.user! : user)));
        return;
      }
      setError(data.error ?? "Role update failed");
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Role update failed."));
    }
  };

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Team" }]}
        title="Team"
        description="Invite staff, share the fallback invite link when email is unavailable, and keep role visibility honest."
      />

      {error ? <ErrorNotice message={error} style={{ marginBottom: "1rem" }} /> : null}

      <DashboardCard title="Invite teammate" style={{ marginBottom: "1.5rem" }}>
        <form onSubmit={handleInvite} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px" }}>
            <label htmlFor="invite-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "var(--onyx-dash-font-sm)" }}>
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
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
              onChange={(event) => setInviteRole(event.target.value as CanonicalRole)}
              className="onyx-input"
              style={{ minWidth: 160 }}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={submitting} className="onyx-btn-primary">
            {submitting ? "Creating invite..." : "Create invite"}
          </button>
        </form>

        {inviteNotice ? (
          <ErrorNotice
            tone="info"
            title="Invite link ready"
            message={
              <div style={{ display: "grid", gap: "0.45rem" }}>
                <span>{inviteNotice.message}</span>
                <code style={{ fontSize: "0.8rem", overflowWrap: "anywhere" }}>{inviteNotice.inviteLink}</code>
                {inviteNotice.expiresAt ? (
                  <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.8125rem" }}>
                    Expires {new Date(inviteNotice.expiresAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            }
            style={{ marginTop: "1rem" }}
          />
        ) : (
          <p style={{ margin: "0.85rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            If SMTP is not configured for this environment, Onyx shows the invite link here so the admin can share it directly.
          </p>
        )}
      </DashboardCard>

      <DashboardCard title="Firm users">
        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading...</p>
        ) : users.length === 0 ? (
          <ErrorNotice
            tone="info"
            title="No staff added yet"
            message="Invite your first teammate to give them access to documents, review work, and case operations for this firm."
          />
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
                  <th style={{ width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.displayName || "-"}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className="onyx-badge onyx-badge-neutral">{formatRoleLabel(user.role)}</span>
                    </td>
                    <td>{user.status === "PENDING_PASSWORD" ? "Invite pending" : "Active"}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(event) => updateUserRole(user.id, event.target.value as CanonicalRole)}
                        className="onyx-input"
                        style={{ minWidth: 150, padding: "0.3rem 0.5rem", fontSize: "var(--onyx-dash-font-xs)" }}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
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
