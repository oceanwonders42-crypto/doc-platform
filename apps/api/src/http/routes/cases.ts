import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const items = await prisma.legalCase.findMany({
      where: { firmId },
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
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
