"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasFeature = hasFeature;
exports.hasPremiumWorkflow = hasPremiumWorkflow;
/**
 * Feature flags for firm add-ons (e.g. insurance_extraction, court_extraction).
 * Firms can have features stored in Firm.features as a JSON array of strings.
 */
const prisma_1 = require("../db/prisma");
async function hasFeature(firmId, feature) {
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { features: true },
    });
    if (!firm?.features)
        return false;
    const arr = firm.features;
    if (!Array.isArray(arr))
        return false;
    return arr.includes(feature);
}
/** Whether the firm has premium workflow (e.g. bulk operations, advanced reporting). */
async function hasPremiumWorkflow(firmId) {
    return hasFeature(firmId, "premium_workflow");
}
