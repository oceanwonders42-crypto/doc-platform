import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../db/prisma";
import { signToken, verifyToken } from "../lib/jwt";
import { canInviteFirmUser, type CanInviteUserResult } from "./billingPlans";

const INVITE_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.API_SECRET ||
  "onyx-intel-dev-jwt-change-in-production";
const INVITE_PURPOSE = "team_invite";
const INVITE_TTL_DAYS = 7;

export type CanonicalTeamRole =
  | "PLATFORM_ADMIN"
  | "FIRM_ADMIN"
  | "ATTORNEY"
  | "PARALEGAL"
  | "ASSISTANT"
  | "STAFF";

export type TeamMemberStatus = "ACTIVE" | "PENDING_PASSWORD" | "DEACTIVATED";

export type TeamMemberView = {
  id: string;
  email: string;
  role: CanonicalTeamRole;
  status: TeamMemberStatus;
  createdAt: string;
  deactivatedAt: string | null;
  displayName: string;
};

export type TeamSeatPolicyView = {
  currentUsers: number;
  activeUsers: number;
  pendingInvites: number;
  limit: number;
  status: string;
  softCapReached: boolean;
  upgradeMessage: string | null;
};

export type TeamInvitePreview = {
  email: string;
  role: CanonicalTeamRole;
  firmId: string;
  firmName: string;
  expiresAt: string;
};

type InvitePayload = {
  purpose: typeof INVITE_PURPOSE;
  email: string;
  role: CanonicalTeamRole;
  firmId: string;
  firmName: string;
  inviterUserId: string;
  inviterRole: string;
  iat?: number;
  exp?: number;
};

type SessionIdentity = {
  userId: string;
  firmId: string;
  role: CanonicalTeamRole;
};

export class TeamInviteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TeamInviteError";
    this.status = status;
  }
}

function normalizeRole(role: string | null | undefined): CanonicalTeamRole {
  const normalized = String(role ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "PLATFORM_ADMIN") return "PLATFORM_ADMIN";
  if (normalized === "FIRM_ADMIN" || normalized === "OWNER" || normalized === "ADMIN") {
    return "FIRM_ADMIN";
  }
  if (normalized === "ATTORNEY") return "ATTORNEY";
  if (normalized === "PARALEGAL") return "PARALEGAL";
  if (normalized === "ASSISTANT" || normalized === "LEGAL_ASSISTANT") return "ASSISTANT";
  return "STAFF";
}

function ensureAdminRole(role: CanonicalTeamRole): void {
  if (role !== "PLATFORM_ADMIN" && role !== "FIRM_ADMIN") {
    throw new TeamInviteError("Firm admin access required", 403);
  }
}

function verifyInviteToken(token: string): InvitePayload {
  try {
    const decoded = jwt.verify(token, INVITE_SECRET, { algorithms: ["HS256"] });
    const payload = decoded as Partial<InvitePayload>;
    if (
      payload.purpose !== INVITE_PURPOSE ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.firmId !== "string" ||
      typeof payload.firmName !== "string" ||
      typeof payload.inviterUserId !== "string" ||
      typeof payload.inviterRole !== "string"
    ) {
      throw new TeamInviteError("Invalid invite token", 400);
    }
    return {
      purpose: INVITE_PURPOSE,
      email: payload.email.trim().toLowerCase(),
      role: normalizeRole(payload.role),
      firmId: payload.firmId,
      firmName: payload.firmName,
      inviterUserId: payload.inviterUserId,
      inviterRole: payload.inviterRole,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof TeamInviteError) throw error;
    throw new TeamInviteError("Invite link is invalid or expired", 400);
  }
}

function signInviteToken(payload: Omit<InvitePayload, "purpose">): string {
  return jwt.sign(
    {
      purpose: INVITE_PURPOSE,
      email: payload.email,
      role: payload.role,
      firmId: payload.firmId,
      firmName: payload.firmName,
      inviterUserId: payload.inviterUserId,
      inviterRole: payload.inviterRole,
    },
    INVITE_SECRET,
    {
      algorithm: "HS256",
      expiresIn: `${INVITE_TTL_DAYS}d`,
    }
  );
}

function computeExpiresAt(token: string): string {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + INVITE_TTL_DAYS);
    return fallback.toISOString();
  }
  return new Date(decoded.exp * 1000).toISOString();
}

function toSeatPolicyView(policy: CanInviteUserResult): TeamSeatPolicyView {
  return {
    currentUsers: policy.currentUsers,
    activeUsers: policy.activeUsers,
    pendingInvites: policy.pendingInvites,
    limit: policy.limit,
    status: policy.status,
    softCapReached: policy.softCapReached,
    upgradeMessage: policy.allowed ? null : policy.upgradeMessage,
  };
}

async function resolveSessionIdentity(authToken: string): Promise<SessionIdentity> {
  const payload = verifyToken(authToken);
  if (!payload?.userId || !payload?.firmId) {
    throw new TeamInviteError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, firmId: true, role: true, deactivatedAt: true },
  });

  if (!user || user.firmId !== payload.firmId || user.deactivatedAt) {
    throw new TeamInviteError("Unauthorized", 401);
  }

  return {
    userId: user.id,
    firmId: user.firmId,
    role: normalizeRole(user.role),
  };
}

function buildDisplayName(email: string): string {
  return email.split("@")[0]?.trim() || email;
}

function buildInviteLink(input: {
  token: string;
  baseUrl?: string | null;
}): string {
  const trimmedBase =
    input.baseUrl?.trim().replace(/\/$/, "") ||
    process.env.DOC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_DOC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${trimmedBase}/team/invite/accept?token=${encodeURIComponent(input.token)}`;
}

function serializeUser(user: {
  id: string;
  email: string;
  role: string;
  passwordHash: string | null;
  createdAt: Date;
  deactivatedAt: Date | null;
}): TeamMemberView {
  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    status: user.deactivatedAt ? "DEACTIVATED" : user.passwordHash ? "ACTIVE" : "PENDING_PASSWORD",
    createdAt: user.createdAt.toISOString(),
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    displayName: buildDisplayName(user.email),
  };
}

export async function listTeamMembersForSession(
  authToken: string
): Promise<{ ok: true; users: TeamMemberView[]; seatPolicy: TeamSeatPolicyView }> {
  const session = await resolveSessionIdentity(authToken);
  ensureAdminRole(session.role);

  const [users, seatPolicy] = await Promise.all([
    prisma.user.findMany({
      where: { firmId: session.firmId },
      orderBy: [{ deactivatedAt: "asc" }, { role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        createdAt: true,
        deactivatedAt: true,
      },
    }),
    canInviteFirmUser(session.firmId),
  ]);

  return {
    ok: true,
    users: users.map(serializeUser),
    seatPolicy: toSeatPolicyView(seatPolicy),
  };
}

export async function createTeamInviteForSession(input: {
  authToken: string;
  email: string;
  role: string;
  baseUrl?: string | null;
}): Promise<{
  ok: true;
  inviteLink: string;
  invite: TeamInvitePreview;
  user: TeamMemberView;
  seatPolicy: TeamSeatPolicyView;
  message: string;
}> {
  const session = await resolveSessionIdentity(input.authToken);
  ensureAdminRole(session.role);

  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new TeamInviteError("Email is required", 400);
  }

  const role = normalizeRole(input.role);
  if (role === "PLATFORM_ADMIN") {
    throw new TeamInviteError("Platform admin invites are not supported from the firm team page", 400);
  }

  const [firm, existingUser, seatPolicy] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: session.firmId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        firmId: true,
        email: true,
        role: true,
        passwordHash: true,
        createdAt: true,
        deactivatedAt: true,
      },
    }),
    canInviteFirmUser(session.firmId),
  ]);

  if (!firm) {
    throw new TeamInviteError("Firm not found", 404);
  }

  if (existingUser && existingUser.firmId !== session.firmId) {
    throw new TeamInviteError("That email is already in use by another firm", 409);
  }

  if (existingUser?.firmId === session.firmId && existingUser.passwordHash && !existingUser.deactivatedAt) {
    throw new TeamInviteError("That user is already an active member of this firm", 409);
  }

  if (!existingUser && !seatPolicy.allowed) {
    throw new TeamInviteError(seatPolicy.upgradeMessage, 402);
  }

  const inviteToken = signInviteToken({
    email,
    role,
    firmId: firm.id,
    firmName: firm.name,
    inviterUserId: session.userId,
    inviterRole: session.role,
  });
  const expiresAt = computeExpiresAt(inviteToken);
  const inviteLink = buildInviteLink({ token: inviteToken, baseUrl: input.baseUrl });

  const pendingUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role,
          passwordHash: null,
          deactivatedAt: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          createdAt: true,
          deactivatedAt: true,
        },
      })
    : await prisma.user.create({
        data: {
          firmId: firm.id,
          email,
          role,
          passwordHash: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          createdAt: true,
          deactivatedAt: true,
        },
      });

  const refreshedSeatPolicy = await canInviteFirmUser(session.firmId);

  return {
    ok: true,
    inviteLink,
    user: serializeUser(pendingUser),
    seatPolicy: toSeatPolicyView(refreshedSeatPolicy),
    invite: {
      email,
      role,
      firmId: firm.id,
      firmName: firm.name,
      expiresAt,
    },
    message:
      "Email delivery is not configured in this lane yet. Share the invite link below with your teammate.",
  };
}

export async function resendTeamInviteForSession(input: {
  authToken: string;
  userId: string;
  baseUrl?: string | null;
}): Promise<{
  ok: true;
  inviteLink: string;
  invite: TeamInvitePreview;
  message: string;
}> {
  const session = await resolveSessionIdentity(input.authToken);
  ensureAdminRole(session.role);

  const user = await prisma.user.findFirst({
    where: { id: input.userId.trim(), firmId: session.firmId },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      deactivatedAt: true,
      firm: { select: { id: true, name: true } },
    },
  });
  if (!user) {
    throw new TeamInviteError("User not found", 404);
  }
  if (user.deactivatedAt) {
    throw new TeamInviteError("Cannot resend an invite for a deactivated user", 400);
  }
  if (user.passwordHash) {
    throw new TeamInviteError("This user has already accepted the invite", 409);
  }

  const role = normalizeRole(user.role);
  const inviteToken = signInviteToken({
    email: user.email,
    role,
    firmId: user.firm.id,
    firmName: user.firm.name,
    inviterUserId: session.userId,
    inviterRole: session.role,
  });
  const expiresAt = computeExpiresAt(inviteToken);

  return {
    ok: true,
    inviteLink: buildInviteLink({ token: inviteToken, baseUrl: input.baseUrl }),
    invite: {
      email: user.email,
      role,
      firmId: user.firm.id,
      firmName: user.firm.name,
      expiresAt,
    },
    message:
      "Invite link refreshed. Share this link directly if email delivery is not configured.",
  };
}

export async function deactivateTeamMemberForSession(input: {
  authToken: string;
  userId: string;
}): Promise<{
  ok: true;
  user: TeamMemberView;
  seatPolicy: TeamSeatPolicyView;
}> {
  const session = await resolveSessionIdentity(input.authToken);
  ensureAdminRole(session.role);

  const existingUser = await prisma.user.findFirst({
    where: { id: input.userId.trim(), firmId: session.firmId },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  if (!existingUser) {
    throw new TeamInviteError("User not found", 404);
  }
  if (existingUser.id === session.userId) {
    throw new TeamInviteError("You cannot deactivate yourself from the team page", 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { deactivatedAt: existingUser.deactivatedAt ?? new Date() },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });
  const seatPolicy = await canInviteFirmUser(session.firmId);

  return {
    ok: true,
    user: serializeUser(updatedUser),
    seatPolicy: toSeatPolicyView(seatPolicy),
  };
}

export async function updateTeamMemberForSession(input: {
  authToken: string;
  userId: string;
  role: string;
}): Promise<{
  ok: true;
  user: TeamMemberView;
}> {
  const session = await resolveSessionIdentity(input.authToken);
  ensureAdminRole(session.role);

  const userId = input.userId.trim();
  if (!userId) {
    throw new TeamInviteError("User id is required", 400);
  }

  const nextRole = normalizeRole(input.role);
  if (nextRole === "PLATFORM_ADMIN") {
    throw new TeamInviteError("Platform admin access cannot be granted from the firm team page", 400);
  }

  const existingUser = await prisma.user.findFirst({
    where: { id: userId, firmId: session.firmId },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      firmId: true,
      deactivatedAt: true,
    },
  });

  if (!existingUser) {
    throw new TeamInviteError("User not found", 404);
  }

  if (existingUser.id === session.userId && normalizeRole(existingUser.role) !== nextRole) {
    throw new TeamInviteError("You cannot change your own role from the team page", 400);
  }
  if (existingUser.deactivatedAt) {
    throw new TeamInviteError("Reactivate this user by creating a new invite before changing their role", 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { role: nextRole },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  return {
    ok: true,
    user: serializeUser(updatedUser),
  };
}

export async function inspectTeamInvite(token: string): Promise<{
  ok: true;
  invite: TeamInvitePreview;
  alreadyJoined: boolean;
}> {
  const payload = verifyInviteToken(token.trim());
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email },
    select: { id: true, firmId: true, passwordHash: true, deactivatedAt: true },
  });

  return {
    ok: true,
    invite: {
      email: payload.email,
      role: payload.role,
      firmId: payload.firmId,
      firmName: payload.firmName,
      expiresAt: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : computeExpiresAt(token),
    },
    alreadyJoined: Boolean(
      existingUser &&
        existingUser.firmId === payload.firmId &&
        existingUser.passwordHash &&
        !existingUser.deactivatedAt
    ),
  };
}

export async function acceptTeamInvite(input: {
  token: string;
  password: string;
}): Promise<{
  ok: true;
  token: string;
  user: TeamMemberView;
  invite: TeamInvitePreview;
}> {
  const token = input.token.trim();
  const password = input.password;
  if (!token) {
    throw new TeamInviteError("Invite token is required", 400);
  }
  if (password.length < 8) {
    throw new TeamInviteError("Password must be at least 8 characters", 400);
  }

  const payload = verifyInviteToken(token);
  const firm = await prisma.firm.findUnique({
    where: { id: payload.firmId },
    select: { id: true, name: true },
  });
  if (!firm) {
    throw new TeamInviteError("Firm not found", 404);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      firmId: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  if (existingUser && existingUser.firmId !== payload.firmId) {
    throw new TeamInviteError("That email already belongs to another firm", 409);
  }
  if (existingUser && existingUser.firmId === payload.firmId && existingUser.passwordHash && !existingUser.deactivatedAt) {
    throw new TeamInviteError("This invite has already been accepted", 409);
  }

  if (!existingUser) {
    const seatPolicy = await canInviteFirmUser(payload.firmId);
    if (!seatPolicy.allowed) {
      throw new TeamInviteError(seatPolicy.upgradeMessage, 402);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: payload.role,
          passwordHash,
          deactivatedAt: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          createdAt: true,
          firmId: true,
          deactivatedAt: true,
        },
      })
    : await prisma.user.create({
        data: {
          firmId: payload.firmId,
          email: payload.email,
          role: payload.role,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          createdAt: true,
          firmId: true,
          deactivatedAt: true,
        },
      });

  return {
    ok: true,
    token: signToken({
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      email: user.email,
    }),
    user: serializeUser(user),
    invite: {
      email: payload.email,
      role: payload.role,
      firmId: payload.firmId,
      firmName: firm.name,
      expiresAt: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : computeExpiresAt(token),
    },
  };
}
