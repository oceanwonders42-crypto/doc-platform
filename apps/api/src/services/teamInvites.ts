import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../db/prisma";
import { signToken, verifyToken } from "../lib/jwt";

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
  | "PARALEGAL"
  | "STAFF";

export type TeamMemberView = {
  id: string;
  email: string;
  role: CanonicalTeamRole;
  status: "ACTIVE" | "PENDING_PASSWORD";
  createdAt: string;
  displayName: string;
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
  if (normalized === "PARALEGAL" || normalized === "LEGAL_ASSISTANT") {
    return "PARALEGAL";
  }
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

async function resolveSessionIdentity(authToken: string): Promise<SessionIdentity> {
  const payload = verifyToken(authToken);
  if (!payload?.userId || !payload?.firmId) {
    throw new TeamInviteError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, firmId: true, role: true },
  });

  if (!user || user.firmId !== payload.firmId) {
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

export async function listTeamMembersForSession(
  authToken: string
): Promise<{ ok: true; users: TeamMemberView[] }> {
  const session = await resolveSessionIdentity(authToken);
  ensureAdminRole(session.role);

  const users = await prisma.user.findMany({
    where: { firmId: session.firmId },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
    },
  });

  return {
    ok: true,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      status: user.passwordHash ? "ACTIVE" : "PENDING_PASSWORD",
      createdAt: user.createdAt.toISOString(),
      displayName: buildDisplayName(user.email),
    })),
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

  const [firm, existingUser] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: session.firmId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { id: true, firmId: true },
    }),
  ]);

  if (!firm) {
    throw new TeamInviteError("Firm not found", 404);
  }

  if (existingUser?.firmId === session.firmId) {
    throw new TeamInviteError("That user is already a member of this firm", 409);
  }

  if (existingUser && existingUser.firmId !== session.firmId) {
    throw new TeamInviteError("That email is already in use by another firm", 409);
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
  const trimmedBase =
    input.baseUrl?.trim().replace(/\/$/, "") ||
    process.env.DOC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_DOC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000";
  const inviteLink = `${trimmedBase}/team/invite/accept?token=${encodeURIComponent(inviteToken)}`;

  return {
    ok: true,
    inviteLink,
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

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      createdAt: true,
      firmId: true,
    },
  });

  if (!existingUser || existingUser.firmId !== session.firmId) {
    throw new TeamInviteError("User not found", 404);
  }

  if (existingUser.id === session.userId && normalizeRole(existingUser.role) !== nextRole) {
    throw new TeamInviteError("You cannot change your own role from the team page", 400);
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
    },
  });

  return {
    ok: true,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      role: normalizeRole(updatedUser.role),
      status: updatedUser.passwordHash ? "ACTIVE" : "PENDING_PASSWORD",
      createdAt: updatedUser.createdAt.toISOString(),
      displayName: buildDisplayName(updatedUser.email),
    },
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
    select: { id: true, firmId: true },
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
    alreadyJoined: Boolean(existingUser && existingUser.firmId === payload.firmId),
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
    select: { id: true, firmId: true, role: true, passwordHash: true, createdAt: true },
  });

  if (existingUser && existingUser.firmId !== payload.firmId) {
    throw new TeamInviteError("That email already belongs to another firm", 409);
  }
  if (existingUser && existingUser.firmId === payload.firmId) {
    throw new TeamInviteError("This invite has already been accepted", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
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
    user: {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      status: user.passwordHash ? "ACTIVE" : "PENDING_PASSWORD",
      createdAt: user.createdAt.toISOString(),
      displayName: buildDisplayName(user.email),
    },
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
