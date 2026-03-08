"use strict";
/**
 * CSV escaping for RFC 4180 compliant output.
 * Ensures valid UTF-8 and sanitizes commas, newlines, and double quotes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeCsvValue = escapeCsvValue;
exports.csvRow = csvRow;
exports.toValidUtf8 = toValidUtf8;
/**
 * Escape a value for CSV. Wraps in double quotes if the value contains
 * comma, newline, or double quote. Doubles internal double quotes.
 */
function escapeCsvValue(value) {
    if (value == null)
        return "";
    const s = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const needsQuoting = /[,"\n]/.test(s);
    if (needsQuoting) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}
/**
 * Build a CSV row from an array of values.
 */
function csvRow(values) {
    return values.map(escapeCsvValue).join(",") + "\n";
}
/**
 * Encode a string as valid UTF-8, replacing invalid sequences.
 */
function toValidUtf8(s) {
    try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder("utf-8", { fatal: false });
        const bytes = encoder.encode(s);
        return decoder.decode(bytes);
    }
    catch {
        return s.replace(/[\uFFFD]/g, "").replace(/[^\u0000-\uFFFF]/g, "?");
    }
}
