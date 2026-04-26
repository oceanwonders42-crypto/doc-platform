"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatApiClientError, getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { useDashboardAuth, canAccessTeam } from "@/contexts/DashboardAuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";

type CanonicalRole = "PLATFORM_ADMIN" | "FIRM_ADMIN" | "ATTORNEY" | "PARALEGAL" | "ASSISTANT" | "STAFF";
type TeamStatus = "ACTIVE" | "PENDING_PASSWORD" | "DEACTIVATED";

type TeamUser = {
  id: string;
  email: string;
  role: CanonicalRole;
  status: TeamStatus;
  createdAt: string;
  deactivatedAt?: string | null;
  displayName: string;
};

type SeatPolicy = {
  currentUsers: number;
  activeUsers: number;
  pendingInvites: number;
  limit: number;
  status: string;
  softCapReached: boolean;
  upgradeMessage?: string | null;
};

type TeamResponse = {
  ok?: boolean;
  users?: TeamUser[];
  seatPolicy?: SeatPolicy;
  error?: string;
};

type InviteResponse = {
  ok?: boolean;
  error?: string;
  inviteLink?: string;
  message?: string;
  user?: TeamUser;
  seatPolicy?: SeatPolicy;
  invite?: {
    role?: CanonicalRole;
    expiresAt?: string;
  };
};

const ROLE_OPTIONS: { value: CanonicalRole; label: string; help: string }[] = [
  { value: "FIRM_ADMIN", label: "Firm Admin", help: "Billing, team, integrations, firm settings" },
  { value: "ATTORNEY", label: "Attorney", help: "Cases, demands, records requests, providers, team" },
  { value: "PARALEGAL", label: "Paralegal", help: "Cases, demands, records requests, provider map" },
  { value: "ASSISTANT", label: "Assistant", help: "Assistant lane with case and records tasks" },
  { value: "STAFF", label: "Staff", help: "General staff lane with controlled access" },
];

function formatRoleLabel(role: CanonicalRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function formatStatusLabel(status: TeamStatus): string {
  if (status === "PENDING_PASSWORD") return "Invite pending";
  if (status === "DEACTIVATED") return "Deactivated";
  return "Active";
}

function statusBadgeClass(status: TeamStatus): string {
  if (status === "ACTIVE") return "onyx-badge onyx-badge-success";
  if (status === "PENDING_PASSWORD") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

export default function TeamPage() {
  const { role, checked } = useDashboardAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [seatPolicy, setSeatPolicy] = useState<SeatPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CanonicalRole>("ASSISTANT");
  const [submitting, setSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<{
    message: string;
    inviteLink: string;
    expiresAt?: string;
  } | null>(null);

  const base = useMemo(() => getApiBase(), []);

  const loadTeam = useCallback(async () => {
    if (!checked || !canAccessTeam(role)) return;
    if (!base) {
      setError("API not configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = (await parseJsonResponse(
        await fetch(`${base}/me/team`, { headers: getAuthHeader(), ...getFetchOptions() })
      )) as TeamResponse;
      if (data?.ok && Array.isArray(data.users)) {
        setUsers(data.users);
        setSeatPolicy(data.seatPolicy ?? null);
        setError(null);
        return;
      }
      setError(data?.error ?? "Failed to load team members.");
    } catch (requestError) {
      setError(
        formatApiClientError(requestError, "Failed to load team members.", {
          deploymentMessage:
            "The team API returned HTML instead of JSON. Check the active API target and the current web build.",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [base, checked, role]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const activeUsers = users.filter((user) => user.status === "ACTIVE");
  const pendingUsers = users.filter((user) => user.status === "PENDING_PASSWORD");
  const deactivatedUsers = users.filter((user) => user.status === "DEACTIVATED");
  const seatsUsed = seatPolicy?.currentUsers ?? activeUsers.length + pendingUsers.length;
  const seatLimit = seatPolicy?.limit ?? 0;
  const seatLimitText = seatLimit > 0 ? `${seatsUsed} / ${seatLimit}` : `${seatsUsed} / custom`;
  const seatLimitReached = seatLimit > 0 && seatsUsed >= seatLimit;

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
        if (data.user) setUsers((current) => [data.user!, ...current.filter((user) => user.id !== data.user!.id)]);
        if (data.seatPolicy) setSeatPolicy(data.seatPolicy);
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
    setBusyUserId(userId);
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
    } finally {
      setBusyUserId(null);
    }
  };

  const resendInvite = async (userId: string) => {
    if (!base) return;
    setError(null);
    setInviteNotice(null);
    setBusyUserId(userId);
    try {
      const res = await fetch(`${base}/me/team/${userId}/resend-invite`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as InviteResponse;
      if (res.ok && data.ok && data.inviteLink) {
        setInviteNotice({
          message: data.message ?? "Invite link refreshed.",
          inviteLink: data.inviteLink,
          expiresAt: data.invite?.expiresAt,
        });
        return;
      }
      setError(data.error ?? "Invite resend failed");
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Invite resend failed."));
    } finally {
      setBusyUserId(null);
    }
  };

  const deactivateUser = async (userId: string) => {
    if (!base) return;
    const confirmed = window.confirm("Deactivate this user? They will no longer be able to log in.");
    if (!confirmed) return;
    setError(null);
    setBusyUserId(userId);
    try {
      const res = await fetch(`${base}/me/team/${userId}`, {
        method: "DELETE",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string; user?: TeamUser; seatPolicy?: SeatPolicy };
      if (res.ok && data.ok && data.user) {
        setUsers((previous) => previous.map((user) => (user.id === userId ? data.user! : user)));
        if (data.seatPolicy) setSeatPolicy(data.seatPolicy);
        return;
      }
      setError(data.error ?? "Deactivate failed");
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Deactivate failed."));
    } finally {
      setBusyUserId(null);
    }
  };

  function renderUserTable(title: string, items: TeamUser[], emptyMessage: string) {
    return (
      <DashboardCard title={title}>
        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading...</p>
        ) : items.length === 0 ? (
          <ErrorNotice tone="info" title="Nothing here yet" message={emptyMessage} />
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
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.displayName || "-"}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className="onyx-badge onyx-badge-neutral">{formatRoleLabel(user.role)}</span>
                    </td>
                    <td>
                      <span className={statusBadgeClass(user.status)}>{formatStatusLabel(user.status)}</span>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
                        {user.status !== "DEACTIVATED" ? (
                          <select
                            value={user.role}
                            disabled={busyUserId === user.id}
                            onChange={(event) => updateUserRole(user.id, event.target.value as CanonicalRole)}
                            className="onyx-input"
                            style={{ minWidth: 132, padding: "0.3rem 0.5rem", fontSize: "var(--onyx-dash-font-xs)" }}
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {user.status === "PENDING_PASSWORD" ? (
                          <button
                            type="button"
                            className="onyx-btn-secondary"
                            disabled={busyUserId === user.id}
                            onClick={() => resendInvite(user.id)}
                            style={{ fontSize: "0.75rem", padding: "0.35rem 0.55rem" }}
                          >
                            Resend
                          </button>
                        ) : null}
                        {user.status !== "DEACTIVATED" ? (
                          <button
                            type="button"
                            className="onyx-link"
                            disabled={busyUserId === user.id}
                            onClick={() => deactivateUser(user.id)}
                            style={{ fontSize: "0.75rem", background: "none", border: 0, cursor: "pointer" }}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.75rem" }}>
                            Removed from active seats
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Team" }]}
        title="Team"
        description="Invite attorneys and staff, track pending seats, resend links, and deactivate access without touching case data."
      />

      {error ? <ErrorNotice message={error} style={{ marginBottom: "1rem" }} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Seats">
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>{seatLimitText}</p>
          <p style={{ margin: "0.45rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            {activeUsers.length} active, {pendingUsers.length} pending
          </p>
          {seatLimitReached ? (
            <p style={{ margin: "0.65rem 0 0", color: "var(--onyx-warning)", fontSize: "0.82rem" }}>
              Seat limit reached. Upgrade or request a developer override before inviting more users.
            </p>
          ) : null}
        </DashboardCard>
        <DashboardCard title="Role coverage">
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem", lineHeight: 1.55 }}>
            Attorneys get case and demand workflow access. Assistants, paralegals, and staff stay in the controlled operator lane.
          </p>
        </DashboardCard>
      </div>

      <DashboardCard title="Invite teammate" style={{ marginBottom: "1.5rem" }}>
        <form onSubmit={handleInvite} style={{ display: "grid", gap: "0.85rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
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
                style={{ minWidth: 170 }}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || seatLimitReached} className="onyx-btn-primary">
              {submitting ? "Creating invite..." : "Create invite"}
            </button>
          </div>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.8125rem" }}>
            {ROLE_OPTIONS.find((option) => option.value === inviteRole)?.help}
          </p>
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
            If SMTP is unavailable, Onyx shows the invite link here so the admin can share it directly.
          </p>
        )}
      </DashboardCard>

      <div style={{ display: "grid", gap: "1rem" }}>
        {renderUserTable("Active users", activeUsers, "Accepted users will appear here after joining the firm.")}
        {renderUserTable("Pending invites", pendingUsers, "Invite links that have not been accepted yet will appear here.")}
        {deactivatedUsers.length > 0
          ? renderUserTable("Deactivated users", deactivatedUsers, "No deactivated users.")
          : null}
      </div>
    </div>
  );
}
