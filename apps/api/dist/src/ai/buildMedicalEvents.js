"use strict";
/**
 * Build timeline events from extracted medical record fields.
 * Used when docType === "medical_record" to populate MedicalEvent table.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMedicalEvents = buildMedicalEvents;
function parseDate(s) {
    if (!s || typeof s !== "string")
        return null;
    const trimmed = s.trim();
    if (!trimmed)
        return null;
    // MM/DD/YYYY or M/D/YY
    const slash = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (slash) {
        const m = parseInt(slash[1], 10);
        const d = parseInt(slash[2], 10);
        let y = parseInt(slash[3], 10);
        if (y < 100)
            y += 2000;
        const date = new Date(y, m - 1, d);
        if (!isNaN(date.getTime()))
            return date;
    }
    // January 15, 2024
    const named = new Date(trimmed);
    if (!isNaN(named.getTime()))
        return named;
    return null;
}
function parseAmount(s) {
    if (!s || typeof s !== "string")
        return null;
    const n = parseFloat(s.replace(/,/g, ""));
    return isNaN(n) ? null : n;
}
/**
 * Build medical timeline events from extractedFields.medicalRecord.
 * Returns empty array if no usable dates.
 */
function buildMedicalEvents(medicalRecord) {
    const events = [];
    const admissionDate = parseDate(medicalRecord.dateOfService);
    const dischargeDate = parseDate(medicalRecord.dateOfServiceEnd);
    const visitDate = parseDate(medicalRecord.dateOfService);
    const amount = parseAmount(medicalRecord.totalCharges);
    // If we have both dateOfService and dateOfServiceEnd, create Hospital Admission event
    if (admissionDate && dischargeDate) {
        events.push({
            eventDate: admissionDate,
            eventType: "Hospital Admission",
            facilityName: medicalRecord.facilityName ?? null,
            providerName: medicalRecord.providerName ?? null,
            diagnosis: medicalRecord.diagnosis ?? null,
            procedure: null,
            amount: null,
            confidence: null,
        });
    }
    // If dateOfService exists, create Medical Visit event (procedures get their own events below)
    if (visitDate) {
        events.push({
            eventDate: visitDate,
            eventType: "Medical Visit",
            facilityName: medicalRecord.facilityName ?? null,
            providerName: medicalRecord.providerName ?? null,
            diagnosis: medicalRecord.diagnosis ?? null,
            procedure: null,
            amount: amount,
            confidence: null,
        });
    }
    // If procedures array exists, create additional events for each procedure (use visitDate or admissionDate for eventDate)
    const procedureDate = visitDate || admissionDate;
    if (procedureDate && medicalRecord.procedures && medicalRecord.procedures.length > 0) {
        for (const proc of medicalRecord.procedures) {
            const trimmed = proc.trim();
            if (!trimmed)
                continue;
            events.push({
                eventDate: procedureDate,
                eventType: "Procedure",
                facilityName: medicalRecord.facilityName ?? null,
                providerName: medicalRecord.providerName ?? null,
                diagnosis: null,
                procedure: trimmed,
                amount: null,
                confidence: null,
            });
        }
    }
    // If no usable dates, return empty array (per spec)
    const hasDate = admissionDate || visitDate;
    if (!hasDate)
        return [];
    return events;
}
