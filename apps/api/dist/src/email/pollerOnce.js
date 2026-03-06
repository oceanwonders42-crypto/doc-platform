"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const emailIngestRunner_1 = require("./emailIngestRunner");
(0, emailIngestRunner_1.runEmailPollOnce)()
    .then(() => {
    console.log("[email] poll once done");
    process.exit(0);
})
    .catch((e) => {
    console.error("[email] poll once error:", e);
    process.exit(1);
});
