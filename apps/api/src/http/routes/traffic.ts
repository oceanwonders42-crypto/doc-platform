import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const items = await prisma.trafficMatter.findMany({
      where: { firmId },
      select: {
        id: true,
        defendantName: true,
        citationNumber: true,
        jurisdictionState: true,
        status: true,
        issueDate: true,
        dueDate: true,
        reviewRequired: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

router.get("/:id", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const id = String(req.params.id ?? "");
    const item = await prisma.trafficMatter.findFirst({
      where: { id, firmId },
    });
    if (!item) return res.status(404).json({ error: "Traffic matter not found" });
    res.json({ ok: true, item });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

export default router;
