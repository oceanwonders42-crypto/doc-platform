"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../db/prisma");
const authApiKey_1 = require("../middleware/authApiKey");
const router = (0, express_1.Router)();
router.get("/", authApiKey_1.authApiKey, async (req, res) => {
    try {
        const firmId = req.firmId;
        const items = await prisma_1.prisma.legalCase.findMany({
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
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
});
exports.default = router;
