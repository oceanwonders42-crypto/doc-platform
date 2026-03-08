"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const client_1 = require("@prisma/client");
const ROLE_RANK = {
    [client_1.Role.PLATFORM_ADMIN]: 3,
    [client_1.Role.FIRM_ADMIN]: 2,
    [client_1.Role.STAFF]: 1,
};
function getRank(role) {
    if (!role || !(role in ROLE_RANK))
        return 0;
    return ROLE_RANK[role];
}
/**
 * Requires auth first. Enforces that req.authRole >= minRole.
 */
function requireRole(minRole) {
    return (req, res, next) => {
        const authRole = req.authRole;
        if (!authRole) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        }
        if (getRank(authRole) < getRank(minRole)) {
            return res.status(403).json({ ok: false, error: `Role ${minRole} or higher required` });
        }
        next();
    };
}
