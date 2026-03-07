"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClioAccessToken = getClioAccessToken;
/**
 * Firm-level Clio connection config. Resolves access token from firm.settings
 * (either crmIntegrationId → IntegrationCredential or legacy clioAccessToken).
 * Used by clioAdapter and crmAdapter.
 */
const prisma_1 = require("../db/prisma");
const credentialEncryption_1 = require("./credentialEncryption");
/**
 * Get Clio OAuth access token for the firm. Prefers encrypted credential
 * via crmIntegrationId; falls back to firm.settings.clioAccessToken.
 */
async function getClioAccessToken(firmId) {
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
    });
    const settings = (firm?.settings ?? {});
    if (settings.crm !== "clio") {
        return { configured: false, error: "Firm CRM is not Clio" };
    }
    const integrationId = settings.crmIntegrationId;
    if (integrationId && typeof integrationId === "string") {
        const integration = await prisma_1.prisma.firmIntegration.findFirst({
            where: { id: integrationId, firmId },
            include: { credentials: { take: 1 } },
        });
        const cred = integration?.credentials?.[0];
        if (cred?.encryptedSecret) {
            try {
                const parsed = JSON.parse((0, credentialEncryption_1.decryptSecret)(cred.encryptedSecret));
                const token = parsed?.accessToken;
                if (token && typeof token === "string" && token.trim()) {
                    return { configured: true, accessToken: token.trim() };
                }
            }
            catch {
                return { configured: false, error: "Failed to decrypt Clio credential" };
            }
        }
        return { configured: false, error: "Clio integration has no credential" };
    }
    const legacyToken = settings.clioAccessToken;
    if (legacyToken && typeof legacyToken === "string" && legacyToken.trim()) {
        return { configured: true, accessToken: legacyToken.trim() };
    }
    return { configured: false, error: "Clio OAuth token not configured" };
}
