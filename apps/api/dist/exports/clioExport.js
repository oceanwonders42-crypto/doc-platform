"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClioContactsCsv = generateClioContactsCsv;
exports.generateClioMattersCsv = generateClioMattersCsv;
/**
 * Clio CSV export: contacts and matters from LegalCase data.
 * Maps LegalCase.clientName -> Contact (first_name, last_name or company)
 * Maps LegalCase -> Matter (caseNumber->display number, title->description)
 */
const prisma_1 = require("../db/prisma");
const csvEscape_1 = require("./csvEscape");
function sanitize(s) {
    if (!s || typeof s !== "string")
        return "";
    return (0, csvEscape_1.toValidUtf8)(s.trim());
}
function splitClientName(name) {
    const t = sanitize(name);
    if (!t)
        return { firstName: "", lastName: "", company: "" };
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return { firstName: "", lastName: "", company: "" };
    if (parts.length === 1) {
        return { firstName: "", lastName: parts[0], company: "" };
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");
    return { firstName, lastName, company: "" };
}
async function generateClioContactsCsv(firmId) {
    const cases = await prisma_1.prisma.legalCase.findMany({
        where: { firmId },
        select: { clientName: true },
        orderBy: { createdAt: "asc" },
    });
    const seen = new Set();
    const contacts = [];
    for (const c of cases) {
        const name = sanitize(c.clientName);
        if (!name)
            continue;
        const key = name.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        const { firstName, lastName, company } = splitClientName(name);
        if (lastName || firstName || company) {
            contacts.push({
                first_name: firstName,
                last_name: lastName,
                company: company,
            });
        }
    }
    const header = (0, csvEscape_1.csvRow)(["first_name", "last_name", "company", "primary_phone", "email_address"]);
    const rows = contacts.map((r) => (0, csvEscape_1.csvRow)([r.first_name, r.last_name, r.company, "", ""]));
    return header + rows.join("");
}
async function generateClioMattersCsv(firmId) {
    const cases = await prisma_1.prisma.legalCase.findMany({
        where: { firmId },
        select: { id: true, title: true, caseNumber: true, clientName: true },
        orderBy: { createdAt: "asc" },
    });
    const header = (0, csvEscape_1.csvRow)([
        "description",
        "custom_number",
        "status",
        "client_first_name",
        "client_last_name",
        "client_company_name",
    ]);
    const rows = cases.map((c) => {
        const desc = sanitize(c.title) || `Case ${c.id}`;
        const displayNum = sanitize(c.caseNumber) || c.id;
        const status = "Open";
        const { firstName, lastName, company } = splitClientName(c.clientName ?? "");
        return (0, csvEscape_1.csvRow)([desc, displayNum, status, firstName, lastName, company]);
    });
    return header + rows.join("");
}
