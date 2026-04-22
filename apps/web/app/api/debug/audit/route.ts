import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

/** GET /api/debug/audit — returns latest_audit.json from repo audit/ folder */
export async function GET() {
  try {
    const auditPath = path.join(process.cwd(), "..", "audit", "latest_audit.json");
    if (!fs.existsSync(auditPath)) {
      return NextResponse.json(
        { ok: false, error: "Audit not generated yet. Run: pnpm run audit" },
        { status: 404 }
      );
    }
    const raw = fs.readFileSync(auditPath, "utf8");
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to read audit" },
      { status: 500 }
    );
  }
}
