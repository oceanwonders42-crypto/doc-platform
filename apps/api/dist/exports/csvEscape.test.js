"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for CSV escaping.
 * Run: pnpm -C apps/api exec tsx src/exports/csvEscape.test.ts
 */
const csvEscape_1 = require("./csvEscape");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
console.log("csvEscape tests");
// escapeCsvValue
assert((0, csvEscape_1.escapeCsvValue)("") === "", "empty string");
assert((0, csvEscape_1.escapeCsvValue)("hello") === "hello", "simple string");
assert((0, csvEscape_1.escapeCsvValue)(123) === "123", "number");
assert((0, csvEscape_1.escapeCsvValue)(null) === "", "null");
assert((0, csvEscape_1.escapeCsvValue)(undefined) === "", "undefined");
assert((0, csvEscape_1.escapeCsvValue)("a,b") === '"a,b"', "comma wrapped in quotes");
assert((0, csvEscape_1.escapeCsvValue)('say "hi"') === '"say ""hi"""', "double quotes escaped");
assert((0, csvEscape_1.escapeCsvValue)("line1\nline2") === '"line1\nline2"', "newline wrapped");
assert((0, csvEscape_1.escapeCsvValue)("a\nb,c") === '"a\nb,c"', "comma and newline");
// Ensure no bare newlines or commas leak
const comma = (0, csvEscape_1.escapeCsvValue)("x,y");
assert(comma.startsWith('"') && comma.endsWith('"'), "comma case quoted");
const nl = (0, csvEscape_1.escapeCsvValue)("a\nb");
assert(nl.startsWith('"') && nl.endsWith('"'), "newline case quoted");
// csvRow
assert((0, csvEscape_1.csvRow)(["a", "b"]) === "a,b\n", "simple row");
assert((0, csvEscape_1.csvRow)(["x,y", "z"]) === '"x,y",z\n', "row with comma");
assert((0, csvEscape_1.csvRow)(["a", "b", "c"]) === "a,b,c\n", "three columns");
// toValidUtf8 (basic – we mainly care it doesn't throw)
assert((0, csvEscape_1.toValidUtf8)("hello") === "hello", "ascii unchanged");
assert((0, csvEscape_1.toValidUtf8)("café") === "café", "utf-8 preserved");
// Edge cases: CRLF, multiple special chars
assert((0, csvEscape_1.escapeCsvValue)("a\r\nb") === '"a\nb"', "CRLF normalized to LF");
assert((0, csvEscape_1.escapeCsvValue)('""') === '""""""', "double-quote escaped");
assert((0, csvEscape_1.csvRow)(["a", 'b"c', "d,e"]) === 'a,"b""c","d,e"\n', "row with mixed escaping");
console.log("All csvEscape tests passed");
