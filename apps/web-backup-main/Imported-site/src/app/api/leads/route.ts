import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Resend } from "resend";

// Rate limit: max 5 submissions per IP per 60 seconds
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) return false;
  if (now >= entry.resetAt) {
    rateLimitMap.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordRateLimit(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

const REQUIRED_STRING_FIELDS = ["firstName", "lastName", "email", "phone", "firm"] as const;
const OPTIONAL_STRING_FIELDS = ["cms", "firmSize", "message", "website"] as const;

function validateBody(body: unknown): { ok: true; data: Record<string, string> } | { ok: false; error: string; fields?: string[] } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }

  const record = body as Record<string, unknown>;
  const data: Record<string, string> = {};
  const missing: string[] = [];

  for (const key of REQUIRED_STRING_FIELDS) {
    const value = record[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push(key);
    } else {
      data[key] = String(value).trim();
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: "Please fill in all required fields.",
      fields: missing,
    };
  }

  // Basic email format
  const email = data.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      error: "Please enter a valid email address.",
      fields: ["email"],
    };
  }

  for (const key of OPTIONAL_STRING_FIELDS) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      data[key] = String(value).trim();
    }
  }

  return { ok: true, data };
}

async function saveLeadToDb(data: Record<string, string>): Promise<boolean> {
  try {
    await prisma.lead.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        firm: data.firm,
        cms: data.cms || null,
        firmSize: data.firmSize || null,
        message: data.message || null,
        source: "demo",
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function sendLeadEmail(data: Record<string, string>): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_NOTIFICATION_EMAIL;
  if (!apiKey || !to) return false;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      to: [to],
      subject: `[Onyx Intel] Demo request from ${data.firm}`,
      text: [
        `New demo request`,
        ``,
        `Name: ${data.firstName} ${data.lastName}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone}`,
        `Firm: ${data.firm}`,
        `CMS: ${data.cms || "—"}`,
        `Firm size: ${data.firmSize || "—"}`,
        `Message: ${data.message || "—"}`,
      ].join("\n"),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const validated = validateBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, fields: validated.fields },
      { status: 400 }
    );
  }

  const { data } = validated;

  // Honeypot: if "website" is filled, treat as bot — return success without saving
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ success: true });
  }

  recordRateLimit(ip);

  const hasDb = !!process.env.DATABASE_URL;
  const saved = hasDb && (await saveLeadToDb(data));

  if (!saved) {
    const emailSent = await sendLeadEmail(data);
    if (!emailSent) {
      // Email-safe fallback: log so no lead is lost; return success so form does not show error
      console.info("[Onyx Intel] Lead (no DB/email):", JSON.stringify({ ...data, website: undefined }));
      return NextResponse.json({ success: true });
    }
  }

  return NextResponse.json({ success: true });
}
