"use strict";
/**
 * Placeholder CRM adapter interface for routing documents to Clio, Litify, etc.
 * Not full integrations yet — adapters implement this and are called after recognition.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.noopRouteToCrm = void 0;
/** Placeholder: no-op adapter. Replace with real Clio/Litify clients. */
const noopRouteToCrm = async () => {
    return { ok: false, error: "CRM adapter not implemented" };
};
exports.noopRouteToCrm = noopRouteToCrm;
