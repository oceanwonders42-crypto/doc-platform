import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const providerId = typeof req.query.providerId === "string" ? req.query.providerId.trim() : null;
    const where: { firmId: string; caseProviders?: { some: { providerId: string } } } = { firmId };
    if (providerId) {
      where.caseProviders = { some: { providerId } };
    }
    const items = await prisma.legalCase.findMany({
      where,
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

export default router;
