import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postalCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactSelect;

router.get("/", auth, requireRole(Role.STAFF), async (req, res) => {
  try {
    const firmId = (req as any).firmId as string;
    const search = trimToNull(req.query.search);

    const where: Prisma.ContactWhereInput = { firmId };
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.contact.findMany({
      where,
      select: CONTACT_SELECT,
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 20,
    });

    res.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        dateOfBirth: item.dateOfBirth?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});

export default router;
