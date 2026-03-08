import "dotenv/config";
import { runEmailPollOnce } from "./emailIngestRunner";

runEmailPollOnce()
  .then(() => {
    console.log("[email] poll once done");
    process.exit(0);
  })
  .catch((e) => {
    console.error("[email] poll once error:", e);
    process.exit(1);
  });
