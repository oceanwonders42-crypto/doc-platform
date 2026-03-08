"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLegacyResult = toLegacyResult;
/** Backward-compatible shape: ok + reason for existing callers. */
function toLegacyResult(r) {
    if (r.accepted)
        return { ok: true };
    return {
        ok: false,
        reason: r.reason,
        ...(r.quarantine !== undefined && { quarantine: r.quarantine }),
    };
}
