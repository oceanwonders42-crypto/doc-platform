"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdAndLog = requestIdAndLog;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../../lib/logger");
function requestIdAndLog(req, res, next) {
    const incomingId = req.header("x-request-id") ?? req.header("X-Request-Id");
    const requestId = typeof incomingId === "string" && incomingId.trim() ? incomingId.trim().slice(0, 64) : crypto_1.default.randomBytes(8).toString("hex");
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    res.on("finish", () => {
        const durationMs = Date.now() - start;
        const level = res.statusCode >= 400 ? "warn" : "info";
        (0, logger_1.log)(level, "api_request", {
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs,
        });
    });
    next();
}
