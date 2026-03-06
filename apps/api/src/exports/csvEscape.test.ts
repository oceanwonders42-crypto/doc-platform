/**
 * Unit tests for CSV escaping.
 * Run: pnpm -C apps/api exec tsx src/exports/csvEscape.test.ts
 */
import { escapeCsvValue, csvRow, toValidUtf8 } from "./csvEscape";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

console.log("csvEscape tests");

// escapeCsvValue
assert(escapeCsvValue("") === "", "empty string");
assert(escapeCsvValue("hello") === "hello", "simple string");
assert(escapeCsvValue(123) === "123", "number");
assert(escapeCsvValue(null) === "", "null");
assert(escapeCsvValue(undefined) === "", "undefined");

assert(escapeCsvValue("a,b") === '"a,b"', "comma wrapped in quotes");
assert(escapeCsvValue('say "hi"') === '"say ""hi"""', "double quotes escaped");
assert(escapeCsvValue("line1\nline2") === '"line1\nline2"', "newline wrapped");
assert(escapeCsvValue("a\nb,c") === '"a\nb,c"', "comma and newline");

// Ensure no bare newlines or commas leak
const comma = escapeCsvValue("x,y");
assert(comma.startsWith('"') && comma.endsWith('"'), "comma case quoted");
const nl = escapeCsvValue("a\nb");
assert(nl.startsWith('"') && nl.endsWith('"'), "newline case quoted");

// csvRow
assert(csvRow(["a", "b"]) === "a,b\n", "simple row");
assert(csvRow(["x,y", "z"]) === '"x,y",z\n', "row with comma");
assert(csvRow(["a", "b", "c"]) === "a,b,c\n", "three columns");

// toValidUtf8 (basic – we mainly care it doesn't throw)
assert(toValidUtf8("hello") === "hello", "ascii unchanged");
assert(toValidUtf8("café") === "café", "utf-8 preserved");

// Edge cases: CRLF, multiple special chars
assert(escapeCsvValue("a\r\nb") === '"a\nb"', "CRLF normalized to LF");
assert(escapeCsvValue('""') === '""""""', "double-quote escaped");
assert(csvRow(["a", 'b"c', "d,e"]) === 'a,"b""c","d,e"\n', "row with mixed escaping");

console.log("All csvEscape tests passed");
